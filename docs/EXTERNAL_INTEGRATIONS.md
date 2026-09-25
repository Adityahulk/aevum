# External integrations

Aevum runs without a paid third-party API. The sample Twin, accounts, file imports, scientific model, experiments, deterministic guide, export, and deletion all work with the Railway resources in the deployment runbook.

## Wearables: Open Wearables

Open Wearables is the only live wearable integration service. Deploy it using [the complete runbook](OPEN_WEARABLES.md), provision its server API key, and configure each enabled provider's OAuth credentials there. No Terra key or direct provider credentials belong in Aevum.

The runbook covers Railway services, restricted public callbacks, provider approvals, user-scoped tokens, background imports, and the Apple Health/Android mobile companion. Connecting a brand still requires its developer credentials and any required approval; Open Wearables does not bypass those requirements. File imports remain available without it.

## OpenAI GPT-6 Luna (optional, preferred)

The language model is used only to choose a bounded, read-only retrieval route. Aevum itself renders the final evidence-linked response. Health records, source documents, and raw genotypes are not placed in the model request.

1. Create an OpenAI platform account and project.
2. Create a restricted production API key and record it once.
3. Add these variables to Railway's `analytics` service:

   ```text
   OPENAI_API_KEY=<api key>
   LLM_MODEL=gpt-6-luna
   ```

   If `LLM_MODEL` is omitted while `OPENAI_API_KEY` is set, analytics defaults to `gpt-6-luna`. Chat Completions function calling for Luna requires `reasoning_effort=none`; the analytics adapter sets that automatically.

4. Redeploy `analytics` and ask a Guide question from a sample account.
5. Confirm the reply mode is `LLM-routed guide` and that the deterministic guide still answers when the key is temporarily removed.

Do not place the OpenAI key in `web`; it belongs only in the private analytics service. Set a modest usage limit and billing alert for the pilot.

## Anthropic (optional legacy)

Used only when `OPENAI_API_KEY` is unset. Set `ANTHROPIC_API_KEY` and an available `LLM_MODEL` on `analytics` if you prefer Anthropic Messages routing instead of OpenAI.

## Integrations to add before a broader public release

These are operational product additions and are not required by the current MVP runtime:

- **Transactional email:** add an email provider for address verification, password reset, security notices, and account-deletion confirmation. Resend, Postmark, Amazon SES, and similar providers can fill this role, but the current account flow does not call one.
- **Error monitoring:** add a privacy-configured backend and frontend error service with health/genomic payload scrubbing. Do not enable broad request-body capture.
- **Product analytics:** if added, collect explicit consent and use an allowlist of non-health events. Never send biomarker values, genomic data, uploaded filenames, Guide questions, or account exports.

Choose those providers only after the privacy terms, data region, retention settings, and data-processing agreement match the pilot's jurisdiction.
