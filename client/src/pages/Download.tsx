import { Link } from "wouter";
import { Download, Shield, CheckCircle, Monitor, Clock, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { brand } from "@/config/brand";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useState, useEffect, useRef } from "react";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import { SectionGlow } from "@/components/website/WebsiteBackground";
import faviconImg from "@/assets/favicon.png";

// ── Release target: Tuesday April 14 2026 at 2:00 PM NZST (UTC+12) ─────────
// NZST = UTC+12. April 14 at 14:00 local NZ = April 14 at 02:00 UTC.
const RELEASE_UTC = new Date("2026-04-14T02:00:00.000Z").getTime();

interface PatchNotes {
  version: string;
  title: string;
  headline: string;
  date: string;
  changes: string[];
  type: string;
}

function DownloadPatchNotesCard() {
  const [notes, setNotes] = useState<PatchNotes | null>(null);

  useEffect(() => {
    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then(setNotes)
      .catch(() => {});
  }, []);

  if (!notes) return null;

  return (
    <motion.div
      className="w-full max-w-lg"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="rounded-xl border p-5 space-y-3"
        style={{
          background: "rgba(12,10,20,0.70)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: "rgba(255,255,255,0.07)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5" style={{ color: "rgba(192,155,255,0.75)" }} />
            <span className="text-[11px] font-semibold tracking-widest uppercase"
              style={{ color: "rgba(192,155,255,0.70)", letterSpacing: "0.10em" }}>
              What&apos;s New
            </span>
          </div>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.07)" }}>
            v{notes.version}
          </span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white/80 leading-snug">{notes.title}</p>
          <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>
            {notes.headline}
          </p>
        </div>
        <div className="space-y-1.5">
          {notes.changes.slice(0, 4).map((change, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[4px] size-1 rounded-full shrink-0"
                style={{ background: "rgba(139,92,246,0.60)" }} />
              <p className="text-[11.5px] leading-snug" style={{ color: "rgba(255,255,255,0.42)" }}>
                {change}
              </p>
            </div>
          ))}
          {notes.changes.length > 4 && (
            <p className="text-[11px] pl-3" style={{ color: "rgba(255,255,255,0.22)" }}>
              +{notes.changes.length - 4} more improvements
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Countdown logic ────────────────────────────────────────────────────────────
interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function getTimeLeft(): TimeLeft {
  const total = Math.max(0, RELEASE_UTC - Date.now());
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours   = Math.floor((total / 1000 / 60 / 60) % 24);
  const days    = Math.floor(total / 1000 / 60 / 60 / 24);
  return { days, hours, minutes, seconds, total };
}

// ── Animated single digit tile ────────────────────────────────────────────────
function DigitTile({ value }: { value: string }) {
  return (
    <div className="relative w-[2.8rem] sm:w-[3.6rem] md:w-[4.4rem] h-[3.6rem] sm:h-[4.8rem] md:h-[5.6rem] overflow-hidden flex items-center justify-center"
      style={{
        background: "linear-gradient(160deg, rgba(139,92,246,0.14) 0%, rgba(12,10,24,0.80) 60%, rgba(103,232,249,0.06) 100%)",
        border: "1px solid rgba(139,92,246,0.22)",
        borderRadius: "10px",
        boxShadow: "0 2px 24px rgba(139,92,246,0.10), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Sheen line */}
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }} />
      {/* Midline separator */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-px h-px"
        style={{ background: "rgba(0,0,0,0.35)" }} />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="absolute font-black tabular-nums select-none"
          style={{
            fontSize: "clamp(1.7rem, 5vw, 3.2rem)",
            fontVariantNumeric: "tabular-nums",
            color: "rgba(255,255,255,0.92)",
            textShadow: "0 0 28px rgba(139,92,246,0.45), 0 2px 6px rgba(0,0,0,0.6)",
            lineHeight: 1,
          }}
          initial={{ y: -38, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: 38, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ── Two-digit animated unit (e.g. "04") ───────────────────────────────────────
function CountdownUnit({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, "0");
  const d0 = str[0];
  const d1 = str[1];
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3">
      <div className="flex gap-1 sm:gap-1.5">
        <DigitTile value={d0} />
        <DigitTile value={d1} />
      </div>
      <span className="text-[9px] sm:text-[11px] uppercase tracking-[0.22em] font-semibold"
        style={{ color: "rgba(255,255,255,0.32)" }}>
        {label}
      </span>
    </div>
  );
}

// ── Separator dot ─────────────────────────────────────────────────────────────
function Sep() {
  return (
    <div className="flex flex-col gap-1.5 items-center pb-7 sm:pb-9">
      {[0, 1].map(i => (
        <motion.div key={i} className="size-1 sm:size-1.5 rounded-full"
          style={{ background: "rgba(139,92,246,0.55)" }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, delay: i * 0.3, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Orbiting ring lines ───────────────────────────────────────────────────────
function PulseRing({ delay = 0, size = 320 }: { delay?: number; size?: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        border: "1px solid rgba(139,92,246,0.12)",
        top: "50%",
        left: "50%",
        x: "-50%",
        y: "-50%",
      }}
      animate={{ opacity: [0, 0.7, 0], scale: [0.85, 1.12, 1.35] }}
      transition={{ duration: 3.5, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

// ── Launch live message ────────────────────────────────────────────────────────
function LaunchLiveMessage({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-6 text-center"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="flex items-center gap-2 px-4 py-1.5 rounded-full border"
        style={{
          background: "rgba(52,211,153,0.10)",
          borderColor: "rgba(52,211,153,0.30)",
        }}
        animate={{ boxShadow: ["0 0 0px rgba(52,211,153,0.2)", "0 0 20px rgba(52,211,153,0.4)", "0 0 0px rgba(52,211,153,0.2)"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-semibold tracking-widest uppercase text-emerald-400">Live Now</span>
      </motion.div>
      <div>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">SwitchControl is Live</h2>
        <p className="text-base text-white/50 mt-2">Download below and start optimizing your PC today.</p>
      </div>
      <Zap className="size-10 text-emerald-400 opacity-80" />
    </motion.div>
  );
}

// ── Main countdown block ───────────────────────────────────────────────────────
function LaunchCountdown() {
  const { prefersReducedMotion } = useMotion();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(getTimeLeft());
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const isLive = timeLeft.total === 0;

  return (
    <motion.div
      className="w-full max-w-3xl mx-auto"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 32, filter: prefersReducedMotion ? "none" : "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <style>{`
        @keyframes ambientDrift {
          0%   { transform: translate(0, 0)   rotate(0deg); }
          33%  { transform: translate(18px, -12px) rotate(120deg); }
          66%  { transform: translate(-10px, 15px) rotate(240deg); }
          100% { transform: translate(0, 0)   rotate(360deg); }
        }
        @keyframes countdownGlow {
          0%, 100% { box-shadow: 0 8px 60px rgba(0,0,0,0.35), 0 0 80px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.12); }
          50%       { box-shadow: 0 12px 80px rgba(0,0,0,0.45), 0 0 120px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.16); }
        }
        .countdown-card {
          animation: countdownGlow 4s ease-in-out infinite;
        }
      `}</style>

      <div
        className="countdown-card relative rounded-2xl p-6 sm:p-10 md:p-12 text-center"
        style={{
          background: "linear-gradient(160deg, rgba(18,12,42,0.96) 0%, rgba(12,8,32,0.98) 55%, rgba(16,10,40,0.96) 100%)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        {/* Ambient blobs */}
        {!prefersReducedMotion && (
          <>
            <div className="absolute pointer-events-none opacity-30"
              style={{
                width: 420, height: 420,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 70%)",
                top: "50%", left: "30%",
                transform: "translate(-50%, -50%)",
                animation: "ambientDrift 14s ease-in-out infinite",
              }}
            />
            <div className="absolute pointer-events-none opacity-20"
              style={{
                width: 300, height: 300,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(103,232,249,0.20) 0%, transparent 70%)",
                top: "60%", right: "15%",
                transform: "translateY(-50%)",
                animation: "ambientDrift 18s ease-in-out infinite reverse",
              }}
            />
          </>
        )}

        {/* Pulse rings */}
        {!prefersReducedMotion && !isLive && (
          <>
            <PulseRing delay={0}   size={320} />
            <PulseRing delay={1.2} size={420} />
            <PulseRing delay={2.4} size={520} />
          </>
        )}

        {/* Top border sheen */}
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.55), rgba(103,232,249,0.35), transparent)" }} />

        <div className="relative z-10 flex flex-col items-center gap-7 sm:gap-8">

          <AnimatePresence mode="wait">
            {isLive ? (
              <LaunchLiveMessage key="live" prefersReducedMotion={prefersReducedMotion} />
            ) : (
              <motion.div
                key="countdown"
                className="flex flex-col items-center gap-7 sm:gap-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.5 }}
              >
                {/* Badge */}
                <motion.div
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full border"
                  style={{
                    background: "rgba(139,92,246,0.10)",
                    borderColor: "rgba(139,92,246,0.28)",
                  }}
                  animate={prefersReducedMotion ? {} : {
                    boxShadow: [
                      "0 0 0px rgba(139,92,246,0.2)",
                      "0 0 14px rgba(139,92,246,0.45)",
                      "0 0 0px rgba(139,92,246,0.2)",
                    ]
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="size-3 text-violet-400" />
                  <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-violet-300">
                    Launching Tuesday
                  </span>
                </motion.div>

                {/* Headline */}
                <div className="space-y-2">
                  <h2
                    className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight"
                    style={{
                      background: "linear-gradient(135deg, #fff 30%, rgba(192,155,255,0.85) 65%, rgba(103,232,249,0.75) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    SwitchControl Drops In
                  </h2>
                  <p className="text-sm sm:text-base font-medium" style={{ color: "rgba(255,255,255,0.38)" }}>
                    Tuesday · 2:00 PM New Zealand Time
                  </p>
                </div>

                {/* Timer */}
                <div className="flex items-end gap-1.5 sm:gap-3 md:gap-4">
                  <CountdownUnit value={timeLeft.days}    label="Days"    />
                  <Sep />
                  <CountdownUnit value={timeLeft.hours}   label="Hours"   />
                  <Sep />
                  <CountdownUnit value={timeLeft.minutes} label="Minutes" />
                  <Sep />
                  <CountdownUnit value={timeLeft.seconds} label="Seconds" />
                </div>

                {/* Subtext */}
                <p className="text-[11px] sm:text-xs tracking-wider uppercase font-medium"
                  style={{ color: "rgba(255,255,255,0.22)" }}>
                  Countdown to · NZ time · {new Date(RELEASE_UTC).toLocaleString("en-NZ", {
                    timeZone: "Pacific/Auckland",
                    weekday: "long", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit", timeZoneName: "short"
                  })}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom border sheen */}
        <div className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(103,232,249,0.30), rgba(139,92,246,0.30), transparent)" }} />
      </div>
    </motion.div>
  );
}

// ── Side particle data ─────────────────────────────────────────────────────────
const LEFT_PARTICLES = [
  { top: "18%",  size: 3,   dur: 2.8, delay: 0,    color: "rgba(168,85,246,0.55)" },
  { top: "34%",  size: 2,   dur: 3.4, delay: 0.6,  color: "rgba(139,92,246,0.40)" },
  { top: "50%",  size: 4,   dur: 2.5, delay: 1.1,  color: "rgba(103,232,249,0.45)" },
  { top: "65%",  size: 2.5, dur: 3.8, delay: 0.3,  color: "rgba(168,85,246,0.35)" },
  { top: "80%",  size: 3,   dur: 3.0, delay: 1.6,  color: "rgba(255,255,255,0.25)" },
  { top: "27%",  size: 2,   dur: 4.1, delay: 0.9,  color: "rgba(103,232,249,0.30)" },
  { top: "56%",  size: 3.5, dur: 2.9, delay: 2.0,  color: "rgba(168,85,246,0.50)" },
  { top: "72%",  size: 2,   dur: 3.6, delay: 0.4,  color: "rgba(255,255,255,0.20)" },
];
const RIGHT_PARTICLES = [
  { top: "22%",  size: 3,   dur: 3.1, delay: 0.2,  color: "rgba(103,232,249,0.50)" },
  { top: "40%",  size: 2,   dur: 2.6, delay: 0.8,  color: "rgba(168,85,246,0.40)" },
  { top: "55%",  size: 4,   dur: 3.3, delay: 1.4,  color: "rgba(139,92,246,0.55)" },
  { top: "70%",  size: 2.5, dur: 2.8, delay: 0.1,  color: "rgba(103,232,249,0.35)" },
  { top: "84%",  size: 3,   dur: 3.7, delay: 1.8,  color: "rgba(255,255,255,0.22)" },
  { top: "30%",  size: 2,   dur: 4.0, delay: 0.5,  color: "rgba(168,85,246,0.30)" },
  { top: "62%",  size: 3.5, dur: 2.7, delay: 2.2,  color: "rgba(103,232,249,0.45)" },
  { top: "46%",  size: 2,   dur: 3.5, delay: 1.0,  color: "rgba(255,255,255,0.18)" },
];

export default function DownloadPage() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useMotion();

  return (
    <WebsiteShell variant="inner" bgVariant="download" showFooter={false}>
      <style>{`
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glowPulse {
          0%, 100% { 
            filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.5)) drop-shadow(0 0 24px rgba(139, 92, 246, 0.3));
          }
          50% { 
            filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.7)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.5));
          }
        }
        .logo-animate {
          animation: logoFloat 3s ease-in-out infinite, glowPulse 2.5s ease-in-out infinite;
        }
        .logo-animate:hover {
          transform: scale(1.03);
          filter: drop-shadow(0 0 24px rgba(139, 92, 246, 0.8)) drop-shadow(0 0 48px rgba(139, 92, 246, 0.6));
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-animate {
            animation: logoFloat 8s ease-in-out infinite, glowPulse 6s ease-in-out infinite;
          }
        }
        @keyframes sideParticle {
          0%   { opacity: 0;    transform: translate(0, 0)    scale(1); }
          15%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { opacity: 0;    transform: translate(var(--dx), -80px) scale(0.3); }
        }
        .side-particle {
          animation: sideParticle var(--dur) ease-out var(--delay) infinite;
          border-radius: 50%;
          position: absolute;
          pointer-events: none;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .side-particle { animation-duration: calc(var(--dur) * 2.5); }
        }
      `}</style>

      <main className="flex-1 flex flex-col items-center justify-start p-4 py-10 min-h-[calc(100vh-80px)] relative gap-8 w-full">
        <SectionGlow color="purple" intensity="strong" />

        {/* ── Perspective stack: countdown behind, download card on top ──── */}
        <div className="w-full flex flex-col items-center px-2" style={{ perspective: "1400px", perspectiveOrigin: "50% 0%" }}>

          {/* Countdown — tilted back, milky, peeks under download card */}
          <div className="w-full" style={{
            marginBottom: "-125px",
            position: "relative",
            zIndex: 0,
            transform: "rotateX(10deg)",
            transformOrigin: "bottom center",
            willChange: "transform",
          }}>
            {/* Gradient mask softens the very bottom edge before the download card covers it */}
            <div style={{ position: "relative" }}>
              <LaunchCountdown />
              <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "90px",
                background: "linear-gradient(to bottom, transparent 0%, rgba(8,6,22,0.6) 60%, rgba(8,6,22,0.95) 100%)",
                pointerEvents: "none",
              }} />
            </div>
          </div>

          {/* ── Download card — on top ───────────────────────────────────── */}
          <div className="relative w-full max-w-lg" style={{ zIndex: 10 }}>
          {/* Left-side particles */}
          {LEFT_PARTICLES.map((p, i) => (
            <div
              key={`lp-${i}`}
              className="side-particle"
              style={{
                top: p.top,
                left: `-${10 + (i % 3) * 6}px`,
                width: p.size,
                height: p.size,
                background: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                "--dur": `${p.dur}s`,
                "--delay": `${p.delay}s`,
                "--dx": `${-12 - (i % 4) * 5}px`,
              } as React.CSSProperties}
            />
          ))}

          {/* Right-side particles */}
          {RIGHT_PARTICLES.map((p, i) => (
            <div
              key={`rp-${i}`}
              className="side-particle"
              style={{
                top: p.top,
                right: `-${10 + (i % 3) * 6}px`,
                width: p.size,
                height: p.size,
                background: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                "--dur": `${p.dur}s`,
                "--delay": `${p.delay}s`,
                "--dx": `${12 + (i % 4) * 5}px`,
              } as React.CSSProperties}
            />
          ))}

          <GlassPanel variant="elevated" glow="purple" className="w-full max-w-lg p-0">
            <div className="p-6 sm:p-8 text-center border-b border-white/[0.06]">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/40 to-cyan-600/30 blur-2xl scale-150 opacity-60" />
                  <motion.img 
                    src={faviconImg}
                    alt="SwitchControl"
                    className="relative w-20 h-20 md:w-24 md:h-24 rounded-[22%] transition-all duration-300 object-contain logo-animate"
                    initial={{ opacity: 0, scale: prefersReducedMotion ? 0.95 : 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: prefersReducedMotion ? 0.2 : 0.4 }}
                    whileHover={{ scale: prefersReducedMotion ? 1.01 : 1.03 }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  v1.0.0 (Early Access)
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-download-title">Download {brand.name}</h1>
              <p className="text-sm text-white/50 mt-1">
                Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'User'}! Get the desktop app to start optimizing.
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6 relative">
              <SectionGlow color="cyan" intensity="strong" />
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                  <span>v1.0.0 (Early Access) - Latest build</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <Monitor className="size-4 text-primary shrink-0" />
                  <span>Windows Installer (.exe) • Windows 10/11 64-bit</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <Shield className="size-4 text-blue-400 shrink-0" />
                  <span>Digitally signed • No bundled software</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <Clock className="size-4 text-amber-400 shrink-0" />
                  <span>~350 MB • Installs in under 30 seconds</span>
                </div>
              </div>

              <GlowButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  alert('Download would start here. This is a demo - the actual installer is not yet available.');
                }}
                data-testid="button-download-windows"
              >
                <Download className="size-5" />
                Download SwitchControl_v1.0.0_Setup.exe
              </GlowButton>

              <p className="text-xs text-center text-white/35">
                By downloading, you agree to our{" "}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>

              <div className="pt-4 border-t border-white/[0.06]">
                <h4 className="text-sm font-medium text-white mb-4">Installation Steps</h4>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { step: 1, label: "Download", icon: Download },
                    { step: 2, label: "Install", icon: Monitor },
                    { step: 3, label: "Launch", icon: Shield },
                    { step: 4, label: "Optimize", icon: CheckCircle }
                  ].map((item, index) => (
                    <motion.div
                      key={item.step}
                      className="text-center p-2 rounded-xl bg-white/[0.03] border border-white/[0.08]"
                      initial={{ opacity: 0, y: prefersReducedMotion ? 5 : 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: prefersReducedMotion ? 0.15 : 0.3 }}
                      whileHover={{ scale: prefersReducedMotion ? 1.02 : 1.05, borderColor: 'rgba(139, 92, 246, 0.5)' }}
                      data-testid={`step-install-${item.step}`}
                    >
                      <item.icon className="size-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs font-medium text-white">{item.step}</p>
                      <p className="text-[10px] text-white/40">{item.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>
          </div>{/* end download card */}
        </div>{/* end perspective container */}

        {/* ── What's New card ─────────────────────────────────────────────── */}
        <DownloadPatchNotesCard />
      </main>
    </WebsiteShell>
  );
}
