---
name: PowerShell DWORD overflow guard
description: Unsigned 32-bit registry values overflow to negative numbers in PowerShell unless explicitly cast to uint32.
---

## The problem

PowerShell's default integer type is signed 32-bit (`[int]`). When reading a `REG_DWORD` that stores `0xFFFFFFFF` (4294967295) — a common "disabled" sentinel — PowerShell silently overflows it to `-1`.

This means a `readCommand` like:

```powershell
(Get-ItemProperty ... -Name 'NetworkThrottlingIndex').NetworkThrottlingIndex -eq 4294967295
```

...will **always return `$false`** because the left side is `-1`, not `4294967295`.

The write side was already safe because `psInt()` in `slider-tweak-executor.js` already converts values > 2147483647 to `([uint32]N)`, but the read/verify side had no matching cast.

## Fix pattern

Wrap the registry read in `[uint32]`:

```powershell
# Before (broken)
(Get-ItemProperty -Path '...' -Name 'Foo').Foo -eq 4294967295

# After (fixed)
[uint32](Get-ItemProperty -Path '...' -Name 'Foo').Foo -eq 4294967295
```

## Where to apply

Audit any slider tweak (or toggle tweak `check` command) where the value range includes numbers > 2147483647. In the current registry:

- `NetworkThrottlingIndex` (disabled = 4294967295) — fixed
- `SvcHostSplitThresholdInKB` max is 67108864 — also above int32 max, but all current presets are below it so not hit in practice. Still worth adding `[uint32]` defensively.

## Why this matters

The verification failure cascades into the UI reverting the tweak — the user selects "Disabled (Gaming)", the apply succeeds, but verify says "not applied", so the slider snaps back to default. This looks like a UI bug but is actually a backend type-mismatch.
