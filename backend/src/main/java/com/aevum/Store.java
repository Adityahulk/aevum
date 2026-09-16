package com.aevum;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class Store {
  final JdbcTemplate db;
  final ObjectMapper json;
  final Vault vault;

  public Store(JdbcTemplate db, ObjectMapper json, Vault vault) {
    this.db = db;
    this.json = json;
    this.vault = vault;
  }

  public static String id() {
    return UUID.randomUUID().toString();
  }

  public String encode(Object value) {
    try {
      return Base64.getEncoder().encodeToString(vault.encrypt(json.writeValueAsBytes(value)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public Map<String, Object> decode(String s) {
    try {
      return json.readValue(vault.decrypt(Base64.getDecoder().decode(s)), new TypeReference<>() {});
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public Map<String, Object> add(String person, String kind, Map<String, Object> data) {
    Map<String, Object> value = new LinkedHashMap<>(data);
    String id = String.valueOf(value.getOrDefault("id", id()));
    if (id.isBlank()) id = id();
    value.put("id", id);
    value.put("created_at", Instant.now().toString());
    db.update(
        "INSERT INTO records(id,person_id,kind,payload,created_at) VALUES(?,?,?,?,?)",
        id,
        person,
        kind,
        encode(value),
        value.get("created_at"));
    if (kind.equals("observation")) {
      db.update(
          "INSERT INTO"
              + " observation_index(observation_id,person_id,concept_id,effective_time,source,encrypted_payload)"
              + " VALUES(?,?,?,?,?,?)",
          id,
          person,
          value.get("concept_id"),
          java.time.OffsetDateTime.parse(value.get("effective_time").toString()),
          value.get("source"),
          encode(value));
    }
    return value;
  }

  public Map<String, Object> replace(
      String person, String kind, String id, Map<String, Object> value) {
    Map<String, Object> v = new LinkedHashMap<>(value);
    v.put("id", id);
    int n =
        db.update(
            "UPDATE records SET payload=? WHERE id=? AND person_id=? AND kind=?",
            encode(v),
            id,
            person,
            kind);
    if (n != 1) throw new Api.Failure(404, "Record not found");
    return v;
  }

  public List<Map<String, Object>> list(String person, String kind) {
    return db.query(
        "SELECT payload FROM records WHERE person_id=? AND kind=? ORDER BY created_at,id",
        (rs, n) -> decode(rs.getString(1)),
        person,
        kind);
  }

  public Map<String, Object> get(String person, String kind, String id) {
    var r =
        db.query(
            "SELECT payload FROM records WHERE person_id=? AND kind=? AND id=?",
            (rs, n) -> decode(rs.getString(1)),
            person,
            kind,
            id);
    if (r.isEmpty()) throw new Api.Failure(404, "Record not found");
    return r.get(0);
  }

  public Map<String, Object> latest(String person, String kind) {
    var r = list(person, kind);
    return r.isEmpty() ? new LinkedHashMap<>() : r.get(r.size() - 1);
  }

  public void audit(String person, String action, String target) {
    add(person, "audit", Map.of("action", action, "target", target));
  }

  public void event(String person, String type, Map<String, Object> data) {
    db.update(
        "INSERT INTO events(id,person_id,event_type,status,payload,created_at) VALUES(?,?,?,?,?,?)",
        id(),
        person,
        type,
        "pending",
        encode(data),
        Instant.now().toString());
  }
}
