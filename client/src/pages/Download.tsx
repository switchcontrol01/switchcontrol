import { Link } from "wouter";
import { Download, Shield, CheckCircle, Monitor, Clock, Sparkles, Zap, ArrowRight, Rocket } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { motion } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import faviconImg from "@/assets/favicon.png";

// ── Constants ─────────────────────────────────────────────────────────────────
const LAUNCH_UTC = new Date("2026-04-14T02:00:00Z").getTime();
const SILK = [0.22, 1, 0.36, 1] as const;

function getTimeLeft() {
  const diff = Math.max(0, LAUNCH_UTC - Date.now());
  const totalSecs = Math.floor(diff / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return { d, h, m, s, launched: diff === 0 };
}

function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Animated flip digit block — UNCHANGED visual style ────────────────────────
function CountBlock({ value, label }: { value: string; label: string }) {
  const [cur, setCur] = useState(value);
  const [next, setNext] = useState(value);
  const [animating, setAnimating] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    setNext(value);
    setAnimating(true);
    const t = setTimeout(() => {
      setCur(value);
      setAnimating(false);
      prevRef.current = value;
    }, 280);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "9px" }}>
      <div style={{
        position: "relative",
        width: "clamp(94px,9.5vw,126px)",
        height: "clamp(108px,11.5vw,148px)",
        borderRadius: "18px",
        overflow: "hidden",
        background: "linear-gradient(160deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(139,92,246,0.28)",
        boxShadow: [
          "0 16px 48px rgba(0,0,0,0.60)",
          "inset 0 1px 0 rgba(255,255,255,0.10)",
          "inset 0 -1px 0 rgba(0,0,0,0.22)",
          "0 0 0 1px rgba(139,92,246,0.08)",
        ].join(","),
      }}>
        {/* Top highlight */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.20),transparent)",
        }} />
        {/* Center divider */}
        <div style={{
          position: "absolute", top: "50%", left: "8px", right: "8px", height: "1px",
          background: "rgba(0,0,0,0.38)", zIndex: 3,
        }} />
        {/* Violet inner glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 100% 55% at 50% 0%,rgba(139,92,246,0.12) 0%,transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Exiting number */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: animating ? "transform 0.28s cubic-bezier(0.55,0,1,0.45),opacity 0.20s ease,filter 0.20s ease" : "none",
          transform: animating ? "translateY(-26%) scale(0.88)" : "translateY(0) scale(1)",
          opacity: animating ? 0 : 1,
          filter: animating ? "blur(5px)" : "blur(0px)",
          zIndex: 2,
        }}>
          <span style={{
            fontSize: "clamp(42px,5.8vw,66px)",
            fontWeight: 800, color: "rgba(255,255,255,0.96)",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
            lineHeight: 1, textShadow: "0 2px 24px rgba(139,92,246,0.45)",
          }}>{cur}</span>
        </div>
        {/* Entering number */}
        {animating && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "slideInUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
            zIndex: 2,
          }}>
            <span style={{
              fontSize: "clamp(42px,5.8vw,66px)",
              fontWeight: 800, color: "rgba(255,255,255,0.96)",
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
              lineHeight: 1, textShadow: "0 2px 18px rgba(139,92,246,0.35)",
            }}>{next}</span>
          </div>
        )}
        {/* Bottom ambient */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
          background: "linear-gradient(0deg,rgba(0,0,0,0.28),transparent)",
          pointerEvents: "none",
        }} />
      </div>
      <span style={{
        fontSize: "10px", fontWeight: 700, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "rgba(192,155,255,0.52)",
      }}>{label}</span>
    </div>
  );
}

// ── Separator colon — UNCHANGED ───────────────────────────────────────────────
function Colon() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "14px",
      alignItems: "center", justifyContent: "center",
      paddingBottom: "22px",
    }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "rgba(139,92,246,0.70)",
          boxShadow: "0 0 10px 3px rgba(139,92,246,0.45)",
          animation: "colonPulse 1s step-end infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

