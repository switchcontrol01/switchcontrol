---
name: First-run language gate
description: The required language choice that precedes the existing first-run welcome and onboarding sequence.
---

The first authenticated session for a genuinely new desktop account must pass through a required language choice before any other first-run surface starts. The server-authoritative `hasInstalledApp` marker decides whether a sequence should begin, while a per-account pending marker preserves an unexpectedly interrupted sequence. Explicitly declining legal consent is different: clear every first-run completion marker, retain the pending gate, fully sign out, and quit so the next launch starts at Login and the next authentication restarts from Language. A saved language choice followed by missing consent/disclaimer markers is the migration signal for interrupted sessions created before the pending marker existed. Cross-portal gate changes need a shared, top-level visual handoff; timers inside separate portals do not create a visible transition.

**Why:** The activity ping can mark an account as installed before legal consent completes. Without a separate pending marker, quitting on terms makes the next cached-session boot mistake the user for a returning user, mount the dashboard, and permit startup mutations or patch notes.

**How to apply:** Start pending only for a server-confirmed new account, clear it after the final required gate, and resume unexpected interruptions before the dashboard. On explicit decline, reset language, consent, disclaimer, welcome, and tour markers; clear persisted auth and Electron cookies before quitting. While pending, suspend automatic premium reverts and hide patch notes, promotions, tours, and other startup overlays. Empty storage alone must not manufacture first-run for a returning account.