package com.aevum;

import java.nio.file.*;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class Vault {
  private final byte[] key;

  public Vault() throws Exception {
    String configured = System.getenv("DATA_ENCRYPTION_KEY");
    if (configured != null) key = Base64.getDecoder().decode(configured);
    else {
      if ("production".equals(System.getenv("AEVUM_ENV")))
        throw new IllegalStateException("DATA_ENCRYPTION_KEY is required in production");
      Path path = Path.of(".runtime/local-vault.key");
      Files.createDirectories(path.getParent());
      if (!Files.exists(path)) {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        Files.write(path, Base64.getEncoder().encode(k), StandardOpenOption.CREATE_NEW);
        try {
          Files.setPosixFilePermissions(
              path, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException ignored) {
        }
      }
      key = Base64.getDecoder().decode(Files.readAllBytes(path));
    }
    if (key.length != 32) throw new IllegalStateException("Encryption key must be 32 bytes");
  }

  public byte[] encrypt(byte[] plain) {
    try {
      byte[] nonce = new byte[12];
      new SecureRandom().nextBytes(nonce);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
      byte[] encrypted = c.doFinal(plain);
      byte[] out = new byte[nonce.length + encrypted.length];
      System.arraycopy(nonce, 0, out, 0, nonce.length);
      System.arraycopy(encrypted, 0, out, nonce.length, encrypted.length);
      return out;
    } catch (Exception e) {
      throw new IllegalStateException("Encryption failed", e);
    }
  }

  public byte[] decrypt(byte[] value) {
    try {
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, Arrays.copyOfRange(value, 0, 12)));
      return c.doFinal(Arrays.copyOfRange(value, 12, value.length));
    } catch (Exception e) {
      throw new IllegalStateException("Decryption failed", e);
    }
  }
}
