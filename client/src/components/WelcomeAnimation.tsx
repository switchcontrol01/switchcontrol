import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { Crown, Zap } from "lucide-react";

interface WelcomeAnimationProps {
  userName: string | null;
  isPremium?: boolean;
  onComplete: () => void;
}

// Deterministic particle seed to avoid hydration flicker
function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export function WelcomeAnimation({ userName, isPremium, onComplete }: WelcomeAnimationProps) {
  useEffect(() => {
    const t = setTimeout(onComplete, 4800);
    return () => clearTimeout(t);
  }, [onComplete]);

  const particles = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => ({
      id: i,
      x: seededRandom(i * 7) * 100,
      y: seededRandom(i * 13) * 100,
      size: 1.5 + seededRandom(i * 17) * 3.5,
      delay: seededRandom(i * 3) * 3,
      duration: 3.5 + seededRandom(i * 11) * 4,
      drift: (seededRandom(i * 19) - 0.5) * 40,
      color: i % 5 === 0
        ? "rgba(236,72,153,0.7)"
        : i % 4 === 0
        ? "rgba(56,189,248,0.6)"
        : i % 3 === 0
        ? "rgba(192,132,252,0.8)"
        : "rgba(139,92,246,0.6)",
    }));
  }, []);

  const beamLines = useMemo(() => (
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      angle: i * 30 + 15,
      delay: i * 0.2,
      opacity: 0.04 + seededRandom(i * 7) * 0.06,
    }))
  ), []);

  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg, #06060e 0%, #0c0c1d 40%, #0a0a18 70%, #06060e 100%)" }}
      initial={{ opacity: 0, filter: "blur(10px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    >

      {/* ── Scan-line overlay ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.025]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* ── Grid dots ─────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.12) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* ── Ambient background orbs ───────────────────────────────────── */}

      {/* Primary large purple orb */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "50%", top: "50%",
          width: "80vw", height: "80vw",
          marginLeft: "-40vw", marginTop: "-40vw",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.08) 45%, transparent 70%)",
          filter: "blur(90px)",
        }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: [1, 1.08, 1] }}
        transition={{ opacity: { duration: 1.2 }, scale: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.2 } }}
      />

      {/* Pink top-right orb */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          right: "5%", top: "5%",
          width: "40vw", height: "40vw",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.18) 0%, transparent 65%)",
          filter: "blur(70px)",
        }}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: [0, 0.9, 0.7, 0.9], x: [30, 0, -10, 0] }}
        transition={{ duration: 2.2, delay: 0.3, ease: "easeOut", times: [0, 0.5, 0.75, 1] }}
      />

      {/* Cyan bottom-left orb */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "0%", bottom: "10%",
          width: "35vw", height: "35vw",
          background: "radial-gradient(ellipse, rgba(56,189,248,0.12) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: [0, 0.8, 0.6, 0.8], x: [-30, 0, 10, 0] }}
        transition={{ duration: 2.5, delay: 0.5, ease: "easeOut", times: [0, 0.5, 0.75, 1] }}
      />

      {/* Violet bottom-right orb — breathes */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          right: "10%", bottom: "5%",
          width: "30vw", height: "30vw",
          background: "radial-gradient(ellipse, rgba(167,139,250,0.15) 0%, transparent 65%)",
          filter: "blur(55px)",
        }}
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Diagonal light beams ───────────────────────────────────────── */}
      {beamLines.map(beam => (
        <motion.div
          key={beam.id}
          className="absolute pointer-events-none"
          style={{
            left: "50%", top: "50%",
            width: "120vmax", height: "1px",
            transformOrigin: "left center",
            rotate: `${beam.angle}deg`,
            background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.4) 40%, rgba(236,72,153,0.3) 60%, transparent 100%)",
            filter: "blur(1px)",
            opacity: beam.opacity,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: beam.opacity }}
          transition={{ duration: 1.8, delay: 0.4 + beam.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* ── Floating particles ────────────────────────────────────────── */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute pointer-events-none rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
          initial={{ opacity: 0, y: 0, x: 0 }}
          animate={{
            opacity: [0, seededRandom(p.id * 31) * 0.8 + 0.2, 0],
            y: [0, -30 - seededRandom(p.id * 23) * 50],
            x: [0, p.drift],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}

      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <motion.div
        className="relative mb-9 z-10"
        initial={{ scale: 0.3, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {/* Energy ring 1 — expands outward */}
        <motion.div
          className="absolute rounded-3xl border border-violet-500/50 pointer-events-none"
          style={{ inset: -8 }}
          initial={{ opacity: 0.8, scale: 0.8 }}
          animate={{ opacity: [0.8, 0], scale: [0.8, 2.2] }}
          transition={{ duration: 1.6, delay: 0.5, ease: "easeOut" }}
        />
        {/* Energy ring 2 */}
        <motion.div
          className="absolute rounded-3xl border border-pink-500/40 pointer-events-none"
          style={{ inset: -8 }}
          initial={{ opacity: 0.7, scale: 0.8 }}
          animate={{ opacity: [0.7, 0], scale: [0.8, 2.8] }}
          transition={{ duration: 1.9, delay: 0.75, ease: "easeOut" }}
        />
        {/* Energy ring 3 */}
        <motion.div
          className="absolute rounded-3xl border border-sky-400/30 pointer-events-none"
          style={{ inset: -8 }}
          initial={{ opacity: 0.6, scale: 0.8 }}
          animate={{ opacity: [0.6, 0], scale: [0.8, 3.5] }}
          transition={{ duration: 2.2, delay: 1.0, ease: "easeOut" }}
        />

        {/* Persistent pulsing halo */}
        <motion.div
          className="absolute -inset-8 rounded-[40%] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, rgba(139,92,246,0.45) 0%, rgba(236,72,153,0.12) 50%, transparent 75%)",
            filter: "blur(20px)",
          }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
        />

        {/* Rotating sparkle ring */}
        <motion.div
          className="absolute pointer-events-none"
          style={{ inset: -20 }}
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: [0, 0.6, 0.6], rotate: 360 }}
          transition={{
            opacity: { duration: 1, delay: 0.6 },
            rotate: { duration: 8, repeat: Infinity, ease: "linear", delay: 0.6 },
          }}
        >
          {[0, 60, 120, 180, 240, 300].map((angle, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                top: "50%", left: "50%",
                width: 3, height: 3,
                marginTop: -1.5, marginLeft: -1.5,
                borderRadius: "50%",
                background: i % 2 === 0 ? "rgba(192,132,252,0.9)" : "rgba(236,72,153,0.9)",
                boxShadow: `0 0 6px ${i % 2 === 0 ? "rgba(192,132,252,0.9)" : "rgba(236,72,153,0.9)"}`,
                transform: `rotate(${angle}deg) translateX(68px)`,
              }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.4, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </motion.div>

        {/* Logo image with glow pulse */}
        <motion.img
          src={logoImg}
          alt="SwitchControl"
          className="w-28 h-28 object-contain rounded-3xl relative z-10"
          draggable={false}
          animate={{
            filter: [
              "drop-shadow(0 0 16px rgba(139,92,246,0.6)) drop-shadow(0 0 40px rgba(139,92,246,0.3))",
              "drop-shadow(0 0 30px rgba(139,92,246,0.9)) drop-shadow(0 0 70px rgba(236,72,153,0.4))",
              "drop-shadow(0 0 16px rgba(139,92,246,0.6)) drop-shadow(0 0 40px rgba(139,92,246,0.3))",
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* ── Text block ────────────────────────────────────────────────── */}
      <motion.div
        className="text-center relative z-10"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.55 }}
      >
        <h1 className="text-[2.8rem] font-bold leading-none mb-3 tracking-tight">
          <span className="text-white">Welcome</span>
          {userName && (
            <motion.span
              style={{
                background: "linear-gradient(90deg, rgb(192,132,252) 0%, rgb(236,72,153) 50%, rgb(251,146,60) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundSize: "200% auto",
              }}
              animate={{ backgroundPosition: ["0% center", "200% center", "0% center"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              ,&nbsp;{userName}
            </motion.span>
          )}
          <span className="text-white">!</span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
        >
          {isPremium ? (
            <span className="inline-flex items-center justify-center gap-2 text-amber-300/90 text-[15px]">
              <motion.span animate={{ rotate: [-8, 8, -8] }} transition={{ duration: 1.8, repeat: Infinity }}>
                <Crown className="w-4 h-4 flex-shrink-0" />
              </motion.span>
              Premium Member
              <motion.span animate={{ rotate: [8, -8, 8] }} transition={{ duration: 1.8, repeat: Infinity }}>
                <Crown className="w-4 h-4 flex-shrink-0" />
              </motion.span>
            </span>
          ) : (
            <p className="text-[15px] text-zinc-400">
              Let's optimize your gaming experience
            </p>
          )}
        </motion.div>
      </motion.div>

      {/* ── Loading indicator ─────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col items-center gap-3 mt-10 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
      >
        {/* Animated progress bar */}
        <div className="w-36 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, rgba(139,92,246,0.8), rgba(236,72,153,0.9), rgba(56,189,248,0.8))",
              boxShadow: "0 0 8px rgba(139,92,246,0.8)",
            }}
            initial={{ width: "0%", x: "-100%" }}
            animate={{ width: "100%", x: "0%" }}
            transition={{ duration: 2.8, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Pulsing dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: i === 1 ? 6 : 4,
                height: i === 1 ? 6 : 4,
                background: i === 1 ? "rgba(168,85,247,0.9)" : "rgba(168,85,247,0.5)",
                boxShadow: i === 1 ? "0 0 8px rgba(168,85,247,0.8)" : "none",
              }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.7, 1.4, 0.7],
                y: [0, -3, 0],
              }}
              transition={{
                duration: 1.0,
                repeat: Infinity,
                delay: i * 0.18,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* ── Zap icon flash on entry ────────────────────────────────────── */}
      <motion.div
        className="absolute pointer-events-none z-20"
        style={{ left: "50%", top: "50%", marginLeft: -24, marginTop: -24 }}
        initial={{ opacity: 1, scale: 0.5 }}
        animate={{ opacity: [1, 0], scale: [0.5, 4] }}
        transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
      >
        <Zap className="w-12 h-12 text-violet-400" style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,1))" }} />
      </motion.div>

    </motion.div>
  );
}
