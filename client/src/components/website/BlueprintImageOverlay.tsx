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
          top: "10%",
          left: "52%",
          transform: "translateX(-10%) rotate(-10deg)",
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
          top: "24%",
          right: "-6%",
          width: "42vw",
          maxWidth: "720px",
          transform: "rotate(6deg)",
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
          bottom: "-6%",
          left: "-8%",
          width: "40vw",
          maxWidth: "700px",
          transform: "rotate(-4deg)",
          opacity: 0.10 * mobileOpacityScale,
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
