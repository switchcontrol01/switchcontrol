const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/Debloater.tsx"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/debloater/Debloater.css"),
  "utf8",
);

test("Debloater entry fade is persisted after the first visit", () => {
  assert.match(page, /DEBLOATER_ENTRY_FADE_SEEN_KEY = "switchcontrol-debloater-entry-fade-seen-v1"/);
  assert.match(page, /const \[firstVisitFade\] = useState\(\(\) => !hasSeenDebloaterEntryFade\(\)\)/);
  assert.match(page, /localStorage\.setItem\(DEBLOATER_ENTRY_FADE_SEEN_KEY, "true"\)/);
  assert.match(
    page,
    /<DebloaterNotebookFrame\s+className=\{firstVisitFade && !prefersReducedMotion \? "debloater-first-visit-fade" : undefined\}/,
  );
});

test("the full Debloater frame fades in over one second and respects reduced motion", () => {
  assert.match(
    styles,
    /@keyframes debloater-first-visit-fade-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/,
  );
  assert.match(styles, /animation:\s*debloater-first-visit-fade-in 1000ms/);
  assert.match(
    styles,
    /html\.sc-reduced-motion \.debloater-first-visit-fade\s*\{\s*animation:\s*none !important;/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.debloater-first-visit-fade\s*\{\s*animation:\s*none !important;/,
  );
});
