/**
 * UpdateModal — premium animated update experience.
 *
 * States (in order):
 *   available   → user prompted to download
 *   downloading → animated gradient progress bar + reactive glow
 *   installing  → spinner, ready to restart
 *   restarting  → success glow, then app closes
 *
 * Renders into document.body via portal so it floats above everything.
 * All state transitions use AnimatePresence mode="wait" — no hard cuts.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, RefreshCw, X, CheckCircle2,
  ArrowUpCircle, AlertTriangle, Zap, Cpu, Shield,
} from "lucide-react";
import { useUpdater } from "@/hooks/use-updater";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtSpeed(bps: number): string {
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

// ── motion presets ────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;

const slide = {
  initial:  { opacity: 0, y: 10, scale: 0.98 },
  animate:  { opacity: 1, y: 0,  scale: 1    },
  exit:     { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.28, ease: EASE },
};

// ── urgency palette ───────────────────────────────────────────────────────────

const PALETTE = {
  critical: {
    label:      "Critical Update",
    badgeBg:    "rgba(239,68,68,0.12)",
    badgeBorder:"rgba(239,68,68,0.28)",
    badgeText:  "rgba(252,165,165,0.95)",
    icon:       <AlertTriangle className="size-5 text-red-400" />,
    glow:       "shadow-[0_0_80px_rgba(239,68,68,0.18)]",
    bar:        "from-red-500 via-rose-400 to-orange-400",
    accent:     "#f87171",
    accentCls:  "text-red-400",
    orbitColor: "rgba(239,68,68,0.5)",
    canDismiss: false,
  },
  recommended: {
    label:      "Recommended Update",
    badgeBg:    "rgba(245,158,11,0.12)",
    badgeBorder:"rgba(245,158,11,0.28)",
    badgeText:  "rgba(252,211,77,0.95)",
    icon:       <ArrowUpCircle className="size-5 text-amber-400" />,
    glow:       "shadow-[0_0_80px_rgba(245,158,11,0.15)]",
    bar:        "from-amber-500 via-yellow-400 to-orange-400",
    accent:     "#fbbf24",
    accentCls:  "text-amber-400",
    orbitColor: "rgba(245,158,11,0.5)",
    canDismiss: true,
  },
  normal: {
    label:      "New Build Ready",
    badgeBg:    "rgba(0,212,255,0.12)",
    badgeBorder:"rgba(0,212,255,0.30)",
    badgeText:  "rgba(196,181,253,0.95)",
    icon:       <ArrowUpCircle className="size-5 text-violet-400" />,
    glow:       "shadow-[0_0_80px_rgba(109,40,217,0.20)]",
    bar:        "from-violet-500 via-purple-400 to-cyan-400",
    accent:     "#33E0FF",
    accentCls:  "text-violet-400",
    orbitColor: "rgba(0,212,255,0.55)",
    canDismiss: true,
  },
} as const;

// ── hero orbital ring ─────────────────────────────────────────────────────────

function OrbitalRing({ version, orbitColor }: { version: string; orbitColor: string }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 108, height: 108 }}>
      {/* Outer soft aura */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: `radial-gradient(circle, ${orbitColor} 0%, transparent 70%)`, filter: "blur(18px)" }}
      />

      {/* Rotating orbital track */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{
          border: "1px solid transparent",
          borderTopColor: orbitColor,
          borderRightColor: "transparent",
          borderBottomColor: "transparent",
          borderLeftColor: "transparent",
          filter: `drop-shadow(0 0 6px ${orbitColor})`,
        }}
      />

      {/* Counter-rotating inner arc */}
      <motion.div
        className="absolute rounded-full"
        animate={{ rotate: -360 }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        style={{
          inset: 10,
          border: "1px solid transparent",
          borderBottomColor: orbitColor.replace("0.55", "0.30").replace("0.50", "0.25"),
          borderLeftColor: "transparent",
          borderTopColor: "transparent",
          borderRightColor: "transparent",
        }}
      />

      {/* Orbital dot — travels the ring */}
      <motion.div
        className="absolute"
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{ inset: 0 }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: 5, height: 5,
            top: 2, left: "50%", transform: "translateX(-50%)",
            background: orbitColor.replace("0.55", "1").replace("0.50", "1"),
            boxShadow: `0 0 8px 3px ${orbitColor}`,
          }}
        />
      </motion.div>

      {/* Center chip */}
      <motion.div
        className="relative z-10 flex flex-col items-center justify-center rounded-full"
        animate={{ boxShadow: [`0 0 0px ${orbitColor}`, `0 0 22px ${orbitColor}`, `0 0 0px ${orbitColor}`] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 72, height: 72,
          background: "linear-gradient(145deg, rgba(18,14,30,0.95) 0%, rgba(10,8,20,0.98) 100%)",
          border: `1px solid ${orbitColor.replace("0.55", "0.25").replace("0.50", "0.22")}`,
        }}
      >
        <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.30)" }}>Ver</span>
        <span className="text-base font-bold leading-none" style={{ color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          {version}
        </span>
      </motion.div>
    </div>
  );
}

