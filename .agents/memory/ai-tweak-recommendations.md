---
name: AI tweak recommendations (premium LLM layer)
description: Constraints for the LLM-backed "AI Pick" layer on top of rule-based hardware recommendation badges
---

# AI tweak recommendations (premium LLM layer)

Layered system: rule-based overrides (free, instant, `GET /api/tweak-intelligence/recommended-options`) plus a premium LLM layer (`POST /api/tweak-intelligence/ai-recommendations`) whose picks replace rule picks when present. Badge styling distinguishes them: cyan "Recommended ✦" (rules) vs violet gradient "AI Pick ✦" (AI).

Rules that must hold:

- **LLM calls only work on the cloud host.** OPENAI_API_KEY does not exist in the packaged Electron local backend. Any client feature calling an OpenAI-backed endpoint must go through `cloudApiPost` (cloud-api.ts), never plain `fetch("/api/...")` — in packaged Electron plain fetch hits the keyless LOCAL backend and fails.
- **Client sends hardware + catalog; server validates LLM output against that submitted catalog.** The tweak registry lives client-side, so the client submits `{system, catalog}` and the server's `validateAiRecommendations()` drops any pick whose tweak id, step value, range, or option id is not in the catalog.
  **Why:** a hallucinated registry value wearing a "Recommended" badge would steer users to write invalid values to the Windows registry.
- **AI layer is strictly additive.** Any failure (401/403 non-premium, 503 no key, offline, malformed JSON, zero valid picks) silently falls back to the rule layer; failed hardware signatures are not retried within the session.
- Caching is two-level to control token spend: server `Map` keyed by sha256(hardware + catalog ids), 24h TTL, with in-flight dedup; client localStorage keyed by hardware signature, 24h TTL. `invalidateDynamicRecommendations()` clears BOTH layers plus rule cache — the hardware re-scan hook point.
- Premium gate mirrors security.ts: `requireJwt` then a local requirePremium reading `req.cloudUser.isPremium`; also rate-limited with the shared aiPerWindowLimiter/aiHourlyLimiter.

**How to apply:** any future OpenAI-backed premium feature should copy this shape — client-collected specs in the body, cloudApiPost transport, strict server-side output validation against client-declared vocabulary, hardware-keyed caching, silent fallback.
