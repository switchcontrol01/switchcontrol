import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.webp";
import { getTagline } from "@/lib/taglines";

interface SplashProps {
  onComplete: () => void;
}

/* ── Static particle field — deterministic, no random() ─────────────── */
const PARTICLES = Array.from({ length: 140 }, (_, i) => {
  const t = i / 140;
  const hue =
    i % 6 === 0 ? "rgba(0,230,255,"
    : i % 6 === 1 ? "rgba(168,85,247,"
    : i % 6 === 2 ? "rgba(236,72,153,"
    : i % 6 === 3 ? "rgba(255,200,80,"
    : i % 6 === 4 ? "rgba(80,200,255,"
    :               "rgba(200,130,255,";
  const alpha = 0.55 + (i % 7) * 0.06;
  const size  = i % 9 === 0 ? 8 + (i % 4) : i % 5 === 0 ? 5 : 2.5 + (i % 3);
  const glowR = i % 6 === 0 ? "0,230,255" : i % 6 === 1 ? "168,85,247" : i % 6 === 2 ? "236,72,153" : i % 6 === 3 ? "255,200,80" : "80,200,255";
  return {
    id: i,
    left: `${3 + ((i * 4.3 + i * i * 0.09) % 94)}%`,
    top:  `${4 + ((i * 6.1 + i * 0.7)      % 92)}%`,
    size,
    color:  `${hue}${alpha})`,
    glow:   `0 0 ${size * 1.8}px rgba(${glowR},0.9), 0 0 ${size * 3.5}px rgba(${glowR},0.35)`,
    dur:    2.8 + (i % 9) * 0.4,
    delay:  (i * 0.033) % 3,
    dy:     14 + (i % 7) * 6,
    dx:     5  + (i % 5) * 5,
    scale:  [1, 1.4 + (i % 3) * 0.2, 1] as [number, number, number],
    opac:   [0.08, 0.75 + (i % 4) * 0.07, 0.08] as [number, number, number],
  };
});

/* ── Streaks — diagonal light beams ─────────────────────────────────── */
const STREAKS = [
  { top: "48%", deg: "-13deg",  c1: "rgba(168,85,247,0.32)",  c2: "rgba(0,220,255,0.22)", dur: 3.4, delay: 0.3 },
  { top: "35%", deg: "-22deg",  c1: "rgba(139,92,246,0.24)",  c2: "rgba(255,255,255,0.14)", dur: 5.1, delay: 1.5 },
  { top: "63%", deg: "-8deg",   c1: "rgba(0,200,255,0.26)",   c2: "rgba(168,85,247,0.16)", dur: 4.0, delay: 2.6 },
  { top: "28%", deg: "-30deg",  c1: "rgba(236,72,153,0.20)",  c2: "rgba(168,85,247,0.12)", dur: 6.2, delay: 0.9 },
  { top: "72%", deg: "5deg",    c1: "rgba(255,200,80,0.16)",  c2: "rgba(0,210,255,0.12)",  dur: 4.8, delay: 3.4 },
  { top: "55%", deg: "-38deg",  c1: "rgba(100,60,255,0.20)",  c2: "rgba(236,72,153,0.14)", dur: 5.6, delay: 2.1 },
];

/* ── Sun ray spokes config ───────────────────────────────────────────── */
const PRIMARY_RAYS = Array.from({ length: 14 }, (_, i) => ({
  angle: i * (360 / 14),
  h: i % 3 === 0 ? "2.5px" : "1.5px",
  grad: i % 3 === 0
    ? "linear-gradient(90deg,transparent 3%,rgba(168,85,247,0.55) 30%,rgba(0,220,255,0.45) 50%,rgba(168,85,247,0.55) 70%,transparent 97%)"
    : i % 3 === 1
      ? "linear-gradient(90deg,transparent 3%,rgba(255,255,255,0.28) 38%,rgba(0,230,255,0.35) 50%,rgba(255,255,255,0.28) 62%,transparent 97%)"
      : "linear-gradient(90deg,transparent 3%,rgba(139,92,246,0.4) 35%,rgba(200,150,255,0.3) 50%,rgba(139,92,246,0.4) 65%,transparent 97%)",
}));

const SECONDARY_RAYS = Array.from({ length: 8 }, (_, i) => ({
  angle: i * 45 + 22.5,
  grad: "linear-gradient(90deg,transparent 8%,rgba(255,255,255,0.25) 42%,rgba(0,235,255,0.32) 50%,rgba(255,255,255,0.25) 58%,transparent 92%)",
}));

