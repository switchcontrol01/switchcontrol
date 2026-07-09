---
name: NVIDIA telemetry revert — modern driver no-op success
description: executeNvidiaTelemetry revert always failed on modern NVIDIA driver installs; root cause and fix.
---

## Rule
Before running Enable-ScheduledTask for the NVIDIA telemetry revert, check whether the telemetry components (NvTm*/NvNode*/NvProfile* tasks + NvTelemetryContainer service) actually exist. If none exist, return `ok: true` immediately — there is nothing to restore.

**Why:**
Modern NVIDIA driver installs (GeForce Game Ready 5xx era and many 4xx installs) simply don't ship `NvTm*`/`NvNode*`/`NvProfile*` scheduled tasks or the `NvTelemetryContainer` service. The verification PowerShell check treats "no tasks + no service" as `$true` (= disabled = success). For `apply` this is fine (`ok = verified = true`). For `revert`, the logic is `ok = !verified = !true = false` — so revert always fails on modern drivers even though there is truly nothing to restore.

**How to apply:**
- Location: `electron/tweak-executor.js` → `executeNvidiaTelemetry()`
- Early-return block runs only when `action === 'revert'`; runs one extra PS check (`hasComponents`) to distinguish "nothing to restore" from "components exist and are now re-enabled"
- Apply path is unchanged — verified=true (no tasks = disabled = success) works correctly there
