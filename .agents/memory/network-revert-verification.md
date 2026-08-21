---
name: Network revert verification
description: Durable constraints for Premium expiry reverts of Windows network tweaks.
---

Network Premium expiry reverts must require the executor's post-write verification before reporting success. A successful PowerShell process only proves that the command ran, not that Windows now reports the desired state. Revert actions must clear ownership; they must never be recorded as a new apply.

**Why:** A fresh Windows run reported all network items as restored even though the UI still showed settings enabled. The logs showed the command process succeeded, but the prior pipeline did not make verification authoritative and the ownership wrapper treated revert actions as applies.

**How to apply:** Preserve the user's true baseline when it was captured before the first app touch. If the baseline was already enabled, restoring it to enabled is correct; do not label that as a Premium re-apply. For settings with an off baseline, require a verified disabled state before clearing ownership.