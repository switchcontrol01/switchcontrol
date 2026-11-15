---
name: Defender Tamper Protection detection
description: Read the actual Windows Defender Tamper Protection state without inferring it from policy metadata.
---

Use Defender's `IsTamperProtected` boolean as the primary state. `TamperProtectionSource` describes where the setting came from; it is not the on/off value. Never cast a possible string with PowerShell `[bool]`: `[bool]"False"` is true because the string is non-empty. If the Defender property is unavailable, map only documented registry states explicitly: `0`/`4` off and `1`/`5` on; other values remain unknown. Never treat every nonzero registry value as enabled. In the UI, show green only for an explicit `false`; never treat an unavailable result as off.

**Why:** policy-source inference, PowerShell string truthiness, and treating the registry's `4` (off) state as generic nonzero can report protection as enabled when Windows Security shows it off.

**How to apply:** when changing Windows security status probes or dependent warnings, prefer the Defender state field, explicitly normalize registry values, and keep `true`, `false`, and unknown as distinct outcomes.
