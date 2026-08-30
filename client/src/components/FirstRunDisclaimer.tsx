import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Shield, AlertTriangle, Gamepad2, ExternalLink, CheckCircle2 } from "lucide-react";
import {
  FIRST_RUN_TRANSITION_MS,
  firstRunTransition,
  firstRunNoticeTransition,
  firstRunVisualExit,
  firstRunVisualInitial,
  firstRunVisualVisible,
  useFirstRunReducedMotion,
} from "@/lib/firstRunTransition";
import { useTranslation } from "@/lib/i18n";

// ── Easing curves ────────────────────────────────────────────────────────────
const SILK   = [0.22, 1, 0.36, 1] as const;

// ── Deterministic particles ───────────────────────────────────────────────────
function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x:        4  + seededRandom(i * 7)  * 92,
  y:        4  + seededRandom(i * 13) * 92,
  size:     1.2 + seededRandom(i * 17) * 2.8,
  delay:    seededRandom(i * 3)  * 3.5,
  duration: 4   + seededRandom(i * 11) * 5,
  driftX:   (seededRandom(i * 19) - 0.5) * 38,
  driftY:   -(8 + seededRandom(i * 23) * 28),
  color:    i % 5 === 0
    ? "rgba(245,158,11,0.55)"
    : i % 4 === 0
    ? "rgba(56,189,248,0.5)"
    : i % 3 === 0
    ? "rgba(192,132,252,0.65)"
    : "rgba(0,212,255,0.45)",
}));

