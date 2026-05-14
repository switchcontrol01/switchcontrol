import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { ExternalLink, Download, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { WebsiteBackground } from "@/components/website/WebsiteBackground";
import { useMotion } from "@/lib/motionTokens";
import { SUCCESS_TIMING } from "@/lib/premiumMotionTokens";


type PageState = "loading" | "success" | "error";
type AnimPhase = "idle" | "stroke" | "check" | "glow" | "confetti" | "text" | "buttons" | "ready";

function useAnimSequence(trigger: boolean, reducedMotion: boolean) {
  const [phase, setPhase] = useState<AnimPhase>("idle");

  useEffect(() => {
    if (!trigger) return;
    if (reducedMotion) {
      setPhase("ready");
      return;
    }
    setPhase("stroke");
    const t1 = setTimeout(() => setPhase("check"),    SUCCESS_TIMING.checkMs);
    const t2 = setTimeout(() => setPhase("glow"),     SUCCESS_TIMING.glowMs);
    const t3 = setTimeout(() => setPhase("confetti"), SUCCESS_TIMING.confettiMs);
    const t4 = setTimeout(() => setPhase("text"),     SUCCESS_TIMING.textMs);
    const t5 = setTimeout(() => setPhase("buttons"),  SUCCESS_TIMING.buttonsMs);
    const t6 = setTimeout(() => setPhase("ready"),    SUCCESS_TIMING.readyMs);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6); };
  }, [trigger, reducedMotion]);

  return phase;
}

const PHASE_ORDER: AnimPhase[] = ["idle", "stroke", "check", "glow", "confetti", "text", "buttons", "ready"];

function ConfettiBurst({ active }: { active: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 300,
      y: -(100 + Math.random() * 200),
      rotate: Math.random() * 720 - 360,
      scale: 0.4 + Math.random() * 0.8,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.6,
      hue: [260, 280, 300, 330, 40, 50][Math.floor(Math.random() * 6)],
      type: Math.random() > 0.5 ? 'circle' : 'rect',
      size: 3 + Math.random() * 4,
    })),
  []);

  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute left-1/2 top-1/2"
          style={{
            width: p.size,
            height: p.type === 'rect' ? p.size * 1.5 : p.size,
            borderRadius: p.type === 'circle' ? '50%' : '1px',
            background: `hsl(${p.hue}, 80%, 65%)`,
            animation: `confettiFall ${p.duration}s cubic-bezier(0.22, 1, 0.36, 1) ${p.delay}s forwards`,
            '--cx': `${p.x}px`,
            '--cy': `${p.y}px`,
            '--cr': `${p.rotate}deg`,
          } as any}
        />
      ))}
    </div>
  );
}

function CheckAnimation({ phase }: { phase: AnimPhase }) {
  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const showStroke = phaseIndex >= 1;
  const showCheck = phaseIndex >= 2;
  const showGlow = phaseIndex >= 3;

  return (
    <div className="relative w-24 h-24 mx-auto mb-8">
      {showGlow && (
        <>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(168,132,255,0.35) 0%, transparent 70%)",
              animation: "pGlowPulse 2s ease-in-out infinite",
              transform: "scale(2.2)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 60%)",
              animation: "pGlowPulse 2.5s ease-in-out 0.3s infinite",
              transform: "scale(3)",
            }}
          />
        </>
      )}

      <svg viewBox="0 0 96 96" className="w-24 h-24 relative z-10">
        <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(168,132,255,0.15)" strokeWidth="1.5" />
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="url(#pStrokeGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={264}
          strokeDashoffset={showStroke ? 0 : 264}
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <path
          d="M 30 50 L 42 62 L 66 36"
          fill="none"
          stroke={showCheck ? "rgba(168,132,255,1)" : "transparent"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60"
          strokeDashoffset={showCheck ? 0 : 60}
          style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.2s" }}
        />
        <defs>
          <linearGradient id="pStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a884ff" />
            <stop offset="50%" stopColor="#c49bff" />
            <stop offset="100%" stopColor="#d4a8ff" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function FloatingParticles() {
  return null;
}

function LaunchButton({ onClick }: { onClick: () => void }) {
  const [launching, setLaunching] = useState(false);

  const handleClick = useCallback(() => {
    if (launching) return;
    onClick();
    setLaunching(true);
  }, [onClick, launching]);

  return (
    <button
      onClick={handleClick}
      disabled={launching}
      data-testid="button-open-app"
      className="group relative w-full h-14 rounded-xl border border-purple-500/30 bg-white/[0.03] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-purple-400/50 hover:bg-white/[0.05] disabled:pointer-events-none"
      style={{
        boxShadow: launching
          ? "0 0 40px rgba(168,132,255,0.4), inset 0 0 20px rgba(168,132,255,0.1)"
          : "0 0 20px rgba(168,132,255,0.08), inset 0 0 10px rgba(168,132,255,0.03)",
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(168,132,255,0.06) 45%, rgba(168,132,255,0.12) 50%, rgba(168,132,255,0.06) 55%, transparent 60%)",
          animation: "pShineSweep 3s ease-in-out infinite",
        }}
      />

      <div className="relative z-10 flex items-center justify-center gap-2.5 text-white/90 font-medium tracking-wide">
        {launching ? (
          <>
            <div className="size-4 border-2 border-purple-300/60 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ animation: "pFadeInUp 0.2s ease-out" }}>
              Launching desktop client…
            </span>
          </>
        ) : (
          <>
            <ExternalLink className="size-4 text-purple-300/80 transition-transform duration-300 group-hover:translate-x-0.5" />
            <span className="text-sm">Open SwitchControl</span>
          </>
        )}
      </div>
    </button>
  );
}

