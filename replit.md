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
- **WebsiteShell**: Provides a consistent layout with three variants (full, inner, minimal). Accepts `bgVariant` prop ("landing" | "pricing" | "download" | "auth" | "legal" | "success") to select variant-specific layered backgrounds. Premium glass header with subtle glow, hover underlines, blur-on-scroll. Shared footer. All 8 website routes use this shell.
- **WebsiteBackground**: Multi-layer background system (`client/src/components/website/WebsiteBackground.tsx`) with variant-based configuration. Layers: base gradient → vignette → technical SVG overlays (PCB traces, node graphs, frametime waveforms, topo lines, packet routes) with CSS keyframe drift animations → blurred glow hotspots → hardware silhouettes (CSS shapes) → mouse-follow spotlight → fractal noise. Parallax on scroll moves SVG layers at different rates.
- **GlassPanel**: A versatile glass-effect component with different material variants (default, elevated, matte) and optional glow accents or hover effects.
- **GlowButton**: Primary call-to-action button with a glow rim and micro-animations. Variants: primary, cyan. Sizes: default, sm, lg.
- **GhostButton**: Secondary CTA with minimal border styling.
- **SectionHeader**: Consistent title + subtitle + optional `titleAccent` (gradient accent text) + optional pill badge.
- **SectionDivider**: Horizontal gradient divider with optional `glow` prop.
- **SectionGlow**: Ambient glow bands between sections for depth transitions — radial gradients in purple, cyan, or mixed.
- **Landing Hero**: Centered layout with mixed font weights (extralight + bold, inspired by HackerRank). "Performance Engineering" pill. App mockup centered below text with perspective float animation (inspired by ToDesktop). Three-column feature strip below hero. Minimal scroll indicator.
- **HeroBackground**: Gradient glow + two subtle animated blobs + noise grain. No SVG waves, no particles, no contour lines.
- **Typography Pattern**: Mixed font weights (font-extralight for context text, font-bold for emphasis) used across hero, social proof, and CTA sections.
- **FAQ**: Elevated glass panel with inner noise texture, hover expand animation. Background pattern visible through translucent glass.
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

### AI Advisor System
A fully local, deterministic rule engine evaluates system and application signals against a bundled ruleset (`bundled.ruleset.json`). It provides recommendations (critical, recommended, informational) and can trigger app-tweak fixes. The advisor is read-only and does not modify core application state.

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

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal`
- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`

### External Links
- Discord community link
- TikTok social link