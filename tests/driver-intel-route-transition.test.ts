import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { openFileFixture } from "./helpers/chromium";

test("Driver Intelligence fades and blurs in and out over 1.5 seconds, with the app Reduce Motion opt-out", { timeout: 40_000 }, async () => {
  const appSource = readFileSync("client/src/App.tsx", "utf8");
  const pageSource = readFileSync("client/src/pages/DriverIntelligence.tsx", "utf8");
  const inspectorSource = readFileSync("client/src/components/driver-intel/DriverBoardInspector.tsx", "utf8");
  const preferencesStoreSource = readFileSync("client/src/stores/userPreferencesStore.ts", "utf8");
  assert.match(appSource, /const appReducedMotion = useUserPreferencesStore\(\(state\) => state\.reducedMotion\)/);
  assert.match(pageSource, /useUserPreferencesStore\(state => state\.reducedMotion\)/);
  assert.match(inspectorSource, /useUserPreferencesStore\(state => state\.reducedMotion\)/);
  assert.match(preferencesStoreSource, /interface UserPreferencesState extends UserPreferences/);
  for (const source of [appSource, pageSource, inspectorSource]) {
    assert.doesNotMatch(source, /state\.preferences\.reducedMotion/);
  }
  assert.match(appSource, /<DriverIntelRouteTransition\s+key="driver-intelligence-route"\s+reducedMotion=\{appReducedMotion\}/);
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: "tsx", contents: `
        import React, {useState} from "react";
        import {createRoot} from "react-dom/client";
        import {AnimatePresence, motion} from "framer-motion";
        import {DriverIntelRouteTransition} from "./client/src/components/driver-intel/DriverIntelRouteTransition";
        function Fixture(){
          const [route,setRoute]=useState("dashboard");
          const [reduced,setReduced]=useState(false);
          window.goDriver=()=>setRoute("driver");
          window.goDashboard=()=>setRoute("dashboard");
          window.setReduced=enabled=>setReduced(enabled);
          return <AnimatePresence mode="wait" initial={false}>
            {route==="driver"
              ? <DriverIntelRouteTransition key="driver-intelligence-route" reducedMotion={reduced}>
                  <main data-testid="driver-intel-screen">Driver Intelligence page content</main>
                </DriverIntelRouteTransition>
              : <motion.main key="dashboard" data-testid="dashboard-screen">Dashboard</motion.main>}
          </AnimatePresence>;
        }
        createRoot(document.getElementById("root")).render(<Fixture/>);
      `,
    },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const browser = await openFileFixture(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#0d1420;color:#eef3f7;font:24px sans-serif}
    main{width:780px;height:440px;padding:32px}
  </style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`);
  try {
    await browser.page("Emulation.setDeviceMetricsOverride", { width: 820, height: 480, deviceScaleFactor: 1, mobile: false });
    await browser.page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await browser.navigate();
    await browser.waitFor(`!!document.querySelector("[data-testid='dashboard-screen']")`);

    const entryStarted = Date.now();
    await browser.evaluate("window.goDriver()");
    await browser.waitFor(`!!document.querySelector("[data-driver-intel-route-transition]")`);
    const enteredWrapper = await browser.evaluate(`(() => {
      const route=document.querySelector("[data-driver-intel-route-transition]");
      return {duration:route.dataset.routeTransitionDuration, animationCount:route.getAnimations().length, filter:getComputedStyle(route).filter, opacity:Number(getComputedStyle(route).opacity)}
    })()`);
    assert.equal(enteredWrapper.duration, "1.5");
    assert.ok(enteredWrapper.animationCount > 0, "The page entrance must be a live browser animation.");
    assert.ok(enteredWrapper.filter.includes("blur("), "The entrance applies a real, rendered blur.");
    const entryFrame = await browser.page("Page.captureScreenshot", { format: "png" });
    await new Promise(resolve=>setTimeout(resolve, 650));
    const entryMidpoint = await browser.evaluate(`(() => {const el=document.querySelector("[data-driver-intel-route-transition]");return {opacity:Number(getComputedStyle(el).opacity),filter:getComputedStyle(el).filter}})()`);
    assert.ok(entryMidpoint.opacity > 0 && entryMidpoint.opacity < 1, "Entrance fade must have intermediate rendered opacity.");
    assert.notEqual(entryMidpoint.filter, "none", "Blur must remain visible during the entrance.");
    await browser.waitFor(`(() => {const el=document.querySelector("[data-driver-intel-route-transition]");return el&&getComputedStyle(el).opacity==="1"&&getComputedStyle(el).filter==="blur(0px)"})()`, 4000);
    assert.ok(Date.now()-entryStarted >= 1350, "The entrance must last approximately the requested 1.5 seconds.");
    const entryEndFrame = await browser.page("Page.captureScreenshot", { format: "png" });
    assert.notEqual(entryFrame.data, entryEndFrame.data, "Rendered entrance frames must visibly change.");

    const exitStarted = Date.now();
    await browser.evaluate("window.goDashboard()");
    await new Promise(resolve=>setTimeout(resolve, 650));
    const exitMidpoint = await browser.evaluate(`(() => {const el=document.querySelector("[data-driver-intel-route-transition]");return el?{opacity:Number(getComputedStyle(el).opacity),filter:getComputedStyle(el).filter,animations:el.getAnimations().length}:null})()`);
    assert.ok(exitMidpoint, "The route must stay mounted while its exit transition plays.");
    assert.ok(exitMidpoint.opacity > 0 && exitMidpoint.opacity < 1, "Exit fade must have intermediate rendered opacity.");
    assert.notEqual(exitMidpoint.filter, "none", "The route must blur as it leaves.");
    assert.ok(exitMidpoint.animations > 0);
    await browser.waitFor(`!document.querySelector("[data-driver-intel-route-transition]")`, 4000);
    await browser.waitFor(`!!document.querySelector("[data-testid='dashboard-screen']")`);
    assert.ok(Date.now()-exitStarted >= 1350, "The exit must last approximately the requested 1.5 seconds.");

    await browser.evaluate("window.setReduced(true);window.goDriver()");
    await browser.waitFor(`!!document.querySelector("[data-driver-intel-route-transition]")`);
    const reducedEntry = await browser.evaluate(`(() => {const el=document.querySelector("[data-driver-intel-route-transition]");return {duration:el.dataset.routeTransitionDuration,filter:getComputedStyle(el).filter,opacity:getComputedStyle(el).opacity,animations:el.getAnimations().length}})()`);
    assert.equal(reducedEntry.duration, "0");
    assert.equal(reducedEntry.animations, 0, "SwitchControl Reduce Motion removes the route animation.");
    assert.equal(reducedEntry.opacity, "1");
    assert.ok(
      reducedEntry.filter === "none" || /^blur\(0(?:\.0+)?px\)$/.test(reducedEntry.filter),
      "SwitchControl Reduce Motion clears the route blur.",
    );
    console.log("Verified rendered Driver Intelligence entry and exit: both fade and blur for 1.5s, the exit waits before unmounting, OS motion reduction does not disable them, and SwitchControl Reduce Motion stops them.");
  } finally {
    await browser.close();
  }
});