// ── Seconds progress bar ──────────────────────────────────────────────────────
function SecondsBar({ s }: { s: number }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "5px" }}>
      <div style={{
        width: "100%", height: "2px", borderRadius: "2px",
        background: "rgba(255,255,255,0.06)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: "2px",
          background: "linear-gradient(90deg,#8b5cf6,#06b6d4)",
          width: `${(s / 59) * 100}%`,
          transition: "width 0.95s linear",
          boxShadow: "0 0 6px rgba(139,92,246,0.55)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }}>
          {pad(s)}s
        </span>
      </div>
    </div>
  );
}

// ── Ambient particles — full viewport distribution ─────────────────────────────
const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: 3 + ((i * 29 + i * i * 3) % 93),
  startY: (i * 3.4 + (i % 7) * 5.2) % 97,
  size: 1.2 + (i % 4) * 0.65,
  dur: 9 + (i % 6) * 2.5,
  delay: (i * 0.71) % 9,
  opacity: 0.09 + (i % 5) * 0.045,
  color: i % 3 === 0 ? "168,85,247" : i % 3 === 1 ? "103,232,249" : "255,255,255",
}));

// ── Patch notes card ──────────────────────────────────────────────────────────
interface PatchNotes { version: string; title: string; headline: string; date: string; changes: string[]; type: string; }

