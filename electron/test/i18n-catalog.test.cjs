const test = require("node:test");
const assert = require("node:assert/strict");

test("localization keeps all supported locales and navigation coverage", async () => {
  const { LOCALES, translationCatalogs } = await import("../../client/src/lib/i18n.tsx");
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
      if (code !== "en") {
        assert.notEqual(catalog[key], key, `${code} is still using English fallback for long-form copy`);
      }
    }
    for (const key of websiteKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing website copy`);
      assert.ok(catalog[key].trim(), `${code} has empty website copy`);
    }
  }
  assert.equal(LOCALES.find((locale) => locale.code === "ar").dir, "rtl");
  assert.equal(LOCALES.find((locale) => locale.code === "ur").dir, "rtl");
});