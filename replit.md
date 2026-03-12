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
- **Window Controls**: Custom-styled window control buttons with glass-blended appearance for Electron desktop builds. Embedded glass titlebar strip with 36px hit area, hover glow + micro-scale, drag region on titlebar.
- **Global Text Selection**: `user-select: none` is applied globally on `.app-root` for a premium feel, with exceptions for input fields, textareas, contenteditable, and `.select-text` class.
- **Glass Consistency**: All modals use unified glass tokens: `bg-[#0c0c14]/95 backdrop-blur-xl border-white/10 rounded-2xl`. Applied to Dialog base, PremiumModal, LicenseManagementModal, PendingActivationModal, TweakCard overlays.

### Key Features
- **Dashboard**: Displays system stats, simulates RAM clearing, initiates AI advisor scans, and shows live telemetry graphs (CPU, RAM).
- **Tweaks**: Offers categorized, searchable system optimization toggles with informational modals.
- **Network Tweaks**: Provides simulated optimizations for SMB, TCP/IP, UDP, DNS, and security settings.
- **Power Plan**: Allows selection and customization of power profiles.
- **History**: Logs simulated actions with JSON export.
- **Settings**: Manages account preferences and app configuration.

### AI Advisor System (Phase 1 - OpenAI)
Server-side OpenAI integration at `POST /api/ai/advice` (`server/routes/ai.ts`). Takes structured system specs (CPU, GPU, RAM, etc.), telemetry data, goal, game, and current tweak state (enabled/disabled tweaks) — returns structured JSON advice with `userState`, `readinessScore`, findings, actions (with `expectedGain`, `confidence`, `autoApplyPossible`, optional `tweakId`), warnings, and follow-ups. Uses `gpt-4o-mini` by default (configurable via `AI_MODEL` env var). Hardened rate limiting: 3 requests/5min + 15/hour hard cap, keyed by userId → deviceId (validated format, min 16 chars) → IP. SHA-256 request caching with 10-min TTL avoids duplicate OpenAI calls. System prompt enforces evidence-based advice: must reference actual hardware by model name, no generic filler, prefer reversible actions, no BIOS path guessing, no overclock values, rank by impact. Safe structured logging: timestamp, requestId, goal, game, duration — never logs API keys, full telemetry, or tokens. Input validated with Zod. API key stored in Replit Secrets (`OPENAI_API_KEY`). Client page at `/ai-advisor` (`client/src/pages/AiAdvisor.tsx`). Auto-fills system specs from dashboard store (CPU, GPU, RAM, disk) on page load. Error card with retry button for failed requests.

### Local Rule Engine (Dashboard AI)
A fully local, deterministic rule engine evaluates system and application signals against a bundled ruleset (`bundled.ruleset.json`). It provides recommendations (critical, recommended, informational) and can trigger app-tweak fixes. The advisor is read-only and does not modify core application state.

### Dashboard Bottom Grid
Three-column layout: System Health card, AI Advisor summary widget (links to `/ai-advisor`), BIOS Score summary card (links to `/bios-advisor`). AI Advisor summary shows last scan score if available, otherwise a CTA. BIOS Score summary shows competitive readiness score, latency/frametime/stability breakdown, and optimization level badge.

### BIOS Advisor
Premium-only BIOS firmware analysis page at `/bios-advisor` (`client/src/pages/BiosAdvisor.tsx`). Scores firmware configuration (0–100) across categories (CPU, Power, Memory, EMI). Data model in `client/src/lib/bios-advisor-data.ts` with 25+ BIOS settings, each with category, impact, risk, motherboard paths, detection status, and latency/frametime/stability scores. Features: animated scan progress, ranked opportunities with score gain/difficulty/risk, deterministic AI explanation panel, optimization level labels (Basic/Good/Advanced/Competitive), category score breakdowns, expandable setting cards with pros/cons/BIOS paths, detection summary (Detected/Assumed/Unknown counts with explanation), last scan timestamp. No auto-apply — all changes are informational and manual only.

### Electron Desktop App
The Electron app provides a unified `window.electronAPI` interface via `preload.js` for interacting with native system features. It uses the `systeminformation` package for real hardware data (CPU, GPU, RAM), offers native tweak execution (via `tweak-executor.js`), and includes a native Rust-based RAM cleaner.

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