---
name: Debloater result semantics
description: Safety rules for Windows Debloater probe, elevation, and verification results.
---

Windows Debloater probes must preserve three states: present, absent, and unknown. A missing item is absent, but a PowerShell/WMI error or partial response is unknown and must never be treated as removable. Removal commands should emit an explicit already-absent marker for no-op AppX, registry, service, and scheduled-task cases; post-write verification remains authoritative, and UAC cancellation must return a failed result with recovery details.

**Why:** Weak or partially configured Windows machines commonly lack optional components and may time out native probes. Collapsing those cases into success or absence can hide failed changes or encourage unsafe retries.

**How to apply:** Keep scan-state normalization and server persistence aligned with this three-state model. Capture elevated command output when no-op classification matters, and count verification-failed results as failures in progress, history, and summaries.