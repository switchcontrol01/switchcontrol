import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";

interface FirstLaunchSplashProps {
  onComplete: () => void;
  deviceId?: string | null;
}

const TAGLINE = "Your machine. Under control.";

const AMBIENT_HAZES = [
  {
    style: { left: "-14%", top: "-10%", width: "80vw", height: "80vw",
      background: "radial-gradient(ellipse, rgba(139,92,246,0.38) 0%, rgba(80,40,180,0.14) 45%, transparent 70%)",
      filter: "blur(90px)" },
    animate: { x: [0, 18, 0], y: [0, 10, 0], opacity: [0.5, 0.9, 0.5], scale: [1, 1.07, 1] },
    transition: { duration: 12, repeat: Infinity, ease: "easeInOut" as const },
  },
  {
    style: { right: "-10%", bottom: "-8%", width: "72vw", height: "72vw",
      background: "radial-gradient(ellipse, rgba(0,190,255,0.30) 0%, rgba(0,120,210,0.10) 48%, transparent 70%)",
      filter: "blur(100px)" },
    animate: { x: [0, -14, 0], y: [0, -10, 0], opacity: [0.4, 0.85, 0.4], scale: [1, 1.09, 1] },
    transition: { duration: 15, repeat: Infinity, ease: "easeInOut" as const, delay: 2 },
  },
  {
    style: { left: "28%", top: "52%", width: "52vw", height: "52vw",
      background: "radial-gradient(ellipse, rgba(236,72,153,0.18) 0%, transparent 68%)",
      filter: "blur(80px)" },
    animate: { x: [0, 10, 0], opacity: [0.25, 0.55, 0.25], scale: [1, 1.10, 1] },
    transition: { duration: 18, repeat: Infinity, ease: "easeInOut" as const, delay: 4 },
  },
];

