import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { getHonestTagline } from "@/lib/taglines";
import { telemetryManager } from "@/lib/telemetryManager";
import { useStore } from "@/lib/store";

interface SplashProps {
  onComplete: () => void;
}

// Total splash duration — kept short for instant feel.
// Pre-warm (telemetry + specs) fires immediately on mount so systems are
// hydrated DURING the splash, not after it.
const SPLASH_MS = 1400;

export default function Splash({ onComplete }: SplashProps) {
  const [contentVisible, setContentVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const tagline = useMemo(() => getHonestTagline(), []);

  useEffect(() => {
    // Tell main process the renderer has painted dark content — window shows now.
    (window as any).electronAPI?.signalFirstFrameReady?.();

    // Pre-warm: start WebSocket telemetry and pre-fetch specs while splash plays.
    // By the time the splash finishes the dashboard gets instant data.
    telemetryManager.start();

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

    // Reveal content on the first frame
    const tContent = setTimeout(() => setContentVisible(true), 60);
    const tDone = setTimeout(() => {
      console.log('[LAUNCH:R5] Splash onComplete — handing off to App');
      onComplete();
    }, SPLASH_MS);

    return () => {
      clearTimeout(tContent);
      clearTimeout(tDone);
    };
  }, [onComplete]);

  // rAF-based progress bar — avoids IntervalGuard 2000ms clamp
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
      {/* ── Static ambient glow — NO animated blur, single composited layer ── */}
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

      {/* ── Logo + text — only opacity + transform, zero blur on animated props ── */}
      <div className="relative flex flex-col items-center gap-7" style={{ zIndex: 10 }}>

        <AnimatePresence>
          {contentVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Outer glow ring — opacity-only animation, no blur change */}
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

              {/* Shimmer sweep inside logo — opacity + transform only */}
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
                {/* Shimmer on the bar — transform only */}
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
