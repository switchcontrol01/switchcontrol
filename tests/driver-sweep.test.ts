import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { openFileFixture } from "./helpers/chromium";

test("packaged-file motherboard sweep visibly runs once, replays on Rescan, and honors app Reduce Motion", { timeout: 40_000 }, async () => {
  const src = `file://${path.resolve("client/public/images/driver-intel/aorus-ice-holographic-render.png")}`;
  const bundle = await build({
    stdin: { contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { MotherboardArtwork } from "./client/src/components/driver-intel/MotherboardArtwork";
      function Fixture() {
        const [token, setToken] = useState(0);
        const [enabled, setEnabled] = useState(true);
        const [entry, setEntry] = useState(0);
        window.rescan = () => setToken(t=>t+1);
        window.reduce = () => setEnabled(false);
        window.reenter = () => { setToken(0); setEntry(e=>e+1); };
        return <div className="driver-intel-page" data-reduced-motion={enabled ? "false" : "true"}
          style={{height:620,width:620,padding:0}}>
          <div className="di-board-art">
            <MotherboardArtwork key={entry} src={${JSON.stringify(src)}} alt="Test motherboard"
              rescanToken={token} motionEnabled={enabled}/>
            <button className="di-hotspot is-active" id="cpu" style={{left:"52%",top:"35%"}}>
              <span className="di-node"><i/></span>
            </button>
          </div>
        </div>;
      }
      createRoot(document.getElementById("root")).render(<Fixture/>);
      window.sweepTransitions=[];
      let previous="";
      new MutationObserver(()=>{
        const value=document.querySelector("canvas")?.dataset.sweepState;
        if(value && value!==previous) {window.sweepTransitions.push({state:value,time:performance.now()});previous=value;}
      }).observe(document.getElementById("root"),{childList:true,subtree:true,attributes:true});
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = fs.readFileSync("client/src/components/driver-intel/driver-board-inspector.css", "utf8")
    .replace(/@import[^;]+;/g, "");
  const browser = await openFileFixture(`<!doctype html><html class="app-light-mode"><head><style>
    body{margin:0;background:#0d1420}${css}
    </style></head><body><div id="root"></div><script>window.addEventListener("error",e=>window.fixtureError=e.message);</script><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`);
  try {
    // Reproduce Windows Animation Effects being disabled without disabling the
    // app's explicitly requested motion. Light theme must not hide the sweep.
    await browser.page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await browser.navigate();
    const canvas = `document.querySelector("canvas")`;
    try {
      await browser.waitFor(`${canvas}?.dataset.sweepState === "pending"`);
    } catch (error) {
      console.log(await browser.evaluate(`({error:window.fixtureError,html:document.getElementById("root")?.innerHTML.slice(0,1800),ready:document.readyState,transitions:window.sweepTransitions})`));
      throw error;
    }
    assert.equal(await browser.evaluate(`document.querySelector("img").src.startsWith("file:")`), true);
    const capture = () => browser.page("Page.captureScreenshot", {
      format: "png", clip: { x: 0, y: 0, width: 620, height: 620, scale: 1 },
    }).then(value => value.data as string);
    const before = await capture();
    await browser.waitFor(`${canvas}?.dataset.sweepState === "running"`);
    await new Promise(resolve => setTimeout(resolve, 650));
    const during = await capture();
    assert.ok(during !== before, "The light sweep must visibly change the rendered board, not only its state.");
    await browser.waitFor(`${canvas}?.dataset.sweepState === "complete"`);
    const after = await capture();
    assert.ok(after !== during, "The completed board must no longer display the mid-sweep light.");
    assert.equal(await browser.evaluate(`getComputedStyle(${canvas}).opacity`), "0", "No persistent tint may remain.");
    let transitions = await browser.evaluate("window.sweepTransitions");
    const start = transitions.find((entry: any) => entry.state === "running").time;
    const finish = transitions.find((entry: any) => entry.state === "complete").time;
    assert.ok(finish - start >= 1450 && finish - start < 2000, `Unexpected sweep duration ${finish-start}`);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await browser.evaluate(`window.sweepTransitions.filter(t=>t.state==="running").length`), 1);
    await browser.evaluate("window.rescan()");
    await browser.waitFor(`window.sweepTransitions.filter(t=>t.state==="running").length === 2`);
    await browser.waitFor(`${canvas}?.dataset.sweepState === "complete"`);
    await browser.evaluate("window.reenter()");
    await browser.waitFor(`window.sweepTransitions.filter(t=>t.state==="running").length === 3`);
    await browser.waitFor(`${canvas}?.dataset.sweepState === "complete"`);
    const style = await browser.evaluate(`({
      select:getComputedStyle(document.querySelector(".di-board-art")).userSelect,
      glow:getComputedStyle(document.querySelector(".di-node")).boxShadow,
      mask:getComputedStyle(document.querySelector("canvas")).maskImage,
      display:getComputedStyle(document.querySelector("canvas")).display
    })`);
    assert.equal(style.select, "none");
    assert.equal(style.mask, "none");
    assert.notEqual(style.display, "none");
    assert.doesNotMatch(style.glow, /142, 205, 231/);
    await browser.evaluate("window.reduce()");
    await browser.evaluate("window.rescan()");
    await new Promise(resolve => setTimeout(resolve, 1700));
    assert.equal(await browser.evaluate(`window.sweepTransitions.filter(t=>t.state==="running").length`), 3);
    assert.equal(await browser.evaluate(`getComputedStyle(${canvas}).opacity`), "0");
    console.log("Verified visible entry, Rescan and re-entry sweeps using the actual PNG and component over file://; no tint remained.");
  } finally {
    await browser.close();
  }
});
