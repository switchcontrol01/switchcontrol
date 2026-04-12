import { Link } from "wouter";
import { Download, Shield, CheckCircle, Monitor, Clock, Sparkles, Zap, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { motion } from "framer-motion";
import { useState, useEffect, useRef, useMemo } from "react";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import faviconImg from "@/assets/favicon.png";

// ── Constants ─────────────────────────────────────────────────────────────────
// Target: Tuesday 14 April 2026 14:00 NZST (UTC+12) = 02:00 UTC
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

// ── Smooth animated number segment ───────────────────────────────────────────
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
    }, 320);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
      {/* Glass block */}
      <div style={{
        position: "relative",
        width: "clamp(72px,13vw,108px)",
        height: "clamp(80px,15vw,124px)",
        borderRadius: "16px",
        overflow: "hidden",
        background: "linear-gradient(160deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(139,92,246,0.28)",
        boxShadow: [
          "0 24px 64px rgba(0,0,0,0.65)",
          "inset 0 1px 0 rgba(255,255,255,0.10)",
          "inset 0 -1px 0 rgba(0,0,0,0.25)",
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
          background: "rgba(0,0,0,0.40)", zIndex: 3,
        }} />

        {/* Violet inner glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 100% 60% at 50% 0%,rgba(139,92,246,0.10) 0%,transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Exiting number (slides up + blurs out) */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: animating ? "transform 0.32s cubic-bezier(0.55,0,1,0.45),opacity 0.22s ease,filter 0.22s ease" : "none",
          transform: animating ? "translateY(-28%) scale(0.88)" : "translateY(0) scale(1)",
          opacity: animating ? 0 : 1,
          filter: animating ? "blur(6px)" : "blur(0px)",
          zIndex: 2,
        }}>
          <span style={{
            fontSize: "clamp(32px,6vw,52px)",
            fontWeight: 800,
            color: "rgba(255,255,255,0.96)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            textShadow: "0 2px 20px rgba(139,92,246,0.35)",
          }}>{cur}</span>
        </div>

        {/* Entering number (slides up from below) */}
        {animating && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "slideInUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
            zIndex: 2,
          }}>
            <span style={{
              fontSize: "clamp(32px,6vw,52px)",
              fontWeight: 800,
              color: "rgba(255,255,255,0.96)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              textShadow: "0 2px 20px rgba(139,92,246,0.35)",
            }}>{next}</span>
          </div>
        )}

        {/* Bottom ambient */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
          background: "linear-gradient(0deg,rgba(0,0,0,0.30),transparent)",
          pointerEvents: "none",
        }} />
      </div>

      {/* Label */}
      <span style={{
        fontSize: "clamp(9px,1.5vw,11px)",
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "rgba(192,155,255,0.50)",
      }}>{label}</span>
    </div>
  );
}

// ── Separator colon ───────────────────────────────────────────────────────────
function Colon() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "14px",
      alignItems: "center", justifyContent: "center",
      paddingBottom: "24px",
    }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          width: "5px", height: "5px", borderRadius: "50%",
          background: "rgba(139,92,246,0.65)",
          boxShadow: "0 0 8px 2px rgba(139,92,246,0.40)",
          animation: "colonPulse 1s step-end infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

// ── Ambient drifting particles ────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  x: 8 + (i * 6.5) % 84,
  startY: 20 + (i * 7) % 60,
  size: 1.5 + (i % 3) * 1,
  dur: 6 + (i % 5) * 2.4,
  delay: (i * 0.7) % 7,
  opacity: 0.15 + (i % 4) * 0.08,
  color: i % 3 === 0 ? "168,85,247" : i % 3 === 1 ? "103,232,249" : "255,255,255",
}));

// ── Patch notes card ──────────────────────────────────────────────────────────
interface PatchNotes {
  version: string; title: string; headline: string; date: string;
  changes: string[]; type: string;
}

