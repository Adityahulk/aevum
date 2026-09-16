package com.aevum;

import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class Science {
  private final RestClient client;

  public Science() {
    var transport =
        new org.springframework.http.client.JdkClientHttpRequestFactory(
            java.net.http.HttpClient.newBuilder()
                .version(java.net.http.HttpClient.Version.HTTP_1_1)
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .build());
    transport.setReadTimeout(java.time.Duration.ofSeconds(30));
    client =
        RestClient.builder()
            .requestFactory(transport)
            .baseUrl(System.getenv().getOrDefault("ANALYTICS_URL", "http://127.0.0.1:8090"))
            .defaultHeader(
                "X-Service-Key",
                System.getenv().getOrDefault("ANALYTICS_SECRET", "local-development-only"))
            .build();
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> post(String path, Object body) {
    try {
      return client.post().uri(path).body(body).retrieve().body(Map.class);
    } catch (RestClientResponseException e) {
      throw new Api.Failure(422, "The data could not be processed: " + e.getResponseBodyAsString());
    } catch (Exception e) {
      throw new Api.Failure(
          503, "The analysis service is unavailable. Your saved data is safe; try again shortly.");
    }
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> catalog() {
    try {
      return client.get().uri("/catalog").retrieve().body(Map.class);
    } catch (Exception e) {
      throw new Api.Failure(503, "Scientific catalog unavailable");
    }
  }
}
