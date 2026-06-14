import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { BlueprintImageOverlay } from "./BlueprintImageOverlay";

import heroBackdrop from "@/assets/bg/hero-backdrop.webp";
import circuitTech from "@/assets/bg/circuit-tech.webp";
import perfDashboard from "@/assets/bg/perf-dashboard.webp";
import hardwareDetail from "@/assets/bg/hardware-detail.webp";
import networkFlow from "@/assets/bg/network-flow.webp";

type BackgroundVariant = "landing" | "pricing" | "download" | "auth" | "legal" | "success";

interface WebsiteBackgroundProps {
  variant?: BackgroundVariant;
}

function PcbTraces({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <path d="M0 300 H120 L140 280 H280 L300 300 H450 L470 260 H600" stroke="currentColor" strokeWidth="0.5" />
      <path d="M200 0 V120 L220 140 V280 L200 300 V400" stroke="currentColor" strokeWidth="0.5" />
      <path d="M500 100 H550 L570 130 V250 L590 270 H700" stroke="currentColor" strokeWidth="0.4" />
      <path d="M100 500 H200 L220 480 H350 L370 500 H500" stroke="currentColor" strokeWidth="0.4" />
      <path d="M650 0 V80 L670 100 V200 L650 220 V350" stroke="currentColor" strokeWidth="0.3" />
      <path d="M50 150 H100 L120 170 H200 L220 150 H320" stroke="currentColor" strokeWidth="0.3" />
      <circle cx="140" cy="280" r="3" fill="currentColor" opacity="0.4" />
      <circle cx="300" cy="300" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="470" cy="260" r="2.5" fill="currentColor" opacity="0.35" />
      <circle cx="220" cy="140" r="2.5" fill="currentColor" opacity="0.3" />
      <circle cx="570" cy="130" r="2" fill="currentColor" opacity="0.25" />
      <circle cx="670" cy="100" r="2" fill="currentColor" opacity="0.3" />
      <rect x="270" y="290" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
      <rect x="440" y="250" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="0.4" opacity="0.25" />
      <rect x="190" y="130" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="0.3" opacity="0.2" />
    </svg>
  );
}

function NodeGraph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <line x1="150" y1="100" x2="350" y2="200" stroke="currentColor" strokeWidth="0.3" />
      <line x1="350" y1="200" x2="550" y2="150" stroke="currentColor" strokeWidth="0.3" />
      <line x1="550" y1="150" x2="650" y2="300" stroke="currentColor" strokeWidth="0.3" />
      <line x1="350" y1="200" x2="300" y2="400" stroke="currentColor" strokeWidth="0.3" />
      <line x1="300" y1="400" x2="500" y2="450" stroke="currentColor" strokeWidth="0.3" />
      <line x1="500" y1="450" x2="650" y2="300" stroke="currentColor" strokeWidth="0.3" />
      <line x1="150" y1="100" x2="100" y2="300" stroke="currentColor" strokeWidth="0.25" />
      <line x1="100" y1="300" x2="300" y2="400" stroke="currentColor" strokeWidth="0.25" />
      <circle cx="150" cy="100" r="4" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="350" cy="200" r="5" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="550" cy="150" r="4" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="650" cy="300" r="5" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="300" cy="400" r="4" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="500" cy="450" r="4" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="100" cy="300" r="3" stroke="currentColor" strokeWidth="0.4" fill="none" />
      <circle cx="350" cy="200" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="650" cy="300" r="2" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function FrametimeWave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 200" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <path
        d="M0 100 L20 95 L40 105 L60 92 L80 108 L100 90 L120 102 L140 88 L160 110 L180 85 L200 100 L220 93 L240 107 L260 89 L280 104 L300 91 L320 100 L340 96 L360 103 L380 94 L400 100 L420 88 L440 112 L460 86 L480 105 L500 92 L520 100 L540 95 L560 104 L580 90 L600 100 L620 93 L640 108 L660 87 L680 102 L700 94 L720 100 L740 97 L760 103 L780 91 L800 100 L820 88 L840 110 L860 85 L880 105 L900 92 L920 100 L940 96 L960 104 L980 90 L1000 100 L1020 94 L1040 106 L1060 88 L1080 102 L1100 95 L1120 100 L1140 93 L1160 107 L1180 90 L1200 100"
        stroke="currentColor"
        strokeWidth="0.8"
      />
      <path
        d="M0 120 L30 118 L60 122 L90 116 L120 124 L150 115 L180 120 L210 118 L240 123 L270 117 L300 120 L330 119 L360 121 L390 117 L420 120 L450 116 L480 124 L510 115 L540 120 L570 118 L600 122 L630 117 L660 120 L690 119 L720 121 L750 118 L780 120 L810 116 L840 123 L870 117 L900 120 L930 118 L960 122 L990 116 L1020 120 L1050 119 L1080 121 L1110 118 L1140 120 L1170 117 L1200 120"
        stroke="currentColor"
        strokeWidth="0.4"
        opacity="0.5"
      />
    </svg>
  );
}

