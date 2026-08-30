const test = require("node:test");
const assert = require("node:assert/strict");

test("localization keeps all supported locales and public catalog coverage", async () => {
  const { LOCALES, translationCatalogs, PUBLIC_CATALOG_KEYS, PUBLIC_TECHNICAL_KEYS, resolveTranslation } = await import("../../client/src/lib/i18n.tsx");
  const expectedCodes = [
    "en", "zh-CN", "es", "hi", "ar", "pt-BR", "bn", "ru", "ja", "pa",
    "de", "id", "ko", "fr", "te", "tr", "mr", "ta", "vi", "ur",
  ];
  const navigationKeys = [
    "Dashboard", "Tweaks", "Network Tweaks", "NIC Tuning", "Power Plan",
    "Cleaner", "Debloat", "Startup", "Process Manager", "AI Advisor",
    "BIOS Advisor", "Security", "History", "Driver Intel",
    "Latency Analyzer", "Settings",
  ];
  const longFormKeys = [
    "Make SwitchControl feel like your workspace. Changes apply instantly and are saved locally.",
    "Choose the surface treatment used throughout the app.",
    "Minimize transitions and animated effects.",
    "Tune readability, contrast, focus, and interaction sizing.",
    "Arrange the navigation rail and dashboard around the information you use most.",
    "Control sorting, confirmations, intelligence, and safety checks.",
    "Choose what deserves your attention and how the desktop app opens.",
    "Keep control of local diagnostics and optional product context.",
    "Configure general app behavior.",
    "Manage application preferences and account details.",
    "Updates while visible and pauses automatically in the background.",
    "Click and hold the grip, then drag over another row to reorder.",
  ];
  const websiteKeys = [
    "Features", "Pricing", "FAQ", "Log in", "Get Started", "Download", "Log out",
    "Admin", "Admin Panel", "Back to home", "Website language", "Choose your website language",
    "Choose the language for the SwitchControl website.", "Search languages", "No languages found",
  ];
  const featureKeys = [
    "System Analysis", "Clean Now", "Installed Apps", "Scan system",
    "No items available for this role + mode combination.", "Requires admin",
    "Risk distribution",
  ];

  assert.deepEqual(LOCALES.map((locale) => locale.code), expectedCodes);
  assert.deepEqual(Object.keys(translationCatalogs).sort(), [...expectedCodes].sort());
  for (const code of expectedCodes) {
    const catalog = translationCatalogs[code];
    for (const key of navigationKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing ${key}`);
      assert.ok(catalog[key].trim(), `${code} has an empty ${key}`);
    }
    for (const key of longFormKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing long-form copy`);
      if (code !== "en" && !PUBLIC_TECHNICAL_KEYS.includes(key)) {
        assert.notEqual(catalog[key], key, `${code} is still using English fallback for long-form copy`);
      }
    }
    for (const key of websiteKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing website copy`);
      assert.ok(catalog[key].trim(), `${code} has empty website copy`);
    }
    for (const key of featureKeys) {
      const englishFeature = translationCatalogs.en[key] ?? key;
      const value = catalog[key] ?? englishFeature;
      assert.equal(typeof value, "string", `${code} is missing feature copy: ${key}`);
      assert.ok(value.trim(), `${code} has empty feature copy: ${key}`);
      if (code !== "en") {
        assert.notEqual(value, englishFeature, `${code} falls back to English feature copy: ${key}`);
      }
    }
  }
  assert.ok(PUBLIC_CATALOG_KEYS.length > 200, "public catalog should cover landing and chart copy");
  for (const key of PUBLIC_CATALOG_KEYS) {
    for (const code of expectedCodes) {
      const value = translationCatalogs[code][key];
      assert.equal(typeof value, "string", `${code} public catalog is missing ${key}`);
      assert.ok(value.trim(), `${code} public catalog has empty ${key}`);
      if (code !== "en" && !PUBLIC_TECHNICAL_KEYS.includes(key)) {
        assert.notEqual(value, translationCatalogs.en[key], `${code} falls back to English for ${key}`);
      }
    }
  }
  assert.equal(LOCALES.find((locale) => locale.code === "ar").dir, "rtl");
  assert.equal(LOCALES.find((locale) => locale.code === "ur").dir, "rtl");
  assert.equal(
    resolveTranslation("es", "landingPerformanceCharts.fps.title", "FPS Consistency"),
    "Regularidad de FPS",
    "semantic public keys should resolve through their translated source fallback",
  );
  assert.equal(
    resolveTranslation("es", "landingPerformanceCharts.legend.stockWindows", "Stock Windows"),
    "Windows de serie",
    "chart legends should not depend on the DOM compatibility bridge",
  );
});