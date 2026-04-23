import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { getTagline } from "@/lib/taglines";

interface SplashProps {
  onComplete: () => void;
}

const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7)  % 100,
  size: 1.2 + (i % 4) * 0.6,
  opacity: 0.12 + (i % 5) * 0.06,
  dur: 6 + (i % 7) * 2.2,
  dx: ((i % 9) - 4) * 18,
  dy: ((i % 6) - 3) * 12,
  delay: (i * 0.28) % 4,
}));

const STREAKS = [
  { left: "4%",  top: "-8%",  rot: "28deg", w: "170vw", h: "6px",  color: "rgba(168,85,247,0.55)",  blur: 4,   dur: 18, delay: 0   },
  { left: "14%", top: "18%",  rot: "24deg", w: "155vw", h: "4px",  color: "rgba(0,200,255,0.48)",   blur: 3,   dur: 22, delay: 1.4 },
  { left: "2%",  top: "44%",  rot: "20deg", w: "145vw", h: "8px",  color: "rgba(168,85,247,0.42)",  blur: 5,   dur: 26, delay: 0.7 },
  { left: "28%", top: "-4%",  rot: "32deg", w: "125vw", h: "3px",  color: "rgba(0,230,255,0.45)",   blur: 2.5, dur: 20, delay: 2.8 },
  { left: "0%",  top: "62%",  rot: "18deg", w: "135vw", h: "5px",  color: "rgba(200,120,255,0.40)", blur: 3.5, dur: 24, delay: 4.0 },
];

