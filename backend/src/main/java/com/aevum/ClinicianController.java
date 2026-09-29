package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ClinicianController {
  final Store store;
  final Auth auth;
  final TwinService twins;

  ClinicianController(Store store, Auth auth, TwinService twins) {
    this.store = store;
    this.auth = auth;
    this.twins = twins;
  }

  @PostMapping("/clinician-requests")
  @Transactional
  Map<String, Object> request(@RequestBody Map<String, Object> body, HttpServletRequest r) {
    String person = Api.person(r);
    auth.require(person, "health");
    // The account row serializes requests, including across API replicas.
    var accounts = store.db.queryForList("SELECT id FROM accounts WHERE person_id=? FOR UPDATE", person);
    if (accounts.isEmpty()) throw new Api.Failure(403, "Create your own account to request a call.");
    var existing = store.latest(person, "clinician_request");
    if (Set.of("requested", "contacted", "scheduled").contains(Api.str(existing, "status", ""))) return existing;
    if (!Boolean.TRUE.equals(body.get("share_report")))
      throw new Api.Failure(422, "Confirm sharing your report for this call.");
    String origin = Api.str(body, "origin", "twin");
    if (!Set.of("home", "twin").contains(origin)) throw new Api.Failure(422, "Invalid request source.");
    var saved = store.add(person, "clinician_request", Map.of(
        "status", "requested", "origin", origin, "share_report", true,
        "sharing_notice", "Aevum can prepare and share my health report with the clinician for this call."));
    store.audit(person, "ClinicianCallRequested", saved.get("id").toString());
    return saved;
  }

  @GetMapping("/admin/clinician-requests")
  List<Map<String, Object>> requests(HttpServletRequest r) {
    requireAdmin(r);
    return store.db.query(
        "SELECT r.person_id,r.payload,a.email FROM records r JOIN accounts a ON a.person_id=r.person_id WHERE r.kind='clinician_request' ORDER BY r.created_at DESC,r.id",
        (rs, n) -> {
          var result = store.decode(rs.getString("payload"));
          String person = rs.getString("person_id");
          result.put("name", store.latest(person, "profile").getOrDefault("name", "Member"));
          result.put("email", rs.getString("email"));
          result.put("report_available", auth.consent(person, "health"));
          return result;
        });
  }

  @PostMapping("/admin/clinician-requests/{id}")
  Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest r) {
    requireAdmin(r);
    String status = Api.str(body, "status", "");
    if (!Set.of("requested", "contacted", "scheduled", "completed", "cancelled").contains(status))
      throw new Api.Failure(422, "Choose a valid request status.");
    String person = owner(id);
    var request = store.get(person, "clinician_request", id);
    request.put("status", status);
    request.put("updated_at", Instant.now().toString());
    var saved = store.replace(person, "clinician_request", id, request);
    store.audit(person, "ClinicianRequestUpdated", id);
    return saved;
  }

  @GetMapping("/admin/clinician-requests/{id}/report")
  ResponseEntity<String> report(@PathVariable String id, HttpServletRequest r) {
    requireAdmin(r);
    String person = owner(id);
    auth.require(person, "health");
    var request = store.get(person, "clinician_request", id);
    if (!Boolean.TRUE.equals(request.get("share_report")) || "cancelled".equals(request.get("status")))
      throw new Api.Failure(403, "This request is not available for report sharing.");
    // Reuse the same source filtering and current interpretation as the user's Twin.
    var context = twins.payload(person);
    Map<String, Object> sections = new LinkedHashMap<>();
    sections.put("Personal and lifestyle context (self-reported)", context.get("profile"));
    sections.put("Imported lifestyle answers", context.get("lifestyle_facts"));
    sections.put("Lifestyle records", store.list(person, "lifestyle_fact"));
    sections.put("Family history", store.list(person, "family_history"));
    sections.put("Medical context", store.list(person, "medical_context"));
    sections.put("Measurements over time", context.get("observations"));
    sections.put("Genomic findings and interpretation limits", Map.of(
        "status", context.get("genomic_status"), "findings", context.get("genomic_findings")));
    var twin = twins.current(person);
    sections.put("Current Twin: interpretations and supporting evidence", select(twin,
        "generated_at", "version", "model_version", "overall_trajectory", "domains", "relationships"));
    sections.put("Experiments, frozen baselines and check-ins", context.get("experiments"));
    sections.put("Follow-up assessments", store.list(person, "response"));
    sections.put("Source document index", store.list(person, "artifact").stream()
        .filter(a -> !"genomics".equals(a.get("kind")) || auth.consent(person, "genomics"))
        .filter(a -> !"wearable".equals(a.get("kind")) || auth.consent(person, "wearable"))
        .map(a -> {
          var source = new LinkedHashMap<String, Object>();
          for (String key : List.of("id", "filename", "kind", "status", "created_at"))
            if (a.containsKey(key)) source.put(key, a.get(key));
          return source;
        }).toList());
    String name = Api.str(Api.map(context.get("profile")), "name", "Member");
    StringBuilder html = new StringBuilder("<!doctype html><html lang='en'><meta charset='utf-8'><title>Aevum clinician report</title><style>body{font:15px/1.6 system-ui;color:#283c35;max-width:1000px;margin:40px auto;padding:0 24px}h1,h2{line-height:1.25}h2{margin-top:36px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #dbe2dc;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f2f5f1}article{border-bottom:1px solid #dbe2dc;padding:12px 0}p{white-space:pre-wrap}@media print{body{margin:0;font-size:11px}h2{break-after:avoid}}</style><body>");
    html.append("<h1>Aevum · Clinician review</h1><p>").append(escape(name))
        .append("</p><p>Prepared ").append(escape(Instant.now().toString()))
        .append(". This is a snapshot of the information currently available in Aevum. Measurements are shown separately from model interpretations. Missing data is not a normal result; observed changes do not establish causation.</p>");
    sections.forEach((title, value) -> html.append("<h2>").append(escape(title)).append("</h2>")
        .append(title.equals("Measurements over time") ? measurements(Api.maps(value)) : render(value)));
    html.append("</body></html>");
    store.audit(person, "ClinicianReportDownloaded", id);
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"aevum-clinician-report-" + id + ".html\"")
        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        .contentType(MediaType.TEXT_HTML).body(html.toString());
  }

  private void requireAdmin(HttpServletRequest r) {
    if (!auth.isAdmin(Api.person(r))) throw new Api.Failure(403, "Admin access required.");
  }

  private String owner(String id) {
    var people = store.db.query("SELECT person_id FROM records WHERE id=? AND kind='clinician_request'",
        (rs, n) -> rs.getString(1), id);
    if (people.isEmpty()) throw new Api.Failure(404, "Request not found.");
    return people.get(0);
  }

  private static Map<String, Object> select(Map<String, Object> input, String... keys) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (String key : keys) if (input.containsKey(key)) result.put(key, input.get(key));
    return result;
  }

  private static String measurements(List<Map<String, Object>> rows) {
    if (rows.isEmpty()) return "No measurements recorded";
    StringBuilder out = new StringBuilder("<table><thead><tr><th>Measurement</th><th>Date</th><th>Result</th><th>Source interval</th><th>Source / document ID</th></tr></thead><tbody>");
    for (var row : rows) {
      out.append("<tr><td>").append(escape(row.getOrDefault("label", row.get("concept_id"))))
          .append("</td><td>").append(escape(row.getOrDefault("effective_time", "Not recorded")))
          .append("</td><td>").append(escape(row.getOrDefault("value", "Not recorded")))
          .append(" ").append(escape(row.getOrDefault("unit", "")))
          .append("</td><td>").append(render(row.get("reference_range")))
          .append("</td><td>").append(escape(row.getOrDefault("source", "Not recorded")))
          .append("<br>").append(escape(row.getOrDefault("provenance_id", ""))).append("</td></tr>");
    }
    return out.append("</tbody></table>").toString();
  }

  private static String escape(Object value) {
    return String.valueOf(value).replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
  }

  private static String render(Object value) {
    if (value == null) return "Not provided";
    if (value instanceof Map<?, ?> map) {
      if (map.isEmpty()) return "Not provided";
      StringBuilder out = new StringBuilder("<table>");
      map.forEach((key, item) -> {
        if (!Set.of("storage_key", "input_snapshot", "demo", "onboarded").contains(key.toString()))
          out.append("<tr><th>").append(escape(key.toString().replace('_', ' ')))
              .append("</th><td>").append(render(item)).append("</td></tr>");
      });
      return out.append("</table>").toString();
    }
    if (value instanceof Collection<?> items) {
      if (items.isEmpty()) return "None recorded";
      StringBuilder out = new StringBuilder();
      for (Object item : items) out.append("<article>").append(render(item)).append("</article>");
      return out.toString();
    }
    return escape(value);
  }
}
