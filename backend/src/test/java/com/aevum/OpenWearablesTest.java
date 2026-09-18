package com.aevum;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenWearablesTest {
  Store store;
  Auth auth;
  OpenWearables gateway;
  MockRestServiceServer server;

  @BeforeEach
  void setup() {
    store = mock(Store.class);
    auth = mock(Auth.class);
    when(store.latest(anyString(), anyString())).thenReturn(Map.of());
    var builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    gateway =
        new OpenWearables(
            store,
            auth,
            mock(Science.class),
            mock(RawStorage.class),
            "https://ow.test",
            "server-secret",
            "https://aevum.test",
            "app",
            "secret",
            builder.build());
  }

  @Test
  void providerCatalogUsesUpstreamCapabilitiesAndNeverLeaksKey() {
    server
        .expect(requestTo("https://ow.test/api/v1/oauth/providers"))
        .andExpect(header("X-Open-Wearables-API-Key", "server-secret"))
        .andRespond(
            withSuccess(
                "[{\"provider\":\"garmin\",\"name\":\"Garmin\",\"is_enabled\":true,\"has_cloud_api\":true},{\"provider\":\"apple\",\"name\":\"Apple"
                    + " Health\",\"is_enabled\":true,\"has_cloud_api\":false}]",
                MediaType.APPLICATION_JSON));
    var result = gateway.providers("person");
    var rows = Api.maps(result.get("providers"));
    assertEquals("oauth", rows.get(0).get("mode"));
    assertEquals("mobile", rows.get(1).get("mode"));
    assertFalse(result.toString().contains("server-secret"));
    server.verify();
  }

  @Test
  void pagesPreserveCursorAndStop() {
    server
        .expect(requestTo("https://ow.test/api/v1/test?limit=1"))
        .andRespond(
            withSuccess(
                "{\"data\":[{\"value\":1}],\"pagination\":{\"has_more\":true,\"next_cursor\":\"abc\"}}",
                MediaType.APPLICATION_JSON));
    server
        .expect(requestTo("https://ow.test/api/v1/test?limit=1&cursor=abc"))
        .andRespond(
            withSuccess(
                "{\"data\":[{\"value\":2}],\"pagination\":{\"has_more\":false}}",
                MediaType.APPLICATION_JSON));
    assertEquals(2, gateway.pages("/test?limit=1").size());
    server.verify();
  }

  @Test
  void repeatedCursorFailsInsteadOfLooping() {
    String body = "{\"data\":[],\"pagination\":{\"has_more\":true,\"next_cursor\":\"abc\"}}";
    server
        .expect(requestTo("https://ow.test/api/v1/test?limit=1"))
        .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    server
        .expect(requestTo("https://ow.test/api/v1/test?limit=1&cursor=abc"))
        .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    assertThrows(Api.Failure.class, () -> gateway.pages("/test?limit=1"));
    server.verify();
  }

  @Test
  void providerPathCannotEscapeApi() {
    assertThrows(Api.Failure.class, () -> OpenWearables.providerId("../users"));
  }

  @Test
  void consentDenialMakesNoUpstreamRequest() {
    doThrow(new Api.Failure(403, "Consent required")).when(auth).require("person", "wearable");
    assertThrows(Api.Failure.class, () -> gateway.connect("person", "garmin"));
    server.verify();
  }

  @Test
  void lookupIsBoundToPersonAndDoesNotCreateForStatus() {
    assertNull(gateway.mapped("person"));
    assertTrue(gateway.connections("person").isEmpty());
    server.verify();
  }

  @Test
  void outageDoesNotExposeUpstreamResponseOrSecret() {
    server
        .expect(requestTo("https://ow.test/api/v1/oauth/providers"))
        .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("server-secret"));
    var error = assertThrows(Api.Failure.class, () -> gateway.catalog());
    assertFalse(error.getMessage().contains("server-secret"));
  }
}