function PatchNotesCard() {
  const [notes, setNotes] = useState<PatchNotes | null>(null);
  useEffect(() => { fetch("/patch-notes.json").then(r => r.json()).then(setNotes).catch(() => {}); }, []);
  if (!notes) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.75, delay: 1.0, ease: SILK }}
      style={{
        width: "100%", maxWidth: "900px",
        borderRadius: "14px", padding: "16px 22px",
        background: "rgba(8,6,18,0.65)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.30),inset 0 1px 0 rgba(255,255,255,0.04)",
        display: "flex", alignItems: "flex-start", gap: "24px", flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        <Sparkles size={11} style={{ color: "rgba(192,155,255,0.65)" }} />
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(192,155,255,0.60)" }}>
          What&apos;s New
        </span>
        <span style={{
          fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "5px", marginLeft: "4px",
          background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.26)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>v{notes.version}</span>
      </div>
      <div style={{ flex: 1, minWidth: "200px" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 600, color: "rgba(255,255,255,0.75)", margin: "0 0 3px" }}>{notes.title}</p>
        <p style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.34)", margin: 0, lineHeight: 1.45 }}>{notes.headline}</p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
        {notes.changes.slice(0, 3).map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "3px", height: "3px", borderRadius: "50%", flexShrink: 0, background: "rgba(139,92,246,0.55)" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)" }}>{c}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const { user } = useAuth();
  const [time, setTime] = useState(getTimeLeft);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [sceneReady, setSceneReady] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  useEffect(() => {
    const t = setTimeout(() => setSceneReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const launched = time.launched;

  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 20, filter: "blur(10px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.85, delay: 0.1 + i * 0.11, ease: SILK },
  });

  return (
    <WebsiteShell variant="inner" bgVariant="download" showFooter={false}>
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(28%) scale(0.90); opacity: 0; filter: blur(5px); }
          to   { transform: translateY(0)   scale(1);    opacity: 1; filter: blur(0px); }
        }
        @keyframes colonPulse {
          0%, 49% { opacity: 0.9; }
          50%, 100% { opacity: 0.22; }
        }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 6px 2px rgba(139,92,246,0.45); }
          50%       { box-shadow: 0 0 14px 5px rgba(139,92,246,0.65); }
        }
        @keyframes ambientBreathe {
          0%, 100% { opacity: 0.70; transform: scale(1); }
          50%       { opacity: 1.00; transform: scale(1.07); }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes logoGlow {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(139,92,246,0.45)); }
          50%       { filter: drop-shadow(0 0 22px rgba(139,92,246,0.70)); }
        }
        @keyframes rocketBob {
          0%, 100% { transform: translateY(0) rotate(-45deg); }
          50%       { transform: translateY(-2px) rotate(-45deg); }
        }
        @keyframes particleDrift {
          0%   { opacity: 0;    transform: translateY(0px)   scale(1); }
          10%  { opacity: 1; }
          80%  { opacity: 0.5; }
          100% { opacity: 0;    transform: translateY(-80px) scale(0.3); }
        }
        @keyframes launchPop {
          0%   { transform: scale(0.80); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes sunStreakSweep {
          0%   { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
        }
        @keyframes topoFlow {
          0%, 100% { transform: translateX(0px) translateY(0px); }
          33%       { transform: translateX(-10px) translateY(4px); }
          66%       { transform: translateX(8px) translateY(-5px); }
        }
        @keyframes topoFlow2 {
          0%, 100% { transform: translateX(0px) translateY(0px); }
          33%       { transform: translateX(12px) translateY(-3px); }
          66%       { transform: translateX(-7px) translateY(6px); }
        }
        @keyframes blobDrift1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(-18px, 14px) scale(1.04); }
        }
        @keyframes blobDrift2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(14px, -12px) scale(1.06); }
        }
        @keyframes blobDrift3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(-10px, 16px) scale(0.97); }
        }
      `}</style>

      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(56px,7vh,80px) clamp(16px,4vw,36px) 36px",
        minHeight: "calc(100vh - 80px)",
        position: "relative",
        overflowX: "hidden",
        gap: "clamp(16px,2.5vh,24px)",
      }}>

        {/* ── Background atmosphere — full-scene layered system ── */}
        <div aria-hidden style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          opacity: sceneReady ? 1 : 0,
          transition: "opacity 1.2s ease",
        }}>

          {/* Layer 1: Primary center glow — mouse parallax */}
          <div style={{
            position: "absolute", top: "8%", left: "50%",
            width: "clamp(700px,90vw,1300px)", height: "clamp(420px,58vw,820px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(109,40,217,0.30) 0%,rgba(139,92,246,0.10) 42%,transparent 70%)",
            filter: "blur(56px)",
            transform: `translate(calc(-50% + ${(mouse.x - 0.5) * 18}px), ${(mouse.y - 0.5) * 12}px)`,
            transition: "transform 0.9s ease-out",
            animation: "ambientBreathe 9s ease-in-out infinite",
          }} />

          {/* Layer 2: Secondary offset glow bottom-right — mouse parallax */}
          <div style={{
            position: "absolute", bottom: "6%", right: "4%",
            width: "clamp(260px,36vw,500px)", height: "clamp(160px,24vw,320px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(6,182,212,0.14) 0%,rgba(103,232,249,0.05) 55%,transparent 75%)",
            filter: "blur(52px)",
            transform: `translate(${(mouse.x - 0.5) * -14}px, ${(mouse.y - 0.5) * -10}px)`,
            transition: "transform 1.1s ease-out",
            animation: "blobDrift2 14s ease-in-out infinite",
          }} />

          {/* Layer 3: Upper-left ghost glow — mouse parallax */}
          <div style={{
            position: "absolute", top: "5%", left: "2%",
            width: "clamp(200px,28vw,400px)", height: "clamp(150px,22vw,300px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(139,92,246,0.10) 0%,transparent 70%)",
            filter: "blur(60px)",
            transform: `translate(${(mouse.x - 0.5) * 22}px, ${(mouse.y - 0.5) * 16}px)`,
            transition: "transform 1.3s ease-out",
            animation: "blobDrift3 18s ease-in-out infinite",
          }} />

          {/* Layer 4: Lower mid glow — fills dead lower zone */}
          <div style={{
            position: "absolute", bottom: "22%", left: "50%",
            width: "clamp(400px,55vw,800px)", height: "clamp(200px,28vw,400px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(88,28,220,0.12) 0%,rgba(139,92,246,0.04) 55%,transparent 75%)",
            filter: "blur(70px)",
            transform: `translate(-50%, ${(mouse.y - 0.5) * 8}px)`,
            transition: "transform 1.0s ease-out",
            animation: "blobDrift1 20s ease-in-out infinite 4s",
          }} />

          {/* Layer 5a: Sun-streak wide diffuse base */}
          <div style={{
            position: "absolute", top: "-10%", left: "-30%",
            width: "70%", height: "120%",
            background: "linear-gradient(108deg, transparent 0%, rgba(139,92,246,0.10) 30%, rgba(103,232,249,0.13) 55%, rgba(139,92,246,0.10) 80%, transparent 100%)",
            filter: "blur(48px)",
            animation: "sunStreakSweep 16s ease-in-out 1s infinite",
          }} />
          {/* Layer 5b: Sun-streak tight bright core */}
          <div style={{
            position: "absolute", top: "5%", left: "-25%",
            width: "40%", height: "90%",
            background: "linear-gradient(108deg, transparent 0%, rgba(167,139,250,0.16) 35%, rgba(103,232,249,0.19) 55%, rgba(167,139,250,0.16) 75%, transparent 100%)",
            filter: "blur(22px)",
            animation: "sunStreakSweep 16s ease-in-out 1s infinite",
          }} />

          {/* Layer 6: Topology / network SVG lines — staged in after 0.6s */}
          <svg
            viewBox="0 0 1440 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            style={{
              position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
              opacity: sceneReady ? 1 : 0,
              transition: "opacity 1.8s ease 0.6s",
              animation: "topoFlow 28s ease-in-out infinite",
            }}
          >
            <defs>
              <linearGradient id="dlGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                <stop offset="18%" stopColor="#8b5cf6" stopOpacity="0.28" />
                <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.42" />
                <stop offset="82%" stopColor="#8b5cf6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dlGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6d28d9" stopOpacity="0" />
                <stop offset="22%" stopColor="#6d28d9" stopOpacity="0.18" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.26" />
                <stop offset="78%" stopColor="#6d28d9" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dlGrad3" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
                <stop offset="25%" stopColor="#7c3aed" stopOpacity="0.14" />
                <stop offset="55%" stopColor="#a78bfa" stopOpacity="0.20" />
                <stop offset="80%" stopColor="#7c3aed" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dlGrad4" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                <stop offset="30%" stopColor="#8b5cf6" stopOpacity="0.10" />
                <stop offset="60%" stopColor="#67e8f9" stopOpacity="0.16" />
                <stop offset="85%" stopColor="#8b5cf6" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Line at ~18% viewport height */}
            <path
              d="M0 162 Q120 148 240 162 T480 155 T720 168 T960 152 T1200 160 T1440 157"
              stroke="url(#dlGrad1)" strokeWidth="1" fill="none" strokeLinecap="round"
            />
            {/* Line at ~38% viewport height */}
            <path
              d="M0 342 Q100 330 200 342 T400 336 T600 348 T800 334 T1000 344 T1200 338 T1440 341"
              stroke="url(#dlGrad2)" strokeWidth="0.8" fill="none" strokeLinecap="round"
            />
            {/* Line at ~60% viewport height */}
            <path
              d="M0 540 Q90 528 180 540 T360 533 T540 547 T720 532 T900 542 T1080 535 T1260 540 T1440 537"
              stroke="url(#dlGrad3)" strokeWidth="0.7" fill="none" strokeLinecap="round"
            />
            {/* Line at ~80% viewport height */}
            <path
              d="M0 720 Q110 712 220 720 T440 715 T660 724 T880 714 T1100 720 T1320 717 T1440 719"
              stroke="url(#dlGrad4)" strokeWidth="0.6" fill="none" strokeLinecap="round"
            />
            {/* Secondary faint lines for depth */}
            <path
              d="M0 260 Q150 252 300 260 T600 255 T900 262 T1200 257 T1440 260"
              stroke="url(#dlGrad2)" strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.6"
            />
            <path
              d="M0 460 Q130 452 260 460 T520 454 T780 463 T1040 455 T1300 461 T1440 459"
              stroke="url(#dlGrad3)" strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.55"
            />
            <path
              d="M0 640 Q100 634 200 640 T400 635 T600 642 T800 636 T1000 641 T1200 637 T1440 640"
              stroke="url(#dlGrad4)" strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.5"
            />
          </svg>

          {/* Second topology layer — drifts opposite direction */}
          <svg
            viewBox="0 0 1440 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            style={{
              position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
              opacity: sceneReady ? 0.7 : 0,
              transition: "opacity 2.2s ease 0.9s",
              animation: "topoFlow2 34s ease-in-out infinite",
            }}
          >
            <defs>
              <linearGradient id="dlGrad5" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
                <stop offset="30%" stopColor="#a78bfa" stopOpacity="0.12" />
                <stop offset="65%" stopColor="#67e8f9" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 200 Q180 190 360 200 T720 194 T1080 202 T1440 198"
              stroke="url(#dlGrad5)" strokeWidth="0.6" fill="none" strokeLinecap="round"
            />
            <path
              d="M0 400 Q160 392 320 400 T640 394 T960 402 T1280 396 T1440 400"
              stroke="url(#dlGrad5)" strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.8"
            />
            <path
              d="M0 600 Q140 592 280 600 T560 595 T840 603 T1120 597 T1440 600"
              stroke="url(#dlGrad5)" strokeWidth="0.45" fill="none" strokeLinecap="round" opacity="0.65"
            />
            <path
              d="M0 800 Q120 793 240 800 T480 795 T720 803 T960 797 T1200 801 T1440 799"
              stroke="url(#dlGrad5)" strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.5"
            />
          </svg>

          {/* Layer 7: Particles — full viewport */}
          <div style={{
            position: "absolute", inset: 0,
            opacity: sceneReady ? 1 : 0,
            transition: "opacity 2.5s ease 0.4s",
          }}>
            {PARTICLES.map(p => (
              <div key={p.id} style={{
                position: "absolute", left: `${p.x}%`, top: `${p.startY}%`,
                width: p.size, height: p.size, borderRadius: "50%",
                background: `rgba(${p.color},${p.opacity})`,
                boxShadow: `0 0 ${p.size * 3.5}px rgba(${p.color},${p.opacity * 0.7})`,
                animation: `particleDrift ${p.dur}s ease-out ${p.delay}s infinite`,
              }} />
            ))}
          </div>

        </div>

        {/* ── Main hero — two columns on desktop, stack on mobile ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            position: "relative", zIndex: 1,
            width: "100%", maxWidth: "1020px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "clamp(20px,3.5vw,44px)",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >

          {/* ── LEFT: Headline + Countdown + Date ── */}
          <div style={{
            flex: "1 1 380px",
            minWidth: "320px",
            display: "flex", flexDirection: "column",
            alignItems: "flex-start",
            gap: "clamp(10px,1.8vh,16px)",
          }}>

            {/* Eyebrow pill */}
            <motion.div {...stagger(0)}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "7px",
                padding: "5px 14px", borderRadius: "100px",
                background: "rgba(139,92,246,0.10)",
                border: "1px solid rgba(139,92,246,0.26)",
              }}>
                {launched ? (
                  <Rocket size={11} style={{ color: "rgba(192,155,255,0.80)", animation: "rocketBob 2s ease-in-out infinite" }} />
                ) : (
                  <div style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "rgba(139,92,246,0.90)",
                    boxShadow: "0 0 8px 3px rgba(139,92,246,0.48)",
                    animation: "livePulse 2s ease-in-out infinite",
                  }} />
                )}
                <span style={{
                  fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "rgba(192,155,255,0.75)",
                }}>
                  {launched ? "Now Available" : "Official Launch"}
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.div {...stagger(1)}>
              <h1 style={{
                fontSize: "clamp(40px,5.2vw,66px)",
                fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05,
                color: "rgba(255,255,255,0.97)",
                textShadow: "0 4px 52px rgba(139,92,246,0.34)",
                margin: 0,
              }}>
                {launched ? (
                  <>SwitchControl is{" "}
                    <span style={{ background: "linear-gradient(135deg,#a78bfa,#67e8f9)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>live</span>
                  </>
                ) : (
                  <>SwitchControl{" "}
                    <span style={{ background: "linear-gradient(135deg,#a78bfa,#67e8f9)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>launches in</span>
                  </>
                )}
              </h1>
            </motion.div>

            {/* Countdown blocks (or launched rocket) */}
            <motion.div {...stagger(2)} style={{ width: "100%" }}>
              {launched ? (
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <span style={{ fontSize: "clamp(40px,7vw,64px)", lineHeight: 1, animation: "logoFloat 3s ease-in-out infinite" }}>🚀</span>
                  <p style={{ fontSize: "clamp(18px,3vw,26px)", fontWeight: 700, color: "rgba(255,255,255,0.88)", margin: 0 }}>
                    We&apos;re live!
                  </p>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  {/* Glow bloom behind countdown */}
                  <div style={{
                    position: "absolute",
                    top: "50%", left: "50%",
                    transform: "translate(-50%,-50%)",
                    width: "clamp(340px,55vw,520px)", height: "clamp(100px,16vw,160px)",
                    borderRadius: "50%",
                    background: "radial-gradient(ellipse,rgba(139,92,246,0.26) 0%,rgba(103,232,249,0.08) 55%,transparent 78%)",
                    filter: "blur(28px)",
                    animation: "ambientBreathe 4.5s ease-in-out infinite",
                    pointerEvents: "none",
                  }} />
                  <div style={{
                    position: "relative",
                    display: "flex", alignItems: "flex-end",
                    gap: "clamp(5px,1.2vw,10px)",
                  }}>
                    <CountBlock value={pad(time.d)} label="Days" />
                    <Colon />
                    <CountBlock value={pad(time.h)} label="Hours" />
                    <Colon />
                    <CountBlock value={pad(time.m)} label="Min" />
                    <Colon />
                    <CountBlock value={pad(time.s)} label="Sec" />
                  </div>
                  {/* Seconds progress bar */}
                  <div style={{ marginTop: "10px", maxWidth: "340px" }}>
                    <SecondsBar s={time.s} />
                  </div>
                </div>
              )}
            </motion.div>

            {/* Release date */}
            {!launched && (
              <motion.div {...stagger(3)}>
                <p style={{
                  fontSize: "clamp(12px,1.8vw,15px)", color: "rgba(255,255,255,0.50)",
                  fontWeight: 500, letterSpacing: "0.01em", margin: 0, lineHeight: 1.5,
                }}>
                  Releasing{" "}
                  <strong style={{ color: "rgba(192,155,255,0.82)", fontWeight: 700 }}>Tuesday, April 14</strong>
                  {" "}at{" "}
                  <strong style={{ color: "rgba(192,155,255,0.82)", fontWeight: 700 }}>2:00 PM NZT</strong>
                </p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)", fontWeight: 500, margin: "4px 0 0" }}>
                  First public release · Windows 10/11 · v1.0.0 Early Access
                </p>
              </motion.div>
            )}
          </div>

          {/* ── RIGHT: Download card ── */}
          <motion.div
            {...stagger(2)}
            style={{ flex: "1 1 370px", minWidth: "350px", maxWidth: "500px" }}
          >
            <div style={{
              borderRadius: "20px",
              overflow: "hidden",
              background: "linear-gradient(160deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.02) 100%)",
              backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(139,92,246,0.32)",
              boxShadow: [
                "0 28px 72px rgba(0,0,0,0.60)",
                "inset 0 1px 0 rgba(255,255,255,0.12)",
                "0 0 0 1px rgba(139,92,246,0.10)",
                "0 0 60px rgba(109,40,217,0.14)",
              ].join(","),
            }}>
              {/* Card header — compact inline logo + title */}
              <div style={{
                padding: "24px 26px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: "18px",
              }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    position: "absolute", inset: "-10px",
                    background: "radial-gradient(ellipse,rgba(139,92,246,0.30) 0%,transparent 70%)",
                    filter: "blur(14px)", animation: "ambientBreathe 4s ease-in-out infinite",
                  }} />
                  <img
                    src={faviconImg}
                    alt="SwitchControl"
                    style={{
                      position: "relative",
                      width: "72px", height: "72px",
                      borderRadius: "22%", objectFit: "contain",
                      animation: "logoFloat 4s ease-in-out infinite, logoGlow 3s ease-in-out infinite",
                    }}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: "4px" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", padding: "2px 8px", borderRadius: "100px",
                      background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.28)",
                      color: "rgba(192,155,255,0.80)",
                    }}>v1.0.0 · Early Access</span>
                  </div>
                  <h2 style={{
                    fontSize: "clamp(17px,2.4vw,20px)", fontWeight: 800,
                    color: "rgba(255,255,255,0.97)", letterSpacing: "-0.015em", margin: 0,
                  }}>SwitchControl.exe</h2>
                  <p style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.38)", margin: "2px 0 0" }}>
                    {user?.firstName ? `Welcome, ${user.firstName}!` : "Windows desktop app"}
                  </p>
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: "20px 26px 24px" }}>
                {/* Spec rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  {[
                    { icon: CheckCircle, color: "#34d399", text: "Latest build · Digitally signed" },
                    { icon: Monitor, color: "#a78bfa", text: "Windows 10/11 64-bit · .exe installer" },
                    { icon: Clock, color: "#fbbf24", text: "~350 MB · Under 30 seconds" },
                  ].map(({ icon: Icon, color, text }, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                      <Icon size={13} style={{ color, flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.44)" }}>{text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => alert("Download would start here. The installer is not yet available.")}
                  data-testid="button-download-windows"
                  style={{
                    width: "100%", padding: "15px 20px", borderRadius: "12px",
                    border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg,#7c3aed 0%,#6d28d9 40%,#4c1d95 100%)",
                    boxShadow: "0 10px 34px rgba(109,40,217,0.56),inset 0 1px 0 rgba(255,255,255,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                    fontSize: "15px", fontWeight: 700, color: "#fff", letterSpacing: "0.01em",
                    transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(-2px)";
                    el.style.boxShadow = "0 16px 44px rgba(109,40,217,0.68),inset 0 1px 0 rgba(255,255,255,0.22)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "0 10px 34px rgba(109,40,217,0.56),inset 0 1px 0 rgba(255,255,255,0.18)";
                  }}
                >
                  <Download size={16} />
                  Download SwitchControl.exe
                  <ArrowRight size={14} style={{ opacity: 0.70 }} />
                </button>

                {/* Legal */}
                <p style={{
                  fontSize: "10.5px", textAlign: "center",
                  color: "rgba(255,255,255,0.25)", marginTop: "10px",
                }}>
                  By downloading you agree to our{" "}
                  <Link href="/terms" style={{ color: "rgba(139,92,246,0.75)", textDecoration: "none" }}>Terms</Link>
                  {" "}&amp;{" "}
                  <Link href="/privacy" style={{ color: "rgba(139,92,246,0.75)", textDecoration: "none" }}>Privacy Policy</Link>.
                </p>

                {/* Install steps — compact */}
                <div style={{
                  marginTop: "14px", paddingTop: "14px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px",
                }}>
                  {[
                    { n: "1", label: "Download", icon: Download },
                    { n: "2", label: "Install", icon: Monitor },
                    { n: "3", label: "Launch", icon: Zap },
                    { n: "4", label: "Optimize", icon: CheckCircle },
                  ].map(({ n, label, icon: Icon }, i) => (
                    <div key={i} data-testid={`step-install-${n}`} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                      padding: "8px 2px", borderRadius: "9px",
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      <Icon size={12} style={{ color: "rgba(139,92,246,0.65)" }} />
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>{n}</span>
                      <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.28)", textAlign: "center" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Patch notes — below the fold ── */}
        <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", justifyContent: "center" }}>
          <PatchNotesCard />
        </div>

      </main>
    </WebsiteShell>
  );
}
