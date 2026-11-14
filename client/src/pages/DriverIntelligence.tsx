/**
 * Driver Intelligence production controller. The board inspector is presentation
 * only; this page retains native evidence, scan caching, access rules and actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Newspaper, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "@/lib/motion";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { GlassCard } from "@/components/ui/glass-card";
import { useDriverIntelStore, hasData } from "@/stores/driverIntelStore";
import {
  type ComponentKind, type DriverComponent, type DriverHistoryItem, type UpdateAction,
  SCAN_STEPS, computeHealthScore, resolveInstalledComponent,
} from "@/lib/driver-intel-data";
import { ComponentPanel } from "@/components/driver-intel/ComponentPanel";
import { HistoryTimeline } from "@/components/driver-intel/HistoryTimeline";
import { DriverBoardInspector } from "@/components/driver-intel/DriverBoardInspector";
import { DriverLiquidGlassWaves } from "@/components/driver-intel/DriverLiquidGlassWaves";
import { useTranslation } from "@/lib/i18n";

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
function openExternal(url: string) {
  const api = (window as any).electronAPI;
  if (isElectron && api?.openExternal) api.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
async function runAction(action: UpdateAction) {
  const api = (window as any).electronAPI;
  if (isElectron && action.appKey && api?.driverApps?.launch) {
    try { if ((await api.driverApps.launch(action.appKey))?.launched) return; } catch { /* Use the official vendor page. */ }
  }
  openExternal(action.url);
}
function timeAgo(ts: number | null, t: (key: string) => string): string {
  if (!ts) return t("Not scanned yet");
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return t("just now");
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} ${t("min ago")}` : `${Math.floor(minutes / 60)}${t("h ago")}`;
}
function dbAgeDays(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return days > 30 ? days : null;
}

export default function DriverIntelligence() {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { isPremium } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  // This explicitly requested feature motion follows the app preference, not
  // Windows Animation Effects (which a performance tweak may have disabled).
  const prefersReducedMotion = useUserPreferencesStore(state => state.reducedMotion);
  // Preserve the existing Premium-only boundary, including the trial gate.
  const locked = !isPremium;
  const readOnly = false;
  const {
    phase, stepIndex, components, score, news, scannedAt, usedLocalDb,
    dbVersion, dbUpdatedAt, error, scan, rescan, cancelScan,
  } = useDriverIntelStore();
  const [selected, setSelected] = useState<ComponentKind | null>(null);
  const [detectedApps, setDetectedApps] = useState<Record<string, boolean>>({});
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [installedLoading, setInstalledLoading] = useState(true);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const pendingNavigation = useRef<string | null>(null);

  useEffect(() => { if (!locked) void scan(); }, [locked, scan]);
  useEffect(() => () => {
    cancelScan();
  }, [cancelScan]);
  useEffect(() => {
    const route = location.split("?")[0].replace(/\/+$/, "") || "/";
    if (route === "/driver-intel") return;
    setSelected(null);
    setIsExiting(true);
    cancelScan();
  }, [location, cancelScan]);

  useEffect(() => {
    if (locked) return;
    const api = (window as any).electronAPI;
    if (!api?.driverIntel?.getInstalledVersions) { setInstalledLoading(false); return; }
    let cancelled = false;
    setInstalledLoading(true);
    api.driverIntel.getInstalledVersions()
      .then((versions: Record<string, string>) => { if (!cancelled) setInstalledVersions(versions || {}); })
      .catch(() => { if (!cancelled) setInstalledVersions({}); })
      .finally(() => { if (!cancelled) setInstalledLoading(false); });
    return () => { cancelled = true; };
  }, [locked, scannedAt]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (locked || !isElectron || !api?.driverApps?.detect || !components.length) return;
    let cancelled = false;
    const keys = Array.from(new Set(components.map(c => c.action?.appKey).filter((key): key is NonNullable<typeof key> => !!key)));
    Promise.all(keys.map(async key => {
      try { return [key, !!(await api.driverApps.detect(key))?.installed] as const; }
      catch { return [key, false] as const; }
    })).then(pairs => { if (!cancelled) setDetectedApps(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [components, locked]);

  const displayComponents = useMemo(
    () => installedLoading || !Object.keys(installedVersions).length ? components : components.map(c => resolveInstalledComponent(c, installedVersions)),
    [components, installedVersions, installedLoading],
  );
  const dataReady = hasData(phase);
  const scanning = phase === "scanning";
  const displayScore = useMemo(() => dataReady ? computeHealthScore(displayComponents) : score, [dataReady, displayComponents, score]);
  const selectedComponent = displayComponents.find(c => c.kind === selected) ?? null;
  const staleDays = dbAgeDays(dbUpdatedAt);
  const navigateAfterExit = useCallback((destination: string) => {
    if (pendingNavigation.current) return;
    if (prefersReducedMotion) {
      navigate(destination);
      return;
    }
    pendingNavigation.current = destination;
    setIsExiting(true);
  }, [navigate, prefersReducedMotion]);
  const handleExitComplete = useCallback(() => {
    const destination = pendingNavigation.current;
    if (!destination) return;
    pendingNavigation.current = null;
    navigate(destination);
  }, [navigate]);

  const recordUpdate = useCallback(async (component: DriverComponent) => {
    if (readOnly || !component.latest) return;
    try {
      const { cloudApiPost } = await import("@/lib/cloud-api");
      await cloudApiPost("/driver-intel/history", {
        component: component.kind, componentLabel: component.device, vendor: component.vendorKey,
        fromVersion: component.current ?? null, toVersion: component.latest, action: "update",
        packageName: component.action?.appLabel ?? null, rollbackAvailable: !!component.current,
        rollbackMeta: component.current ? { previousVersion: component.current, url: component.action?.url ?? null } : null,
      });
      setHistoryRefresh(n => n + 1);
      setNotice(null);
    } catch { setNotice(t("Could not save driver history. Please try again.")); }
  }, [t]);
  const handleRestore = useCallback((item: DriverHistoryItem) => {
    const url = item.rollbackMeta?.url;
    if (typeof url === "string" && url) openExternal(url);
  }, []);
  const handleAskAi = useCallback((component?: DriverComponent) => {
    const context = component ? [component] : displayComponents.filter(c => c.health === "outdated" || c.health === "critical");
    try {
      const detail = context.map(c => `- ${c.title} (${c.device}): installed ${c.current ?? "unknown"}, latest known ${c.latest ?? "unknown"}. ${c.rationale}`).join("\n");
      sessionStorage.setItem("ai-advisor-prefill", `My Driver Intelligence results:\n${detail || "No verified update recommendation is available."}\nWhat should I prioritise and how do I proceed safely?`);
    } catch { /* Advisor navigation remains available without storage. */ }
    navigateAfterExit("/ai-advisor");
  }, [displayComponents, navigateAfterExit]);
  const handleBack = useCallback(() => navigateAfterExit("/dashboard"), [navigateAfterExit]);

  if (locked) return (
    <AppLayout noPageAnimation>
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-4 text-center">
          <GlassCard className="space-y-5 p-8">
            <ShieldCheck className="mx-auto size-10 text-[#8ecde7]" />
            <p className="text-xs uppercase tracking-widest text-[#8ecde7]">{t("Premium Feature")}</p>
            <h1 className="text-lg font-bold">{t("Driver Intel")}</h1>
            <p className="text-sm text-muted-foreground">{t("Scan your full system, compare drivers and firmware against our cloud database, and get safe guided update recommendations.")}</p>
            <button className="w-full rounded-lg bg-[#8ecde7] p-3 text-sm font-semibold text-[#0d1420]" onClick={() => openUpgradeModal("Driver Intelligence")} data-testid="button-driver-intel-unlock">{t("Unlock Premium")}</button>
          </GlassCard>
          <button className="text-sm text-muted-foreground" onClick={() => navigate("/dashboard")} data-testid="button-driver-intel-go-back">{t("Go back")}</button>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout noPageAnimation immersiveContent>
      <motion.div
        className="driver-intel-page"
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        inert={isExiting}
        initial={prefersReducedMotion ? false : "initial"}
        animate={isExiting ? "exit" : "enter"}
        onAnimationComplete={definition => {
          if (definition === "exit") handleExitComplete();
        }}
        variants={{
          initial: { y: 14, scale: 0.992, opacity: 0 },
          enter: {
            y: 0,
            scale: 1,
            opacity: 1,
            transition: { duration: prefersReducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] },
          },
          exit: {
            y: -12,
            scale: 0.986,
            opacity: 0,
            transition: { duration: prefersReducedMotion ? 0 : 0.62, ease: [0.4, 0, 1, 1] },
          },
        }}
      >
        <DriverBoardInspector components={displayComponents} score={displayScore}
          scanning={scanning} ready={dataReady} error={error}
          scannedLabel={dataReady ? `${t("Scanned")} ${timeAgo(scannedAt, t)}` : t("Not scanned yet")}
          stepLabel={t(SCAN_STEPS[stepIndex]?.label ?? "Scanning…")}
          progress={Math.min(100, ((stepIndex + 1) / SCAN_STEPS.length) * 100)}
          onScan={() => { void rescan(); }} onBack={handleBack} onDetails={c => setSelected(c.kind)} />
        {dataReady && usedLocalDb && <div className="di-notice" role="status">{t("Using the bundled driver database. Confirm current releases with the official vendor.")}</div>}
        {dataReady && staleDays !== null && !usedLocalDb && <div className="di-notice" data-testid="banner-db-stale">{t("Driver database may be outdated — last updated")} {staleDays} {t("days ago. Always confirm the latest release on the vendor's official page.")}</div>}
        {notice && <div className="di-notice" role="alert">{notice}</div>}
        {dataReady && news.length > 0 && <section className="di-supplement"><h2><Newspaper size={19} />{t("Driver News")}</h2><div className="di-news-grid">{news.map(item => <article key={item.id} className="di-news" data-testid={`news-${item.id}`}><DriverLiquidGlassWaves surface="news" /><small>{item.vendor} · {t(item.category)} · {item.date}</small><h3>{t(item.title)}</h3><p>{t(item.summary)}</p></article>)}</div></section>}
        {dataReady && <>
          <section className="di-ai"><DriverLiquidGlassWaves surface="advisor" /><div><h3><Sparkles className="mr-2 inline size-4" />{t("Not sure what to update first?")}</h3><p>{t("Ask the AI Advisor for a prioritised, plain-language plan for your system.")}</p></div><button className="di-button" onClick={() => handleAskAi()} data-testid="button-ai-plan">{t("Open AI Advisor")}</button></section>
          <HistoryTimeline refreshKey={historyRefresh} readOnly={readOnly} onRestore={handleRestore} />
        </>}
        <small className="di-source">SWITCHCONTROL / {t("DRIVER INTELLIGENCE")}{dbVersion ? ` · DB ${dbVersion}` : ""} · {t("Official sources only. Updates stay in your hands.")}</small>
      </motion.div>
      {typeof document !== "undefined" && createPortal(
        <ComponentPanel component={selectedComponent} readOnly={readOnly} onClose={() => setSelected(null)}
          onAction={runAction} detectedApps={detectedApps} onAskAi={handleAskAi} onRecordUpdate={recordUpdate} />,
        document.body,
      )}
    </AppLayout>
  );
}