function PatchNotesCard() {
  const [notes, setNotes] = useState<PatchNotes | null>(null);
  useEffect(() => {
    fetch("/patch-notes.json").then(r => r.json()).then(setNotes).catch(() => {});
  }, []);
  if (!notes) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, delay: 1.2, ease: SILK }}
      style={{
        width: "100%", maxWidth: "480px",
        borderRadius: "16px",
        padding: "20px 24px",
        background: "rgba(8,6,18,0.70)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Sparkles size={12} style={{ color: "rgba(192,155,255,0.70)" }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(192,155,255,0.65)" }}>
            What&apos;s New
          </span>
        </div>
        <span style={{
          fontSize: "10px", fontWeight: 500, padding: "2px 8px", borderRadius: "6px",
          background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.28)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>v{notes.version}</span>
      </div>
      <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.80)", marginBottom: "4px" }}>{notes.title}</p>
      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.36)", marginBottom: "12px", lineHeight: 1.5 }}>{notes.headline}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {notes.changes.slice(0, 3).map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <div style={{ marginTop: "5px", width: "4px", height: "4px", borderRadius: "50%", flexShrink: 0, background: "rgba(139,92,246,0.55)" }} />
            <span style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.40)", lineHeight: 1.45 }}>{c}</span>
          </div>
        ))}
        {notes.changes.length > 3 && (
          <span style={{ fontSize: "11px", paddingLeft: "12px", color: "rgba(255,255,255,0.22)" }}>
            +{notes.changes.length - 3} more improvements
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Main countdown component ──────────────────────────────────────────────────
function LaunchHero({ user }: { user: any }) {
  const [time, setTime] = useState(getTimeLeft);
  const shimmerRef = useRef(false);
  const launched = time.launched;

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  // Entrance stagger config
  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 24, filter: "blur(12px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: SILK },
  });

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: "clamp(24px,4vw,40px)", width: "100%", textAlign: "center",
    }}>

      {/* ── Eyebrow / headline ── */}
      <motion.div {...stagger(0)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "7px",
          padding: "5px 14px", borderRadius: "100px",
          background: "rgba(139,92,246,0.10)",
          border: "1px solid rgba(139,92,246,0.25)",
        }}>
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "rgba(139,92,246,0.9)",
            boxShadow: "0 0 8px 3px rgba(139,92,246,0.50)",
            animation: "livePulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "rgba(192,155,255,0.75)",
          }}>
            {launched ? "Now Available" : "Official Launch"}
          </span>
        </div>

        <h1 style={{
          fontSize: "clamp(26px,5vw,52px)",
          fontWeight: 800,
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          color: "rgba(255,255,255,0.97)",
          textShadow: "0 4px 40px rgba(139,92,246,0.25)",
          margin: 0,
        }}>
          {launched ? (
            <>SwitchControl is <span style={{ background: "linear-gradient(135deg,#a78bfa,#67e8f9)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>live</span></>
          ) : (
            <>SwitchControl launches <span style={{ background: "linear-gradient(135deg,#a78bfa,#67e8f9)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>in</span></>
          )}
        </h1>
      </motion.div>

      {/* ── Countdown hero (or LIVE state) ── */}
      <motion.div {...stagger(1)} style={{ width: "100%" }}>
        {launched ? (
          /* ── LAUNCHED STATE ── */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "20px",
          }}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: SILK }}
              style={{
                fontSize: "clamp(52px,12vw,96px)",
                lineHeight: 1,
                animation: "launchGlow 3s ease-in-out infinite",
              }}
            >
              🚀
            </motion.div>
            <p style={{
              fontSize: "clamp(20px,4vw,32px)", fontWeight: 700,
              color: "rgba(255,255,255,0.90)", letterSpacing: "-0.01em",
            }}>
              SwitchControl is now available!
            </p>
          </div>
        ) : (
          /* ── COUNTDOWN BLOCKS ── */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0px",
          }}>
            {/* Ambient glow behind countdown */}
            <div style={{
              position: "absolute",
              width: "clamp(320px,60vw,580px)",
              height: "clamp(120px,20vw,200px)",
              borderRadius: "50%",
              background: "radial-gradient(ellipse,rgba(139,92,246,0.18) 0%,rgba(103,232,249,0.06) 55%,transparent 75%)",
              filter: "blur(32px)",
              animation: "ambientBreathe 5s ease-in-out infinite",
              pointerEvents: "none",
              zIndex: 0,
            }} />

            {/* Digit row */}
            <div style={{
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              gap: "clamp(6px,2vw,14px)",
              position: "relative", zIndex: 1,
            }}>
              <CountBlock value={pad(time.d)} label="Days" />
              <Colon />
              <CountBlock value={pad(time.h)} label="Hours" />
              <Colon />
              <CountBlock value={pad(time.m)} label="Minutes" />
              <Colon />
              <CountBlock value={pad(time.s)} label="Seconds" />
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Release date line ── */}
      {!launched && (
        <motion.div {...stagger(2)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          <p style={{
            fontSize: "clamp(13px,2.5vw,17px)",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}>
            Releasing <strong style={{ color: "rgba(192,155,255,0.85)", fontWeight: 700 }}>Tuesday, April 14</strong> at{" "}
            <strong style={{ color: "rgba(192,155,255,0.85)", fontWeight: 700 }}>2:00 PM NZT</strong>
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.24)", fontWeight: 500 }}>
            First public release · Windows 10/11 · v1.0.0 Early Access
          </p>
        </motion.div>
      )}

      {/* ── Download card ── */}
      <motion.div {...stagger(3)} style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{
          borderRadius: "20px",
          overflow: "hidden",
          background: "linear-gradient(160deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.02) 100%)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(139,92,246,0.22)",
          boxShadow: [
            "0 32px 80px rgba(0,0,0,0.60)",
            "inset 0 1px 0 rgba(255,255,255,0.10)",
            "0 0 0 1px rgba(139,92,246,0.06)",
          ].join(","),
        }}>
          {/* Card header */}
          <div style={{
            padding: "28px 28px 20px",
            textAlign: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ position: "relative", display: "inline-block", marginBottom: "16px" }}>
              <div style={{
                position: "absolute", inset: "-16px",
                background: "radial-gradient(ellipse,rgba(139,92,246,0.35) 0%,transparent 70%)",
                filter: "blur(20px)",
                animation: "ambientBreathe 4s ease-in-out infinite",
              }} />
              <motion.img
                src={faviconImg}
                alt="SwitchControl"
                style={{
                  position: "relative",
                  width: "80px", height: "80px",
                  borderRadius: "22%",
                  objectFit: "contain",
                  animation: "logoFloat 4s ease-in-out infinite, logoGlow 3s ease-in-out infinite",
                }}
              />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <span style={{
                display: "inline-block",
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 10px", borderRadius: "100px",
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.30)",
                color: "rgba(192,155,255,0.80)",
                marginBottom: "10px",
              }}>v1.0.0 · Early Access</span>
            </div>

            <h2 style={{
              fontSize: "clamp(18px,3vw,22px)", fontWeight: 800,
              color: "rgba(255,255,255,0.97)", letterSpacing: "-0.015em",
              margin: "0 0 6px",
            }}>Download SwitchControl.exe</h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.42)", margin: 0 }}>
              {user?.firstName
                ? `Welcome back, ${user.firstName}! Get the desktop app.`
                : "Get the desktop app to start optimizing."}
            </p>
          </div>

          {/* Card body */}
          <div style={{ padding: "20px 28px 24px" }}>
            {/* Specs list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {[
                { icon: CheckCircle, color: "#34d399", text: "v1.0.0 (Early Access) · Latest build" },
                { icon: Monitor, color: "#a78bfa", text: "Windows Installer (.exe) · Windows 10/11 64-bit" },
                { icon: Shield, color: "#60a5fa", text: "Digitally signed · No bundled software" },
                { icon: Clock, color: "#fbbf24", text: "~350 MB · Installs in under 30 seconds" },
              ].map(({ icon: Icon, color, text }, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon size={14} style={{ color, flexShrink: 0 }} />
                  <span style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.48)" }}>{text}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <button
              onClick={() => alert("Download would start here. The installer is not yet available.")}
              data-testid="button-download-windows"
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: "12px",
                border: "none",
                cursor: "pointer",
                background: "linear-gradient(135deg,#7c3aed 0%,#6d28d9 40%,#4c1d95 100%)",
                boxShadow: "0 8px 32px rgba(109,40,217,0.50),inset 0 1px 0 rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                fontSize: "15px", fontWeight: 700, color: "#fff",
                letterSpacing: "0.01em",
                transition: "all 0.2s ease",
                position: "relative", overflow: "hidden",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = "translateY(-1px)";
                el.style.boxShadow = "0 12px 40px rgba(109,40,217,0.65),inset 0 1px 0 rgba(255,255,255,0.20)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "0 8px 32px rgba(109,40,217,0.50),inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
            >
              <Download size={16} />
              Download SwitchControl.exe
              <ArrowRight size={14} style={{ opacity: 0.70 }} />
            </button>

            {/* Legal */}
            <p style={{
              fontSize: "11px", textAlign: "center",
              color: "rgba(255,255,255,0.28)", marginTop: "12px",
            }}>
              By downloading, you agree to our{" "}
              <Link href="/terms" style={{ color: "rgba(139,92,246,0.80)", textDecoration: "none" }}>Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" style={{ color: "rgba(139,92,246,0.80)", textDecoration: "none" }}>Privacy Policy</Link>.
            </p>

            {/* Install steps */}
            <div style={{
              marginTop: "20px",
              paddingTop: "20px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: "12px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Installation
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
                {[
                  { n: "1", label: "Download", icon: Download },
                  { n: "2", label: "Install", icon: Monitor },
                  { n: "3", label: "Launch", icon: Zap },
                  { n: "4", label: "Optimize", icon: CheckCircle },
                ].map(({ n, label, icon: Icon }, i) => (
                  <div key={i} data-testid={`step-install-${n}`} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                    padding: "10px 4px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}>
                    <Icon size={14} style={{ color: "rgba(139,92,246,0.70)" }} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.50)" }}>{n}</span>
                    <span style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.30)", textAlign: "center" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Patch notes ── */}
      <motion.div {...stagger(4)} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <PatchNotesCard />
      </motion.div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const { user } = useAuth();

  return (
    <WebsiteShell variant="inner" bgVariant="download" showFooter={false}>
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(30%) scale(0.92); opacity: 0; filter: blur(6px); }
          to   { transform: translateY(0)   scale(1);    opacity: 1; filter: blur(0px); }
        }
        @keyframes colonPulse {
          0%, 49% { opacity: 0.9; }
          50%, 100% { opacity: 0.25; }
        }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 6px 2px rgba(139,92,246,0.45); opacity: 1; }
          50%       { box-shadow: 0 0 14px 5px rgba(139,92,246,0.65); opacity: 0.80; }
        }
        @keyframes ambientBreathe {
          0%, 100% { opacity: 0.70; transform: scale(1); }
          50%       { opacity: 1.00; transform: scale(1.06); }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes logoGlow {
          0%, 100% { filter: drop-shadow(0 0 14px rgba(139,92,246,0.50)); }
          50%       { filter: drop-shadow(0 0 26px rgba(139,92,246,0.75)); }
        }
        @keyframes launchGlow {
          0%, 100% { filter: drop-shadow(0 0 16px rgba(139,92,246,0.60)); }
          50%       { filter: drop-shadow(0 0 32px rgba(139,92,246,0.90)); }
        }
        @keyframes particleDrift {
          0%   { opacity: 0;    transform: translateY(0px)   scale(1); }
          10%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { opacity: 0;    transform: translateY(-90px) scale(0.3); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ambientBreathe { 0%,100% { opacity:0.80; transform:scale(1); } }
          @keyframes logoFloat { 0%,100% { transform:translateY(0); } }
          @keyframes livePulse { 0%,100% { box-shadow:0 0 6px 2px rgba(139,92,246,0.45); } }
        }
      `}</style>

      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "clamp(80px,12vw,120px) clamp(16px,5vw,40px) 80px",
        minHeight: "calc(100vh - 80px)",
        position: "relative",
        overflowX: "hidden",
      }}>

        {/* ── Ambient background atmosphere ── */}
        <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
          {/* Central violet bloom */}
          <div style={{
            position: "absolute",
            top: "20%", left: "50%", transform: "translateX(-50%)",
            width: "clamp(400px,70vw,800px)",
            height: "clamp(300px,50vw,550px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(109,40,217,0.22) 0%,rgba(139,92,246,0.08) 45%,transparent 72%)",
            filter: "blur(48px)",
            animation: "ambientBreathe 7s ease-in-out infinite",
          }} />
          {/* Cyan accent — lower right */}
          <div style={{
            position: "absolute",
            bottom: "15%", right: "10%",
            width: "clamp(200px,35vw,420px)",
            height: "clamp(150px,25vw,300px)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse,rgba(6,182,212,0.12) 0%,transparent 70%)",
            filter: "blur(56px)",
            animation: "ambientBreathe 9s ease-in-out infinite 2s",
          }} />
          {/* Particle drift */}
          {PARTICLES.map(p => (
            <div key={p.id} style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.startY}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: `rgba(${p.color},${p.opacity})`,
              boxShadow: `0 0 ${p.size * 3}px rgba(${p.color},${p.opacity * 0.7})`,
              animation: `particleDrift ${p.dur}s ease-out ${p.delay}s infinite`,
            }} />
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <LaunchHero user={user} />
        </div>
      </main>
    </WebsiteShell>
  );
}
