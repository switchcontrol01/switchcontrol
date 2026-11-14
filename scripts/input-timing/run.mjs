// Dependency-free apart from the project's existing ws package and system Chromium.
// node scripts/input-timing/run.mjs [--serve]
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { summarize } from "./probe.mjs";

const serveOnly = process.argv.includes("--serve");
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = { "/": "probe.html", "/probe.mjs": "probe.mjs" }[path];
  if (!file) { res.writeHead(404).end(); return; }
  try {
    res.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : "text/javascript");
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(new URL(file, import.meta.url)));
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise(resolve => server.listen(serveOnly ? 8080 : 0, "127.0.0.1", resolve));
if (serveOnly) {
  console.log("Research probe: http://127.0.0.1:8080");
} else {
  const profile = await mkdtemp(`${tmpdir()}/input-timing-`);
  let browser;
  let ws;
  const pending = new Map();
  try {
    browser = spawn(process.env.CHROMIUM_BIN || "chromium", [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const endpoint = await new Promise((resolve, reject) => {
      let log = "";
      const timeout = setTimeout(() => reject(new Error(`Chromium startup timeout: ${log}`)), 15000);
      browser.once("error", error => { clearTimeout(timeout); reject(error); });
      browser.once("exit", code => { clearTimeout(timeout); reject(new Error(`Chromium exited ${code}: ${log}`)); });
      browser.stderr.on("data", data => {
        log += data;
        const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    let nextId = 0;
    ws.on("message", data => {
      const message = JSON.parse(String(data));
      if (!message.id) return;
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timeout);
      message.error ? call.reject(new Error(JSON.stringify(message.error))) : call.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const version = await send("Browser.getVersion");
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` }, sessionId);
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 5000;
      const check = () => window.inputTimingProbe ? resolve(true) :
        performance.now() > deadline ? reject("Probe failed to load") : setTimeout(check, 25);
      check();
    })`);
    await send("Page.bringToFront", {}, sessionId);
    const box = await evaluate(`(() => {
      const r = document.querySelector("#pad").getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    for (const phase of ["baseline", "handler-work", "queued-input"]) {
      await evaluate(`inputTimingProbe.workloadMs = ${phase === "handler-work" ? 40 : 0}; inputTimingProbe.phase = "${phase}"`);
      for (let index = 0; index < (phase === "queued-input" ? 6 : 12); index++) {
        const count = await evaluate("inputTimingProbe.rows.length");
        if (phase === "queued-input") {
          await evaluate(`setTimeout(() => {
            const start = performance.now();
            while (performance.now() - start < 120) {}
            inputTimingProbe.blockWindows.push({ start, end: performance.now() });
          }, 0); true`);
          // Send from the browser process while renderer JavaScript is occupied.
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...box, button: "left", clickCount: 1 }, sessionId);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...box, button: "left", clickCount: 1 }, sessionId);
        await evaluate(`new Promise((resolve, reject) => {
          const deadline = performance.now() + 3000;
          const check = () => inputTimingProbe.rows.length > ${count} ? resolve(true) :
            performance.now() > deadline ? reject("No sample") : setTimeout(check, 10);
          check();
        })`);
        // A different phase relative to vsync; not a fixed refresh-rate assumption.
        await new Promise(resolve => setTimeout(resolve, 21 + index * 3));
      }
    }
    await evaluate(`document.querySelector("#pad").dispatchEvent(new PointerEvent("pointerdown"))`);
    await new Promise(resolve => setTimeout(resolve, 250)); // Let Event Timing observers flush.
    const data = await evaluate("inputTimingProbe");
    const first = data.eventTiming.find(entry => entry.entryType === "first-input" && entry.name === "pointerdown");
    assert.ok(first, "First-input timing must be exposed for timestamp cross-check");
    assert.equal(first.startTime, data.rows[0].eventTimeStamp);
    assert.ok(first.processingStart >= first.startTime && first.processingStart <= data.rows[0].handlerNow);
    assert.equal(data.rows.length, 30);
    assert.equal(data.rejected, 1, "JavaScript-dispatched events must be rejected");
    assert.ok(data.rows.every(row => row.intervals.valid), "Inactive or invalid samples fail the experiment");
    assert.ok(data.rows.filter(row => row.workloadMs === 40).every(row => row.intervals.handlerWorkMs >= 40));
    const queued = data.rows.filter(row => row.phase === "queued-input");
    assert.equal(queued.length, data.blockWindows.length);
    queued.forEach((row, index) => {
      const block = data.blockWindows[index];
      assert.ok(row.eventTimeStamp >= block.start && row.eventTimeStamp < block.end,
        "Browser event timestamp must precede unblock, not be assigned at handler entry");
      assert.ok(row.handlerNow >= block.end);
      assert.ok(row.intervals.eventToHandlerMs > 0);
    });
    const report = {
      schemaVersion: 1, recordedAt: new Date().toISOString(),
      platform: process.platform, arch: process.arch, version,
      mode: "headless Chromium; CDP-injected mouse, not physical hardware",
      scope: "event creation to handler / next rAF callback entry; no paint or photons",
      provenanceChecks: {
        firstInputStartEqualsEventTimestamp: true, processingStartBeforeHandler: true,
        syntheticEventRejected: true, queuedEventTimestampPrecedesRendererUnblock: true,
      },
      ...data,
      summaries: ["baseline", "handler-work", "queued-input"].map(phase => ({
        phase,
        ...Object.fromEntries(["eventToHandlerMs", "handlerWorkMs", "eventToFrameCallbackMs"].map(field => [
          field, summarize(data.rows.filter(row => row.phase === phase), field),
        ])),
      })),
    };
    await mkdir("generated-artifacts", { recursive: true });
    const out = "generated-artifacts/input-timing-evidence.json";
    await writeFile(out, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ out, provenanceChecks: report.provenanceChecks, summaries: report.summaries }, null, 2));
  } finally {
    for (const call of pending.values()) clearTimeout(call.timeout);
    ws?.terminate();
    if (browser && browser.exitCode === null) {
      browser.kill("SIGKILL");
      await new Promise(resolve => browser.once("exit", resolve));
    }
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
