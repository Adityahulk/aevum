package com.aevum;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Server-only gateway. Upstream user IDs are never accepted from clients. */
@Service
public class OpenWearables {
  private static final Logger log = LoggerFactory.getLogger(OpenWearables.class);
  final Store store;
  final Auth auth;
  final Science science;
  final RawStorage raw;
  final RestClient http;
  final String base, key, publicUrl, appId, appSecret;

  @Value("${OPEN_WEARABLES_PUBLIC_URL:}")
  String mobileHost = "";

  @Value("${WEARABLE_COMPANION_URL:}")
  String companionUrl = "";

  @org.springframework.beans.factory.annotation.Autowired
  public OpenWearables(
      Store store,
      Auth auth,
      Science science,
      RawStorage raw,
      @Value("${OPEN_WEARABLES_URL:}") String base,
      @Value("${OPEN_WEARABLES_API_KEY:}") String key,
      @Value("${PUBLIC_APP_URL:http://127.0.0.1:5173}") String publicUrl,
      @Value("${OPEN_WEARABLES_APP_ID:}") String appId,
      @Value("${OPEN_WEARABLES_APP_SECRET:}") String appSecret) {
    this(store, auth, science, raw, base, key, publicUrl, appId, appSecret, client());
  }

  OpenWearables(
      Store store,
      Auth auth,
      Science science,
      RawStorage raw,
      String base,
      String key,
      String publicUrl,
      String appId,
      String appSecret,
      RestClient http) {
    this.store = store;
    this.auth = auth;
    this.science = science;
    this.raw = raw;
    this.http = http;
    this.base = base.replaceAll("/+$", "");
    this.key = key;
    this.publicUrl = publicUrl.replaceAll("/+$", "");
    this.appId = appId;
    this.appSecret = appSecret;
  }

  static RestClient client() {
    var factory =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    factory.setReadTimeout(Duration.ofSeconds(30));
    return RestClient.builder().requestFactory(factory).build();
  }

  boolean configured() {
    return !base.isBlank() && !key.isBlank();
  }

