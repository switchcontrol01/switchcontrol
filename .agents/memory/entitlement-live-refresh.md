---
name: Entitlement live refresh
description: How SwitchControl's desktop app picks up admin-side plan changes (or doesn't) while running.
---

Server-side plan writes (admin panel PATCH/POST routes in `server/routes/admin.ts`,
`storage.setUserPlan`) commit correctly and immediately — there is no server
bug in plan propagation. The gap is entirely client-side: the running desktop
app only calls `resolveAuthState()` / fetches `/api/me` **once, at boot**
(the `checkAuth` effect in `App.tsx`). Nothing re-fetches entitlements while
the app stays open.

A hook (`useEntitlementRefresh`) existed that re-fetches on mount and on
focus/visibility change, but it was never imported/called anywhere in the
app — fully dead code. Grepping for a hook's *definition* is not enough to
confirm a mechanism is active; always grep for call sites too.

**Why:** An overlay-style app like SwitchControl is often left focused/visible
for long stretches (pinned during gameplay), so focus/visibility events alone
can go a long time without firing. Admin changes to a user's plan (trial/free/
premium) would then only become visible after the user fully quit and
relaunched the app ("End Task").

**How to apply:** Live entitlement propagation needs two things wired into
the top-level app component: (1) the focus/visibility-triggered refresh hook,
and (2) a periodic safety-net poll (e.g. `useVisibilityInterval` every ~45s)
so changes land even if focus never changes. Don't rely on the admin panel's
own optimistic auth-store patch (`handlePlanUpdated` in `Admin.tsx`) — that
only updates the *admin's own* browser session if they happen to be editing
their own account, not the target user's separate running app.
