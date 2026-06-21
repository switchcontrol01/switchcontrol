---
name: Driver Intelligence design constraints
description: Durable product/architecture rules for the Driver Intelligence premium page — what it must never do and why "partial" is a first-class state.
---

# Driver Intelligence

A premium page (above Settings in the sidebar) that scans system hardware and compares
driver/firmware versions against a server-maintained cloud DB.

## Hard rules (product constraints, not just code)
- **Detect-and-redirect ONLY.** Never auto-install, auto-update, or flash anything
  (especially BIOS). Update actions open the OFFICIAL vendor page/tool only — no
  third-party or search-engine fallback links. If a vendor can't be identified, the
  action button is omitted (returns null), it does NOT fall back to a generic search.
  **Why:** flashing/auto-install is dangerous and a trust/liability boundary.
- **Cloud DB is server-maintained reference data, never live-scraped.** Endpoint
  `/api/driver-intel/*` is intentionally unauthenticated (reference data only); the
  page itself is premium-gated client-side. Client keeps a bundled local DB fallback.

## State machine — "partial" is a cache-hit, not a failure
- Phases: idle → scanning → ready | partial (| error only if everything fails).
- Per-field fallback: any undetectable component degrades to a single "unknown" card;
  it must NEVER blank the page or flip the whole view to an error layout.
- **`partial` must be treated as cached data** (use `hasData(phase)` for the cache
  gate, not `phase === "ready"`). **Why:** unknown fields are common, so gating the
  cache on "ready" alone re-runs the heavy scan on every page revisit.

## Performance
- Scan is LAZY — only on page mount / explicit Rescan; never at app startup.
- Animate heavily DURING the scan, then settle to a calm static page. **Why:** the
  app's value prop is not competing with the user's game for GPU/CPU.

## Entitlement
- Free → full-page premium overlay. Trial (`status === "trial_active"`) → READ-ONLY:
  can scan, but action/AI buttons are disabled and route to the upgrade modal.
