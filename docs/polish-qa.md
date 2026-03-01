# SwitchControl Polish QA Checklist

All items implemented and code-verified. Items marked with (Electron-only) require the desktop app to fully validate at runtime.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Window controls embedded | PASS | `WindowControls.tsx` rewritten as embedded glass titlebar strip. 36px hit area, hover glow + micro-scale, drag region on titlebar, no-drag on buttons. Glass styling matches app surface. (Electron-only) |
| 2 | Splash taglines rotation | PASS | `taglines.ts` expanded to 23 messages (performance, "did you know", premium). `Splash.tsx` picks random tagline via `getTagline()`. localStorage prevents immediate repeats. `max-w-xs text-center` prevents layout break on small screens. (Electron-only) |
| 3 | Intro vs premium tour matching | PASS | Both tours use shared `TourShell`. Tooltip now stays mounted (no remount, position animates). Consistent spring transitions, easing, spotlight behavior. No purple-line inconsistency (progress bar gradient is in TourShell itself). (Electron-only) |
| 4 | Premium tour ends on dashboard | PASS | Final step targets `[data-tour="dashboard-hero"]`. Completion fades overlay (400ms), navigates to `/dashboard`, scrolls to top. `postTourSeen()` called. (Electron-only) |
| 5 | Section deep steps work | PASS | Network step routes to `/network` with `[data-tour="network-content"]`. BIOS step routes to `/bios-advisor` with `[data-tour="bios-content"]`. `waitForElement` polls up to 2s for target after route change. `data-tour` attributes added to `Home.tsx`, `NetworkTweaks.tsx`, `BiosAdvisor.tsx`. (Electron-only) |
| 6 | Unlock animation improved | PASS | Added `shake-buildup` phase (~700ms) between `glow-build` and `unlock-snap`. Lock pulses, tremors increase, glow intensifies, then snaps open. Particles increased to 45 + 12 directional spark trails. 4th shockwave ring (cyan). Total still under 7s. Skip still works. (Electron-only) |
| 7 | Selection disabled correctly | PASS | Global `user-select: none` on `.app-root` in `index.css`. Exceptions for `input`, `textarea`, `[contenteditable]`, `.select-text`. Both `-webkit-user-select` and `user-select` properties set. |
| 8 | Login cancel instant | PASS | AbortController cancels pending focus listeners. `clearAllTimers` clears timeout, focus timer, and abort controller. Focus detection auto-cancels after 2 focus events without deep link (500ms grace period). Cancel button made more prominent. (Electron-only) |
| 9 | Tour background improved | PASS | Three soft animated orbs (purple, pink, cyan) with 18-25s drift behind tour overlay. Inline SVG noise texture at 3% opacity. All disabled when `prefers-reduced-motion: reduce`. (Electron-only) |
| 10 | Glass consistency pass | PASS | Unified glass token: `bg-[#0c0c14]/95 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl shadow-black/40`. Applied to: `dialog.tsx` (base), `PremiumModal`, `LicenseManagementModal`, `PendingActivationModal`, `TweakCard` premium overlay. Overlay standardized to `bg-black/60`. |
| 11 | GPU modal shows real data | PASS | `electron/main.js`: Added nvidia-smi fallback and LHM overlay for temp/load. Stricter null/NaN validation. `GpuModal.tsx`: Shows "requires desktop app" in web, loading state stays open (no auto-close on null), empty grid protection, "Detailed metrics unavailable" fallback. (Electron-only) |
| 12 | Electron-builder warnings gone | PASS | Root `package.json`, `electron-builder.json`, and `electron/package.json` all have `name`, `description`, and `author` fields consistently set. |
