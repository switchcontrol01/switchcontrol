import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { getHonestTagline } from "@/lib/taglines";
import { useStore } from "@/lib/store";

interface SplashProps {
  onComplete: () => void;
}

const SPLASH_MS = 2500;

// Fine dust particles — small, numerous, gently drifting
const PARTICLES = Array.from({ length: 52 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7)  % 100,
  size: 1.0 + (i % 5) * 0.55,
  opacity: 0.14 + (i % 6) * 0.07,
  dur: 5 + (i % 8) * 2.0,
  dx: ((i % 11) - 5) * 22,
  dy: ((i % 7) - 3) * 14,
  delay: (i * 0.22) % 5,
  color: i % 4 === 0 ? 'rgba(168,85,247,1)' : i % 4 === 1 ? 'rgba(0,210,255,1)' : i % 4 === 2 ? 'rgba(210,160,255,1)' : 'rgba(80,200,255,1)',
  glow: i % 4 === 0 ? 'rgba(168,85,247,0.6)' : i % 4 === 1 ? 'rgba(0,210,255,0.6)' : i % 4 === 2 ? 'rgba(210,160,255,0.6)' : 'rgba(80,200,255,0.6)',
}));

// Large drifting nebula orbs — big, soft, dreamy
const ORBS = [
  { cx: 28,  cy: 35, rx: 38, ry: 30, color: "rgba(139,92,246,0.13)", dx: 25, dy: -18, dur: 18 },
  { cx: 72,  cy: 60, rx: 42, ry: 34, color: "rgba(0,180,255,0.10)",  dx: -22, dy: 20, dur: 22 },
  { cx: 50,  cy: 20, rx: 30, ry: 24, color: "rgba(200,100,255,0.10)", dx: -15, dy: 30, dur: 26 },
  { cx: 15,  cy: 72, rx: 28, ry: 22, color: "rgba(0,220,255,0.08)",  dx: 30, dy: -12, dur: 20 },
  { cx: 82,  cy: 25, rx: 32, ry: 26, color: "rgba(168,85,247,0.09)", dx: -20, dy: 22, dur: 24 },
];

// Diagonal sun-streak beams — opacity only, blur is static (not animated)
const STREAKS = [
  { left: "4%",  top: "-8%",  rot: "28deg", w: "170vw", h: "6px",  color: "rgba(168,85,247,0.65)",  blur: 4,   dur: 18, delay: 0   },
  { left: "14%", top: "18%",  rot: "24deg", w: "155vw", h: "4px",  color: "rgba(0,200,255,0.58)",   blur: 3,   dur: 22, delay: 1.4 },
  { left: "2%",  top: "44%",  rot: "20deg", w: "145vw", h: "8px",  color: "rgba(168,85,247,0.52)",  blur: 5,   dur: 26, delay: 0.7 },
  { left: "28%", top: "-4%",  rot: "32deg", w: "125vw", h: "3px",  color: "rgba(0,230,255,0.55)",   blur: 2.5, dur: 20, delay: 2.8 },
  { left: "0%",  top: "62%",  rot: "18deg", w: "135vw", h: "5px",  color: "rgba(200,120,255,0.50)", blur: 3.5, dur: 24, delay: 4.0 },
  { left: "55%", top: "-12%", rot: "22deg", w: "120vw", h: "3px",  color: "rgba(120,80,255,0.42)",  blur: 3,   dur: 28, delay: 3.5 },
];

