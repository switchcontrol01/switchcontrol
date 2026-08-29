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

  assert.deepEqual(LOCALES.map((locale) => locale.code), expectedCodes);
  assert.deepEqual(Object.keys(translationCatalogs).sort(), [...expectedCodes].sort());
  for (const code of expectedCodes) {
    const catalog = translationCatalogs[code];
    for (const key of navigationKeys) {
      assert.equal(typeof catalog[key], "string", `${code} is missing ${key}`);
      assert.ok(catalog[key].trim(), `${code} has an empty ${key}`);
    }
  }
  assert.equal(LOCALES.find((locale) => locale.code === "ar").dir, "rtl");
  assert.equal(LOCALES.find((locale) => locale.code === "ur").dir, "rtl");
});