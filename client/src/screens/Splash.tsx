import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.png";
import { getTagline } from "@/lib/taglines";

interface SplashProps {
  onComplete: () => void;
}

const PARTICLES = Array.from({ length: 90 }, (_, i) => ({
  id: i,
  left: `${4 + (i * 3.7 + i * i * 0.13) % 92}%`,
  top:  `${6 + (i * 5.3 + i * 0.9) % 88}%`,
  size: i % 7 === 0 ? 6 + (i % 3) : i % 4 === 0 ? 4 : 2 + (i % 3) * 1.1,
  color:
    i % 5 === 0 ? "rgba(0,230,255,0.80)"
    : i % 5 === 1 ? "rgba(168,85,247,0.85)"
    : i % 5 === 2 ? "rgba(236,72,153,0.65)"
    : i % 5 === 3 ? "rgba(255,255,255,0.55)"
    :               "rgba(130,90,255,0.70)",
  glow:
    i % 5 === 0 ? "0 0 10px rgba(0,230,255,0.95), 0 0 20px rgba(0,200,255,0.4)"
    : i % 5 === 1 ? "0 0 12px rgba(168,85,247,0.95), 0 0 24px rgba(140,70,240,0.4)"
    : i % 5 === 2 ? "0 0 8px rgba(236,72,153,0.8)"
    : "0 0 6px rgba(255,255,255,0.4)",
  dur: 3.2 + (i % 8) * 0.45,
  delay: i * 0.05,
  dy: 18 + (i % 6) * 5,
  dx: 6 + (i % 5) * 4,
}));

