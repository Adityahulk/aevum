package com.aevum;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
  "spring.datasource.url=jdbc:h2:mem:historytests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
  "server.address=127.0.0.1"
})
class HistoricalImportTest {
  @LocalServerPort int port;
  @Autowired Store store;
  @MockBean Science science;
  @MockBean RawStorage raw;

  @BeforeEach void setup() {
    when(science.post(eq("/compute"), anyMap())).thenAnswer(x -> new LinkedHashMap<>(Map.of(
        "domains", List.of(), "input_snapshot", Store.id(), "observation_count", 1)));
    when(science.post(eq("/history/parse"), anyMap())).thenAnswer(x -> {
      Map<String,Object> input=x.getArgument(1);
      Map<String,Object> row=new LinkedHashMap<>(Map.of("concept_id","APOB","value",112.0,
          "unit","mg/dL","effective_time","2026-01-01T00:00:00Z","source","historical_table",
          "confidence",0.65,"provenance_id",input.get("artifact_id"),"quality_status","review_required"));
      return new LinkedHashMap<>(Map.of("client_name","Synthetic Client","status","review_required",
          "rows",List.of(row),"measurements",List.of(Map.of("value",">2000")),
          "lifestyle",Map.of("collected_at","2026-01-02T12:00:00Z","facts",List.of(Map.of("value","reported")))));
    });
  }

  HttpResponse<String> request(HttpClient c,String method,String path,Object body) throws Exception {
    var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api"+path))
        .header("Content-Type","application/json").header("X-Aevum-Request","1");
    return c.send(builder.method(method, body==null ? HttpRequest.BodyPublishers.noBody() :
        HttpRequest.BodyPublishers.ofString(store.json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
  }
  Map<String,Object> json(HttpResponse<String> response) throws Exception {
    return store.json.readValue(response.body(), new com.fasterxml.jackson.core.type.TypeReference<>() {});
  }
  record Account(HttpClient client,String person) {}
  Account account(boolean consent) throws Exception {
    var client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
    String email=Store.id()+"@example.test";
    assertEquals(200,request(client,"POST","/auth/register",Map.of("name","Synthetic Client","email",email,"password","synthetic test password")).statusCode());
    String p=store.db.queryForObject("SELECT person_id FROM accounts WHERE email=?",String.class,email);
    if(consent) store.add(p,"consent",Map.of("scope","health","granted",true));
    return new Account(client,p);
  }

  @Test void requiresConsentAndIsolatesAccounts() throws Exception {
    var denied=account(false);
    assertEquals(403,request(denied.client(),"POST","/historical-imports/preview",Map.of()).statusCode());
    var a=account(true);var b=account(true);
    var response=request(a.client(),"POST","/historical-imports/preview",Map.of("synthetic",1));
    assertEquals(200,response.statusCode());String id=json(response).get("id").toString();
    assertEquals("[]",request(b.client(),"GET","/historical-imports",null).body());
    assertEquals(404,request(b.client(),"POST","/historical-imports/"+id+"/confirm",Map.of()).statusCode());
    assertEquals(422,request(a.client(),"POST","/historical-imports/"+id+"/confirm",Map.of()).statusCode());
    assertTrue(store.list(a.person(),"observation").isEmpty());
  }

  @Test void completeImportPreservesContextConfidenceAndIdempotency() throws Exception {
    var a=account(true);var profile=store.latest(a.person(),"profile");
    var first=json(request(a.client(),"POST","/historical-imports/preview",Map.of("synthetic",2)));
    var again=json(request(a.client(),"POST","/historical-imports/preview",Map.of("synthetic",2)));
    assertEquals(first.get("id"),again.get("id"));
    String path="/historical-imports/"+first.get("id")+"/confirm";
    var body=Map.of("client_name","Synthetic Client","verified_account_and_sources",true,
        "rows",List.of(Map.of("value",999999)));
    assertEquals(200,request(a.client(),"POST",path,body).statusCode());
    assertEquals(200,request(a.client(),"POST",path,body).statusCode());
    var observations=store.list(a.person(),"observation");assertEquals(1,observations.size());
    assertEquals(112.0,observations.get(0).get("value"));assertEquals(0.65,observations.get(0).get("confidence"));
    assertEquals(profile,store.latest(a.person(),"profile"));
    var archive=store.list(a.person(),"historical_import").get(0);
    assertEquals("2026-01-02T12:00:00Z",Api.map(archive.get("lifestyle")).get("collected_at"));
    assertEquals(">2000",Api.maps(archive.get("measurements")).get(0).get("value"));
    assertTrue(json(request(a.client(),"GET","/export",null)).containsKey("historical_import"));
  }

  @Test void failedTwinRefreshRollsBackConfirmedData() throws Exception {
    var a=account(true);
    var draft=json(request(a.client(),"POST","/historical-imports/preview",Map.of("synthetic",3)));
    when(science.post(eq("/compute"),anyMap())).thenThrow(new Api.Failure(503,"Unavailable"));
    assertEquals(503,request(a.client(),"POST","/historical-imports/"+draft.get("id")+"/confirm",
        Map.of("client_name","Synthetic Client","verified_account_and_sources",true)).statusCode());
    assertTrue(store.list(a.person(),"observation").isEmpty());
    assertEquals("review_required",store.list(a.person(),"historical_import").get(0).get("status"));
  }

  @Test void confirmedArchiveCanBeReanalyzedWithoutDuplicates() throws Exception {
    var a=account(true);
    var draft=json(request(a.client(),"POST","/historical-imports/preview",Map.of("synthetic",4)));
    String base="/historical-imports/"+draft.get("id");
    assertEquals(200,request(a.client(),"POST",base+"/confirm",
        Map.of("client_name","Synthetic Client","verified_account_and_sources",true)).statusCode());

    when(science.post(eq("/history/parse"), anyMap())).thenAnswer(x -> {
      Map<String,Object> input=x.getArgument(1);
      var first=new LinkedHashMap<String,Object>(Map.of("concept_id","APOB","value",112.0,
          "unit","mg/dL","effective_time","2026-01-01T00:00:00Z","source","historical_table",
          "confidence",0.65,"provenance_id",input.get("artifact_id"),"quality_status","review_required"));
      var second=new LinkedHashMap<String,Object>(Map.of("concept_id","HSCRP","value",0.9,
          "unit","mg/L","effective_time","2026-01-01T00:00:00Z","source","historical_table",
          "confidence",0.65,"provenance_id",input.get("artifact_id"),"quality_status","review_required"));
      return new LinkedHashMap<>(Map.of("client_name","Synthetic Client","status","review_required",
          "rows",List.of(first,second),"retained",List.of(),
          "measurements",List.of(Map.of("value",">2000")),
          "fresh_review",Map.of(),"lifestyle",Map.of("facts",List.of())));
    });
    var first=json(request(a.client(),"POST",base+"/reanalyze",null));
    var second=json(request(a.client(),"POST",base+"/reanalyze",null));
    assertEquals(2,first.get("accepted_count"));
    assertEquals(2,store.list(a.person(),"observation").size());
    assertEquals(0,second.get("new_observations"));
  }
}
