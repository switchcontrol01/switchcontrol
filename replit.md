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

### Installer Download
- **Canonical config** (`shared/downloadConfig.ts`): Single source of truth — `INSTALLER_CONFIG` holds `version`, `fileName`, `publicPath` (`/downloads/SwitchControl-Setup.exe`), `platform`, `fileSizeMb`, `releasedAt`. All download CTAs import `installerUrl(source)` from this file.
- **Server route** (`GET /downloads/:fileName`): Reads `INSTALLER_DOWNLOAD_URL` env var and issues a `302` redirect. Logs `source` query param for tracking. Returns `503` if env var is not set.
- **Environment variable required**: `INSTALLER_DOWNLOAD_URL` must be set to the hosted `.exe` URL (e.g. Cloudflare R2 or S3 presigned URL) before downloads will work in production.
- **Source tracking**: All CTAs append `?source=` to the download URL. Current sources: `navbar`, `download_page`.
- **Download page** (`client/src/pages/Download.tsx`): Timer/countdown fully removed. Replaced with animated "Available now" live-release glass card. `launched = true`. Download button calls `installerUrl("download_page")`.
- **Navbar** (`client/src/components/website/WebsiteShell.tsx`): Desktop and mobile Download buttons call `installerUrl("navbar")` directly — no navigation to /download page.

### Premium Device Lock (Desktop App Only)
- **Schema** (`shared/models/auth.ts`): `users` table has `premiumBoundDeviceId` (VARCHAR), `premiumBoundAt` (TIMESTAMP), `premiumLastSeenDeviceId` (VARCHAR). Columns auto-created on server startup via `server/lib/deviceBindingMigration.ts`.
- **Binding endpoint** (`POST /api/device/premium-validate`): Electron-only. Uses `x-device-id` header. If no bound device → first-bind (stores device). If device matches → OK. If device differs → `{ status: 'locked' }`. Uses `requireJwt` only (never requireCloudPremium) so the check itself is never self-blocked.
- **Enforcement** (`server/middleware/requireCloudAuth.ts`): `requireCloudPremium` checks `x-device-id` against `premiumBoundDeviceId`. If both present and mismatched → 403 `device_locked`. Website/browser sessions never send `x-device-id` so they are unaffected.
- **Admin reset** (`POST /api/admin/users/:id/reset-premium-device`): Clears the device binding. Audit-logged. Used for hardware changes / support recovery.
- **Frontend hook** (`client/src/hooks/usePremiumDeviceLock.ts`): Runs after `entitlementsOk` is confirmed. Returns `{ status, isChecking, retry }`.
- **Frontend modal** (`client/src/components/DeviceLockModal.tsx`): Non-dismissible full-screen glass overlay. Z-index 9999. Buttons: Contact Support (mailto: prefilled), Retry (re-validates), Exit App (`electronAPI.quitApp()`). Not gated by `isResetting`.
- **App integration** (`client/src/App.tsx`): `usePremiumDeviceLock` called inside `ElectronAppContent`. Modal rendered as last element (highest z-order). Only fires when `isElectron && entitlementsOk && isPremium`.
- **Electron IPC**: `app:quit` IPC handler in `electron/main.js`. `quitApp()` exposed in `electron/preload.js`.
- **Website unaffected**: Device lock only applies when `x-device-id` header is present (Electron only). All browser/web sessions work normally.

### Admin System
- **Schema** (`shared/models/auth.ts`): `users` table extended with `plan` (free/trial/premium), `trialStartedAt`, `trialEndsAt`, `trialDurationHours`, `isAdmin`, `lastLoginAt`, `lastAppActiveAt`; new `adminLogs` table for audit trail.
- **Plan Resolution** (`server/lib/planUtils.ts`): `resolveEffectivePlan` is the single source of truth — Stripe premium overrides everything; admin-set `plan='premium'/'trial'` applies if active; else free.
- **Admin Routes** (`server/routes/admin.ts`): All at `/api/admin/*`, protected by `requireAdmin` middleware (JWT + session).
  - `GET /users` — paginated user list with search/plan filter
  - `GET /users/:id` — single user detail
  - `PATCH /users/:id/plan` — set plan + trial duration
  - `PATCH /users/:id/admin-status` — toggle admin (self-demotion blocked)
  - `GET /logs` — audit log (filterable by userId)
  - `GET /me` — quick auth self-check
  - `POST /bootstrap` — one-time self-service admin grant (first user only, or with `ADMIN_SETUP_KEY` env var)
- **Admin Panel** (`client/src/pages/Admin.tsx`): Full CRUD UI at `/admin` route — user table with search/filter/plan badges, trial countdowns, SetPlan dialog, UserDetailPanel with audit logs, admin toggle.
- **Activity Tracking**: `POST /api/activity/ping` for Electron app heartbeat (`lastAppActiveAt`); `lastLoginAt` updated on every auth.
- **AuthUser type** (`client/src/lib/auth-store.ts`): Extended with `plan`, `trialEndsAt`, `isAdmin`, `hasSeenTrialActivation`, `hasSeenTrialTour` fields synced from `/api/me`.

