# MVP domain evidence audit — 23 September 2026

Scope: preserve the seven core product domains and existing navigation, biological graph, interventions and experiment flows. Optional ontology domains remain conditional. Do not create laboratory-panel domains.

## Plan and implementation

1. Align Biology navigation with the Twin's domain list, including unmeasured domains. Each domain presents its available and missing data.
2. Separate direct measurements from supporting laboratory, historical questionnaire and genomic context. Supporting context appears without generating a phenotype, functional score or direct measurement coverage.
3. Replace catalog-size coverage with explicit measurement groups. Correlated lipids and standard/high-sensitivity CRP do not each count as independent coverage. Blood pressure requires both systolic and diastolic readings. Show the groups, expected measurements, available results and missing/outdated groups.
4. Pass confirmed historical answers and consented genomic findings through the server-owned Twin payload. Preserve original answer dates; do not convert old questionnaire values into current measured data. Include context in version fingerprints and invalidate incremental reuse when context changes.
5. Expose the current genomic annotation scope honestly: curated SLCO1B1 medication context, mapped to cardiovascular and musculoskeletal interpretation. No polygenic score, whole-genome interpretation, age score or inferred current disease. Raw variants never enter the domain payload. Revoking genomic consent refreshes the Twin and blocks genomic historical versions.
6. Keep wearable provider, device and method provenance distinct. Do not form a baseline across device or method changes. RMSSD and SDNN remain separate. No vendor readiness/strain score is a clinical measurement.
7. Test context-only domains, coverage grouping, mixed lab/wearable/genomic inputs, consent, historical dates, model migration and the full browser journey. Deploy and inspect the real account.

## Mapping rationale

Mappings live in `analytics/domain_evidence.py` and are explicit and inspectable. Vitamin D supports musculoskeletal context; hemoglobin and ferritin support fatigue and exercise-capacity context. These are not strength, recovery or fitness tests. Source references: NIH ODS [Vitamin D](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/) and [Iron](https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/). Existing SLCO1B1 locus annotations follow the limited medication-context use described by [CPIC](https://cpicpgx.org/guidelines/cpic-guideline-for-statins/); a locus being present does not establish an actionable haplotype or treatment recommendation.

Complete source records remain in My Data even when no current domain mapping exists. No measurement or genomic finding is fabricated to populate an empty domain. Consumer DNA is not an epigenetic clock. Historical self-report is visibly dated, and direct wearable coverage requires actual imported and confirmed observations.
