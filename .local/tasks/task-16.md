---
title: Adaptive Optimization Engine
---
# Adaptive Optimization Engine

## What & Why
Replace the static "Apply Recommended" button (which today just filters tweaks by `level=Recommended` + `risk=Safe`) with a hardware-aware optimization intelligence engine. When the user clicks Apply Recommended, the app runs ONE analysis burst, asks what they're optimizing for, then generates a scored Optimization Plan (with reasons, confidence, and explicit "do NOT apply" anti-recommendations) before applying anything.

This is a **deterministic weighted-heuristics engine**, not an AI/LLM system. ~90% engine logic, ~10% presentation. No runtime model calls, no continuous polling, no background telemetry loops. It builds directly on the existing `shared/hardwareIntelligence.ts` (X3D/hybrid/GPU detection + avoid-verdicts) and the existing tweak registry.

## Done looks like
- Clicking "Apply Recommended" opens a fast analysis modal, runs a single hardware snapshot (300-1200ms), then shows an intent popup ("What are you optimizing for?" — 9 options).
- After choosing intent, the user sees an Optimization Plan: which tweaks will apply, each with a confidence %, a plain-language reason, expected impact, safety level, and reversibility — plus a separate list of tweaks the engine explicitly avoided and why.
- Nothing is applied until the user confirms the plan. Applying uses the existing executor (Electron IPC / web API).
- The engine never recommends outdated/placebo/unsafe tweaks, and avoids hardware-inappropriate ones (e.g. no scheduler/timer hacks on X3D, no E-core-starving presets on Intel hybrid, no desktop-only power changes on laptops).
- Re-clicking within ~5-15 min reuses the cached snapshot/plan instead of re-scanning.
- The whole applied plan can be reverted as one session ("Revert optimization"), not just tweak-by-tweak.
- Network optimization is a separate flow with its own signals/scoring/safety rules; it only runs when the user enters the network flow.
- The dashboard does not re-render during analysis (isolated state slice); animations stay smooth, no CPU spikes.

## Out of scope
- Any LLM/generative-AI runtime reasoning, prompt systems, or cloud inference for this engine.
- New continuous telemetry/polling loops or new heavy `systeminformation` calls (reuse existing cached snapshot + live-telemetry sources).
- BIOS-level changes (the existing BIOS Advisor stays as-is).
- Rewriting the existing per-tweak executors or the Advisor rule engine.

## Steps
1. **Optimization metadata layer** — Add a deterministic per-tweak optimization metadata map keyed to existing tweak ids: measurability class (proven / conditional / legacy / unsafe-placebo), benefit confidence, reversibility, stability risk, Windows-build compatibility with a confidence-decay table (e.g. tweaks that became obsolete/harmful on 24H2), per-intent affinity weights, and conflict/duplicate/anti-recommendation relationships. Pure data + types, no LLM. Mark known placebo/legacy/benchmark-only tweaks so the engine can exclude them.
2. **Hardware snapshot collector** — A single batched, frozen snapshot assembled from EXISTING cached sources only (Electron `system:getSpecs` + live-telemetry cache; web REST fallbacks). Separate static signals (CPU/GPU/RAM/Windows build/NIC type) from live signals (load/thermal/instability); sample live briefly, then freeze and discard. No new polling, no extra `systeminformation` bursts.
3. **Decision graph + weighted scoring engine** — A pure shared module that takes the frozen snapshot + chosen intent and produces an Optimization Plan. It scores each candidate tweak by weighted factors (latency/frametime/scheduler/background/interrupt/network benefit vs stability risk + hardware + Windows-build compatibility + confidence), folds in the existing hardware verdicts (extending `evaluateTweakForHardware`), runs the conflict + anti-recommendation rules, and emits recommended actions and explicitly-avoided actions with per-item reason/confidence/impact/safety/reversibility. No `recommended=true` booleans — scores only.
4. **Isolated optimization store + flow controller** — A dedicated lightweight Zustand slice (separate from the main app store) holding the analysis state machine (idle → snapshotting → intent → deciding → plan → applying → done), a cooldown cache (5-15 min) of snapshot+plan, and applied-session tracking for whole-plan rollback. Minimal subscriptions so the dashboard does not re-render during analysis.
5. **Intent popup UI** — A premium animated modal ("What are you optimizing for?") with the 9 options (Lowest Latency, Highest FPS, Lowest Stutter, Smooth Frametimes, Balanced Gaming, Streaming + Gaming, Competitive FPS, Network Responsiveness, Automatic Best Optimization), shown AFTER the snapshot completes. Lightweight, smooth, no blocking render work, no cheesy "AI" wording.
6. **Optimization Plan UI** — A modal listing recommended tweaks (confidence %, reason, expected impact, safety, reversibility) and a clearly separated "avoided" list with reasons. Confirm applies ONLY the approved plan through the existing executor; includes a session-level "Revert optimization" control.
7. **Wire into Apply Recommended + network engine** — Route the existing Apply Recommended trigger into the new flow (snapshot → intent → plan → apply). Build the separate network optimization engine (its own signal tree, scoring weights, and safety rules — interrupt moderation, adapter power, packet scheduling, offload conflicts, WiFi roaming, NIC tuning; no placebo TCP/ping tweaks) that runs only when the user enters the network flow.
8. **Build verification** — `npm run build` clean (zero TS errors), and a manual walkthrough of the full flow in web mode (snapshot → intent → plan → apply → revert) plus the network flow.

## Relevant files
- `client/src/lib/tweak-registry.ts`
- `shared/tweak-tiers.ts`
- `shared/hardwareIntelligence.ts`
- `client/src/lib/hooks.ts`
- `client/src/lib/store.ts`
- `client/src/components/tweaks/TweaksList.tsx`
- `client/src/hooks/use-tweak-executor.ts`
- `client/src/lib/api.ts`
- `server/routes.ts`
- `server/lib/systemIntelligence.ts`
- `client/src/advisor/ruleset/bundled.ruleset.json`
- `electron/main.js`
- `electron/preload.js`