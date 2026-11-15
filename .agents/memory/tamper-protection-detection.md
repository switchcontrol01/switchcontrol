---
name: Defender Tamper Protection detection
description: Read the actual Windows Defender Tamper Protection state without inferring it from policy metadata.
---

Use Defender's `IsTamperProtected` boolean as the primary state. `TamperProtectionSource` describes where the setting came from; it is not the on/off value. Never cast a possible string with PowerShell `[bool]`: `[bool]"False"` is true because the string is non-empty. Parse recognized true/false values explicitly, keep unknown for unrecognized values, and retain a registry fallback when the Defender property is unavailable. In the UI, show green only for an explicit `false`; never treat an unavailable result as off.

**Why:** both policy-source inference and PowerShell's truthiness for the non-empty string `"False"` can report protection as enabled when Windows Security shows it off.

**How to apply:** when changing Windows security status probes or dependent warnings, verify the state field itself, explicitly normalize strings/numbers, and keep `true`, `false`, and unknown as distinct outcomes.
