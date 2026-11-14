import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import fs from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { openFileFixture } from "./helpers/chromium";
import { DebloaterReferenceFixture } from "../client/src/components/debloater/DebloaterReferenceFixture";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("production Debloater notebook frame renders its deterministic browser fixture", { timeout: 40_000 }, async () => {
  const assetDir = path.resolve("dist/assets");
  const builtStyles = (await fs.readdir(assetDir)).filter(name => /^(index|page-Debloater)-.*\.css$/.test(name));
  const globalCss = builtStyles.find(name => name.startsWith("index-"));
  const pageCss = builtStyles.find(name => name.startsWith("page-Debloater-"));
  assert.ok(globalCss && pageCss, "Run the app build first so the fixture includes production Tailwind/global CSS.");
  const cssPath = path.resolve("client/src/components/debloater/Debloater.css");
  const matPath = path.resolve("client/public/images/debloater-reference/watercolor-mat.webp");
  const washPath = path.resolve("client/public/images/debloater-reference/teal-wash.webp");
  const fontImport = 'https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Roboto+Condensed:wght@400;500;600;700&display=swap';
  let featureCss = await fs.readFile(cssPath, "utf8");
  featureCss = featureCss.replace(/^@import url\("https:\/\/fonts\.googleapis\.com\/[^"]+"\);\s*/, "");
  const inlineCssUrls = async (css: string) => {
    const urls = [...new Set([...css.matchAll(/url\((?:["']?)(\/[^"'()]+)(?:["']?)\)/g)].map(match => match[1]))];
    for (const url of urls) {
      const diskPath = path.join("dist", url.replace(/^\/+/, ""));
      try {
        const bytes = await fs.readFile(diskPath);
        const mime = path.extname(diskPath) === ".woff2" ? "font/woff2"
          : path.extname(diskPath) === ".woff" ? "font/woff" : "image/" + path.extname(diskPath).slice(1);
        css = css.replaceAll(`url("${url}")`, `url("data:${mime};base64,${bytes.toString("base64")}")`)
          .replaceAll(`url(${url})`, `url("data:${mime};base64,${bytes.toString("base64")}")`);
      } catch {
        // Non-bundled external URLs remain browser-managed; generated local art is inlined below.
      }
    }
    return css;
  };
  const productionCss = await inlineCssUrls(
    (await fs.readFile(path.join(assetDir, globalCss), "utf8"))
      + "\n" + (await fs.readFile(path.join(assetDir, pageCss), "utf8")),
  );
  const mat = (await fs.readFile(matPath)).toString("base64");
  const wash = (await fs.readFile(washPath)).toString("base64");
  featureCss = featureCss
    .replaceAll("/images/debloater-reference/watercolor-mat.webp", `data:image/webp;base64,${mat}`)
    .replaceAll("/images/debloater-reference/teal-wash.webp", `data:image/webp;base64,${wash}`);
  featureCss = await inlineCssUrls(featureCss);
  const markup = renderToStaticMarkup(<DebloaterReferenceFixture />);
  const fixtureMotion = `.debloater-reference-fixture [style*="opacity:0"]{opacity:1!important;transform:none!important}`;
  const browser = await openFileFixture(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fontImport}"><style>${productionCss}\n${featureCss}\n${fixtureMotion}</style></head><body style="margin:0;background:#11182b">${markup}</body></html>`);
  try {
    await browser.navigate();
    await browser.waitFor("document.querySelector('[data-testid=\"debloater-paper-mat\"] .debloater-reference-fixture')");
    await browser.page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.evaluate("document.fonts.ready.then(() => true)");
    const details = await browser.evaluate(`(() => {
      const frame = document.querySelector('[data-testid="debloater-paper-mat"]');
      const left = document.querySelector('.debloater-reference-fixture');
      const cards = [...document.querySelectorAll('.debloater-level-card')];
      return {
        frame: frame.getBoundingClientRect().toJSON(),
        left: left.getBoundingClientRect().toJSON(),
        cards: cards.length,
        matImage: getComputedStyle(frame).backgroundImage.includes('data:image/webp'),
        text: document.body.innerText.includes('Curated Removals') && document.body.innerText.includes('Maximum Performance'),
        values: ['53','1225','1995','44'].every(value => document.body.innerText.includes(value))
      };
    })()`);
    assert.equal(details.cards, 4, "fixture uses the four production intensity-card presentation states");
    assert.equal(details.matImage, true, "watercolor mat is loaded from the original production art asset");
    assert.equal(details.text, true);
    assert.equal(details.values, true, "deterministic illustrative reference values are present in the actual production cards");
    assert.ok(details.frame.width > details.left.width, "the decorative facing notebook leaf is outside the working page");
    const shot = await browser.page("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const output = path.resolve("generated-artifacts/debloater-reference-fixture.png");
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, Buffer.from(shot.data, "base64"));
    console.log(`Fixture screenshot: ${output}`);
  } finally {
    await browser.close();
  }
});
