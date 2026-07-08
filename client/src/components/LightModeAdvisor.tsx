import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { useHardwareProfile } from "@/hooks/useHardwareProfile";
import { useAppModeStore, type ModeRecommendation } from "@/lib/appModeStore";
import { analyseSystemForMode } from "@/lib/lightModeDetection";
import { LightModeRecommendationModal } from "@/components/LightModeRecommendationModal";

const IS_ELECTRON =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

/** Delay after onboarding fully completes before analysing — lets telemetry
 * collect a few real samples and guarantees no overlap with onboarding UI. */
const ANALYSIS_DELAY_MS = 8000;

/**
 * One-time post-onboarding system analysis + Light Mode recommendation.
 *
 * `ready` must ONLY be true when: phase is authenticated & stable, no
 * onboarding flow is active, and the user has completed the tour. The modal
 * therefore can never overlap welcome/trial-tour UI.
 */
export function LightModeAdvisor({ ready }: { ready: boolean }) {
  const recommendationShown = useAppModeStore((s) => s.recommendationShown);
  const dontAskAgain = useAppModeStore((s) => s.dontAskAgain);
  const markRecommendationShown = useAppModeStore((s) => s.markRecommendationShown);
  const profile = useHardwareProfile();
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [modalRec, setModalRec] = useState<ModeRecommendation | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (!ready) return;
    if (recommendationShown || dontAskAgain) return;
    if (firedRef.current) return;

    const timer = setTimeout(async () => {
      // Re-check just before firing — user may have toggled in Settings meanwhile.
      const st = useAppModeStore.getState();
      if (st.recommendationShown || st.dontAskAgain || firedRef.current) return;

      const stats = useStore.getState().stats;
      const tel = useTelemetryStore.getState().telemetry;
      const rec = await analyseSystemForMode(
        profileRef.current,
        { cpuName: stats.cpuName, gpuName: stats.gpuName, totalRamGb: stats.totalRamGb },
        tel ? { cpuLoad: tel.cpu?.load ?? null, ramUsedPct: tel.ram?.usedPercent ?? null } : null,
      );

      // Not enough data yet → try again on the next launch instead of burning
      // the one-time prompt on a low-confidence guess.
      if (rec.confidence < 40) return;

      firedRef.current = true;
      markRecommendationShown(rec);

      // Only interrupt the user when Light Mode is actually recommended —
      // capable systems just keep Normal Mode silently (result visible in Settings).
      if (rec.recommendedMode === "light") {
        setModalRec(rec);
      }
    }, ANALYSIS_DELAY_MS);

    return () => clearTimeout(timer);
  }, [ready, recommendationShown, dontAskAgain, markRecommendationShown]);

  if (!modalRec) return null;

  return (
    <LightModeRecommendationModal
      open={!!modalRec}
      recommendation={modalRec}
      onClose={() => setModalRec(null)}
    />
  );
}

/**
 * Syncs the global `app-light-mode` class onto <html> — the single hook point
 * for all CSS-level effect stripping. Mount once at app root.
 */
export function AppModeClassSync() {
  const mode = useAppModeStore((s) => s.mode);
  useEffect(() => {
    document.documentElement.classList.toggle("app-light-mode", mode === "light");
  }, [mode]);
  return null;
}