  static String enc(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  static String providerId(String id) {
    if (!id.matches("[a-z][a-z0-9_]{0,39}"))
      throw new Api.Failure(422, "Invalid wearable provider");
    return id;
  }

  Object call(HttpMethod method, String path, Object body) {
    if (!configured())
      throw new Api.Failure(
          503, "Wearable connections are not configured yet. File imports remain available.");
    try {
      var req =
          http.method(method)
              .uri(URI.create(base + "/api/v1" + path))
              .header("X-Open-Wearables-API-Key", key)
              .accept(MediaType.APPLICATION_JSON);
      if (body != null) req.contentType(MediaType.APPLICATION_JSON).body(body);
      return req.retrieve().body(Object.class);
    } catch (HttpClientErrorException e) {
      log.warn("Open Wearables rejected {} {} with status {}", method, path, e.getStatusCode().value());
      if (e.getStatusCode().value() == 404 && method == HttpMethod.DELETE) return Map.of();
      throw new Api.Failure(
          e.getStatusCode().value() == 429 ? 429 : 502,
          "Wearable service rejected the request (upstream status "
              + e.getStatusCode().value()
              + "). Check configuration or retry later.");
    } catch (RestClientException e) {
      log.warn("Open Wearables request failed for {} {}: {}", method, path, e.getClass().getSimpleName());
      throw new Api.Failure(503, "Wearable service is temporarily unavailable. Please retry.");
    }
  }

  List<Map<String, Object>> catalog() {
    return Api.maps(call(HttpMethod.GET, "/oauth/providers", null));
  }

  Map<String, Object> provider(String id) {
    providerId(id);
    return catalog().stream()
        .filter(p -> id.equals(p.get("provider")))
        .findFirst()
        .orElseThrow(() -> new Api.Failure(404, "Provider is not supported by this installation"));
  }

  String mapped(String person) {
    return (String) store.latest(person, "ow_user").get("upstream_id");
  }

  synchronized String user(String person) {
    require(person);
    String id = mapped(person);
    if (id == null) {
      // Recover a successful create after a network failure without leaking names/emails.
      var found = Api.map(call(HttpMethod.GET, "/users?external_user_id=" + enc(person), null));
      var matches = Api.maps(found.get("items"));
      var created =
          matches.isEmpty()
              ? Api.map(call(HttpMethod.POST, "/users", Map.of("external_user_id", person)))
              : matches.get(0);
      id = UUID.fromString(created.get("id").toString()).toString();
      store.add(person, "ow_user", Map.of("upstream_id", id));
    }
    return id;
  }

  void require(String person) {
    auth.require(person, "health");
    auth.require(person, "wearable");
  }

  List<Map<String, Object>> connections(String person) {
    String id = mapped(person);
    return id == null
        ? List.of()
        : Api.maps(call(HttpMethod.GET, "/users/" + id + "/connections", null));
  }

  Map<String, Object> providers(String person) {
    if (!configured())
      return Map.of(
          "configured",
          false,
          "providers",
          List.of(
              Map.of(
                  "id",
                  "oura",
                  "name",
                  "Wearable imports",
                  "configured",
                  false,
                  "connected",
                  false,
                  "mode",
                  "import",
                  "detail",
                  "Connect service is not configured. Import Oura JSON, Apple Health XML/ZIP or a"
                      + " wearable CSV.")));
    var connections = connections(person);
    var list = new ArrayList<Map<String, Object>>();
    for (var p : catalog()) {
      String id = providerId(p.get("provider").toString());
      if (Set.of("unknown", "internal").contains(id)) continue;
      boolean cloud = Boolean.TRUE.equals(p.get("has_cloud_api"));
      boolean connected =
          auth.consent(person, "wearable")
              && connections.stream()
                  .anyMatch(c -> id.equals(c.get("provider")) && "active".equals(c.get("status")));
      var row = new LinkedHashMap<String, Object>();
      row.put("id", id);
      row.put("name", p.get("name"));
      row.put("configured", Boolean.TRUE.equals(p.get("is_enabled")));
      row.put("connected", connected);
      row.put("mode", cloud ? "oauth" : "mobile");
      row.put(
          "detail",
          cloud
              ? "Connect securely. Synced measurements are reviewed before updating your Twin."
              : "Connect through the mobile companion. Health permissions are requested on your"
                    + " phone.");
      row.put("last_sync", store.latest(person, "ow_sync:" + id));
      list.add(row);
      if (!cloud && companionUrl.startsWith("https://")) row.put("companion_url", companionUrl);
    }
    return Map.of("configured", true, "providers", list);
  }

  synchronized Map<String, Object> connect(String person, String id) {
    require(person);
    var p = provider(id);
    if (!Boolean.TRUE.equals(p.get("is_enabled")))
      throw new Api.Failure(422, "This provider is not enabled yet.");
    if (!Boolean.TRUE.equals(p.get("has_cloud_api")))
      throw new Api.Failure(422, "Use the mobile companion for this provider.");
    var result =
        Api.map(
            call(
                HttpMethod.GET,
                "/oauth/"
                    + id
                    + "/authorize?user_id="
                    + user(person)
                    + "&redirect_uri="
                    + enc(publicUrl + "/?connected=" + id + "#data"),
                null));
    String url = String.valueOf(result.get("authorization_url"));
    if (!url.startsWith("https://"))
      throw new Api.Failure(502, "Invalid provider authorization URL.");
    store.audit(person, "WearableAuthorizationStarted", id);
    return Map.of("url", url);
  }

  List<Map<String, Object>> pages(String path) {
    var rows = new ArrayList<Map<String, Object>>();
    String cursor = null;
    var seen = new HashSet<String>();
    for (int page = 0; page < 100; page++) {
      var result =
          Api.map(
              call(HttpMethod.GET, path + (cursor == null ? "" : "&cursor=" + enc(cursor)), null));
      rows.addAll(Api.maps(result.get("data")));
      var pagination = Api.map(result.get("pagination"));
      if (!Boolean.TRUE.equals(pagination.get("has_more"))) return rows;
      cursor = (String) pagination.get("next_cursor");
      if (cursor == null || !seen.add(cursor))
        throw new Api.Failure(502, "Wearable pagination did not advance.");
    }
    throw new Api.Failure(422, "Wearable sync exceeds the import limit.");
  }

  synchronized Map<String, Object> sync(String person, String provider, boolean trigger)
      throws Exception {
    require(person);
    providerId(provider);
    String upstream = mapped(person);
    if (upstream == null) throw new Api.Failure(422, "Connect your wearable first.");
    var connection =
        connections(person).stream()
            .filter(c -> provider.equals(c.get("provider")) && "active".equals(c.get("status")))
            .findFirst()
            .orElseThrow(
                () ->
                    new Api.Failure(422, "Your wearable connection is inactive. Reconnect first."));
    String start = LocalDate.now(ZoneOffset.UTC).minusDays(30).toString(),
        end = LocalDate.now(ZoneOffset.UTC).toString();
    if (trigger && Boolean.TRUE.equals(connection.get("rest_pull")))
      call(
          HttpMethod.POST,
          "/providers/" + provider + "/users/" + upstream + "/sync?async=true",
          null);
    String prefix = "/users/" + upstream;
    var payload =
        Map.of(
            "provider",
            "open_wearables",
            "wearable_provider",
            provider,
            "activity",
            pages(
                prefix
                    + "/summaries/activity?start_date="
                    + start
                    + "&end_date="
                    + end
                    + "&limit=100"),
            "sleep",
            pages(
                prefix
                    + "/summaries/sleep?start_date="
                    + start
                    + "&end_date="
                    + end
                    + "&limit=100"),
            "timeseries",
            pages(
                prefix
                    + "/timeseries?start_time="
                    + start
                    + "&end_time="
                    + end
                    + "&limit=1000&provider="
                    + provider
                    + "&types=resting_heart_rate&types=heart_rate_variability_rmssd"));
    String artifactId = Store.id();
    byte[] bytes = store.json.writeValueAsBytes(payload);
    var parsed =
        science.post(
            "/parse",
            Map.of(
                "kind",
                "wearable",
                "filename",
                "open-wearables.json",
                "content",
                Base64.getEncoder().encodeToString(bytes),
                "artifact_id",
                artifactId));
    require(person);
    var rows = Api.maps(parsed.get("rows"));
    if (rows.isEmpty() && Api.maps(parsed.get("errors")).isEmpty())
      return Map.of(
          "message",
          "Sync requested. No supported measurements yet; background checks will collect them.",
          "accepted",
          0);
    String fingerprint =
        Api.hash(
            store.json.writeValueAsString(
                rows.stream()
                    .map(
                        r ->
                            List.of(
                                r.get("source"),
                                r.get("concept_id"),
                                r.get("effective_time"),
                                r.get("value")))
                    .sorted(Comparator.comparing(Object::toString))
                    .toList()));
    for (var a : store.list(person, "artifact"))
      if (fingerprint.equals(a.get("sync_fingerprint")))
        return Map.of(
            "message", "These measurements are already in Source documents.", "accepted", 0);
    String storageKey = person + "/health/" + artifactId,
        name = provider + " sync " + end + ".json";
    raw.put(storageKey, bytes);
    parsed.put("artifact_id", artifactId);
    parsed.put("filename", name);
    var draft = store.add(person, "import", parsed);
    var artifact =
        new LinkedHashMap<String, Object>(
            Map.of(
                "id",
                artifactId,
                "filename",
                name,
                "kind",
                "wearable",
                "status",
                "review_required",
                "storage_key",
                storageKey,
                "size",
                bytes.length,
                "source",
                "open_wearables",
                "import_id",
                draft.get("id"),
                "sync_fingerprint",
                fingerprint));
    artifact.put("sha256", Api.hash(new String(bytes, StandardCharsets.UTF_8)));
    store.add(person, "artifact", artifact);
    store.add(
        person, "ow_sync:" + provider, Map.of("status", "review_required", "count", rows.size()));
    store.audit(person, "WearableSyncCompleted", provider);
    return Map.of(
        "message",
        "Measurements are ready to review in Source documents.",
        "review_required",
        true,
        "import_id",
        draft.get("id"));
  }

  synchronized void disconnect(String person, String provider) {
    providerId(provider);
    String id = mapped(person);
    if (id != null) call(HttpMethod.DELETE, "/users/" + id + "/connections/" + provider, null);
    store.audit(person, "WearableDisconnected", provider);
  }

  synchronized void purge(String person) {
    String id = mapped(person);
    if (id != null) {
      call(HttpMethod.DELETE, "/users/" + id, null);
      store.db.update("DELETE FROM records WHERE person_id=? AND kind='ow_user'", person);
    }
  }

  synchronized Map<String, Object> mobileToken(String person) {
    require(person);
    if (appId.isBlank() || appSecret.isBlank() || !mobileHost.startsWith("https://"))
      throw new Api.Failure(
          503, "Mobile companion credentials and public HTTPS host are not configured.");
    String id = user(person);
    var result =
        Api.map(
            call(
                HttpMethod.POST,
                "/users/" + id + "/token",
                Map.of("app_id", appId, "app_secret", appSecret)));
    return Map.of(
        "user_id",
        id,
        "host",
        mobileHost,
        "access_token",
        result.get("access_token"),
        "refresh_token",
        result.get("refresh_token"));
  }

  @org.springframework.scheduling.annotation.Scheduled(
      fixedDelayString = "${OPEN_WEARABLES_POLL_MS:300000}",
      initialDelay = 60000)
  public synchronized void poll() {
    if (!configured()) return;
    for (String person :
        store.db.query(
            "SELECT DISTINCT person_id FROM records WHERE kind='ow_user'",
            (rs, n) -> rs.getString(1))) {
      if (!auth.consent(person, "health") || !auth.consent(person, "wearable")) continue;
      try {
        for (var c : connections(person))
          if ("active".equals(c.get("status"))) {
            String p = providerId(c.get("provider").toString());
            try {
              sync(person, p, false);
            } catch (Exception e) {
              store.add(
                  person,
                  "ow_sync:" + p,
                  Map.of(
                      "status",
                      "needs_attention",
                      "message",
                      "Sync could not finish. Please retry."));
            }
          }
      } catch (Exception ignored) {
        /* Temporary upstream outage; retry on next poll. */
      }
    }
  }
}