### Free Trial Activation Experience
- **Schema** (`shared/models/auth.ts`): `users` extended with `hasSeenTrialActivation` (boolean), `hasSeenTrialTour` (boolean), `trialActivatedAt` (timestamp).
- **Storage** (`server/storage.ts`): `markTrialActivationSeen(userId)` and `markTrialTourSeen(userId)` in `IStorage`, `MockStorage`, and `DatabaseStorage`.
- **Server routes** (`server/auth/google.ts`): All `/api/me` branches return `hasSeenTrialActivation`, `hasSeenTrialTour`; `POST /api/premium/trial-activation-seen` and `POST /api/premium/trial-tour-seen` mark them in DB.
- **Countdown utilities** (`client/src/lib/trialCountdown.ts`): `isTrialActive(user)`, `formatTrialCountdown(user)`, `getTrialTimeRemaining(user)`. Still used by one-time activation animations (TrialActivationAnimation, TrialTour).
- **Canonical entitlement resolver** (`client/src/lib/entitlementResolver.ts`): Pure function `resolveEntitlementUiState()` — single truth source for all persistent UI. Priority: trial_active > trial_expired > premium_grace > premium > free. Trial state uses client-side timestamp math (no server gate). Premium gates on `entitlementsVerified`.
- **Entitlement UI hook** (`client/src/hooks/useEntitlementUiState.ts`): Reactive wrapper around the resolver. Reads `useAppAuth()` + grace store + network store. Minute-tick keeps countdown live without any `useState` for the label (eliminates stale-init bug). Both `TrialCountdownBanner` (AppLayout) and Sidebar footer use this hook exclusively — they can never disagree.
- **Activation animation** (`client/src/components/TrialActivationAnimation.tsx`): Cinematic full-screen overlay (cyan/violet palette). ~4-5s particle sequence with countdown ring, performance graph, and features list. Skip-on-click. Calls `/api/premium/trial-activation-seen` on complete.
- **Trial tour** (`client/src/components/TrialTour.tsx`): 5-step onboarding (Welcome, AI Advisor, BIOS Advisor, Network+Power, Upgrade CTA). Calls `/api/premium/trial-tour-seen` on complete.
- **App flow** (`client/src/App.tsx`): Priority order: firstTime → trialUnlock → trialTour → premiumUnlock → premiumTour. `trialUnlockFiredRef` prevents retrigger within a session.
- **Sidebar badge** (`client/src/components/layout/Sidebar.tsx`): Live pulsing countdown badge (cyan) when trial active; ticks every 60 seconds. Falls back to "Free" when no trial.

### Network Diagnostics System (Premium)
- **Backend** (`server/routes/networkDiagnostics.ts`) mounted at `/api/network/*`:
  - `GET /ping-sample` — 3 TCP probes to Cloudflare/Google/OpenDNS, returns avg/min/max/jitter/loss
  - `POST /benchmark/baseline` — records 8-sample baseline for before/after comparison
  - `GET /benchmark/compare` — 8-sample post-apply measurement with improved/unchanged/worse verdict per metric
  - `GET /pc-vs-internet` — 4 probes (2 per provider) with cross-provider variance to estimate local vs external instability
- **Hook** (`client/src/hooks/useNetworkDiagnostics.ts`) — manages polling (2s), 60-sample history, spike detection (>1.5x rolling avg + 20ms delta), health score (0–100 composite), and benchmark/diagnostic state machines
- **Components** (`client/src/components/network/NetworkDiagnosticsPanel.tsx`) — `NetworkDiagnosticsHero` (live SVG Catmull-Rom graph, health gauge, 6 stat cards, spike heuristics) and `NetworkDiagnosticsFooter` (benchmark + PC vs Internet cards)

