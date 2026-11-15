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
const presentation = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/PowerPlanPresentation.tsx"),
  "utf8",
);

test("Power Plan backdrop and heading fade and blur in over 500ms", () => {
  assert.match(page, /const reducedMotion = prefersReducedMotion \|\| userReducedMotion;/);
  assert.match(page, /<div className=\{!reducedMotion \? "power-plan-entry-motion" : undefined\}>/);
  assert.match(page, /<motion\.div\s+className=\{cn\("power-plan-page/);
  assert.match(page, /<PowerPlanHeroPresentation\s+reducedMotion=\{reducedMotion\}/);
  assert.match(
    styles,
    /@keyframes power-plan-backdrop-entry\s*\{\s*from\s*\{\s*opacity:\s*0;\s*filter:\s*blur\(8px\);\s*transform:\s*scale\(\.995\);\s*\}\s*to\s*\{\s*opacity:\s*\.96;\s*filter:\s*blur\(0\);\s*transform:\s*scale\(1\);\s*\}\s*\}/,
  );
  assert.match(styles, /\.power-plan-entry-motion \.power-plan-page::before\s*\{\s*animation:\s*power-plan-backdrop-entry 500ms/);
  assert.match(presentation, /<motion\.section[\s\S]*?initial=\{reducedMotion \? false : \{ opacity: 0, y: 8, filter: "blur\(8px\)" \}\}[\s\S]*?duration: reducedMotion \? 0 : 0\.5/);
});

test("all four profile cards fade and blur in with a short stagger", () => {
  assert.match(page, /<PowerPlanProfileCards\s+reducedMotion=\{reducedMotion\}/);
  assert.match(
    presentation,
    /profiles\.map\(\(profile, index\)[\s\S]*?initial=\{reducedMotion \? false : \{ opacity: 0, y: 9, filter: "blur\(7px\)" \}\}[\s\S]*?delay: reducedMotion \? 0 : index \* 0\.045/,
  );
  assert.match(
    presentation,
    /delay: reducedMotion \? 0 : profiles\.length \* 0\.045/,
  );
});

test("Power Plan entrance motion respects both app and OS reduced-motion preferences", () => {
  assert.match(styles, /html\.sc-reduced-motion \.power-plan-entry-motion \.power-plan-page::before\s*\{\s*animation:\s*none !important;/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.power-plan-entry-motion \.power-plan-page::before\s*\{\s*animation:\s*none !important;/,
  );
});
