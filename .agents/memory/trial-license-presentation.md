---
name: Trial license presentation
description: Product requirement for displaying trial access in Settings and license management.
---

Active trials must appear in blue as **Trial (Limited)** in the Settings account license summary and its Manage dialog. Both surfaces must reflect current entitlement changes and show the remaining trial time; Manage must also include the expiry information. Trial access must never be described as a purchased lifetime license.

**Why:** The user explicitly required this distinction after a trial countdown appeared beside a Settings card incorrectly claiming Premium (Lifetime). Active trials have premium feature access, but that is not lifetime ownership.

**How to apply:** Give canonical trial state precedence over a generic premium-access flag. Keep paid Premium separate, and label cached information honestly when live verification is unavailable.
