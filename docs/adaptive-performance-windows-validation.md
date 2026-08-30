# Adaptive performance: Windows validation

The automated tests cover normalization, deterministic profile decisions,
missing data, reduced motion, and policy mapping. The following checks require a
real Windows Electron build because Chromium GPU status, RDP, display scaling,
and AC/battery events are not faithfully available in the web development VM.

## Before each check

1. Start a fresh packaged build and open **Settings → Application Mode**.
2. Leave the performance selection on **Automatic**.
3. Confirm the active profile and “Why this profile” reasons are visible.
4. Keep **Reduced motion** off unless the scenario explicitly tests it.
5. Open the performance monitor with `Ctrl+Shift+P`. Record the active
   `rendererProfile`/`electronProfile`,
   `rendererCadenceMs`/`electronRequestedMs`, `electronActualMs`, and
   `electronDemandMode`. Matching profile and requested cadence values are
   required on active routes; a paused route should report `paused` in the
   renderer. `electronActualMs` may be slower while the CPU governor is active.

## Scenarios

### Software rendering or blocked GPU driver

- Launch Electron with GPU acceleration disabled, or use a machine whose
  Chromium GPU diagnostics report a blocked/software feature.
- Expect **Efficiency** and a software-rendering or unavailable-acceleration
  reason.
- Confirm the ambient background is static, the cursor spotlight is absent,
  graph animation is disabled, and current telemetry values still update.

### Remote Desktop

- Connect through Windows Remote Desktop and reopen/restore SwitchControl.
- Expect the snapshot to refresh after the display/session transition.
- Expect **Efficiency** when RDP is identified, with no reload or duplicate
  telemetry loop.
- Disconnect to the console session and confirm Automatic can move back to the
  locally appropriate profile.

### Battery and AC transitions

- On a laptop, unplug AC while Settings is open.
- Confirm the reason updates to show battery operation and the profile becomes
  no more expensive than **Balanced**.
- Reconnect AC and confirm the automatic decision refreshes without resetting
  the active route, cleanup/tweak operations, or telemetry history.

### High-DPI and display changes

- Move the window between 100% and 175–200% scaled displays, then dock/undock.
- Confirm display scale and monitor count refresh without relaunching.
- High DPI should add a conservative reason, but should not force a capable
  accelerated desktop into Efficiency on its own.

### Integrated graphics

- Test Intel UHD/Iris and AMD integrated graphics machines.
- Expect a shared-resource reason and normally **Balanced**, unless another
  strong constraint (software rendering, RDP, low CPU/RAM) selects Efficiency.

### Manual override and reduced motion

- Select each manual profile and confirm it persists across relaunch.
- Switch back to Automatic and confirm the detected decision becomes active.
- Enable Reduced motion while Enhanced is selected. All ambient and chart
  animation must stop; Reduced motion always wins over the profile override.
- Relaunch after selecting each manual profile and confirm the selected
  override remains active. Select **Automatic**, relaunch, and confirm the
  detected profile—not the previous manual choice—is active.

## Pass criteria

- No fabricated telemetry values or “healthy” defaults appear when a probe is
  unavailable.
- Background/hidden-window pausing and route demand continue to take precedence.
- Capability changes do not reload the renderer, stack event listeners, or
  create duplicate Electron telemetry loops.
- The performance monitor shows the same profile and cadence on both sides of
  the Electron IPC boundary, and changing a profile updates the cadence without
  waiting for the old interval to elapse.