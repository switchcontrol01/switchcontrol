const test = require("node:test");
const assert = require("node:assert/strict");
const { Window } = require("happy-dom");
const React = require("react");
const { createRoot } = require("react-dom/client");
globalThis.React = React;

function installDom() {
  const window = new Window({ url: "http://localhost/" });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "SVGElement",
    "Element",
    "Node",
    "MutationObserver",
    "ResizeObserver",
    "DOMRect",
  ]) {
    globalThis[key] = window[key];
  }
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.matchMedia =
    window.matchMedia?.bind(window) ??
    (() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }));
  return window;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the real FirstRunHandoff animation reaches midpoint and completion", async () => {
  const window = installDom();
  const [{ FirstRunHandoff }, { I18nProvider }] = await Promise.all([
    import("../../client/src/components/FirstRunHandoff.tsx"),
    import("../../client/src/lib/i18n.tsx"),
  ]);

  const rootElement = document.createElement("div");
  document.body.appendChild(rootElement);
  const root = createRoot(rootElement);
  let coverCount = 0;
  let completeCount = 0;

  root.render(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FirstRunHandoff, {
        kind: "login-to-language",
        prefersReducedMotion: false,
        onCover: () => {
          coverCount += 1;
        },
        onComplete: () => {
          completeCount += 1;
        },
      }),
    ),
  );

  await wait(100);
  const handoff = document.querySelector(
    '[data-testid="first-run-blue-handoff"]',
  );
  assert.ok(handoff, "the handoff must mount in the DOM");
  assert.equal(
    handoff.dataset.transitionContract,
    "blur-in-fade-in-swap-fade-out-blur-out",
  );
  const animations = handoff.getAnimations();
  assert.ok(animations.length > 0, "the handoff must create a browser animation");
  const animation = animations[0];
  assert.equal(
    animation.effect.getTiming().duration,
    2_000,
    "the cover animation must last two seconds",
  );
  const keyframes = animation.effect.getKeyframes();
  assert.deepEqual(
    keyframes.map((frame) => frame.opacity),
    ["0", "0.38", "0.72", "0.38", "0"],
    "the cover must fade in and out without a saturated midpoint flash",
  );
  // Happy DOM exposes opacity keyframes through Web Animations but does not
  // retain filter/backdrop-filter in getKeyframes(). The source-level contract
  // test covers those browser-specific blur properties.

  await wait(1_050);
  assert.equal(coverCount, 1, "the covered midpoint callback must fire once");
  assert.ok(
    animation.currentTime >= 900 && animation.currentTime <= 1_200,
    `the animation must be at its midpoint near 1s, got ${animation.currentTime}ms`,
  );

  await wait(1_100);
  assert.equal(
    completeCount,
    1,
    "the reveal completion callback must fire once",
  );
  // Framer Motion releases the finished Web Animations object immediately,
  // so Happy DOM reports currentTime=null after the completion callback.

  root.unmount();
  window.close();
});

test("every first-run handoff kind runs through the same real animation", async () => {
  const window = installDom();
  const [{ FirstRunHandoff }, { I18nProvider }] = await Promise.all([
    import("../../client/src/components/FirstRunHandoff.tsx"),
    import("../../client/src/lib/i18n.tsx"),
  ]);
  const kinds = [
    "login-to-language",
    "language-to-consent",
    "consent-to-disclaimer",
    "disclaimer-to-welcome",
  ];

  for (const kind of kinds) {
    const rootElement = document.createElement("div");
    document.body.appendChild(rootElement);
    const root = createRoot(rootElement);
    let coverCount = 0;
    let completeCount = 0;
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(FirstRunHandoff, {
          kind,
          prefersReducedMotion: false,
          onCover: () => {
            coverCount += 1;
          },
          onComplete: () => {
            completeCount += 1;
          },
        }),
      ),
    );
    await wait(100);
    const handoff = document.querySelector(
      '[data-testid="first-run-blue-handoff"]',
    );
    assert.ok(handoff, `${kind} handoff must mount in the DOM`);
    const animation = handoff.getAnimations()[0];
    assert.ok(animation, `${kind} handoff must create a browser animation`);
    assert.equal(
      animation.effect.getTiming().duration,
      kind === "disclaimer-to-welcome" ? 1_000 : 2_000,
      `${kind} must use its intended cover duration`,
    );
    await wait(2_150);
    assert.equal(coverCount, 1, `${kind} midpoint must fire once`);
    assert.equal(completeCount, 1, `${kind} completion must fire once`);
    root.unmount();
    rootElement.remove();
  }

  window.close();
});