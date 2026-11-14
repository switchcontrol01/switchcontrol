const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/PowerPlan.tsx"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/PowerPlan.css"),
  "utf8",
);

test("Power Plan fades and blurs in over 500ms without overriding its content state", () => {
  assert.match(page, /<div className=\{!prefersReducedMotion \? "power-plan-entry-motion" : undefined\}>/);
  assert.match(page, /<motion\.div\s+className=\{cn\("power-plan-page/);
  assert.match(
    styles,
    /@keyframes power-plan-entry-fade-blur\s*\{\s*from\s*\{\s*opacity:\s*0;\s*filter:\s*blur\(5px\);\s*\}\s*to\s*\{\s*opacity:\s*1;\s*filter:\s*blur\(0\);\s*\}\s*\}/,
  );
  assert.match(styles, /animation:\s*power-plan-entry-fade-blur 500ms/);
});

test("Power Plan entrance motion respects both app and OS reduced-motion preferences", () => {
  assert.match(
    styles,
    /html\.sc-reduced-motion \.power-plan-entry-motion\s*\{\s*animation:\s*none !important;/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.power-plan-entry-motion\s*\{\s*animation:\s*none !important;/,
  );
});
