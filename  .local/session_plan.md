# Objective
Run an in-depth production-scope security scan across the entire application, prioritizing remotely exploitable issues in the cloud API, auth/admin flows, billing/entitlement handling, and shipped Electron trust boundaries.

# Relevant information
- Production web/API entry point: `server/index.ts` -> `server/routes.ts`.
- Auth surfaces: Google/Discord OAuth sessions plus desktop JWT exchange in `server/auth/google.ts`, `server/auth/discord.ts`, `server/lib/jwt.ts`, and `server/middleware/requireCloudAuth.ts`.
- Admin control plane: `server/routes/admin.ts` guarded by `server/middleware/requireAdmin.ts`.
- Persistence is PostgreSQL-backed via `server/storage.ts` and `shared/schema.ts`.
- The app is multi-user: users, sessions, plans, admin flags, Stripe customer IDs, and audit logs are persisted per user. Any globally shared settings/history state is suspicious and must be treated as production-relevant.
- Production scope includes shipped Electron code (`electron/`) where it materially affects the trust boundary with the cloud API. Dev-only assets, generated build artifacts, and attached reference files are low priority unless directly reachable in production.
- Existing vulnerability directories are currently empty.

# Tasks

### T001: Shared storage and public API authorization
- **Blocked By**: []
- **Files**: `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`
- **Details**:
  - Verify whether settings, tweaks, history, AI scans, and similar persisted data are correctly scoped per user.
  - Identify unauthenticated or weakly protected routes that read or mutate persisted state.
  - Confirm whether any cross-user read/write path is exploitable in production.
- **Acceptance**:
  - Either confirm user scoping is sound or document concrete broken-access-control / unauthorized-tampering findings.

### T002: Auth, OAuth, admin boundary, and CSRF
- **Blocked By**: []
- **Files**: `server/auth/google.ts`, `server/auth/discord.ts`, `server/routes/admin.ts`, `server/middleware/requireAdmin.ts`, `server/middleware/csrf.ts`, `server/lib/jwt.ts`
- **Details**:
  - Review OAuth login and callback flows for open redirects, login CSRF, account confusion, and unsafe session handling.
  - Review admin bootstrap and admin mutation routes for privilege-escalation paths.
  - Check whether cookie-authenticated state-changing routes are protected against CSRF.
- **Acceptance**:
  - Confirm or reject concrete exploit paths for auth confusion, CSRF, and privilege escalation.

### T003: Billing, entitlement, JWT, and webhook integrity
- **Blocked By**: []
- **Files**: `server/routes.ts`, `server/webhookHandlers.ts`, `server/stripeClient.ts`, `server/lib/planUtils.ts`, `server/middleware/requireCloudAuth.ts`, `server/lib/jwt.ts`
- **Details**:
  - Validate Stripe checkout, confirm, and webhook flows.
  - Check that premium access and plan transitions cannot be granted or confused by attacker-controlled inputs.
  - Review JWT signing/verification assumptions and any production fallback secrets.
- **Acceptance**:
  - Document any exploitable entitlement bypass, trust-boundary flaw, or secret-handling weakness with concrete impact.

### T004: Secondary route surface and desktop boundary review
- **Blocked By**: []
- **Files**: `server/routes/`, `electron/main.js`, `electron/preload.js`, `electron/*.js`
- **Details**:
  - Review the remaining mounted route modules for unauthenticated dangerous actions, command execution, SSRF, or sensitive local-system exposure.
  - Review Electron IPC and desktop/cloud handoff code for remotely triggerable trust-boundary issues relevant to shipped production builds.
- **Acceptance**:
  - Confirm whether any additional remotely exploitable route or desktop boundary issue should be reported.
