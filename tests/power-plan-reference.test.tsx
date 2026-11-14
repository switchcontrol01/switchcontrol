import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { openFileFixture } from "./helpers/chromium";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production Power Plan hero and profile cards render and remain interactive", async () => {
  const bundled = await build({
    absWorkingDir: projectRoot,
    entryPoints: ["tests/fixtures/PowerPlanProductionFixture.tsx"],
    outdir: "generated-artifacts/powerplan-fixture-bundle",
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    jsx: "automatic",
    alias: { "@": path.join(projectRoot, "client/src") },
    loader: { ".css": "css", ".svg": "dataurl" },
  });
  const js = bundled.outputFiles.find(file => file.path.endsWith(".js"))?.text;
  const componentCss = bundled.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  assert.ok(js, "esbuild should emit the isolated React presentation fixture");

  const indexCssPath = path.join(projectRoot, "client/src/index.css");
  const globalCss = await postcss([tailwind({ base: projectRoot })])
    .process(await readFile(indexCssPath, "utf8"), { from: indexCssPath });
  const html = `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${globalCss.css}\n${componentCss}</style></head>
    <body><div id="root"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

  const browser = await openFileFixture(html);
  try {
    await browser.page("Emulation.setDeviceMetricsOverride", {
      width: 769, height: 454, deviceScaleFactor: 1, mobile: false,
    });
    await browser.navigate();
    await browser.waitFor('document.querySelectorAll(\'[data-testid^="card-profile-"]\').length === 4');
    const profileColumns = await browser.evaluate('getComputedStyle(document.querySelector(\'[data-testid="power-profile-grid"]\')).gridTemplateColumns');
    assert.equal(profileColumns.split(" ").length, 2, `Narrow app content should use two readable columns, got ${profileColumns}`);
    const equalCardWidths = await browser.evaluate(`(() => {
      const cards = [...document.querySelectorAll('[data-testid^="card-profile-"]')];
      const firstRow = cards.slice(0, 2).map(card => card.getBoundingClientRect().width);
      return Math.abs(firstRow[0] - firstRow[1]) < 1;
    })()`);
    assert.equal(equalCardWidths, true, "the two visible profiles must share equal card widths");
    await browser.evaluate('document.querySelector(".power-plan-page").style.width = "460px"');
    assert.equal(
      (await browser.evaluate('getComputedStyle(document.querySelector(\'[data-testid="power-profile-grid"]\')).gridTemplateColumns')).split(" ").length,
      1,
      "very narrow content should stack into one column",
    );
    await browser.evaluate('document.querySelector(".power-plan-page").style.width = "1100px"');
    assert.equal(
      (await browser.evaluate('getComputedStyle(document.querySelector(\'[data-testid="power-profile-grid"]\')).gridTemplateColumns')).split(" ").length,
      4,
      "wide content should use four even columns",
    );
    await browser.evaluate('document.querySelector(".power-plan-page").style.width = "100%"');
    assert.equal(await browser.evaluate('document.querySelectorAll(\'[data-testid^="button-activate-"]\').length'), 4);
    assert.equal(await browser.evaluate('document.querySelectorAll(\'[data-testid^="button-settings-"]\').length'), 4);
    assert.match(await browser.evaluate('document.body.innerText'), /no Windows state queried/i);

    const capture = await browser.page("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: true,
    });
    const screenshotPath = path.join(projectRoot, "generated-artifacts/power-plan-reference.png");
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, Buffer.from(capture.data, "base64"));

    await browser.evaluate('document.querySelector(\'[data-testid="button-activate-balanced"]\').click()');
    await browser.waitFor('document.querySelector(\'[data-testid="button-activate-balanced"]\').textContent.includes("Active")');
    await browser.evaluate('document.querySelector(\'[data-testid="button-settings-balanced"]\').click()');
    assert.equal(await browser.evaluate('document.querySelector(\'[data-testid="button-settings-balanced"]\').getAttribute("aria-expanded")'), "true");
    await browser.evaluate('document.querySelector(\'[data-testid="button-edit-custom"]\').click()');
    await browser.waitFor('document.body.innerText.includes("Custom Builder opened in local fixture")');
  } finally {
    await browser.close();
  }
});
