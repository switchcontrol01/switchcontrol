# AI usage and cost controls

## Investigation and deployment boundary

The six provider calls are Advisor chat/advice, hardware tweak recommendations,
BIOS photo scanning/explanations, and Security image analysis. All now use the
same instrumented OpenAI client. Deterministic security analysis and rules-based
tweak recommendations do not use this client and remain available during an AI
outage.

The prior request path could multiply an unsuccessful request: the OpenAI SDK
retried internally, and the cloud POST helper retried network errors and 5xx
responses again. A lost response can still have incurred a provider charge.
Neither layer now automatically replays these billable POSTs. Authentication
refresh after a genuine application 401 remains supported; provider authentication
errors are translated into service-configuration failures, not application 401s.

On 2026-11-14, Replit deployment metadata reported no published Replit deployment.
An environment inspection found no production `AI_MODEL` override available here.
Packaged clients target the external SwitchControl cloud host. That host's actual
environment, provider credits, model availability and historical spend were **not**
verified. An unset workspace override is not proof of the deployed model.
No billing setting, API key, production environment, or model default was changed.

## Logging

Search server logs for the JSON event `ai_provider_request`. Each provider attempt
records feature, authenticated user ID, requested model, outcome, duration, input/
output/total tokens, cached input tokens, and a sanitized failure category.
Token fields are null when the provider does not supply usage; null is not zero.
Prompts, screenshots, credentials, and raw provider error messages are excluded.
Usage is logged before application-level response validation, so a paid response
that is later rejected as malformed is still visible.

Quota exhaustion and invalid configuration have separate categories from transient
rate limiting, transport errors, invalid inputs, and unknown failures. They produce
`AI_QUOTA` / `AI_CONFIGURATION` with `retryable: false`. Actual credit totals cannot
be reconstructed from the supplied desktop logs or from token counts alone.

## Limits and recovery

- SDK retries: zero; provider timeout: 25 seconds.
- Cloud transport: no automatic network/5xx retry for the six billable endpoints.
- Advisor sends only seven previous turns plus the current message; the server
  uses at most eight messages, 1,200 characters for older turns and 2,000 for the
  latest user turn.
- Client hardware facts and tweak identities are preserved. Verbose optional
  diagnostic strings/arrays are compacted before forming context. Complete prompts
  above 60,000 text characters are rejected before calling the provider, rather
  than silently cutting safety instructions. Character limits bound inputs but
  are not exact token counts. Existing image-size/type limits remain in place.
- Existing output ceilings are unchanged: chat 1,200 tokens (900 with an image),
  legacy advice 1,100, recommendations 1,600, and existing BIOS/Security budgets.
  Environment overrides may lower advice/recommendation budgets but cannot raise
  them or set invalid numbers.
- Provider quota/configuration failures pause all six features for five minutes
  per server process. A corresponding bounded client cooldown survives navigation
  and reload. Advisor displays one persistent notice and prevents further sends
  during the cooldown; drafts remain editable.
- Hardware recommendation failures have a bounded server signature cache
  (100 entries), an in-session client cooldown, and a persisted recent-signature
  cooldown. Failures last 60 seconds, or five minutes for quota/configuration.
  Reopening/rescanning after expiry can try again; no periodic paid retry loop is
  scheduled. Valid recommendation caches and native-pick validation remain intact.
- A fresh process or another cloud instance has its own server cooldown; this is
  not a provider-wide distributed spending cap. Existing per-user rate limits
  remain active.

## Model economics

Official model documentation was checked on 2026-11-14:

| Model | Input / 1M text tokens | Output / 1M | Compatibility and status |
| --- | ---: | ---: | --- |
| `gpt-4o-mini` | $0.15 | $0.60 | Current code fallback and fixed image model; text/image input, Chat Completions and structured output documented; snapshot marked deprecated |
| `gpt-4.1-nano` | $0.10 | $0.40 | Text/image and structured output documented, but model page marks snapshot shut down; not selected |
| `gpt-5-nano` | $0.05 | $0.40 | Text/image, Chat Completions and structured output documented; reasoning model, snapshot marked deprecated; not a verified drop-in for existing temperature/max_tokens settings |

Sources:
- https://developers.openai.com/api/docs/models/gpt-4o-mini
- https://developers.openai.com/api/docs/models/gpt-4.1-nano
- https://developers.openai.com/api/docs/models/gpt-5-nano
- https://developers.openai.com/api/docs/pricing

At the listed text prices, 10,000 input + 1,000 output tokens cost about $0.0021
with 4o-mini versus $0.0009 with 5-nano, **before image, caching, or reasoning-token
differences**. This is an arithmetic illustration, not a measured production saving.
Image pricing and reasoning/output behavior can change the result.

Decision: retain the configurable `AI_MODEL` fallback and existing image model.
There is no verified deployed baseline or live compatibility benchmark to justify
a default migration. Before changing it, obtain the external host's non-secret
model configuration and compare supported, account-available candidates using
representative chat, validated tweak JSON and screenshot requests. Check token
usage, latency, empty/truncated responses, and safety-contract validation. Never
automatically fall back to a second paid model when a request fails.

## Verification

`node --import tsx --test tests/ai-cost-controls.test.ts` tests quota versus
rate-limit handling, retry policy, budgets, context preservation, failure-cache
expiry, client recovery, safe error responses, usage logging, image/JSON request
forwarding, input rejection, and cross-feature quota cooldowns. The SDK transport
is mocked: no billable requests, real credentials, image interpretation, or live
model-quality claims are involved.
