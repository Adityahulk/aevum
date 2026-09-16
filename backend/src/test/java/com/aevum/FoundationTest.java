package com.aevum;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:aevumtests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
      "server.address=127.0.0.1"
    })
class FoundationTest {
  @LocalServerPort int port;
  @Autowired Store store;
  @Autowired Vault vault;

  HttpClient client() {
    return HttpClient.newBuilder()
        .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
        .build();
  }

  HttpResponse<String> request(
      HttpClient c, String method, String path, String json, boolean header) throws Exception {
    var b =
        HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path))
            .header("Content-Type", "application/json");
    if (header) b.header("X-Aevum-Request", "1");
    return c.send(
        b.method(method, HttpRequest.BodyPublishers.ofString(json)).build(),
        HttpResponse.BodyHandlers.ofString());
  }

  void register(HttpClient c) throws Exception {
    var r =
        request(
            c,
            "POST",
            "/auth/register",
            "{\"name\":\"Test\",\"email\":\""
                + UUID.randomUUID()
                + "@example.test\",\"password\":\"correct horse battery\"}",
            true);
    assertEquals(200, r.statusCode());
    assertTrue(r.headers().firstValue("set-cookie").orElse("").contains("HttpOnly"));
  }

  @Test
  void unauthenticatedHealthDataIsRejected() throws Exception {
    assertEquals(401, request(client(), "GET", "/state", "", true).statusCode());
  }

  @Test
  void mutationRequiresRequestVerification() throws Exception {
    assertEquals(403, request(client(), "POST", "/auth/register", "{}", false).statusCode());
  }

  @Test
  void newAccountHasNoImplicitConsent() throws Exception {
    var c = client();
    register(c);
    assertEquals(403, request(c, "GET", "/state", "", true).statusCode());
    assertEquals(403, request(c, "POST", "/ai", "{\"question\":\"why\"}", true).statusCode());
  }

  @Test
  void consentIsVersionedAndRevocable() throws Exception {
    var c = client();
    register(c);
    assertEquals(
        200,
        request(c, "POST", "/consent", "{\"scope\":\"genomics\",\"granted\":true}", true)
            .statusCode());
    assertEquals(
        200,
        request(c, "POST", "/consent", "{\"scope\":\"genomics\",\"granted\":false}", true)
            .statusCode());
    assertTrue(request(c, "GET", "/me", "", true).body().contains("\"genomics\":false"));
  }

  @Test
  void anotherPersonsSourcesAreNotAccessible() throws Exception {
    String owner = Store.id();
    var source =
        store.add(
            owner,
            "artifact",
            Map.of("filename", "private.pdf", "kind", "labs", "storage_key", "private"));
    var c = client();
    register(c);
    assertEquals(404, request(c, "GET", "/sources/" + source.get("id"), "", true).statusCode());
  }

  @Test
  void encryptionIsRandomizedAuthenticatedAndRoundTrips() {
    byte[] raw = "private health data".getBytes();
    byte[] a = vault.encrypt(raw), b = vault.encrypt(raw);
    assertFalse(Arrays.equals(a, b));
    assertArrayEquals(raw, vault.decrypt(a));
    a[20] ^= 1;
    assertThrows(IllegalStateException.class, () -> vault.decrypt(a));
  }

  @Test
  void storedPayloadDoesNotContainPlainHealthData() {
    String p = Store.id();
    var r = store.add(p, "profile", Map.of("conditions", "sensitive-test-condition"));
    String encrypted =
        store.db.queryForObject(
            "SELECT payload FROM records WHERE id=?", String.class, r.get("id"));
    assertFalse(encrypted.contains("sensitive-test-condition"));
    assertEquals(
        "sensitive-test-condition",
        store.get(p, "profile", r.get("id").toString()).get("conditions"));
  }

  @Test
  void deletionRequiresExactConfirmation() throws Exception {
    var c = client();
    register(c);
    assertEquals(
        422, request(c, "DELETE", "/account", "{\"confirmation\":\"no\"}", true).statusCode());
    assertEquals(200, request(c, "GET", "/me", "", true).statusCode());
    assertEquals(
        200, request(c, "DELETE", "/account", "{\"confirmation\":\"DELETE\"}", true).statusCode());
    assertEquals(401, request(c, "GET", "/me", "", true).statusCode());
  }
}
