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
  ArrowUpCircle, AlertTriangle, Zap,
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
    label:   "Critical Update",
    badge:   "bg-red-500/15 text-red-300 border-red-500/25",
    icon:    <AlertTriangle className="size-5 text-red-400" />,
    glow:    "shadow-[0_0_60px_rgba(239,68,68,0.18)]",
    bar:     "from-red-500 via-rose-400 to-orange-400",
    accent:  "text-red-400",
    canDismiss: false,
  },
  recommended: {
    label:   "Recommended Update",
    badge:   "bg-amber-500/15 text-amber-300 border-amber-500/25",
    icon:    <ArrowUpCircle className="size-5 text-amber-400" />,
    glow:    "shadow-[0_0_60px_rgba(245,158,11,0.15)]",
    bar:     "from-amber-500 via-yellow-400 to-orange-400",
    accent:  "text-amber-400",
    canDismiss: true,
  },
  normal: {
    label:   "Update Available",
    badge:   "bg-violet-500/15 text-violet-300 border-violet-500/25",
    icon:    <ArrowUpCircle className="size-5 text-violet-400" />,
    glow:    "shadow-[0_0_60px_rgba(139,92,246,0.15)]",
    bar:     "from-violet-500 via-blue-400 to-cyan-400",
    accent:  "text-violet-400",
    canDismiss: true,
  },
} as const;

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
    <motion.div key="available" {...slide} className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              "bg-white/[0.06] border border-white/[0.08]",
            )}>
              {p.icon}
            </div>
            <motion.div
              className="absolute inset-0 rounded-xl opacity-40"
              animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)" }}
            />
          </div>
          <div>
            <span className={cn(
              "inline-flex items-center text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded border",
              p.badge,
            )}>
              {p.label}
            </span>
            <p className="mt-1.5 text-base font-semibold text-white/90 leading-tight">
              Switchcontrol{" "}
              <span className={p.accent}>{version}</span>
            </p>
          </div>
        </div>
        {p.canDismiss && (
          <motion.button
            onClick={onDismiss}
            whileHover={{ scale: 1.12, backgroundColor: "rgba(255,255,255,0.06)" }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            data-testid="button-updater-dismiss"
            aria-label="Dismiss update"
            className="shrink-0 mt-0.5 size-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="size-3.5" />
          </motion.button>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-white/55 leading-relaxed">
        A new version of Switchcontrol is ready to install. Download it now to get
        the latest performance improvements and fixes.
      </p>

      {/* Action */}
      <motion.button
        onClick={onDownload}
        whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        data-testid="button-updater-download"
        className={cn(
          "w-full flex items-center justify-center gap-2.5 py-3 rounded-xl",
          "text-sm font-semibold text-white",
          "bg-gradient-to-r from-violet-600 to-blue-500",
          "shadow-[0_4px_24px_rgba(109,40,217,0.35)]",
          "transition-shadow hover:shadow-[0_6px_32px_rgba(109,40,217,0.5)]",
        )}
      >
        <Download className="size-4" />
        Download Update
      </motion.button>
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
          {/* fill */}
          <motion.div
            className={cn("absolute left-0 top-0 h-full rounded-full bg-gradient-to-r", p.bar)}
            animate={{ width: `${pct}%` }}
            transition={{ ease: "linear", duration: 0.35 }}
            style={{ minWidth: pct > 0 ? 12 : 0 }}
          >
            {/* shimmer */}
            <motion.div
              className="absolute inset-0"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
              }}
            />
          </motion.div>
        </div>

        {/* reactive glow under bar */}
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
            style={{ background: "radial-gradient(ellipse at left, rgba(139,92,246,0.6) 0%, transparent 70%)" }}
          />
        </div>
      </div>

      <p className="text-[11px] text-white/25 text-center">
        Do not close the app during download.
      </p>
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
      {/* Header */}
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
          <p className="text-xs text-emerald-400/80 mt-0.5">
            Version {version} downloaded successfully
          </p>
        </div>
      </div>

      <p className="text-sm text-white/50 leading-relaxed">
        Switchcontrol will close and restart automatically to apply the update.
        Save any in-progress work before continuing.
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
      {/* Pulsing success ring */}
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

      {/* Indeterminate progress bar */}
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

  // Sync updater status → local phase (but never go backwards)
  useEffect(() => {
    if (status === "available")   setPhase("available");
    if (status === "downloading") setPhase("downloading");
    if (status === "downloaded")  setPhase("installing");
  }, [status]);

  // Reset dismiss when a new version arrives
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
    // Brief restarting animation before the process actually kills the app
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
          {/* ── backdrop ── */}
          <motion.div
            key="um-backdrop"
            className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={phase === "available" && PALETTE[urgency as keyof typeof PALETTE]?.canDismiss
              ? handleDismiss : undefined}
          />

          {/* ── modal shell ── */}
          <motion.div
            key="um-shell"
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 28 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{   opacity: 0, scale: 0.92,  y: 16 }}
              transition={{ duration: 0.42, ease: EASE }}
              className={cn(
                "pointer-events-auto relative w-full max-w-[420px] rounded-2xl overflow-hidden",
                "border border-white/[0.08]",
                "bg-[rgba(9,9,18,0.90)] backdrop-blur-2xl",
                p.glow,
              )}
            >
              {/* top accent line */}
              <div className={cn(
                "absolute top-0 left-0 right-0 h-px bg-gradient-to-r opacity-60",
                p.bar,
              )} />

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