export default function PremiumSuccess() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { prefersReducedMotion: reducedMotion } = useMotion();
  const animPhase = useAnimSequence(status === "success", reducedMotion);

  const phaseIndex = PHASE_ORDER.indexOf(animPhase);
  const showConfetti = phaseIndex >= 4;
  const showText = phaseIndex >= 5;
  const showButtons = phaseIndex >= 6;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");

    if (!sessionId) {
      setStatus("error");
      setError("No session ID found");
      return;
    }

    const startTime = Date.now();
    const MIN_LOADING_MS = SUCCESS_TIMING.minLoadingMs;

    fetch(`/api/stripe/session?session_id=${sessionId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        setTimeout(() => {
          if (data.payment_status === "paid") {
            setStatus("success");
            queryClient.invalidateQueries({ queryKey: ["/api/user/premium-status"] });
            queryClient.invalidateQueries({ queryKey: ["/api/me"] });
          } else {
            setStatus("error");
            setError("Payment not completed");
          }
        }, remaining);
      })
      .catch(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        setTimeout(() => {
          setStatus("error");
          setError("Failed to verify payment");
        }, remaining);
      });
  }, [navigate, queryClient]);

  const handleOpenApp = useCallback(() => {
    window.location.href = `switchcontrol://auth/callback?premium_activated=true&source=web&ts=${Date.now()}`;
  }, []);

  return (
    <div className="fixed inset-0 bg-[hsl(260,25%,4%)] flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes pGlowPulse {
          0%, 100% { opacity: 0.6; transform: scale(2); }
          50% { opacity: 1; transform: scale(2.2); }
        }
        @keyframes pShineSweep {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pFadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pLoadingPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes confettiFall {
          0% { transform: translate(0, 0) rotate(0deg) scale(0); opacity: 1; }
          30% { opacity: 1; }
          100% { transform: translate(var(--cx), var(--cy)) rotate(var(--cr)) scale(1); opacity: 0; }
        }
        @keyframes glowBorderRotate {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <WebsiteBackground variant="success" />

      <div className="relative z-10 w-full max-w-md px-6">
        {status === "loading" && (
          <div className="text-center" style={{ animation: "gentleFloat 3s ease-in-out infinite" }}>
            <div className="relative w-16 h-16 mx-auto mb-8">
              <svg viewBox="0 0 64 64" className="w-16 h-16">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(168,132,255,0.1)" strokeWidth="1.5" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="rgba(168,132,255,0.5)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="40 136"
                  transform="rotate(-90 32 32)"
                  className="animate-spin"
                  style={{ animationDuration: "1.2s" }}
                />
              </svg>
            </div>
            <p
              className="text-sm text-white/40 tracking-widest uppercase"
              style={{ letterSpacing: "0.2em", animation: "pLoadingPulse 2s ease-in-out infinite" }}
            >
              Verifying payment
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="relative">
            <div
              className="absolute -inset-px rounded-2xl pointer-events-none"
              style={{
                background: showText
                  ? "linear-gradient(90deg, rgba(139,92,246,0.4), rgba(168,132,255,0.6), rgba(6,182,212,0.4), rgba(139,92,246,0.4))"
                  : "transparent",
                backgroundSize: "200% 100%",
                animation: showText ? "glowBorderRotate 3s linear infinite" : "none",
                opacity: showText ? 1 : 0,
                transition: "opacity 0.6s ease",
                filter: "blur(1px)",
              }}
            />

            <div
              className="relative rounded-2xl bg-[#0a0812]/90 backdrop-blur-xl p-8 text-center border border-purple-500/10"
              style={{
                animation: showText ? "gentleFloat 4s ease-in-out infinite" : "none",
                boxShadow: showText
                  ? "0 0 60px -10px rgba(139,92,246,0.15), 0 0 30px -5px rgba(168,132,255,0.1)"
                  : "none",
              }}
            >
              <ConfettiBurst active={showConfetti} />

              <CheckAnimation phase={animPhase} />

              <div
                style={{
                  opacity: showText ? 1 : 0,
                  transform: showText ? "translateY(0)" : "translateY(12px)",
                  transition: "all 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <p
                  className="text-xs tracking-widest uppercase mb-3 font-semibold"
                  style={{
                    letterSpacing: "0.25em",
                    background: "linear-gradient(90deg, rgba(168,132,255,0.8), rgba(139,92,246,1), rgba(6,182,212,0.8))",
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Premium Activated
                </p>
                <h1 className="text-2xl font-bold text-white/90 mb-2 tracking-tight">
                  System Upgraded
                </h1>
                <p className="text-sm text-white/35 leading-relaxed max-w-xs mx-auto">
                  Your SwitchControl system has been upgraded. All premium optimizations are now unlocked.
                </p>
              </div>

              <div className="mt-3 flex items-center justify-center gap-4">
                {["Power Plan", "BIOS Advisor", "Priority Support"].map((feat, i) => (
                  <div
                    key={feat}
                    className="flex items-center gap-1.5 text-[11px] text-white/30"
                    style={{
                      opacity: showText ? 1 : 0,
                      transform: showText ? "translateY(0)" : "translateY(8px)",
                      transition: `all 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${0.1 + i * 0.08}s`,
                    }}
                  >
                    <Check className="size-3 text-purple-400/60" />
                    {feat}
                  </div>
                ))}
              </div>

              <div
                className="mt-8 space-y-3"
                style={{
                  opacity: showButtons ? 1 : 0,
                  transform: showButtons ? "translateY(0)" : "translateY(16px)",
                  transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s",
                }}
              >
                <LaunchButton onClick={handleOpenApp} />

                <button
                  onClick={() => navigate("/download")}
                  className="w-full h-11 rounded-lg border border-white/[0.06] bg-transparent text-white/30 text-xs tracking-wider uppercase transition-all duration-300 hover:text-white/50 hover:border-[#2A313A]0 flex items-center justify-center gap-2"
                  data-testid="button-goto-download"
                >
                  <Download className="size-3.5" />
                  Download App First
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <svg viewBox="0 0 80 80" className="w-20 h-20">
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth="1.5" />
                <path d="M 28 28 L 52 52 M 52 28 L 28 52" stroke="rgba(239,68,68,0.7)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-red-400/50 tracking-widest uppercase mb-3" style={{ letterSpacing: "0.2em" }}>
              Verification Failed
            </p>
            <p className="text-sm text-white/40 mb-8 max-w-xs mx-auto">{error}</p>
            <button
              onClick={() => navigate("/pricing")}
              className="h-11 px-8 rounded-lg border border-white/[0.08] text-white/40 text-xs tracking-wider uppercase transition-all duration-300 hover:text-white/60 hover:border-[#2A313A]5"
              data-testid="button-back-pricing"
            >
              Back to pricing
            </button>
          </div>
        )}
      </div>

      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-white/10 tracking-widest uppercase"
        style={{ letterSpacing: "0.3em" }}
      >
        SwitchControl
      </div>
    </div>
  );
}
