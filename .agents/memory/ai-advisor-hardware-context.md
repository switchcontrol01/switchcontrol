---
name: AI Advisor hardware context source
description: Where the AI Advisor's hardware facts come from, and why server-side system intel must NOT be used for the user's specs.
---

# AI Advisor must read the CLIENT CPU string, never the cloud VM's

The AI Advisor (`server/routes/ai.ts`) runs on the cloud server (Replit VM). Any
server-side hardware probe — `serverCtx.systemIntel` from `buildAdvisorServerContext`,
or `getCachedSystemIntelligence()` — reflects the **cloud VM's** hardware (EPYC CPU,
~4 GB RAM, 1 stick), NOT the user's machine.

**Rule:** All user-facing hardware reasoning (CPU/GPU/RAM specs, CPU-architecture
inference, scheduler-safety guidance) must derive from the **client-supplied**
`context.system.*` strings, which the Electron app collects from the real OS.

**Why:** A prior bug had the AI report the cloud server's "4 GB single stick" specs
as if they were the user's. `buildChatContext` has explicit comments enforcing
"client values win"; `serverCtx.telemetry` / `serverCtx.systemIntel` are only safe
for things genuinely about the server, never the user's rig.

**How to apply:** When adding hardware-aware logic to the advisor, feed it
`data.system.cpu` / `context.system.*`, not the server intel. Example:
`inferCpuArchitectureNote(cpuBrand)` classifies X3D / Intel-hybrid / Ryzen /
conventional from the client CPU string to emit scheduler-safety guidance.

**Intel hybrid detection caveat:** "12th-gen+" is NOT a reliable hybrid signal —
i3 (12100/13100) and 12th-gen non-K i5 (12400/12500) have no E-cores. Decide by
tier+generation+K-suffix, not generation alone.
