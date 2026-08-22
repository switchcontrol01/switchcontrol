---
name: Entitlement cache verification boundary
description: Boot entitlement paths distinguish cloud-confirmed data from preserved cached users, with one client wrapper currently collapsing that distinction.
---

`resolveAuthState()` returns `verified:false` on network and 5xx failures, but `refreshEntitlements()` returns the cached user for those failures; callers must not mark that result as cloud-verified merely because a user object exists.

**Why:** A persisted stale free user can otherwise be accepted as a verified downgrade and trigger premium revert while the cloud entitlement was never successfully read.

**How to apply:** Keep explicit cloud `loggedIn:false`/401 separate from unavailable/unknown states, and only update `entitlementsVerified` after a successful `/api/me` response or a deliberate, clearly labeled grace decision.