function TopoLines({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="400" cy="350" rx="280" ry="180" stroke="currentColor" strokeWidth="0.3" />
      <ellipse cx="400" cy="350" rx="220" ry="140" stroke="currentColor" strokeWidth="0.3" />
      <ellipse cx="400" cy="350" rx="160" ry="100" stroke="currentColor" strokeWidth="0.3" />
      <ellipse cx="400" cy="350" rx="100" ry="60" stroke="currentColor" strokeWidth="0.3" />
      <ellipse cx="400" cy="350" rx="40" ry="24" stroke="currentColor" strokeWidth="0.4" />
      <ellipse cx="250" cy="550" rx="120" ry="80" stroke="currentColor" strokeWidth="0.25" />
      <ellipse cx="250" cy="550" rx="70" ry="45" stroke="currentColor" strokeWidth="0.25" />
      <ellipse cx="600" cy="200" rx="100" ry="60" stroke="currentColor" strokeWidth="0.25" />
      <ellipse cx="600" cy="200" rx="50" ry="30" stroke="currentColor" strokeWidth="0.25" />
    </svg>
  );
}

function PacketRoute({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 400" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <path d="M50 200 Q200 100 400 200 T750 200" stroke="currentColor" strokeWidth="0.5" strokeDasharray="8 6" />
      <path d="M100 250 Q250 180 450 250 T800 220" stroke="currentColor" strokeWidth="0.3" strokeDasharray="4 8" />
      <path d="M0 150 Q150 80 350 150 T700 130" stroke="currentColor" strokeWidth="0.3" strokeDasharray="6 10" />
      <circle cx="200" cy="150" r="3" stroke="currentColor" strokeWidth="0.4" fill="none" />
      <circle cx="400" cy="200" r="4" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="600" cy="180" r="3" stroke="currentColor" strokeWidth="0.4" fill="none" />
      <circle cx="400" cy="200" r="1.5" fill="currentColor" opacity="0.3" />
      <rect x="180" y="140" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="0.3" opacity="0.4" />
      <rect x="580" y="170" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="0.3" opacity="0.4" />
    </svg>
  );
}

interface BgImageConfig {
  src: string;
  opacity: number;
}

