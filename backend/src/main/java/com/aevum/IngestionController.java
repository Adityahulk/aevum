package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class IngestionController {
  final Store store;
  final Auth auth;
  final Science science;
  final RawStorage raw;
  final TwinService twins;

  public IngestionController(Store s, Auth a, Science sc, RawStorage raw, TwinService t) {
    store = s;
    auth = a;
    science = sc;
    this.raw = raw;
    twins = t;
  }

  void scope(String p, String kind) {
    auth.require(p, "health");
    if (kind.equals("genomics")) auth.require(p, "genomics");
    if (kind.equals("wearable")) auth.require(p, "wearable");
  }

  @PostMapping("/imports")
  synchronized Map<String, Object> upload(
      @RequestParam MultipartFile file, @RequestParam String kind, HttpServletRequest r)
      throws Exception {
    String p = Api.person(r);
    if (!List.of("labs", "wearable", "genomics").contains(kind))
      throw new Api.Failure(422, "Unsupported source type");
    scope(p, kind);
    String name =
        Optional.ofNullable(file.getOriginalFilename())
            .orElse("upload")
            .replaceAll("[^A-Za-z0-9._ -]", "_");
    if (file.isEmpty() || file.getSize() > 15 * 1024 * 1024)
      throw new Api.Failure(422, "Choose a nonempty file up to 15 MB.");
    String ext = name.toLowerCase(Locale.ROOT);
    if (kind.equals("labs") && !ext.endsWith(".pdf") && !ext.endsWith(".csv")
        || kind.equals("wearable") && !ext.endsWith(".json")
        || kind.equals("genomics") && !ext.endsWith(".txt") && !ext.endsWith(".csv"))
      throw new Api.Failure(
          422, "Choose a PDF/CSV lab report, JSON wearable export, or TXT/CSV genotype file.");
    byte[] content = file.getBytes();
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    for (var a : store.list(p, "artifact"))
      if (hash.equals(a.get("sha256")) && kind.equals(a.get("kind")))
        throw new Api.Failure(
            409, "This source has already been uploaded. Open it in My Data to review.");
    String id = Store.id(), key = p + "/" + (kind.equals("genomics") ? "genomic/" : "health/") + id;
    raw.put(key, content);
    Map<String, Object> artifact =
        store.add(
            p,
            "artifact",
            Map.of(
                "id",
                id,
                "filename",
                name,
                "kind",
                kind,
                "sha256",
                hash,
                "size",
                content.length,
                "storage_key",
                key,
                "source",
                "user_upload",
                "status",
                "processing"));
    try {
      var parsed =
          science.post(
              "/parse",
              Map.of(
                  "kind",
                  kind,
                  "filename",
                  name,
                  "content",
                  Base64.getEncoder().encodeToString(content),
                  "artifact_id",
                  id));
      parsed.put("artifact_id", id);
      parsed.put("filename", name);
      var draft = store.add(p, "import", parsed);
      artifact.put("status", "review_required");
      artifact.put("import_id", draft.get("id"));
      store.replace(p, "artifact", id, artifact);
      store.audit(p, "SourceUploaded", id);
      store.event(p, "SourceUploaded", Map.of("artifact_id", id));
      var visible = new LinkedHashMap<>(draft);
      visible.remove("variants");
      return visible;
    } catch (Api.Failure e) {
      artifact.put("status", "needs_attention");
      artifact.put("error", e.getMessage());
      store.replace(p, "artifact", id, artifact);
      throw e;
    }
  }

  @GetMapping("/imports/{id}")
  Map<String, Object> draft(@PathVariable String id, HttpServletRequest r) {
    String p = Api.person(r);
    var d = store.get(p, "import", id);
    scope(p, d.get("kind").toString());
    var visible = new LinkedHashMap<>(d);
    visible.remove("variants");
    return visible;
  }

  @org.springframework.transaction.annotation.Transactional
  @PostMapping("/imports/{id}/confirm")
  synchronized Map<String, Object> confirm(
      @PathVariable String id, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    var draft = store.get(p, "import", id);
    String kind = draft.get("kind").toString();
    scope(p, kind);
    if ("confirmed".equals(draft.get("status")))
      throw new Api.Failure(409, "This import was already confirmed.");
    if (!Api.maps(draft.get("errors")).isEmpty()
        && !Boolean.TRUE.equals(b.get("acknowledge_excluded_rows")))
      throw new Api.Failure(
          422, "Review excluded rows and explicitly acknowledge them before importing.");
    String artifact = draft.get("artifact_id").toString();
    int count = 0;
    Set<String> dirty = new HashSet<>();
    if (kind.equals("genomics")) {
      for (var v : Api.maps(draft.get("variants"))) store.add(p, "variant", v);
      for (var f : Api.maps(draft.get("findings"))) {
        f.remove("id");
        store.add(p, "genomic_finding", f);
      }
      count = Api.maps(draft.get("variants")).size();
    } else {
      var rows = Api.maps(b.get("rows"));
      if (rows.isEmpty())
        throw new Api.Failure(422, "Add at least one valid measurement to confirm.");
      if (rows.size() > 50000) throw new Api.Failure(422, "Too many measurements in one import");
      var validated =
          science.post(
              "/validate",
              Map.of("rows", rows, "source", draft.get("source"), "artifact_id", artifact));
      Set<String> seen = new HashSet<>();
      for (var o : twins.observations(p)) seen.add(fingerprint(o));
      for (var o : Api.maps(validated.get("rows"))) {
        if (seen.add(fingerprint(o))) {
          o.put("id", Store.id());
          store.add(p, "observation", o);
          dirty.add(o.get("concept_id").toString());
          count++;
        }
      }
    }
    draft.put("status", "confirmed");
    draft.put("accepted_count", count);
    store.replace(p, "import", id, draft);
    var a = store.get(p, "artifact", artifact);
    a.put("status", "verified");
    a.put("accepted_count", count);
    store.replace(p, "artifact", artifact, a);
    store.audit(p, "ImportConfirmed", id);
    var t =
        twins.refresh(
            p, kind.equals("genomics") ? "Genomic context added" : "New measurements added", dirty);
    return Map.of("accepted_count", count, "twin_version", t.get("version"));
  }

  static String fingerprint(Map<String, Object> o) {
    return o.get("concept_id")
        + "|"
        + o.get("effective_time")
        + "|"
        + Double.parseDouble(o.get("value").toString())
        + "|"
        + o.get("unit")
        + "|"
        + o.get("source");
  }

  @org.springframework.transaction.annotation.Transactional
  @PostMapping("/observations")
  synchronized Map<String, Object> manual(
      @RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    if (!Boolean.TRUE.equals(b.get("verified")))
      throw new Api.Failure(422, "Confirm that you checked this result against its source.");
    var result =
        science.post(
            "/validate", Map.of("rows", List.of(b), "source", "manual", "artifact_id", "manual"));
    var row = Api.maps(result.get("rows")).get(0);
    for (var o : twins.observations(p))
      if (fingerprint(o).equals(fingerprint(row)))
        throw new Api.Failure(409, "This measurement is already recorded.");
    row.put("id", Store.id());
    var saved = store.add(p, "observation", row);
    store.audit(p, "ObservationCreated", saved.get("id").toString());
    twins.refresh(p, "Measurement added", Set.of(row.get("concept_id").toString()));
    return saved;
  }

  @org.springframework.transaction.annotation.Transactional
  @PostMapping("/observations/{id}/correct")
  synchronized Map<String, Object> correct(
      @PathVariable String id, @RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    var original = store.get(p, "observation", id);
    if ("oura".equals(original.get("source"))) auth.require(p, "wearable");
    String reason = Api.str(b, "reason", "").trim();
    if (reason.length() < 3)
      throw new Api.Failure(422, "Explain the correction for your audit trail.");
    var merged = new LinkedHashMap<>(original);
    merged.putAll(b);
    merged.remove("id");
    var result =
        science.post(
            "/validate",
            Map.of(
                "rows",
                List.of(merged),
                "source",
                original.get("source"),
                "artifact_id",
                original.get("provenance_id")));
    var row = Api.maps(result.get("rows")).get(0);
    row.put("supersedes", id);
    row.put("correction_reason", reason);
    row.put("id", Store.id());
    var saved = store.add(p, "observation", row);
    store.audit(p, "ObservationCorrected", id);
    twins.refresh(
        p,
        "Measurement corrected",
        new HashSet<>(
            List.of(original.get("concept_id").toString(), row.get("concept_id").toString())));
    return saved;
  }

  @GetMapping("/sources/{id}")
  ResponseEntity<byte[]> source(@PathVariable String id, HttpServletRequest r) {
    String p = Api.person(r);
    var a = store.get(p, "artifact", id);
    scope(p, a.get("kind").toString());
    store.audit(p, "SourceRead", id);
    byte[] data = raw.get(a.get("storage_key").toString());
    String name = a.get("filename").toString();
    return ResponseEntity.ok()
        .header(
            "Content-Disposition",
            ContentDisposition.attachment().filename(name).build().toString())
        .contentType(
            name.toLowerCase().endsWith(".pdf")
                ? MediaType.APPLICATION_PDF
                : MediaType.APPLICATION_OCTET_STREAM)
        .body(data);
  }
}
