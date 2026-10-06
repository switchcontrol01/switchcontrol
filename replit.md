# SwitchControl

## Overview

SwitchControl is a web-based gaming optimization dashboard. It offers a UI-first experience for Windows system tweaks, power plan management, network optimization, and system monitoring. The application uses a dark theme with purple/pink accents. All optimization actions are simulated and do not make actual Windows system changes in the web version. The project also includes a packaged Electron desktop app with real system integration.

## Hosting Rule

- **Permanent hosting platform:** Railway.
- The app and project must remain hosted on Railway, never Replit.
- Replit is used only as a development workspace/editor; do not treat Replit's managed database or deployment as the production source of truth.
- Railway is the only PostgreSQL provider. Use Railway's private `DATABASE_URL` from services inside Railway and Railway's public `DATABASE_PUBLIC_URL` from external tools/workspaces; both refer to the Railway database.
- Never store database connection strings in tracked files or Markdown. The server currently resolves `RAILWAY_DATABASE_URL` first, then `DATABASE_URL`; it does not read `DATABASE_PUBLIC_URL` directly. For an external app process, set `RAILWAY_DATABASE_URL` to the public Railway endpoint until runtime selection is updated.

## User Preferences

Preferred communication style: Simple, everyday language.

## Build Commands

- **Electron installer (Windows)**: `npm run electron:build` — NOT `npm run dist:win`
- **Frontend (web)**: `npm run build` then site is served from `dist/`
- **After any frontend change, rebuild with `npm run build` before deploying.**

## System Architecture

### Core Technologies
- **Frontend**: React + TypeScript, Wouter routing, Tailwind CSS v4 (dark theme), shadcn/ui, Zustand (client state), TanStack Query (server state), Framer Motion (animations), Vite.
- **Backend**: Express.js + TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Replit Auth (OpenID Connect) and Google/Discord OAuth.
- **Desktop**: Electron with `systeminformation` for live telemetry, PowerShell for registry tweaks.

### Data Models
Key models: `users` (auth + plan/trial), `sessions`, `userSettings`, `appliedTweaks`, `historyEntries`, `aiScans`, `adminLogs`.

### Application Structure
- `client/src/` — Frontend components, hooks, utilities, pages
- `server/` — Express entry, routes, database
- `shared/` — Drizzle schema, auth models, tweak-tier logic
- `electron/` — Desktop app (main, preload, renderer, executors)

### Key Subsystems

**Premium & Billing**
- Stripe checkout + webhook handlers. Plan resolution in `server/lib/planUtils.ts`.
- Device lock (desktop only): `x-device-id` header binding, first-bind, enforced on premium-gated routes.
- Free trial with activation animation and guided tour.

**Admin**
- `/api/admin/*` routes protected by `requireAdmin` middleware.
- Admin panel at `/admin` with user CRUD, plan management, audit logs.
- One-time self-service bootstrap (`POST /api/admin/bootstrap`).

**Live Telemetry**
- `server/lib/telemetry.ts` polls `systeminformation` every 1.5s.
- WebSocket broadcast at `/ws/telemetry`.
- Connection-aware polling: scheduler idles when no clients connected.

**Tweaks**
- Canonical data lives in `client/src/lib/tweak-registry.ts`.
- `shared/tweak-tiers.ts` is the single source of truth for premium/free gating.
- 7 slider tweaks (registry values) + toggle tweaks. `FREE_EXCEPTION_IDS` for no-premium-gate tweaks.
- Electron: `tweak-executor.js` for registry, `slider-tweak-executor.js` for sliders, `nic-executor.js` for NIC adapter tuning.
- Per-action UAC elevation via `runElevated()` for admin tweaks.

**AI Advisor**
- Server endpoints: `POST /api/ai/advice` (structured JSON), `POST /api/ai/chat` (conversational).
- OpenAI `gpt-4o-mini` default. Rate-limited: 3/5min + 15/hr.

**BIOS Advisor**
- Firmware behavior analysis via `client/src/lib/firmware-analyzer.ts`.
- Detection statuses: User Confirmed / Detected / Inferred / Unknown.
- Photo-scan endpoint uses OpenAI Vision.

### Design Patterns

**Token Files (single source of truth)**
- `client/src/lib/themeTokens.ts` — brand/premium color literals
- `client/src/lib/motionTokens.ts` — barrel re-export of all animation primitives
- `client/src/lib/motion.tsx` — backing implementation; never import `framer-motion` directly

**Overlay System**
- `client/src/lib/overlaySystem.ts` — barrel export
- `client/src/components/ui/PremiumOverlayCard.tsx` — shared crown-glow card
- `premium-page-overlay.tsx` / `premium-lock-overlay.tsx` — page/card/header gates

### Authentication & Security

**JWT Cache**
- `server/lib/jwt.ts`: `verifyJwt()` uses a bounded LRU Map (max 5000) keyed by token string.
- Cache hits honor `exp` and a 60s re-verify TTL. Stores ONLY signature/sub validity.
- `invalidateJwt(token)` called on logout to drop from cache.
- `clearJwtCache()` for secret rotation.

**Logout**
- Web: `POST /auth/logout` (session + cookie clear)
- Replit: `GET /api/logout` (OIDC end-session redirect)
- Desktop: `client/src/lib/authClient.ts` → `performFullLogout()` (bump generation, clear cookies, clear store)

**Server Security**
- `helmet` middleware: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- CORS: strict production allowlist (`switchcontrol.org`). Dev adds localhost ports.
- JWT: HS256 pinning, issuer validation, 32-char minimum secret in production.
- Rate limiting: auth 100/15min, `/api/me` 60/min, AI 3/5min + 15/hr.
- Production 500+ errors return generic messages; stack traces logged server-side only.
- Structured logging: UUID requestId, ISO timestamp, recursive key-based redaction.
- Electron: DevTools disabled in production, `contextIsolation: true`, `nodeIntegration: false`, input validation on IPC handlers.
- Post-build secret scan: `node scripts/security-scan.cjs`.

### Download / Installer
- `shared/downloadConfig.ts`: single source of truth for installer metadata.
- Server: `GET /downloads/:fileName` → 302 redirect to `INSTALLER_DOWNLOAD_URL`.
- Navbar + download page CTAs use `installerUrl(source)` with `?source=` tracking.

### Environment Variables
- `JWT_SECRET` / `SESSION_SECRET` — JWT signing
- `OPENAI_API_KEY` — AI advisor
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — billing
- `INSTALLER_DOWNLOAD_URL` — hosted `.exe` for download redirect
- `ADMIN_SETUP_KEY` — optional admin bootstrap override

### External Dependencies
- PostgreSQL, Drizzle Kit, Recharts, date-fns, Zod, Framer Motion, OpenAI SDK, systeminformation, openid-client.

### Replit Integrations
- `@replit/vite-plugin-runtime-error-modal`
- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`