### UI/UX Design
- **WebsiteShell**: Provides a consistent layout with three variants (full, inner, minimal). Accepts `bgVariant` prop ("landing" | "pricing" | "download" | "auth" | "legal" | "success") to select variant-specific layered backgrounds. Always-on glass header with `bg-[rgba(255,255,255,0.07)] backdrop-blur-2xl border-white/[0.18]` (clear white frost glass, shows background through), top sheen highlight `via-white/30`, bright nav links. Base color `#040508`. Shared footer. All 8 website routes use this shell.
- **WebsiteBackground**: Cinematic multi-layer background system (`client/src/components/website/WebsiteBackground.tsx`) with variant-based configuration. Layers: near-black base → vignette → **brand background images** (hero-backdrop, circuit-tech, perf-dashboard, hardware-detail, network-flow — all converted to **WebP** in `client/src/assets/bg/`, ~94% smaller) with `mix-blend-mode: screen` at very low opacity (0.02–0.04), heavy blur (8px), contrast(1.2), slight rotation (-3deg) for invisible-until-you-squint texture → **BlueprintImageOverlay** (landing only — 3 blueprint images now **WebP** in `client/public/assets/blueprints/`, positioned as atmospheric overlays with blur 5-8px, screen blend, opacity 0.05-0.08, slow drift keyframes) → **sun streak beams** (3 diagonal CSS light beams from top-left — white opacity toned down from 0.30→0.08 and 0.22→0.06 to prevent header bleed, scroll-reactive fade) → **top-left spotlight** (muted purple radial, was white/purple 0.40/0.30 — now all purple to prevent header bleed) → secondary rim lights → perspective grid → technical SVG overlays → glow hotspots → hardware silhouettes → **floating particles** → mouse-follow spotlight. Parallax on scroll. Sun streaks fade with `max(0.2, 1 - scrollY/1200)`. IMPORTANT: source PNG files have been removed — all bg and premium images are now WebP only.
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
- **Telemetry IPC**: Preload exposes `system.getSpecs()`, `telemetry.getLive()`, `telemetry.getGpu()`, etc. `telemetry:getLive` returns a canonical **nested** shape: `{ timestamp, cpu: { usagePct, tempC, coreCount }, ram: { usedGb, totalGb, usagePct }, gpu: { available, model, usagePct, tempC, vramUsedMb, vramTotalMb, vramUsagePct, powerW, clockMhz }, disk: { selectedMount, usagePct, readOpsPerSec, writeOpsPerSec }, network: { rxKBps, txKBps } }`. LiveGraph.tsx is the primary consumer — reads all nested fields, no legacy fallbacks. GpuModal uses `telemetry:getGpu` separately.
- **Per-action UAC Elevation**: `electron/tweak-executor.js` has `runElevated(command)` — writes a temp `.ps1` script, launches it via `Start-Process powershell -Verb RunAs -Wait` from a non-elevated context (shows UAC prompt), reads result from a temp JSON file, cleans up. Admin tweaks that require elevation call `runElevated` automatically instead of returning a hard failure. Special-case tweaks (nvidia-telemetry) still require the whole app to run as admin.
- **Slider Tweak System**: Full read/apply/verify/reset lifecycle for numeric registry tweaks.
  - **Backend** (`electron/slider-tweak-executor.js`): 7 slider tweaks mapped 1:1 to real registry values (win32PrioritySeparation, MouseDataQueueSize, KeyboardDataQueueSize, SystemResponsiveness, NetworkThrottlingIndex, MenuShowDelay, HungAppTimeout). Each has `readSliderValue`, `applySliderValue` (with verify), `resetSliderValue`, `getSliderTweakMeta`. HKCU tweaks use `runPS`, HKLM tweaks use `runElevated` (per-action UAC).
  - **IPC** (`electron/main.js`): `tweak:readValue`, `tweak:applyValue`, `tweak:verifyValue`, `tweak:resetValue`, `tweak:getSliderMeta` handlers. Exposed in `electron/preload.js` under `window.electronAPI.tweaks.*`.
  - **Types** (`client/src/lib/mock-data.ts`): `SliderConfig` (min/max/step/defaultValue/recommendedValue/unit/presets/safeMin/safeMax/cautionLabel/extremeMin/extremeMax/extremeLabel/stepped), `SliderPreset`, `TweakControlType` (`"toggle" | "slider"`), `Tweak.sliderConfig`, `Tweak.detailsConfig` (registryPath/registryName/registryType/technicalNote), `Tweak.whoShouldAvoid`.
  - **Hook** (`client/src/hooks/use-slider-tweak.ts`): `useSliderTweak(tweakId, config)` — tracks `currentValue`, `pendingValue`, `previousValue`, `isUsingDefault`, `status`, `verifyResult`. Returns `apply/reset/revert/refresh/dismissResult` actions. Auto-dismisses verify banner after 6s.
  - **Component** (`client/src/components/tweaks/TweakSliderCard.tsx`): Glass card with stepped (segmented control) or continuous (Radix Slider + markers) control mode. Inline value display (current/pending/default/recommended), range warnings (safe/caution/extreme zones), Apply/Reset/Revert buttons, animated verify banner, collapsible advanced details drawer (registry path, raw value, who should avoid, technical note).
  - **TweaksList routing** (`client/src/components/tweaks/TweaksList.tsx`): `controlType === "slider"` branches to `TweakSliderCard`, others use `TweakCard`. New "Sliders" filter chip shows only slider tweaks. Added "Input", "Privacy" filter chips. Filter handles "Sliders" specially (controlType match rather than category match).
  - **New Tweaks**: 7 sliders (Win32PrioritySeparation, Mouse Queue Size, Keyboard Queue Size, System Responsiveness, Network Throttling Index, Menu Show Delay, Hung App Timeout) + 4 new toggles (Power Throttling, NTFS Last Access, Disable Transparency, Disable Animations). All 11 are in `FREE_EXCEPTION_IDS` (no premium gate).
- **AI Advisor Staged Status**: During the thinking phase, `ThinkingStatus` component cycles through "Analyzing system…" (0-700ms), "Checking tweaks…" (700-1400ms), "Building recommendations…" (1400ms+) with AnimatePresence crossfade.
- **BIOS Confidence Surfacing**: `BiosScoreSummaryCard` in Home.tsx shows `getScanSource()` badge (Live/Mixed/Inferred) and X/Y detected count below the readiness score. Subtitle updated to "Firmware readiness estimate".
- **Tour System**: State-machine-driven (`useReducer`) with choreographed phases: `idle → dimming → navigating → scrolling → spotlighting → presenting → fading_out → done`. Single source of truth controls route transitions, sidebar highlighting (`[data-tour-highlight]` attribute), scroll positioning, and tooltip display. Steps support `sidebarHighlight` field.
- **Dashboard Card Hierarchy**: Top row (Activity Monitor) uses `StatCard` → `GlassCard`. Bottom row (System Health, AI Advisor, BIOS Score) upgraded to `GlassCard` with colored corner glows and consistent padding layout.

### Live Telemetry Infrastructure
Real systeminformation-powered backend with no fake or randomized data:
- **`server/lib/telemetry.ts`**: Polls `systeminformation` for CPU load/speed/temp, RAM usage, network RX/TX, process count every 1.5s. Exposes `getSnapshot()` and `subscribe(cb)`.
- **`server/lib/wsServer.ts`**: WebSocket server at `/ws/telemetry`. Broadcasts `LiveTelemetry` snapshots every 1.5s to all connected clients.
- **`client/src/hooks/useLiveTelemetry.ts`**: React hook consuming the WebSocket. Maintains 30-point rolling history for sparklines. Exposes `{ telemetry, history, connected }`.
- **`client/src/hooks/useCauseEffect.ts`**: Before/after delta engine for tracking metric changes around actions.
- **REST fallbacks**: `/api/telemetry` (snapshot), `/api/specs` (static system info), `/api/metrics/snapshot` (combined).

