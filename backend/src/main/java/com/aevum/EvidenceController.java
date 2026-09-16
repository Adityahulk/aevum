package com.aevum;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/evidence")
public class EvidenceController {
  final Store s;
  final Science science;

  public EvidenceController(Store s, Science sc) {
    this.s = s;
    science = sc;
  }

  @PostMapping("/search")
  public Map<String, Object> search(@RequestBody Map<String, Object> body) {
    String q = Api.str(body, "query", "");
    if (q.length() > 1000) throw new Api.Failure(422, "Evidence query is too long");
    var result = science.post("/evidence/search", Map.of("query", q));
    synchronize();
    boolean vectorSearch = s.db.getDataSource() != null && hasPgVector();
    if (vectorSearch) {
      try {
        String vector = s.json.writeValueAsString(result.get("query_vector"));
        var rows =
            s.db.query(
                "SELECT payload FROM scientific_evidence ORDER BY embedding <=> CAST(? AS vector)"
                    + " LIMIT 5",
                (rs, n) -> s.decode(rs.getString(1)),
                vector);
        return Map.of("results", rows, "retrieval", "pgvector signed-hash corpus retrieval");
      } catch (Exception ignored) {
      }
    }
    return Map.of(
        "results", result.get("results"), "retrieval", "signed-hash curated corpus retrieval");
  }

  boolean isPostgres() {
    try (var c = s.db.getDataSource().getConnection()) {
      return c.getMetaData().getDatabaseProductName().equals("PostgreSQL");
    } catch (Exception e) {
      return false;
    }
  }

  boolean hasPgVector() {
    if (!isPostgres()) return false;
    try {
      Boolean available =
          s.db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')"
                  + " AND EXISTS(SELECT 1 FROM information_schema.columns"
                  + " WHERE table_name='scientific_evidence' AND column_name='embedding')",
              Boolean.class);
      return Boolean.TRUE.equals(available);
    } catch (Exception e) {
      return false;
    }
  }

  @org.springframework.scheduling.annotation.Scheduled(initialDelay = 10000, fixedDelay = 86400000)
  public synchronized void synchronize() {
    try {
      boolean vectorSearch = s.db.getDataSource() != null && hasPgVector();
      var catalog = science.catalog();
      var docs =
          Api.maps(
              science
                  .post("/evidence/search", Map.of("query", "health biology lifestyle"))
                  .get("results"));
      for (var e : docs) {
        String id = e.get("id").toString(),
            embedding = s.json.writeValueAsString(e.get("embedding"));
        int updated =
            s.db.update(
                "UPDATE scientific_evidence SET"
                    + " title=?,evidence_level=?,citation=?,payload=?,embedding_text=?,ontology_version=?"
                    + " WHERE id=?",
                e.get("title"),
                e.get("level"),
                e.get("citation"),
                s.encode(e),
                embedding,
                "hallmarks-2023-v1",
                id);
        if (updated == 0)
          s.db.update(
              "INSERT INTO"
                  + " scientific_evidence(id,title,evidence_level,citation,payload,embedding_text,ontology_version)"
                  + " VALUES(?,?,?,?,?,?,?)",
              id,
              e.get("title"),
              e.get("level"),
              e.get("citation"),
              s.encode(e),
              embedding,
              "hallmarks-2023-v1");
        if (vectorSearch)
          s.db.update(
              "UPDATE scientific_evidence SET embedding=CAST(? AS vector) WHERE id=?",
              embedding,
              id);
      }
      for (var r : Api.maps(catalog.get("relationships"))) {
        String id = r.get("id").toString();
        if (s.db.queryForObject(
                "SELECT COUNT(*) FROM biological_relationships WHERE id=?", Integer.class, id)
            == 0)
          s.db.update(
              "INSERT INTO"
                  + " biological_relationships(id,domain_id,phenotype,process,pathway,hallmark_id,evidence_level,confidence,payload)"
                  + " VALUES(?,?,?,?,?,?,?,?,?)",
              id,
              r.get("domain"),
              r.get("phenotype"),
              r.get("process"),
              r.get("pathway"),
              r.get("hallmark_id"),
              r.get("level"),
              r.get("confidence"),
              s.encode(r));
        else
          s.db.update(
              "UPDATE biological_relationships SET payload=?,evidence_level=?,confidence=? WHERE"
                  + " id=?",
              s.encode(r),
              r.get("level"),
              r.get("confidence"),
              id);
      }
    } catch (Exception ignored) {
      /* Retry on next request or scheduled refresh; the packaged catalog remains available. */
    }
  }
}
