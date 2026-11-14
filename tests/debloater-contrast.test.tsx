import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../client/src/components/ui/button";
import { GlassCard } from "../client/src/components/ui/glass-card";

// Exercise actual shared components and production-built CSS in Chromium.
// No app authentication is bypassed and no uninstall handlers are mounted.
test("Debloater controls and cards remain readable in every light-surface state", { timeout: 40_000 }, async () => {
  const assetDir = path.resolve("dist/assets");
  assert.ok(fs.existsSync(assetDir), "Run npm run build before the contrast regression test.");
  const css = fs.readdirSync(assetDir).filter(name => name.endsWith(".css"))
    .map(name => fs.readFileSync(path.join(assetDir, name), "utf8")).join("\n")
    + "\n" + fs.readFileSync("client/src/components/debloater/Debloater.css", "utf8");
  const source = fs.readFileSync("client/src/components/debloater/InstalledAppsPanel.tsx", "utf8");
  assert.match(source, /debloater-installed-stat/);
  assert.match(source, /debloater-installed-no-results/);
  assert.match(source, /debloater-control-destructive/);
  const fixture = renderToStaticMarkup(
    <>
      <div className="debloater-page">
        <div className="debloater-installed">
          <Button id="rescan" variant="outline" className="debloater-control-secondary">Rescan</Button>
          <Button id="uninstall" variant="outline" className="debloater-control-secondary debloater-uninstall-trigger">Uninstall</Button>
          <Button id="disabled" variant="outline" disabled className="debloater-control-secondary opacity-40">Protected</Button>
          <Button id="secondary" variant="secondary">Secondary action</Button>
          <Button id="ghost" variant="ghost">More details</Button>
          <input id="search" data-testid="input-search-apps" className="bg-[#21262D]" defaultValue="Microsoft" />
          <div className="debloater-installed-safety bg-[#1A1F26]">
            <p id="safety" className="text-muted-foreground">Protected system apps cannot be uninstalled.</p>
          </div>
          <GlassCard id="stats-card" className="debloater-installed-stat">
            <p id="stats-label" className="text-muted-foreground/50">Total</p>
            <p id="stats-number">53</p>
          </GlassCard>
          <GlassCard id="empty-card" className="debloater-installed-no-results">
            <p id="empty-label" className="text-muted-foreground">No apps match the current filters</p>
            <button id="clear-filters" className="text-primary">Clear filters</button>
          </GlassCard>
          <div id="other-page-control" style={{ background: "#21262D", color: "#E6EAF0" }}>Unchanged baseline</div>
        </div>
      </div>
      <div className="debloater-dialog-root">
        <GlassCard className="debloater-confirm-card">
          <div className="debloater-confirm-note bg-[#21262D]">
            <p id="confirm-warning" className="text-muted-foreground">SwitchControl cannot undo this action.</p>
          </div>
          <Button id="cancel" variant="outline" className="debloater-control-secondary">Cancel</Button>
          <Button id="confirm" variant="destructive" className="debloater-control-destructive">Uninstall</Button>
          <Button id="confirm-disabled" variant="destructive" className="debloater-control-destructive" disabled>Uninstall</Button>
        </GlassCard>
      </div>
      <div className="debloater-progress-root">
        <GlassCard className="debloater-progress-card">
          <Button id="close" variant="outline" className="debloater-control-secondary">Close</Button>
          <Button id="results" className="debloater-control-primary">View Results</Button>
        </GlassCard>
      </div>
      <div><Button id="unscoped" variant="outline">Another page</Button></div>
    </>,
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "debloater-contrast-"));
  const html = path.join(dir, "fixture.html");
  fs.writeFileSync(html, `<!doctype html><html class="dark sc-reduced-motion"><head><style>${css}</style></head><body style="background:#10151b">${fixture}</body></html>`);
  const chrome = spawn("chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
    `--user-data-dir=${path.join(dir, "profile")}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let socket: WebSocket | undefined;
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let text = "";
      let finished = false;
      const finish = (url: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clearInterval(poll);
        resolve(url);
      };
      const timeout = setTimeout(() => {
        clearInterval(poll);
        reject(new Error(`Chromium did not expose its test connection: ${text.slice(-800)}`));
      }, 15_000);
      // Some Chromium wrappers do not forward the DevTools announcement.
      const poll = setInterval(() => {
        try {
          const [port, socketPath] = fs.readFileSync(path.join(dir, "profile", "DevToolsActivePort"), "utf8").trim().split("\n");
          if (port && socketPath) finish(`ws://127.0.0.1:${port}${socketPath}`);
        } catch {}
      }, 100);
      chrome.once("error", reject);
      chrome.stderr.on("data", data => {
        text += data.toString();
        const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) finish(match[1]);
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    socket.on("message", data => {
      const message = JSON.parse(data.toString());
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    const call = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Page.enable", {}, sessionId);
    await call("DOM.enable", {}, sessionId);
    await call("CSS.enable", {}, sessionId);
    const page = (method: string, params = {}) => call(method, params, sessionId);
    await page("Page.navigate", { url: `file://${html}` });
    for (let i = 0; i < 100; i++) {
      const ready = await page("Runtime.evaluate", { expression: "!!document.getElementById('cancel')", returnByValue: true });
      if (ready.result.value) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    const { root } = await page("DOM.getDocument");
    const sample = async (id: string, pseudo: string[] = []) => {
      const { nodeId } = await page("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
      assert.ok(nodeId, `Missing fixture element ${id}`);
      await page("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo });
      const evaluated = await page("Runtime.evaluate", {
        expression: `(() => {
          const el=document.getElementById(${JSON.stringify(id)});
          const style=getComputedStyle(el);
          let parent=el, background=style.backgroundColor;
          while ((background==='rgba(0, 0, 0, 0)' || background==='transparent') && parent.parentElement) {
            parent=parent.parentElement; background=getComputedStyle(parent).backgroundColor;
          }
          return {color:style.color,background,opacity:style.opacity,outline:style.outlineStyle};
        })()`,
        returnByValue: true,
      });
      await page("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      return evaluated.result.value as { color: string; background: string; opacity: string; outline: string };
    };
    const luminance = (rgb: string) => {
      const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    let checks = 0;
    for (const width of [1280, 560]) {
      await page("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const id of ["rescan", "uninstall", "disabled", "secondary", "ghost", "search", "safety", "stats-label", "stats-number", "empty-label", "clear-filters", "confirm-warning", "cancel", "confirm", "confirm-disabled", "close", "results"]) {
        for (const state of [[], ["hover"], ["focus-visible"]]) {
          const value = await sample(id, state);
          const a = luminance(value.color), b = luminance(value.background);
          const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          assert.ok(ratio >= 4.5, `${width}px ${id} ${state.join(",") || "normal"} contrast ${ratio.toFixed(2)}: ${JSON.stringify(value)}`);
          checks++;
        }
      }
      for (const id of ["stats-card", "empty-card"]) {
        const value = await sample(id, ["hover"]);
        assert.notEqual(value.background, "rgb(33, 38, 45)", `${id} retained dark hover surface`);
      }
    }
    assert.equal((await sample("disabled")).opacity, "1");
    assert.equal((await sample("cancel", ["focus-visible"])).outline, "solid");
    assert.equal((await sample("unscoped")).background, "rgb(33, 38, 45)", "Another page's outline button changed");
    console.log(`Passed ${checks} Chromium contrast checks using actual Button/GlassCard components and built app CSS.`);
  } finally {
    socket?.close();
    chrome.kill("SIGTERM");
    await new Promise(resolve => chrome.once("exit", resolve));
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
