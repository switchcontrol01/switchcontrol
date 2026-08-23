---
name: Windows msinfo32 popup
description: Windows behavior to avoid when collecting system intelligence
---

Do not launch `msinfo32.exe` on normal startup, even with a hidden-window option. The only permitted exception is the persistent, non-blocking enrichment run every 15 launches, whose parsed report is cached and used only as a fallback.

**Why:** The report process produced a visible popup on every SwitchControl load and was unnecessary where direct registry probes provide the needed signal; occasional caching preserves extra firmware fields without recurring startup disruption.

**How to apply:** Prefer direct WMI, registry, or other non-UI probes for firmware and security fields. The occasional report must run after the fast profile, use a timeout, clean up its temporary file, and never overwrite a non-null direct value.