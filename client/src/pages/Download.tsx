import { Link } from "wouter";
import { Download, Shield, CheckCircle, Monitor, Clock, Sparkles } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { brand } from "@/config/brand";
import { motion, useMotion } from "@/lib/motion";
import { useState, useEffect } from "react";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import { SectionGlow } from "@/components/website/WebsiteBackground";
import faviconImg from "@/assets/favicon.png";

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

        {/* ── Download card ───────────────────────────────────────────────── */}
        <div className="w-full flex flex-col items-center px-2">
          <div className="relative w-full max-w-lg">
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
