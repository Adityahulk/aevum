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
    bucket = System.getenv("S3_BUCKET");
    s3 =
        bucket == null
            ? null
            : S3Client.builder()
                .endpointOverride(URI.create(System.getenv("S3_ENDPOINT")))
                .region(Region.US_EAST_1)
                .forcePathStyle(true)
                .build();
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
