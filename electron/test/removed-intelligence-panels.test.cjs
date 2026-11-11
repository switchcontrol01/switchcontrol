const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const liveGraph = read("client/src/components/dashboard/LiveGraph.tsx");
const systemStateEngine = read("client/src/lib/systemStateEngine.ts");
const tweakLayer = read("client/src/components/tweaks/TweakIntelligenceLayer.tsx");
const tweakHook = read("client/src/hooks/useTweakIntelligence.ts");
const tweakRoute = read("server/routes/tweakIntelligence.ts");
const translations = read("client/src/lib/authenticatedTranslations/tweaks.ts");

test("the fluctuation status and its detector are removed", () => {
  assert.doesNotMatch(liveGraph, /computeGraphStability|stability\.label|Stability zone label/);
  assert.doesNotMatch(
    systemStateEngine,
    /GraphStability|computeGraphStability|High fluctuation detected|Low variance/,
  );
});

test("Top Opportunities UI and recommendation-only code are removed", () => {
  assert.doesNotMatch(
    tweakLayer,
    /Top Opportunities Right Now|topPriority|isWellOptimized|PriorityTweakItem|TWEAK_TITLE_MAP|No high-priority opportunities|Apply some tweaks first to see personalized opportunity rankings/,
  );
  assert.doesNotMatch(translations, /Top Opportunities Right Now/);
  assert.doesNotMatch(tweakHook, /TweakRanking|rankings|dominantSignal|relevance:/);
  assert.doesNotMatch(tweakRoute, /TweakRanking|rankingsCache|dominantSignal|p\.reason|router\.get\("\/rankings"/);

  // Category pressure still uses the shared scores needed by the remaining panel.
  assert.match(tweakLayer, /CategoryBars scores=\{intel\.tweakScores\}/);
  assert.match(tweakHook, /category-scores/);
  assert.match(tweakRoute, /router\.get\("\/category-scores"/);
});
