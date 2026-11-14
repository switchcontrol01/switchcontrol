---
name: Defender Tamper Protection detection
description: Read the actual Windows Defender Tamper Protection state without inferring it from policy metadata.
---

Use Defender's `IsTamperProtected` boolean as the primary state. `TamperProtectionSource` describes where the setting came from; it is not the on/off value. Keep a registry fallback for Windows/provider versions that do not expose the boolean, and preserve unknown when neither source can verify the state. In the UI, show green only for an explicit `false`; never treat an unavailable result as off.

**Why:** the prior probe interpreted a nonzero policy-source field as Tamper Protection being enabled, which could misreport the device's actual state.

**How to apply:** when changing Windows security status probes or dependent warnings, verify the state field itself and keep `true`, `false`, and unknown as distinct outcomes.