// ── improvement tags ──────────────────────────────────────────────────────────

const IMPROVEMENTS = [
  { icon: <Cpu className="size-3" />, label: "Lower CPU usage" },
  { icon: <Zap className="size-3" />,  label: "Tweak reliability" },
  { icon: <Shield className="size-3" />, label: "Stability fixes" },
];

function ImprovementTags({ accentColor }: { accentColor: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {IMPROVEMENTS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.55 + i * 0.08, ease: EASE }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ color: accentColor }}>{item.icon}</span>
          <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>{item.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── sub-views ─────────────────────────────────────────────────────────────────

type ModalPhase = "available" | "downloading" | "installing" | "restarting";

interface AvailableProps {
  version: string;
  urgency: keyof typeof PALETTE;
  onDownload: () => void;
  onDismiss: () => void;
}

function AvailableView({ version, urgency, onDownload, onDismiss }: AvailableProps) {
  const p = PALETTE[urgency] ?? PALETTE.normal;

  return (
    <motion.div key="available" {...slide}>
      {/* Top edge shimmer line — animated sweep */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden rounded-t-2xl">
        <motion.div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${p.accent} 50%, transparent 100%)` }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${p.accent} 50%, transparent 100%)` }}
        />
      </div>

      <div className="px-7 pt-8 pb-7 flex flex-col items-center gap-5">

        {/* Dismiss button — top right absolute */}
        {p.canDismiss && (
          <motion.button
            onClick={onDismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.12, backgroundColor: "rgba(255,255,255,0.06)" }}
            whileTap={{ scale: 0.9 }}
            className="absolute top-4 right-4 size-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            data-testid="button-updater-dismiss"
            aria-label="Dismiss update"
          >
            <X className="size-3.5" style={{ color: "rgba(255,255,255,0.35)" }} />
          </motion.button>
        )}

        {/* Hero orbital ring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <OrbitalRing version={version} orbitColor={p.orbitColor} />
        </motion.div>

        {/* Badge + headline + subtext */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.18, ease: EASE }}
            className="relative overflow-hidden flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{
              background: p.badgeBg,
              border: `1px solid ${p.badgeBorder}`,
            }}
          >
            {/* Badge shimmer sweep */}
            <motion.div
              className="absolute inset-0"
              animate={{ x: ["-120%", "220%"] }}
              transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 3.2, ease: "easeInOut" }}
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)" }}
            />
            <div
              className="relative size-1.5 rounded-full"
              style={{ background: p.accent, boxShadow: `0 0 6px 2px ${p.accent}40` }}
            />
            <span
              className="relative text-[10px] font-bold tracking-widest uppercase"
              style={{ color: p.badgeText }}
            >
              {p.label}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.26, ease: EASE }}
            className="text-[20px] font-bold leading-tight"
            style={{ color: "rgba(255,255,255,0.95)", letterSpacing: "-0.025em" }}
          >
            Switchcontrol{" "}
            <span style={{ color: p.accent }}>{version}</span>{" "}
            is here
          </motion.h2>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.34, ease: EASE }}
            className="text-[13px] leading-relaxed max-w-[280px]"
            style={{ color: "rgba(255,255,255,0.38)" }}
          >
            Optimized, stable, and ready to apply.
          </motion.p>
        </div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.48, delay: 0.44, ease: EASE }}
          className="w-full origin-left"
          style={{ height: "1px", background: "rgba(255,255,255,0.06)" }}
        />

        {/* Improvement tags */}
        <ImprovementTags accentColor={p.accent} />

        {/* CTA button */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.72, ease: EASE }}
          className="w-full flex flex-col items-center gap-2"
        >
          <motion.button
            onClick={onDownload}
            whileHover={{ scale: 1.02, filter: "brightness(1.08)" }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 22 }}
            data-testid="button-updater-download"
            className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, hsl(265,70%,52%) 0%, hsl(258,72%,48%) 40%, hsl(195,80%,42%) 100%)`,
              boxShadow: `0 0 32px rgba(109,40,217,0.40), 0 4px 14px rgba(0,0,0,0.40)`,
            }}
          >
            {/* Button inner light sweep */}
            <motion.div
              className="absolute inset-0"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
              style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%)" }}
            />
            <Download className="relative size-4 opacity-85" />
            <span className="relative">Update Now</span>
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.88 }}
            className="text-[10px] text-center"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            Recommended for best performance and stability
          </motion.p>
        </motion.div>

      </div>
    </motion.div>
  );
}

interface DownloadingProps {
  percent: number;
  transferred: number;
  total: number;
  bps: number;
  urgency: keyof typeof PALETTE;
}

function DownloadingView({ percent, transferred, total, bps, urgency }: DownloadingProps) {
  const p = PALETTE[urgency] ?? PALETTE.normal;
  const pct = Math.max(0, Math.min(100, percent));

  return (
    <motion.div key="downloading" {...slide} className="p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
          <Download className="size-4.5 text-white/70" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90">Downloading update…</p>
          <p className="text-xs text-white/35 mt-0.5">
            {total > 0 ? `${fmt(transferred)} / ${fmt(total)}` : "Calculating…"}
            {bps > 0 && ` · ${fmtSpeed(bps)}`}
          </p>
        </div>
        <div className="ml-auto tabular-nums text-2xl font-bold text-white/80 leading-none">
          {pct.toFixed(0)}<span className="text-base text-white/30">%</span>
        </div>
      </div>

      {/* Progress track */}
      <div className="space-y-1.5">
        <div className="relative h-2 w-full rounded-full bg-white/[0.07] overflow-hidden">
          <motion.div
            className={cn("absolute left-0 top-0 h-full rounded-full bg-gradient-to-r", p.bar)}
            animate={{ width: `${pct}%` }}
            transition={{ ease: "linear", duration: 0.35 }}
            style={{ minWidth: pct > 0 ? 12 : 0 }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)" }}
            />
          </motion.div>
        </div>

        <div className="relative h-5 overflow-hidden -mx-8 px-8">
          <motion.div
            className={cn("absolute top-0 left-8 h-full rounded-full blur-lg bg-gradient-to-r opacity-50", p.bar)}
            animate={{ width: `${pct}%` }}
            transition={{ ease: "linear", duration: 0.35 }}
          />
          <motion.div
            className="absolute inset-0 rounded-full blur-2xl opacity-30"
            animate={{ opacity: [0.2, 0.45, 0.2] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
            style={{ background: "radial-gradient(ellipse at left, rgba(0,212,255,0.6) 0%, transparent 70%)" }}
          />
        </div>
      </div>

      <p className="text-[11px] text-white/25 text-center">Do not close the app during download.</p>
    </motion.div>
  );
}

interface InstallingProps {
  version: string;
  onInstall: () => void;
}

function InstallingView({ version, onInstall }: InstallingProps) {
  return (
    <motion.div key="installing" {...slide} className="p-8 space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="relative w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="size-5 text-emerald-400" />
          <motion.div
            className="absolute inset-0 rounded-xl"
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 20px rgba(52,211,153,0.6)" }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90">Ready to install</p>
          <p className="text-xs text-emerald-400/80 mt-0.5">Version {version} downloaded successfully</p>
        </div>
      </div>

      <p className="text-sm text-white/50 leading-relaxed">
        Switchcontrol will close and restart automatically to apply the update. Save any in-progress work before continuing.
      </p>

      <motion.button
        onClick={onInstall}
        whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        data-testid="button-updater-install"
        className={cn(
          "w-full flex items-center justify-center gap-2.5 py-3 rounded-xl",
          "text-sm font-semibold text-white",
          "bg-gradient-to-r from-emerald-600 to-teal-500",
          "shadow-[0_4px_24px_rgba(16,185,129,0.3)]",
          "transition-shadow hover:shadow-[0_6px_32px_rgba(16,185,129,0.45)]",
        )}
      >
        <RefreshCw className="size-4" />
        Restart &amp; Install
      </motion.button>
    </motion.div>
  );
}

function RestartingView() {
  return (
    <motion.div key="restarting" {...slide} className="p-8 flex flex-col items-center gap-5">
      <div className="relative flex items-center justify-center">
        <motion.div
          className="absolute w-24 h-24 rounded-full"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          style={{ background: "radial-gradient(circle, rgba(52,211,153,0.5) 0%, transparent 70%)" }}
        />
        <motion.div
          className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"
          animate={{ boxShadow: ["0 0 0px rgba(52,211,153,0)", "0 0 32px rgba(52,211,153,0.5)", "0 0 0px rgba(52,211,153,0)"] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
          >
            <Zap className="size-7 text-emerald-400" />
          </motion.div>
        </motion.div>
      </div>

      <div className="text-center space-y-1.5">
        <p className="text-base font-semibold text-white/90">Restarting…</p>
        <p className="text-sm text-white/40">Applying update and restarting Switchcontrol.</p>
      </div>

      <div className="w-full h-0.5 rounded-full bg-white/[0.07] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          style={{ width: "50%" }}
        />
      </div>
    </motion.div>
  );
}

// ── main modal ────────────────────────────────────────────────────────────────

export function UpdateModal() {
  const { state, download, install } = useUpdater();
  const [dismissed, setDismissed]   = useState<string | null>(null);
  const [phase, setPhase]           = useState<ModalPhase>("available");

  const { status, availableVersion, downloadPercent, bytesPerSecond, transferred, total, urgency } = state;

  useEffect(() => {
    if (status === "available")   setPhase("available");
    if (status === "downloading") setPhase("downloading");
    if (status === "downloaded")  setPhase("installing");
  }, [status]);

  useEffect(() => {
    if (availableVersion && dismissed && availableVersion !== dismissed) {
      setDismissed(null);
    }
  }, [availableVersion, dismissed]);

  const handleDownload = useCallback(async () => {
    setPhase("downloading");
    await download();
  }, [download]);

  const handleInstall = useCallback(async () => {
    setPhase("restarting");
    setTimeout(() => { install(); }, 1200);
  }, [install]);

  const handleDismiss = useCallback(() => {
    setDismissed(availableVersion);
  }, [availableVersion]);

  const isDismissed = dismissed === availableVersion;

  const visible =
    !isDismissed &&
    (status === "available" || status === "downloading" || status === "downloaded") ||
    phase === "restarting";

  const p = PALETTE[(urgency as keyof typeof PALETTE)] ?? PALETTE.normal;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* ── cinematic backdrop ── */}
          <motion.div
            key="um-backdrop"
            className="fixed inset-0 z-[200]"
            style={{ background: "rgba(4,3,12,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={phase === "available" && PALETTE[urgency as keyof typeof PALETTE]?.canDismiss
              ? handleDismiss : undefined}
          />

          {/* ── animated spotlight behind card ── */}
          <motion.div
            key="um-spotlight"
            className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <motion.div
              animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 560, height: 420,
                borderRadius: "50%",
                background: `radial-gradient(ellipse, ${p.orbitColor.replace("0.55", "0.20").replace("0.50", "0.18")} 0%, transparent 68%)`,
                filter: "blur(52px)",
                transform: "translateY(-40px)",
              }}
            />
          </motion.div>

          {/* ── modal shell ── */}
          <motion.div
            key="um-shell"
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.84, y: 32, filter: "blur(16px)" }}
              animate={{ opacity: 1, scale: 1,    y: 0,  filter: "blur(0px)" }}
              exit={{   opacity: 0, scale: 0.92,  y: 16, filter: "blur(8px)"  }}
              transition={{ duration: 0.52, ease: EASE }}
              className="pointer-events-auto relative w-full max-w-[400px] rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(155deg, rgba(16,12,28,0.97) 0%, rgba(9,8,18,0.99) 60%, rgba(7,10,20,0.98) 100%)",
                backdropFilter: "blur(40px) saturate(1.5)",
                WebkitBackdropFilter: "blur(40px) saturate(1.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: `0 32px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 60px ${p.orbitColor.replace("0.55","0.14").replace("0.50","0.12")}`,
              }}
            >
              {/* Inner edge highlight — top */}
              <div className="absolute top-0 left-8 right-8 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
              {/* Inner edge highlight — subtle left */}
              <div className="absolute top-8 bottom-8 left-0 w-px" style={{ background: "rgba(255,255,255,0.04)" }} />

              {/* ── state views ── */}
              <AnimatePresence mode="wait">
                {phase === "available" && (
                  <AvailableView
                    key="v-available"
                    version={availableVersion ?? ""}
                    urgency={(urgency as keyof typeof PALETTE) ?? "normal"}
                    onDownload={handleDownload}
                    onDismiss={handleDismiss}
                  />
                )}
                {phase === "downloading" && (
                  <DownloadingView
                    key="v-downloading"
                    percent={downloadPercent}
                    transferred={transferred}
                    total={total}
                    bps={bytesPerSecond}
                    urgency={(urgency as keyof typeof PALETTE) ?? "normal"}
                  />
                )}
                {phase === "installing" && (
                  <InstallingView
                    key="v-installing"
                    version={availableVersion ?? ""}
                    onInstall={handleInstall}
                  />
                )}
                {phase === "restarting" && (
                  <RestartingView key="v-restarting" />
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
