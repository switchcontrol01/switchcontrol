---
name: Desktop OAuth request budgets
description: Routine polling must never spend the request budget required to finish sign-in.
---

Keep desktop polling, provider starts, callbacks, and exchange in independent abuse budgets. Authentication limits must use trusted network identity rather than client-chosen device IDs or poll tokens.

**Why:** A two-second desktop poller exhausted the old shared authentication allowance in about 80 seconds, potentially blocking the browser callback on the same public IP. This is a confirmed code defect, not proof of the cause of any individual production incident.

**How to apply:** Test several minutes of pending polling from simultaneous same-IP attempts followed by callbacks and exchange. Keep counter/code state bounded and retry guidance readable across CORS. Do not broaden proxy trust without verifying the actual hosting proxy chain.
