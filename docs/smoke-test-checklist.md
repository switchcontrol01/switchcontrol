# SwitchControl Pre-Launch Smoke Test Checklist

## Web Application

### Auth & Onboarding
- [ ] Google OAuth login completes and redirects to `/dashboard`
- [ ] Discord OAuth login completes and redirects to `/dashboard`
- [ ] New user sees onboarding tour (first-time flow)
- [ ] Trial activation animation plays on first launch (if applicable)
- [ ] Trial countdown banner shows remaining time in sidebar

### Core Dashboard
- [ ] Dashboard loads without console errors
- [ ] Live telemetry connects (WebSocket status indicator)
- [ ] Activity Monitor shows real CPU/RAM data
- [ ] Predictive Warnings strip renders
- [ ] LatencyMap pipeline shows live values
- [ ] SystemAura gradient shifts with CPU load

### Tweaks
- [ ] Free tweaks can be toggled on/off
- [ ] Slider tweaks display correct values and apply/revert
- [ ] Premium tweaks show overlay for non-premium users
- [ ] TrustLayer expands with risk/impact details
- [ ] History entries populate after applying tweaks

### AI Advisor
- [ ] AI chat interface loads
- [ ] Quick action buttons send context + prompt
- [ ] Response streams and renders markdown
- [ ] Rate limit message shows after 3 requests in 5 min

### BIOS Advisor
- [ ] Scan initiates and shows "Analyzing system" phases
- [ ] Score summary card displays readiness score + confidence badge
- [ ] Detected / inferred counts render correctly

### Network Diagnostics (Premium)
- [ ] Ping sample returns 3 probes with avg/min/max/jitter
- [ ] Benchmark baseline records and persists
- [ ] Post-apply comparison shows improved/unchanged/worse verdict
- [ ] PC vs Internet diagnostics returns cross-provider variance
- [ ] Live graph renders Catmull-Rom spline with spikes detected

### Power & Network
- [ ] Power plan page shows intent mode selector
- [ ] Network tweaks page renders LatencyMap + live RX/TX
- [ ] Power plan changes reflect in UI state

### Settings & Account
- [ ] Settings page loads with all tabs
- [ ] Account info displays correct plan badge (Free / Trial / Premium)
- [ ] Plan badge in sidebar matches settings page
- [ ] Logout clears session and redirects to landing

### Premium Flows
- [ ] Stripe checkout redirect works
- [ ] Success page handles checkout session
- [ ] Premium unlock animation plays after payment
- [ ] Premium tour starts after unlock
- [ ] Premium features (AI, Network Diagnostics, BIOS) no longer gated

### Admin (if admin user)
- [ ] Admin panel loads at `/admin`
- [ ] User table paginates, searches, filters by plan
- [ ] Set plan dialog updates user plan + trial duration
- [ ] Admin toggle works (self-demotion blocked)
- [ ] Delete user requires confirmation text + reason
- [ ] Audit logs table loads and filters by user

### Website Pages
- [ ] Landing page loads with all animations (hero, mockup, charts)
- [ ] Pricing page shows correct plans + Stripe checkout buttons
- [ ] Download page shows "Available now" card + download button
- [ ] FAQ page expands/collapses items
- [ ] Terms + Privacy pages render
- [ ] All navigation links work (desktop + mobile)

## Electron Desktop App

### Startup
- [ ] Splash screen appears with random tagline
- [ ] Deep link login works (switchcontrol:// token exchange)
- [ ] App remembers session across restarts

### Desktop Shell
- [ ] Custom titlebar renders (WindowControls)
- [ ] Drag region works for moving window
- [ ] Minimize / maximize / close buttons function
- [ ] No native OS titlebar visible

### Telemetry
- [ ] Live telemetry IPC returns real system specs
- [ ] GPU data populates GPU modal
- [ ] CPU/RAM/network values update every 1.5s
- [ ] No fake/randomized data in production

### System Tweaks (Admin Required)
- [ ] Registry-based tweaks apply with UAC elevation
- [ ] Slider tweaks read/apply/verify/reset lifecycle works
- [ ] Revert restores original registry value
- [ ] History logs each tweak action

### Memory Cleaner
- [ ] Safe / Smart / Advanced modes function
- [ ] Results show freed memory
- [ ] No system instability after cleaning

### App Booster
- [ ] Scans installed applications
- [ ] Boost toggles work for supported apps
- [ ] Undo restores original state

### Debloater
- [ ] Installed apps list populates from registry
- [ ] Search + filter + sort work
- [ ] Uninstall triggers for safe apps (test in VM)
- [ ] Protected apps (Defender, etc.) blocked from uninstall

### Focus Mode
- [ ] Distraction list populates from running processes
- [ ] Blocking session starts and ends correctly
- [ ] Timer counts down accurately

### Auto-Update
- [ ] Updater detects new version from feed URL
- [ ] Download progress shows in UI
- [ ] Install on quit works
- [ ] No downgrade allowed
- [ ] Code-signed packages verify (when certificate configured)

### Device Lock (Premium)
- [ ] First premium login binds device
- [ ] Same device passes validation
- [ ] Different device shows lock screen with contact support + retry + exit
- [ ] Admin reset-premium-device clears binding

## Cross-Platform

### Responsive
- [ ] Website works on mobile viewport (320px+)
- [ ] Mobile nav hamburger opens/closes
- [ ] Dashboard cards stack vertically on narrow screens

### Performance
- [ ] First contentful paint < 2s on fast connection
- [ ] No memory leaks after 10 min of usage
- [ ] Animation frame rate stays at 60fps (check DevTools)

### Accessibility
- [ ] Tab navigation works through all interactive elements
- [ ] Focus indicators visible on buttons/inputs
- [ ] Reduced motion respected (`prefers-reduced-motion`)

## Deployment Verification

### Web
- [ ] `npm run build` completes without errors
- [ ] `dist/` folder contains expected assets (no .map files)
- [ ] Meta tags (Open Graph, Twitter Card) present in built HTML
- [ ] CSP headers active in production response
- [ ] HSTS header present

### Electron
- [ ] `npm run electron:build` completes without errors
- [ ] `npm run audit:package` reports 0 CRITICAL findings
- [ ] Installer size < 500 MB
- [ ] No .env, secrets, or source maps in asar
- [ ] `latest.yml` generated with correct version + SHA-512 hashes

## Post-Launch Monitoring

- [ ] Error tracking captures exceptions (Sentry / LogRocket configured)
- [ ] Server logs show expected request patterns
- [ ] Database connection pool healthy
- [ ] WebSocket connections stable
- [ ] Stripe webhooks return 200
