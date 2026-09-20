# Complete historical-record imports

In **My Data → Historical records**, upload an `aevum-history-1` JSON bundle for the signed-in person. Review all results and confirm the account and sources. Health-data consent is required; imports never create accounts, grant consent, or cross account boundaries.

Each bundle has `schema_version`, `client_name`, `measurements`, `lifestyle`, and an optional `fresh_review`. Each measurement preserves `name`, `value` (including qualified strings), `unit`, `date`, `source_file`, `source_sha256`, and `source_kind` (`original_lab` or `transcribed_table`), plus optional source page/line, specimen, assay method and original lab reference limits. Historical questionnaires include their original `collected_at`, file/hash, and `facts` containing source JSON pointers and reported values.

The entire uploaded bundle is encrypted in raw storage. Its structured archive is encrypted in the database and appears in account exports. Only the validated numeric subset enters the Twin. Unsupported analytes, qualitative/qualified values, bundled results and missing units remain visible in the archive with reasons. Ordinary CRP is never converted to hs-CRP. Table transcriptions have confidence 0.65 and do not inherit historical target ranges as lab intervals. Source kind is an uploader declaration, not an independently authenticated laboratory assertion.

Historical answers retain collection dates and do not overwrite the current profile. The accompanying review is displayed as imported informational text, not clinician-verified advice or a scientific model input. Reconcile current medical/allergy/lifestyle context in Settings when appropriate. Do not infer current symptoms, consent, identity, or treatment from an old questionnaire.

Preview is idempotent for the same canonical JSON content within the account. Confirm uses the server-validated draft, ignores caller-supplied observations, deduplicates observations and refreshes the Twin transactionally. A refresh failure rolls back confirmation. Repeating a confirmed request returns the existing receipt. Raw artifacts, complete archives and generated observations are removed by existing account deletion.

Private client bundles belong in private storage, never in this public repository. The tests use synthetic data only.

## API

- `POST /api/historical-imports/preview`: authenticated JSON bundle, up to 2 MB; returns the complete review draft.
- `GET /api/historical-imports`: authenticated, health-consented account's drafts and confirmed archives.
- `POST /api/historical-imports/{id}/confirm`: `{client_name, verified_account_and_sources: true}` after review. Returns counts, preserved data and Twin version.
- Existing `/api/sources/{artifact_id}` downloads the encrypted-at-rest original through authenticated access; `/api/export` includes `historical_import`.

No migration endpoint supports choosing an arbitrary person ID. Client-account ownership must be established before using the flow.
