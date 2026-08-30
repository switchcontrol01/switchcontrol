---
name: OAuth entitlement rehydration
description: Fresh Electron profiles can authenticate after boot has already consumed the entitlement-attempt flag.
---

After a clean or deleted Electron AppData profile, the initial unauthenticated boot may mark entitlement hydration as attempted before OAuth completes. A successful OAuth exchange must reopen the authenticated hydration gate, and every later verified `/api/me` refresh must promote the App-level verification state as well as the persisted grace snapshot.

**Why:** Otherwise the server can return `isPremium=true` while the auth context remains unverified/free, producing contradictory Premium badges and locked feature gates.

**How to apply:** Treat local AppData and grace data as caches only. On OAuth success, reset the per-session entitlement gate; on authoritative refresh success, update both reactive UI verification and the grace cache.