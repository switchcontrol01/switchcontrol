---
name: Windows msinfo32 popup
description: Windows behavior to avoid when collecting system intelligence
---

Do not launch `msinfo32.exe` from background system-intelligence collection, even with a hidden-window option. Windows can still show its System Information progress dialog while the report is generated.

**Why:** The report process produced a visible popup on every SwitchControl load and was unnecessary where direct registry probes provide the needed signal.

**How to apply:** Prefer direct WMI, registry, or other non-UI probes for firmware and security fields. If a report executable is unavoidable, treat hidden-window behavior as unreliable and isolate it behind explicit user action.