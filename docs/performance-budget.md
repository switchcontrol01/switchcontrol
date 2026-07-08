# SwitchControl Performance Budget

## Purpose
Explicit, documented targets for frontend runtime performance so regressions are visible instead of assumed. Checked at runtime via the admin Performance Debug page.

## Targets

| Metric | Target | How Measured | Justification |
|--------|--------|------------|---------------|
| Dashboard open time | < 2 s | Time from route navigation to first paint of dashboard tiles | User expects immediate feedback |
| Idle CPU (system) | < 1% | telemetryStore cpu.load when app is idle | Tray-idle must be invisible to user |
| Idle RAM (renderer) | < 350 MB | `performance.memory.usedJSHeapSize` (Chrome/Electron) | Keeps Electron lean for gaming PCs |
| Minimum timer interval | >= 1 s (default >= 2 s) | `intervalGuard.ts` enforces 2 s floor | Prevents death-by-a-thousand-timers |
| No duplicate polling | Zero duplicate data sources | pollingRegistry shows only one entry per logical data stream | Each metric polled once, consumed many |
| React renders per telemetry frame | 1 | telemetryStore._onTick single set() | One render pass per second, not 3 |
| Active interval count | <= 15 | pollingRegistry.activeCount | Healthy app has bounded background work |
| WebSocket connections | 1 | telemetryManager WS singleton | One connection, shared by all consumers |
| IPC listeners (Electron) | <= 3 | Electron IPC channel count | Each channel = one IPC binding |
| LPM auto-enable threshold | >= 70% CPU for 15 s | performanceStore._onCpuTick | Must not jitter-flip under normal load |

## Current Status (as of v1.2.1)

- Dashboard open time: ~1.2 s (measured via page-timing.ts)
- Idle CPU: 0.3-0.8% (tray mode, no graphs visible)
- Idle RAM: ~280 MB (Electron renderer, no user data loaded)
- Timer floor: 2000 ms enforced by intervalGuard.ts
- Duplicate polling: consolidated (telemetry, network, AI each have one poller)
- React renders per frame: 1 (batched via _onTick)
- Active intervals: 6-8 in normal use, 12-14 with all panels open
- WebSocket: 1 (singleton telemetryManager)
- IPC listeners: 2 (telemetry + tweaks)