export default function Splash({ onComplete }: SplashProps) {
  const [contentVisible, setContentVisible] = useState(false);
  const [initializingDone, setInitializingDone] = useState(false);
  const [progress, setProgress] = useState(0);
  // barDone: triggers the final snap-to-100 + completion flash
  const [barDone, setBarDone] = useState(false);
  const barDoneRef = useRef(false);
  const tagline = useMemo(() => getHonestTagline(), []);

  // Keep a stable ref to onComplete so the timer effect below can run with
  // empty deps — the timer fires exactly once no matter how many times the
  // parent re-renders and passes a new function reference.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    // double-rAF: fire AFTER the browser has committed and composited the first
    // Splash frame to screen. useEffect alone runs before paint; we need two
    // animation frames to guarantee the dark background is actually on-screen
    // before main.js gates on this signal to call mainWindow.show().
    //
    // double-rAF guarantees the dark Splash background is composited before the
    // signal crosses the IPC boundary. We clear the CSS opacity lock HERE,
    // synchronously, so by the time main.js receives the signal and calls
    // setOpacity(0)→show(), content is already at full CSS opacity. The
    // OS-level setOpacity fade (0→1 over 280ms) then cross-fades the entire
    // window in — premium appearance, no white flash, no instant pop.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.style.opacity = '';
        (window as any).electronAPI?.signalFirstFrameReady?.();
      });
    });

    // Telemetry starts in App.tsx after the authenticated phase transition —
    // not here, so IPC polling doesn't compete with splash animations.
    const api = (window as any).electronAPI;
    if (api?.system?.getSpecs) {
      api.system.getSpecs()
        .then((specs: any) => {
          if (!specs) return;
          useStore.getState().setStats({
            cpuName:     specs.cpu?.model    || 'Unavailable',
            cpuCores:    specs.cpu?.cores    || 0,
            cpuThreads:  specs.cpu?.threads  || 0,
            cpuSpeed:    specs.cpu?.speed    || 'Unavailable',
            gpuName:     specs.gpu?.model    || 'Unavailable',
            gpuVendor:   specs.gpu?.vendor   || 'Unavailable',
            vramGb:      specs.gpu?.vramGB   || 0,
            totalRamGb:  specs.ram?.totalGB  || 0,
            usedRamGb:   specs.ram?.usedGB   || 0,
            freeRamGb:   specs.ram?.freeGB   || 0,
            diskName:    specs.disk?.name    || 'Unavailable',
            diskUsedGb:  specs.disk?.usedGB  || 0,
            diskTotalGb: specs.disk?.totalGB || 0,
            osName:      specs.system?.os          || 'Unavailable',
            osVersion:   specs.system?.osVersion   || 'Unavailable',
            osArch:      specs.system?.arch        || 'Unavailable',
            hostname:    specs.system?.hostname    || 'Unavailable',
          });
        })
        .catch(() => {});
    }

    // Subscribe to specs:enriched so GPU/disk data that arrives during the
    // splash (WMI fast-path ~1s, full enrichment ~2-3s) updates the Zustand
    // store before Home.tsx mounts — preventing null-on-first-render.
    let enrichUnsub: (() => void) | null = null;
    if (api?.system?.onSpecsEnriched) {
      enrichUnsub = api.system.onSpecsEnriched((payload: any) => {
        const updates: Record<string, any> = {};
        const gpuModel: string | undefined = payload?.gpu?.model;
        if (gpuModel && gpuModel !== 'Detecting\u2026' && gpuModel !== '') {
          updates.gpuName   = gpuModel;
          updates.gpuVendor = payload.gpu?.vendor ?? '';
          if ((payload.gpu?.vramGB ?? 0) > 0) updates.vramGb = payload.gpu.vramGB;
        }
        const disk = payload?.disk;
        if (disk?.name && (disk.totalGB ?? 0) > 0) {
          updates.diskName    = disk.name;
          updates.diskUsedGb  = disk.usedGB  ?? 0;
          updates.diskTotalGb = disk.totalGB ?? 0;
        }
        if (Object.keys(updates).length > 0) {
          useStore.getState().setStats(updates);
        }
      });
    }

    const tContent  = setTimeout(() => setContentVisible(true), 60);
    const tInit     = setTimeout(() => setInitializingDone(true), 1000);
    // Fire ~380ms before splash ends — bar snaps to 100 with a flash, creating
    // a satisfying "charge complete" beat before the window transitions away.
    const tBarDone  = setTimeout(() => {
      barDoneRef.current = true;
      setBarDone(true);
    }, SPLASH_MS - 380);
    const tDone     = setTimeout(() => {
      console.log('[LAUNCH:R5] Splash onComplete — handing off to App');
      onCompleteRef.current();
    }, SPLASH_MS);

    return () => {
      clearTimeout(tContent);
      clearTimeout(tInit);
      clearTimeout(tBarDone);
      clearTimeout(tDone);
      enrichUnsub?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — timer must fire exactly once

  // rAF-based progress bar
  const progressRef = useRef(0);
  useEffect(() => {
    let rafId: number;
    let lastTs = 0;

    function step(ts: number) {
      if (lastTs === 0) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      progressRef.current = (() => {
        const p   = progressRef.current;
        // When barDone fires, the cap lifts and the bar snaps to 100 via
        // the spring transition on the animated div — rAF just needs to
        // keep supplying 100 so the motion value settles there.
        const cap = barDoneRef.current ? 100 : 96;
        if (p >= cap) return cap;
        const r     = cap - p;
        const scale = dt / 36;
        if (p < 60) return p + 5.5 * scale;
        if (p < 85) return p + Math.max(r * 0.18, 1.0) * scale;
        // Slow crawl from 85→96 so the user sees the bar almost-there
        return p + Math.max(r * 0.06, 0.2) * scale;
      })();

      setProgress(Math.min(100, progressRef.current));
      if (progressRef.current < 100) rafId = requestAnimationFrame(step);
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden flex items-center justify-center"
      style={{ background: "#07090D" }}
    >
      {/* ── Breathing ambient halo — pulses slowly, dreamy atmosphere ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          inset: 0,
          background: [
            "radial-gradient(ellipse 80% 65% at 48% 46%, rgba(139,92,246,0.22) 0%, transparent 65%)",
            "radial-gradient(ellipse 55% 45% at 52% 54%, rgba(0,190,255,0.14) 0%, transparent 70%)",
            "radial-gradient(ellipse 40% 35% at 30% 30%, rgba(200,100,255,0.08) 0%, transparent 60%)",
            "radial-gradient(ellipse 35% 30% at 70% 68%, rgba(0,220,255,0.07) 0%, transparent 60%)",
          ].join(", "),
        }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Large drifting nebula orbs — soft blobs beneath everything ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
        {ORBS.map((o, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${o.cx - o.rx}%`,
              top:  `${o.cy - o.ry}%`,
              width:  `${o.rx * 2}%`,
              height: `${o.ry * 2}%`,
              background: `radial-gradient(ellipse, ${o.color} 0%, transparent 70%)`,
              filter: "blur(32px)",
            }}
            animate={{ x: [0, o.dx, 0], y: [0, o.dy, 0] }}
            transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut", delay: i * 1.8 }}
          />
        ))}
      </div>

      {/* ── Diagonal sun-streak beams — opacity-only animation, blur is static ── */}
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

      {/* ── Floating dust particles — opacity + transform only ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 3 }}>
        {PARTICLES.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              width: p.size, height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2.5}px ${p.size * 1.5}px ${p.glow}`,
            }}
            initial={{ opacity: p.opacity * 0.2 }}
            animate={{ x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [p.opacity * 0.2, p.opacity, p.opacity * 0.35, p.opacity, p.opacity * 0.2] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
          />
        ))}
      </div>

      {/* ── Logo + text — restrained "signal lock" reveal ── */}
      <div className="relative flex flex-col items-center gap-7" style={{ zIndex: 10 }}>

        <AnimatePresence>
          {contentVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Soft bloom behind the mark — a quiet powered-on reveal */}
              <motion.div
                className="absolute pointer-events-none rounded-full"
                style={{
                  inset: "-34px",
                  background: [
                    "radial-gradient(circle at 38% 46%, rgba(168,85,247,0.38) 0%, transparent 48%)",
                    "radial-gradient(circle at 66% 54%, rgba(0,210,255,0.28) 0%, transparent 52%)",
                  ].join(", "),
                  filter: "blur(18px)",
                }}
                initial={{ opacity: 0, scale: 0.78 }}
                animate={{ opacity: [0.18, 0.78, 0.38], scale: [0.78, 1.08, 1] }}
                transition={{ duration: 1.35, times: [0, 0.54, 1], ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Outer glow ring — settles into a quiet ambient pulse */}
              <motion.div
                className="absolute rounded-[26%] pointer-events-none"
                style={{
                  inset: "-10px",
                  border: "1px solid rgba(168,85,247,0.28)",
                  boxShadow: "0 0 24px rgba(139,92,246,0.18)",
                }}
                animate={{ opacity: [0.30, 0.70, 0.30] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Violet-to-cyan energy sweep — clipped to the logo surface */}
              <div className="absolute inset-0 rounded-[22%] overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.18) 50%, transparent 75%)",
                  }}
                  animate={{ x: ["-130%", "160%"] }}
                  transition={{ duration: 2.0, repeat: Infinity, repeatDelay: 2.8, ease: "easeInOut" }}
                />
              </div>

              <img
                src={logoImg}
                alt="SwitchControl"
                className="w-24 h-24 object-contain rounded-[22%]"
                draggable={false}
                style={{
                  filter: "drop-shadow(0 0 22px rgba(139,92,246,0.55)) drop-shadow(0 0 48px rgba(0,210,255,0.18))",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contentVisible && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
              className="flex flex-col items-center gap-4"
            >
              <h1 className="text-3xl font-bold tracking-tight select-none" style={{ letterSpacing: "-0.01em" }}>
                <span className="text-white">Switch</span>
                <span style={{
                  background: "linear-gradient(90deg, #00D4FF, #33E0FF, #00C8F5)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>Control</span>
              </h1>

              <p className="text-[13px] text-white/35 text-center tracking-wide select-none"
                data-testid="text-splash-tagline">
                {tagline}
              </p>

              {/* Initializing status — fades after the first second */}
              <AnimatePresence>
                {!initializingDone && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-[10px] tracking-widest uppercase select-none"
                    style={{ color: "rgba(255,255,255,0.20)" }}
                  >
                    Initializing…
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Progress bar — outer div for spark/burst positioning (no clip),
                  inner div clips track + shimmer so nothing bleeds past the edge */}
              <div className="relative" style={{ width: "208px" }}>
                {/* Inner track — overflow-hidden keeps fill + shimmer inside bounds */}
                <div
                  className="relative w-full rounded-full overflow-hidden"
                  style={{ height: "3px", background: "rgba(255,255,255,0.06)" }}
                >
                  {/* Filled track */}
                  <motion.div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #7C3AED, #8B5CF6, #00C8F5, #33E0FF, #A855F7)",
                      backgroundSize: "200% 100%",
                      boxShadow: "0 0 10px rgba(139,92,246,0.7), 0 0 20px rgba(0,210,255,0.35)",
                    }}
                    animate={{
                      width: `${progress}%`,
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{
                      // Snap to 100% with a spring overshoot when barDone fires
                      width: barDone && progress >= 95
                        ? { duration: 0.38, ease: [0.34, 1.4, 0.64, 1] }
                        : { duration: 0.08, ease: "linear" },
                      backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" },
                    }}
                  />
                  {/* Shimmer sweep — stays inside clipped container */}
                  <motion.div
                    className="absolute top-0 h-full w-10 rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
                    animate={{ x: ["-40px", "208px"] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.2 }}
                  />
                </div>

                {/* Leading spark — lives in outer div so it's never clipped;
                    capped at 95% so it can't protrude the right edge */}
                <AnimatePresence>
                  {progress > 2 && !barDone && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                      style={{
                        left: `${Math.min(progress, 95)}%`,
                        width: "6px",
                        height: "6px",
                        marginLeft: "-3px",
                        background: "white",
                        boxShadow: "0 0 8px 3px rgba(180,120,255,0.9), 0 0 16px 6px rgba(0,220,255,0.5)",
                      }}
                      animate={{ opacity: [1, 0.6, 1], scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </AnimatePresence>

                {/* Completion burst — radial flash that fires when bar snaps to 100% */}
                <AnimatePresence>
                  {barDone && (
                    <>
                      {/* Expanding ring from the right end */}
                      <motion.div
                        className="absolute top-1/2 pointer-events-none rounded-full"
                        initial={{ opacity: 0.9, scale: 0, x: "-50%", y: "-50%" }}
                        animate={{ opacity: 0, scale: 2.2 }}
                        exit={{}}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          left: "100%",
                          width: "18px",
                          height: "18px",
                          background: "transparent",
                          border: "1.5px solid rgba(139,92,246,0.9)",
                          boxShadow: "0 0 8px rgba(0,210,255,0.8)",
                        }}
                      />
                      {/* Bright core dot at right end */}
                      <motion.div
                        className="absolute top-1/2 pointer-events-none rounded-full"
                        initial={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        animate={{ opacity: 0, scale: 1.6 }}
                        exit={{}}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        style={{
                          left: "100%",
                          width: "8px",
                          height: "8px",
                          background: "white",
                          boxShadow: "0 0 12px 4px rgba(180,120,255,1), 0 0 24px 8px rgba(0,220,255,0.7)",
                        }}
                      />
                      {/* Full bar glow pulse */}
                      <motion.div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 0 }}
                        exit={{}}
                        transition={{ duration: 0.55, ease: "easeOut" }}
                        style={{
                          height: "3px",
                          background: "linear-gradient(90deg, #7C3AED, #8B5CF6, #00C8F5, #33E0FF)",
                          boxShadow: "0 0 18px 5px rgba(139,92,246,0.95), 0 0 32px 10px rgba(0,210,255,0.6)",
                          filter: "blur(1px)",
                        }}
                      />
                    </>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
