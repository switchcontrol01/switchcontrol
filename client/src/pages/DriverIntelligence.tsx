/**
 * DriverIntelligence.tsx
 *
 * Flagship premium page. Intelligent system-health platform (NOT a driver
 * updater). Composes: premium gate, trial read-only mode, lazy multi-step scan,
 * animated motherboard centerpiece, health radial, component grid with hover
 * states, sliding component detail panel, driver news and AI integration.
 *
 * Architecture notes:
 *  - Lazy: the scan only fires on mount (and on Rescan); it never runs at app
 *    startup. Results are cached in the store with a "scanned X ago" timestamp.
 *  - State machine: idle → scanning → ready | partial. "partial" still renders
 *    a full page (per-field fallback → "unknown" cards), never a blank screen.
 *  - Performance: heavy motion only DURING the scan; once settled the page is
 *    calm so it doesn't compete with the user's game for GPU.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import {
  ShieldCheck,
  RefreshCw,
  Cloud,
  CloudOff,
  Newspaper,
  Sparkles,
  Crown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { PremiumPageOverlay } from "@/components/ui/premium-page-overlay";
import { GlassCard } from "@/components/ui/glass-card";
import {
  useDriverIntelStore,
  hasData,
} from "@/stores/driverIntelStore";
import {
  type ComponentKind,
  type DriverComponent,
  HEALTH_META,
  SCAN_STEPS,
  countActionable,
} from "@/lib/driver-intel-data";
import { MotherboardMap } from "@/components/driver-intel/MotherboardMap";
import { HealthRadial } from "@/components/driver-intel/HealthRadial";
import { ComponentPanel } from "@/components/driver-intel/ComponentPanel";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function openExternal(url: string) {
  if (isElectron && (window as any).electronAPI?.openExternal) {
    (window as any).electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function DriverIntelligence() {
  const [, navigate] = useLocation();
  const { isPremium } = useAuth();
  const ent = useEntitlementUiState();
  const { openUpgradeModal } = useUpgradeModal();
  const { prefersReducedMotion } = useMotion();

  const isTrial = ent.status === "trial_active";
  const readOnly = isTrial; // trial users: scan yes, act no
  const locked = !isPremium && !isTrial;

  const {
    phase,
    stepIndex,
    components,
    score,
    news,
    scannedAt,
    usedLocalDb,
    dbVersion,
    scan,
    rescan,
  } = useDriverIntelStore();

  const [selected, setSelected] = useState<ComponentKind | null>(null);

  // Lazy scan: kick off only when the page is actually viewable (not locked).
  useEffect(() => {
    if (locked) return;
    scan(); // cached internally — won't re-run if fresh
  }, [locked, scan]);

  const scanning = phase === "scanning";
  const dataReady = hasData(phase);
  const actionable = useMemo(() => countActionable(components), [components]);

  const selectedComponent = useMemo(
    () => components.find((c) => c.kind === selected) ?? null,
    [components, selected],
  );

  const handleAskAi = (c: DriverComponent) => {
    if (readOnly) {
      openUpgradeModal("Driver Intelligence");
      return;
    }
    // Pre-fill the AI Advisor input with component-specific context, then
    // use SPA navigation (wouter) so React state is preserved and the
    // prefill effect in AiAdvisor can read it without a full page reload.
    try {
      sessionStorage.setItem(
        "ai-advisor-prefill",
        `My ${c.title} is "${c.device}". Installed: ${c.current ?? "unknown"}, latest known: ${c.latest ?? "unknown"}. ${c.rationale} Should I update, and how do I do it safely?`,
      );
    } catch {
      /* ignore storage failures */
    }
    navigate("/ai-advisor");
  };

  return (
    <div className="relative min-h-[calc(100vh-64px)] p-5 md:p-7 overflow-x-hidden">
      {/* Ambient orbs — clipped to avoid bleeding into the sidebar */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-80px] right-[-60px] w-[420px] h-[420px] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle, rgba(0,212,255,0.07) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[5%] left-[-40px] w-[320px] h-[320px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 65%)" }}
      />

      <div className={locked ? "opacity-50 blur-[2px] pointer-events-none" : ""}>
        {/* Header */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              className="p-2.5 rounded-xl border border-[#00D4FF]/30"
              style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(59,130,246,0.08))" }}
              initial={{ rotate: -12, scale: 0.7, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <ShieldCheck className="w-5 h-5 text-[#33E0FF]" />
            </motion.div>
            <div>
              <h1 className="text-lg font-bold text-[#E6EAF0] flex items-center gap-2" data-testid="text-driver-intel-title">
                Driver Intelligence
                <span className="inline-flex items-center gap-1 rounded-full bg-[#00D4FF]/15 text-[#33E0FF] border border-[#00D4FF]/30 text-[10px] px-2 py-0.5">
                  <Crown className="size-3" /> Premium
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground">
                System-health intelligence — detect, compare, and update safely
              </p>
            </div>
          </div>

          {/* Scan status / rescan */}
          <div className="flex items-center gap-3">
            {dataReady && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {usedLocalDb ? (
                  <CloudOff className="size-3.5 text-amber-400" />
                ) : (
                  <Cloud className="size-3.5 text-[#33E0FF]" />
                )}
                <span data-testid="text-scanned-at">Scanned {timeAgo(scannedAt)}</span>
              </div>
            )}
            <button
              onClick={() => rescan()}
              disabled={scanning}
              data-testid="button-rescan"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/12 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Rescan"}
            </button>
          </div>
        </div>

        {/* Trial banner */}
        {isTrial && (
          <div
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3"
            data-testid="banner-trial-readonly"
          >
            <div className="flex items-center gap-2 text-sm text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              You're on a free trial — scanning is read-only. Upgrade to act on
              recommendations and unlock AI guidance.
            </div>
            <button
              onClick={() => openUpgradeModal("Driver Intelligence")}
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 transition-colors"
              data-testid="button-trial-upgrade"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Left: motherboard centerpiece */}
          <GlassCard className="relative p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[#E6EAF0]">System Map</h2>
              {dataReady && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={
                    actionable > 0
                      ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" }
                      : { background: "rgba(52,211,153,0.15)", color: "#34d399" }
                  }
                  data-testid="text-actionable-count"
                >
                  {actionable > 0
                    ? `${actionable} update${actionable > 1 ? "s" : ""} available`
                    : "All systems healthy"}
                </span>
              )}
            </div>

            <MotherboardMap
              components={components}
              scanning={scanning}
              activeKind={selected}
              onSelect={(k) => setSelected(k)}
            />

            {/* Scan step overlay */}
            <AnimatePresence>
              {scanning && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 p-5"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                >
                  <div className="rounded-xl border border-[#00D4FF]/20 bg-black/40 backdrop-blur-sm p-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#33E0FF] font-medium" data-testid="text-scan-step">
                        {SCAN_STEPS[stepIndex]?.label ?? "Scanning…"}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {stepIndex + 1}/{SCAN_STEPS.length}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#00D4FF] to-[#3b82f6]"
                        animate={{ width: `${((stepIndex + 1) / SCAN_STEPS.length) * 100}%` }}
                        transition={{ ease: "easeOut", duration: 0.35 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Right: health radial */}
          <GlassCard className="p-6 flex flex-col">
            <h2 className="text-sm font-semibold text-[#E6EAF0] mb-4">Health Score</h2>
            {score ? (
              <HealthRadial score={score} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-10">
                {scanning ? "Calculating…" : "Run a scan to see your score"}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Component cards grid */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-[#E6EAF0] mb-3">Components</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(dataReady ? components : SKELETON_KINDS).map((c, i) =>
              "kind" in c && "device" in c ? (
                <ComponentCard
                  key={c.kind}
                  component={c as DriverComponent}
                  index={i}
                  reduced={prefersReducedMotion}
                  onClick={() => setSelected((c as DriverComponent).kind)}
                />
              ) : (
                <SkeletonCard key={i} />
              ),
            )}
          </div>
        </div>

        {/* Driver news */}
        {dataReady && news.length > 0 && (
          <div className="mt-7">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="size-4 text-[#33E0FF]" />
              <h2 className="text-sm font-semibold text-[#E6EAF0]">Driver News</h2>
              {dbVersion && (
                <span className="text-[10px] text-muted-foreground">DB {dbVersion}</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {news.map((n) => {
                const meta = HEALTH_META[n.safety === "critical" ? "critical" : n.safety === "caution" ? "outdated" : "healthy"];
                return (
                  <GlassCard key={n.id} className="p-4" data-testid={`news-${n.id}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${meta.color}1a`, color: meta.color }}
                      >
                        {n.vendor}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{n.category}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{n.date}</span>
                    </div>
                    <h3 className="text-sm font-medium text-[#E6EAF0]">{n.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.summary}</p>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        )}

        {/* AI integration footer card */}
        {dataReady && (
          <GlassCard className="mt-7 p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#00D4FF]/15 border border-[#00D4FF]/30">
                <Sparkles className="size-4 text-[#33E0FF]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E6EAF0]">
                  Not sure what to update first?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ask the AI Advisor for a prioritised, plain-language plan for your system.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (readOnly) {
                  openUpgradeModal("Driver Intelligence");
                  return;
                }
                navigate("/ai-advisor");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-gradient-to-r from-[#00D4FF] to-[#3b82f6] text-[#04070d] hover:opacity-90 transition-opacity"
              data-testid="button-ai-plan"
            >
              Open AI Advisor <ChevronRight className="size-4" />
            </button>
          </GlassCard>
        )}
      </div>

      {/* Sliding detail panel */}
      <ComponentPanel
        component={selectedComponent}
        readOnly={readOnly}
        onClose={() => setSelected(null)}
        onOpenUrl={openExternal}
        onAskAi={handleAskAi}
      />

      {/* Premium gate */}
      {locked && (
        <PremiumPageOverlay
          featureName="Driver Intelligence is a Premium Feature"
          buttonText="Unlock Premium"
          description="Scan your full system, compare drivers and firmware against our cloud database, and get safe, guided update recommendations — available with SwitchControl Premium."
        />
      )}
    </div>
  );
}

// Skeleton placeholders before first scan completes.
const SKELETON_KINDS = Array.from({ length: 6 }).map((_, i) => ({ skeleton: true, i }));

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 animate-pulse">
      <div className="h-4 w-24 bg-white/8 rounded mb-3" />
      <div className="h-3 w-40 bg-white/6 rounded mb-2" />
      <div className="h-3 w-20 bg-white/6 rounded" />
    </div>
  );
}

function ComponentCard({
  component: c,
  index,
  reduced,
  onClick,
}: {
  component: DriverComponent;
  index: number;
  reduced: boolean;
  onClick: () => void;
}) {
  const meta = HEALTH_META[c.health];
  return (
    <motion.button
      onClick={onClick}
      className="group text-left rounded-xl border bg-white/[0.02] p-4 cursor-pointer transition-all hover:bg-white/[0.07]"
      style={{ borderColor: `${meta.color}44` }}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduced ? 0 : index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -2, boxShadow: `0 4px 20px ${meta.glow}` }}
      whileTap={{ scale: 0.98 }}
      data-testid={`card-component-${c.kind}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{c.title}</span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}44` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
      </div>
      <div className="text-sm font-medium text-[#E6EAF0] truncate mb-1" title={c.device}>
        {c.device}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {c.latest ? `Latest: ${c.latest}` : c.current ? `Detected` : "No data"}
        </span>
        <span
          className="inline-flex items-center gap-0.5 font-medium opacity-40 group-hover:opacity-100 transition-opacity"
          style={{ color: meta.color }}
        >
          Details <ChevronRight className="size-3" />
        </span>
      </div>
    </motion.button>
  );
}
