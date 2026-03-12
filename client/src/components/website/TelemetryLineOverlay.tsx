import { useEffect, useState, useRef, useCallback } from "react";

const isMobileInit = typeof window !== "undefined" && window.innerWidth < 768;

export function TelemetryLineOverlay() {
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number | null>(null);
  const [isMobile] = useState(isMobileInit);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      setScrollY(window.scrollY);
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (isMobile) return;
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleScroll, isMobile]);

  const xShift = isMobile ? 0 : Math.sin(scrollY * 0.003) * 20;
  const yShift = isMobile ? 0 : Math.cos(scrollY * 0.004) * 16;
  const scale = isMobile ? 1 : 1 + Math.sin(scrollY * 0.002) * 0.02;
  const opacityMod = isMobile ? 0.5 : 0.7 + Math.sin(scrollY * 0.005) * 0.3;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ opacity: opacityMod }}
    >
      <svg
        className="ws-telemetry-line-primary"
        viewBox="0 0 1400 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          bottom: "18%",
          left: "-5%",
          width: "110%",
          height: "120px",
          transform: `translate(${xShift}px, ${yShift}px) scale(${scale})`,
          transition: "transform 0.3s ease-out",
        }}
      >
        <path
          d="M0 100 Q50 85 100 100 T200 95 T300 105 T400 90 T500 100 T600 92 T700 108 T800 96 T900 100 T1000 88 T1100 104 T1200 94 T1300 100 T1400 97"
          stroke="url(#telemetryGrad1)"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="telemetryGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(190 80% 55%)" stopOpacity="0" />
            <stop offset="15%" stopColor="hsl(190 80% 55%)" stopOpacity="0.35" />
            <stop offset="50%" stopColor="hsl(270 55% 60%)" stopOpacity="0.5" />
            <stop offset="85%" stopColor="hsl(190 80% 55%)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(190 80% 55%)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="telemetryGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(270 50% 60%)" stopOpacity="0" />
            <stop offset="20%" stopColor="hsl(270 50% 60%)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="hsl(200 70% 50%)" stopOpacity="0.25" />
            <stop offset="80%" stopColor="hsl(270 50% 60%)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(270 50% 60%)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <svg
        className="ws-telemetry-line-secondary"
        viewBox="0 0 1400 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          bottom: "15%",
          left: "-3%",
          width: "106%",
          height: "100px",
          transform: `translate(${xShift * 0.6}px, ${yShift * 0.4}px) scale(${1 + (scale - 1) * 0.5})`,
          transition: "transform 0.4s ease-out",
        }}
      >
        <path
          d="M0 100 Q70 92 140 100 T280 96 T420 104 T560 94 T700 100 T840 97 T980 103 T1120 95 T1260 100 T1400 98"
          stroke="url(#telemetryGrad2)"
          strokeWidth="0.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
