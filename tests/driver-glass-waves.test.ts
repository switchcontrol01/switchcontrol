import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { openFileFixture } from "./helpers/chromium";

test("Driver Inspector glass layers actually move, stay below content and honor reduced-motion settings", { timeout: 30_000 }, async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: "tsx", contents: `
        import React from "react";
        import {createRoot} from "react-dom/client";
        import {DriverLiquidGlassWaves} from "./client/src/components/driver-intel/DriverLiquidGlassWaves";
        const panels=[
          ["di-metrics","health","Health overview"],
          ["di-board-stage","board","Component inspector"],
          ["di-inspector","inspector","Selected component"],
          ["di-component","component","Evidence at a glance"],
          ["di-news","news","Driver news"],
          ["di-ai","advisor","Driver advisor"]
        ];
        function Fixture(){
          return <main className="driver-intel-page" data-reduced-motion="false">
            {panels.map(([style,surface,label])=><section key={surface} className={style} data-test-surface={surface}>
              <DriverLiquidGlassWaves surface={surface}/>
              <div className="test-panel-content" data-test-label={label}>{label}</div>
            </section>)}
          </main>;
        }
        createRoot(document.getElementById("root")).render(<Fixture/>);
        window.setAppReducedMotion=enabled=>document.querySelector(".driver-intel-page").dataset.reducedMotion=String(enabled);
      `,
    },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = fs.readFileSync("client/src/components/driver-intel/driver-board-inspector.css", "utf8")
    .replace(/^@import[^\n]*\n/gm, "");
  const browser = await openFileFixture(`<!doctype html><html><head><style>
    body{margin:0;background:#0d1420}
    .driver-intel-page{width:760px;padding:24px;background:#0d1420}
    .test-panel-content{position:relative;z-index:2;padding:20px;color:#eef3f7}
    .di-metrics,.di-board-stage,.di-inspector,.di-component,.di-news,.di-ai{
      position:relative;isolation:isolate;overflow:hidden;min-height:118px;
      margin:12px 0;padding:4px;border:1px solid rgba(220,235,247,.22);
      border-radius:16px;background:linear-gradient(120deg,rgba(36,54,72,.56),rgba(19,30,45,.66));
      backdrop-filter:blur(18px)
    }
    ${css}
    .driver-intel-page > [data-test-surface]{min-height:132px;height:132px;margin:12px 0;padding:8px}
  </style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`);
  try {
    await browser.page("Emulation.setDeviceMetricsOverride", { width: 820, height: 1120, deviceScaleFactor: 1, mobile: false });
    // This emulates the user's Windows Animation Effects/performance tweak.
    // Deliberate feature motion must still run when SwitchControl didn't opt out.
    await browser.page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await browser.navigate();
    await browser.waitFor('document.querySelectorAll("[data-testid^=\\"driver-glass-\\"]").length === 6');
    const running = await browser.evaluate(`(() => ({
      surfaces:[...document.querySelectorAll("[data-testid^='driver-glass-']")].map(host=>({
        surface:host.dataset.testid, layers:host.querySelectorAll(".di-glass-tide__sheet").length,
        animations:[...host.querySelectorAll(".di-glass-tide__sheet")].map(layer=>({
          name:getComputedStyle(layer).animationName, play:getComputedStyle(layer).animationPlayState,
          id:layer.getAnimations()[0]?.animationName, time:layer.getAnimations()[0]?.currentTime,
        }))
      })),
      foreground:document.querySelector(".di-glass-tide").compareDocumentPosition(
        document.querySelector(".test-panel-content")) & Node.DOCUMENT_POSITION_FOLLOWING ? "over-wave" : "unexpected",
      palette:["--di-orange","--di-rose"].map(name=>getComputedStyle(document.querySelector(".driver-intel-page")).getPropertyValue(name).trim())
    }))()`);
    assert.equal(running.surfaces.length, 6);
    assert.deepEqual(running.surfaces.map((surface: any)=>surface.layers), [2,2,2,2,2,2]);
    for (const surface of running.surfaces) for (const layer of surface.animations) {
      assert.match(layer.name, /^di-liquid-glass-drift/);
      assert.equal(layer.play, "running");
      assert.ok(layer.id, "Chromium must instantiate a running CSS animation.");
    }
    assert.deepEqual(running.palette, ["#f2a26e","#e994b1"]);
    assert.equal(running.foreground, "over-wave");
    const screenshot = () => browser.page("Page.captureScreenshot", { format:"png", captureBeyondViewport:true })
      .then(result=>result.data as string);
    const before = await screenshot();
    const transformsBefore = await browser.evaluate(`Array.from(document.querySelectorAll(".di-glass-tide__sheet"),layer=>getComputedStyle(layer).transform)`);
    await new Promise(resolve=>setTimeout(resolve, 1300));
    const after = await screenshot();
    fs.writeFileSync("generated-artifacts/driver-glass-frame-before.png", Buffer.from(before,"base64"));
    fs.writeFileSync("generated-artifacts/driver-glass-frame-after.png", Buffer.from(after,"base64"));
    const transformsAfter = await browser.evaluate(`Array.from(document.querySelectorAll(".di-glass-tide__sheet"),layer=>getComputedStyle(layer).transform)`);
    assert.notEqual(after,before,"Rendered frame pixels must change over time as the glass waves move.");
    transformsAfter.forEach((transform:string,index:number)=>assert.notEqual(transform,transformsBefore[index],`Glass layer ${index} must move between frames.`));
    const elapsed = await browser.evaluate(`document.querySelector("[data-testid='driver-glass-inspector'] .di-glass-tide__sheet").getAnimations()[0].currentTime`);
    assert.ok(elapsed >= 1200, `The wave animation clock advanced only ${elapsed}ms.`);
    await browser.evaluate("window.setAppReducedMotion(true)");
    assert.equal(await browser.evaluate(`document.querySelectorAll(".driver-intel-page[data-reduced-motion=true] .di-glass-tide__sheet").length`),12);
    assert.equal(await browser.evaluate(`document.querySelector(".driver-intel-page[data-reduced-motion=true] .di-glass-tide__sheet").getAnimations().length`),0);
    await browser.evaluate(`document.querySelector(".driver-intel-page").dataset.reducedMotion="false";document.documentElement.classList.add("app-light-mode")`);
    assert.equal(await browser.evaluate(`document.querySelector(".driver-intel-page .di-glass-tide__sheet").getAnimations().length`),0,"Low-resource App Light Mode should strip this decorative motion.");
    console.log("Verified 12 live transform animations across health, board, inspector, evidence cards, news and advisor panels under simulated OS reduced-motion; screenshots visibly changed, app Reduced Motion and low-resource Light Mode stop the waves.");
  } finally {
    await browser.close();
  }
});
