const test = require("node:test");
const assert = require("node:assert/strict");

test("localization keeps all supported locales and public catalog coverage", async () => {
  const {
    LOCALES,
    translationCatalogs,
    PUBLIC_CATALOG_KEYS,
    PUBLIC_TECHNICAL_KEYS,
    resolveTranslation,
  } = await import("../../client/src/lib/i18n.tsx");
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
  const publicPageKeys = [
    "Not just tweaks.",
    "Real performance intelligence.",
    "Checkout Error",
    "Please try again in {mins} minutes.",
    "How is SwitchControl different from other PC optimizers?",
    "Maintenance in progress",
    "Checking download availability",
    "Sign-in failed. Please try again.",
    "Invalid or expired code. Please sign in via your browser again.",
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
    for (const key of publicPageKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing public-page copy: ${key}`);
      assert.ok(catalog[key].trim(), `${code} has empty public-page copy: ${key}`);
      if (code !== "en") {
        assert.notEqual(catalog[key], translationCatalogs.en[key], `${code} falls back to English public-page copy: ${key}`);
      }
    }
  }
  assert.ok(PUBLIC_CATALOG_KEYS.length > 500, "public catalog should cover landing, charts, and all public pages");
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

test("authenticated feature catalogs are centrally merged", async () => {
  const { translationCatalogs } = await import("../../client/src/lib/i18n.tsx");
  const [
    { DASHBOARD_AUTH_TRANSLATIONS },
    { CLEANUP_AUTH_TRANSLATIONS },
    { DRIVER_LATENCY_AUTH_TRANSLATIONS },
    { ADVISOR_AUTH_TRANSLATIONS },
    { SETTINGS_HISTORY_AUTH_TRANSLATIONS },
    { AUTH_COMPLETION_REMAINING },
    { TWEAK_CONTROL_TRANSLATIONS },
  ] = await Promise.all([
    import("../../client/src/lib/authenticatedTranslations/dashboard.ts"),
    import("../../client/src/lib/authenticatedTranslations/cleanup.ts"),
    import("../../client/src/lib/authenticatedTranslations/driverLatency.ts"),
    import("../../client/src/lib/authenticatedTranslations/advisors.ts"),
    import("../../client/src/lib/authenticatedTranslations/settingsHistory.ts"),
    import("../../client/src/lib/authenticatedTranslations/completionRemaining.ts"),
    import("../../client/src/lib/authenticatedTranslations/tweaks.ts"),
  ]);

  const featureCatalogs = [
    DASHBOARD_AUTH_TRANSLATIONS,
    CLEANUP_AUTH_TRANSLATIONS,
    DRIVER_LATENCY_AUTH_TRANSLATIONS,
    ADVISOR_AUTH_TRANSLATIONS,
    SETTINGS_HISTORY_AUTH_TRANSLATIONS,
    AUTH_COMPLETION_REMAINING,
    TWEAK_CONTROL_TRANSLATIONS,
  ];

  for (const featureCatalog of featureCatalogs) {
    for (const [locale, messages] of Object.entries(featureCatalog)) {
      for (const [key, value] of Object.entries(messages)) {
        assert.ok(
          translationCatalogs[locale][key],
          `${locale} authenticated key ${key} is missing from the live catalog`,
        );
        assert.ok(value.trim(), `${locale} authenticated key ${key} is empty`);
      }
    }
  }

  assert.notEqual(
    translationCatalogs["zh-CN"]["Debloater scan failed"],
    "Debloater scan failed",
    "Debloater errors must not fall back to English after a language switch",
  );
  assert.notEqual(
    translationCatalogs["ar"]["How to Access Your BIOS"],
    "How to Access Your BIOS",
    "Advisor copy must use the centrally merged Arabic catalog",
  );
  const tweakControlKeys = [
    "Show impact details", "Free", "Premium", "Unsupported", "Apply",
    "Reset to Default", "Revert", "Recommended", "Safe", "Risky",
    "Search tweaks", "Performance Intelligence",
  ];
  for (const code of Object.keys(translationCatalogs)) {
    for (const key of tweakControlKeys) {
      const value = translationCatalogs[code][key];
      assert.equal(typeof value, "string", `${code} tweak control is missing ${key}`);
      assert.ok(value.trim(), `${code} tweak control is empty: ${key}`);
      if (code !== "en") {
        assert.notEqual(value, key, `${code} tweak control falls back to English: ${key}`);
      }
    }
  }
  assert.equal(
    translationCatalogs.de["Show impact details"],
    "Auswirkungsdetails anzeigen",
    "shared tweak cards must resolve translated controls after a locale switch",
  );
  assert.equal(
    translationCatalogs.ur["Performance Intelligence"],
    "کارکردگی کی ذہانت",
    "RTL locales must receive translated intelligence headings",
  );
});