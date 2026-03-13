# SwitchControl

## Overview

SwitchControl is a web-based gaming optimization dashboard prototype. It offers a UI-first experience for simulated Windows system tweaks, power plan management, network optimization, and system monitoring. The application uses a dark theme with purple/pink accents, aiming for a clean gamer aesthetic. All optimization actions within this prototype are simulated and do not make actual Windows system changes. The project vision is to provide a modern, polished tool for system enhancement, with potential for market expansion within the gaming community.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React with TypeScript, Wouter for routing, Tailwind CSS for styling (v4, dark theme), shadcn/ui for components, Zustand for client-side state, TanStack Query for server state, Framer Motion for animations, and Vite for building.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM for schema and interactions.
- **Authentication**: Replit Auth (OpenID Connect) for user authentication.

### Data Models
Key data models include `userSettings` (preferences, tier), `appliedTweaks` (enabled tweaks), `historyEntries` (action log), `aiScans` (AI advisor results), and `users/sessions` (Replit Auth data).

### Application Structure
The application is structured into `client/src` (frontend components, hooks, utilities, pages), `server/` (Express entry, routes, database), and `shared/` (Drizzle schema, auth models).

### UI/UX Design
- **WebsiteShell**: Provides a consistent layout with three variants (full, inner, minimal). Accepts `bgVariant` prop ("landing" | "pricing" | "download" | "auth" | "legal" | "success") to select variant-specific layered backgrounds. Always-on glass header with `bg-white/[0.06] backdrop-blur-xl border-white/[0.12]`, top sheen highlight, bright nav links. Base color `#040508`. Shared footer. All 8 website routes use this shell.
- **WebsiteBackground**: Cinematic multi-layer background system (`client/src/components/website/WebsiteBackground.tsx`) with variant-based configuration. Layers: near-black base → vignette → **brand background images** (hero-backdrop, circuit-tech, perf-dashboard, hardware-detail, network-flow in `client/src/assets/bg/`) with `mix-blend-mode: screen` at very low opacity (0.02–0.04), heavy blur (8px), contrast(1.2), slight rotation (-3deg) for invisible-until-you-squint texture → **BlueprintImageOverlay** (landing only — 3 blueprint images in `client/public/assets/blueprints/`, positioned as atmospheric overlays with blur 5-8px, screen blend, opacity 0.05-0.08, slow drift keyframes) → **sun streak beams** (3 diagonal CSS light beams from top-left with drift animations, high intensity white 0.22-0.30 / purple 0.10-0.20, scroll-reactive fade) → **godlike top-left spotlight** (bright radial-gradient with white/purple core at 0.40/0.30) → secondary rim lights → perspective grid → technical SVG overlays (PCB traces, node graphs, frametime waveforms, topo lines, packet routes) with CSS keyframe drift animations → glow hotspots → hardware silhouettes → **floating particles** (18 CSS dots, 1-3px, keyframe float) → mouse-follow spotlight → fractal noise. Parallax on scroll moves layers at different rates. Sun streaks fade with `max(0.2, 1 - scrollY/1200)`. Hero light sweep ultra-subtle (0.012 white max, wide diffuse band).
- **GlassPanel**: A versatile glass-effect component with different material variants (default, elevated, matte), optional glow accents, hover effects, and **dynamic mouse-follow highlight** (radial gradient overlay that tracks cursor position inside the card, desktop only).
- **GlowButton**: Primary call-to-action button with a glow rim and micro-animations. Variants: primary, cyan. Sizes: default, sm, lg.
- **GhostButton**: Secondary CTA with minimal border styling.
- **SectionHeader**: Consistent title + subtitle + optional `titleAccent` (gradient accent text) + optional pill badge.
- **SectionDivider**: Horizontal gradient divider with optional `glow` prop.
- **SectionGlow**: Ambient glow bands between sections for depth transitions — radial gradients in purple, cyan, or mixed.
- **Landing Hero**: Centered layout with bold typography (font-semibold headings, font-black "Fix it." accent with `from-cyan-300 via-purple-300 to-pink-300` gradient). Pill: "Engineering your PC for a competitive advantage." **Static tilt** (`perspective(1200px) rotateX(2deg)`, no mouse tracking). **Headline light sweep** (subtle CSS keyframe skewed gradient band every ~8s, low opacity 0.06). App mockup with **animated bars** (fill on scroll via IntersectionObserver), **counting numbers**, colored window dots, **breathing tweak bar pulse**, cyan under-glow, float animation, and glass reflection sweep. Three-column feature strip. No scroll indicator. **Momentum scroll** (desktop-only wheel velocity coast with 0.92 decay via `useMomentumScroll` hook).
- **HeroBackground**: Gradient glow + two subtle animated blobs + noise grain. No SVG waves, no particles, no contour lines.
- **Typography Pattern**: Bold/heavy weights (font-semibold for headings, font-extrabold/font-black for section titles and emphasis, font-medium for body) used across all website pages. No thin/light weights.
- **FAQ**: Elevated glass panel with inner noise texture, hover expand + lift animation on items. Mouse-follow highlight on container. Background pattern visible through translucent glass.
- **Modals**: A shared `GlassModalLayout` component provides a consistent visual style (dark translucent background, blurred border) and behavior (escape handling, backdrop close, scroll lock) for various interactive modals (e.g., Memory Cleaner, CPU Cores).
- **Window Controls**: Rounded 28×28px buttons with 8px border-radius, spaced 6px apart with 12px right padding. Subtle hover states: white/6% bg for minimize/maximize, red/15% bg with red text for close. Scale-down on active. 38px transparent titlebar with minimal border. Custom SVG icons (thin line style).
- **Global Text Selection**: `user-select: none` is applied globally on `.app-root` for a premium feel, with exceptions for input fields, textareas, contenteditable, and `.select-text` class.
- **Glass Consistency**: All modals use unified glass tokens: `bg-[#0c0c14]/80 backdrop-blur-2xl border-white/[0.08] rounded-2xl` with premium shadow and inset light edge. GlassCard uses `bg-white/[0.03] backdrop-blur-xl` with subtle inset highlight.
- **App Shell**: Sealed desktop shell via `.app-root { position: fixed; inset: 0 }`. Scrollbars completely hidden (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`). No horizontal overflow. `app-content` uses `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`.
- **Discord URL**: Centralized in `client/src/config/socialLinks.ts` — all components reference `SOCIAL_LINKS.discord`.
- **Telemetry IPC**: Preload exposes `system.getSpecs()`, `telemetry.getLive()`, `telemetry.getGpu()`, etc. Main process registers matching handlers. Key aliases: `system:getSpecs` → `loadSystemSpecs()`, `telemetry:getLive` → live CPU/RAM/temp data. Frontend components normalize IPC response fields (e.g. `cpuUsage` → `cpuDisplay`, `disks[]` → flat `DiskData`).
- **Tour System**: State-machine-driven (`useReducer`) with choreographed phases: `idle → dimming → navigating → scrolling → spotlighting → presenting → fading_out → done`. Single source of truth controls route transitions, sidebar highlighting (`[data-tour-highlight]` attribute), scroll positioning, and tooltip display. Steps support `sidebarHighlight` field.
- **Dashboard Card Hierarchy**: Top row (Activity Monitor) uses `StatCard` → `GlassCard`. Bottom row (System Health, AI Advisor, BIOS Score) upgraded to `GlassCard` with colored corner glows and consistent padding layout.

### Key Features
- **Dashboard**: Displays system stats, simulates RAM clearing, initiates AI advisor scans, and shows live telemetry graphs (CPU, RAM).
- **Tweaks**: Offers categorized, searchable system optimization toggles with informational modals.
- **Network Tweaks**: Provides simulated optimizations for SMB, TCP/IP, UDP, DNS, and security settings.
- **Power Plan**: Allows selection and customization of power profiles.
- **History**: Logs simulated actions with JSON export.
- **Settings**: Manages account preferences and app configuration.

### AI Advisor System
Two server-side OpenAI endpoints in `server/routes/ai.ts`:
1. **`POST /api/ai/advice`**: Structured one-shot analysis. Takes system specs, telemetry, goal, game, and tweak state — returns JSON with `userState`, `readinessScore`, findings, actions, warnings, follow-ups. Used by legacy flows.
2. **`POST /api/ai/chat`**: Multi-turn conversational endpoint. Takes `messages[]` (role/content) + `context` (system specs, tweaks, telemetry) — returns assistant message. 10-message context window, 800 max tokens, markdown formatting.

Uses `gpt-4o-mini` by default (configurable via `AI_MODEL` env var). Hardened rate limiting: 3 requests/5min + 15/hour. SHA-256 caching on advice endpoint. API key in Replit Secrets (`OPENAI_API_KEY`).

**Client** (`client/src/pages/AiAdvisor.tsx`): Chat-based interface with auto-detected system specs (from store telemetry), quick action buttons (Optimize FPS, Reduce Latency, Fix Stuttering, Network Ping), markdown-rendered responses, spec chips header showing detected hardware, and new-chat reset.

### Local Rule Engine (Dashboard AI)
A fully local, deterministic rule engine evaluates system and application signals against a bundled ruleset (`bundled.ruleset.json`). It provides recommendations (critical, recommended, informational) and can trigger app-tweak fixes. The advisor is read-only and does not modify core application state.

### Dashboard Bottom Grid
Three-column layout: System Health card, AI Advisor summary widget (links to `/ai-advisor`), BIOS Score summary card (links to `/bios-advisor`). AI Advisor summary shows last scan score if available, otherwise a CTA. BIOS Score summary shows competitive readiness score, latency/frametime/stability breakdown, and optimization level badge.

### BIOS Advisor — Firmware Behavior Analysis Engine
Premium-only BIOS firmware analysis page at `/bios-advisor` (`client/src/pages/BiosAdvisor.tsx`). Real firmware behavior analysis via `client/src/lib/firmware-analyzer.ts` that detects XMP/EXPO, SMT, PBO, C-States, ReBAR, FCLK, CPPC from hardware telemetry data. Data model in `client/src/lib/bios-advisor-data.ts` with 25+ BIOS settings, each with category, impact, risk, motherboard paths, detection status, and latency/frametime/stability scores.

**Detection Statuses**: User Confirmed (1.0 confidence) → Detected (1.0) → Inferred (0.6) → Unknown (0.2). Confidence multipliers applied to all scoring functions.

**Firmware Analyzer** (`client/src/lib/firmware-analyzer.ts`): `buildTelemetryFromStore()` creates `HardwareTelemetry` from store stats for web mode; `collectElectronTelemetry()` uses Electron IPC (`getHardwareTelemetry` → `getEnhanced` → `getSpecs` fallback chain) for desktop mode. `analyzeFirmware()` runs per-setting detection rules against telemetry — including VCore voltage analysis, thermal throttling detection, boost limit inference, and power-based C-state inference — producing `FirmwareDetection[]` with `{ settingId, status, confidence, reason, detectedValue }`. Scan tracks telemetry hash to show "No detectable changes" if unchanged.

**LibreHardwareMonitor Integration**: Electron's `parseLhmData()` in `electron/main.js` extracts CPU package power, VCore voltage, max CPU core clock, thermal throttling flag (95°C+ threshold), and GPU power from LHM's web API (port 8085). The `telemetry:getHardwareTelemetry` IPC handler merges LHM data with `systeminformation` specs and memory layout for a complete telemetry picture.

**BIOS Photo Upload**: Server endpoint `POST /api/bios/photo-scan` (`server/routes/bios.ts`) uses OpenAI Vision (gpt-4o, `detail: "high"`) to extract settings from BIOS screenshots. Rate limited 5 req/5min. Results marked as "User Confirmed" and merged into firmware detections. JSON body limit set to 12MB for base64 images.

**AI Firmware Explanation**: Server endpoint `POST /api/bios/explain` (`server/routes/bios.ts`) uses gpt-4o-mini to generate hardware-specific AI explanations of firmware state, referencing actual CPU/GPU/RAM and detected settings with confidence levels.

**UI Features**: Confidence % badges per setting, detection label badges (User Confirmed/Detected/Inferred/Unknown), category score breakdowns (driven by analyzed settings, not static data), ranked opportunities with score gain/difficulty/risk, optimization level labels, expandable setting cards with pros/cons/BIOS paths. No auto-apply — all changes are informational and manual only.

### Unified API Layer
`client/src/lib/api.ts` provides `apiFetch`, `apiPost`, `apiGet` helpers with async base URL resolution. In packaged Electron (`file://`), `resolveApiBase()` polls `electronAPI.getBackendPort()` IPC with retry loop (200ms intervals, 12s timeout) until the embedded backend reports a real port — no hardcoded fallback to 5000, no permanent cache of a bad value. Throws hard error if backend never starts. Promise deduplication prevents multiple concurrent resolution attempts. On web, uses relative `/api`. `apiFetch` and `apiPost` accept `signal?: AbortSignal` for real request cancellation. `ensureCsrfToken()` throws on failure instead of silently returning empty string. Includes `x-device-id` header injection, `ApiError` class, `getUserFriendlyError()`. AI Advisor and BIOS Advisor use these exclusively — no raw `fetch()` calls.

### Electron Desktop App
The Electron app provides a unified `window.electronAPI` interface via `preload.js` for interacting with native system features. It uses the `systeminformation` package for real hardware data (CPU, GPU, RAM), offers native tweak execution (via `tweak-executor.js`), and includes a native Rust-based RAM cleaner.

**Embedded Backend** (`electron/backend-launcher.js`): In packaged mode, `main.js` forks the bundled `dist/index.cjs` server on a dynamically-selected free port (no fixed port 5000), polls `/api/health` for HTTP 200 with `{"status":"ok"}` body (strict readiness check), and exposes the actual port via `electronAPI.getBackendPort()` / `electronAPI.isBackendReady()` IPC. IPC handlers registered once in `app.whenReady()`, not in `createWindow()`. Backend is stopped on `window-all-closed` and `before-quit`. The server bundle is included via `extraResources` in `electron/package.json`.

**Packaged Mode Transport** (`ELECTRON_BACKEND=1`): When the backend launcher starts the server, it sets `ELECTRON_BACKEND=1` in the child process env. Three critical transport fixes for `file://` → `http://127.0.0.1` cross-origin context:
1. **CORS**: Origin `"null"` (sent by Chromium for `file://` pages) explicitly allowed in CORS handler when `ELECTRON_BACKEND=1` — without this, every API request gets 403
2. **CSRF bypass**: `csrfProtection` middleware is a no-op when `ELECTRON_BACKEND=1` — the double-submit cookie pattern cannot work cross-origin (`SameSite=Lax` cookies aren't sent with `fetch()` from `file://`), and CSRF is unnecessary for a localhost-only backend with dynamic port
3. **CSRF token memory cache**: `ensureCsrfToken()` caches the token in-memory instead of reading `document.cookie` (which can't access cookies set for `127.0.0.1` from a `file://` document)
Session cookies use `secure: false, sameSite: "lax"`, auth tracking cookies (auth_source, auth_next) likewise. Cookie persistence handler in `main.js` covers both `switchcontrol.org` and `127.0.0.1` domains. `auth:clearCookies` IPC also clears `127.0.0.1` cookies.

### Electron Auth Flow (Rebuilt)
- **Deep-link format**: `switchcontrol://auth/callback?code=ONE_TIME_CODE&provider=google|discord`
- **Desktop success page**: `/auth/desktop-success?code=...&provider=...` — auto-opens app via deep-link, renders visible "Open SwitchControl" manual fallback button, shows instructions if app doesn't open
- **Exchange endpoint**: `POST /api/auth/exchange` with `Authorization: Bearer CODE` — consumes one-time code, returns JWT + user data
- **Auth state machine** in `auth-store.ts`: `idle → opening_browser → waiting_for_callback → callback_received → exchanging → authenticated`. Terminal states (`callback_received`, `exchanging`, `authenticated`) block `timed_out`/`cancelled` transitions to prevent success being overwritten
- **Protocol registration**: Logged on startup with `[Protocol] Registration result:` and `[Protocol] Is default handler:` in Electron main process
- **Callback chain**: Main process receives deep-link via `second-instance` (Windows) or `open-url` (macOS), queues if renderer not ready, sends `auth-callback` IPC to renderer. Renderer parses `code` param, calls exchange, commits user state
- **Premium purchase deep-links**: `switchcontrol://auth/callback?premium_activated=true` (standardized from old `auth/success` path)

### Native RAM Cleaner
A Rust helper binary (`sc_memory.exe`) performs simulated RAM trimming using safe Win32 APIs (EmptyWorkingSet). It offers multiple modes (safe, smart, advanced) and outputs JSON results, integrated via IPC from Electron.

### AppFlow State Machine
Manages exclusive application flows (`firstTime`, `premiumUnlock`, `premiumTour`) with a defined priority order. It handles state hydration, entitlement checks, and prevents re-triggering unlock animations within a session.

### Unified Tour System
Both onboarding and premium guided tours utilize a shared `TourShell` component, featuring custom smooth scrolling, animated spotlights, and consistent styling. Tours conclude with a Discord CTA and prevent replay via server-side flags.

## External Dependencies

### Database
- **PostgreSQL**: Used as the primary data store.
- **Drizzle Kit**: Utilized for database migrations.

### Authentication
- **Replit Auth**: Integrated for user authentication via OpenID Connect.

### Third-Party Libraries
- **Recharts**: For data visualization in telemetry graphs.
- **date-fns**: For date formatting.
- **Zod**: For schema validation of API requests.
- **Framer Motion**: For rich animations.
- **OpenAI**: For AI Advisor server-side API calls (gpt-4o-mini).

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal`
- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`

### Security Hardening
- **Server Headers**: `helmet` middleware provides CSP (unsafe-eval removed in production), HSTS, X-Content-Type-Options, X-Frame-Options (frameguard: sameorigin), Referrer-Policy, Permissions-Policy.
- **CORS**: Strict production-only allowlist (`switchcontrol.org`). Dev adds localhost:3000/5000/5173. Blocked origins return 403.
- **JWT**: HS256 algorithm pinning, issuer validation (`switchcontrol`), 32-char minimum secret enforced in production (throws on startup), self-test suite on startup.
- **Rate Limiting**: Auth endpoints (100/15min), `/api/me` (60/min), AI endpoints (3/5min + 15/hr).
- **Error Handling**: Production 500+ errors return generic messages. Stack traces logged server-side only.
- **Structured Logging**: Every API request gets a UUID requestId, ISO timestamp, and sanitized response body. Recursive key-based redaction for token/authorization/jwt/password/secret fields.
- **Electron**: DevTools disabled in production, protocol validation on `open-external` and navigation guards (try/catch for malformed URLs), IPC input validation on tweak/memory handlers. contextIsolation: true, nodeIntegration: false, sandbox: false.
- **Post-Build Secret Scan**: `scripts/security-scan.cjs` scans dist output for leaked API keys, JWT tokens, and connection strings with credentials. Run with `node scripts/security-scan.cjs`.
- **Security Docs**: `docs/security-checklist.md`, `docs/security-summary.md`, `docs/security-assumptions.md`.

### External Links
- Discord community link
- TikTok social link