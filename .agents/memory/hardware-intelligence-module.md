---
name: Hardware intelligence shared module
description: shared/hardwareIntelligence.ts is the single source of truth for CPU/GPU classification and per-tweak hardware verdicts, consumed by both server prompts and client UI.
---

# shared/hardwareIntelligence.ts — one classifier for server + client

All hardware-adaptive reasoning lives in `shared/hardwareIntelligence.ts` (imported
via the `@shared/*` alias on both server and client). Do NOT re-implement CPU/GPU
classification anywhere else.

Exports:
- `classifyCpuArchitecture` / `inferCpuArchitectureNote` — X3D / Intel-hybrid /
  Ryzen / conventional from a CPU brand string (hybrid needs tier+gen+K, not gen).
- `classifyGpuVendor`, `buildHardwareProfile`, `summarizeHardwareIntelligence` —
  multi-line CPU+GPU+laptop+display briefing for AI prompts.
- `evaluateTweakForHardware(tweakId, profile)` — per-tweak verdict
  (recommended/caution/avoid), keyed to REAL tweak ids: `synth-timers`,
  `win32-priority-sep`, `preemption` (HAGS), `power-throttling`.

**Why:** Avoids drift between what the AI recommends and what the tweak UI warns —
the "detect hardware first, recommend only what fits" stability-first vision.

**How to apply:**
- Server (`server/routes/ai.ts`): feed CLIENT-supplied specs into
  `summarizeHardwareIntelligence` for both advice and chat prompts.
- Client: `useHardwareProfile()` / `useTweakHardwareVerdict(id)` build the profile
  from real hardware (Electron getSpecs stats → systemIntelligence fallback) and
  render a verdict pill in `TweakCard`. Gated to Electron only.
