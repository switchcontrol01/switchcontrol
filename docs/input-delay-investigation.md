# Input delay: feasibility and measured experiment

## Decision

**A generic 0–15 ms mouse-to-display value is unsupported by the current
instrumentation. Do not add one.** Windows PerfOS counters cannot supply it.

**A separate, opt-in “App event response” test is feasible:** measure browser
event creation → handler entry and browser event creation → next animation-frame
callback entry in the same renderer. Display those exact names, not “mouse input
latency”, “time to painted frame”, gaming latency, or mouse-to-photon latency.
The experiment below demonstrates this narrower measurement, not end-to-end timing.

This task delivers a reproducible research probe and an implementation recommendation,
not a production analyzer feature or a Windows certification. Existing analyzer
collection, models, stores, and presentation are intentionally unchanged.

## What the current analyzer actually knows

- `electron/latency-analyzer.js` collects cumulative DPC and interrupt 100 ns
  counters and `Timestamp_Sys100NS`, then divides their consecutive deltas to obtain
  CPU-time percentages. The timestamp is a counter denominator, not an input event.
- `sampledAt` is wall-clock UTC assigned by PowerShell after the queries. It
  establishes sample freshness, not a hardware event or display presentation time.
- Page faults/sec is a system-wide rate, not the duration of a page fault or a
  measure of input blocking.
- `client/src/lib/responsivenessMetrics.ts` validates those counters and stores their
  original units. `responsivenessModel.ts` summarizes distributions of CPU-time
  shares. Neither has correlated input or display timestamps.
- `latencyAnalyzerStore.ts`, `LatencyAnalyzer.tsx`, and `SignalBenchModel.tsx` consume
  these samples, not a stream of mouse events or presentation completions.

Even multiplying a percentage by its sampling interval gives aggregate CPU service
time, not the delay of any particular input. There is no defensible conversion.

## Timing sources considered

| Source | What it can observe | Requirements / reason not to treat it as end-to-end |
| --- | --- | --- |
| Native `QueryPerformanceCounter` (QPC) | High-resolution monotonic intervals between instrumented points on one Windows system | Ordinary user-mode API; `QueryPerformanceFrequency` supplies ticks/sec. QPC is a clock, not an input sensor or presentation callback. Recording QPC on receipt of `WM_INPUT` starts **after** earlier device/OS work. No physical actuation time is supplied by `RAWINPUTHEADER`. |
| `GetMessageTime` / `MSG.time` | Millisecond tick-count time when a message was placed in the thread queue | Ordinary desktop Win32 messaging; finite-width wrap and different clock domain from QPC. Not suitable for assuming sub-ms hardware latency. Do not subtract it directly from QPC or UTC. |
| `POINTER_INFO.PerformanceCount` | High-resolution counter when a pointer message was received; digitizer scan-time calibration is possible with supporting touch hardware | Windows 8+ native pointer handling. A real timestamp candidate for a **pointer-message-to-handler** native experiment, not physical click-to-display. Mouse `WM_POINTER` delivery requires mouse-in-pointer support; `EnableMouseInPointer` is process-lifetime configuration. Do not change Electron's process-wide input mode casually. Validate nonzero timestamps, pointer type, coalescing/history, QPC frequency and provenance on target Windows first. Not measured in this Linux experiment. |
| ETW / PresentMon | Correlated OS input and frame/presentation events; version-dependent input/display latency fields | Windows trace access: administrator or Performance Log Users membership; elevated rights can be needed for complete cross-account process details. Graphics API, presentation mode, trace loss, driver and instrumentation affect availability. PC latency markers can require application instrumentation. Its “photon” field names are **not** evidence of an optical sensor or measured panel response. Missing correlation stays unavailable. |
| Browser `Event.timeStamp` + `performance.now()` | Browser event timestamp → our handler entry → our next rAF callback entry | No administrator, kernel driver or special hardware; focused, visible renderer with working rAF. Same performance time origin. Browser/OS timestamp mapping is implementation-dependent. The rAF callback is before paint, not proof of a displayed frame. |
| `PerformanceEventTiming` | Browser event-dispatch delay and browser rendering-update timing | Feature-detect the actual Electron/Chromium version. `processingStart - startTime` is browser input delay. `duration` is rounded to 8 ms; ordinary event entries have a minimum 16 ms threshold (default 104 ms). Fast events missing from this stream must not be interpreted as zero. `first-input` is the exceptional once-per-document cross-check. |
| Optical measurement | Physical switch/actuation → luminance change at a selected screen location | A synchronized switch/contact signal plus photodiode/oscilloscope or calibrated high-speed-camera arrangement. Specify threshold, sensor position, scan-out location, monitor mode, and sampling error. NVIDIA's PC Latency Stats also requires game integration and excludes peripheral/display portions; it is not a general replacement for optical measurement. |

