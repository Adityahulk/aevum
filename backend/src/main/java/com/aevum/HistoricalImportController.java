package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Account-scoped historical archive. No account creation, consent grants, or profile replacement. */
@RestController
@RequestMapping("/api/historical-imports")
public class HistoricalImportController {
  final Store store;
  final Auth auth;
  final Science science;
  final RawStorage raw;
  final TwinService twins;

  public HistoricalImportController(Store s, Auth a, Science sc, RawStorage r, TwinService t) {
    store = s; auth = a; science = sc; raw = r; twins = t;
  }

  @GetMapping
  List<Map<String, Object>> list(HttpServletRequest request) {
    String p = Api.person(request);
    auth.require(p, "health");
    return store.list(p, "historical_import");
  }

  @PostMapping("/preview")
  @Transactional
  public synchronized Map<String, Object> preview(@RequestBody Map<String, Object> bundle,
      HttpServletRequest request) throws Exception {
    String p = Api.person(request);
    auth.require(p, "health");
    byte[] content = store.json.writeValueAsBytes(bundle);
    if (content.length > 2 * 1024 * 1024)
      throw new Api.Failure(422, "Historical imports are limited to 2 MB.");
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    for (var existing : store.list(p, "historical_import"))
      if (hash.equals(existing.get("sha256"))) return existing;
    String id = Store.id();
    var parsed = science.post("/history/parse", Map.of("bundle", bundle, "artifact_id", id));
    String key = p + "/health/" + id;
    raw.put(key, content);
    try {
      store.add(p, "artifact", Map.of("id", id, "filename", "historical-records.json",
          "kind", "history", "sha256", hash, "size", content.length, "storage_key", key,
          "source", "user_upload", "status", "review_required"));
      parsed.put("artifact_id", id);
      parsed.put("sha256", hash);
      var saved = store.add(p, "historical_import", parsed);
      store.audit(p, "HistoricalImportPrepared", saved.get("id").toString());
      return saved;
    } catch (RuntimeException e) {
      raw.delete(key);
      throw e;
    }
  }

  @PostMapping("/{id}/confirm")
  @Transactional
  public synchronized Map<String, Object> confirm(@PathVariable String id,
      @RequestBody Map<String, Object> body, HttpServletRequest request) {
    String p = Api.person(request);
    auth.require(p, "health");
    var archive = store.get(p, "historical_import", id);
    if ("confirmed".equals(archive.get("status"))) return archive;
    if (!Boolean.TRUE.equals(body.get("verified_account_and_sources"))
        || !Objects.equals(archive.get("client_name"), body.get("client_name")))
      throw new Api.Failure(422, "Confirm this record belongs to the signed-in account and verify its sources.");
    Set<String> seen = new HashSet<>(), dirty = new HashSet<>();
    for (var o : twins.observations(p)) seen.add(IngestionController.fingerprint(o));
    int count = 0;
    // Read only the server-validated draft, never caller-supplied observations or confidence.
    for (var input : Api.maps(archive.get("rows"))) {
      var o = new LinkedHashMap<>(input);
      if (seen.add(IngestionController.fingerprint(o))) {
        o.put("id", Store.id());
        o.put("quality_status", "verified");
        store.add(p, "observation", o);
        dirty.add(o.get("concept_id").toString());
        count++;
      }
    }
    archive.put("status", "confirmed");
    archive.put("accepted_count", count);
    archive.put("confirmed_at", java.time.Instant.now().toString());
    store.replace(p, "historical_import", id, archive);
    String artifactId = archive.get("artifact_id").toString();
    var artifact = store.get(p, "artifact", artifactId);
    artifact.put("status", "verified");
    artifact.put("accepted_count", count);
    store.replace(p, "artifact", artifactId, artifact);
    // The archive preserves collection timestamps and source pointers for ALL answers/results.
    // It is intentionally not a new current questionnaire response.
    var twin = twins.refresh(p, "Historical records imported", dirty);
    archive.put("twin_version", twin.get("version"));
    store.replace(p, "historical_import", id, archive);
    store.audit(p, "HistoricalImportConfirmed", id);
    return archive;
  }
}
