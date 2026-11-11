---
name: Retired adapter tuning policy
description: Preserve Windows configuration and audit evidence when retiring NIC Tuning.
---

NIC Tuning retirement is not permission to reset adapters or delete their recovery history. Legacy ownership and history must remain read-only and must not cause expiry retries or writes through another screen. Network Tweaks, diagnostics, telemetry, and read-only hardware inventory remain supported.

**Why:** The user explicitly required complete feature removal without silently changing existing Windows adapter settings or destroying saved baselines.

**How to apply:** Keep legacy adapter controls non-actionable. Old RSS badges could be inferred from NIC state, so a cached badge alone cannot authorize a Network Tweaks expiry write; genuine supported native network ownership remains authoritative.