export default function Splash({ onComplete }: SplashProps) {
  const [logoReady, setLogoReady]   = useState(false);
  const [textReady, setTextReady]   = useState(false);
  const [sweepReady, setSweepReady] = useState(false);
  const [progress, setProgress]     = useState(0);
  const tagline = useMemo(() => getTagline(), []);

  // ── Launch handshake ──────────────────────────────────────────────────────
  // After one rAF, Chromium has composited the first real frame (dark Splash
  // background + initial state). We then signal main to show the window and
  // start the CSS opacity fade-in. This ensures the window is NEVER visible
  // before a dark branded frame is ready.
  useEffect(() => {
    console.log('[LAUNCH:R2] Splash mounted — queueing first-frame-ready signal');
    const raf = requestAnimationFrame(() => {
      console.log('[LAUNCH:R3] first-frame-ready: sending IPC + starting opacity reveal');
      (window as any).electronAPI?.signalFirstFrameReady?.();
      // Reveal the window content with a 200ms CSS opacity fade (set in index.html).
      // Uses documentElement so no React wrapper or transform is involved —
      // position:fixed children are unaffected.
      document.documentElement.style.opacity = '1';
      console.log('[LAUNCH:R4] opacity fade-in started');
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Logo first — brand established quickly.
    const t1 = setTimeout(() => setLogoReady(true),  80);
    // Title follows logo.
    const t2 = setTimeout(() => setTextReady(true),  220);
    // Diagonal sweep fires after foreground is visible.
    const t3 = setTimeout(() => setSweepReady(true), 480);
    // Hand off to App — App.tsx AnimatePresence handles the exit fade (0.65s).
    // No internal exit animation here; having two exit animations caused a blank frame.
    const done = setTimeout(() => {
      console.log('[LAUNCH:R5] Splash onComplete — handing off to App');
      onComplete();
    }, 1800);

    // Progress bar — fills to ~90% in 1.8 s, slows near the end (never quite hits 100%)
    const pi = setInterval(() => {
      setProgress(p => {
        if (p >= 100) return 100;
        const r = 100 - p;
        if (p < 60) return p + 3.2;
        if (p < 85) return p + Math.max(r * 0.14, 0.8);
        return p + Math.max(r * 0.07, 0.25);
      });
    }, 36);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(done);
      clearInterval(pi);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 overflow-hidden flex items-center justify-center"
      style={{ background: "#07090D" }}
    >
      {/* ── Layer A: wide atmospheric hazes ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "-12%", top: "-8%",
          width: "78vw", height: "78vw",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.28) 0%, rgba(80,40,180,0.10) 45%, transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{ x: [0, 22, 0], y: [0, 14, 0], opacity: [0.55, 0.85, 0.55], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          right: "-8%", bottom: "-6%",
          width: "68vw", height: "68vw",
          background: "radial-gradient(ellipse, rgba(0,190,255,0.22) 0%, rgba(0,120,210,0.08) 48%, transparent 70%)",
          filter: "blur(110px)",
        }}
        animate={{ x: [0, -18, 0], y: [0, -12, 0], opacity: [0.45, 0.80, 0.45], scale: [1, 1.10, 1] }}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "30%", top: "55%",
          width: "50vw", height: "50vw",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.15) 0%, transparent 68%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, 12, 0], opacity: [0.30, 0.60, 0.30], scale: [1, 1.12, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />

      {/* ── Layer B: diagonal sun-streak beams ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STREAKS.map((s, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: s.left, top: s.top,
              width: s.w, height: s.h,
              background: `linear-gradient(90deg, transparent 0%, ${s.color} 30%, ${s.color} 70%, transparent 100%)`,
              transform: `rotate(${s.rot})`,
              transformOrigin: "left center",
              filter: `blur(${s.blur}px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.65, 1, 0] }}
            transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
          />
        ))}
      </div>

      {/* ── Layer C: floating dust particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 3 }}>
        {PARTICLES.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              width: p.size, height: p.size,
              background: p.id % 3 === 0 ? 'rgba(168,85,247,1)' : p.id % 3 === 1 ? 'rgba(0,210,255,1)' : 'rgba(210,160,255,1)',
              boxShadow: `0 0 ${p.size * 2}px ${p.size}px ${p.id % 3 === 0 ? 'rgba(168,85,247,0.5)' : p.id % 3 === 1 ? 'rgba(0,210,255,0.5)' : 'rgba(210,160,255,0.5)'}`,
            }}
            initial={{ opacity: p.opacity * 0.2 }}
            animate={{ x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [p.opacity * 0.2, p.opacity, p.opacity * 0.35, p.opacity, p.opacity * 0.2] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
          />
        ))}
      </div>

      {/* ── Layer D: sun-haze bloom ── */}
      <div className="absolute pointer-events-none" style={{ left: "14%", top: "58%", zIndex: 2 }}>
        <motion.div
          style={{
            width: "900px", height: "540px",
            marginLeft: "-150px", marginTop: "-270px",
            background: "radial-gradient(ellipse at 20% 50%, rgba(168,85,247,0.32) 0%, rgba(0,180,255,0.16) 35%, rgba(255,140,60,0.06) 58%, transparent 72%)",
            filter: "blur(60px)",
          }}
          animate={{ opacity: [0.5, 0.85, 0.5], x: [0, 14, 0], y: [0, -8, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── Layer D: centre bloom behind logo ── */}
      <div className="absolute pointer-events-none" style={{ left: "50%", top: "46%", zIndex: 3 }}>
        <motion.div
          style={{
            width: "640px", height: "640px",
            marginLeft: "-320px", marginTop: "-320px",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.28) 0%, rgba(0,200,255,0.12) 38%, transparent 68%)",
            filter: "blur(48px)",
          }}
          animate={{ opacity: [0.45, 0.80, 0.45], scale: [0.96, 1.06, 0.96] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          style={{
            position: "absolute",
            width: "280px", height: "280px",
            marginLeft: "-140px", marginTop: "-140px",
            top: "50%", left: "50%",
            background: "radial-gradient(ellipse, rgba(210,160,255,0.30) 0%, rgba(0,215,255,0.14) 44%, transparent 70%)",
            filter: "blur(28px)",
          }}
          animate={{ opacity: [0.55, 0.95, 0.55], scale: [0.92, 1.10, 0.92] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        />
      </div>

      {/* ── Layer E: diagonal reveal sweep ── */}
      <AnimatePresence>
        {sweepReady && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 4 }}>
            <motion.div
              style={{
                position: "absolute",
                top: "-80%", left: "-80%",
                width: "80%", height: "280%",
                background: [
                  "linear-gradient(90deg,",
                  "  transparent 0%,",
                  "  rgba(168,85,247,0.10) 30%,",
                  "  rgba(139,92,246,0.14) 48%,",
                  "  rgba(0,200,255,0.08) 62%,",
                  "  transparent 80%)",
                ].join(""),
                filter: "blur(55px)",
                transform: "rotate(-28deg)",
                transformOrigin: "top left",
              }}
              initial={{ x: "0%", opacity: 0 }}
              animate={{ x: "340%", opacity: [0, 0.92, 0.78, 0.40, 0] }}
              transition={{ duration: 3.8, ease: [0.40, 0, 0.20, 1] }}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ── Vignette ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5,
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(7,9,13,0.88) 100%)",
      }} />

      {/* ── Logo + text ── */}
      <div className="relative flex flex-col items-center gap-8" style={{ zIndex: 10 }}>

        <AnimatePresence>
          {logoReady && (
            <motion.div
              initial={{ opacity: 0, y: 16, filter: "blur(18px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: "190px", height: "190px",
                  top: "50%", left: "50%",
                  marginLeft: "-95px", marginTop: "-95px",
                  background: "radial-gradient(ellipse, rgba(168,85,247,0.50) 0%, rgba(0,210,255,0.22) 42%, transparent 70%)",
                  filter: "blur(24px)",
                }}
                animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0.90, 0.55] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute rounded-[24%] pointer-events-none"
                style={{
                  inset: "-10px",
                  border: "1px solid rgba(168,85,247,0.30)",
                  boxShadow: "0 0 28px rgba(139,92,246,0.20), 0 0 60px rgba(0,210,255,0.10)",
                  borderRadius: "30%",
                }}
                animate={{ opacity: [0.35, 0.75, 0.35] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-0 rounded-[22%] overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.22) 50%, transparent 75%)" }}
                  animate={{ x: ["-130%", "160%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                />
              </div>
              <motion.img
                src={logoImg}
                alt="SwitchControl"
                className="w-28 h-28 object-contain rounded-[22%]"
                draggable={false}
                animate={{
                  y: [0, -4, 0],
                  filter: [
                    "drop-shadow(0 0 20px rgba(139,92,246,0.55)) drop-shadow(0 0 50px rgba(0,210,255,0.20))",
                    "drop-shadow(0 0 38px rgba(139,92,246,0.85)) drop-shadow(0 0 80px rgba(0,210,255,0.38)) drop-shadow(0 0 6px rgba(255,170,60,0.20))",
                    "drop-shadow(0 0 20px rgba(139,92,246,0.55)) drop-shadow(0 0 50px rgba(0,210,255,0.20))",
                  ],
                }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {textReady && (
            <motion.div
              initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <h1 className="text-3xl font-bold tracking-tight select-none" style={{ letterSpacing: "-0.01em" }}>
                <span className="text-white">Switch</span>
                <span style={{
                  background: "linear-gradient(90deg, hsl(270,65%,72%), hsl(192,90%,65%), hsl(318,70%,73%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>Control</span>
              </h1>

              <p
                className="text-[13px] text-white/38 text-center tracking-wide select-none"
                data-testid="text-splash-tagline"
              >
                {tagline}
              </p>

              {/* Progress track */}
              <div className="relative w-52 h-[1.5px] rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.07)" }}>
                <motion.div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, rgba(139,92,246,0.70), rgba(0,210,255,0.90), rgba(168,85,247,0.70))",
                    boxShadow: "0 0 8px rgba(139,92,246,0.60), 0 0 18px rgba(0,210,255,0.30)",
                  }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute top-0 h-full w-16"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
                  animate={{ x: ["-64px", "208px"] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }}
                />
              </div>

              <motion.p
                className="text-[11px] text-white/22 tracking-widest uppercase select-none"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                Initializing
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
