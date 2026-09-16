CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS observation_index (
 observation_id VARCHAR(100) NOT NULL, person_id VARCHAR(100) NOT NULL,
 concept_id VARCHAR(100) NOT NULL, effective_time TIMESTAMPTZ NOT NULL,
 source VARCHAR(50) NOT NULL, encrypted_payload TEXT NOT NULL,
 PRIMARY KEY(observation_id,effective_time)
);
SELECT create_hypertable('observation_index',by_range('effective_time'),if_not_exists=>TRUE);
CREATE INDEX IF NOT EXISTS observations_by_person_time ON observation_index(person_id,concept_id,effective_time DESC);
CREATE TABLE IF NOT EXISTS scientific_evidence (
 id VARCHAR(100) PRIMARY KEY, title TEXT NOT NULL, evidence_level VARCHAR(30) NOT NULL,
 citation TEXT NOT NULL, payload TEXT NOT NULL, embedding_text TEXT NOT NULL,
 ontology_version VARCHAR(100) NOT NULL, embedding vector(384)
);
CREATE INDEX IF NOT EXISTS evidence_cosine ON scientific_evidence USING hnsw(embedding vector_cosine_ops);
