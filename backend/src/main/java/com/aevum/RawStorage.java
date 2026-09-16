package com.aevum;

import java.net.URI;
import java.nio.file.*;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

@Component
public class RawStorage {
  private final Vault vault;
  private final S3Client s3;
  private final String bucket;
  private final Path root = Path.of(".runtime/raw");

  public RawStorage(Vault vault) {
    this.vault = vault;
    bucket = env("S3_BUCKET", "AWS_S3_BUCKET_NAME");
    if (bucket == null) {
      s3 = null;
    } else {
      var builder =
          S3Client.builder()
              .region(Region.of(envOr("us-east-1", "S3_REGION", "AWS_DEFAULT_REGION")))
              .forcePathStyle(
                  Boolean.parseBoolean(envOr("false", "S3_PATH_STYLE", "AWS_S3_PATH_STYLE")));
      String endpoint = env("S3_ENDPOINT", "AWS_ENDPOINT_URL");
      if (endpoint != null) builder.endpointOverride(URI.create(endpoint));
      s3 = builder.build();
    }
  }

  private static String env(String... names) {
    for (String name : names) {
      String value = System.getenv(name);
      if (value != null && !value.isBlank()) return value;
    }
    return null;
  }

  private static String envOr(String fallback, String... names) {
    String value = env(names);
    return value == null ? fallback : value;
  }

  public void put(String key, byte[] content) {
    byte[] encrypted = vault.encrypt(content);
    try {
      if (s3 != null)
        s3.putObject(
            PutObjectRequest.builder().bucket(bucket).key(key).ifNoneMatch("*").build(),
            RequestBody.fromBytes(encrypted));
      else {
        Path p = root.resolve(key);
        Files.createDirectories(p.getParent());
        Files.write(p, encrypted, StandardOpenOption.CREATE_NEW);
      }
    } catch (Exception e) {
      throw new IllegalStateException("Raw artifact storage failed", e);
    }
  }

  public byte[] get(String key) {
    try {
      return vault.decrypt(
          s3 != null
              ? s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build())
                  .asByteArray()
              : Files.readAllBytes(root.resolve(key)));
    } catch (Exception e) {
      throw new Api.Failure(404, "Source artifact unavailable");
    }
  }

  public void delete(String key) {
    try {
      if (s3 != null)
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
      else Files.deleteIfExists(root.resolve(key));
    } catch (Exception e) {
      throw new IllegalStateException("Artifact deletion failed", e);
    }
  }
}
