# Aevum

A personal Biological Twin: understand your measurements, explore the biology behind a pattern, choose a measurable experiment, and learn from the response.

Built from scratch from the three supplied specifications. No existing product repository was reused. See [the implementation plan and traceability ledger](docs/IMPLEMENTATION_PLAN.md), [architecture](docs/ARCHITECTURE.md), and [verification / release status](docs/VERIFICATION.md).

![Aevum overview — synthetic sample data](docs/screenshots/desktop.png)

## Run locally

Requirements: Python 3.10+, Java 21+ and internet access for first-time dependency installation. The bootstrap installs project-local Node 24 and Maven if needed. All generated tooling stays inside this project. A compatible Node already on PATH can also be used.

```bash
python3 scripts/bootstrap.py
python3 scripts/dev.py
```

Open **http://127.0.0.1:5173**. Choose **Explore a sample Twin** for a complete synthetic example, or **Build my Twin** for an empty private account. There is no shared default password. Demo sessions are isolated from real accounts.

Local services: React/Vite `5173`, Spring Boot `8080`, Python analytics `8090`. All bind to loopback. Ctrl+C stops the three services together. Logs live in `.runtime/logs/`.

The local profile persists encrypted records in H2 and encrypted source files on disk. The local key is created with owner-only permissions at `backend/.runtime/local-vault.key`. Keep the key and database together when backing up; losing the key makes records unreadable. Do not overwrite a running JAR; the runner uses a separate copy.

## The complete journey

1. Create an account, choose a goal, add personal context and grant explicit processing consent.
2. Upload historical/current lab PDFs or CSVs. Review extraction, fix values/units/dates and explicitly acknowledge excluded rows. Only confirmed results enter the model.
3. Connect Oura with operator OAuth credentials, or import a real Oura v2 JSON export. Genotype TXT/CSV uploads require separate permission and a declared genome build.
4. Explore Home, domain states, trajectories, strengths, priorities and source provenance. Inspect biological interpretations, evidence tiers and the 12-hallmark framework.
5. Compare personalized options. Freeze a baseline and protocol when starting an eligible experiment. Record adherence, adverse effects and concurrent changes.
6. Add comparable follow-up measurements and evaluate. The response may be favorable, no meaningful response, negative/adverse, or inconclusive. The Twin records a new version. Save Continue / Modify / Stop; a new experiment creates a fresh baseline for a subsequent cycle.
7. Ask contextual questions; inspect the claim’s observations, relationships and scientific references. Manage consent, export the structured record, download original sources, or delete the account.

## Input formats

- **Labs:** text-based PDF or CSV. CSV columns: `biomarker,value,unit,date,reference_low,reference_high`. See [the CSV template](fixtures/lab-template.csv). Dates must be ISO `YYYY-MM-DD`. Ambiguous extraction is never silently accepted. Scanned/complex PDFs fall back to source review and manual entry; OCR is not silently simulated.
- **Wearable:** Oura v2 `{"data":[...]}` JSON, with `day`, `average_hrv`, `average_heart_rate`, `total_sleep_duration` (seconds), and/or `steps`. The OAuth adapter uses the same normalization and handles pagination and refresh tokens.
- **Genotype:** `# build 37` or `# build 38`, then `rsID chromosome position genotype`. Build-specific coordinates are retained; no unvalidated liftover is performed. The first annotation panel is intentionally narrow: SLCO1B1 medication context requiring confirmation. Raw variants are stored separately and never sent to the language model.
- **Context:** temporal structured lifestyle, medical and family-history questionnaires. Unknowns stay unknown.

## Tests

```bash
python3 scripts/test.py
# With the application running in another terminal:
python3 scripts/test.py --browser
```

The test runner covers scientific rules and parsers, Java identity/privacy/storage checks, TypeScript/build, browser journeys and automated accessibility checks. Browser tests create their own synthetic/demo or test accounts.

## Deployment topology

```bash
python3 scripts/generate_env.py
# Set optional provider credentials in .env, then:
docker compose up --build
```

Open `http://127.0.0.1:8088`. The Compose profile provides PostgreSQL/TimescaleDB, pgvector, S3-compatible MinIO, Redis, Python analytics, Spring Boot, and an Nginx-served web build. Only the web service is exposed, on loopback. For a public deployment, add a TLS reverse proxy, set `AEVUM_ENV=production`, configure the public Oura redirect URI, and follow the deployment checklist in the architecture document. This is a deployment configuration, not a claim of a production launch or independently validated clinical system.

## Optional live integrations

- **Oura:** set `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, and `OURA_REDIRECT_URI`. A missing configuration is clearly reported; the UI never fakes a successful connection. Provider access requires an eligible account and application approval as applicable.
- **External AI routing:** set `ANTHROPIC_API_KEY` and an available `LLM_MODEL`. The language model selects a bounded read-only retrieval tool; the system renders authoritative structured claims with provenance. Only the question and tool schemas leave the service, not the full health record or raw genotype. Invalid tool calls, timeouts, or unavailable credentials fall back to the clearly identified deterministic guide. Free-form medical generation is deliberately excluded.
- **Scientific retrieval:** a small curated, cited corpus with structured metadata plus 384-dimensional signed-hash vectors. The PostgreSQL profile uses pgvector; local review uses the identical cosine representation. These are transparent lexical vectors over curated summaries, not a claim of broad literature search or learned semantic embeddings.

## Scientific scope

This is an engineering MVP with interpretable, versioned research rules. It does not produce a single biological age, diagnose disease, prescribe drugs, infer a current disease from DNA/family history, or equate improved biomarkers with reversal of aging. Source intervals, personal baselines, time-aware trends, persistence, cross-signal agreement, quality, missingness and uncertainty remain visible.

The PDFs do not supply validated model coefficients, calibrated age/sex reference cohorts, a clinically reviewed annotation database, or a prospective validation study. Those are explicit clinical-release gates, not facts the software can manufacture. See the verification report for tested behavior and remaining external dependencies.
