# App Booster — Game Sentinel + Real Optimizations

## What & Why
App Booster currently hurts the games it's supposed to help. Two concrete problems:
1. The telemetry loop (systeminformation polls, GPU PowerShell spawns) competes for CPU during gameplay and causes frame time spikes and bad 1% lows.
2. The 6 per-game actions applied today are all fine but leave the highest-impact tweaks out — timer resolution, HPET disable, Win32PrioritySeparation foreground boost, NVIDIA max perf registry, E-core affinity exclusion on Intel 12th–14th gen, and per-interface Nagle/ACK disables.

This task fixes both by adding a Game Sentinel to `electron/main.js` and expanding `buildActionsForGame` to branch on `profileId` with a real competitive action set.

## Done looks like
- When a boosted game's process is detected running, the telemetry loop pauses (no SI polls, no PowerShell GPU counter spawns) and the polling interval is pushed to 30s minimum; it resumes automatically when the game exits.
- The App Booster UI shows a small "Game Active — SC throttled" status indicator while the sentinel is active.
- Competitive games (Fortnite, Valorant, CS2, Warzone) get 6 additional high-impact actions on top of the existing base set: Win32PrioritySeparation scheduler boost, timer resolution (0.5ms), HPET disable, NVIDIA max performance registry, E-core affinity exclusion (Intel 12th/13th/14th gen only), and per-interface TcpAckFrequency/TCPNoDelay (Nagle off).
- When a game profile is applied, App Booster automatically feeds into the existing Process Control system to low-priority known background processes (Discord, Steam, Epic launcher background workers, browser GPU processes) for the session; restores when the session ends.
- Simulation/open-world profiles get a lighter expanded set (NVIDIA max perf + memory management tweaks only; no HPET or E-core changes since those hurt these titles).

## Out of scope
- Changes to the actual frontend App Booster page layout beyond the sentinel status indicator.
- Devcon-based HPET device enumeration — use `bcdedit /deletevalue useplatformclock` only (no devcon dependency).
- FSO "exclusive fullscreen" detection/check (the existing FSO disable action remains unchanged).
- Any web/browser-side changes — this is Electron-only.

## Steps

1. **Game Sentinel in `electron/main.js`** — Add a `_sentinelGameExe` variable (set when a game profile is applied, cleared on revert). Add a `_sentinelLoop` async function that polls `tasklist` every 5 seconds using **`execFile('tasklist', ['/FI', 'IMAGENAME eq <exeName>'])`** — never `exec()` with a shell-interpolated string, since `_sentinelGameExe` can come from user-supplied manual game paths. Before passing to `execFile`, extract the bare filename using `path.basename(_sentinelGameExe)` — `tasklist /FI IMAGENAME` only accepts a bare exe name with no path separators, and a full path will silently fail to match. Validate the result is a non-empty string ending in `.exe` before using it. When the game process is detected: set `_telemetryLoopPaused = true`, set `_telemetryCurrentIntervalMs` to 30000, and emit `appBooster:sentinelStatus` IPC event with `{ active: true, exe }` to the renderer. When the process is no longer running: restore `_telemetryLoopPaused = false` and reset `_telemetryCurrentIntervalMs` to `TELEMETRY_BASE_MS`, emit `appBooster:sentinelStatus` with `{ active: false }`. Expose `appBooster:setSentinelGame` IPC handler so the frontend can register/unregister the game exe to watch.

2. **Sentinel status UI** — In the App Booster frontend page, subscribe to `appBooster:sentinelStatus` events (via `window.electronAPI`). When active, show a small pill badge — "Game Active — SC throttled" — in the page header or near the active profile card. Style it in cyan with a pulsing dot to match existing live indicators.

3. **Expand competitive action set in `server/lib/appBoosterProfiles.ts`** — Add PowerShell builder functions for the new actions:
   - `buildWin32PriorityPs` — sets `Win32PrioritySeparation` to 38 (0x26) in `HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl`. Apply/revert/check pattern. `requiresRestart: false`.
   - `buildTimerResolutionPs` — apply: `bcdedit /set useplatformtick yes`. Revert: **`bcdedit /deletevalue useplatformtick`** (not `/set useplatformtick no` — that is invalid). Check: parse `bcdedit /enum {current}` output for the presence of a `useplatformtick` line. **`requiresRestart: true`** — bcdedit changes only take effect after reboot. Do not leave revert undefined or this becomes a one-way action.
   - `buildHpetDisablePs` — runs `bcdedit /deletevalue useplatformclock`. `requiresRestart: true`.
   - `buildNvidiaMaxPerfPs` — enumerates `HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\*` and filters subkeys where `ProviderName -like "*NVIDIA*"` to find the correct adapter key(s) — **do not hardcode `\0000`** as the path varies by driver version and GPU index. Writes `PreferedOpenGLImageUnits` and `PerfLevelSrc = 0x2222` to each matched key. Guard with a `Test-Path` check so it silently no-ops on non-NVIDIA systems. `requiresRestart: false`.
   - `buildECoreAffinityPs` — reads CPU topology at **apply-time** to derive the affinity mask dynamically — never hardcode a mask value, since i9-13900K (8P+16E) vs i5-12400 (6P+0E) produce completely different masks. **Do not use `NumberOfCores === NumberOfLogicalProcessors / 2` as the no-op guard** — this also matches any hyperthreaded non-hybrid CPU (e.g. 6C/12T) and would silently skip them. The correct hybrid check is whether `(Get-WmiObject Win32_Processor).Description` contains "Intel" AND `(Get-WmiObject Win32_Processor).Name` contains a generation string (12th/13th/14th gen) AND the number of logical processors exceeds twice the number of cores (i.e. `NumberOfLogicalProcessors > NumberOfCores * 2`), indicating E-cores exist beyond the HT pairs. If not a hybrid Intel CPU, exit as a no-op. Calculates the P-core-only affinity mask from `NumberOfCores` and sets `CpuAffinityMask` via IFEO on the game exe. `requiresRestart: false`.
   - `buildNagleOffPs` — sets `TcpAckFrequency=1` and `TCPNoDelay=1` on all non-loopback adapters via `HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\*`. `requiresRestart: false`.

   All builders follow the existing `apply / revert / check` pattern and use `isSafeWindowsPath` / `psEscape` where paths are involved.

4. **Branch `buildActionsForGame` on `profileId`** — Change the function to return the base 6 actions for all profiles, then append the competitive extras when `profileId === "competitive-high"`, and append the lighter set (NVIDIA max perf only) when `profileId === "simulation-ultra"` or `"open-world-performance"`. Single-player-quality keeps the base 6 only. The new actions are all marked `requiresAdmin: true` where elevation is needed, `requiresRestart: false` where the change takes effect immediately, and have accurate `impact` ratings.

5. **Wire App Booster → Process Control** — In `electron/main.js`, extend the `appBooster:executeAction` handler: when `mode === "apply"` completes successfully, automatically call `processControl.scan()` then `processControl.buildPlan(scanResult, "competitive")` then `processControl.applyPlan(plan)` in the background. Use `"competitive"` — the valid profile keys in `process-control.js` are `'safe'`, `'competitive'`, and `'extreme'`; `"performance"` does not exist and would silently return an empty plan. When `mode === "revert"`, call `processControl.restoreLast()`. Store the auto-applied result in a module-level `_boosterProcessPlan` variable so it can be cleanly restored. Errors from the process control step are non-fatal — log them but don't fail the primary action result.

## Relevant files
- `electron/main.js`
- `server/lib/appBoosterProfiles.ts`
- `electron/process-control.js`
- `server/routes/appBooster.ts`