Sources are linked below; native Windows and ETW candidates were researched,
**not executed** in this environment.

## Reproducible measured experiment

### Files and commands

```sh
node --test scripts/input-timing/probe.test.mjs
node scripts/input-timing/run.mjs
# Optional manual probe, then open http://127.0.0.1:8080:
node scripts/input-timing/run.mjs --serve
```

The runner uses the existing `ws` dependency and system `chromium` executable
(`CHROMIUM_BIN` can select another executable). It starts a loopback-only file
server and a fresh, temporary headless browser profile, then closes both. The
container-only runner uses `--no-sandbox`; this is not a recommendation for
production Electron. No dependency, driver, service, registry change, cloud API,
or administrator access is required by the probe itself. Chromium was added to
the development Nix dependencies to run it here.

Raw output goes to ignored `generated-artifacts/input-timing-evidence.json`.
It includes all sample timestamps, rAF arguments, measured blocker windows,
Event Timing entries, browser version, time origin and summaries. A small,
checked-in evidence extract is in `input-timing-evidence.json` beside this report.
Subsequent runs will differ; the values below describe one actual run.

### Environment and procedure

Recorded **2026-11-14 04:51:50 UTC**, Linux x64, headless
**Chromium 138.0.7204.100**, non-cross-origin-isolated document.
Input was **CDP-injected mouse input**, not a real USB mouse. CDP injection is
reported as `isTrusted` by Chromium, so `isTrusted` alone never proves hardware origin.
No input timestamp was supplied in the CDP request; Chromium assigned it.
The host, network round trip and CDP command response times are **not** endpoints
of the reported intervals.

1. Install the event and first-input observers before injecting input.
2. Record 12 baseline `pointerdown` samples.
3. Record 12 samples with an intentional, measured 40 ms handler busy loop.
4. Record 6 samples with a 120 ms renderer task; send input from CDP about
   20 ms after scheduling that task. Assert the browser event timestamp falls
   **inside** the measured blocker window and handler entry is **after** its end.
5. Dispatch one JavaScript `PointerEvent` and assert that it is rejected.
6. Assert all 30 accepted samples were focused, visible, uninterrupted, finite
   and monotonically ordered in the same performance clock domain.

The last phase is a positive control for **pre-handler queueing**, distinct from
handler work. The first positive control verifies handler cost appears in the
event-to-callback interval, not incorrectly in the event-to-handler interval.

### Results (milliseconds)

| Phase | Samples | Event→handler median | Event→handler min–max | Event→callback median | Event→callback min–max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 12 | 0.30 | 0.20–0.70 | 1.45 | 0.40–15.80 |
| 40 ms handler work | 12 | 0.30 | 0.20–0.40 | 40.50 | 40.30–40.60 |
| Input queued during 120 ms renderer task | 6 | 99.35 | 99.30–99.60 | 99.55 | 99.40–99.90 |

All added handler-work samples recorded 40.0 ms of handler work at the exposed
clock precision. Values above 15 ms are preserved. No CPU percentage participates
in any calculation. P95 uses nearest rank; with these small groups it is the
maximum and should **not** be interpreted as a stable population tail estimate.

### Timestamp provenance checks

All timestamps below are milliseconds relative to the same document
`performance.timeOrigin = 1794631907440.6`. This epoch anchor is metadata only;
UTC subtraction is not used in any interval.

- First accepted pointer event: `event.timeStamp = 105.0`.
  Independently observed `first-input.startTime = 105.0`,
  `processingStart = 105.5`, and our immediate handler `performance.now() =
  105.69999999995343`. This agrees with the specified relationship:
  Event Timing's start is the event timestamp; dispatch begins before our handler.
- Queued sample: measured busy task `[1664.3999999999069,
  1784.3999999999069]`; event timestamp `1685.3999999999069`;
  handler timestamp `1785.0`. Thus event time was assigned before renderer
  unblocking, not simply fabricated at handler receipt. The measured
  event-to-handler interval is `99.60000000009313` ms.
- Baseline sample 3: rAF argument `161.866` predates the event timestamp
  `172.30000000004657`. Actual callback-entry `performance.now()` is
  `172.69999999995343`. Subtracting the rAF argument from an event would give an
  invalid negative interval here. **Use callback-entry `performance.now()`,
  never the rAF argument as a completion/paint timestamp.**
- One script-created event was rejected. Missing callbacks, out-of-order clocks,
  nonfinite values, hidden/blurred documents and focus loss during a sample
  produce invalid/missing measurements rather than a zero or a floor value.

These observations establish browser-level provenance and interval sensitivity.
They do not establish where a physical Windows HID report maps into Chromium's
event clock, nor which physical frame contains the color update.

## Scope, uncertainty and what is excluded

