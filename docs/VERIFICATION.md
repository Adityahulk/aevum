# Verification and release status

Build date: 15 September 2026. All implementation work was created in the task workspace from the three supplied specifications. No existing product folder was reused.

## Implemented phases

| Phase | Status | Evidence |
|---|---|---|
| Foundation / identity / privacy | Implemented and locally exercised | Registration/login, cookie sessions, ownership tests, versioned consent, authenticated encryption, audit, export/deletion |
| Canonical ingestion | Implemented and locally exercised | CSV and text-PDF parsing, review/correction workflow, immutable sources, validation/deduplication, Oura JSON and genotype import |
| Scientific engine / Twin | Implemented as transparent research rules | Baselines, temporal features, persistence, concordance, missingness/freshness, domain states, prioritized patterns, evidence-classified biology, immutable versions |
| Interventions / response | Implemented and locally exercised | Goal/filter/safety ranking, frozen baselines, adherence/adverse effects, response classes, decision tracking, feedback to ranking and Twin |
| Product interface | Implemented and browser-tested | Onboarding, overview, Twin/domain/history, Biology/evidence, recommendations/experiments, guide, Data/corrections/context, Privacy |
| Operations / deployment | Local run verified; container profile supplied | Launch/bootstrap/test scripts, isolated runtime storage, Dockerfiles and Compose topology; external services still require runtime verification |

## Automated verification

Final run: **61 tests passed** — 48 Python scientific/parser tests, 8 Java integration tests, and 5 Playwright browser/accessibility tests. `python3 scripts/test.py --browser` completed successfully, including TypeScript checking and the Vite production build. The accessibility test checks the welcome screen and seven main screens.

`python3 scripts/bootstrap.py` completed dependency installation and production builds successfully using the available Node and task-local Maven runtime overrides. The dependency-download fallback is supplied but was not separately exercised. `python3 scripts/dev.py` started all three services and passed their health checks. A separate browser inspection reported no JavaScript page errors and no horizontal overflow. Tests are included in the repository.

- Scientific/parser tests cover all 12 hallmarks, empty/stale/single-measurement cases, direction-aware trends, reference-boundary crossings, duplicate sampling, unit/reference conversion, date/range validation, unverified observations, wearable windows, partial recomputation, context versus diagnosis, safety filters, response timing/adherence/noise/confounding, PDF/CSV/genotype import, evidence retrieval and constrained external-tool selection.
- Java integration tests exercise unauthenticated access, request verification, no implicit consent, consent history, private-source ownership, encryption randomization/integrity, encryption at rest and account deletion confirmation.
- Browser journeys exercise real HTTP requests through React → Spring → Python → persistence. They cover source review before publication, a full sample experiment response, source provenance, correction persistence, duplicate-file rejection, genomic ownership, revoked consent and responsive navigation.
- Accessibility checks use axe-core WCAG 2 A/AA and WCAG 2.1 AA rules on the welcome screen and the seven main screens. Automated checks do not replace assistive-technology testing.
- The frontend is type-checked and production-built. Python modules are linted/formatted against this repository’s own configuration. Java and frontend source are formatted.
- An npm audit of both runtime and development dependencies reported zero known vulnerabilities at the time of this build. This is not a substitute for ongoing dependency/image monitoring.

## Visual review

Desktop (1440px) and mobile (390px) screens were inspected. No horizontal page overflow was detected across the main routes. Changes made during review include readable text/badge contrast, improved mobile biological-story layout, source table scrolling, focused dialog behavior and self-hosted fonts.

## Boundaries that remain explicit

- **Clinical validation:** scoring thresholds, freshness policies, cohort applicability, phenotype mappings, contraindication coverage and intervention response rules require scientific/clinical review and prospective validation before clinical claims or public medical use.
- **PDF breadth:** text-based reports are parsed conservatively. Scanned/complex reports require manual review and entry; an OCR service is not implemented or falsely represented as working.
- **Genomics breadth:** consumer files are validated with explicit builds, but the annotation panel is narrow and confirmation-limited. This is not a clinical sequencing interpretation platform or a validated genetic risk model.
- **Live Oura:** OAuth, refresh, daily sync and import paths are implemented. Real account/provider integration has not been exercised without credentials. Export import is functional and tested.
- **External LLM:** the optional provider adapter is implemented and tested with an HTTP mock. No paid provider call was made. It routes read-only retrieval; it cannot generate authoritative medical facts. Local deterministic explanations are fully usable and clearly labeled.
- **Deployment services:** Docker/PostgreSQL/TimescaleDB/pgvector/S3/Redis configuration is supplied. This environment did not have a functioning Docker daemon or Compose plugin, so the container topology has not been claimed as runtime-verified.
- **Pilot operations:** public TLS, secrets/key rotation, backup/restore, email verification/recovery, monitoring, jurisdictional compliance review and multi-instance worker coordination remain operator release work. No claim of certification or production deployment is made.

The deliverable is a working local research MVP with the complete intelligence loop, a reviewable scientific model, and a deployment path. Remaining external dependencies and validation gates are not silently represented as completed.