const VARIANT_CONFIG: Record<BackgroundVariant, {
  gradients: string;
  overlays: Array<{ Component: React.FC<{ className?: string }>; opacity: number; drift: string; position: string }>;
  glowHotspots: Array<{ color: string; size: string; position: string; opacity: number }>;
  silhouettes: boolean;
  bgImages: BgImageConfig[];
  particles: boolean;
  sunStreaks?: boolean;
}> = {
  landing: {
    gradients: `
      radial-gradient(ellipse 130% 60% at 50% -15%, hsl(270 55% 35% / 0.35) 0%, transparent 55%),
      radial-gradient(ellipse 80% 50% at 5% 30%, hsl(260 60% 45% / 0.18) 0%, transparent 50%),
      radial-gradient(ellipse 70% 45% at 95% 60%, hsl(280 50% 40% / 0.15) 0%, transparent 50%),
      radial-gradient(ellipse 40% 25% at 75% 10%, hsl(190 80% 45% / 0.1) 0%, transparent 50%),
      linear-gradient(180deg, #040508 0%, #050509 40%, #04050a 100%)
    `,
    overlays: [
      { Component: PcbTraces, opacity: 0.05, drift: "ws-drift-1", position: "inset-0" },
      { Component: NodeGraph, opacity: 0.04, drift: "ws-drift-2", position: "inset-0" },
      { Component: FrametimeWave, opacity: 0.06, drift: "ws-drift-3", position: "absolute bottom-[20%] inset-x-0 h-[200px]" },
    ],
    glowHotspots: [
      { color: "hsl(270 55% 55%)", size: "600px", position: "top-[3%] left-[3%]", opacity: 0.10 },
    ],
    silhouettes: true,
    bgImages: [
      { src: heroBackdrop, opacity: 0.04 },
      { src: circuitTech, opacity: 0.025 },
    ],
    particles: true,
  },
  pricing: {
    gradients: `
      radial-gradient(ellipse 100% 50% at 50% -10%, hsl(270 50% 35% / 0.3) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 80% 50%, hsl(280 45% 40% / 0.15) 0%, transparent 50%),
      radial-gradient(ellipse 50% 30% at 20% 70%, hsl(260 50% 40% / 0.1) 0%, transparent 50%),
      linear-gradient(180deg, #040508 0%, #050509 50%, #04050a 100%)
    `,
    overlays: [
      { Component: NodeGraph, opacity: 0.045, drift: "ws-drift-1", position: "inset-0" },
      { Component: TopoLines, opacity: 0.03, drift: "ws-drift-2", position: "inset-0" },
    ],
    glowHotspots: [
      { color: "hsl(270 55% 55%)", size: "500px", position: "top-[8%] left-[8%]", opacity: 0.14 },
      { color: "hsl(280 45% 50%)", size: "380px", position: "bottom-[20%] right-[5%]", opacity: 0.08 },
    ],
    silhouettes: true,
    bgImages: [
      { src: perfDashboard, opacity: 0.03 },
      { src: networkFlow, opacity: 0.02 },
    ],
    particles: true,
  },
  download: {
    gradients: `
      radial-gradient(ellipse 90% 50% at 50% 20%, hsl(270 50% 38% / 0.28) 0%, transparent 55%),
      radial-gradient(ellipse 50% 35% at 70% 60%, hsl(190 70% 40% / 0.12) 0%, transparent 50%),
      linear-gradient(180deg, #040508 0%, #050509 100%)
    `,
    overlays: [
      { Component: PacketRoute, opacity: 0.05, drift: "ws-drift-1", position: "inset-0" },
      { Component: PcbTraces, opacity: 0.03, drift: "ws-drift-3", position: "inset-0" },
    ],
    glowHotspots: [
      { color: "hsl(270 50% 55%)", size: "450px", position: "top-[15%] left-[15%]", opacity: 0.14 },
      { color: "hsl(190 70% 50%)", size: "350px", position: "bottom-[25%] right-[10%]", opacity: 0.08 },
    ],
    silhouettes: false,
    bgImages: [
      { src: hardwareDetail, opacity: 0.025 },
    ],
    particles: true,
  },
  auth: {
    gradients: `
      linear-gradient(180deg, #040508 0%, #050509 100%)
    `,
    overlays: [
      { Component: NodeGraph, opacity: 0.04, drift: "ws-drift-2", position: "inset-0" },
    ],
    glowHotspots: [],
    silhouettes: false,
    bgImages: [
      { src: circuitTech, opacity: 0.02 },
    ],
    particles: false,
    sunStreaks: false,
  },
  legal: {
    gradients: `
      radial-gradient(ellipse 80% 40% at 50% 0%, hsl(270 45% 30% / 0.2) 0%, transparent 55%),
      linear-gradient(180deg, #040508 0%, #050509 50%, #04050a 100%)
    `,
    overlays: [
      { Component: TopoLines, opacity: 0.025, drift: "ws-drift-1", position: "inset-0" },
    ],
    glowHotspots: [
      { color: "hsl(270 45% 50%)", size: "380px", position: "top-[5%] right-[15%]", opacity: 0.08 },
    ],
    silhouettes: false,
    bgImages: [
      { src: networkFlow, opacity: 0.02 },
    ],
    particles: false,
  },
  success: {
    gradients: `
      radial-gradient(ellipse 100% 60% at 50% 30%, hsl(270 55% 40% / 0.3) 0%, transparent 55%),
      radial-gradient(ellipse 50% 35% at 60% 50%, hsl(190 70% 40% / 0.12) 0%, transparent 50%),
      linear-gradient(180deg, #040508 0%, #050509 100%)
    `,
    overlays: [
      { Component: PcbTraces, opacity: 0.04, drift: "ws-drift-1", position: "inset-0" },
      { Component: PacketRoute, opacity: 0.03, drift: "ws-drift-3", position: "inset-0" },
    ],
    glowHotspots: [
      { color: "hsl(270 55% 55%)", size: "450px", position: "top-[15%] left-[20%]", opacity: 0.14 },
      { color: "hsl(190 70% 50%)", size: "350px", position: "bottom-[15%] right-[15%]", opacity: 0.08 },
    ],
    silhouettes: false,
    bgImages: [
      { src: perfDashboard, opacity: 0.025 },
    ],
    particles: true,
  },
};

