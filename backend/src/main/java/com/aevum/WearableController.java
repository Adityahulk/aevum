package com.aevum;

import jakarta.servlet.http.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

@RestController
@RequestMapping("/api/wearables/oura")
public class WearableController {
  final Store s;
  final Auth auth;
  final Science science;
  final RawStorage raw;
  final TwinService twins;
  final String clientId = env("OURA_CLIENT_ID"),
      clientSecret = env("OURA_CLIENT_SECRET"),
      redirect =
          System.getenv()
              .getOrDefault(
                  "OURA_REDIRECT_URI", "http://127.0.0.1:5173/api/wearables/oura/callback");

  public WearableController(Store s, Auth a, Science sc, RawStorage raw, TwinService t) {
    this.s = s;
    auth = a;
    science = sc;
    this.raw = raw;
    twins = t;
  }

  @GetMapping("/status")
  Map<String, Object> status(HttpServletRequest r) {
    String p = Api.person(r);
    return Map.of(
        "configured",
        clientId != null && clientSecret != null,
        "connected",
        !s.latest(p, "oura_token").isEmpty() && auth.consent(p, "wearable"),
        "provider",
        "Oura",
        "import_supported",
        true);
  }

  @PostMapping("/connect")
  Map<String, Object> connect(HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    auth.require(p, "wearable");
    if (clientId == null || clientSecret == null)
      throw new Api.Failure(
          503,
          "Live Oura connection needs operator OAuth credentials. You can import an Oura JSON"
              + " export now.");
    String state = Store.id() + Store.id();
    s.add(
        p,
        "oauth_state",
        Map.of(
            "state_hash",
            Api.hash(state),
            "expires",
            Instant.now().plusSeconds(600).getEpochSecond()));
    return Map.of(
        "url",
        "https://cloud.ouraring.com/oauth/authorize?response_type=code&scope=daily&client_id="
            + enc(clientId)
            + "&redirect_uri="
            + enc(redirect)
            + "&state="
            + enc(state));
  }

