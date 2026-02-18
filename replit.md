# SwitchControl

## Overview

SwitchControl is a modern, polished web-based gaming optimization dashboard prototype. It provides a UI-first experience for Windows system tweaks, power plan management, network optimization, and system monitoring. This is a **prototype application** - all optimization actions are simulated and do not make real Windows system changes. The app uses a dark theme with purple/pink accent colors and a clean gamer aesthetic.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight router)
- **Styling**: Tailwind CSS v4 with custom dark theme and CSS variables
- **UI Components**: shadcn/ui component library (Radix UI primitives)
- **State Management**: Zustand with localStorage persistence for client-side state
- **Data Fetching**: TanStack Query (React Query) for server state
- **Animations**: Framer Motion with reduced motion support
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Replit Auth integration (OpenID Connect)
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix

### Data Storage
- **Primary Database**: PostgreSQL (via Drizzle ORM)
- **Client Persistence**: localStorage for UI state (tweaks, history, AI scan results)
- **Schema Location**: `shared/schema.ts` for main app tables, `shared/models/auth.ts` for auth tables

### Key Data Models
- `userSettings`: User preferences, account tier, optimization counters
- `appliedTweaks`: Tracks which system tweaks are enabled per user
- `historyEntries`: Log of all simulated optimization actions
- `aiScans`: Stores AI advisor scan results and recommendations
- `users/sessions`: Replit Auth user and session data
  - `users.hasSeenPremiumUnlock`: Server-authoritative flag for one-time premium unlock animation
  - `users.premiumFirstSeenAt`: Timestamp when user first saw the premium unlock

### Application Structure
```
client/src/
├── components/     # React components (dashboard, layout, tweaks, ui)
├── hooks/          # Custom React hooks
├── lib/            # Utilities, API client, mock data, state store
├── pages/          # Route page components
└── config/         # App configuration (social links, etc.)

server/
├── index.ts        # Express server entry point
├── routes.ts       # API route definitions
├── storage.ts      # Database storage interface
├── db.ts           # Database connection
└── replit_integrations/auth/  # Replit Auth integration

shared/
├── schema.ts       # Drizzle database schema
└── models/auth.ts  # Auth-related tables
```

### Key Features by Page
- **Dashboard**: System stats, RAM clearing simulation, AI advisor scan, live telemetry graphs
- **Tweaks**: Categorized system optimization toggles with search, filters, and info modals
- **Network Tweaks**: SMB, TCP/IP, UDP, DNS, and Security network optimizations
- **Power Plan**: Power profile selection with custom overrides
- **History**: Action log with JSON export capability
- **Settings**: Account preferences and app configuration

### AI Advisor System (Local Rule Engine)
- **Architecture**: Fully local, deterministic, zero server dependency
- **Store**: `client/src/stores/advisorStore.ts` (zustand with persistence)
- **Run States**: idle → initializing → collecting → evaluating → ready/degraded/error
- **Signal Collectors** (`client/src/advisor/collectors/`):
  - `systemCollector.ts`: gameMode, powerPlanName, windowsBuild, memoryIntegrity, hags (via electronAPI or fallback)
  - `networkCollector.ts`: activeAdapterName, interruptModeration, tcpAutoTuning (via electronAPI)
  - `appCollector.ts`: appVersion, deviceIdShort, tweaksApplied, lastTweakApplyAt, isPremium (from store/browser)
- **Rule Engine**: `client/src/advisor/engine.ts` — evaluates signals against bundled ruleset, scoring 0–100
- **Ruleset**: `client/src/advisor/ruleset/bundled.ruleset.json` — 15 rules with severity levels (critical/recommended/informational)
- **Fix Runner**: Rules with `fix.type = "app_tweak"` invoke existing tweak handler, then re-evaluate and update score
- **Flow Safety**: Advisor is read-only; does NOT modify activeFlow, premium flags, or onboarding state
- **Reset Behavior**: Factory Reset clears advisor state (localStorage.clear). Reset Settings does NOT affect advisor state.

### Premium Redirect System
- All "Unlock Premium" / "Get Premium" buttons open `https://switchcontrol.org/pricing` in external browser
- Uses centralized `client/src/lib/pricing.ts` helper
- Electron: `window.electronAPI.openExternal()`, Browser: `window.open()`

### Electron Desktop App Architecture
- **Unified API**: Single `window.electronAPI` global exposed via preload.js
- **Real Hardware Data**: Uses `systeminformation` package for actual CPU, GPU, RAM, and disk info
- **Key Files**:
  - `electron/main.js`: IPC handlers, window management, deep-link handling
  - `electron/preload.js`: Context bridge exposing unified API
  - `electron/tweak-executor.js`: Registry/PowerShell tweak execution