/* GPU: static particles only — no CSS animation loop */
const PARTICLE_POSITIONS = [
  { x: "12%", y: "18%", size: 2 },
  { x: "72%", y: "12%", size: 1.5 },
];

export function WebsiteBackground({ variant = "landing" }: WebsiteBackgroundProps) {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.3 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const config = VARIANT_CONFIG[variant];

  /* GPU: throttle mouse RAF to every other frame on low-end */
  const skipFrame = useRef(false);
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      skipFrame.current = !skipFrame.current;
      if (!skipFrame.current) {
        rafRef.current = null;
        return;
      }
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
      rafRef.current = null;
    });
  }, [isMobile]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      const y = window.scrollY;
      const po = y * 0.08;
      const bf = Math.max(0.2, 1 - y / 1200);
      const c = containerRef.current;
      if (c) {
        // Update CSS custom properties directly — zero React re-renders on scroll.
        c.style.setProperty('--po', String(po));
        c.style.setProperty('--bf-07', String(bf * 0.7));
        c.style.setProperty('--bf-035', String(bf * 0.35));
        c.style.setProperty('--bf', String(bf));
      }
      scrollRafRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (!isMobile) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [handleMouseMove, handleScroll, isMobile]);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: config.gradients }} />

      <div
        className="absolute inset-0"
        style={{
          boxShadow: "inset 0 0 250px 80px #040508",
        }}
      />

      {config.bgImages.map((img, i) => (
        <div
          key={i}
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${img.src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: img.opacity,
            transform: `rotate(-3deg) scale(1.08) translateY(calc(var(--po,0) * ${i % 2 === 0 ? -0.4 : 0.3} * 1px))`,
          }}
        />
      ))}

      {/* GPU: reduced from 4 sun streaks to 2, lower opacity */}
      {(config.sunStreaks !== false) && (<>
      <div
        className="absolute ws-sun-streak-1"
        style={{
          top: "-20%",
          left: "-10%",
          width: "120%",
          height: "80%",
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(180,140,255,0.10) 15%, transparent 40%)",
          opacity: "var(--bf-07, 0.7)" as unknown as number,
          transform: "translateY(calc(var(--po,0) * -0.2 * 1px))",
        }}
      />
      <div
        className="absolute ws-sun-streak-3"
        style={{
          top: "-10%",
          left: "-5%",
          width: "50%",
          height: "90%",
          background: "linear-gradient(125deg, rgba(200,180,255,0.12) 0%, rgba(130,200,255,0.08) 25%, transparent 50%)",
          opacity: "var(--bf-035, 0.35)" as unknown as number,
          transform: "translateY(calc(var(--po,0) * -0.1 * 1px))",
        }}
      />
      </>)}

      <div
        className="absolute"
        style={{
          top: "-5%",
          left: "-5%",
          width: "60%",
          height: "50%",
          background: "radial-gradient(ellipse at 20% 20%, rgba(180,140,255,0.14) 0%, rgba(150,110,220,0.09) 20%, rgba(120,80,200,0.04) 40%, transparent 65%)",
          opacity: "var(--bf, 1)" as unknown as number,
        }}
      />

      <div
        className="absolute"
        style={{
          top: "0",
          right: "-10%",
          width: "40%",
          height: "35%",
          background: "radial-gradient(ellipse at 80% 15%, rgba(180,160,255,0.04) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute"
        style={{
          bottom: "0",
          left: "30%",
          width: "40%",
          height: "25%",
          background: "radial-gradient(ellipse at 50% 90%, rgba(130,100,200,0.04) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute"
        style={{
          top: "30%",
          left: "-5%",
          width: "8%",
          height: "40%",
          background: "linear-gradient(90deg, rgba(160,130,255,0.03) 0%, transparent 100%)",
        }}
      />
      <div
        className="absolute"
        style={{
          top: "20%",
          right: "-5%",
          width: "8%",
          height: "50%",
          background: "linear-gradient(270deg, rgba(140,120,255,0.02) 0%, transparent 100%)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          opacity: 0.012,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 99px, rgba(140,120,255,0.12) 100px), repeating-linear-gradient(90deg, transparent, transparent 99px, rgba(140,120,255,0.08) 100px)",
          backgroundSize: "100px 100px",
          transform: "translateY(calc(var(--po,0) * 0.1 * 1px))",
        }}
      />

      {config.overlays.map((overlay, i) => (
        <div
          key={i}
          className={cn("absolute", overlay.position, overlay.drift)}
          style={{
            opacity: overlay.opacity,
            color: "hsl(270 40% 60%)",
            transform: `translateY(calc(var(--po,0) * ${i % 2 === 0 ? -1 : 0.5} * 1px))`,
          }}
        >
          <overlay.Component className="w-full h-full" />
        </div>
      ))}

      {variant === "landing" && <BlueprintImageOverlay />}

      {/* GPU: blur reduced 120px -> 60px, count halved for all variants */}
      {config.glowHotspots.map((spot, i) => (
        <div
          key={i}
          className={cn(
            "absolute rounded-full blur-[60px]",
            spot.position,
            i === 0 ? "ws-glow-drift-1" : i === 1 ? "ws-glow-drift-2" : "ws-glow-drift-3"
          )}
          style={{
            width: spot.size,
            height: spot.size,
            background: `radial-gradient(circle, ${spot.color} 0%, transparent 70%)`,
            opacity: spot.opacity,
          }}
        />
      ))}

      {config.silhouettes && (
        <>
          <div
            className="absolute ws-drift-1"
            style={{
              top: "15%",
              right: "-5%",
              width: "300px",
              height: "200px",
              opacity: 0.025,
              background: `
                linear-gradient(135deg, transparent 30%, hsl(270 40% 50%) 30%, hsl(270 40% 50%) 32%, transparent 32%),
                linear-gradient(135deg, transparent 40%, hsl(270 40% 50%) 40%, hsl(270 40% 50%) 41%, transparent 41%),
                linear-gradient(135deg, transparent 50%, hsl(270 40% 50%) 50%, hsl(270 40% 50%) 51%, transparent 51%)
              `,
              transform: "translateY(calc(var(--po,0) * -0.3 * 1px))",
            }}
          />
          <div
            className="absolute ws-drift-2"
            style={{
              bottom: "20%",
              left: "-3%",
              width: "250px",
              height: "180px",
              opacity: 0.022,
              borderRadius: "4px",
              border: "1px solid hsl(270 40% 50% / 0.3)",
              background: "linear-gradient(180deg, hsl(270 40% 50% / 0.05) 0%, transparent 100%)",
              transform: "translateY(calc(var(--po,0) * 0.2 * 1px))",
            }}
          />
        </>
      )}

      {/* GPU: reduced from 18 to 6 particles, no glow blur, just opacity/transform */}
      {!isMobile && config.particles && (
        <div className="absolute inset-0">
          {PARTICLE_POSITIONS.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: p.x,
                top: p.y,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: i === 0 ? "rgba(180,140,255,0.12)" : "rgba(140,200,255,0.10)",
              }}
            />
          ))}
        </div>
      )}

      {/* GPU: reduced spotlight from 700px -> 350px, lower opacity */}
      {!isMobile && (
        <div
          className="absolute w-[350px] h-[350px] rounded-full transition-all duration-[2000ms] ease-out"
          style={{
            left: `${mousePos.x * 100}%`,
            top: `${mousePos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(180,140,255,0.05) 0%, rgba(140,120,200,0.02) 40%, transparent 70%)",
          }}
        />
      )}

      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

export function SectionGlow({ color = "purple", intensity = "normal" }: { color?: "purple" | "cyan" | "mixed"; intensity?: "normal" | "strong" }) {
  const gradients = {
    purple: "radial-gradient(ellipse 70% 50% at 50% 50%, hsl(270 50% 45% / VAR) 0%, transparent 70%)",
    cyan: "radial-gradient(ellipse 70% 50% at 50% 50%, hsl(190 70% 40% / VAR) 0%, transparent 70%)",
    mixed: "radial-gradient(ellipse 60% 45% at 40% 50%, hsl(270 50% 45% / VAR) 0%, transparent 70%), radial-gradient(ellipse 50% 35% at 70% 50%, hsl(190 70% 40% / VARHALF) 0%, transparent 70%)",
  };

  const opacity = intensity === "strong" ? "0.10" : "0.06";
  const opacityHalf = intensity === "strong" ? "0.05" : "0.03";

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: gradients[color].replace(/VAR/g, opacity).replace(/VARHALF/g, opacityHalf),
      }}
    />
  );
}
