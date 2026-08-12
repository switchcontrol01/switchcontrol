---
name: Service startup type — AutomaticDelayedStart
description: Set-Service -StartupType AutomaticDelayedStart is invalid in PS7+; use registry keys instead
---

# Service Startup Type: AutomaticDelayedStart

## Rule
Never use `Set-Service -StartupType AutomaticDelayedStart`. This value is not a member of the `ServiceStartMode` enum in PS7+ and throws a parameter-binding error at runtime.

**Why:** PS7 tightened enum validation. `AutomaticDelayedStart` is a Windows SCM concept stored at the registry level, not exposed as a `Set-Service` startup type. Valid `-StartupType` values: `Boot, System, Automatic, Manual, Disabled`.

## How to apply
To restore a service to AutomaticDelayedStart, write the registry keys directly:

```powershell
$rk = 'HKLM:\SYSTEM\CurrentControlSet\Services\<ServiceName>'
Set-ItemProperty -Path $rk -Name Start          -Value 2 -Type DWord -Force  # 2 = Automatic
Set-ItemProperty -Path $rk -Name DelayedAutoStart -Value 1 -Type DWord -Force
Start-Service <ServiceName> -EA SilentlyContinue
```

This is what the SCM reads on boot — it is the correct and portable approach.

**Affected tweak:** `win-search-index` revert in `electron/tweak-executor.js` (line ~850) — already fixed.
