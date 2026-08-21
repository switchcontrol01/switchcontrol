---
name: Network revert verification
description: Durable constraints for Premium expiry reverts of Windows network tweaks.
---

Network Premium expiry reverts must require the executor's post-write verification before reporting success. A successful PowerShell process only proves that the command ran, not that Windows now reports the desired state. Revert actions must clear ownership; they must never be recorded as a new apply. For this app's Premium-owned network feature class, expiry policy is to disable the tweak rather than restore an enabled baseline.

**Why:** A fresh Windows run reported all network items as restored even though the UI still showed settings enabled. The logs showed the command process succeeded, but the prior pipeline did not make verification authoritative and the ownership wrapper treated revert actions as applies.

**How to apply:** On Premium expiry, execute the network disable/revert action for every owned network tweak and require a verified disabled state before clearing ownership. Also clear the renderer's persisted and in-memory network status so a later Premium reactivation cannot resurrect stale Applied badges.