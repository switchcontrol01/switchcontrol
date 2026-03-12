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
          top: "18%",
          left: "8%",
          transform: "translate(-10%, -10%) rotate(-10deg)",
          width: "34vw",
          maxWidth: "520px",
          opacity: 0.14 * mobileOpacityScale,
          filter: "blur(2px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpChipDrift 36s ease-in-out infinite",
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
          top: "42%",
          right: "6%",
          transform: "translate(10%, 0%) rotate(6deg)",
          width: "42vw",
          maxWidth: "720px",
          opacity: 0.11 * mobileOpacityScale,
          filter: "blur(3px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpGraphsDrift 42s ease-in-out infinite",
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
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-4deg) scale(1.15)",
          width: "40vw",
          maxWidth: "700px",
          opacity: 0.08 * mobileOpacityScale,
          filter: "blur(3px)",
          mixBlendMode: "screen",
          willChange: "transform",
          animation: reduced ? "none" : "bpPartsDrift 46s ease-in-out infinite",
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
    </div>
  );
}
