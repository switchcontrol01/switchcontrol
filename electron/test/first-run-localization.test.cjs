const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("first-run UI and legal copy are translated for every supported locale", async () => {
  const i18n = read("client/src/lib/i18n.tsx");
  const translations = await import(
    pathToFileURL(path.join(process.cwd(), "client/src/lib/firstRunTranslations.ts")).href
  );
  const appTranslations = await import(
    pathToFileURL(path.join(process.cwd(), "client/src/lib/appTranslations.ts")).href
  );
  const legal = await import(
    pathToFileURL(path.join(process.cwd(), "client/src/lib/legalContent.ts")).href
  );
  const locales = [
    "zh-CN", "es", "hi", "ar", "pt-BR", "bn", "ru", "ja", "pa",
    "de", "id", "ko", "fr", "te", "tr", "mr", "ta", "vi", "ur",
  ];
  const representativeKeys = [
    "Important Notice",
    "Keep SwitchControl closed while gaming",
    "Welcome",
  ];
  const dashboardKeys = [
    "Premium feature",
    "Fully Optimized",
    "Good Configuration",
    "Needs Improvement",
    "Issues Found",
    "{passed}/{total} rules passed",
    "{count} issue(s)",
    "Open AI Advisor",
    "Unlock Premium",
    "BIOS Score",
    "BIOS configuration not yet analyzed",
    "Scan detects XMP profiles, power limits, and scheduling settings.",
    "Readiness Estimate",
    "Frametime",
    "Stability",
    "View BIOS Analysis",
    "Open BIOS Advisor",
    "View Logs",
    "Optimize Now",
    "Activity Monitor",
    "Memory",
    "Clear RAM",
    "Switching GPU…",
    "Detecting…",
    "Live performance graph paused",
    "System Pipeline",
    "Live",
    "Telemetry Analytics",
    "Live · Rolling window",
    "Telemetry analytics paused",
    "System Health",
    "Tweaks applied",
    "Services disabled",
    "Cleaners run",
    "Startup apps disabled",
    "Last Scan",
    "Never",
    "Good morning,",
    "Good afternoon,",
    "Good evening,",
    "System active",
    "Telemetry unavailable",
    "Guest",
    "{cores} Cores / {threads} Threads",
    "{value} GB VRAM",
    "Inferred",
    "Basic",
    "Good",
    "Advanced",
    "Competitive",
  ];
  const technicalDashboardKeys = new Set(["{value} GB VRAM", "Frametime", "Live"]);

  assert.match(i18n, /Object\.assign\(CATALOGS\[locale\], labels\)/);
  for (const locale of locales) {
    const ui = translations.FIRST_RUN_UI_TRANSLATIONS[locale];
    assert.ok(ui, `missing first-run UI catalog for ${locale}`);
    for (const key of representativeKeys) {
      assert.ok(ui[key], `missing ${key} translation for ${locale}`);
      assert.notEqual(ui[key], key, `English fallback remains for ${locale}: ${key}`);
    }
    const dashboard = appTranslations.APP_UI_TRANSLATIONS[locale];
    assert.ok(dashboard, `missing dashboard catalog for ${locale}`);
    for (const key of dashboardKeys) {
      assert.ok(dashboard[key], `missing dashboard translation for ${locale}: ${key}`);
      if (!technicalDashboardKeys.has(key)) {
        assert.notEqual(dashboard[key], key, `dashboard English fallback remains for ${locale}: ${key}`);
      }
    }

    const sections = legal.getLocalizedLegalSections(locale);
    assert.equal(sections.terms.length, 17, `Terms section count changed for ${locale}`);
    assert.equal(sections.privacy.length, 14, `Privacy section count changed for ${locale}`);
    assert.notEqual(sections.terms[0].title, "1. Overview", `legal title fell back for ${locale}`);
    assert.notEqual(
      sections.terms[0].paragraphs[0],
      "SwitchControl provides software and services designed to help users configure, optimize, and analyze Windows PC settings and system performance. By using SwitchControl, you agree to these terms. If you do not agree, do not use the service.",
      `legal paragraph fell back for ${locale}`,
    );
  }
});