---
name: Windows background-app state
description: Verify the actual Windows setting instead of treating SwitchControl intent markers as proof.
---

The background-app toggle must report success only when Windows' `GlobalUserDisabled` value is set. SwitchControl's own registry markers may preserve user intent, but they cannot prove Windows is still enforcing the setting; use them only as ownership metadata and reapply from the explicit saved target after a verified read shows drift.

**Why:** Windows can clear or normalize the actual setting while the app marker remains, which otherwise leaves the UI green while background access is enabled.

**How to apply:** Read back the Windows policy/value after every write and during owned-target recovery. Treat a missing or reset OS value as drift, not as an applied state.
