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
    style: {
      left: "-18%", top: "-14%", width: "90vw", height: "90vw",
      background: "radial-gradient(ellipse, rgba(139,92,246,0.45) 0%, rgba(80,40,180,0.18) 42%, transparent 68%)",
      filter: "blur(110px)",
    },
    animate: { x: [0, 22, 0], y: [0, 14, 0], opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] },
    transition: { duration: 14, repeat: Infinity, ease: "easeInOut" as const },
  },
  {
    style: {
      right: "-14%", bottom: "-10%", width: "80vw", height: "80vw",
      background: "radial-gradient(ellipse, rgba(0,190,255,0.35) 0%, rgba(0,120,210,0.12) 46%, transparent 68%)",
      filter: "blur(120px)",
    },
    animate: { x: [0, -18, 0], y: [0, -14, 0], opacity: [0.45, 0.90, 0.45], scale: [1, 1.10, 1] },
    transition: { duration: 17, repeat: Infinity, ease: "easeInOut" as const, delay: 2 },
  },
  {
    style: {
      left: "25%", top: "55%", width: "60vw", height: "60vw",
      background: "radial-gradient(ellipse, rgba(236,72,153,0.20) 0%, transparent 66%)",
      filter: "blur(90px)",
    },
    animate: { x: [0, 12, 0], opacity: [0.28, 0.60, 0.28], scale: [1, 1.12, 1] },
    transition: { duration: 20, repeat: Infinity, ease: "easeInOut" as const, delay: 5 },
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
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            delay: delay + i * 0.042,
            duration: 0.35,
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
    ? deviceId.slice(0, 8).toUpperCase().split("").join(" · ")
    : "-- · -- · -- · -- · -- · --";

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); ts.push(t); };

    //  Phase timeline — deliberately slow and cinematic
    at(200,  () => setPhase("hazes"));        // ambient colour blooms
    at(700,  () => setPhase("recognition"));  // device scan
    at(2400, () => setPhase("logo"));         // logo materialises
    at(3800, () => setPhase("text"));         // wordmark fades in
    at(4700, () => setPhase("tagline"));      // tagline types out
    at(7200, () => setPhase("exiting"));      // cinematic exit
    at(8500, () => onComplete());             // hand off to app

    return () => ts.forEach(clearTimeout);
  }, [onComplete]);

  const showHazes     = ["hazes","recognition","logo","text","tagline","exiting"].includes(phase);
  const showRecognize = phase === "recognition";
  const showLogo      = ["logo","text","tagline","exiting"].includes(phase);
  const showText      = ["text","tagline","exiting"].includes(phase);
  const showTagline   = ["tagline","exiting"].includes(phase);
  const isExiting     = phase === "exiting";

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden flex items-center justify-center select-none"
      style={{ background: "#07090D" }}
      animate={isExiting
        ? { opacity: 0, scale: 1.06, filter: "blur(40px)" }
        : { opacity: 1, scale: 1,    filter: "blur(0px)" }}
      transition={isExiting
        ? { duration: 1.3, ease: [0.4, 0, 0.8, 1] }
        : { duration: 0 }}
    >
      {/* ── Ambient colour hazes ────────────────────────────────────────── */}
      <AnimatePresence>
        {showHazes && AMBIENT_HAZES.map((h, i) => (
          <motion.div
            key={i}
            className="absolute pointer-events-none"
            style={h.style as React.CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ ...h.animate, opacity: undefined }}
            transition={{ ...h.transition, opacity: { duration: 2.0, ease: "easeOut" } }}
          />
        ))}
      </AnimatePresence>

      {/* ── Center bloom behind logo ────────────────────────────────────── */}
      {showLogo && (
        <div className="absolute pointer-events-none" style={{ left: "50%", top: "46%", zIndex: 3 }}>
          <motion.div
            style={{
              width: "960px", height: "960px",
              marginLeft: "-480px", marginTop: "-480px",
              background: "radial-gradient(ellipse, rgba(139,92,246,0.42) 0%, rgba(0,200,255,0.18) 38%, transparent 66%)",
              filter: "blur(72px)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.90, 0.65, 0.90], scale: [0.5, 1.10, 1.0, 1.10] }}
            transition={{ duration: 5, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            style={{
              position: "absolute", width: "420px", height: "420px",
              marginLeft: "-210px", marginTop: "-210px",
              top: "50%", left: "50%",
              background: "radial-gradient(ellipse, rgba(220,170,255,0.45) 0%, rgba(0,220,255,0.20) 42%, transparent 70%)",
              filter: "blur(40px)",
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1.0, 0.75, 1.0], scale: [0.4, 1.18, 0.96, 1.18] }}
            transition={{ duration: 4.0, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </div>
      )}

      {/* ── Vignette ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 4,
          background: "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 25%, rgba(7,9,13,0.92) 100%)",
        }}
      />

      {/* ── Device Recognition module ───────────────────────────────────── */}
      <AnimatePresence>
        {showRecognize && (
          <motion.div
            key="recognition"
            className="absolute flex flex-col items-center gap-3"
            style={{ zIndex: 10, top: "33%", left: "50%", x: "-50%" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Scan-line sweep */}
            <div className="relative overflow-hidden" style={{ width: "260px", height: "2px" }}>
              <motion.div
                className="absolute inset-y-0 left-0 w-full h-full"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.9), rgba(0,210,255,0.85), transparent)",
                  boxShadow: "0 0 16px rgba(139,92,246,0.7), 0 0 6px rgba(0,210,255,0.6)",
                }}
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: [0, 1, 0] }}
                transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {/* Status label */}
            <motion.p
              className="font-mono uppercase tracking-[0.38em] text-[13px] font-medium"
              style={{ color: "rgba(139,92,246,0.85)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              Device Recognized
            </motion.p>

            {/* Device ID */}
            <motion.p
              className="font-mono text-[12px] tracking-[0.22em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.7 }}
            >
              {deviceLabel}
            </motion.p>

            {/* Rule */}
            <motion.div
              className="rounded-full"
              style={{
                height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.55), rgba(0,210,255,0.45), transparent)",
              }}
              initial={{ width: 0 }}
              animate={{ width: "220px" }}
              transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logo + wordmark + tagline ───────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-10" style={{ zIndex: 10 }}>

        {/* Logo */}
        <AnimatePresence>
          {showLogo && (
            <motion.div
              key="logo"
              className="relative"
              initial={{ opacity: 0, scale: 0.6, filter: "blur(28px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.1, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {/* Outer orbital ring */}
              <motion.div
                className="absolute pointer-events-none"
                style={{
                  inset: "-24px",
                  border: "1px solid rgba(139,92,246,0.32)",
                  boxShadow: "0 0 28px rgba(139,92,246,0.22), inset 0 0 20px rgba(139,92,246,0.09)",
                  borderRadius: "30%",
                }}
                initial={{ opacity: 0, scale: 0.65 }}
                animate={{ opacity: [0, 0.95, 0.50, 0.95], scale: [0.65, 1.08, 0.99, 1.08] }}
                transition={{ duration: 5, ease: "easeInOut" }}
              />
              {/* Second orbital ring */}
              <motion.div
                className="absolute pointer-events-none"
                style={{
                  inset: "-42px",
                  border: "1px solid rgba(0,210,255,0.15)",
                  boxShadow: "0 0 22px rgba(0,210,255,0.12)",
                  borderRadius: "30%",
                }}
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 0.65, 0.28, 0.65], scale: [0.55, 1.05, 0.97, 1.05] }}
                transition={{ duration: 6.5, ease: "easeInOut", delay: 0.4 }}
              />

              {/* Shimmer sweep */}
              <div className="absolute inset-0 rounded-[22%] overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.28) 50%, transparent 80%)",
                  }}
                  initial={{ x: "-140%" }}
                  animate={{ x: "170%" }}
                  transition={{ delay: 0.9, duration: 1.1, ease: "easeOut" }}
                />
              </div>

              <motion.img
                src={logoImg}
                alt="SwitchControl"
                className="w-40 h-40 object-contain rounded-[22%]"
                draggable={false}
                animate={{
                  y: [0, -6, 0],
                  filter: [
                    "drop-shadow(0 0 36px rgba(139,92,246,0.80)) drop-shadow(0 0 72px rgba(0,210,255,0.32))",
                    "drop-shadow(0 0 60px rgba(139,92,246,1.0))  drop-shadow(0 0 110px rgba(0,210,255,0.50)) drop-shadow(0 0 12px rgba(220,170,255,0.40))",
                    "drop-shadow(0 0 36px rgba(139,92,246,0.80)) drop-shadow(0 0 72px rgba(0,210,255,0.32))",
                  ],
                }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wordmark + tagline */}
        <AnimatePresence>
          {showText && (
            <motion.div
              key="text"
              className="flex flex-col items-center gap-5"
              initial={{ opacity: 0, y: 24, filter: "blur(16px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Wordmark — large and proud */}
              <h1
                className="font-bold tracking-tight"
                style={{ fontSize: "clamp(48px, 6vw, 72px)", letterSpacing: "-0.025em" }}
              >
                <span className="text-white">Switch</span>
                <span style={{
                  background: "linear-gradient(90deg, hsl(270,70%,75%), hsl(192,95%,68%), hsl(318,72%,76%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>Control</span>
              </h1>

              {/* Tagline — visible, character-by-character */}
              <p
                className="text-center font-light"
                style={{
                  fontSize: "clamp(16px, 1.8vw, 20px)",
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: "0.06em",
                }}
                data-testid="text-first-launch-tagline"
              >
                {showTagline
                  ? <TaglineReveal text={TAGLINE} delay={0} />
                  : <span style={{ opacity: 0 }}>{TAGLINE}</span>}
              </p>

              {/* Separator line */}
              <motion.div
                style={{
                  height: "1px",
                  background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.55), rgba(0,210,255,0.45), transparent)",
                  borderRadius: "1px",
                }}
                initial={{ width: 0 }}
                animate={{ width: "200px" }}
                transition={{ delay: 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Edition badge */}
              <motion.p
                className="font-mono uppercase tracking-[0.30em] text-[11px]"
                style={{ color: "rgba(139,92,246,0.55)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
              >
                Performance Suite
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