// ── Streak lights ─────────────────────────────────────────────────────────────
const STREAKS = [
  { left: "8%",  top: "12%", w: 360, angle: 24,  opacity: 0.06,  dur: 7,   delay: 0   },
  { left: "42%", top: "-3%", w: 520, angle: 18,  opacity: 0.045, dur: 10,  delay: 1.6 },
  { left: "22%", top: "60%", w: 280, angle: 36,  opacity: 0.052, dur: 8.5, delay: 0.9 },
  { left: "70%", top: "18%", w: 200, angle: 14,  opacity: 0.038, dur: 11,  delay: 2.4 },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = "entering" | "warning" | "confirming" | "exiting" | "done";

interface Props {
  show: boolean;
  onComplete: () => void;
  onTransitionStart?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FirstRunDisclaimer({
  show,
  onComplete,
  onTransitionStart,
}: Props) {
  const { t } = useTranslation();
  const prefersReducedMotion = useFirstRunReducedMotion();
  const [phase, setPhase] = useState<Phase>("done");
  const [isEntered, setIsEntered] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const enterRafRef = useRef<number | null>(null);

  // ── Entry ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!show) {
      if (phase !== "exiting" && phase !== "done") {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        setPhase("done");
        setIsEntered(false);
      }
      return;
    }
    setPhase("entering");
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  // double-RAF blur-in
  useEffect(() => {
    if (phase === "done" || phase === "exiting") {
      setIsEntered(false);
      if (enterRafRef.current != null) cancelAnimationFrame(enterRafRef.current);
      return;
    }
    if (enterRafRef.current != null) cancelAnimationFrame(enterRafRef.current);
    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = requestAnimationFrame(() => setIsEntered(true));
    });
    return () => {
      if (enterRafRef.current != null) cancelAnimationFrame(enterRafRef.current);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "entering") return;
    // 620ms head-start so the welcome animation's blur-out (~0.95s) has cleared the
    // viewport before the disclaimer backdrop becomes visible.
    const t = setTimeout(
      () => setPhase("warning"),
      prefersReducedMotion ? 0 : 620,
    );
    timersRef.current.push(t);
    return () => clearTimeout(t);
  }, [phase, prefersReducedMotion]);

  // ── User actions ───────────────────────────────────────────────────────────
  const handleUnderstand = () => {
    setPhase("confirming");
  };

  const handleConfirm = () => {
    onTransitionStart?.();
    setPhase("exiting");
    const t = setTimeout(() => {
      setPhase("done");
      onCompleteRef.current();
    }, prefersReducedMotion ? 0 : FIRST_RUN_TRANSITION_MS);
    timersRef.current.push(t);
  };

  const handleGoBack = () => {
    setPhase("warning");
  };

  if (phase === "done") return null;

  return createPortal(
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          key="frd-overlay"
          className="fixed inset-0 flex items-center justify-center overflow-hidden"
          style={{ zIndex: 9999 }}
           {...firstRunVisualInitial()}
           animate={isEntered ? firstRunVisualVisible() : firstRunVisualExit()}
           exit={{
             ...firstRunVisualExit(),
             transition: firstRunTransition(prefersReducedMotion),
           }}
           transition={firstRunTransition(prefersReducedMotion)}
           data-first-run-transition="disclaimer"
        >
          {/* ── Backdrop ───────────────────────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 120% 100% at 50% 0%, rgba(0,10,24,0.97) 0%, rgba(4,6,16,0.995) 100%)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          />

          {/* ── Scan lines ─────────────────────────────────────────────────── */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.018]"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 4px)",
              backgroundSize: "100% 4px",
            }}
          />

          {/* ── Atmospheric orbs ───────────────────────────────────────────── */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: "50%", top: "-10%",
              width: "90vw", height: "90vw",
              marginLeft: "-45vw",
              background: "radial-gradient(ellipse, rgba(0,212,255,0.13) 0%, rgba(99,102,241,0.06) 45%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              left: "60%", top: "40%",
              width: "60vw", height: "60vw",
              marginLeft: "-30vw", marginTop: "-30vw",
              background: "radial-gradient(ellipse, rgba(168,85,247,0.1) 0%, transparent 70%)",
              filter: "blur(70px)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              left: "15%", top: "55%",
              width: "50vw", height: "50vw",
              background: "radial-gradient(ellipse, rgba(0,212,255,0.07) 0%, transparent 70%)",
              filter: "blur(65px)",
            }}
          />

          {/* ── Streak lights ──────────────────────────────────────────────── */}
          {!prefersReducedMotion && STREAKS.map((s, i) => (
            <motion.div
              key={i}
              className="absolute pointer-events-none origin-left"
              style={{
                left: s.left, top: s.top,
                width: s.w, height: 1,
                background: "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.35) 40%, rgba(168,85,247,0.25) 70%, transparent 100%)",
                transform: `rotate(${s.angle}deg)`,
                opacity: 0,
              }}
              animate={{ opacity: [0, s.opacity, s.opacity * 0.5, 0] }}
              transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
            />
          ))}

          {/* ── Particles ─────────────────────────────────────────────────── */}
          {!prefersReducedMotion && PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full pointer-events-none"
              style={{
                left: `${p.x}%`, top: `${p.y}%`,
                width: p.size, height: p.size,
                background: p.color,
                filter: "blur(0.5px)",
              }}
              animate={{ y: [0, p.driftY], x: [0, p.driftX], opacity: [0, 1, 0.7, 0] }}
              transition={{
                duration: p.duration, delay: p.delay,
                repeat: Infinity, repeatType: "loop",
                ease: "easeInOut",
              }}
            />
          ))}

          {/* ── Grid dots ─────────────────────────────────────────────────── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(0,212,255,0.09) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
            }}
          />

          {/* ── Halation glow — light from behind hitting the card ────────── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: "50%", top: "50%",
              width: "56vw", height: "56vw",
              maxWidth: 680, maxHeight: 680,
              transform: "translate(-50%, -50%)",
              background: [
                "radial-gradient(ellipse 65% 55% at 50% 52%, rgba(0,212,255,0.22) 0%, transparent 55%)",
                "radial-gradient(ellipse 50% 40% at 48% 50%, rgba(168,85,247,0.16) 0%, transparent 60%)",
              ].join(", "),
              filter: "blur(38px)",
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: isEntered ? 1 : 0, scale: isEntered ? 1 : 0.7 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Softer outer halo ring — wider spread */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: "50%", top: "50%",
              width: "80vw", height: "80vw",
              maxWidth: 920, maxHeight: 920,
              transform: "translate(-50%, -50%)",
              background: "radial-gradient(ellipse 55% 45% at 50% 52%, rgba(99,102,241,0.11) 0%, rgba(0,212,255,0.06) 40%, transparent 65%)",
              filter: "blur(70px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isEntered ? 1 : 0 }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />

          {/* ── Card layer ────────────────────────────────────────────────── */}
          <div className="relative z-10 w-full max-w-lg mx-4 sm:mx-auto">

            {/* ── Phase 1: Warning card ──────────────────────────────────── */}
            <AnimatePresence mode="wait">
              {phase === "warning" && (
                <motion.div
                  key="warning-card"
                  initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(12px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -16, scale: 0.97, filter: "blur(8px)" }}
                  transition={firstRunNoticeTransition(prefersReducedMotion)}
                  className="relative overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(10,14,24,0.92) 0%, rgba(6,10,20,0.96) 100%)",
                    border: "1px solid rgba(0,212,255,0.18)",
                    borderRadius: 20,
                    boxShadow: [
                      "0 0 0 1px rgba(0,0,0,0.6)",
                      "0 32px 80px rgba(0,0,0,0.7)",
                      "0 0 60px rgba(0,212,255,0.08)",
                      "inset 0 1px 0 rgba(255,255,255,0.07)",
                      "inset 0 0 40px rgba(0,212,255,0.03)",
                    ].join(", "),
                  }}
                >
                  {/* Top edge glow */}
                  <div
                    className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.5) 30%, rgba(168,85,247,0.4) 70%, transparent 100%)" }}
                  />

                  {/* Subtle inner gradient */}
                  <div
                    className="absolute inset-0 pointer-events-none rounded-[20px]"
                    style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,212,255,0.05) 0%, transparent 70%)" }}
                  />

                  <div className="relative p-7">
                    {/* Icon cluster */}
                    <motion.div
                      className="flex items-center justify-center mb-5"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.15, ease: SILK }}
                    >
                      <div className="relative">
                        {/* Outer pulse ring */}
                        <motion.div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(251,191,36,0.25)",
                            margin: -12,
                          }}
                          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {/* Inner icon container */}
                        <div
                          className="relative flex items-center justify-center w-16 h-16 rounded-2xl"
                          style={{
                            background: "linear-gradient(145deg, rgba(251,191,36,0.15) 0%, rgba(245,158,11,0.08) 100%)",
                            border: "1px solid rgba(251,191,36,0.3)",
                            boxShadow: "0 0 24px rgba(251,191,36,0.15), inset 0 1px 0 rgba(255,255,255,0.1)",
                          }}
                        >
                          <AlertTriangle className="size-7 text-amber-400" strokeWidth={1.5} />
                        </div>
                        {/* Corner badges */}
                        <div
                          className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full"
                          style={{
                            background: "linear-gradient(135deg, rgba(0,212,255,0.9), rgba(99,102,241,0.9))",
                            boxShadow: "0 2px 8px rgba(0,212,255,0.4)",
                          }}
                        >
                          <Gamepad2 className="size-2.5 text-white" />
                        </div>
                      </div>
                    </motion.div>

                    {/* Headline */}
                    <motion.div
                      className="text-center mb-1"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.22, ease: SILK }}
                    >
                      <span
                        className="text-[11px] font-semibold tracking-[0.22em] uppercase block mb-2"
                        style={{ color: "rgba(251,191,36,0.7)" }}
                      >
                        {t("Important Notice")}
                      </span>
                      <h2 className="text-[22px] font-bold leading-tight" style={{ color: "#E6EAF0" }}>
                        <span
                          style={{
                            background: "linear-gradient(90deg, #00D4FF 0%, #A78BFA 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }}
                        >
                        {t("Keep SwitchControl closed while gaming")}
                      </span>
                      </h2>
                    </motion.div>

                    {/* Body */}
                    <motion.div
                      className="space-y-3 mt-5"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.3, ease: SILK }}
                    >
                      {/* Main message */}
                      <div
                        className="rounded-xl p-4"
                        style={{
                          background: "linear-gradient(145deg, rgba(251,191,36,0.06) 0%, rgba(245,158,11,0.03) 100%)",
                          border: "1px solid rgba(251,191,36,0.15)",
                        }}
                      >
                        <p className="text-[13px] leading-relaxed" style={{ color: "rgba(230,234,240,0.85)" }}>
                          {t("SwitchControl is designed to configure and optimize your system before you game — not to run alongside your games. Keeping the app open while gaming may consume extra CPU and memory, which can reduce performance rather than improve it.")}
                        </p>
                      </div>

                      {/* Two-column tips */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { icon: "✓", text: t("Apply tweaks, then close"), color: "rgba(34,211,238,0.7)" },
                          { icon: "✓", text: t("Launch your game after closing"), color: "rgba(34,211,238,0.7)" },
                          { icon: "✗", text: t("Don't keep it open mid-game"), color: "rgba(248,113,113,0.7)" },
                          { icon: "✗", text: t("It's not a game overlay tool"), color: "rgba(248,113,113,0.7)" },
                        ].map((item, i) => (
                          <motion.div
                            key={i}
                            className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.07)",
                            }}
                            initial={{ opacity: 0, x: i % 2 === 0 ? -8 : 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35, delay: 0.38 + i * 0.05, ease: SILK }}
                          >
                            <span className="text-[11px] font-bold" style={{ color: item.color }}>{item.icon}</span>
                            <span className="text-[11px]" style={{ color: "rgba(160,168,179,0.9)" }}>{item.text}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* CTA */}
                    <motion.div
                      className="mt-5"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.45, ease: SILK }}
                    >
                      <button
                        onClick={handleUnderstand}
                        data-testid="button-disclaimer-understand"
                        className="w-full py-3.5 rounded-xl text-[14px] font-semibold transition-all duration-200 relative overflow-hidden group"
                        style={{
                          background: "linear-gradient(135deg, rgba(0,212,255,0.18) 0%, rgba(168,85,247,0.15) 100%)",
                          border: "1px solid rgba(0,212,255,0.3)",
                          color: "#00D4FF",
                          boxShadow: "0 0 20px rgba(0,212,255,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                        }}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          <Shield className="size-4" />
                          {t("I Understand — Continue")}
                        </span>
                        {/* Hover shimmer */}
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(168,85,247,0.08) 100%)" }}
                        />
                      </button>
                    </motion.div>

                    {/* Terms footer */}
                    <motion.p
                      className="text-center text-[10px] leading-relaxed mt-4"
                      style={{ color: "rgba(107,115,128,0.8)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.55, ease: SILK }}
                    >
                      {t("By continuing you agree to the")}{" "}
                      <a
                        href="https://switchcontrol.org/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 transition-colors hover:text-[#00D4FF]"
                        style={{ color: "rgba(107,115,128,0.9)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("Terms of Service")}
                      </a>
                      {" "}{t("and")}{" "}
                      <a
                        href="https://switchcontrol.org/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 transition-colors hover:text-[#00D4FF]"
                        style={{ color: "rgba(107,115,128,0.9)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("Privacy Policy")}
                      </a>
                      {t(". SwitchControl is a hardware optimization suite — no warranty is implied.")}
                    </motion.p>
                  </div>
                </motion.div>
              )}

              {/* ── Phase 2: Confirm card ─────────────────────────────────── */}
              {phase === "confirming" && (
                <motion.div
                  key="confirm-card"
                  initial={{ opacity: 0, scale: 0.88, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1,    y: 0,  filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.95, y: 12, filter: "blur(6px)" }}
                  transition={firstRunNoticeTransition(prefersReducedMotion)}
                  className="relative overflow-hidden mx-auto"
                  style={{
                    maxWidth: 380,
                    background: "linear-gradient(145deg, rgba(12,16,28,0.95) 0%, rgba(8,12,22,0.98) 100%)",
                    border: "1px solid rgba(168,85,247,0.25)",
                    borderRadius: 18,
                    boxShadow: [
                      "0 0 0 1px rgba(0,0,0,0.6)",
                      "0 28px 64px rgba(0,0,0,0.75)",
                      "0 0 50px rgba(168,85,247,0.1)",
                      "inset 0 1px 0 rgba(255,255,255,0.07)",
                    ].join(", "),
                  }}
                >
                  {/* Purple top edge */}
                  <div
                    className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.6) 40%, rgba(0,212,255,0.4) 80%, transparent 100%)" }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none rounded-[18px]"
                    style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(168,85,247,0.06) 0%, transparent 70%)" }}
                  />

                  <div className="relative p-6 text-center">
                    {/* Animated icon */}
                    <motion.div
                      className="flex justify-center mb-4"
                      initial={{ scale: 0.4, rotate: -15, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      <div
                        className="flex items-center justify-center w-12 h-12 rounded-[14px]"
                        style={{
                          background: "linear-gradient(145deg, rgba(168,85,247,0.2) 0%, rgba(99,102,241,0.12) 100%)",
                          border: "1px solid rgba(168,85,247,0.35)",
                          boxShadow: "0 0 20px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.1)",
                        }}
                      >
                        <CheckCircle2 className="size-5" style={{ color: "rgba(168,85,247,0.9)" }} />
                      </div>
                    </motion.div>

                    <motion.h3
                      className="text-[17px] font-bold mb-1.5"
                      style={{ color: "#E6EAF0" }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.08, ease: SILK }}
                    >
                      {t("Confirm & Continue")}
                    </motion.h3>

                    <motion.p
                      className="text-[12px] leading-relaxed mb-5"
                      style={{ color: "rgba(160,168,179,0.85)" }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.13, ease: SILK }}
                    >
                      {t("Just to be sure — you understand that SwitchControl should be closed before you start gaming, not run in the background?")}
                    </motion.p>

                    <motion.div
                      className="flex flex-col gap-2.5"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.18, ease: SILK }}
                    >
                      <button
                        onClick={handleConfirm}
                        data-testid="button-disclaimer-confirm"
                        className="w-full py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 relative overflow-hidden group"
                        style={{
                          background: "linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(99,102,241,0.18) 100%)",
                          border: "1px solid rgba(168,85,247,0.35)",
                          color: "#C4B5FD",
                          boxShadow: "0 0 20px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                        }}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          <CheckCircle2 className="size-3.5" />
                          {t("Yes, I'm ready to continue")}
                        </span>
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={{ background: "rgba(168,85,247,0.08)" }}
                        />
                      </button>

                      <button
                        onClick={handleGoBack}
                        data-testid="button-disclaimer-back"
                        className="w-full py-2.5 rounded-xl text-[12px] transition-all duration-200"
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(107,115,128,0.8)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(160,168,179,0.9)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(107,115,128,0.8)";
                        }}
                      >
                        {t("← Go back and re-read")}
                      </button>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
