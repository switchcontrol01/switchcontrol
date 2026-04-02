import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.png";
import { getTagline } from "@/lib/taglines";

interface SplashProps {
  onComplete: () => void;
}

const PARTICLES = Array.from({ length: 55 }, (_, i) => ({
  id: i,
  left: `${4 + (i * 3.7 + i * i * 0.13) % 92}%`,
  top:  `${6 + (i * 5.3 + i * 0.9) % 88}%`,
  size: i % 7 === 0 ? 5 + (i % 3) : i % 4 === 0 ? 3 : 1.5 + (i % 3) * 0.8,
  color:
    i % 5 === 0 ? "rgba(0,230,255,0.55)"
    : i % 5 === 1 ? "rgba(168,85,247,0.60)"
    : i % 5 === 2 ? "rgba(236,72,153,0.40)"
    : i % 5 === 3 ? "rgba(255,255,255,0.30)"
    :               "rgba(120,80,255,0.45)",
  glow:
    i % 5 === 0 ? "0 0 8px rgba(0,230,255,0.7)"
    : i % 5 === 1 ? "0 0 10px rgba(168,85,247,0.7)"
    : i % 5 === 2 ? "0 0 6px rgba(236,72,153,0.5)"
    : "none",
  dur: 3.2 + (i % 8) * 0.45,
  delay: i * 0.08,
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
          background: "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, rgba(120,60,220,0.08) 45%, transparent 70%)",
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
          background: "radial-gradient(ellipse, rgba(0,200,255,0.16) 0%, rgba(0,150,220,0.06) 45%, transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "55%", top: "5%",
          width: "35vw", height: "35vw",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.12) 0%, transparent 65%)",
          filter: "blur(70px)",
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "20%", bottom: "5%",
          width: "40vw", height: "40vw",
          background: "radial-gradient(ellipse, rgba(100,60,255,0.14) 0%, transparent 65%)",
          filter: "blur(85px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />

      {/* ── Subtle centre core pulse ───────────────────────────────────── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "50%", top: "50%",
          width: "40vw", height: "40vw",
          marginLeft: "-20vw", marginTop: "-20vw",
          background: "radial-gradient(ellipse, rgba(168,85,247,0.18) 0%, rgba(0,210,255,0.08) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Contour field ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none opacity-20"
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
                <path d="M0 50 Q75 20 150 50 T300 50"   fill="none" stroke="hsl(270 55% 55%)" strokeWidth="0.9" opacity="0.55"/>
                <path d="M0 100 Q75 70 150 100 T300 100" fill="none" stroke="hsl(190 90% 50%)" strokeWidth="0.6" opacity="0.4"/>
                <path d="M0 150 Q75 120 150 150 T300 150" fill="none" stroke="hsl(280 50% 50%)" strokeWidth="0.7" opacity="0.4"/>
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
                <path d="M0 45 Q62 18 125 45 T250 45"  fill="none" stroke="hsl(190 80% 55%)" strokeWidth="0.5" opacity="0.45"/>
                <path d="M0 95 Q62 68 125 95 T250 95"  fill="none" stroke="hsl(265 55% 50%)" strokeWidth="0.4" opacity="0.35"/>
                <path d="M0 145 Q62 118 125 145 T250 145" fill="none" stroke="hsl(280 50% 55%)" strokeWidth="0.55" opacity="0.4"/>
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
              opacity: [0.1, 0.75, 0.1],
              scale: [1, 1.4, 1],
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
        { top: "50%", deg: "-14deg", color1: "rgba(168,85,247,0.22)", color2: "rgba(0,210,255,0.12)", dur: 3.5, delay: 0.4 },
        { top: "38%", deg: "-20deg", color1: "rgba(139,92,246,0.14)", color2: "rgba(255,255,255,0.06)", dur: 5, delay: 1.8 },
        { top: "62%", deg: "-10deg", color1: "rgba(0,200,255,0.15)", color2: "rgba(168,85,247,0.08)", dur: 4.2, delay: 2.8 },
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
          animate={{ opacity: [0, 0.9, 0], x: ["-20%", "20%"] }}
          transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
        />
      ))}

      {/* ── Vignette ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(8,8,16,0.85) 100%)" }}
      />

      {/* ── Logo + UI content ─────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-6">

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
                  border: "1px solid rgba(168,85,247,0.25)",
                  boxShadow: "0 0 40px rgba(168,85,247,0.15), inset 0 0 40px rgba(0,210,255,0.08)",
                }}
                animate={{ rotate: 360, opacity: [0.4, 0.8, 0.4] }}
                transition={{ rotate: { duration: 12, repeat: Infinity, ease: "linear" }, opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
              />
              {/* second ring cyan */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: "152px", height: "152px",
                  top: "50%", left: "50%",
                  marginLeft: "-76px", marginTop: "-76px",
                  border: "1px solid rgba(0,210,255,0.18)",
                }}
                animate={{ rotate: -360, opacity: [0.3, 0.6, 0.3] }}
                transition={{ rotate: { duration: 18, repeat: Infinity, ease: "linear" }, opacity: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 } }}
              />

              {/* wide ambient halo */}
              <motion.div
                className="absolute -inset-20 rounded-full pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse, rgba(139,92,246,0.3) 0%, rgba(0,210,255,0.1) 40%, transparent 65%)",
                  filter: "blur(20px)",
                }}
                animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* logo icon */}
              <motion.div
                className="relative"
                animate={{
                  filter: [
                    "drop-shadow(0 0 20px rgba(139,92,246,0.5)) drop-shadow(0 0 50px rgba(0,210,255,0.2))",
                    "drop-shadow(0 0 40px rgba(139,92,246,0.8)) drop-shadow(0 0 80px rgba(0,210,255,0.35))",
                    "drop-shadow(0 0 20px rgba(139,92,246,0.5)) drop-shadow(0 0 50px rgba(0,210,255,0.2))",
                  ],
                  y: [0, -4, 0],
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* shimmer sweep */}
                <div className="absolute inset-0 rounded-[22%] overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
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
                    background: "linear-gradient(90deg, hsl(270,65%,65%), hsl(190,90%,60%))",
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
                      background: "linear-gradient(90deg, hsl(270,60%,55%), hsl(190,90%,55%), hsl(270,60%,55%))",
                      backgroundSize: "200% 100%",
                      boxShadow: "0 0 8px rgba(168,85,247,0.7), 0 0 20px rgba(0,210,255,0.3)",
                    }}
                    animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  {/* trailing spark */}
                  <motion.div
                    className="absolute top-0 h-full w-4 rounded-full"
                    style={{
                      left: `calc(${progress}% - 8px)`,
                      background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(0,210,255,0.5) 50%, transparent 80%)",
                      filter: "blur(2px)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "hsl(190,90%,55%)" }}
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
