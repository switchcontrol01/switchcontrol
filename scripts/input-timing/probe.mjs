// Research-only: same-renderer clock intervals, never mouse-to-photon latency.
export function deriveIntervals(row) {
  const times = [row.eventTimeStamp, row.handlerNow, row.workEndNow, row.frameCallbackNow];
  if (!row.isTrusted) return { valid: false, reason: "untrusted-event" };
  if (row.visibility !== "visible" || !row.focused || row.interrupted) {
    return { valid: false, reason: "inactive-document" };
  }
  if (!times.every(Number.isFinite) || times[0] < 0 ||
      times.some((value, index) => index > 0 && value < times[index - 1])) {
    return { valid: false, reason: "invalid-clock-order" };
  }
  return {
    valid: true,
    eventToHandlerMs: row.handlerNow - row.eventTimeStamp,
    handlerWorkMs: row.workEndNow - row.handlerNow,
    handlerToFrameCallbackMs: row.frameCallbackNow - row.handlerNow,
    eventToFrameCallbackMs: row.frameCallbackNow - row.eventTimeStamp,
  };
}

export function summarize(rows, field) {
  const values = rows.filter(row => row.intervals?.valid)
    .map(row => row.intervals[field]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return {
    count: values.length,
    min: values[0],
    median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p95: values[Math.ceil(values.length * 0.95) - 1],
    max: values.at(-1),
  };
}

export function installProbe() {
  const pad = document.querySelector("#pad");
  const output = document.querySelector("#output");
  const state = {
    rows: [], eventTiming: [], blockWindows: [], rejected: 0, pending: false, workloadMs: 0,
    timeOrigin: performance.timeOrigin,
    userAgent: navigator.userAgent,
    crossOriginIsolated,
    supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
  };
  for (const type of ["first-input", "event"]) {
    if (!state.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver(list => {
      state.eventTiming.push(...list.getEntries().map(entry => ({
        entryType: entry.entryType, name: entry.name, startTime: entry.startTime,
        processingStart: entry.processingStart, processingEnd: entry.processingEnd,
        duration: entry.duration, interactionId: entry.interactionId,
      })));
    }).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
  }
  let interrupted = false;
  document.addEventListener("visibilitychange", () => { interrupted = true; });
  window.addEventListener("blur", () => { interrupted = true; });
  pad.addEventListener("pointerdown", event => {
    const handlerNow = performance.now(); // Read immediately, not after work or IPC.
    if (!event.isTrusted || state.pending) { state.rejected++; return; }
    interrupted = false;
    state.pending = true;
    const row = {
      id: state.rows.length + 1, eventTimeStamp: event.timeStamp,
      handlerNow, isTrusted: event.isTrusted, visibility: document.visibilityState,
      focused: document.hasFocus(), workloadMs: state.workloadMs,
      phase: state.phase ?? "manual",
    };
    // Deliberately known handler cost is a positive control, not an estimated delay.
    while (performance.now() - handlerNow < state.workloadMs) { /* measured busy work */ }
    row.workEndNow = performance.now();
    pad.style.background = state.rows.length % 2 ? "#204a87" : "#734125";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      row.interrupted = interrupted;
      row.intervals = deriveIntervals(row);
      state.rows.push(row);
      state.pending = false;
      output.textContent = JSON.stringify(state.rows.at(-1), null, 2);
    };
    const timeout = setTimeout(() => {
      cancelAnimationFrame(frame);
      row.timeout = true;
      finish(); // Missing callback stays invalid, not zero.
    }, 2000);
    const frame = requestAnimationFrame(timestamp => {
      row.frameCallbackNow = performance.now(); // Actual callback entry, before paint.
      row.rafTimestamp = timestamp; // Diagnostic only: NOT a paint/completion timestamp.
      clearTimeout(timeout);
      finish();
    });
  });
  document.querySelector("#workload").addEventListener("change", event => {
    state.workloadMs = event.target.checked ? 40 : 0;
  });
  // For automation: CDP input remains explicitly identified as injected input.
  window.inputTimingProbe = state;
}
