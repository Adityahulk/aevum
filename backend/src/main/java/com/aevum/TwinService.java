package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
public class TwinService {
  final Store store;
  final Science science;
  final Auth auth;

  public TwinService(Store s, Science sc, Auth a) {
    store = s;
    science = sc;
    auth = a;
  }

  public List<Map<String, Object>> observations(String p) {
    var all = store.list(p, "observation");
    Set<String> superseded = new HashSet<>();
    for (var o : all)
      if (o.containsKey("supersedes")) superseded.add(o.get("supersedes").toString());
    return all.stream()
        .filter(o -> !superseded.contains(o.get("id").toString()))
        .filter(o -> !Wearables.isWearable(o.get("source")) || auth.consent(p, "wearable"))
        .toList();
  }

  public Map<String, Object> payload(String p) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("observations", observations(p));
    out.put("profile", store.latest(p, "profile"));
    out.put("experiments", store.list(p, "experiment"));
    var facts = new ArrayList<Map<String, Object>>();
    for (var archive : store.list(p, "historical_import")) {
      if (!"confirmed".equals(archive.get("status"))) continue;
      var lifestyle = Api.map(archive.get("lifestyle"));
      for (var fact : Api.maps(lifestyle.get("facts"))) {
        var dated = new LinkedHashMap<String, Object>(fact);
        dated.put("collected_at", lifestyle.get("collected_at"));
        facts.add(dated);
      }
    }
    out.put("lifestyle_facts", facts);
    boolean genomicConsent = auth.consent(p, "genomics");
    out.put("genomic_findings", genomicConsent ? store.list(p, "genomic_finding") : List.of());
    long samples = genomicConsent ? store.list(p, "import").stream()
        .filter(a -> "genomics".equals(a.get("kind")) && "confirmed".equals(a.get("status"))).count() : 0;
    out.put("genomic_status", Map.of("enabled", genomicConsent, "sample_count", samples,
        "annotation_scope", "Curated SLCO1B1 medication context only; other variants are not interpreted."));
    return out;
  }

  @org.springframework.transaction.annotation.Transactional
  public synchronized Map<String, Object> refresh(String p, String reason, Set<String> dirty) {
    auth.require(p, "health");
    var data = payload(p);
    var previous = store.latest(p, "twin");
    data.put("previous", previous);
    data.put("dirty_concepts", dirty);
    data.put("reuse_unaffected", !dirty.isEmpty());
    var result = science.post("/compute", data);
    if (!previous.isEmpty()
        && Objects.equals(previous.get("input_snapshot"), result.get("input_snapshot"))
        && summary(previous).equals(summary(result))) return previous;
    result.put("version", store.list(p, "twin").size() + 1);
    result.put("reason", reason);
    var saved = store.add(p, "twin", result);
    if (previous.isEmpty()
        || !summary(previous).equals(summary(result))
        || !Objects.equals(previous.get("observation_count"), result.get("observation_count"))
        || reason.toLowerCase().contains("experiment"))
      store.add(
          p,
          "notification",
          Map.of(
              "title",
              reason,
              "type",
              "TwinUpdated",
              "twin_version",
              result.get("version"),
              "read",
              false));
    store.event(p, "TwinUpdated", Map.of("twin_id", saved.get("id")));
    return saved;
  }

  private Object summary(Map<String, Object> twin) {
    return Api.maps(twin.get("domains")).stream()
        .map(
            d ->
                List.of(
                    d.get("id"),
                    d.get("state"),
                    d.get("trend"),
                    d.get("confidence"),
                    d.get("coverage")))
        .toList();
  }

  public Map<String, Object> current(String p) {
    var t = store.latest(p, "twin");
    if (t.isEmpty()) return refresh(p, "Your Twin begins", Set.of());
    var model = science.catalog().get("model_version");
    if (model != null && !Objects.equals(model, t.get("model_version")))
      return refresh(p, "Scientific model updated", Set.of());
    return t;
  }

  public Map<String, Object> ranked(String p) {
    return science.post(
        "/rank",
        Map.of(
            "twin",
            current(p),
            "profile",
            store.latest(p, "profile"),
            "history",
            store.list(p, "experiment")));
  }

  @Scheduled(fixedDelay = 60000)
  public void processEvents() {
    var events =
        store.db.queryForList("SELECT id,person_id,event_type FROM events WHERE status='pending'");
    for (var e : events) {
      try {
        String p = e.get("person_id").toString();
        if ("TwinUpdated".equals(e.get("event_type")) && auth.consent(p, "health")) {
          var ranks = ranked(p);
          store.add(p, "recommendation_snapshot", ranks);
        }
        store.db.update("UPDATE events SET status='completed' WHERE id=?", e.get("id"));
      } catch (Exception ignored) {
        store.db.update("UPDATE events SET status='failed' WHERE id=?", e.get("id"));
      }
    }
  }

  @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
  public void daily() {
    for (String p : store.db.query("SELECT person_id FROM accounts", (rs, n) -> rs.getString(1)))
      if (auth.consent(p, "health"))
        try {
          refresh(p, "Daily freshness review", Set.of());
        } catch (Exception ignored) {
          store.event(p, "DailyRefreshFailed", Map.of());
        }
  }
}

