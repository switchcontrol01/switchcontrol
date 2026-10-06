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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { AppLayout } from "@/components/layout/AppLayout";
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
  ArrowLeft,
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
  type UpdateAction,
  getHealthMeta,
  SCAN_STEPS,
  countActionable,
  computeHealthScore,
  applyInstalledVersion,
} from "@/lib/driver-intel-data";
import { MotherboardMap } from "@/components/driver-intel/MotherboardMap";
import { HealthRadial } from "@/components/driver-intel/HealthRadial";
import { ComponentPanel } from "@/components/driver-intel/ComponentPanel";
import { HistoryTimeline } from "@/components/driver-intel/HistoryTimeline";
import type { DriverHistoryItem } from "@/lib/driver-intel-data";
import { useTranslation } from "@/lib/i18n";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function openExternal(url: string) {
  if (isElectron && (window as any).electronAPI?.openExternal) {
    (window as any).electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Smart action: in the desktop app, try to launch the vendor's installed tool
 * (NVIDIA App, Adrenalin, Samsung Magician, …). If it isn't installed — or we're
 * on the web — fall back to opening the official page. Never installs anything.
 */
async function runAction(action: UpdateAction) {
  const api = (window as any).electronAPI;
  if (isElectron && action.appKey && api?.driverApps?.launch) {
    try {
      const res = await api.driverApps.launch(action.appKey);
      if (res?.launched) return;
    } catch {
      /* fall through to the official page */
    }
  }
  openExternal(action.url);
}

function timeAgo(ts: number | null, t: (key: string) => string): string {
  if (!ts) return t("never");
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t("just now");
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t("min ago")}`;
  const h = Math.floor(m / 60);
  return `${h}${t("h ago")}`;
}

const STALE_AFTER_DAYS = 30;

/**
 * Decide whether the cloud reference DB is stale (older than 30 days). Returns
 * the age in days when stale, else null. Non-date values ("bundled", missing)
 * are treated as not-stale here — the offline case is shown separately.
 */
function dbAgeDays(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return days >= STALE_AFTER_DAYS ? days : null;
}

export default function DriverIntelligence() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { isPremium } = useAuth();
  const ent = useEntitlementUiState();
  const { openUpgradeModal } = useUpgradeModal();
  const { prefersReducedMotion } = useMotion();

  const isTrial = ent.status === "trial_active";
  // Driver Intel is premium-only — trial and free both see the upgrade gate.
  const readOnly = false;
  const locked = !isPremium;

  const {
    phase,
    stepIndex,
    components,
    score,
    news,
    scannedAt,
    usedLocalDb,
    dbVersion,
    dbUpdatedAt,
    scan,
    rescan,
    cancelScan,
  } = useDriverIntelStore();

  const staleDays = useMemo(() => dbAgeDays(dbUpdatedAt), [dbUpdatedAt]);
  // Bumped to force the timeline to reload after a new entry is recorded.
  const [historyRefresh, setHistoryRefresh] = useState(0);
  // Drives the exit blur animation before navigating away.
  const [isExiting, setIsExiting] = useState(false);
  const handleNavAway = useCallback(
    (path: string) => {
      setIsExiting(true);
      setTimeout(() => navigate(path), 600);
    },
    [navigate],
  );

  // Record a driver change as a restore point. Honest: we only log what the
  // user confirms they updated (current -> latest), never a faked version.
  const recordUpdate = useCallback(
    async (c: DriverComponent) => {
      if (readOnly || !c.latest) return;
      try {
        const { cloudApiPost } = await import("@/lib/cloud-api");
        await cloudApiPost("/driver-intel/history", {
          component: c.kind,
          componentLabel: c.device,
          vendor: c.vendorKey,
          fromVersion: c.current ?? null,
          toVersion: c.latest,
          action: "update",
          packageName: c.action?.appLabel ?? null,
          rollbackAvailable: !!c.current,
          rollbackMeta: c.current
            ? { previousVersion: c.current, url: c.action?.url ?? null }
            : null,
        });
        setHistoryRefresh((n) => n + 1);
      } catch {
        /* non-fatal — surfaced via the timeline's own error state on reload */
      }
    },
    [readOnly],
  );

  // Restore = open the vendor page/tool so the user can reinstall the prior
  // version themselves. We never download or flash anything automatically.
  const handleRestore = useCallback(
    (item: DriverHistoryItem) => {
      if (readOnly) {
        openUpgradeModal("Driver Intelligence");
        return;
      }
      const url =
        (item.rollbackMeta && (item.rollbackMeta as any).url) || null;
      if (url) openExternal(url);
    },
    [readOnly, openUpgradeModal],
  );

  const [selected, setSelected] = useState<ComponentKind | null>(null);
  // appKey -> installed? (desktop only). Lets buttons say "Open NVIDIA App"
  // when the tool is present, vs "Download from NVIDIA" when it isn't.
  const [detectedApps, setDetectedApps] = useState<Record<string, boolean>>({});

  // Installed driver versions read from the Windows registry (Electron only).
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [installedLoading, setInstalledLoading] = useState(true);

  // Lazy scan: kick off only when the page is actually viewable (not locked).
  useEffect(() => {
    if (locked) return;
    scan(); // cached internally — won't re-run if fresh
  }, [locked, scan]);

  // Leaving the page mid-scan must stop the step-cadence loop immediately —
  // otherwise it keeps ticking (and calling set()) for up to ~2.4s after the
  // user has already navigated away.
  useEffect(() => {
    return () => cancelScan();
  }, [cancelScan]);

  // Fetch installed driver versions from the Windows registry once on mount (Electron only).
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.driverIntel?.getInstalledVersions) {
      setInstalledLoading(false);
      return;
    }
    api.driverIntel.getInstalledVersions()
      .then((versions: Record<string, string>) => {
        setInstalledVersions(versions || {});
      })
      .catch(() => {
        setInstalledVersions({});
      })
      .finally(() => {
        setInstalledLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect installed vendor tools once the component list is ready (desktop only).
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!isElectron || !api?.driverApps?.detect || components.length === 0) return;
    const keys = Array.from(
      new Set(
        components
          .map((c) => c.action?.appKey)
          .filter((k): k is NonNullable<typeof k> => !!k),
      ),
    );
    if (keys.length === 0) return;
    let cancelled = false;
    Promise.all(
      keys.map(async (k) => {
        try {
          const res = await api.driverApps.detect(k);
          return [k, !!res?.installed] as const;
        } catch {
          return [k, false] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setDetectedApps(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [components]);

  // Map a component kind + vendorKey to the right installedVersions key.
  function getInstalledVersion(kind: string, vendorKey: string | null): string | null {
    const v = installedVersions;
    const vendor = (vendorKey ?? "").toLowerCase();
    if (kind === "gpu") {
      if (vendor.includes("amd") || vendor.includes("radeon"))
        return v.amd_gpu_adrenalin || v.amd_gpu || null;
      if (vendor.includes("nvidia")) return v.nvidia_gpu || null;
      if (vendor.includes("intel")) return v.intel_gpu || null;
    }
    if (kind === "chipset") {
      if (vendor.includes("amd")) return v.amd_chipset || null;
      if (vendor.includes("intel")) return v.intel_chipset || null;
    }
    if (kind === "network") return v.wifi || v.ethernet || null;
    if (kind === "bluetooth") return v.bluetooth || null;
    if (kind === "monitor") return v.display || null;
    if (kind === "ssd") return v.storage || null;
    if (kind === "cpu") return v.processor || null;
    if (kind === "audio") return v.audio || null;
    return null;
  }

  // Merge registry-detected installed versions into component list for display.
  // bios and monitor already have real values from hw data — only fill null slots.
  const displayComponents = useMemo<DriverComponent[]>(() => {
    if (installedLoading || Object.keys(installedVersions).length === 0) return components;
    return components.map((c) => {
      if (c.current !== null) return c; // already has a real value — never overwrite
      const detected = getInstalledVersion(c.kind, c.vendorKey);
      if (!detected) return c;
       return applyInstalledVersion(c, detected);
    });
  }, [components, installedVersions, installedLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const scanning = phase === "scanning";
  const dataReady = hasData(phase);
  const actionable = useMemo(() => countActionable(displayComponents), [displayComponents]);
  const displayScore = useMemo(
    () => (dataReady ? computeHealthScore(displayComponents) : score),
    [dataReady, displayComponents, score],
  );

  const selectedComponent = useMemo(
    () => displayComponents.find((c) => c.kind === selected) ?? null,
    [displayComponents, selected],
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

  // Ref used to clear filter + transform after entrance animation so that
  // position:fixed children (ComponentPanel) are never trapped in a
  // CSS containing block once the animation has settled.
  const pageRef = useRef<HTMLDivElement>(null); // retained for future imperative use

  // ── Free users: render a lightweight gate — no scan, no animation, no trap ──
  // All hooks above have already been called (React rules satisfied).
  if (locked) {
    return (
      <AppLayout noPageAnimation>
      <motion.div
        className="flex items-center justify-center min-h-[calc(100vh-64px)] p-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="w-full max-w-sm space-y-4 text-center">
          <GlassCard className="p-8 space-y-5">
            <div className="flex justify-center">
              <motion.div
                className="p-3 rounded-xl border border-[#00D4FF]/25 bg-gradient-to-br from-[#00D4FF]/15 to-[#3b82f6]/08"
                initial={{ rotate: -12, scale: 0.7, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <ShieldCheck className="w-7 h-7 text-[#33E0FF]" />
              </motion.div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#00D4FF]/60">
                {t("Premium Feature")}
              </p>
              <h2 className="text-lg font-bold text-[#E6EAF0]">{t("Driver Intel")}</h2>
              <p className="text-sm text-[#6B7380] leading-relaxed">
                {t("Scan your full system, compare drivers and firmware against our cloud database, and get safe guided update recommendations.")}
              </p>
            </div>
            <button
              onClick={() => openUpgradeModal("Driver Intelligence")}
              className="w-full h-11 rounded-xl font-semibold text-sm text-[#04070d] transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #00D4FF 0%, #3b82f6 100%)" }}
              data-testid="button-driver-intel-unlock"
            >
              {t("Unlock Premium")}
            </button>
          </GlassCard>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-sm text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
            data-testid="button-driver-intel-go-back"
          >
            ← {t("Go back")}
          </button>
        </div>
      </motion.div>
      </AppLayout>
    );
  }

  return (
    <AppLayout noPageAnimation>
    <motion.div
      ref={pageRef}
      className="relative p-5 md:p-7 pb-12"
      initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
      animate={
        isExiting
          ? { opacity: 0, y: -14, filter: "blur(10px)", transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }
          : { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 3.75, ease: [0.22, 1, 0.36, 1] } }
      }
      onAnimationComplete={() => {
        if (pageRef.current && !isExiting) {
          pageRef.current.style.filter = "";
          pageRef.current.style.transform = "";
          pageRef.current.style.willChange = "auto";
        }
      }}
    >
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
                 {t("Driver Intelligence")}
                <span className="inline-flex items-center gap-1 rounded-full bg-[#00D4FF]/15 text-[#33E0FF] border border-[#00D4FF]/30 text-[10px] px-2 py-0.5">
                  <Crown className="size-3" /> {t("Premium")}
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground">
                 {t("System-health intelligence — detect, compare, and update safely")}
              </p>
            </div>
          </div>

          {/* Scan status / rescan + back */}
          <div className="flex items-center gap-3">
            {dataReady && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {usedLocalDb ? (
                  <CloudOff className="size-3.5 text-amber-400" />
                ) : (
                  <Cloud className="size-3.5 text-[#33E0FF]" />
                )}
                <span data-testid="text-scanned-at">{t("Scanned")} {timeAgo(scannedAt, t)}</span>
              </div>
            )}
            <button
              onClick={() => rescan()}
              disabled={scanning}
              data-testid="button-rescan"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/12 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? t("Scanning…") : t("Rescan")}
            </button>
            <button
              onClick={() => handleNavAway("/")}
              data-testid="button-back-dashboard"
              title={t("Back to Dashboard")}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/12 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              {t("Dashboard")}
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
               {t("You're on a free trial — scanning is read-only. Upgrade to act on recommendations and unlock AI guidance.")}
            </div>
            <button
              onClick={() => openUpgradeModal("Driver Intelligence")}
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 transition-colors"
              data-testid="button-trial-upgrade"
            >
              {t("Upgrade")}
            </button>
          </div>
        )}

        {/* Staleness banner — cloud reference DB is older than 30 days */}
        {dataReady && staleDays !== null && !usedLocalDb && (
          <div
            className="mb-5 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
            data-testid="banner-db-stale"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
               {t("Driver database may be outdated — last updated")} {staleDays} {t("days ago. Version checks should still be accurate, but always confirm the latest release on the vendor's official page.")}
            </span>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Left: motherboard centerpiece */}
          <GlassCard className="relative p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[#E6EAF0]">{t("System Map")}</h2>
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
                    ? `${actionable} ${t(actionable === 1 ? "update available" : "updates available")}`
                    : t("All systems healthy")}
                </span>
              )}
            </div>

            <MotherboardMap
              components={displayComponents}
              scanning={scanning}
              activeKind={selected}
              onSelect={(k) => setSelected(k)}
            />

            {/* Scan step overlay */}
            <AnimatePresence>
              {scanning && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 p-5"
                  initial={{ opacity: 0, filter: "blur(6px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(6px)" }}
                >
                  <div className="rounded-xl border border-[#00D4FF]/20 bg-black/40 backdrop-blur-sm p-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#33E0FF] font-medium" data-testid="text-scan-step">
                         {t(SCAN_STEPS[stepIndex]?.label ?? "Scanning…")}
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
            <h2 className="text-sm font-semibold text-[#E6EAF0] mb-4">{t("Health Score")}</h2>
            {displayScore ? (
              <HealthRadial score={displayScore} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-10">
                 {scanning ? t("Calculating…") : t("Run a scan to see your score")}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Component cards grid */}
        <div className="mt-6">
           <h2 className="text-sm font-semibold text-[#E6EAF0] mb-3">{t("Components")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(dataReady ? displayComponents : SKELETON_KINDS).map((c, i) =>
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
               <h2 className="text-sm font-semibold text-[#E6EAF0]">{t("Driver News")}</h2>
              {dbVersion && (
                <span className="text-[10px] text-muted-foreground">DB {dbVersion}</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {news.map((n, i) => {
                const meta = getHealthMeta(n.safety === "critical" ? "critical" : n.safety === "caution" ? "outdated" : "healthy");
                return (
                  <motion.div
                    key={n.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, filter: "blur(6px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.45, delay: prefersReducedMotion ? 0 : i * 0.07 }}
                  >
                  <GlassCard className="p-4 h-full" data-testid={`news-${n.id}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${meta.color}1a`, color: meta.color }}
                      >
                        {n.vendor}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{t(n.category)}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{n.date}</span>
                    </div>
                    <h3 className="text-sm font-medium text-[#E6EAF0]">{t(n.title)}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(n.summary)}</p>
                  </GlassCard>
                  </motion.div>
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
                   {t("Not sure what to update first?")}
                </h3>
                <p className="text-xs text-muted-foreground">
                   {t("Ask the AI Advisor for a prioritised, plain-language plan for your system.")}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (readOnly) {
                  openUpgradeModal("Driver Intelligence");
                  return;
                }
                // Pre-fill the AI Advisor with a summary of all actionable
                // components so the conversation starts with real context.
                try {
                  const outdated = displayComponents.filter(
                    (c) => c.health === "outdated" || c.health === "critical",
                  );
                  if (outdated.length > 0) {
                    const lines = outdated.map(
                      (c) =>
                        `- ${c.title} (${c.device}): installed ${c.current ?? "unknown"}, latest ${c.latest ?? "unknown"}`,
                    );
                    sessionStorage.setItem(
                      "ai-advisor-prefill",
                      `My Driver Intelligence scan found ${outdated.length} component${outdated.length > 1 ? "s" : ""} that may need updating:\n${lines.join("\n")}\n\nWhat should I prioritise and how do I safely update each one?`,
                    );
                  }
                } catch {
                  /* ignore storage failures */
                }
                navigate("/ai-advisor");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-gradient-to-r from-[#00D4FF] to-[#3b82f6] text-[#04070d] hover:opacity-90 transition-opacity"
              data-testid="button-ai-plan"
            >
               {t("Open AI Advisor")} <ChevronRight className="size-4" />
            </button>
          </GlassCard>
        )}

        {/* Update history / restore points */}
        {dataReady && (
          <HistoryTimeline
            refreshKey={historyRefresh}
            readOnly={readOnly}
            onRestore={handleRestore}
          />
        )}
      </div>

      {/* Sliding detail panel — portalled to body so the page's blur/transform
          animation never traps it in a CSS containing block */}
      {typeof document !== "undefined" && createPortal(
        <ComponentPanel
          component={selectedComponent}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onAction={runAction}
          detectedApps={detectedApps}
          onAskAi={handleAskAi}
          onRecordUpdate={recordUpdate}
        />,
        document.body,
      )}

      {/* Premium gate */}
      {locked && (
        <PremiumPageOverlay
          featureName={t("Driver Intelligence is a Premium Feature")}
          buttonText={t("Unlock Premium")}
          description={t("Scan your full system, compare drivers and firmware against our cloud database, and get safe, guided update recommendations — available with SwitchControl Premium.")}
        />
      )}
    </motion.div>
    </AppLayout>
  );
}

// Skeleton placeholders before first scan completes.
const SKELETON_KINDS = Array.from({ length: 9 }).map((_, i) => ({ skeleton: true, i }));

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
  const { t } = useTranslation();
  const meta = getHealthMeta(c.health);
  return (
    <motion.button
      onClick={onClick}
      className="group text-left rounded-xl border bg-white/[0.02] p-4 cursor-pointer transition-all hover:bg-white/[0.07]"
      style={{ borderColor: `${meta.color}44` }}
      initial={reduced ? false : { opacity: 0, filter: "blur(6px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.5 }}
      whileHover={reduced ? undefined : { boxShadow: `0 4px 20px ${meta.glow}` }}
      whileTap={{ scale: 0.98 }}
      data-testid={`card-component-${c.kind}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t(c.title)}</span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}44` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
          {t(meta.label)}
        </span>
      </div>
      <div className="text-sm font-medium text-[#E6EAF0] truncate mb-1" title={c.device}>
        {c.device}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {c.latest ? `${t("Latest")}: ${c.latest}` : c.current ? t("Detected") : t("No data")}
        </span>
        <span
          className="inline-flex items-center gap-0.5 font-medium opacity-40 group-hover:opacity-100 transition-opacity"
          style={{ color: meta.color }}
        >
          {t("Details")} <ChevronRight className="size-3" />
        </span>
      </div>
    </motion.button>
  );
}
