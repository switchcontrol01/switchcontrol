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
  const tamilPublicWebsiteKeys = [
    "Your PC", "is holding", "you", "back.", "Fix it.",
    "Lower input delay, stable FPS, cleaner network. One app. Real results.",
    "Active Tweaks", "FPS Stability", "Gaming Pro", "Optimized ✓",
    "System Tweaks", "Network Optimizer", "Safe & Reversible",
    "Most performance tools stop at the operating system.",
    "SwitchControl goes deeper.",
    "The BIOS Advisor analyzes firmware behavior that directly impacts latency, scheduling, and frametime consistency, without unsafe presets or blind toggles.",
    "CPU Scheduling", "Power & Voltage", "Memory & Fabric", "Signal Integrity",
    "Included with Premium", "System Insights,", "Illustrated Impact",
    "Premium Features", "Four tools.", "Total control.",
    "AI-powered diagnostics, firmware intelligence, driver tracking, and full rollback history, built for serious gamers.",
    "Real-time system intelligence", "Firmware-level insight", "Driver health at a glance",
    "Every change. Fully reversible.", "Stable", "Review", "Critical",
    "AI Confidence", "Context-matched", "3 optimizations found", "Stability Score",
    "Driver Currency", "Restore Points", "History & Rollback", "Clean install",
    "GPU drivers", "Network tweaks", "Current", "Version 1.3.0",
    "Instant Premium Status on Launch", "Startup Revert Guard", "Driver Intelligence Hub",
    "Health Score Radial & Component Cards", "Sliding Component Detail Panel",
    "AI Advisor Integration", "AMD/WMI Compatibility & GPU VRAM Fix",
    "{count} free system tweaks, safe and explained", "{count} advanced system tweaks",
    "Everything in Free", "Premium Plan", "Get Premium", "Secure checkout",
    "Stop losing frames.", "Start winning.", "The SwitchControl", "Difference",
    "Why SwitchControl is different", "Verified Difference",
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
  for (const key of tamilPublicWebsiteKeys) {
    assert.equal(typeof translationCatalogs.ta[key], "string", `Tamil website is missing ${key}`);
    assert.ok(translationCatalogs.ta[key].trim(), `Tamil website has empty ${key}`);
    assert.notEqual(translationCatalogs.ta[key], key, `Tamil website still falls back for ${key}`);
  }
  assert.equal(LOCALES.find((locale) => locale.code === "ar").dir, "rtl");
  assert.equal(LOCALES.find((locale) => locale.code === "ur").dir, "rtl");
});