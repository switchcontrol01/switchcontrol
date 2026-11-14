import test from "node:test";
import assert from "node:assert/strict";
import { deriveIntervals, summarize } from "./probe.mjs";

const row = {
  isTrusted: true, visibility: "visible", focused: true, interrupted: false,
  eventTimeStamp: 100, handlerNow: 101, workEndNow: 141, frameCallbackNow: 148,
};
test("intervals use callback-entry clock, not the older rAF timeline timestamp", () => {
  assert.deepEqual(deriveIntervals({ ...row, rafTimestamp: 95 }), {
    valid: true, eventToHandlerMs: 1, handlerWorkMs: 40,
    handlerToFrameCallbackMs: 47, eventToFrameCallbackMs: 48,
  });
});
test("zeros and slow samples remain real values without a 15ms clamp", () => {
  assert.equal(deriveIntervals({ ...row, handlerNow: 100 }).eventToHandlerMs, 0);
  assert.equal(deriveIntervals({ ...row, frameCallbackNow: 1100 }).eventToFrameCallbackMs, 1000);
});
test("untrusted, hidden, blurred and interrupted captures are not measurements", () => {
  for (const change of [
    { isTrusted: false }, { visibility: "hidden" }, { focused: false }, { interrupted: true },
  ]) assert.equal(deriveIntervals({ ...row, ...change }).valid, false);
});
test("missing callbacks, mixed epochs, reversed clocks and nonfinite values are invalid", () => {
  for (const change of [
    { frameCallbackNow: undefined }, { eventTimeStamp: Date.now() },
    { handlerNow: 99 }, { workEndNow: 149 }, { frameCallbackNow: NaN },
    { eventTimeStamp: -1 },
  ]) assert.equal(deriveIntervals({ ...row, ...change }).valid, false);
});
test("summaries exclude invalid rows, return null for no data and preserve tails", () => {
  assert.equal(summarize([], "eventToFrameCallbackMs"), null);
  const rows = [10, 20, 30, 1000].map(value => ({
    intervals: { valid: true, eventToFrameCallbackMs: value },
  }));
  rows.push({ intervals: { valid: false, eventToFrameCallbackMs: 0 } });
  assert.deepEqual(summarize(rows, "eventToFrameCallbackMs"), {
    count: 4, min: 10, median: 25, p95: 1000, max: 1000,
  });
});
