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
  assert.match(page, /DEBLOATER_ENTRY_FADE_SEEN_KEY = "switchcontrol-debloater-entry-fade-seen-v2"/);
  assert.match(page, /const \[firstVisitFade\] = useState\(\(\) => !hasSeenDebloaterEntryFade\(\)\)/);
  const handlerStart = page.indexOf("const handleEntryFadeEnd");
  const handlerEnd = page.indexOf("}, []);", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "fade completion handler should exist");
  const handler = page.slice(handlerStart, handlerEnd);
  assert.match(handler, /event\.animationName !== "debloater-first-visit-fade-in"/);
  assert.match(handler, /localStorage\.setItem\(DEBLOATER_ENTRY_FADE_SEEN_KEY, "true"\)/);
  assert.match(page, /onAnimationEnd=\{handleEntryFadeEnd\}/);
  assert.doesNotMatch(
    page,
    /useEffect\(\(\) => \{\s*if \(!firstVisitFade\) return;\s*window\.localStorage\.setItem/,
  );
  assert.match(
    page,
    /<DebloaterNotebookFrame\s+className=\{firstVisitFade && !prefersReducedMotion \? "debloater-first-visit-fade" : undefined\}\s+onAnimationEnd=\{handleEntryFadeEnd\}/,
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
