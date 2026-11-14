---
name: Billable AI retry boundary
description: Why AI POST retries differ from ordinary API retries, and when model changes are justified.
---

Treat a lost AI response as potentially billable. Disable automatic replay at both the browser transport and provider SDK layers; do not add a second paid-model fallback. Authentication refresh is separate from replaying provider failures.

**Why:** Retries at multiple layers multiply unsuccessful requests, and a timeout does not prove the provider did not complete or charge for a request.

**How to apply:** New AI features must use the shared instrumented provider boundary and be included in the billable-client-path policy. Preserve safe failure metadata through the client, distinguish quota/configuration outages from temporary limits, and keep deterministic recommendations available. Cooldowns must expire rather than permanently disabling a session.

Do not infer the external cloud host's model configuration from workspace defaults or an absent Replit deployment. Change defaults only after verifying the deployed baseline, current account-available models, and representative text/JSON/image behavior.

**Why:** Documentation-level price and modality support do not establish drop-in compatibility, actual account availability, or net savings with reasoning and image costs.

**How to apply:** Report unverified external configuration honestly; never expose credentials or ask for them in chat to resolve it.
