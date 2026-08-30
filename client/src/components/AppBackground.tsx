import { useEffect, useRef } from "react";
import { useMotion } from "@/lib/motion";
import { getSessionGlowColor } from "@/lib/startupGlow";
import { useAdaptivePerformance } from "@/lib/adaptivePerformanceStore";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";
import { getAdaptiveVisualPolicy } from "@shared/adaptivePerformance";

// Module-level timestamp — survives remounts so every new AppBackground
// instance can resume CSS animations at the correct phase rather than
// restarting from scratch (each page navigation remounts AppLayout).
const _BG_SESSION_START = Date.now();
/** Returns a CSS animation-delay string (negative) that phase-locks the
 *  animation to where it would be if it had run since session start. */
function _bgDelay(periodS: number, staggerS = 0): string {
  const elapsed = (Date.now() - _BG_SESSION_START) / 1000 + staggerS;
  return `-${(elapsed % periodS).toFixed(2)}s`;
}

/* ─────────────────────────────────────────────────────────────
   AppBackground
   CPU-reduction strategy:
   • All orb breathing uses CSS @keyframes — compositor-thread,
     zero JS interpolation per frame.
   • prefersReducedMotion → 2 fully static orbs, zero animation.
   • Adaptive capability profile selects ambient, wave and cursor cost.
   • Cursor spotlight RAF starts only on first mousemove,
     stops automatically after 3 s of mouse idle.
   • GPU: removed mixBlendMode from cursor spotlight (expensive)
   • GPU: reduced blur sizes on all orbs
   ───────────────────────────────────────────────────────────── */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const CSS = `
  @keyframes sc-orb-a {
    0%,100%{ opacity:.65; transform:scale(1) translate(0px,0px); }
    35%    { opacity:.90; transform:scale(1.08) translate(16px,12px); }
    65%    { opacity:.78;  transform:scale(1.03) translate(-8px,-6px); }
  }
  @keyframes sc-orb-b {
    0%,100%{ opacity:.50; transform:scale(1) translate(0px,0px); }
    35%    { opacity:.82; transform:scale(1.12) translate(-14px,-10px); }
    65%    { opacity:.65; transform:scale(1.04) translate(8px,4px); }
  }
  @keyframes sc-orb-c {
    0%,100%{ opacity:.40; transform:scale(1) translate(0px,0px); }
    35%    { opacity:.70; transform:scale(1.14) translate(-10px,0px); }
    65%    { opacity:.50; transform:scale(1.04) translate(6px,0px); }
  }
  @keyframes sc-orb-d {
    0%,100%{ opacity:.30; transform:scale(1) translate(0px,0px); }
    50%    { opacity:.55; transform:scale(1.10) translate(10px,-8px); }
  }
  @keyframes sc-orb-e {
    0%,100%{ opacity:.35; transform:scale(.92); }
    50%    { opacity:.75; transform:scale(1.06); }
  }
  @keyframes sc-wave-a {
    0%,100%{ transform:translateX(0px); }
    50%    { transform:translateX(70px); }
  }
  @keyframes sc-wave-b {
    0%,100%{ transform:translateX(0px); }
    50%    { transform:translateX(-45px); }
  }
`;

