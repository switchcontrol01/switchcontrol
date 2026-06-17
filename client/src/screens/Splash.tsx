import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { getHonestTagline } from "@/lib/taglines";
import { useStore } from "@/lib/store";

interface SplashProps {
  onComplete: () => void;
}

const SPLASH_MS = 2500;

// Dust particles — opacity + transform only, no filter animations
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

// Diagonal sun-streak beams — opacity only, blur is static (not animated)
const STREAKS = [
  { left: "4%",  top: "-8%",  rot: "28deg", w: "170vw", h: "6px",  color: "rgba(168,85,247,0.55)",  blur: 4,   dur: 18, delay: 0   },
  { left: "14%", top: "18%",  rot: "24deg", w: "155vw", h: "4px",  color: "rgba(0,200,255,0.48)",   blur: 3,   dur: 22, delay: 1.4 },
  { left: "2%",  top: "44%",  rot: "20deg", w: "145vw", h: "8px",  color: "rgba(168,85,247,0.42)",  blur: 5,   dur: 26, delay: 0.7 },
  { left: "28%", top: "-4%",  rot: "32deg", w: "125vw", h: "3px",  color: "rgba(0,230,255,0.45)",   blur: 2.5, dur: 20, delay: 2.8 },
  { left: "0%",  top: "62%",  rot: "18deg", w: "135vw", h: "5px",  color: "rgba(200,120,255,0.40)", blur: 3.5, dur: 24, delay: 4.0 },
];

export default function Splash({ onComplete }: SplashProps) {
  const [contentVisible, setContentVisible] = useState(false);
  const [initializingDone, setInitializingDone] = useState(false);
  const [progress, setProgress] = useState(0);
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
    // IMPORTANT: We restore the CSS opacity lock (set to 0 by preload.js) HERE,
    // synchronously, before the IPC crosses the process boundary. IPC is async
    // so by the time main.js receives the signal and calls mainWindow.show(),
    // the Chromium compositor has already committed the dark Splash frame at
    // full opacity. This eliminates the white flash on Windows regardless of
    // whether setOpacity() works (it requires transparent:true on Windows).
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

    const tContent = setTimeout(() => setContentVisible(true), 60);
    const tInit    = setTimeout(() => setInitializingDone(true), 1000);
    const tDone    = setTimeout(() => {
      console.log('[LAUNCH:R5] Splash onComplete — handing off to App');
      onCompleteRef.current();
    }, SPLASH_MS);

    return () => {
      clearTimeout(tContent);
      clearTimeout(tInit);
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
        const p = progressRef.current;
        if (p >= 100) return 100;
        const r = 100 - p;
        const scale = dt / 36;
        if (p < 60) return p + 5.5 * scale;
        if (p < 85) return p + Math.max(r * 0.18, 1.0) * scale;
        return p + Math.max(r * 0.09, 0.35) * scale;
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
      {/* ── Static ambient glow — single non-animated composited layer ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: 0,
          background: [
            "radial-gradient(ellipse 70% 55% at 48% 44%, rgba(139,92,246,0.14) 0%, transparent 68%)",
            "radial-gradient(ellipse 50% 40% at 52% 52%, rgba(0,190,255,0.08) 0%, transparent 70%)",
          ].join(", "),
        }}
      />

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
              background: p.id % 3 === 0 ? 'rgba(168,85,247,1)' : p.id % 3 === 1 ? 'rgba(0,210,255,1)' : 'rgba(210,160,255,1)',
              boxShadow: `0 0 ${p.size * 2}px ${p.size}px ${p.id % 3 === 0 ? 'rgba(168,85,247,0.5)' : p.id % 3 === 1 ? 'rgba(0,210,255,0.5)' : 'rgba(210,160,255,0.5)'}`,
            }}
            initial={{ opacity: p.opacity * 0.2 }}
            animate={{ x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [p.opacity * 0.2, p.opacity, p.opacity * 0.35, p.opacity, p.opacity * 0.2] }}
            transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
          />
        ))}
      </div>

      {/* ── Logo + text — opacity + transform, no blur animation ── */}
      <div className="relative flex flex-col items-center gap-7" style={{ zIndex: 10 }}>

        <AnimatePresence>
          {contentVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Outer glow ring — opacity animation only */}
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

              {/* Shimmer sweep inside logo — transform only */}
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

              {/* Progress bar */}
              <div className="relative w-48 h-[1.5px] rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.07)" }}>
                <motion.div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, rgba(139,92,246,0.70), rgba(0,210,255,0.90), rgba(168,85,247,0.70))",
                    boxShadow: "0 0 8px rgba(139,92,246,0.55)",
                  }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.08, ease: "linear" }}
                />
                <motion.div
                  className="absolute top-0 h-full w-12"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)" }}
                  animate={{ x: ["-48px", "192px"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
