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
      <div
        className="bp-layer bp-chip"
        style={{
          position: "absolute",
          top: "14%",
          left: "10%",
          transform: "translate(-8%, -6%) rotate(-10deg)",
          width: "34vw",
          maxWidth: "520px",
          opacity: 0.08 * mobileOpacityScale,
          filter: "blur(2px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpChipDrift 26s ease-in-out infinite",
        }}
      >
        <img
          src="/assets/blueprints/bp-chip.png"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      <div
        className="bp-layer bp-graphs"
        style={{
          position: "absolute",
          top: "36%",
          right: "7%",
          transform: "translate(6%, 4%) rotate(7deg)",
          width: "42vw",
          maxWidth: "720px",
          opacity: 0.07 * mobileOpacityScale,
          filter: "blur(3px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpGraphsDrift 32s ease-in-out infinite",
        }}
      >
        <img
          src="/assets/blueprints/bp-graphs.png"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      <div
        className="bp-layer bp-parts"
        style={{
          position: "absolute",
          top: "52%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-2deg) scale(1.12)",
          width: "40vw",
          maxWidth: "700px",
          opacity: 0.04 * mobileOpacityScale,
          filter: "blur(3px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpPartsDrift 38s ease-in-out infinite",
        }}
      >
        <img
          src="/assets/blueprints/bp-parts.png"
          alt=""
          draggable={false}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>

      {!reduced && (
        <>
          <div
            style={{
              position: "absolute",
              top: "5%",
              left: "-10%",
              width: "80%",
              height: "60%",
              background: "linear-gradient(135deg, rgba(200,220,255,0.05) 0%, rgba(160,140,255,0.03) 30%, transparent 55%)",
              filter: "blur(40px)",
              mixBlendMode: "screen",
              opacity: 1,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "5%",
              right: "-10%",
              width: "70%",
              height: "50%",
              background: "linear-gradient(315deg, rgba(255,255,255,0.04) 0%, rgba(140,180,255,0.025) 25%, transparent 50%)",
              filter: "blur(40px)",
              mixBlendMode: "screen",
              opacity: 1,
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </div>
  );
}