- **API Namespaces**:
  - `electronAPI.system`: getInfo, getSpecs, getRamUsage, getAllDisks
  - `electronAPI.telemetry`: getLive, getEnhanced (real CPU/RAM/temp data)
  - `electronAPI.tweaks`: execute, checkStatus, syncAll, getLocalState
  - `electronAPI.auth`: onCallback, removeCallbackListener (deep-link OAuth)
  - `electronAPI.window`: minimize, maximize, close
- **Stability Guarantees**: All IPC handlers use try/catch with stable fallback shapes (never undefined/null)
- **Performance**: System specs cached per app boot, telemetry polling at 1-2 second intervals

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle Kit**: Database migrations in `./migrations` directory

### Authentication
- **Replit Auth**: OpenID Connect integration for user authentication
- Required environment variables: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`

### Third-Party Libraries
- **Recharts**: Data visualization for live telemetry graphs
- **date-fns**: Date formatting utilities
- **Zod**: Schema validation for API requests
- **Framer Motion**: Animation library

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal`: Development error overlay
- `@replit/vite-plugin-cartographer`: Development tooling
- `@replit/vite-plugin-dev-banner`: Development banner

### External Links
- Discord community link
- TikTok social link

### Premium Audio System
- **Shared AudioContext**: Single persistent `AudioContext` in `client/src/lib/premium-audio.ts`
- **Preloading**: `preloadAudio()` called on first user click/keydown to warm the context
- **Premium Sounds**: cinematic hum, rising tone, pulse tick, metallic snap, premium chime, success chime
- **UI Sounds**: toggle on/off (pitch up/down), nav click (soft tap), RAM clear (whoosh), AI scan (triple beep)
- **Integration Points**: Sidebar nav, TweakCard toggles, NetworkTweaks toggles, PowerPlan toggles, Dashboard RAM clear + AI scan
- **Controls**: Sound toggle in Settings (default ON), persisted via Zustand + `sc_sound_effects` localStorage
- **Safety**: Respects `prefers-reduced-motion` and sound toggle; max volume 0.4

### AppFlow State Machine (client/src/App.tsx)
- **Type**: `"none" | "firstTime" | "premiumUnlock" | "premiumTour"`
- **Exclusive**: Only ONE flow runs at a time; centralized useEffect with priority ordering
- **Priority Order**: 1) First-time onboarding → 2) Premium unlock animation → 3) Premium guided tour
- **Hydration Guard**: Effect returns early if `phase !== "authenticated"`, `!user.loggedIn`, or `activeFlow !== "none"`
- **Two-Stage Entitlements**: `entitlementsAttempted` (true after first attempt), `entitlementsOk` (true only on success). First-time tour requires `attempted`; premium unlock/tour require `ok`.
- **Unlock Session Guard**: `unlockFiredThisSessionRef` prevents re-triggering unlock animation within a single app session
- **Optimistic Local Update**: On unlock complete, `hasSeenPremiumUnlock` set true locally before server call
- **Kill Switch**: `isResetting` boolean — when true, ALL overlays unmount and flow decision effect returns early. Set by `factoryReset()` before logout.
- **Entitlement Refresh**: Paused during active flows (visibility/focus handlers check `activeFlowRef`)
- **Reset App Data**: Two buttons: "Reset Settings" (keeps auth, clears UI via zustand resetData only) and "Factory Reset" (kill switch → performFullLogout → clear storages → reload/relaunch)
- **resetData Safety**: Only resets tweaks, history, stats, latestAIScan, account.stats. Does NOT touch onboarding (`sc_tour_completed_*`, `sc_welcomed_*`) or premium server flags.

### Premium Guided Tour
- **Step Order**: Power Plan → Network Tweaks → BIOS Advisor → AI Advisor → Settings → Priority Email → Priority Support Unlocked
- **Trigger**: Controlled by AppFlow state machine (`activeFlow === "premiumTour"`)
- **Replay Prevention**: Server-driven via `user.hasSeenPremiumTour` flag; `postTourSeen()` called on completion
- **Navigation**: Auto-navigates to correct route per step (dashboard → settings)
- **Tour Selectors**: `data-tour="power-plan"`, `data-tour="network"`, `data-tour="bios-advisor"`, `data-tour="ai-advisor"`, `data-tour="settings"`, `data-tour="settings-email"`

### Priority Support
- **Email**: `switchcontrol67@gmail.com` visible ONLY to premium users in Settings
- **Features**: Copyable, mailto link, labeled "Priority Support"

### Notes
- All system optimization actions are **simulated** - no real Windows registry or system changes occur
- The "Requires local agent" badge indicates features that would need a native Windows component in production
- Database schema uses UUIDs generated via PostgreSQL's `gen_random_uuid()`