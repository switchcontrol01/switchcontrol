---
name: First-run language gate
description: The required language choice that precedes the existing first-run welcome and onboarding sequence.
---

The first authenticated session for a genuinely new account must pass through a required language choice before any other first-run surface starts. The choice is stored per account, including an explicit English choice, and the language modal owns its exit animation before handing off to welcome.

**Why:** Language selection must not be lost in the gap between login confirmation and onboarding, and returning users must never be interrupted by a first-run prompt.

**How to apply:** Keep the gate behind confirmed authentication and the per-account completion marker. Include it in shared overlay arbitration, and do not let patch notes, promotional dialogs, tours, trial dialogs, disclaimer, or onboarding bypass it.