import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   AppBackground
   Layers (back → front):
     0  matte base  #07090D (set in CSS vars)
     1  large ambient orbs — slow breathing drift
     2  energy-flow wave grid (SVG, very subtle)
     3  cursor spotlight — lerped, RAF-driven (no React re-renders)
     4  vignette edge darkening
   ───────────────────────────────────────────────────────────── */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function AppBackground() {
  const spotRef  = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -500, y: -500 });
  const curPos   = useRef({ x: -500, y: -500 });
  const rafId    = useRef<number>(0);

  /* ── Cursor spotlight — RAF lerp, zero React re-renders ─────── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    const tick = () => {
      curPos.current.x = lerp(curPos.current.x, mousePos.current.x, 0.055);
      curPos.current.y = lerp(curPos.current.y, mousePos.current.y, 0.055);

      if (spotRef.current) {
        spotRef.current.style.transform =
          `translate(${curPos.current.x - 175}px, ${curPos.current.y - 175}px)`;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafId.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none select-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >

      {/* ── Layer 1a: top-left purple/violet anchor orb ─────────── */}
      <motion.div
        className="absolute"
        style={{
          top: "-5%", left: "-5%",
          width: "65vw", height: "65vw",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, rgba(100,50,210,0.08) 45%, transparent 68%)",
          filter: "blur(80px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale:   [1, 1.12, 1.04, 1],
          opacity: [0.7, 1, 0.85, 0.7],
          x:       [0, 20, -10, 0],
          y:       [0, 15, -8, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Layer 1b: bottom-right cyan orb ─────────────────────── */}
      <motion.div
        className="absolute"
        style={{
          bottom: "-8%", right: "-6%",
          width: "58vw", height: "58vw",
          background: "radial-gradient(ellipse, rgba(0,200,255,0.18) 0%, rgba(0,140,220,0.07) 45%, transparent 70%)",
          filter: "blur(90px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale:   [1, 1.16, 1.06, 1],
          opacity: [0.55, 0.9, 0.7, 0.55],
          x:       [0, -18, 10, 0],
          y:       [0, -12, 6, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />

      {/* ── Layer 1c: top-right pink/magenta accent ──────────────── */}
      <motion.div
        className="absolute"
        style={{
          top: "-2%", right: "5%",
          width: "42vw", height: "42vw",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.14) 0%, transparent 65%)",
          filter: "blur(75px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale:   [1, 1.18, 1.06, 1],
          opacity: [0.45, 0.78, 0.55, 0.45],
          x:       [0, -12, 8, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 7 }}
      />

      {/* ── Layer 1d: bottom-left amber warmth ──────────────────── */}
      <motion.div
        className="absolute"
        style={{
          bottom: "5%", left: "8%",
          width: "38vw", height: "38vw",
          background: "radial-gradient(ellipse, rgba(255,160,50,0.11) 0%, transparent 65%)",
          filter: "blur(70px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale:   [1, 1.14, 1],
          opacity: [0.35, 0.62, 0.35],
          x:       [0, 14, 0],
          y:       [0, -10, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 12 }}
      />

      {/* ── Layer 1e: centre breathing core ─────────────────────── */}
      <motion.div
        className="absolute"
        style={{
          top: "50%", left: "50%",
          width: "40vw", height: "40vw",
          marginLeft: "-20vw", marginTop: "-20vw",
          background: "radial-gradient(ellipse, rgba(168,85,247,0.16) 0%, rgba(0,210,255,0.08) 50%, transparent 72%)",
          filter: "blur(55px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale:   [0.9, 1.1, 0.95, 0.9],
          opacity: [0.4, 0.85, 0.6, 0.4],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Layer 2: energy-flow wave lines (3 drifting layers) ─── */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ opacity: 0.13, transform: "rotate(-8deg) scale(1.5)" }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ x: [0, 70, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="bg-wv1" x="0" y="0" width="340" height="220" patternUnits="userSpaceOnUse">
                <path d="M0 55  Q85 22  170 55  T340 55"  fill="none" stroke="hsl(268,60%,60%)" strokeWidth="1.0" opacity="0.7"/>
                <path d="M0 110 Q85 77  170 110 T340 110" fill="none" stroke="hsl(192,88%,55%)" strokeWidth="0.65" opacity="0.55"/>
                <path d="M0 165 Q85 132 170 165 T340 165" fill="none" stroke="hsl(310,65%,60%)" strokeWidth="0.75" opacity="0.5"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#bg-wv1)" />
          </svg>
        </motion.div>

        <motion.div
          className="absolute inset-0"
          animate={{ x: [0, -45, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="bg-wv2" x="0" y="0" width="270" height="190" patternUnits="userSpaceOnUse">
                <path d="M0 47  Q67 19  135 47  T270 47"  fill="none" stroke="hsl(195,85%,58%)" strokeWidth="0.55" opacity="0.6"/>
                <path d="M0 94  Q67 66  135 94  T270 94"  fill="none" stroke="hsl(265,58%,55%)" strokeWidth="0.45" opacity="0.5"/>
                <path d="M0 141 Q67 113 135 141 T270 141" fill="none" stroke="hsl(320,68%,62%)" strokeWidth="0.6"  opacity="0.5"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#bg-wv2)" />
          </svg>
        </motion.div>
      </div>

      {/* ── Layer 2b: fine dot grid ──────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(252 35% 58% / 0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Layer 3: cursor spotlight ────────────────────────────── */}
      <div
        ref={spotRef}
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "350px", height: "350px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.13) 0%, rgba(0,210,255,0.06) 50%, transparent 72%)",
          filter: "blur(28px)",
          mixBlendMode: "screen",
          willChange: "transform",
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 5: vignette ────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 32%, rgba(7,9,13,0.90) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
