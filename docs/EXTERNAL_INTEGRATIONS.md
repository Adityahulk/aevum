# External integrations

Aevum's Twin, accounts, file imports, scientific model, experiments, export and deletion run without a paid AI API. Ask Aevum requires a configured language model and reports itself unavailable when that dependency is absent.

## Wearables: Open Wearables

Open Wearables is the only live wearable integration service. Deploy it using [the complete runbook](OPEN_WEARABLES.md), provision its server API key, and configure each enabled provider's OAuth credentials there. No Terra key or direct provider credentials belong in Aevum.

The runbook covers Railway services, restricted public callbacks, provider approvals, user-scoped tokens, background imports, and the Apple Health/Android mobile companion. Connecting a brand still requires its developer credentials and any required approval; Open Wearables does not bypass those requirements. File imports remain available without it.

## OpenAI for Ask Aevum

The model explains a compact, question-relevant projection of the structured Twin. This can include verified measurement summaries, wearable trends, user-reported context, curated genomic interpretations, biological relationships, intervention rationale and experiment outcomes. Source files, raw genotype rows, account identity and unrelated records are excluded. API response storage is disabled. Every model claim must cite a source in the projection or the full answer is rejected.

1. Create an OpenAI Platform project for the Aevum pilot.
2. Create a restricted project API key and set project usage limits and billing alerts.
3. Choose a Responses API model enabled for the project. This deployment uses `gpt-6-luna` for focused, low-latency Ask responses; evaluate it against the Ask test set before changing models.
4. Add these variables to Railway's `analytics` service:

   ```text
   OPENAI_API_KEY=<restricted project key>
   LLM_MODEL=gpt-6-luna
   OPENAI_SERVICE_TIER=
   ```

5. Leave `OPENAI_SERVICE_TIER` empty for standard processing. Set it to `fast` only if the selected model and project support Fast mode and the latency benefit justifies its higher price.
6. Redeploy `analytics`, ask questions from the synthetic sample account, and inspect the linked measurements and scientific sources.
7. Temporarily remove the key and verify that Ask shows an unavailable state rather than a generated or templated health answer.

Do not place the OpenAI key in `web` or the public API service. It belongs only in the private analytics service.

## Integrations to add before a broader public release

These are operational product additions and are not required by the current MVP runtime:

- **Transactional email:** add an email provider for address verification, password reset, security notices, and account-deletion confirmation. Resend, Postmark, Amazon SES, and similar providers can fill this role, but the current account flow does not call one.
- **Error monitoring:** add a privacy-configured backend and frontend error service with health/genomic payload scrubbing. Do not enable broad request-body capture.
- **Product analytics:** if added, collect explicit consent and use an allowlist of non-health events. Never send biomarker values, genomic data, uploaded filenames, Guide questions, or account exports.

Choose those providers only after the privacy terms, data region, retention settings, and data-processing agreement match the pilot's jurisdiction.
