import { useEffect, useState } from "react";

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

export function BlueprintImageOverlay() {
  const [reduced, setReduced] = useState(isMobile);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    setReduced(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const mobileOpacityScale = reduced ? 0.6 : 1;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Blueprint images, willChange removed; bp-float-* CSS keyframes handle
          compositor promotion only during animation, not permanently. */}
      <div
        className="bp-layer bp-chip bp-float-1"
        style={{
          position: "absolute",
          top: "20%",
          left: "4%",
          transform: "translate(-8%, -6%) rotate(-14deg)",
          width: "34vw",
          maxWidth: "520px",
          opacity: 0.14 * mobileOpacityScale,
          filter: "blur(2px)",
        }}
      >
        <img
          src="/assets/blueprints/bp-chip.webp"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      {/* Sun-streak glows, replaced filter:blur() divs with pre-baked radial
          gradients. Equivalent visual effect, zero compositor layer promotion. */}
      {!reduced && (
        <div
          className="ws-sun-streak-bp"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 55% 40% at -5% 10%, rgba(200,220,255,0.13) 0%, rgba(180,210,255,0.06) 45%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        className="bp-layer bp-graphs bp-float-2"
        style={{
          position: "absolute",
          top: "32%",
          right: "7%",
          transform: "translate(6%, 4%) rotate(7deg)",
          width: "42vw",
          maxWidth: "720px",
          opacity: 0.11 * mobileOpacityScale,
          filter: "blur(3px)",
        }}
      >
        <img
          src="/assets/blueprints/bp-graphs.webp"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      {!reduced && (
        <div
          className="ws-sun-streak-bp-right"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 55% 38% at 108% 22%, rgba(160,200,255,0.11) 0%, rgba(140,180,255,0.05) 45%, transparent 68%)",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        className="bp-layer bp-parts bp-float-3"
        style={{
          position: "absolute",
          top: "96%",
          left: "28%",
          transform: "translate(-50%, -50%) rotate(-2deg) scale(1.12)",
          width: "40vw",
          maxWidth: "700px",
          opacity: 0.07 * mobileOpacityScale,
          filter: "blur(3px)",
        }}
      >
        <img
          src="/assets/blueprints/bp-parts.webp"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      {!reduced && (
        <div
          className="ws-sun-streak-bp-center"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 58% 32% at 48% 55%, rgba(205,220,255,0.09) 0%, rgba(200,220,255,0.04) 50%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Large ambient glows, replaced two blur(40px) divs with full-coverage
          radial gradients. Same depth/mood, no GPU off-screen render targets. */}
      {!reduced && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 72% 52% at 28% 18%, rgba(200,220,255,0.09) 0%, rgba(160,140,255,0.04) 45%, transparent 68%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 62% 44% at 82% 82%, rgba(255,255,255,0.06) 0%, rgba(140,180,255,0.03) 40%, transparent 62%)",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </div>
  );
}