function TaglineReveal({ text, delay }: { text: string; delay: number }) {
  const chars = useMemo(() => text.split(""), [text]);
  return (
    <span className="inline-block">
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          className="inline-block"
          style={{ whiteSpace: ch === " " ? "pre" : "normal" }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: delay + i * 0.038,
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

export default function FirstLaunchSplash({ onComplete, deviceId }: FirstLaunchSplashProps) {
  const [phase, setPhase] = useState<
    "dark" | "hazes" | "recognition" | "logo" | "text" | "tagline" | "exiting"
  >("dark");

  const deviceLabel = deviceId
    ? deviceId.slice(0, 8).split("").join(" ")
    : "-- -- -- -- -- -- -- --";

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); ts.push(t); };

    at(180,  () => setPhase("hazes"));
    at(520,  () => setPhase("recognition"));
    at(1700, () => setPhase("logo"));
    at(2300, () => setPhase("text"));
    at(2780, () => setPhase("tagline"));
    at(3900, () => setPhase("exiting"));
    at(5000, () => onComplete());

    return () => ts.forEach(clearTimeout);
  }, [onComplete]);

  const showHazes      = ["hazes","recognition","logo","text","tagline","exiting"].includes(phase);
  const showRecognize  = ["recognition"].includes(phase);
  const showLogo       = ["logo","text","tagline","exiting"].includes(phase);
  const showText       = ["text","tagline","exiting"].includes(phase);
  const showTagline    = ["tagline","exiting"].includes(phase);
  const isExiting      = phase === "exiting";

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden flex items-center justify-center select-none"
      style={{ background: "#07090D" }}
      animate={isExiting
        ? { opacity: 0, scale: 1.05, filter: "blur(32px)" }
        : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={isExiting
        ? { duration: 1.1, ease: [0.4, 0, 0.8, 1] }
        : { duration: 0 }}
    >

      {/* ── Ambient colour hazes ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showHazes && AMBIENT_HAZES.map((h, i) => (
          <motion.div
            key={i}
            className="absolute pointer-events-none"
            style={h.style as React.CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ ...h.animate, opacity: undefined }}
            transition={{ ...h.transition, opacity: { duration: 1.4, ease: "easeOut" } }}
          />
        ))}
      </AnimatePresence>

      {/* ── Center bloom behind logo ──────────────────────────────────────── */}
      {showLogo && (
        <div className="absolute pointer-events-none" style={{ left: "50%", top: "46%", zIndex: 3 }}>
          {/* Outer halo — larger than normal splash */}
          <motion.div
            style={{
              width: "760px", height: "760px",
              marginLeft: "-380px", marginTop: "-380px",
              background: "radial-gradient(ellipse, rgba(139,92,246,0.38) 0%, rgba(0,200,255,0.16) 40%, transparent 68%)",
              filter: "blur(56px)",
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.85, 0.65, 0.85], scale: [0.6, 1.08, 1.0, 1.08] }}
            transition={{ duration: 4, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Inner warm burst */}
          <motion.div
            style={{
              position: "absolute", width: "320px", height: "320px",
              marginLeft: "-160px", marginTop: "-160px",
              top: "50%", left: "50%",
              background: "radial-gradient(ellipse, rgba(220,170,255,0.40) 0%, rgba(0,220,255,0.18) 44%, transparent 70%)",
              filter: "blur(32px)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0.7, 1], scale: [0.5, 1.14, 0.95, 1.14] }}
            transition={{ duration: 3.2, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </div>
      )}

      {/* ── Vignette ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 4,
          background: "radial-gradient(ellipse 78% 78% at 50% 50%, transparent 28%, rgba(7,9,13,0.90) 100%)",
        }}
      />

      {/* ── Device Recognition module ─────────────────────────────────────── */}
      <AnimatePresence>
        {showRecognize && (
          <motion.div
            key="recognition"
            className="absolute flex flex-col items-center gap-2"
            style={{ zIndex: 10, top: "36%", left: "50%", x: "-50%" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, filter: "blur(8px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Scan line — sweeps top to bottom of this module */}
            <div className="relative overflow-hidden" style={{ width: "220px" }}>
              <motion.div
                className="absolute left-0 right-0 h-[1px]"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.9), rgba(0,210,255,0.8), transparent)",
                  boxShadow: "0 0 12px rgba(139,92,246,0.6), 0 0 4px rgba(0,210,255,0.5)",
                }}
                initial={{ top: "-2px" }}
                animate={{ top: "100%" }}
                transition={{ duration: 0.85, delay: 0.25, ease: "linear" }}
              />
            </div>

            {/* Status text */}
            <motion.p
              className="font-mono uppercase tracking-[0.32em] text-[10px]"
              style={{ color: "rgba(139,92,246,0.75)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              Device Recognized
            </motion.p>

            {/* Device ID fragment */}
            <motion.p
              className="font-mono text-[11px] tracking-[0.28em]"
              style={{ color: "rgba(255,255,255,0.30)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              {deviceLabel}
            </motion.p>

            {/* Thin horizontal rule */}
            <motion.div
              className="rounded-full"
              style={{
                height: "1px", width: "0px",
                background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.5), rgba(0,210,255,0.4), transparent)",
              }}
              animate={{ width: "180px" }}
              transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logo + wordmark + tagline ─────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-8" style={{ zIndex: 10 }}>

        {/* Logo */}
        <AnimatePresence>
          {showLogo && (
            <motion.div
              key="logo"
              className="relative"
              initial={{ opacity: 0, scale: 0.7, filter: "blur(24px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.85, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {/* Orbiting ring 1 */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: "-18px",
                  border: "1px solid rgba(139,92,246,0.30)",
                  boxShadow: "0 0 22px rgba(139,92,246,0.20), inset 0 0 16px rgba(139,92,246,0.08)",
                  borderRadius: "30%",
                }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 0.9, 0.45, 0.9], scale: [0.7, 1.06, 0.98, 1.06] }}
                transition={{ duration: 4, ease: "easeInOut" }}
              />
              {/* Orbiting ring 2 — slightly offset */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: "-32px",
                  border: "1px solid rgba(0,210,255,0.14)",
                  boxShadow: "0 0 18px rgba(0,210,255,0.10)",
                  borderRadius: "30%",
                }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.6, 0.25, 0.6], scale: [0.6, 1.04, 0.96, 1.04] }}
                transition={{ duration: 5.5, ease: "easeInOut", delay: 0.3 }}
              />

              {/* Shimmer sweep */}
              <div className="absolute inset-0 rounded-[22%] overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.26) 50%, transparent 80%)",
                  }}
                  initial={{ x: "-130%" }}
                  animate={{ x: ["−130%", "160%"] }}
                  transition={{ delay: 0.6, duration: 1.0, ease: "easeOut" }}
                />
              </div>

              <motion.img
                src={logoImg}
                alt="SwitchControl"
                className="w-28 h-28 object-contain rounded-[22%]"
                draggable={false}
                animate={{
                  y: [0, -5, 0],
                  filter: [
                    "drop-shadow(0 0 28px rgba(139,92,246,0.75)) drop-shadow(0 0 60px rgba(0,210,255,0.28))",
                    "drop-shadow(0 0 48px rgba(139,92,246,1.0)) drop-shadow(0 0 90px rgba(0,210,255,0.45)) drop-shadow(0 0 8px rgba(220,170,255,0.35))",
                    "drop-shadow(0 0 28px rgba(139,92,246,0.75)) drop-shadow(0 0 60px rgba(0,210,255,0.28))",
                  ],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wordmark + tagline */}
        <AnimatePresence>
          {showText && (
            <motion.div
              key="text"
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Wordmark */}
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{ letterSpacing: "-0.01em" }}
              >
                <span className="text-white">Switch</span>
                <span style={{
                  background: "linear-gradient(90deg, hsl(270,65%,72%), hsl(192,90%,65%), hsl(318,70%,73%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>Control</span>
              </h1>

              {/* Tagline — character-by-character reveal */}
              <p
                className="text-[13px] tracking-wide text-center"
                style={{ color: "rgba(255,255,255,0.50)", letterSpacing: "0.04em" }}
                data-testid="text-first-launch-tagline"
              >
                {showTagline
                  ? <TaglineReveal text={TAGLINE} delay={0} />
                  : <span style={{ opacity: 0 }}>{TAGLINE}</span>}
              </p>

              {/* Thin ruled line */}
              <motion.div
                style={{
                  height: "1px",
                  background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.45), rgba(0,210,255,0.35), transparent)",
                  borderRadius: "1px",
                }}
                initial={{ width: 0 }}
                animate={{ width: "160px" }}
                transition={{ delay: 0.15, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
