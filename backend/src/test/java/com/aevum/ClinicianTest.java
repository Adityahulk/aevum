package com.aevum;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import java.net.*;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:cliniciantests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "server.address=127.0.0.1", "AEVUM_ADMIN_EMAIL=admin-person@example.test",
    "AEVUM_ADMIN_PASSWORD=long-test-admin-password"
})
class ClinicianTest {
  @LocalServerPort int port;
  @Autowired Store store;
  @MockitoBean Science science;
  final HttpClient client = HttpClient.newHttpClient();

  void account(String person) {
    store.db.update("INSERT INTO accounts(id,email,password_hash,person_id,created_at) VALUES(?,?,?,?,?)",
        Store.id(), person + "@example.test", "unused", person, Instant.now().toString());
    store.db.update("INSERT INTO sessions(token_hash,person_id,expires_at) VALUES(?,?,?)",
        Api.hash(person), person, Instant.now().plusSeconds(300).getEpochSecond());
    store.add(person, "profile", Map.of("name", "Member <script>alert(1)</script>", "diet", "Vegetarian", "demo", false));
    store.add(person, "consent", Map.of("scope", "health", "granted", true));
    store.add(person, "twin", Map.of("model_version", "test", "context_schema", 1, "domains", List.of(), "version", 1));
  }

  HttpResponse<String> call(String person, String method, String path, String body) throws Exception {
    var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path))
        .header("X-Aevum-Request", "1").header("Content-Type", "application/json");
    if (person != null) builder.header("Cookie", "aevum_session=" + person);
    return client.send(builder.method(method, HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void requestInboxAndReportRespectAccountBoundaries() throws Exception {
    when(science.catalog()).thenReturn(Map.of("model_version", "test"));
    account("admin-person");
    account("member-person");
    account("other-person");
    store.add("member-person", "observation", Map.of("concept_id", "apob", "value", 70, "unit", "mg/dL", "source", "lab_csv", "effective_time", "2026-05-12T00:00:00Z"));
    store.add("member-person", "observation", Map.of("concept_id", "private-wearable", "value", 55, "source", "oura", "effective_time", "2026-05-12T00:00:00Z"));
    store.add("member-person", "genomic_finding", Map.of("gene", "private-genomics"));
    store.add("member-person", "claim", Map.of("answer", "private-chat"));
    store.add("member-person", "artifact", Map.of("filename", "Lab.pdf", "kind", "labs", "storage_key", "private-storage"));
    store.add("other-person", "profile", Map.of("name", "another-person-secret"));
    assertEquals(401, call(null, "GET", "/admin/clinician-requests", "").statusCode());
    assertEquals(403, call("member-person", "GET", "/admin/clinician-requests", "").statusCode());
    assertEquals(422, call("member-person", "POST", "/clinician-requests", "{}").statusCode());
    var created = call("member-person", "POST", "/clinician-requests", "{\"share_report\":true,\"origin\":\"home\",\"person_id\":\"other-person\"}");
    assertEquals(200, created.statusCode());
    String id = store.json.readTree(created.body()).get("id").asText();
    assertEquals(id, store.json.readTree(call("member-person", "POST", "/clinician-requests", "{\"share_report\":true}").body()).get("id").asText());
    assertEquals(1, store.list("member-person", "clinician_request").size());
    assertTrue(store.list("other-person", "clinician_request").isEmpty());
    assertTrue(call("member-person", "GET", "/me", "").body().contains("\"is_admin\":false"));
    assertTrue(call("admin-person", "GET", "/me", "").body().contains("\"is_admin\":true"));
    var inbox = call("admin-person", "GET", "/admin/clinician-requests", "");
    assertEquals(200, inbox.statusCode());
    assertTrue(inbox.body().contains("member-person@example.test"));
    String path = "/admin/clinician-requests/" + id;
    assertEquals(403, call("other-person", "GET", path + "/report", "").statusCode());
    assertEquals(403, call("member-person", "POST", path, "{\"status\":\"completed\"}").statusCode());
    assertEquals(422, call("admin-person", "POST", path, "{\"status\":\"invalid\"}").statusCode());
    assertEquals(200, call("admin-person", "POST", path, "{\"status\":\"scheduled\"}").statusCode());
    assertTrue(call("member-person", "GET", "/me", "").body().contains("scheduled"));
    var report = call("admin-person", "GET", path + "/report", "");
    assertEquals(200, report.statusCode());
    assertTrue(report.headers().firstValue("Content-Disposition").orElse("").contains("attachment"));
    for (String expected : List.of("apob", "Vegetarian", "Lab.pdf", "&lt;script&gt;")) assertTrue(report.body().contains(expected), expected);
    for (String secret : List.of("<script>", "private-chat", "private-storage", "private-genomics", "private-wearable", "another-person-secret")) assertFalse(report.body().contains(secret), secret);
    store.add("member-person", "consent", Map.of("scope", "health", "granted", false));
    assertEquals(403, call("admin-person", "GET", path + "/report", "").statusCode());
    store.add("member-person", "consent", Map.of("scope", "health", "granted", true));
    call("admin-person", "POST", path, "{\"status\":\"cancelled\"}");
    assertEquals(403, call("admin-person", "GET", path + "/report", "").statusCode());
    assertEquals(404, call("admin-person", "GET", "/admin/clinician-requests/missing/report", "").statusCode());
  }
}