### Intelligence UI Components (`client/src/components/intelligence/`)
- **`SystemAura`**: Ambient background gradient driven by live CPU load — calm blue at low load, warm amber/red at high load.
- **`PredictiveWarnings`**: Strip of real-time system warnings (high CPU temp, rising RAM, network latency) derived from live telemetry.
- **`LatencyMap`**: Pipeline diagram (CPU → RAM → Network → IO) with live latency visualizations.
- **`IntentModeSelector`**: Intent mode picker (Competitive / Balanced / Silent / Max FPS) that maps to power profiles.
- **`TrustLayer`**: Expand panel on tweak cards showing risk, impact, and before/after delta details.

### Key Features
- **Dashboard**: Live RAM from WebSocket, SystemAura ambient background, PredictiveWarnings strip, LatencyMap pipeline section. LiveGraph with real telemetry data.
- **Tweaks**: TrustLayer integration on tweak cards — expand to see risk/impact/delta details.
- **Network Tweaks**: LatencyMap + live RX/TX display.
- **Power Plan**: IntentModeSelector for competitive/balanced/silent/max-fps modes.
- **AI Advisor**: Live telemetry wired into AI context (real CPU load %, CPU/GPU temps, RAM usage from WebSocket).
- **Security, FocusMode, SystemCleaner, StartupApps, Debloater, AppBooster**: Live resource strip showing real CPU%, RAM%, process count from WebSocket data.
- **Debloater — Installed Apps Manager**: Second tab alongside Curated Removals. Electron IPC `installedApps:scan` (PowerShell reads HKLM+HKCU Uninstall registry keys, dedupes by name, classifies trust: microsoft/user-installed/protected/unknown) and `installedApps:uninstall` (MSI via `msiexec /x {GUID} /qn`, EXE via QuietUninstallString/UninstallString, 90s timeout, exit 3010 = restart-required). Protected patterns block Defender/Firewall/Windows Update. `InstalledAppsPanel.tsx` provides search, 6 filter chips, 4 sort modes, expandable rows, confirm dialog, per-row result badges. Uninstalls log to history store + `POST /api/debloat/apps/log`.
- **History**: Logs simulated actions with JSON export.
- **Settings**: Manages account preferences and app configuration.

### AI Advisor System
Two server-side OpenAI endpoints in `server/routes/ai.ts`:
1. **`POST /api/ai/advice`**: Structured one-shot analysis. Takes system specs, telemetry, goal, game, and tweak state — returns JSON with `userState`, `readinessScore`, findings, actions, warnings, follow-ups. Used by legacy flows.
2. **`POST /api/ai/chat`**: Multi-turn conversational endpoint. Takes `messages[]` (role/content) + `context` (system specs, tweaks, telemetry) — returns assistant message. 10-message context window, 800 max tokens, markdown formatting.

Uses `gpt-4o-mini` by default (configurable via `AI_MODEL` env var). Hardened rate limiting: 3 requests/5min + 15/hour. SHA-256 caching on advice endpoint. API key in Replit Secrets (`OPENAI_API_KEY`).

**Client** (`client/src/pages/AiAdvisor.tsx`): Chat-based interface with auto-detected system specs (from store telemetry), quick action buttons (Optimize FPS, Reduce Latency, Fix Stuttering, Network Ping), markdown-rendered responses, spec chips header showing detected hardware, and new-chat reset.

### Shared Architecture Systems

#### Token Files (single source of truth)
- **`client/src/lib/themeTokens.ts`** — All brand/premium color literals (`premiumColor`, `premiumRgba`, `premiumGlow`, `premiumOverlay`, `premiumGradient`, `successColor`). No `hsl(270…)` or `rgba(168,85,247,…)` values should be hardcoded in component files.
- **`client/src/lib/motionTokens.ts`** — Barrel re-export of all animation tokens, presets, variants, and hooks from `motion.tsx`. Import animation primitives from here instead of directly from `@/lib/motion` or `framer-motion`.
- **`client/src/lib/motion.tsx`** — Backing implementation for motion tokens: `timing`, `easing`, `springs`, Framer-Motion variant presets, `Reveal` component, `MotionProvider`, `useMotion` hook. Never import `framer-motion` directly in component files — always go through `motion.tsx` or `motionTokens.ts`.

#### Overlay System
- **`client/src/lib/overlaySystem.ts`** — Barrel export for all premium overlay components; import from here for clean single-line imports.
- **`client/src/components/ui/PremiumOverlayCard.tsx`** — Shared animated premium upgrade card used by all overlay variants. Contains `PremiumOverlayCard` (supports `variant="page"|"card"`) and `CrownGlowOrb` (the pulsing crown icon, defined once here). No other file should define the crown glow animation.
- **`client/src/components/ui/premium-page-overlay.tsx`** — `PremiumPageOverlay` (full-viewport gate), `PremiumCardOverlay` (inline card gate), `PremiumHeaderBadge`. All use `PremiumOverlayCard` internally.
- **`client/src/components/ui/premium-lock-overlay.tsx`** — `PremiumLockOverlay` (blur + cover), `PremiumToggleLock` (row lock icon), `PremiumPageHeader` (title with premium badge). Uses `PremiumOverlayCard` and `CrownGlowOrb`.

#### Shared Hooks
- **`client/src/hooks/useAttentionBounce.ts`** — Extracted from 4× duplicated `isAnimating`/`triggerAttentionAnimation`/`setTimeout(300)` pattern. Returns `{ isAnimating, trigger, bounceProps }` — spread `bounceProps` onto a `<motion.div>` for the attention scale+glow pulse.

