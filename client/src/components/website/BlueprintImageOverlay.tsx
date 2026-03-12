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
          mixBlendMode: "screen",
          willChange: "transform",
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

      {!reduced && (
        <div
          className="ws-sun-streak-bp"
          style={{
            position: "absolute",
            top: "10%",
            left: "-8%",
            width: "55%",
            height: "45%",
            background: "linear-gradient(140deg, rgba(255,255,255,0.18) 0%, rgba(180,210,255,0.12) 20%, rgba(140,180,255,0.06) 40%, transparent 60%)",
            filter: "blur(14px)",
            mixBlendMode: "screen",
            opacity: 1,
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
          mixBlendMode: "screen",
          willChange: "transform",
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

      {!reduced && (
        <div
          className="ws-sun-streak-bp-right"
          style={{
            position: "absolute",
            top: "22%",
            right: "-10%",
            width: "55%",
            height: "40%",
            background: "linear-gradient(220deg, rgba(255,255,255,0.16) 0%, rgba(160,200,255,0.10) 20%, rgba(120,160,255,0.05) 40%, transparent 60%)",
            filter: "blur(14px)",
            mixBlendMode: "screen",
            opacity: 1,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        className="bp-layer bp-parts bp-float-3"
        style={{
          position: "absolute",
          top: "76%",
          left: "28%",
          transform: "translate(-50%, -50%) rotate(-2deg) scale(1.12)",
          width: "40vw",
          maxWidth: "700px",
          opacity: 0.07 * mobileOpacityScale,
          filter: "blur(3px)",
          mixBlendMode: "screen",
          willChange: "transform",
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
        <div
          className="ws-sun-streak-bp-center"
          style={{
            position: "absolute",
            top: "40%",
            left: "20%",
            width: "60%",
            height: "35%",
            background: "linear-gradient(160deg, rgba(200,220,255,0.10) 0%, rgba(255,255,255,0.08) 30%, transparent 55%)",
            filter: "blur(20px)",
            mixBlendMode: "screen",
            opacity: 1,
            pointerEvents: "none",
          }}
        />
      )}

      {!reduced && (
        <>
          <div
            style={{
              position: "absolute",
              top: "5%",
              left: "-10%",
              width: "80%",
              height: "60%",
              background: "linear-gradient(135deg, rgba(200,220,255,0.10) 0%, rgba(160,140,255,0.06) 30%, transparent 55%)",
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
              background: "linear-gradient(315deg, rgba(255,255,255,0.08) 0%, rgba(140,180,255,0.05) 25%, transparent 50%)",
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
