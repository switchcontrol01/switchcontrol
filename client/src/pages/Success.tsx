import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";


type ConfirmState = "loading" | "success" | "error";
type AnimPhase = "idle" | "stroke" | "check" | "glow" | "text" | "buttons" | "ready";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useAnimSequence(trigger: boolean, reducedMotion: boolean) {
  const [phase, setPhase] = useState<AnimPhase>("idle");

  useEffect(() => {
    if (!trigger) return;
    if (reducedMotion) {
      setPhase("ready");
      return;
    }
    setPhase("stroke");
    const t1 = setTimeout(() => setPhase("check"), 1200);
    const t2 = setTimeout(() => {
      setPhase("glow");
    }, 1700);
    const t3 = setTimeout(() => setPhase("text"), 2100);
    const t4 = setTimeout(() => setPhase("buttons"), 2600);
    const t5 = setTimeout(() => setPhase("ready"), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [trigger, reducedMotion]);

  return phase;
}

function GridOverlay() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ opacity: 0.03 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 1 + Math.random() * 2,
    delay: Math.random() * 8,
    duration: 6 + Math.random() * 6,
    opacity: 0.15 + Math.random() * 0.25,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: `rgba(168, 132, 255, ${p.opacity})`,
            animation: `particleFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function CheckAnimation({ phase }: { phase: AnimPhase }) {
  const phaseIndex = ["idle", "stroke", "check", "glow", "text", "buttons", "ready"].indexOf(phase);
  const showStroke = phaseIndex >= 1;
  const showCheck = phaseIndex >= 2;
  const showGlow = phaseIndex >= 3;

  return (
    <div className="relative w-24 h-24 mx-auto mb-8">
      {showGlow && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(168,132,255,0.3) 0%, transparent 70%)",
            animation: "glowPulse 2s ease-in-out infinite",
            transform: "scale(2)",
          }}
        />
      )}

      <svg viewBox="0 0 96 96" className="w-24 h-24 relative z-10">
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="rgba(168,132,255,0.15)"
          strokeWidth="1.5"
        />

        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="url(#strokeGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={264}
          strokeDashoffset={showStroke ? 0 : 264}
          transform="rotate(-90 48 48)"
          style={{
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
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
          style={{
            transition: "stroke-dashoffset 0.4s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.2s",
          }}
        />

        <defs>
          <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a884ff" />
            <stop offset="50%" stopColor="#c49bff" />
            <stop offset="100%" stopColor="#d4a8ff" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function LaunchButton({ onClick }: { onClick: () => void }) {
  const [launching, setLaunching] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (launching) return;
    onClick();
    setLaunching(true);
  }, [onClick, launching]);

  return (
    <button
      ref={btnRef}
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
          animation: "shineSweep 3s ease-in-out infinite",
        }}
      />

      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: "linear-gradient(135deg, rgba(168,132,255,0.05), transparent, rgba(168,132,255,0.05))",
        }}
      />

      <div className="relative z-10 flex items-center justify-center gap-2.5 text-white/90 font-medium tracking-wide">
        {launching ? (
          <>
            <div className="size-4 border-2 border-purple-300/60 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ animation: "fadeInUp 0.2s ease-out" }}>
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

export default function Success() {
  const { refetch } = useAuth();
  const [state, setState] = useState<ConfirmState>("loading");
  const [error, setError] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const animPhase = useAnimSequence(state === "success", reducedMotion);

  const phaseIndex = ["idle", "stroke", "check", "glow", "text", "buttons", "ready"].indexOf(animPhase);
  const showText = phaseIndex >= 4;
  const showButtons = phaseIndex >= 5;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setState("error");
      setError("No session ID provided");
      return;
    }

    const confirmPayment = async () => {
      try {
        const response = await fetch("/api/stripe/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await response.json();

        if (data.ok) {
          await refetch();
          await new Promise((resolve) => setTimeout(resolve, 300));
          await refetch();
          setState("success");
        } else if (data.error === "user_mismatch") {
          setState("error");
          setError("Session mismatch. Please log in with the account you used for checkout.");
        } else {
          setState("error");
          setError(data.error || "Failed to confirm payment");
        }
      } catch (err: any) {
        setState("error");
        setError(err.message || "Network error");
      }
    };

    confirmPayment();
  }, [refetch]);

  const handleOpenApp = useCallback(() => {
    console.log("[PremiumFlow] Opening desktop app via protocol deep-link");
    window.location.href = `switchcontrol://auth/success?premium_activated=true&source=web&ts=${Date.now()}`;
  }, []);

  return (
    <div className="fixed inset-0 bg-[hsl(260,20%,4%)] flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes meshDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -20px) scale(1.05); }
          50% { transform: translate(-20px, 15px) scale(0.98); }
          75% { transform: translate(15px, 25px) scale(1.02); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.2; }
          50% { transform: translateY(-30px) scale(1.3); opacity: 0.5; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; transform: scale(2); }
          50% { opacity: 1; transform: scale(2.2); }
        }
        @keyframes shineSweep {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathingBorder {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="fixed inset-0">
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 500,
            height: 500,
            left: "20%",
            top: "30%",
            background: "radial-gradient(circle, rgba(100,60,180,0.08), transparent 70%)",
            animation: "meshDrift 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 400,
            height: 400,
            right: "15%",
            bottom: "20%",
            background: "radial-gradient(circle, rgba(80,50,160,0.06), transparent 70%)",
            animation: "meshDrift 16s ease-in-out 3s infinite reverse",
          }}
        />
      </div>

      <GridOverlay />
      <FloatingParticles />

      <div className="relative z-10 w-full max-w-md px-6">
        {state === "loading" && (
          <div className="text-center">
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
              style={{ letterSpacing: "0.2em", animation: "loadingPulse 2s ease-in-out infinite" }}
            >
              Verifying payment
            </p>
          </div>
        )}

        {state === "success" && (
          <div className="text-center">
            <CheckAnimation phase={animPhase} />

            <div
              style={{
                opacity: showText ? 1 : 0,
                transform: showText ? "translateY(0)" : "translateY(12px)",
                transition: "all 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <p
                className="text-xs text-purple-300/60 tracking-widest uppercase mb-3"
                style={{ letterSpacing: "0.25em" }}
              >
                Premium Activated
              </p>
              <h1 className="text-2xl font-semibold text-white/90 mb-2 tracking-tight">
                System Upgraded
              </h1>
              <p className="text-sm text-white/35 leading-relaxed max-w-xs mx-auto">
                Your SwitchControl system has been upgraded. All premium optimizations are now unlocked.
              </p>
            </div>

            <div
              className="mt-10 space-y-3"
              style={{
                opacity: showButtons ? 1 : 0,
                transform: showButtons ? "translateY(0)" : "translateY(16px)",
                transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s",
              }}
            >
              <LaunchButton onClick={handleOpenApp} />

              <Link href="/download">
                <button
                  className="w-full h-11 rounded-lg border border-white/[0.06] bg-transparent text-white/30 text-xs tracking-wider uppercase transition-all duration-300 hover:text-white/50 hover:border-white/10 flex items-center justify-center gap-2"
                  data-testid="button-goto-download"
                >
                  <Download className="size-3.5" />
                  Download App First
                </button>
              </Link>
            </div>
          </div>
        )}

        {state === "error" && (
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
            <Link href="/pricing">
              <button
                className="h-11 px-8 rounded-lg border border-white/[0.08] text-white/40 text-xs tracking-wider uppercase transition-all duration-300 hover:text-white/60 hover:border-white/15"
                data-testid="button-back-to-pricing"
              >
                Back to pricing
              </button>
            </Link>
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
