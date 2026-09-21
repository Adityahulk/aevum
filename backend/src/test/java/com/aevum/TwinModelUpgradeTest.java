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
    Map<String,Object> current = Map.of("model_version", "interpretable-0.2.1");
    when(store.latest("person", "twin")).thenReturn(old, current);
    when(science.catalog()).thenReturn(Map.of("model_version", "interpretable-0.2.1"));
    doReturn(current).when(service).refresh("person", "Scientific model updated", Set.of());
    assertEquals(current, service.current("person"));
    assertEquals(current, service.current("person"));
    verify(service, times(1)).refresh("person", "Scientific model updated", Set.of());
  }
}
