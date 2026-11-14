import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { openFileFixture } from "./helpers/chromium";

test("actual AppLayout paints immersive pages to the top, including while scrolled or offline", { timeout: 40_000 }, async () => {
  // Only environment providers are stubbed; AppLayout's actual JSX and built
  // Tailwind/CSS determine the measured position of its status row and main.
  const environment = `
    import React from "react";
    const empty=()=>null;
    export const Sidebar=empty, Toaster=empty, AppBackground=empty, UpdateModal=empty;
    const element=tag=>React.forwardRef(({animate,transition,initial,exit,style,...props},ref)=>
      React.createElement(tag,{...props,ref,style:{...style,...animate}}));
    export const motion={div:element("div"),main:element("main"),button:element("button")};
    export const AnimatePresence=({children})=>children;
    export const useMotion=()=>({prefersReducedMotion:true});
    export const useLocation=()=>[window.fixtureCase.route,()=>{}];
    export const isBackendReady=()=>true, onBackendReady=()=>()=>{};
    export const useNetworkStatus=()=>({});
    export const useTourStore=selector=>selector({isTourActive:false});
    export const useEntitlementUiState=()=>({status:"premium_active"});
    export const useAuth=()=>({isPremium:true});
    export const useUserPreferencesStore=selector=>selector({largeSidebar:window.fixtureCase.largeSidebar});
    export const useTranslation=()=>({t:key=>key});
    export const FIRST_RUN_TRANSITION_SECONDS=.6;
    export const Loader2=empty,Timer=empty;
    export const NetworkStatusChip=()=>window.fixtureCase.offline
      ? React.createElement("span",{"data-testid":"network-status-chip"},"Offline mode — local tools available")
      : null;
  `;
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React,{useState} from "react";
      import {createRoot} from "react-dom/client";
      import {AppLayout} from "./client/src/components/layout/AppLayout";
      window.fixtureCase={route:"/driver-intel",immersive:true,offline:false,largeSidebar:false};
      function Fixture(){
        const [version,setVersion]=useState(0);
        window.changeCase=value=>{window.fixtureCase=value;setVersion(n=>n+1)};
        const current=window.fixtureCase;
        return <div className="app-root">
          <div className="titlebar"><div className="titlebar-strip">
            <div className="titlebar-drag-region"/>
            <div className="titlebar-controls">
              <button className="titlebar-btn">−</button>
              <button className="titlebar-btn">□</button>
              <button className="titlebar-btn">×</button>
            </div>
          </div></div>
          <div className="app-content">
            <AppLayout noPageAnimation immersiveContent={current.immersive}>
              <section id="feature-surface" style={{minHeight:1600,background:current.route==="/driver-intel"?"#0d1420":"#0f141c"}}>
                <h1 style={{margin:0,padding:50}}>Feature content</h1>
              </section>
            </AppLayout>
          </div>
        </div>
      }
      createRoot(document.getElementById("root")).render(<Fixture/>);
    ` },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "layout-environment",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (args.importer.endsWith("/components/layout/AppLayout.tsx") && !args.path.startsWith("react")) {
            return { path: "layout-environment", namespace: "layout-test" };
          }
        });
        builder.onLoad({ filter: /.*/, namespace: "layout-test" },
          () => ({ contents: environment, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const assets = path.resolve("dist/assets");
  const css = fs.readdirSync(assets).filter(name => name.endsWith(".css"))
    .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n")
    .replace(/@import[^;]+;/g, "");
  const browser = await openFileFixture(`<!doctype html><html><head><style>${css}</style></head>
    <body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`);
  try {
    await browser.navigate();
    await browser.waitFor(`!!document.getElementById("app-scroll-root")`);
    for (const [width, height] of [[1366, 768], [1024, 640], [800, 600]]) {
      await browser.page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const route of ["/driver-intel", "/latency-analyzer"]) {
        for (const offline of [false, true]) {
          await browser.evaluate(`window.changeCase(${JSON.stringify({ route, immersive: true, offline, largeSidebar: width === 800 })})`);
          await browser.waitFor(`document.querySelector('[data-testid="layout-network-status"]')?.style.paddingLeft === "0px"`);
          // Let React commit the route/offline state before measuring.
          await browser.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const measure = () => browser.evaluate(`(()=>{
            const main=document.getElementById("app-scroll-root");
            const status=document.querySelector('[data-testid="layout-network-status"]');
            const surface=document.getElementById("feature-surface");
            const controls=document.querySelector(".titlebar-controls");
            return {
              top:main.getBoundingClientRect().top,height:main.getBoundingClientRect().height,
              statusPosition:getComputedStyle(status).position,
              offline:!!document.querySelector('[data-testid="network-status-chip"]'),
              controlsTop:controls.getBoundingClientRect().top,
              titlebarTop:document.querySelector(".titlebar-strip").getBoundingClientRect().top,
              controlsCount:controls.children.length,
              surfaceAtTop:document.elementsFromPoint(main.getBoundingClientRect().left+main.clientWidth-30,1).some(element=>element.id==="feature-surface")
            }
          })()`);
          for (const scroll of [0, 400]) {
            await browser.evaluate(`document.getElementById("app-scroll-root").scrollTop=${scroll}`);
            const value = await measure();
            assert.equal(value.top, 0, `${route} must have no reserved top strip at scroll ${scroll}`);
            assert.equal(value.height, height);
            assert.equal(value.statusPosition, "absolute");
            assert.equal(value.offline, offline, "Connection warnings must remain available.");
            assert.equal(value.titlebarTop, 0);
            assert.equal(value.controlsTop, 5, "The existing 28px controls stay centered in their 38px overlay.");
            assert.equal(value.controlsCount, 3);
            assert.equal(value.surfaceAtTop, true, `${route}'s surface must fill the top pixel.`);
          }
        }
      }
    }
    await browser.evaluate(`window.changeCase({route:"/startup",immersive:false,offline:false,largeSidebar:false})`);
    await browser.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('[data-testid="layout-network-status"]')).position`), "static");
    console.log("Verified 24 immersive viewport/route/connection/scroll cases: main top=0, surface covers top pixel, window controls and connection warnings preserved.");
  } finally { await browser.close(); }
});
