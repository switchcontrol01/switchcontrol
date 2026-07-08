---
name: PowerShell ForEach-Object scoping
description: Why a status-check script can silently always return false even though the underlying apply succeeded.
---

`ForEach-Object { ... }` runs its scriptblock in a child scope. An assignment
like `$found = $true` inside that block does **not** propagate back to the
caller's `$found` variable — the outer variable is unaffected, so a pattern
like:

```powershell
$found = $false
Get-Item ... | ForEach-Object { if (...) { $found = $true } }
$found
```

always evaluates to `$false`, even when the condition inside the loop was
true.

**Why:** PowerShell scriptblocks passed to cmdlets (`ForEach-Object`,
`Where-Object`, etc.) execute in a new scope by default; only `foreach (...) { }`
(the language keyword) shares the enclosing scope.

**How to apply:** When a "check status" / "verify applied" script relies on a
flag set inside `ForEach-Object`, prefix the variable with `$script:` (or
`$global:`/use `Invoke-Command` with `-NoNewScope`, or switch to a plain
`foreach` loop) so the assignment is visible after the pipeline. Symptom to
watch for: an apply step reports success but the paired check step always
reports "no state change" — that mismatch is a strong signal of this bug.
Audit every PowerShell script in the tweak executors that uses this
`$flag = $false; ... | ForEach-Object { $flag = $true }; $flag` pattern, not
just the one instance that was reported.