#### Graph Primitives
- **`LandingPerformanceCharts.tsx`** — Internal `DualAreaChart` primitive extracted from 3× repeated `<ResponsiveContainer><AreaChart>` blocks. Accepts `id`, `stockColor`, `optimizedColor`, `yDomain`, `stockRef`, `optimizedRef`, `unit`. The three chart functions (`FpsChart`, `InputChart`, `JitterChart`) are now one-liner wrappers.

#### Dashboard Hardware Cards — Loading State
- **`StatCard`** accepts `loading?: boolean` prop — shows CSS keyframe shimmer skeleton for value/subtext/progress when true.
- **`Home.tsx`** tracks `specStatus: "loading"|"ready"|"unavailable"` — starts as `"loading"`, resolves on fetch outcome. Cards pass `loading={specStatus === "loading"}` so "Unavailable" text never flashes during startup.

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

**UI Features**: Confidence % badges per setting, detection label badges (User Confirmed/Detected/Inferred/Unknown), category score breakdowns (driven by analyzed settings, not static data), ranked opportunities with score gain/difficulty/risk, optimization level labels. Expanded setting cards use tabbed layout (Overview | Pros & Cons | BIOS Path) with 2-column grid on desktop for progressive disclosure. No auto-apply — all changes are informational and manual only.

### Unified API Layer
`client/src/lib/api.ts` provides `apiFetch`, `apiPost`, `apiGet` helpers with async base URL resolution. In packaged Electron (`file://`), `resolveApiBase()` polls `electronAPI.getBackendPort()` IPC with adaptive retry loop (150ms fast then 300ms, 25s timeout) until the embedded backend reports a real port — no hardcoded fallback to 5000, no permanent cache of a bad value. Throws hard error if backend never starts. Promise deduplication prevents multiple concurrent resolution attempts. Exports `isBackendReady()` boolean and `onBackendReady(cb)` subscription for components that need reactive backend state. On web, uses relative `/api`. `apiFetch` and `apiPost` accept `signal?: AbortSignal` for real request cancellation. `ensureCsrfToken()` throws on failure instead of silently returning empty string. Includes `x-device-id` header injection, `ApiError` class, `getUserFriendlyError()`. AI Advisor and BIOS Advisor use these exclusively — no raw `fetch()` calls.

### Electron Desktop App
The Electron app provides a unified `window.electronAPI` interface via `preload.js` for interacting with native system features. It uses the `systeminformation` package for real hardware data (CPU, GPU, RAM), offers native tweak execution (via `tweak-executor.js`), and includes a native Rust-based RAM cleaner.

**Embedded Backend** (`electron/backend-launcher.js`): In packaged mode, `main.js` spawns the bundled `dist/index.cjs` server using `child_process.spawn()` with `ELECTRON_RUN_AS_NODE=1` environment variable — this forces the Electron executable to behave as a plain Node.js runtime, avoiding the critical failure where `fork()` would spawn a second Electron instance that gets killed by `app.requestSingleInstanceLock()`. Dynamically-selected free port (no fixed port 5000), polls `/api/health` for HTTP 200 with `{"status":"ok"}` body (strict readiness check) using adaptive retry delays (100ms→200ms→350ms, 20s timeout). Backend startup is non-blocking — window creation happens in parallel with backend readiness polling. Port exposed via `electronAPI.getBackendPort()` / `electronAPI.isBackendReady()` / `electronAPI.getBackendError()` IPC. Push notification via `backend-ready` IPC event for instant resolution without polling. `onBackendReady()` listener in `api.ts` receives push event. IPC handlers registered once in `app.whenReady()`, not in `createWindow()`. Backend is stopped on `window-all-closed` and `before-quit`. The server bundle is included via `extraResources` in `electron/package.json`.

**Server Host Binding** (`server/index.ts`): When `ELECTRON_BACKEND=1`, the HTTP server explicitly binds to `127.0.0.1` instead of `localhost`. On Windows, `localhost` can resolve to `::1` (IPv6) rather than `127.0.0.1` (IPv4), causing the health probe in `backend-launcher.js` (which always uses `http://127.0.0.1:PORT/api/health`) to fail — `backendReady` would stay `false` forever and both advisors would show timeout banners. In non-Electron mode the server binds to `0.0.0.0` with `reusePort: true` as before. `backend-launcher.js` and `api.ts` both use `127.0.0.1` and remain unchanged.

**Desktop Secret Bootstrap** (`server/lib/desktop-secrets.ts`): Imported as the absolute first statement in `server/index.ts`. When `ELECTRON_BACKEND=1` and `JWT_SECRET`/`SESSION_SECRET` are absent from the environment (normal for an installed desktop app), it generates cryptographically strong 96-char hex secrets (384-bit entropy) and persists them to `{ELECTRON_USER_DATA}/desktop-secrets.json` (mode 0o600). On subsequent launches the secrets are loaded from that file, keeping JWT tokens and sessions valid across restarts. Completely inactive when `ELECTRON_BACKEND` is not set — web production security is unchanged.

**Server Bundle** (`script/build.ts`): esbuild bundles ALL server npm dependencies directly into `dist/index.cjs` (2.6 MB fully self-contained). The old allowlist approach was incomplete — `cookie-parser`, `jsonwebtoken`, `passport-google-oauth20`, `passport-discord` and others were missing, causing `MODULE_NOT_FOUND` crashes in the packaged app. The new approach sets `external: []` (bundle everything) and only force-externalizes dev-only tools (`vite`, `drizzle-kit`) that are dead-code-eliminated anyway by the `NODE_ENV=production` define. Node.js built-ins (`fs`, `path`, `crypto`, `http`, etc.) are automatically kept external by esbuild's `platform: "node"` setting. The resulting bundle is verified to start cleanly and serve `/api/health → {"status":"ok"}` with no missing modules.

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