export default function Splash({ onComplete }: SplashProps) {
  const [logoReady, setLogoReady] = useState(false);
  const [textReady, setTextReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const tagline = useMemo(() => getTagline(), []);
  const [statusText, setStatusText] = useState(tagline);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoReady(true), 300);
    const t2 = setTimeout(() => setTextReady(true), 900);

    const statusInterval = setInterval(() => setStatusText(getTagline()), 2000);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        const remaining = 100 - prev;
        if (prev < 40) return prev + 2.2;
        if (prev < 75) return prev + Math.max(remaining * 0.12, 0.5);
        return prev + Math.max(remaining * 0.07, 0.2);
      });
    }, 40);

    const completeTimer = setTimeout(() => onComplete(), 4800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(completeTimer);
      clearInterval(progressInterval);
      clearInterval(statusInterval);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-[#080810] overflow-hidden flex items-center justify-center">

      {/* ── Large ambient orbs ─────────────────────────────────────────── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "10%", top: "15%",
          width: "55vw", height: "55vw",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.28) 0%, rgba(120,60,220,0.10) 45%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          right: "5%", bottom: "10%",
          width: "50vw", height: "50vw",
          background: "radial-gradient(ellipse, rgba(0,200,255,0.22) 0%, rgba(0,150,220,0.08) 45%, transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "55%", top: "5%",
          width: "35vw", height: "35vw",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.15) 0%, transparent 65%)",
          filter: "blur(70px)",
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* ── Subtle centre core pulse ───────────────────────────────────── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "50%", top: "50%",
          width: "45vw", height: "45vw",
          marginLeft: "-22.5vw", marginTop: "-22.5vw",
          background: "radial-gradient(ellipse, rgba(168,85,247,0.22) 0%, rgba(0,210,255,0.10) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Contour field ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none opacity-25"
        style={{ transform: "rotate(-12deg) scale(1.6)" }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ x: [0, 60, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="sc1" x="0" y="0" width="300" height="200" patternUnits="userSpaceOnUse">
                <path d="M0 50 Q75 20 150 50 T300 50"   fill="none" stroke="hsl(270 55% 55%)" strokeWidth="0.9" opacity="0.6"/>
                <path d="M0 100 Q75 70 150 100 T300 100" fill="none" stroke="hsl(190 90% 50%)" strokeWidth="0.6" opacity="0.45"/>
                <path d="M0 150 Q75 120 150 150 T300 150" fill="none" stroke="hsl(280 50% 50%)" strokeWidth="0.7" opacity="0.45"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#sc1)" />
          </svg>
        </motion.div>
        <motion.div
          className="absolute inset-0"
          animate={{ x: [0, -40, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: "linear" }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="sc2" x="0" y="0" width="250" height="180" patternUnits="userSpaceOnUse">
                <path d="M0 45 Q62 18 125 45 T250 45"  fill="none" stroke="hsl(190 80% 55%)" strokeWidth="0.5" opacity="0.5"/>
                <path d="M0 95 Q62 68 125 95 T250 95"  fill="none" stroke="hsl(265 55% 50%)" strokeWidth="0.4" opacity="0.4"/>
                <path d="M0 145 Q62 118 125 145 T250 145" fill="none" stroke="hsl(280 50% 55%)" strokeWidth="0.55" opacity="0.45"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#sc2)" />
          </svg>
        </motion.div>
      </div>

      {/* ── Particles ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {PARTICLES.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.left, top: p.top,
              width: `${p.size}px`, height: `${p.size}px`,
              background: p.color,
              boxShadow: p.glow,
            }}
            animate={{
              y: [-p.dy, p.dy, -p.dy],
              x: [-p.dx, p.dx, -p.dx],
              opacity: [0.1, 0.85, 0.1],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: p.dur,
              repeat: Infinity,
              delay: p.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* ── Sweeping light streaks ────────────────────────────────────── */}
      {[
        { top: "50%", deg: "-14deg", color1: "rgba(168,85,247,0.28)", color2: "rgba(0,210,255,0.16)", dur: 3.5, delay: 0.4 },
        { top: "38%", deg: "-20deg", color1: "rgba(139,92,246,0.20)", color2: "rgba(255,255,255,0.10)", dur: 5, delay: 1.8 },
        { top: "62%", deg: "-10deg", color1: "rgba(0,200,255,0.22)", color2: "rgba(168,85,247,0.12)", dur: 4.2, delay: 2.8 },
      ].map((s, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: "200%", height: "2px",
            left: "-50%", top: s.top,
            background: `linear-gradient(90deg, transparent, ${s.color1}, ${s.color2}, ${s.color1}, transparent)`,
            transform: `rotate(${s.deg})`,
          }}
          animate={{ opacity: [0, 1, 0], x: ["-20%", "20%"] }}
          transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
        />
      ))}

      {/* ── Vignette ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(8,8,16,0.88) 100%)" }}
      />

      {/* ── Sun streak / god rays — behind content ────────────────────── */}
      <div
        className="absolute pointer-events-none"
        style={{ left: "50%", top: "44%", transform: "translate(-50%, -50%)", zIndex: 5 }}
      >
        {/* Wide deep glow */}
        <motion.div
          className="absolute"
          style={{
            width: "700px", height: "700px",
            marginLeft: "-350px", marginTop: "-350px",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.42) 0%, rgba(0,210,255,0.18) 30%, rgba(168,85,247,0.08) 55%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{ opacity: [0.65, 1, 0.65], scale: [0.95, 1.06, 0.95] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Bright core spot */}
        <motion.div
          className="absolute"
          style={{
            width: "220px", height: "220px",
            marginLeft: "-110px", marginTop: "-110px",
            background: "radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(210,150,255,0.55) 18%, rgba(0,210,255,0.35) 40%, transparent 68%)",
            filter: "blur(14px)",
          }}
          animate={{ opacity: [0.7, 1, 0.7], scale: [0.88, 1.12, 0.88] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Inner hot point */}
        <motion.div
          className="absolute"
          style={{
            width: "60px", height: "60px",
            marginLeft: "-30px", marginTop: "-30px",
            background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(200,180,255,0.7) 40%, transparent 70%)",
            filter: "blur(4px)",
          }}
          animate={{ opacity: [0.8, 1, 0.8], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Primary rotating sun rays */}
        <motion.div
          className="absolute"
          style={{ width: "900px", height: "900px", marginLeft: "-450px", marginTop: "-450px" }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: "100%", height: i % 2 === 0 ? "2px" : "1.5px",
                top: "50%", left: "0",
                marginTop: i % 2 === 0 ? "-1px" : "-0.75px",
                transform: `rotate(${i * 18}deg)`,
                transformOrigin: "50% 50%",
                background: i % 3 === 0
                  ? "linear-gradient(90deg, transparent 5%, rgba(168,85,247,0.5) 35%, rgba(0,210,255,0.4) 50%, rgba(168,85,247,0.5) 65%, transparent 95%)"
                  : i % 3 === 1
                    ? "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.25) 40%, rgba(0,220,255,0.3) 50%, rgba(255,255,255,0.25) 60%, transparent 95%)"
                    : "linear-gradient(90deg, transparent 5%, rgba(139,92,246,0.35) 38%, rgba(200,150,255,0.25) 50%, rgba(139,92,246,0.35) 62%, transparent 95%)",
                filter: "blur(1px)",
              }}
            />
          ))}
        </motion.div>

        {/* Secondary counter-rotating rays (shorter, brighter) */}
        <motion.div
          className="absolute"
          style={{ width: "550px", height: "550px", marginLeft: "-275px", marginTop: "-275px" }}
          animate={{ rotate: [0, -360] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: "100%", height: "1px",
                top: "50%", left: "0",
                marginTop: "-0.5px",
                transform: `rotate(${i * 30 + 15}deg)`,
                transformOrigin: "50% 50%",
                background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.22) 42%, rgba(0,230,255,0.28) 50%, rgba(255,255,255,0.22) 58%, transparent 90%)",
              }}
            />
          ))}
        </motion.div>

        {/* Lens flare horizontal streak */}
        <motion.div
          className="absolute"
          style={{
            width: "800px", height: "3px",
            marginLeft: "-400px", marginTop: "-1.5px",
            background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.15) 20%, rgba(255,255,255,0.35) 45%, rgba(0,220,255,0.45) 50%, rgba(255,255,255,0.35) 55%, rgba(168,85,247,0.15) 80%, transparent)",
            filter: "blur(1.5px)",
          }}
          animate={{ opacity: [0.5, 0.9, 0.5], scaleX: [0.95, 1.05, 0.95] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
      </div>

      {/* ── Logo + UI content ─────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-6" style={{ zIndex: 10 }}>

        {/* Glass frost backdrop */}
        <div
          className="absolute pointer-events-none rounded-[40px]"
          style={{
            inset: "-48px -70px",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            background: "radial-gradient(ellipse at 50% 30%, rgba(168,85,247,0.05) 0%, rgba(0,10,30,0.14) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 0 100px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        />

        {/* logo halo */}
        <AnimatePresence>
          {logoReady && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center"
            >
              {/* outer rotating ring */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: "180px", height: "180px",
                  top: "50%", left: "50%",
                  marginLeft: "-90px", marginTop: "-90px",
                  border: "1px solid rgba(168,85,247,0.30)",
                  boxShadow: "0 0 40px rgba(168,85,247,0.18), inset 0 0 40px rgba(0,210,255,0.10)",
                }}
                animate={{ rotate: 360, opacity: [0.4, 0.85, 0.4] }}
                transition={{ rotate: { duration: 12, repeat: Infinity, ease: "linear" }, opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
              />
              {/* second ring cyan */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: "152px", height: "152px",
                  top: "50%", left: "50%",
                  marginLeft: "-76px", marginTop: "-76px",
                  border: "1px solid rgba(0,210,255,0.22)",
                }}
                animate={{ rotate: -360, opacity: [0.3, 0.65, 0.3] }}
                transition={{ rotate: { duration: 18, repeat: Infinity, ease: "linear" }, opacity: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 } }}
              />

              {/* wide ambient halo */}
              <motion.div
                className="absolute -inset-20 rounded-full pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, rgba(0,210,255,0.12) 40%, transparent 65%)",
                  filter: "blur(20px)",
                }}
                animate={{ scale: [1, 1.28, 1], opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* logo icon */}
              <motion.div
                className="relative"
                animate={{
                  filter: [
                    "drop-shadow(0 0 24px rgba(139,92,246,0.6)) drop-shadow(0 0 60px rgba(0,210,255,0.25))",
                    "drop-shadow(0 0 48px rgba(139,92,246,0.9)) drop-shadow(0 0 100px rgba(0,210,255,0.45))",
                    "drop-shadow(0 0 24px rgba(139,92,246,0.6)) drop-shadow(0 0 60px rgba(0,210,255,0.25))",
                  ],
                  y: [0, -4, 0],
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* shimmer sweep */}
                <div className="absolute inset-0 rounded-[22%] overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    animate={{ x: ["-100%", "150%"] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
                  />
                </div>
                <img
                  src={logoImg}
                  alt="SwitchControl"
                  className="w-28 h-28 max-w-[112px] max-h-[112px] object-contain rounded-[22%]"
                  draggable={false}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* title */}
        <AnimatePresence>
          {textReady && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-3"
            >
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Switch<span
                  style={{
                    background: "linear-gradient(90deg, hsl(270,65%,68%), hsl(190,90%,62%))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >Control</span>
              </h1>

              <div className="h-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={statusText}
                    className="text-sm text-muted-foreground max-w-xs text-center"
                    data-testid="text-splash-tagline"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    {statusText}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* progress bar */}
              <motion.div
                className="mt-3 w-52"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                <div className="h-[3px] bg-white/8 rounded-full overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-full relative overflow-hidden"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, hsl(270,60%,58%), hsl(190,90%,58%), hsl(270,60%,58%))",
                      backgroundSize: "200% 100%",
                      boxShadow: "0 0 10px rgba(168,85,247,0.8), 0 0 24px rgba(0,210,255,0.4)",
                    }}
                    animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  {/* trailing spark */}
                  <motion.div
                    className="absolute top-0 h-full w-4 rounded-full"
                    style={{
                      left: `calc(${progress}% - 8px)`,
                      background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(0,210,255,0.6) 50%, transparent 80%)",
                      filter: "blur(2px)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "hsl(190,90%,58%)" }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs text-muted-foreground tracking-wide">Initializing…</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