  @GetMapping("/callback")
  void callback(
      @RequestParam String code,
      @RequestParam String state,
      HttpServletRequest req,
      HttpServletResponse res)
      throws Exception {
    String p = Api.person(req);
    auth.require(p, "wearable");
    var saved = s.latest(p, "oauth_state");
    if (!Api.hash(state).equals(saved.get("state_hash"))
        || ((Number) saved.getOrDefault("expires", 0)).longValue() < Instant.now().getEpochSecond())
      throw new Api.Failure(403, "OAuth state is invalid or expired");
    s.db.update("DELETE FROM records WHERE person_id=? AND kind='oauth_state'", p);
    var fields = new LinkedMultiValueMap<String, String>();
    fields.add("grant_type", "authorization_code");
    fields.add("code", code);
    fields.add("redirect_uri", redirect);
    token(p, fields);
    s.audit(p, "WearableConnected", "oura");
    res.sendRedirect("/?connected=oura#data");
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> token(String p, LinkedMultiValueMap<String, String> fields) {
    fields.add("client_id", clientId);
    fields.add("client_secret", clientSecret);
    try {
      Map<String, Object> t =
          RestClient.create()
              .post()
              .uri("https://api.ouraring.com/oauth/token")
              .contentType(MediaType.APPLICATION_FORM_URLENCODED)
              .body(fields)
              .retrieve()
              .body(Map.class);
      t.put(
          "expires_at",
          Instant.now().getEpochSecond()
              + ((Number) t.getOrDefault("expires_in", 86400)).longValue());
      s.db.update("DELETE FROM records WHERE person_id=? AND kind='oura_token'", p);
      return s.add(p, "oura_token", t);
    } catch (Exception e) {
      throw new Api.Failure(502, "Oura authorization failed. Reconnect your account.");
    }
  }

  @PostMapping("/sync")
  synchronized Map<String, Object> sync(HttpServletRequest req) throws Exception {
    return syncPerson(Api.person(req));
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> syncPerson(String p) throws Exception {
    auth.require(p, "health");
    auth.require(p, "wearable");
    var token = s.latest(p, "oura_token");
    if (token.isEmpty()) throw new Api.Failure(422, "Connect Oura first or upload an export.");
    if (((Number) token.getOrDefault("expires_at", 0)).longValue()
        < Instant.now().getEpochSecond() + 60) {
      var f = new LinkedMultiValueMap<String, String>();
      f.add("grant_type", "refresh_token");
      f.add("refresh_token", token.get("refresh_token").toString());
      token = token(p, f);
    }
    List<Map<String, Object>> all = new ArrayList<>();
    for (String type : List.of("sleep", "daily_activity")) {
      String next = null;
      int pages = 0;
      do {
        String url =
            "https://api.ouraring.com/v2/usercollection/"
                + type
                + "?start_date="
                + LocalDate.now().minusDays(30)
                + "&end_date="
                + LocalDate.now()
                + (next == null ? "" : "&next_token=" + enc(next));
        Map<String, Object> page;
        try {
          page =
              RestClient.create()
                  .get()
                  .uri(url)
                  .header("Authorization", "Bearer " + token.get("access_token"))
                  .retrieve()
                  .body(Map.class);
        } catch (Exception e) {
          throw new Api.Failure(502, "Oura sync failed. Check provider permissions and try again.");
        }
        all.addAll(Api.maps(page.get("data")));
        next = (String) page.get("next_token");
        if (++pages >= 100 && next != null)
          throw new Api.Failure(422, "Oura export is too large for a single sync.");
      } while (next != null);
    }
    byte[] bytes = s.json.writeValueAsBytes(Map.of("data", all));
    String id = Store.id(), key = p + "/health/" + id;
    raw.put(key, bytes);
    s.add(
        p,
        "artifact",
        Map.of(
            "id",
            id,
            "filename",
            "Oura sync " + LocalDate.now() + ".json",
            "kind",
            "wearable",
            "status",
            "verified",
            "storage_key",
            key,
            "sha256",
            Api.hash(new String(bytes, StandardCharsets.UTF_8)),
            "size",
            bytes.length,
            "source",
            "oura_oauth"));
    var parsed =
        science.post(
            "/parse",
            Map.of(
                "kind",
                "wearable",
                "filename",
                "oura.json",
                "content",
                Base64.getEncoder().encodeToString(bytes),
                "artifact_id",
                id));
    Set<String> seen = new HashSet<>();
    for (var o : twins.observations(p)) seen.add(IngestionController.fingerprint(o));
    int accepted = 0;
    Set<String> dirty = new HashSet<>();
    for (var row : Api.maps(parsed.get("rows")))
      if (seen.add(IngestionController.fingerprint(row))) {
        row.put("quality_status", "verified");
        row.put("confidence", 0.9);
        row.put("id", Store.id());
        s.add(p, "observation", row);
        dirty.add(row.get("concept_id").toString());
        accepted++;
      }
    if (!Api.maps(parsed.get("errors")).isEmpty()) {
      parsed.put("artifact_id", id);
      s.add(p, "import", parsed);
      var a = s.get(p, "artifact", id);
      a.put("status", "review_required");
      s.replace(p, "artifact", id, a);
    }
    twins.refresh(p, "Wearable sync completed", dirty);
    s.audit(p, "WearableSyncCompleted", id);
    return Map.of("accepted", accepted, "review_errors", parsed.get("errors"));
  }

  @org.springframework.scheduling.annotation.Scheduled(cron = "0 30 2 * * *", zone = "UTC")
  public void dailySync() {
    for (String p :
        s.db.query(
            "SELECT DISTINCT person_id FROM records WHERE kind='oura_token'",
            (rs, n) -> rs.getString(1)))
      try {
        syncPerson(p);
      } catch (Exception ignored) {
        s.add(
            p,
            "notification",
            Map.of(
                "title", "Oura sync needs attention", "type", "WearableSyncFailed", "read", false));
      }
  }

  @DeleteMapping("/disconnect")
  Map<String, Object> disconnect(HttpServletRequest r) {
    String p = Api.person(r);
    s.db.update(
        "DELETE FROM records WHERE person_id=? AND kind IN ('oura_token','oauth_state')", p);
    s.audit(p, "WearableDisconnected", "oura");
    return Map.of("connected", false);
  }

  static String env(String key) {
    String v = System.getenv(key);
    return v == null || v.isBlank() ? null : v;
  }

  static String enc(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8);
  }
}