### BIOS Advisor Scoring System

The scoring in `client/src/lib/bios-advisor-data.ts` (`calculateBiosScores`) is designed to be honest about what is actually known vs assumed.

**Architecture**:
- `BiosSetting.isOptimal?: boolean` — set when a detection confirms whether the value is gaming-optimal or suboptimal
- `FirmwareDetection.isOptimal?: boolean` — carried through from hardware telemetry or photo AI analysis
- `applyDetectionsToSettings` spreads `isOptimal` into the merged settings array

**Scoring weights by detection status**:
- `User Confirmed`: 1.0 (user explicitly set it)
- `Detected`: 0.95 (hardware telemetry, high certainty)
- `Photo Verified`: 0.9 (AI vision, clear in image)
- `Photo Suspected`: 0.65 (AI vision, medium confidence)
- `Inferred`: 0.18 (indirect evidence, low weight)
- `Unknown`: 0 (no evidence — zero contribution)

**Direction via `isOptimal`**: If `isOptimal === false`, the score contribution is multiplied by -1 (penalty). This means detecting a suboptimal setting actually LOWERS the score. `isOptimal === undefined` means we assume the recommended state (positive contribution).

**Baseline**: latency=15, frametime=15, stability=25. Scores must be earned through real detections.

**Base data defaults** (`BIOS_SETTINGS` in `bios-advisor-data.ts`): All 17 settings that aren't inferrable default to `"Unknown"` (zero contribution). 13 settings default to `"Inferred"` (indirect platform evidence). Real detections from `analyzeFirmware` (Electron hardware telemetry) or photo-scan override these at runtime via `applyDetectionsToSettings`.

**Server photo prompt** (`server/routes/bios.ts`): Asks OpenAI to return `isOptimalForGaming: boolean` per detected setting. This is passed through as `isOptimal` in the response and applied to scoring.

**Score ranges**:
- 0–27: Stock / Unoptimized (many suboptimal settings or no scan done)
- 28–45: Needs Tuning (some known, mostly unverified)
- 46–70: Mixed Profile
- 71–85: Extreme (most detected and optimal)
- 86–100: Competitive Advantage (fully verified and optimal)

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

### Activity Intelligence (History Page)
**Files**: `client/src/pages/History.tsx`, `client/src/components/history/HistoryCharts.tsx`

**Architecture**: History page rebuilt from flat log into full analytics center. All enrichment computed client-side from the existing `HistoryItem` shape (id/timestamp/action/page/result/notes) — no store schema changes required.

**Data enrichment** (derived at render time):
- `status`: "success" | "failed" | "warning" | "reverted" | "info" — inferred from result/action text
- `module`: normalized from `page` field (Tweaks/Security/Power/Network/Cleaner/Debloat/Startup/AI Advisor/BIOS Advisor/Dashboard/App Booster)
- `impact`: "low" | "medium" | "high" — derived from module + status
- `isMajor`: boolean for major event strip (failed, high-impact, Security, BIOS Advisor)

**Sections**:
- **Summary Cards** (6): Total Actions, Success Rate (color-coded), Failed Actions, Top Module, Last Active, Sessions (7d)
- **Recent Major Events strip**: horizontal scroll of cards for isMajor events only
- **Analytics Charts** (collapsible): Actions Over Time (AreaChart), Success vs Failure (stacked BarChart), Module Usage (animated horizontal bars) — all with time range selectors (1D/7D/30D/All)
- **Search + Filters**: text search (action/module/result/notes), module filter chips, status filter chips, sort toggle (newest/oldest), collapsible on mobile
- **Grouped Timeline**: date groups (Today/Yesterday/Earlier This Week/Older) with expandable event rows
- **Expandable Event Rows**: left-border color by status, expand reveals full timestamp, module, status, impact, result, notes, event ID

**Session intelligence**: `detectSessions()` — groups events with ≤15 min gaps into sessions. Used for "Sessions (7d)" summary card.

**Export** (3 options): All history JSON, Filtered view JSON, Filtered view CSV — via dropdown menu.

**Mobile**: Summary cards `grid-cols-2 sm:grid-cols-3 xl:grid-cols-6`, charts `grid-cols-1 md:grid-cols-3`, filter panel collapsible, timeline single-column, expand still smooth.

### System Integrity Module (Security Page)
**Files**: `client/src/pages/Security.tsx`, `client/src/components/security/SecurityStartupTab.tsx`, `client/src/components/security/SecurityProcessesTab.tsx`, `client/src/components/security/SecurityAuditTab.tsx`, `electron/security-helper.js`

**5-tab layout** accessible at `/security` route (requires auth + Electron for most data):
- **Overview**: Health score ring, security posture breakdown bars (Protection/Startup/Background/Config), Recharts AreaChart trend graphs (health + CPU), recent change detection (diffs last 2 scan history entries from localStorage), priority issues list, all recommendations.
- **Protection**: Core Defender status (realtime, firewall, antispyware, tamper), Advanced Protection card (cloud protection, PUA, SmartScreen, controlled folder access, sample submission), Protection Freshness card (signature age, scan ages), Screenshot AI Analysis.
- **Startup**: Full startup items list with expand/collapse, per-item actions: Enable/Disable (via StartupApproved registry key), Delay launch (via Task Scheduler, 30s/1m/2m/5m presets), Open file location. Filter by All/Review/Disable.
- **Processes**: Process trust analysis sorted by trust state. Trust classification by executable path (Windows/PF = trusted, AppData/Temp/Downloads = suspicious, other = review, no path = unknown). Expand for path, parent PID, gaming impact. Filter All/Suspicious/Review.
- **Audit**: One-click deep security audit runs in parallel: Platform & Firmware Trust (SecureBoot, TPM, BitLocker, HVCI/VBS, UAC+level), Remote & Network Exposure (RDP, Remote Assistance, SMBv1, guest account, proxy, Windows Update), Persistence (hosts file), Suspicious Scheduled Tasks, Suspicious Services.