export function AppBackground() {
  const spotRef   = useRef<HTMLDivElement>(null);
  const mousePos  = useRef({ x: -500, y: -500 });
  const curPos    = useRef({ x: -500, y: -500 });
  const rafId     = useRef<number>(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running   = useRef(false);
  const { prefersReducedMotion } = useMotion();
  const appReducedMotion = useUserPreferencesStore((state) => state.reducedMotion);
  const { profile } = useAdaptivePerformance();
  const effectiveReducedMotion = prefersReducedMotion || appReducedMotion;
  const visualPolicy = getAdaptiveVisualPolicy(profile, effectiveReducedMotion);
  const staticOnly = !visualPolicy.animateAmbient;

  /* ── Cursor spotlight — only active when mouse is moving ─────── */
  useEffect(() => {
    if (!visualPolicy.cursorSpotlight) return;

    const stopRaf = () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
        running.current = false;
      }
    };

    const tick = () => {
      curPos.current.x = lerp(curPos.current.x, mousePos.current.x, 0.055);
      curPos.current.y = lerp(curPos.current.y, mousePos.current.y, 0.055);

      if (spotRef.current) {
        spotRef.current.style.transform =
          `translate(${curPos.current.x - 175}px, ${curPos.current.y - 175}px)`;
      }
      if (running.current) rafId.current = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!running.current) {
        running.current = true;
        rafId.current = requestAnimationFrame(tick);
      }
      // Stop RAF after 3 s of no movement
      idleTimer.current = setTimeout(stopRaf, 3000);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      stopRaf();
    };
  }, [visualPolicy.cursorSpotlight]);

  /* ── Static-only path (reduced motion or efficiency profile) ── */
  if (staticOnly) {
    return (
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none select-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <div className="absolute" style={{
          top: "-5%", left: "-5%",
          width: "65vw", height: "65vw",
          background: "radial-gradient(ellipse, rgba(0,212,255,0.08) 0%, rgba(0,160,200,0.02) 45%, transparent 68%)",
          filter: "blur(40px)",
        }} />
        <div className="absolute" style={{
          bottom: "-8%", right: "-6%",
          width: "58vw", height: "58vw",
          background: "radial-gradient(ellipse, rgba(0,200,255,0.10) 0%, rgba(0,140,220,0.03) 45%, transparent 70%)",
          filter: "blur(44px)",
        }} />
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 32%, rgba(20,24,29,0.90) 100%)",
        }} />
      </div>
    );
  }

  /* ── Animated path (CSS @keyframes — compositor-threaded) ────── */
  return (
    <>
      <style>{CSS}</style>
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none select-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {/* Layer 1: breathing ambient orbs — CSS transform animation only.
            will-change removed: orbs animate slowly (12-25s) via CSS keyframes
            so the browser compositor can batch them without a permanent layer hint,
            reducing VRAM pressure on integrated graphics. */}
        <div className="absolute" style={{
          top: "-5%", left: "-5%",
          width: "65vw", height: "65vw",
          background: "radial-gradient(ellipse, rgba(0,212,255,0.10) 0%, rgba(0,160,200,0.03) 45%, transparent 68%)",
          filter: "blur(40px)",
          animation: "sc-orb-a 18s ease-in-out infinite",
          animationDelay: _bgDelay(18),
        }} />
        <div className="absolute" style={{
          bottom: "-8%", right: "-6%",
          width: "58vw", height: "58vw",
          background: "radial-gradient(ellipse, rgba(0,200,255,0.14) 0%, rgba(0,140,220,0.05) 45%, transparent 70%)",
          filter: "blur(44px)",
          animation: "sc-orb-b 20s ease-in-out infinite",
          animationDelay: _bgDelay(20, 3),
        }} />
        <div className="absolute" style={{
          top: "-2%", right: "5%",
          width: "42vw", height: "42vw",
          background: `radial-gradient(ellipse, ${getSessionGlowColor()}0.06) 0%, transparent 65%)`,
          filter: "blur(36px)",
          animation: "sc-orb-c 22s ease-in-out infinite",
          animationDelay: _bgDelay(22, 7),
        }} />
        <div className="absolute" style={{
          bottom: "5%", left: "8%",
          width: "38vw", height: "38vw",
          background: "radial-gradient(ellipse, rgba(42,49,58,0.05) 0%, transparent 65%)",
          filter: "blur(32px)",
          animation: "sc-orb-d 25s ease-in-out infinite",
          animationDelay: _bgDelay(25, 12),
        }} />
        <div className="absolute" style={{
          top: "50%", left: "50%",
          width: "40vw", height: "40vw",
          marginLeft: "-20vw", marginTop: "-20vw",
          background: "radial-gradient(ellipse, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.04) 50%, transparent 72%)",
          filter: "blur(30px)",
          animation: "sc-orb-e 12s ease-in-out infinite",
          animationDelay: _bgDelay(12),
        }} />

        {/* Layer 2: energy-flow wave grid (CSS-animated — no framer overhead) */}
        {visualPolicy.waveGrid && <div
          className="absolute inset-0 overflow-hidden"
          style={{ opacity: 0.10, transform: "rotate(-8deg) scale(1.5)" }}
        >
          <div className="absolute inset-0" style={{ animation: "sc-wave-a 24s linear infinite" }}>
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
          </div>
          <div className="absolute inset-0" style={{ animation: "sc-wave-b 18s linear infinite" }}>
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
          </div>
        </div>}

        {/* Layer 2b: fine dot grid — static */}
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle, hsl(252 35% 58% / 0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        {/* Layer 3: cursor spotlight — starts hidden, moved on mousemove */
        /* GPU: removed mixBlendMode: screen (very expensive compositing) */}
        {visualPolicy.cursorSpotlight && <div
          ref={spotRef}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: "350px", height: "350px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.02) 50%, transparent 72%)",
            filter: "blur(24px)",
            willChange: "transform",
            pointerEvents: "none",
            transform: "translate(-500px,-500px)",
          }}
        />}

        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 32%, rgba(20,24,29,0.90) 100%)",
          pointerEvents: "none",
        }} />
      </div>
    </>
  );
}
