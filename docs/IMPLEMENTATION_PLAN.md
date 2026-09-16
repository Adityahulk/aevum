# Aevum — implementation plan and requirements ledger

## Authority and baseline
All three supplied specifications were read in full (31 + 46 + 33 pages). Their product/scientific/UX/architecture content is authoritative. Document examples are illustrative data, not real health findings or instructions to access other projects. The user's explicit greenfield instruction supersedes the request to analyze an existing repository: the task workspace contained no source repository. No existing product source was reused.

The scientific specification defines the model and guardrails. The backend specification specializes the implementation. The UX specification defines the complete MVP journey. Where breadth differs, the two MVP documents govern: genotype is included now; epigenetic/cognitive domains appear only when supported by data; future omics remain extension points. The recommended technology stack is retained, with a self-contained local storage profile for review.

## Phases and acceptance gates
1. **Foundation, identity and consent.** New React/TypeScript application, Spring Boot modular API, Python analytics service. Pseudonymous person IDs, password hashing, HttpOnly sessions, ownership checks, versioned consent, encrypted records/raw files, audit trail. Tests: unauthorized access, separate-account isolation, consent enforcement.
2. **Ingestion and canonical health records.** Immutable raw artifacts, SHA-256 provenance, lab CSV/text-PDF extraction and mandatory review, correction history, unit/date/range validation, deduplication, Oura JSON and OAuth adapter, genotype format/build checks, temporal questionnaires. Tests: malformed input, ambiguous units/dates, unsupported genome builds, review before publication, duplicate sources.
3. **Scientific intelligence.** Curated concepts; personal baselines, time-aware slopes, 7/28-day wearable features, quality/freshness/coverage, convergent phenotypes, strengths, ranked weaknesses, all 12 hallmarks with evidence-classified graph relationships. Immutable Twin snapshots and change detection. Tests: missing data, one measurement, opposite marker directions, stale values, context versus diagnosis, incremental recomputation.
4. **Action and learning.** Curated evidence and intervention catalog, explainable goal/preferences/safety ranking, experiments with frozen baseline and success criteria, adherence/adverse events, follow-up eligibility and conservative response evaluation, continue/modify/stop, new Twin version. Grounded assistant retrieves bounded structured context and returns claim provenance; optional external LLM only phrases verified context. Tests: contraindications, adverse effects, inadequate duration/adherence, confounding, no causal/aging-reversal claims.
5. **Complete product UX.** Home, My Twin/domain detail, Biology graph/evidence, Interventions/recommendations/experiments, AI, Data/sources/corrections, onboarding, timeline, consent/settings, account export/deletion. Calm editorial design, responsive layouts, keyboard access, explicit demo data and genuine empty states.
6. **Verification and handoff.** Python scientific tests, Java API integration tests, TypeScript build, browser journey tests, desktop/mobile visual inspection, operational scripts, containers, architecture/runbook and honest release-readiness report.

## Requirements traceability
| Requirement | Specification sections | Implementation / verification |
|---|---|---|
| Multidimensional state, strengths, uncertainty, temporal frequency | Science 2–4; Backend 17–22; UX 9–14 | analytics engine; Twin/domain UI; scientific tests |
| Separate observation / phenotype / mechanism / aging relevance / response | Science 5–6, 11–13; UX 15–17 | typed graph and claim records; evidence drawer |
| Raw immutable artifacts and canonical lineage | Backend 4–14, 46 | encrypted raw store, import review, canonical observations, audit |
| Blood PDF/CSV, wearables, genotype | Backend 3, 7–13; UX 7–8, 28–30 | parser adapters; Oura integration; upload and review UI |
| Lifestyle, medical and family history | Backend 3.3–3.5, 10–11; UX 6, 30 | versioned context; onboarding/settings |
| Curated evidence and all 12 hallmarks | Science 5–7; Backend 16, 23–28 | versioned knowledge catalog; graph and evidence explorer |
| Goal-aware transparent ranking with safety filters | Science 8–9; Backend 29–31; UX 18–21, 36–37 | recommendation service and preference controls |
| Experiment lifecycle and four response classes | Science 9; Backend 32–34; UX 21–24 | experiment API/UI, response tests |
| Versioned Twin and meaningful changes | Backend 35–37, 41–45; UX 14, 24, 31, 35 | immutable snapshots, event queue, timeline |
| Contextual AI with claim provenance | Backend 38–40; UX 25–27 | retrieval tools, bounded claims, AI conversation |
| Consent, identity, genomic isolation, audit | Backend 47–48 | API authorization, encryption, explicit consent, export/deletion |
| Production topology | Backend 15, 49–51 | Spring + Python + PostgreSQL/Timescale + S3 + Redis/worker + pgvector deployment profile |

## Scientific release gates
The PDFs do not provide validated scoring coefficients, a deployable reference-range policy, a reviewed variant annotation database, or a clinically signed-off intervention formulary. Engineering must not manufacture validation. Implement interpretable versioned research rules with lab-provided ranges, conservative confidence, explicit limitations and reviewable evidence. Production clinical release still requires scientific/clinical review and prospective validation. External Oura/LLM credentials must be supplied by the operator; absent credentials must never look like a successful live connection.

## Completion record
All six engineering phases have been implemented. The application and source are available for local review, with phase-specific scientific, backend, browser and accessibility tests. See `VERIFICATION.md` for exact results and explicit release gates. External credentials, Docker runtime verification, calibrated scientific coefficients and clinical validation remain dependencies; the software does not invent them.

An initial synthetic workspace demonstrates the complete loop. Real accounts begin empty, with explicit consent and source review. The application is named **Aevum** as an editable working product name; no trademark availability is claimed.
