import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { estimateBootTimeMs, fmtBootTime, getRecommendations } from "./startupUtils";
import type { BootApp } from "./startupUtils";
import { Rocket, RefreshCw, Play, Zap, Activity } from "lucide-react";
import { startupColor } from "@/lib/themeTokens";

// ── Animated amber orb — mirrors Cleaner's ScanOrb pattern in orange/amber ───

function BootOrb({ scanning }: { scanning: boolean }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 72, height: 72 }}>
      {/* Pulsing rings while scanning */}
      {scanning && [0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: startupColor.glow30 }}
          initial={{ width: 42, height: 42, opacity: 0.8 }}
          animate={{ width: 80, height: 80, opacity: 0 }}
          transition={{ duration: 2.0, delay: i * 0.65, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
      {/* Static ambient ring at rest */}
      {!scanning && (
        <div
          className="absolute rounded-full"
          style={{
            width: 76, height: 76,
            border: `1px solid ${startupColor.bg15}`,
            top: -2, left: -2,
          }}
        />
      )}
      {/* Core orb */}
      <motion.div
        className="relative z-10 w-[58px] h-[58px] rounded-full flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 32% 32%, ${startupColor.light}, ${startupColor.end} 60%, #7c2d12)`,
          boxShadow: scanning
            ? `0 0 30px ${startupColor.glow40}, 0 0 60px ${startupColor.glow20}`
            : `0 0 20px ${startupColor.glow30}`,
        }}
        animate={scanning ? {
          scale: [1, 1.07, 1],
          boxShadow: [
            `0 0 20px ${startupColor.glow30}`,
            `0 0 40px ${startupColor.glow40}`,
            `0 0 20px ${startupColor.glow30}`,
          ],
        } : {}}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Rocket className="w-6 h-6 text-white/90" />
      </motion.div>
    </div>
  );
}

// ── Active/Halted ratio ring (no historical sparkline data tracked in store) ──
// Spec says: use a real data source or a non-trend visual — ratio ring is real.

function RatioRing({ active, total }: { active: number; total: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? active / total : 0;
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 250);
    return () => clearTimeout(t);
  }, []);

  const color =
    pct > 0.75 ? "#f87171"   // too many active — red
    : pct > 0.45 ? "#fbbf24" // moderate — amber
    : "#4ade80";              // healthy — green

  return (
    <svg width={50} height={50} viewBox="0 0 50 50" style={{ overflow: "visible" }}>
      {/* Track */}
      <circle cx={25} cy={25} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5} />
      {/* Filled arc */}
      <circle
        cx={25} cy={25} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={drawn ? circ - pct * circ : circ}
        transform="rotate(-90 25 25)"
        style={{
          transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
          filter: `drop-shadow(0 0 3px ${color}80)`,
        }}
      />
      {/* Center % */}
      <text
        x={25} y={25}
        textAnchor="middle" dominantBaseline="central"
        fill={color}
        fontSize="9"
        fontWeight="700"
        fontFamily="monospace"
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  scanStatus: "idle" | "scanning" | "done";
  apps: BootApp[];
  onScan: () => void;
  onOptimize: () => void;
  onReview: () => void;
}

// ── StartupHero ───────────────────────────────────────────────────────────────