@RestController
@RequestMapping("/api")
class TwinController {
  final Store s;
  final TwinService twins;
  final Auth auth;
  final Science science;

  TwinController(Store s, TwinService t, Auth a, Science sc) {
    this.s = s;
    twins = t;
    auth = a;
    science = sc;
  }

  @GetMapping("/state")
  Map<String, Object> state(HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    s.audit(p, "TwinRead", p);
    return Map.of(
        "profile",
        s.latest(p, "profile"),
        "twin",
        twins.current(p),
        "recommendations",
        twins.ranked(p).get("recommendations"),
        "experiments",
        s.list(p, "experiment"),
        "observations",
        twins.observations(p),
        "artifacts",
        s.list(p, "artifact").stream()
            .filter(a -> !"genomics".equals(a.get("kind")) || auth.consent(p, "genomics"))
            .map(
                a -> {
                  var c = new LinkedHashMap<>(a);
                  c.remove("storage_key");
                  return c;
                })
            .toList(),
        "genomic_findings",
        auth.consent(p, "genomics") ? s.list(p, "genomic_finding") : List.of(),
        "notifications",
        s.list(p, "notification"),
        "versions",
        s.list(p, "twin").stream()
            .map(
                t ->
                    Map.of(
                        "id",
                        t.get("id"),
                        "version",
                        t.get("version"),
                        "generated_at",
                        t.get("generated_at"),
                        "reason",
                        t.get("reason"),
                        "overall_trajectory",
                        t.get("overall_trajectory")))
            .toList());
  }

  @GetMapping("/catalog")
  Map<String, Object> catalog() {
    return science.catalog();
  }

  @GetMapping("/twins/{id}")
  Map<String, Object> version(@PathVariable String id, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    var t = s.get(p, "twin", id);
    if (!auth.consent(p, "genomics") && Api.maps(t.get("domains")).stream()
        .anyMatch(d -> !Api.maps(d.get("genomic_context")).isEmpty()
            || ((Number) Api.map(d.get("genomic_status")).getOrDefault("sample_count", 0)).longValue() > 0))
      throw new Api.Failure(403, "This historical version includes genomic context. Restore genomic consent to inspect it.");
    if (!auth.consent(p, "wearable")
        && Api.map(t.get("features")).values().stream()
            .anyMatch(f -> Wearables.isWearable(Api.map(f).get("source"))))
      throw new Api.Failure(
          403,
          "This historical version includes wearable data. Restore wearable consent to inspect"
              + " it.");
    return t;
  }

  @PostMapping("/recompute")
  Map<String, Object> recompute(HttpServletRequest r) {
    return twins.refresh(Api.person(r), "Twin refreshed", Set.of());
  }

  @PostMapping("/notifications/read")
  Map<String, Object> notifications(HttpServletRequest r) {
    String p = Api.person(r);
    for (var n : s.list(p, "notification")) {
      n.put("read", true);
      s.replace(p, "notification", n.get("id").toString(), n);
    }
    return Map.of("ok", true);
  }

  @PostMapping("/ai")
  Map<String, Object> ai(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    auth.require(p, "ai");
    String q = Api.str(b, "question", "");
    if (q.isBlank() || q.length() > 2000)
      throw new Api.Failure(422, "Ask a question of 1–2,000 characters.");
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("question", q);
    payload.put("domain", b.get("domain"));
    payload.put("twin", twins.current(p));
    payload.put("profile", s.latest(p, "profile"));
    payload.put("recommendations", twins.ranked(p).get("recommendations"));
    payload.put("experiments", s.list(p, "experiment"));
    payload.put(
        "genomic_findings", auth.consent(p, "genomics") ? s.list(p, "genomic_finding") : List.of());
    var answer = science.post("/answer", payload);
    s.add(p, "claim", answer);
    s.audit(p, "AssistantUsed", answer.get("id").toString());
    return answer;
  }

  @GetMapping("/ai/history")
  List<Map<String, Object>> history(HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    auth.require(p, "ai");
    return s.list(p, "claim");
  }
}