**Scan history**: `localStorage` key `sc_security_history`, max 50 entries. Each entry: timestamp, healthScore, protectionScore, issue counts, CPU/RAM snapshot. Powers trend charts + change detection. Charts show "Not enough history" until 2+ entries.

**Backend IPC handlers** (all Windows-only): `security:getStatus`, `security:getStartupApps`, `security:getTopProcesses`, `security:getAdvancedProtection`, `security:getAdvancedAudit`, `security:getProcessDetails`, `security:getScheduledTasks`, `security:getServices`, `security:openProcessLocation`, `security:openStartupLocation`. Startup: `startup:setEnabled`, `startup:setDelay`, `startup:verifyState`.

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

### System Cleaner — Premium Intelligence Upgrade (April 2026)
**Files**: `client/src/pages/SystemCleaner.tsx` (main page), `client/src/components/cleaner/` (5 new components), `server/routes/cleaner.ts` (updated routes + scan history)

**New components**:
- `CleanerSummaryCards.tsx` — 6 animated stat cards: Junk Found, Selected, Files Found, Top Category, Last Scan, Total Cleaned (all time)
- `CleanerCharts.tsx` — 4 Recharts visualizations: Junk Found Over Time (AreaChart), Bytes Removed Per Session (BarChart), Category Breakdown (PieChart), Recurring Junk Sources (horizontal BarChart)
- `CleanerOffenders.tsx` — Largest Offenders (top 5 by size, click-to-select) + Recommended Now (priority-sorted, 4 items with why-descriptions); exports `getPriority()` + `PRIORITY_CONFIG`
- `CleanerHistoryPanel.tsx` — Upgraded history with filter bar (mode/status), date grouping (Today/Yesterday/This Week/Month), expandable session rows showing per-item results
- `CleanerFilters.tsx` — Search input + filter chips for items: All/Found/Selected/Safe only/Admin/Biggest first/Priority

**Priority scoring** (rule-based, from real scan data only):
- `clean-now` (red) — bytes ≥100 MB, non-rebuilding
- `good-opportunity` (violet) — bytes ≥10 MB, or rebuilders ≥50 MB, or 5+ non-disk entries
- `rebuilds-quickly` (amber) — shader/discord/thumbcache/steam/anticheat caches
- `minor` (gray) — bytes <1 MB disk or <5 non-disk entries
- `not-found` — item not detected in scan

**Insight tags** — per-item static config in `SystemCleaner.tsx` (`ITEM_TAGS`): e.g. "Rebuilds Automatically", "Latency Relevant", "Stutter Risk", "Boot Relevant", "Privacy Relevant", "Worth Cleaning", shown as small chips below item description

**Server changes** (`server/routes/cleaner.ts`):
- New `cleaner_scan_history` table (auto-created): scan_mode, total_bytes, total_files, found_count, category_totals JSONB, ran_at
- `POST /api/cleaner/scan` now also persists scan summary to `cleaner_scan_history` (async, non-blocking)
- `GET /api/cleaner/scan-history` — returns up to 30 scan records for trend charts
- `GET /api/cleaner/history` — now also returns `clean_results` JSONB for per-item analysis in charts

**History phase** is now a full analytics center: scan trend charts + clean session charts + filterable session list with drill-down

**Item filters** (scan phase): full-text search across name + description, filter chips, sort by biggest/priority

### Tweaks — Pass 2 Expansion (April 2026)

**New Sliders** (both `HKCU\Control Panel\Desktop`, REG_SZ, slider-tweak-executor.js):
- `low-level-hooks-timeout` — LowLevelHooksTimeout, 500–20000ms. Reduces input latency from slow WH_KEYBOARD_LL/WH_MOUSE_LL hook consumers. Rec: 1000ms. Free.
- `wait-to-kill-app` — WaitToKillAppTimeout, 1000–20000ms. Controls how long shutdown waits before force-killing slow apps. Rec: 5000ms. Free.

**New Toggles** (tweak-executor.js):
- `show-file-extensions` — `HideFileExt=0` (HKCU Explorer\Advanced). Shows file extensions. Explorer restart required. Free, Recommended.
- `explorer-separate-process` — `SeparateProcess=1` (HKCU Explorer\Advanced). Each folder window in its own process. Free, Advanced.
- `disable-auto-restart-apps` — `RestartApps=0` (HKLM Winlogon). Prevents auto-relaunch of Store/registered apps at sign-in. Requires admin. Free, Advanced.

All 5 tweaks added to `FREE_EXCEPTION_IDS` and `TWEAK_TIER_MAP` in `shared/tweak-tiers.ts`, and as full entries in `client/src/lib/tweak-registry.ts`.

### Tweaks — Canonical Architecture Refactor (April 2026)

All tweak data now lives in a single canonical source of truth at **`client/src/lib/tweak-registry.ts`**.