Observed:

```text
Chromium-assigned event timestamp
    → main-thread dispatch / our handler entry
    → our handler's synchronous work and DOM change
    → entry to the next rAF callback (before paint)
```

Not observed: switch debounce, mouse sensor/firmware, USB polling, wireless
transport, Windows HID timestamp origin, pre-browser OS delay, React commits in
the production app, render/compositor completion, GPU queues, DWM, scan-out, panel
processing or pixel response. A browser frame callback neither proves a color
change was painted nor identifies the corresponding presented frame.

The exposed `performance.now()` readings in this run had approximately 0.1 ms
steps; many decimal places in JSON are floating-point representation, not
accuracy. Clock coarsening affects both endpoints; there is no calibrated
absolute accuracy bound from this experiment. rAF scheduling varies with
refresh, frame phase, missed deadlines, load and visibility, and headless timing
does not validate real display refresh. The 120 ms workload is intentional, not a
real-world system latency claim. Six/twelve observations per condition establish
the mechanism, not a performance benchmark or confidence interval.

For comparison, one refresh interval is about 16.67 ms at 60 Hz or 6.94 ms at
144 Hz; this does not authorize subtracting a refresh interval or guessing a
display delay. Event Timing's 8 ms rounding and 16 ms minimum event threshold
also preclude using ordinary entries as a continuous 0–15 ms readout.

## Concrete product implementation recommendation

Keep the current PerfOS view and data schema unchanged. Add a **separate,
explicitly started** test only after a Windows Electron acceptance run:

1. Put a dedicated interaction pad in the renderer, not an IPC/PowerShell poller.
   Name the feature **App event response**. Explain the before-paint boundary
   beside the results, not just in a tooltip.
2. Feature-detect timing support. Measure trusted `pointerdown` events on that pad
   with `event.timeStamp`, immediate handler `performance.now()`, and immediate
   `performance.now()` inside a one-shot rAF callback.
3. Save raw endpoints, `performance.timeOrigin`, source/schema version,
   Electron/Chromium version, visibility/focus, and sample validity. Use a separate
   store/export, not `NativeCounterSample`, `MeasuredCapture`, or the PerfOS
   responsiveness model. Never merge these milliseconds with CPU-time shares.
4. Use the Event Timing API as an optional provenance cross-check, not a fast-event
   fallback. Exclude synthetic JS input; clearly mark automation as automation.
   Handle unsupported/mixed-epoch timestamps as unavailable, not corrected guesses.
5. Require visible focus throughout; cancel pending callbacks on stop/navigation,
   discard interrupted samples, time out missing frames, and release listeners.
   Display median, range, valid/rejected counts and sample count. Preserve all
   tails; do not clamp, score against 15 ms, or claim “hardware optimized”.
6. Validate on the shipped Electron version with real Windows mouse input, normal
   and reduced-motion settings, 60/144+ Hz displays, busy main thread, minimize,
   background, navigation and light/performance modes. Probe code is an isolated
   DOM experiment; production React/rendering overhead is deliberately unproven.

For native expansion, the next defensible experiment is a **separate** Win32
pointer-message test using validated `POINTER_INFO.PerformanceCount` and local QPC
handler timestamps, or a controlled native rendering test correlated with
PresentMon. Preserve 64-bit ticks as strings across JSON and subtract before
conversion: `(endQpc - startQpc) * 1000 / frequency`. Do not compare unrelated
QPC, Sys100NS, message tick-count, UTC, or renderer clock domains without a
measured mapping and error bound. This still does not include panel response.

**Final conclusion:** proceed only with the scoped app-event test if useful to
users; leave general hardware input delay explicitly unsupported. Measuring actual
mouse-to-photon delay needs external synchronized evidence or a fully validated,
instrumented pipeline with its missing physical portions stated.

## Sources consulted

- [Microsoft: high-resolution timestamps and QPC](https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps)
- [Microsoft: RAWINPUTHEADER fields](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputheader)
- [Microsoft: GetMessageTime](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmessagetime)
- [Microsoft: POINTER_INFO / PerformanceCount](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-pointer_info)
- [Microsoft: EnableMouseInPointer process-lifetime behavior](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enablemouseinpointer)
- [W3C: Event Timing API, endpoints, threshold and rounding](https://www.w3.org/TR/event-timing/)
- [MDN: requestAnimationFrame callback and timestamp semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [PresentMon: requirements and limitations](https://github.com/GameTechDev/PresentMon)
- [PresentMon console metrics and instrumentation switches](https://github.com/GameTechDev/PresentMon/blob/main/README-ConsoleApplication.md)
- [NVIDIA: PC latency versus end-to-end latency and integration requirements](https://developer.nvidia.com/blog/understanding-and-measuring-pc-latency/)