export default function Splash({ onComplete }: SplashProps) {
  const [logoReady, setLogoReady] = useState(false);
  const [textReady, setTextReady] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const tagline    = useMemo(() => getTagline(), []);
  const [statusText, setStatusText] = useState(tagline);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoReady(true), 260);
    const t2 = setTimeout(() => setTextReady(true), 820);
    const si = setInterval(() => setStatusText(getTagline()), 2000);

    const pi = setInterval(() => {
      setProgress(p => {
        if (p >= 100) return 100;
        const r = 100 - p;
        if (p < 40) return p + 2.4;
        if (p < 75) return p + Math.max(r * 0.13, 0.5);
        return p + Math.max(r * 0.07, 0.2);
      });
    }, 38);

    const done = setTimeout(() => onComplete(), 4600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(done); clearInterval(pi); clearInterval(si); };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center" style={{ background: "#07090D" }}>

      {/* ── Aurora base — large slow shifting hazes ─────────────────────── */}
      <motion.div className="absolute pointer-events-none" style={{
        left: "0%", top: "0%", width: "70vw", height: "70vw",
        background: "radial-gradient(ellipse, rgba(139,92,246,0.32) 0%, rgba(100,50,210,0.12) 42%, transparent 68%)",
        filter: "blur(90px)",
      }} animate={{ scale: [1, 1.14, 1], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />

      <motion.div className="absolute pointer-events-none" style={{
        right: "-5%", bottom: "0%", width: "60vw", height: "60vw",
        background: "radial-gradient(ellipse, rgba(0,200,255,0.26) 0%, rgba(0,140,220,0.10) 45%, transparent 70%)",
        filter: "blur(100px)",
      }} animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.95, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }} />

      <motion.div className="absolute pointer-events-none" style={{
        left: "50%", top: "-5%", width: "45vw", height: "45vw",
        background: "radial-gradient(ellipse, rgba(236,72,153,0.20) 0%, transparent 65%)",
        filter: "blur(80px)",
      }} animate={{ scale: [1, 1.22, 1], opacity: [0.38, 0.75, 0.38] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2.5 }} />

      <motion.div className="absolute pointer-events-none" style={{
        left: "20%", bottom: "5%", width: "40vw", height: "40vw",
        background: "radial-gradient(ellipse, rgba(255,170,60,0.14) 0%, transparent 65%)",
        filter: "blur(80px)",
      }} animate={{ scale: [1, 1.16, 1], opacity: [0.3, 0.65, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }} />

      {/* ── Atmospheric center glow ──────────────────────────────────────── */}
      <motion.div className="absolute pointer-events-none" style={{
        left: "50%", top: "50%",
        width: "50vw", height: "50vw",
        marginLeft: "-25vw", marginTop: "-25vw",
        background: "radial-gradient(ellipse, rgba(168,85,247,0.26) 0%, rgba(0,210,255,0.14) 45%, transparent 72%)",
        filter: "blur(50px)",
      }} animate={{ opacity: [0.45, 1, 0.45], scale: [0.88, 1.12, 0.88] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }} />

      {/* ── Animated contour wave lines ──────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.3, transform: "rotate(-10deg) scale(1.7)" }}>
        <motion.div className="absolute inset-0"
          animate={{ x: [0, 80, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="wv1" x="0" y="0" width="320" height="220" patternUnits="userSpaceOnUse">
                <path d="M0 55 Q80 22 160 55 T320 55"   fill="none" stroke="hsl(270,60%,58%)" strokeWidth="1.0" opacity="0.65"/>
                <path d="M0 110 Q80 77 160 110 T320 110" fill="none" stroke="hsl(190,90%,55%)" strokeWidth="0.7" opacity="0.5"/>
                <path d="M0 165 Q80 132 160 165 T320 165" fill="none" stroke="hsl(310,70%,60%)" strokeWidth="0.8" opacity="0.45"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#wv1)" />
          </svg>
        </motion.div>
        <motion.div className="absolute inset-0"
          animate={{ x: [0, -50, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="wv2" x="0" y="0" width="260" height="180" patternUnits="userSpaceOnUse">
                <path d="M0 45 Q65 18 130 45 T260 45"  fill="none" stroke="hsl(195,85%,58%)" strokeWidth="0.6" opacity="0.55"/>
                <path d="M0 95 Q65 68 130 95 T260 95"  fill="none" stroke="hsl(268,60%,55%)" strokeWidth="0.5" opacity="0.45"/>
                <path d="M0 145 Q65 118 130 145 T260 145" fill="none" stroke="hsl(320,70%,62%)" strokeWidth="0.65" opacity="0.5"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#wv2)" />
          </svg>
        </motion.div>
        <motion.div className="absolute inset-0"
          animate={{ x: [0, 30, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="wv3" x="0" y="0" width="380" height="260" patternUnits="userSpaceOnUse">
                <path d="M0 65 Q95 30 190 65 T380 65"   fill="none" stroke="hsl(30,90%,65%)" strokeWidth="0.5" opacity="0.35"/>
                <path d="M0 130 Q95 95 190 130 T380 130" fill="none" stroke="hsl(190,90%,55%)" strokeWidth="0.4" opacity="0.3"/>
                <path d="M0 195 Q95 160 190 195 T380 195" fill="none" stroke="hsl(270,65%,60%)" strokeWidth="0.55" opacity="0.4"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#wv3)" />
          </svg>
        </motion.div>
      </div>

      {/* ── Particle field ───────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {PARTICLES.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{ left: p.left, top: p.top, width: `${p.size}px`, height: `${p.size}px`, background: p.color, boxShadow: p.glow }}
            animate={{ y: [-p.dy, p.dy, -p.dy], x: [-p.dx, p.dx, -p.dx], opacity: p.opac, scale: p.scale }}
            transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          />
        ))}
      </div>

      {/* ── Diagonal light sweeps ─────────────────────────────────────────── */}
      {STREAKS.map((s, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: "220%", height: i % 2 === 0 ? "2.5px" : "1.5px",
            left: "-60%", top: s.top,
            background: `linear-gradient(90deg, transparent, ${s.c1}, ${s.c2}, ${s.c1}, transparent)`,
            transform: `rotate(${s.deg})`,
            filter: "blur(0.8px)",
          }}
          animate={{ opacity: [0, 1, 0], x: ["-20%", "20%"] }}
          transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
        />
      ))}

      {/* ── Sun streak / god ray system — centered behind logo ───────────── */}
      <div className="absolute pointer-events-none" style={{ left: "50%", top: "44%", transform: "translate(-50%,-50%)", zIndex: 5 }}>

        {/* Deep wide haze */}
        <motion.div className="absolute" style={{
          width: "780px", height: "780px", marginLeft: "-390px", marginTop: "-390px",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.46) 0%, rgba(0,210,255,0.22) 28%, rgba(168,85,247,0.08) 55%, transparent 72%)",
          filter: "blur(55px)",
        }} animate={{ opacity: [0.6, 1, 0.6], scale: [0.93, 1.07, 0.93] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }} />

        {/* Mid glow */}
        <motion.div className="absolute" style={{
          width: "400px", height: "400px", marginLeft: "-200px", marginTop: "-200px",
          background: "radial-gradient(ellipse, rgba(200,130,255,0.38) 0%, rgba(0,230,255,0.22) 40%, transparent 70%)",
          filter: "blur(32px)",
        }} animate={{ opacity: [0.55, 0.95, 0.55], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 3.1, repeat: Infinity, ease: "easeInOut", delay: 0.6 }} />

        {/* Bright core */}
        <motion.div className="absolute" style={{
          width: "240px", height: "240px", marginLeft: "-120px", marginTop: "-120px",
          background: "radial-gradient(circle, rgba(255,255,255,0.80) 0%, rgba(220,160,255,0.60) 18%, rgba(0,215,255,0.40) 42%, transparent 68%)",
          filter: "blur(16px)",
        }} animate={{ opacity: [0.7, 1, 0.7], scale: [0.86, 1.14, 0.86] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />

        {/* Hot point */}
        <motion.div className="absolute" style={{
          width: "70px", height: "70px", marginLeft: "-35px", marginTop: "-35px",
          background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(200,180,255,0.75) 38%, transparent 72%)",
          filter: "blur(5px)",
        }} animate={{ opacity: [0.75, 1, 0.75], scale: [0.88, 1.18, 0.88] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }} />

        {/* Pink accent flare */}
        <motion.div className="absolute" style={{
          width: "180px", height: "180px", marginLeft: "-90px", marginTop: "-90px",
          background: "radial-gradient(ellipse at 35% 40%, rgba(236,72,153,0.30) 0%, transparent 65%)",
          filter: "blur(22px)",
        }} animate={{ opacity: [0.4, 0.85, 0.4], rotate: [0, 30, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />

        {/* Amber warmth flare */}
        <motion.div className="absolute" style={{
          width: "160px", height: "160px", marginLeft: "-80px", marginTop: "-80px",
          background: "radial-gradient(ellipse at 65% 60%, rgba(255,190,60,0.22) 0%, transparent 65%)",
          filter: "blur(20px)",
        }} animate={{ opacity: [0.3, 0.7, 0.3], rotate: [0, -20, 0] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} />

        {/* Primary rotating spokes */}
        <motion.div className="absolute"
          style={{ width: "1000px", height: "1000px", marginLeft: "-500px", marginTop: "-500px" }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 32, repeat: Infinity, ease: "linear" }}>
          {PRIMARY_RAYS.map((r, i) => (
            <div key={i} className="absolute" style={{
              width: "100%", height: r.h,
              top: "50%", left: 0,
              marginTop: r.h === "2.5px" ? "-1.25px" : "-0.75px",
              transform: `rotate(${r.angle}deg)`,
              transformOrigin: "50% 50%",
              background: r.grad,
              filter: "blur(1px)",
            }} />
          ))}
        </motion.div>

        {/* Secondary counter-rotating spokes */}
        <motion.div className="absolute"
          style={{ width: "620px", height: "620px", marginLeft: "-310px", marginTop: "-310px" }}
          animate={{ rotate: [0, -360] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
          {SECONDARY_RAYS.map((r, i) => (
            <div key={i} className="absolute" style={{
              width: "100%", height: "1px",
              top: "50%", left: 0, marginTop: "-0.5px",
              transform: `rotate(${r.angle}deg)`,
              transformOrigin: "50% 50%",
              background: r.grad,
            }} />
          ))}
        </motion.div>

        {/* Horizontal lens flare */}
        <motion.div className="absolute" style={{
          width: "860px", height: "4px",
          marginLeft: "-430px", marginTop: "-2px",
          background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.18) 18%, rgba(255,255,255,0.40) 44%, rgba(0,225,255,0.50) 50%, rgba(255,255,255,0.40) 56%, rgba(168,85,247,0.18) 82%, transparent)",
          filter: "blur(1.8px)",
        }} animate={{ opacity: [0.45, 0.9, 0.45], scaleX: [0.94, 1.06, 0.94] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }} />

        {/* Vertical lens flare */}
        <motion.div className="absolute" style={{
          width: "4px", height: "700px",
          marginLeft: "-2px", marginTop: "-350px",
          background: "linear-gradient(180deg, transparent, rgba(0,225,255,0.14) 22%, rgba(255,255,255,0.30) 45%, rgba(168,85,247,0.38) 50%, rgba(255,255,255,0.30) 55%, rgba(0,225,255,0.14) 78%, transparent)",
          filter: "blur(1.8px)",
        }} animate={{ opacity: [0.3, 0.7, 0.3], scaleY: [0.92, 1.08, 0.92] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.2 }} />
      </div>

      {/* ── Vignette ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 82% 82% at 50% 50%, transparent 28%, rgba(7,9,13,0.92) 100%)",
      }} />

      {/* ── Logo + text content ───────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-7" style={{ zIndex: 10 }}>

        {/* Glass frost halo behind content */}
        <div className="absolute pointer-events-none rounded-[40px]" style={{
          inset: "-52px -80px",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          background: "radial-gradient(ellipse at 50% 32%, rgba(168,85,247,0.07) 0%, rgba(0,10,30,0.18) 100%)",
          border: "1px solid rgba(255,255,255,0.055)",
          boxShadow: "0 0 120px rgba(139,92,246,0.10), inset 0 1px 0 rgba(255,255,255,0.05)",
        }} />

        {/* Logo reveal */}
        <AnimatePresence>
          {logoReady && (
            <motion.div
              initial={{ opacity: 0, y: 12, filter: "blur(14px)" }}
              animate={{ opacity: 1, y: 0,  filter: "blur(0px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center"
            >
              {/* Outer rotating ring — violet */}
              <motion.div className="absolute rounded-full pointer-events-none" style={{
                width: "192px", height: "192px",
                top: "50%", left: "50%", marginLeft: "-96px", marginTop: "-96px",
                border: "1px solid rgba(168,85,247,0.32)",
                boxShadow: "0 0 45px rgba(168,85,247,0.20), inset 0 0 45px rgba(0,215,255,0.10)",
              }}
                animate={{ rotate: 360, opacity: [0.38, 0.88, 0.38] }}
                transition={{ rotate: { duration: 11, repeat: Infinity, ease: "linear" }, opacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } }} />

              {/* Inner ring — cyan */}
              <motion.div className="absolute rounded-full pointer-events-none" style={{
                width: "158px", height: "158px",
                top: "50%", left: "50%", marginLeft: "-79px", marginTop: "-79px",
                border: "1px solid rgba(0,215,255,0.25)",
                boxShadow: "0 0 25px rgba(0,215,255,0.15)",
              }}
                animate={{ rotate: -360, opacity: [0.28, 0.68, 0.28] }}
                transition={{ rotate: { duration: 17, repeat: Infinity, ease: "linear" }, opacity: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 } }} />

              {/* Outermost pulse ring — pink */}
              <motion.div className="absolute rounded-full pointer-events-none" style={{
                width: "230px", height: "230px",
                top: "50%", left: "50%", marginLeft: "-115px", marginTop: "-115px",
                border: "0.5px solid rgba(236,72,153,0.18)",
              }}
                animate={{ rotate: 360, opacity: [0.2, 0.5, 0.2], scale: [0.96, 1.04, 0.96] }}
                transition={{ rotate: { duration: 24, repeat: Infinity, ease: "linear" }, opacity: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }, scale: { duration: 5, repeat: Infinity, ease: "easeInOut" } }} />

              {/* Wide ambient halo */}
              <motion.div className="absolute -inset-20 rounded-full pointer-events-none" style={{
                background: "radial-gradient(ellipse, rgba(139,92,246,0.40) 0%, rgba(0,215,255,0.16) 38%, transparent 68%)",
                filter: "blur(22px)",
              }}
                animate={{ scale: [1, 1.30, 1], opacity: [0.50, 1, 0.50] }}
                transition={{ duration: 2.9, repeat: Infinity, ease: "easeInOut" }} />

              {/* Logo icon */}
              <motion.div className="relative"
                animate={{
                  filter: [
                    "drop-shadow(0 0 26px rgba(139,92,246,0.65)) drop-shadow(0 0 65px rgba(0,215,255,0.28))",
                    "drop-shadow(0 0 52px rgba(139,92,246,0.95)) drop-shadow(0 0 110px rgba(0,215,255,0.50)) drop-shadow(0 0 8px rgba(255,180,80,0.30))",
                    "drop-shadow(0 0 26px rgba(139,92,246,0.65)) drop-shadow(0 0 65px rgba(0,215,255,0.28))",
                  ],
                  y: [0, -5, 0],
                }}
                transition={{ duration: 2.9, repeat: Infinity, ease: "easeInOut" }}>
                {/* Shimmer sweep */}
                <div className="absolute inset-0 rounded-[22%] overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    animate={{ x: ["-100%", "160%"] }}
                    transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.0, ease: "easeInOut" }}
                  />
                </div>
                <img src={logoImg} alt="SwitchControl"
                  className="w-28 h-28 max-w-[112px] max-h-[112px] object-contain rounded-[22%]"
                  draggable={false}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Title + progress */}
        <AnimatePresence>
          {textReady && (
            <motion.div
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0,  filter: "blur(0px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-3"
            >
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Switch<span style={{
                  background: "linear-gradient(90deg, hsl(270,65%,70%), hsl(190,90%,64%), hsl(320,70%,72%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>Control</span>
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
                    transition={{ duration: 0.28 }}
                  >
                    {statusText}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Progress bar */}
              <motion.div
                className="mt-2 w-56"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.4 }}
              >
                <div className="h-[3px] bg-white/8 rounded-full overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, hsl(270,60%,60%), hsl(195,90%,58%), hsl(310,70%,65%), hsl(270,60%,60%))",
                      backgroundSize: "300% 100%",
                      boxShadow: "0 0 12px rgba(168,85,247,0.85), 0 0 26px rgba(0,215,255,0.45)",
                    }}
                    animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                  />
                  {/* Trailing spark */}
                  <div className="absolute top-0 h-full w-5 rounded-full pointer-events-none" style={{
                    left: `calc(${progress}% - 10px)`,
                    background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(0,220,255,0.65) 48%, transparent 82%)",
                    filter: "blur(2px)",
                  }} />
                </div>

                <div className="flex items-center justify-center gap-2 mt-3">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "hsl(190,90%,60%)", boxShadow: "0 0 6px rgba(0,215,255,0.9)" }}
                    animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
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