**RegistryTweak type** — each tweak now carries:
- `supported: boolean` — false for tweaks that cannot be applied on modern Windows
- `unsupportedReason?: string` — shown in UI when `supported === false`
- `requiresAdmin: boolean` — whether UAC elevation is needed
- `premium: boolean` — computed via `isPremiumTweakById` from `shared/tweak-tiers.ts`

**Derived exports** (replaces hardcoded arrays in use-tweak-executor.ts):
- `HKCU_TOGGLE_IDS` — supported non-admin toggle IDs
- `ADMIN_TOGGLE_IDS` — supported admin-elevation toggle IDs
- `SLIDER_IDS` — all supported slider IDs
- `UNSUPPORTED_MAP` — `{ id: reason }` for all unsupported tweaks

**Import chain**:
```
shared/tweak-tiers.ts          ← premium gating logic + types (single source)
client/src/lib/tweak-registry.ts  ← canonical tweak data; imports isPremiumTweakById
client/src/lib/mock-data.ts    ← thin re-exporter of registry + SystemStats/AI types
client/src/hooks/use-tweak-executor.ts  ← derives arrays from registry
client/src/lib/premium-config.ts       ← re-exports from shared/tweak-tiers
```

**Unsupported tweaks** (`supported: false`): `p-states`, `irq-priority`, `timer-res`, `desktop-comp`, `hdcp` — still visible in the tweaks list with dimmed styling and an "Unsupported" badge, but explicitly quarantined from the executor.

**shared/tweak-tiers.ts updates**:
- Added all previously-missing tweaks to `TWEAK_TIER_MAP` (disable-pointer-precision, disable-fso, usb-selective-suspend, mmcss-gaming, pcie-link-state, disable-mpo, disable-delivery-opt, disable-wer, disable-activity-history, win-search-index)
- Added `disable-mpo` to `FREE_EXCEPTION_IDS` (fix: was incorrectly defaulting to premium)
- Unknown tweaks now default to `free` (benefit-of-the-doubt), not `premium`

**server/routes/tweakIntelligence.ts updates**:
- Removed `timer-res` and `irq-priority` from `TWEAK_PROFILES` (unsupported tweaks should never be recommended)
- Updated `POSTURE_SETS.performance` to replace them with `preemption`, `mmcss-gaming`
- Updated `POSTURE_SETS.latency` to replace them with `disable-pointer-precision`, `usb-selective-suspend`, `disable-mpo`, `disable-fso`

### NIC Adapter Tuning System (April 2026)

**Backend**: `electron/nic-executor.js`
- `getNetAdapters()` — PowerShell `Get-NetAdapter`, returns physical adapters (filters out loopback, Bluetooth, Hyper-V, VPN, Tunnel, vEthernet).
- `getAdapterCapabilities(adapterName)` — Queries all supported advanced properties for a named adapter; maps them to internal property keys by matching `RegistryKeyword` and `DisplayName` case-insensitively. Returns per-key `{ supported, currentValue }`.
- `readNicProperty(adapterName, propertyKey)` — Reads current value via `Get-NetAdapterAdvancedProperty`.
- `setNicProperty(adapterName, propertyKey, value)` — Sets value via `Set-NetAdapterAdvancedProperty`. Requires admin (spawns elevated PowerShell via UAC). Reads back actual value for verification.
- `resetNicProperty(adapterName, propertyKey)` — Resets to driver default via `Reset-NetAdapterAdvancedProperty`. Reads back new value.
- `getNicPropertyMeta()` — Returns full metadata for all 8 tunable properties (see below).

**8 NIC properties** with their `displayName` registry keyword and type:
| Key | Display Name | Type | Notes |
|-----|--------------|------|-------|
| receiveBuffers | `*ReceiveBuffers` | numeric 64–4096 | Adapter ingress queue depth |
| transmitBuffers | `*TransmitBuffers` | numeric 64–4096 | Adapter egress queue depth |
| rss | `*RSS` | toggle (Enabled/Disabled) | Receive-Side Scaling |
| rssQueues | `*NumRssQueues` | stepped (1,2,4,8) | RSS queue count |
| interruptModeration | `*InterruptModeration` | toggle | Coalesce interrupts (latency vs CPU) |
| eee | `*EEE` | toggle | Energy Efficient Ethernet |
| flowControl | `*FlowControl` | stepped (Disabled/Tx/Rx/Rx+Tx) | 802.3x pause frames |
| greenEthernet | `*GreenEthernet` | toggle | Green Ethernet power saving |

**IPC handlers** (electron/main.js): `nic:getAdapters`, `nic:getCapabilities`, `nic:readProperty`, `nic:setProperty`, `nic:resetProperty`, `nic:getPropertyMeta`.

**Frontend API** (electron/preload.js): `window.electronAPI.nic.{getAdapters, getPropertyMeta, getCapabilities, readProperty, setProperty, resetProperty}`. All inputs validated with `assertString`. `setProperty` coerces value to string.

**UI Component**: `client/src/components/tweaks/NicTuning.tsx`
- Collapsible section at bottom of Tweaks page (below TweaksList).
- Adapter selector: each adapter expands as a `GlassCard` with status badge and supported property count.
- Per-property `PropertyControl` component: capability-gated — unsupported properties show "Not supported on this adapter" label without a live control.
- Control types: toggle (Enabled/Disabled buttons), stepped (preset buttons), numeric (Slider).
- Apply button is disabled unless value is dirty. Reset restores driver default.
- Verify result banner shows read-back value after apply.
- Non-Electron browsers see an informational card explaining desktop-only capability.
- Warning banner: property changes require admin and take effect immediately.

### External Links
- Discord community link
- TikTok social link