export function StartupHero({ scanStatus, apps, onScan, onOptimize, onReview }: Props) {
  const isScanning = scanStatus === "scanning";
  const hasScan    = scanStatus === "done";

  const bootTime     = estimateBootTimeMs(apps);
  const enabledCount = apps.filter(a =>  a.entry.enabled && !a.entry.broken).length;
  const disabledCount= apps.filter(a => !a.entry.enabled && !a.entry.broken).length;
  const brokenCount  = apps.filter(a =>  a.entry.broken).length;
  const totalCount   = apps.length;
  const recs         = getRecommendations(apps, 3);

  return (
    <motion.div
      layout
      className={cn(
        "relative w-full",
        isScanning && "min-h-[calc(100vh-8rem)] flex items-center justify-center",
      )}
      transition={{ layout: { duration: 0.62, ease: [0.22, 1, 0.36, 1] } }}
    >
    <motion.div
      layout
      animate={{ scale: isScanning ? 1.04 : 1 }}
      transition={{
        layout: { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
        scale: { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
      }}
      className={cn(
        "relative rounded-2xl overflow-hidden border w-full",
        isScanning && "max-w-2xl min-h-[11.5rem] -translate-y-12",
      )}
      style={{ borderColor: "rgba(255,255,255,0.06)", background: "#14181D" }}
    >
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-2/3 h-full"
          style={{ background: `linear-gradient(to left, ${startupColor.bg08}, transparent)` }} />
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-[80px]"
          style={{ background: startupColor.bg15 }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-[60px]"
          style={{ background: "rgba(251,191,36,0.06)" }} />
        {/* Subtle tech grid */}
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage: `linear-gradient(${startupColor.main} 1px, transparent 1px), linear-gradient(90deg, ${startupColor.main} 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <motion.div
        layout
        className={cn(
          "relative z-10 p-5 sm:p-6 flex flex-col lg:flex-row gap-6 lg:items-center justify-between",
          isScanning && "items-center justify-center text-center",
        )}
      >

        {/* Left: Orb + content */}
        <motion.div
          layout
          className={cn(
            "flex items-start gap-5",
            isScanning && "flex-col items-center text-center",
          )}
        >
          <BootOrb scanning={isScanning} />

          <div className="space-y-2.5 max-w-lg">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border"
              style={{
                borderColor: startupColor.border30,
                background:  startupColor.bg08,
                color:       startupColor.light,
              }}
            >
              <Activity className="size-2.5" />
              Boot Intelligence Engine
              {hasScan && (
                <span className="flex items-center gap-1 ml-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400">LIVE</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
              Startup Telemetry
            </h1>

            <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-md">
              {hasScan
                ? "Deep scan complete. Analyze process impact and trim dead weight to achieve sub-10 second boot times."
                : isScanning
                  ? "Mapping boot sequence, measuring impact, isolating bottlenecks…"
                  : "Engage the scanner to map the full boot sequence and identify performance bottlenecks."}
            </p>

            {/* CTA buttons */}
            <div className={cn(
              "flex flex-wrap items-center gap-3 pt-1",
              isScanning && "w-full justify-center",
            )}>
              <Button
                onClick={onScan}
                disabled={isScanning}
                className={cn(
                  "h-10 px-6 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border-0 shadow-lg",
                  isScanning && "cursor-not-allowed opacity-80"
                )}
                style={!isScanning ? {
                  background: `linear-gradient(135deg, ${startupColor.main}, ${startupColor.end})`,
                  boxShadow:  `0 4px 16px ${startupColor.glow30}`,
                  color: "#fff",
                } : {
                  background: startupColor.bg15,
                  border: `1px solid ${startupColor.border30}`,
                  color: startupColor.light,
                }}
              >
                {isScanning ? (
                  <span className="flex items-center gap-2.5">
                    <span
                      className="size-3.5 border-2 rounded-full animate-spin"
                      style={{ borderColor: `${startupColor.light}40`, borderTopColor: startupColor.light }}
                    />
                    Analyzing Sequence…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {hasScan ? <RefreshCw className="size-3.5" /> : <Play className="size-3.5" />}
                    {hasScan ? "Rerun Diagnostics" : "Initialize Scan"}
                  </span>
                )}
              </Button>

              {hasScan && recs.length > 0 && (
                <Button
                  onClick={onOptimize}
                  className="h-10 px-5 text-xs font-bold uppercase tracking-wider rounded-xl border-0 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all"
                >
                  <Zap className="size-3.5 mr-1.5" />
                  Auto-Tune ({recs.length})
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Right: stat boxes (appear after scan) */}
        <AnimatePresence>
          {hasScan && (
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-row lg:flex-col gap-3 shrink-0 lg:min-w-[168px]"
            >
              {/* Boot Time box — mirrors Cleaner's "LAST SCAN FOUND" box */}
              <div
                className="flex-1 lg:flex-none p-4 rounded-2xl backdrop-blur-md relative overflow-hidden"
                style={{
                  background:  "rgba(14,17,22,0.88)",
                  border:      `1px solid ${startupColor.border30}`,
                }}
              >
                <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-xl pointer-events-none"
                  style={{ background: startupColor.bg15 }} />
                <p className="text-[9px] text-muted-foreground/55 uppercase tracking-widest font-bold mb-1.5">
                  Est. Boot Time
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tabular-nums text-white">
                    {fmtBootTime(bootTime).replace("s", "")}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">sec</span>
                </div>
                <p className="text-[9px] font-medium mt-1.5 uppercase tracking-wider" style={{ color: startupColor.light + "99" }}>
                  {totalCount} entries detected
                </p>
              </div>

              {/* Active/Halted box — mirrors Cleaner's "SCAN TREND" box with ring indicator */}
              <div
                className="flex-1 lg:flex-none p-4 rounded-2xl backdrop-blur-md relative overflow-hidden"
                style={{
                  background:  "rgba(14,17,22,0.88)",
                  border:      "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-xl pointer-events-none bg-emerald-500/8" />
                <p className="text-[9px] text-muted-foreground/55 uppercase tracking-widest font-bold mb-2">
                  Status Split
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-2">
                    <div>
                      <div className="text-[9px] text-emerald-400/70 uppercase tracking-widest font-bold">Active</div>
                      <div className="text-xl font-black tabular-nums text-emerald-400">{enabledCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold">Halted</div>
                      <div className="text-lg font-black tabular-nums text-muted-foreground/55">{disabledCount}</div>
                    </div>
                  </div>
                  <RatioRing active={enabledCount} total={totalCount} />
                </div>
                {brokenCount > 0 && (
                  <p className="text-[9px] text-red-400/65 font-medium mt-1.5 uppercase tracking-wider">
                    {brokenCount} ghost {brokenCount === 1 ? "entry" : "entries"}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
    </motion.div>
  );
}
