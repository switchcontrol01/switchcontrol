# Threat Model

## Project Overview

SwitchControl is a multi-surface product with a public website, a cloud Express API, PostgreSQL-backed user/account data, Stripe billing, Google/Discord OAuth login, and a packaged Electron desktop app that talks to the cloud API with JWTs. Production-relevant source lives primarily in `server/`, `shared/`, `client/src/`, and the shipped Electron app under `electron/`; build artifacts (`dist/`, `build/`) are derived outputs, and `attached_assets/` plus most docs are not production attack surface.

The production scan should assume `NODE_ENV=production`, TLS termination is handled by the platform, mockup sandboxes are not deployed, and dev-only tooling or local preview paths are out of scope unless a code path is demonstrably reachable in production.

## Assets

- **User accounts and sessions** — OAuth-backed user identities, session cookies, desktop JWTs, and admin status. Compromise allows impersonation and privileged actions.
- **Billing and entitlement data** — Stripe customer IDs, premium/trial plan state, checkout session handling, and device-binding state. Abuse can grant unauthorized premium access or break account ownership.
- **Administrative control plane** — admin APIs for user search, plan changes, admin-role changes, deletions, and audit logs. Compromise yields full application control.
- **User-linked settings and history data** — settings, tweak state, history entries, AI scan results, and onboarding flags. These should be scoped per user and protected from other users.
- **Application secrets** — `SESSION_SECRET`, `JWT_SECRET`, OAuth client secrets, Stripe keys, OpenAI key, installer download URL, admin setup key. Exposure enables impersonation or third-party abuse.
- **Desktop trust state** — Electron device identifiers, local stored auth tokens, IPC-exposed privileged operations, and cloud-bound telemetry. Compromise affects premium enforcement and desktop-to-cloud trust.

## Trust Boundaries

- **Browser ↔ Express API** — all website requests originate from an untrusted browser and must be authenticated, authorized, and CSRF-safe where cookie auth is accepted.
- **Electron app ↔ Express API** — the desktop app uses bearer JWTs and device IDs; the cloud API must treat Electron-provided headers and local state as attacker-controlled unless cryptographically verified.
- **API ↔ PostgreSQL** — the server has broad database access; broken authorization or unsafe query patterns expose all tenant data.
- **API ↔ Stripe / OAuth / OpenAI** — third-party callbacks and outbound API use cross trust boundaries and require origin/authenticity checks plus careful secret handling.
- **Public ↔ Authenticated ↔ Admin** — the app contains public website routes, logged-in user routes, premium-only routes, and admin-only routes. These boundaries must be enforced server-side, not in the client.
- **Web cloud ↔ Desktop-local privileged actions** — Electron code can perform local system actions and stores secrets/tokens on a user device; cloud endpoints must not assume local actions imply trusted identity.

## Scan Anchors

- **Production entry points**: `server/index.ts`, `server/routes.ts`, `server/auth/google.ts`, `server/auth/discord.ts`, `server/routes/admin.ts`, `server/webhookHandlers.ts`, `electron/main.js`, `electron/preload.js`.
- **Highest-risk areas**: auth/session/JWT handling, admin bootstrap and admin mutation routes, Stripe checkout and webhook flows, shared storage in `server/storage.ts`, and any route reachable without auth that reads or mutates persisted state.
- **Surface split**: public website/login/download routes, authenticated user APIs under `/api/*`, premium-gated cloud APIs (`/api/ai`, `/api/bios`), and admin APIs under `/api/admin/*`.
- **Usually dev-only / low-priority**: `attached_assets/`, build scripts, generated output in `dist/`, and docs unless they influence runtime or secrets.

## Threat Categories

### Spoofing

The application supports both browser sessions and Electron JWTs. The server must only accept sessions signed with strong production secrets, must validate every bearer token before using its claims, and must protect OAuth flows against login CSRF or other state-confusion attacks. Device-binding logic must not let attackers spoof premium ownership by presenting arbitrary headers.

### Tampering

The client is untrusted. Any route that changes settings, history, plans, entitlements, onboarding flags, or desktop/cloud trust state must validate input and enforce user ownership or admin authorization on the server. Cookie-authenticated state-changing routes must resist CSRF; desktop-only actions must not trust client-provided flags without server-side checks.

### Information Disclosure

User-specific settings, history, AI scan outputs, account metadata, premium state, admin data, and third-party identifiers must be scoped to the authenticated principal. Logs and API errors must avoid leaking secrets, tokens, or unnecessary personal data. Public routes should not disclose internal infrastructure state beyond what is intentionally exposed.

### Denial of Service

Public and auth-adjacent endpoints must use reasonable rate limiting and bounded resource usage. AI, telemetry, network-diagnostic, and Stripe/OAuth handlers should avoid attacker-triggered expensive work without guardrails, and external-service calls should fail safely with timeouts and bounded retries.

### Elevation of Privilege

Only trusted admins should be able to reach admin functionality, and premium access must only follow verified billing or explicit trusted admin action. The server must prevent broken access control, IDOR, shared-state cross-user access, bootstrap races, and missing authorization on routes that affect user plans, device locks, or account lifecycle.