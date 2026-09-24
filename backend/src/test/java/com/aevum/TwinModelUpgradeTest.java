package com.aevum;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class TwinModelUpgradeTest {
  @Test void upgradesSavedTwinsOnReadAndReusesCurrentVersion() {
    var store = mock(Store.class);
    var science = mock(Science.class);
    var service = spy(new TwinService(store, science, mock(Auth.class)));
    Map<String,Object> old = Map.of("model_version", "interpretable-0.2.0");
    Map<String,Object> current = Map.of("model_version", "interpretable-0.2.1", "context_schema", 1);
    when(store.latest("person", "twin")).thenReturn(old, current);
    when(science.catalog()).thenReturn(Map.of("model_version", "interpretable-0.2.1"));
    doReturn(current).when(service).refresh("person", "Scientific model updated", Set.of());
    assertEquals(current, service.current("person"));
    assertEquals(current, service.current("person"));
    verify(service, times(1)).refresh("person", "Scientific model updated", Set.of());
  }
  @Test void contextPayloadHonorsGenomicConsentAndPreservesQuestionnaireDate() {
    var store = mock(Store.class);
    var auth = mock(Auth.class);
    var service = new TwinService(store, mock(Science.class), auth);
    when(store.list("person", "historical_import")).thenReturn(List.of(Map.of(
        "status", "confirmed", "lifestyle", Map.of("collected_at", "2024-01-01",
        "facts", List.of(Map.of("source_pointer", "/sleep_schedule", "value", "historical answer"))))));
    when(store.list("person", "genomic_finding")).thenReturn(List.of(Map.of("rsid", "rs4149056")));
    when(store.list("person", "import")).thenReturn(List.of(Map.of("kind", "genomics", "status", "confirmed")));
    var denied = service.payload("person");
    assertEquals(List.of(), denied.get("genomic_findings"));
    assertEquals("2024-01-01", Api.maps(denied.get("lifestyle_facts")).get(0).get("collected_at"));
    verify(store, never()).list("person", "genomic_finding");
    when(auth.consent("person", "genomics")).thenReturn(true);
    var allowed = service.payload("person");
    assertEquals(1, Api.maps(allowed.get("genomic_findings")).size());
    assertEquals(1L, Api.map(allowed.get("genomic_status")).get("sample_count"));
    verify(store, never()).list("person", "variant");
  }
}
