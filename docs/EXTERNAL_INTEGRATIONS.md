# External integrations

Aevum runs without a paid third-party API. The sample Twin, accounts, file imports, scientific model, experiments, deterministic guide, export, and deletion all work with the Railway resources in the deployment runbook.

## Oura OAuth (optional, recommended for wearable pilots)

1. Sign in to the Oura developer portal and create an OAuth2 application.
2. Use the final public application URL as the website URL.
3. Register this exact redirect URI:

   ```text
   https://YOUR_DOMAIN/api/wearables/oura/callback
   ```

4. Add these variables to Railway's `api` service:

   ```text
   OURA_CLIENT_ID=<client id>
   OURA_CLIENT_SECRET=<client secret>
   OURA_REDIRECT_URI=https://YOUR_DOMAIN/api/wearables/oura/callback
   ```

5. Redeploy `api`, create a consenting test account, connect Oura from Sources, and verify that the callback returns to the Sources screen.
6. Confirm a sync creates reviewable wearable observations and that disconnecting the provider removes the stored refresh token.

The implementation requests daily-data access and normalizes Oura v2 sleep and activity responses. OAuth app review and user limits are controlled by Oura. A person can instead import an Oura v2 JSON export, so this integration does not block the MVP.

## Anthropic (optional)

The language model is used only to choose a bounded, read-only retrieval route. Aevum itself renders the final evidence-linked response. Health records, source documents, and raw genotypes are not placed in the model request.

1. Create an Anthropic Console account and workspace.
2. Create a restricted production API key and record it once.
3. Choose a model identifier currently enabled for that workspace.
4. Add these variables to Railway's `analytics` service:

   ```text
   ANTHROPIC_API_KEY=<api key>
   LLM_MODEL=<enabled model id>
   ```

5. Redeploy `analytics` and ask a Guide question from a sample account.
6. Inspect the returned route/provenance and verify that the deterministic guide still answers when the key is temporarily removed.

Do not place the Anthropic key in `web`; it belongs only in the private analytics service. Set a modest usage limit and billing alert for the pilot.

## Integrations to add before a broader public release

These are operational product additions and are not required by the current MVP runtime:

- **Transactional email:** add an email provider for address verification, password reset, security notices, and account-deletion confirmation. Resend, Postmark, Amazon SES, and similar providers can fill this role, but the current account flow does not call one.
- **Error monitoring:** add a privacy-configured backend and frontend error service with health/genomic payload scrubbing. Do not enable broad request-body capture.
- **Product analytics:** if added, collect explicit consent and use an allowlist of non-health events. Never send biomarker values, genomic data, uploaded filenames, Guide questions, or account exports.

Choose those providers only after the privacy terms, data region, retention settings, and data-processing agreement match the pilot's jurisdiction.

