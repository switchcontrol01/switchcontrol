import React, {
  useEffect,
  useState,
  useCallback,
  lazy,
  Suspense,
  startTransition,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { PerformanceOverlay } from "@/components/debug/PerformanceOverlay";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Router, Route, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

function useTransitionLocation(): [string, (to: string, opts?: any) => void] {
  const [location, rawNavigate] = useHashLocation();
  const navigate = useCallback(
    (to: string, opts?: any) => startTransition(() => rawNavigate(to, opts)),
    [rawNavigate],
  );
  return [location, navigate];
}
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUpgradeAnimation } from "@/components/PremiumUpgradeAnimation";
import { TrialActivationAnimation } from "@/components/TrialActivationAnimation";
import { TrialTour } from "@/components/TrialTour";

import { GuidedTour } from "@/components/GuidedTour";
import { WindowControls } from "@/components/WindowControls";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnimatePresence, motion } from "framer-motion";
import {
  useAuthStore,
  validateToken,
  exchangeToken,
  AuthUser,
  refreshEntitlements,
  retryRefreshEntitlements,
  triggerFlowReset,
  performFullLogout,
  postUnlockSeen,
  postTourSeen,
  postResetTourFlags,
  postTrialActivationSeen,
  postTrialTourSeen,
  resolveAuthState,
} from "@/lib/auth-store";
import { clearSwitchControlStorage } from "@/lib/storageUtils";
import { runPremiumRevert } from "@/lib/premiumRevertEngine";
import { tryReissueJwt } from "@/lib/api";
import { isTrialActive } from "@/lib/trialCountdown";
import { telemetryManager } from "@/lib/telemetryManager";
import { useStore } from "@/lib/store";
import { batchCheckAllTweaks, isRealTweak } from "@/hooks/use-tweak-executor";
import { PendingActivationModal } from "@/components/PendingActivationModal";
import { UpgradeModalProvider } from "@/contexts/UpgradeModalContext";
import {
  PatchNotesModal,
  PATCH_NOTES_STORAGE_KEY,
} from "@/components/PatchNotesModal";
import { DeviceLockModal } from "@/components/DeviceLockModal";
import { usePremiumDeviceLock } from "@/hooks/usePremiumDeviceLock";
import { usePremiumPromo } from "@/hooks/usePremiumPromo";
import { PremiumPromoPopup } from "@/components/PremiumPromoPopup";
import { usePremiumExpiry, useBaselineScan } from "@/hooks/usePremiumExpiry";
import { useEntitlementRefresh } from "@/hooks/useEntitlementRefresh";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";
import { PremiumRevertModal } from "@/components/PremiumRevertModal";
import { LightModeAdvisor, AppModeClassSync } from "@/components/LightModeAdvisor";
import { ModeTransitionOverlay } from "@/components/ModeTransitionOverlay";
import { usePremiumGraceStore } from "@/stores/premiumGraceStore";
import { useTrialExpiryStore } from "@/stores/trialExpiryStore";
import { useSystemConditionsStore } from "@/stores/systemConditionsStore";
import { useToast } from "@/hooks/use-toast";
import { UserPreferencesSync } from "@/components/UserPreferencesSync";
import { I18nProvider } from "@/lib/i18n";
import { clearTourState } from "@/lib/tour-store";

import Splash from "@/screens/Splash";
import CameraGlow from "@/screens/CameraGlow";
import LoginScreen from "@/screens/Login";
import { WelcomeAnimation } from "@/components/WelcomeAnimation";
import { OnboardingTour } from "@/components/OnboardingTour";
import { FirstRunDisclaimer } from "@/components/FirstRunDisclaimer";
import { FirstRunLanguageModal } from "@/components/FirstRunLanguageModal";
const _isElectronRuntime =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
// Build-selected route map: the web build uses route chunks, while the
// Electron build aliases this import to an eager map so file:// never needs
// to resolve a desktop page chunk.
import { desktopRoutes } from "@/routes/desktopRoutes";
// Website-only chunks, only prefetch on web (not in Electron where file:// protocol
// causes chunk fetch failures for pages that are never shown in the desktop app).
const _landingChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Landing");
const _featuresChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Features");
const _pricingChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Pricing");
const _downloadChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Download");
const _termsChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Terms");
const _privacyChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Privacy");
const _faqChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/FAQ");
const _successChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Success");
const _premiumSuccessChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/PremiumSuccess");
const _loginChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Login");
const _adminChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/Admin");
const _adminPerfChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/AdminPerformance");
const _adminDeviceChunk = _isElectronRuntime
  ? Promise.resolve({ default: () => null })
  : import("@/pages/AdminDeviceInspector");
const Landing = lazy(() => _landingChunk);
const Features = lazy(() => _featuresChunk);
const Pricing = lazy(() => _pricingChunk);
const Download = lazy(() => _downloadChunk);
const Terms = lazy(() => _termsChunk);
const Privacy = lazy(() => _privacyChunk);
const FAQPage = lazy(() => _faqChunk);
const Success = lazy(() => _successChunk);
const PremiumSuccess = lazy(() => _premiumSuccessChunk);
const LoginPage = lazy(() => _loginChunk);
const AdminPage = lazy(() => _adminChunk);
const AdminPerformancePage = lazy(() => _adminPerfChunk);
const AdminDeviceInspectorPage = lazy(() => _adminDeviceChunk);

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

type AppPhase =
  | "splash"
  | "booting"
  | "unauthenticated"
  | "login_success"
  | "language"
  | "welcome"
  | "disclaiming"
  | "authenticated";

// AppAuthContext, AppAuthContextValue, and useAppAuth live in a dedicated
// file to avoid a circular import: use-auth.ts → App.tsx → SystemCleaner (lazy) → use-auth.ts
export type { AppAuthContextValue } from "@/lib/appAuthContext";
export { useAppAuth } from "@/lib/appAuthContext";
import { AppAuthContext } from "@/lib/appAuthContext";

// DarkFallback, solid dark cover shown while a lazy route chunk is loading.
// Replaces fallback={null} so the compositor never sees a transparent frame
// during the first navigation to a lazy page.
const DarkFallback = () => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "#070b14",
      zIndex: 0,
    }}
  />
);

// Keep the desktop shell mounted while a first-visit route chunk downloads.
// Page components currently own AppLayout, so the route-level Suspense fallback
// must provide the shell itself; otherwise React removes the Sidebar,
// background, and content area together and Electron shows a blank dark frame.
const ElectronRouteFallback = () => (
  <AppLayout noPageAnimation>
    <div
      className="min-h-[calc(100vh-5rem)] space-y-7"
      role="status"
      aria-label="Loading page"
      data-testid="route-loading-fallback"
    >
      <div className="space-y-3">
        <div className="h-8 w-56 rounded-lg bg-white/[0.07] animate-pulse" />
        <div className="h-4 w-[min(34rem,80%)] rounded bg-white/[0.045] animate-pulse" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="h-36 rounded-2xl border border-white/[0.07] bg-white/[0.025] animate-pulse"
          />
        ))}
      </div>
    </div>
  </AppLayout>
);

function ElectronAppRoutes() {
  const [location] = useLocation();
  const realtimeMetricsEnabled = useStore((state) => state.realtimeMetricsEnabled);

  useEffect(() => {
    const path = location.split("?")[0];
    const mode =
      path === "/" || path === "/dashboard"
        ? "full"
        : path === "/tweaks"
          ? "intelligence"
          : "paused";
    telemetryManager.setDemandMode(mode);
    // Dashboard analytics are visible product UI, not an optional background
    // service. Keep the dashboard route polling so Storage Activity, Memory
    // Pressure, and System Rhythm receive real values. Static routes remain
    // paused; the preference still controls non-dashboard consumers.
    if (mode === "paused") {
      telemetryManager.pause();
    }
    console.info(
      `[TelemetryRoute] path=${path} mode=${mode} live=${realtimeMetricsEnabled}`,
    );
  }, [location, realtimeMetricsEnabled]);

  return (
    <ErrorBoundary route={location}>
      <div style={{ minHeight: "100%" }}>
        <Suspense fallback={<ElectronRouteFallback />}>
          <Switch>
            <Route path="/" component={desktopRoutes.Home} />
            <Route path="/dashboard" component={desktopRoutes.Home} />
            <Route path="/tweaks" component={desktopRoutes.Tweaks} />
            <Route path="/power-plan" component={desktopRoutes.PowerPlan} />

            <Route path="/nic-tuning" component={desktopRoutes.NicTuningPage} />
            <Route path="/network" component={desktopRoutes.NetworkTweaks} />
            <Route path="/cleaner" component={desktopRoutes.SystemCleaner} />
            <Route path="/debloat" component={desktopRoutes.Debloater} />
            <Route path="/startup" component={desktopRoutes.StartupApps} />
            <Route path="/bios-advisor" component={desktopRoutes.BiosAdvisor} />
            <Route path="/ai-advisor" component={desktopRoutes.AiAdvisor} />
            <Route path="/security" component={desktopRoutes.Security} />
            <Route path="/history" component={desktopRoutes.History} />
            <Route path="/driver-intel" component={desktopRoutes.DriverIntelligence} />
            <Route path="/latency-analyzer" component={desktopRoutes.LatencyAnalyzer} />
            <Route path="/process-manager" component={desktopRoutes.ProcessManager} />
            <Route path="/settings" component={desktopRoutes.Settings} />
            <Route component={desktopRoutes.Home} />
          </Switch>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

function WebsiteRoutes() {
  return (
    <Suspense fallback={<DarkFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/features" component={Features} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/download" component={Download} />
        <Route path="/login" component={LoginPage} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/faq" component={FAQPage} />
        <Route path="/success" component={Success} />
        <Route path="/premium-success" component={PremiumSuccess} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/performance" component={AdminPerformancePage} />
        <Route path="/admin/device-inspector" component={AdminDeviceInspectorPage} />
        <Route>
          <Landing />
        </Route>
      </Switch>
    </Suspense>
  );
}

type AppFlow =
  | "none"
  | "firstTime"
  | "trialUnlock"
  | "trialTour"
  | "premiumUnlock"
  | "premiumTour";

function ElectronAppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [showGlow, setShowGlow] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [activeFlow, setActiveFlow] = useState<AppFlow>("none");
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [entitlementsAttempted, setEntitlementsAttempted] = useState(false);
  const [entitlementsOk, setEntitlementsOk] = useState(false);
  const [entitlementsVerified, setEntitlementsVerified] = useState(false);
  const [showPendingActivation, setShowPendingActivation] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  // Becomes true 850ms after entering "authenticated" phase so tour flows don't
  // fire while the dashboard's own 750ms fade-in animation is still running.
  const [isPhaseStable, setIsPhaseStable] = useState(false);
  // Tracks the live phase value inside the deep-link handler, which registers
  // once ([] deps) and therefore can't read updated `phase` state via closure.
  const phaseRef = React.useRef<AppPhase>(phase);
  phaseRef.current = phase;

  const patchNotesCheckedRef = React.useRef(false);
  const unlockFiredThisSessionRef = React.useRef(false);
  const trialUnlockFiredRef = React.useRef(false);
  const trialTourFiredThisSessionRef = React.useRef(false);
  const premiumTourFiredThisSessionRef = React.useRef(false);
  const suppressFlowsRef = React.useRef(false);
  const {
    token,
    jwt,
    user,
    setToken,
    setUser,
    logout: storeLogout,
    setValidating,
  } = useAuthStore(
    useShallow((s) => ({
      token: s.token,
      jwt: s.jwt,
      user: s.user,
      setToken: s.setToken,
      setUser: s.setUser,
      logout: s.logout,
      setValidating: s.setValidating,
    })),
  );
  const flowResetTs = useAuthStore((s) => s.flowResetTs);
  const [, setLocation] = useHashLocation();

  // Premium device lock, Electron only, runs after entitlements confirmed from server.
  // Exclude trial users: trial access is user-scoped and must never trigger device locking,
  // even if the auth store still has a stale isPremium=true from a previous session.
  const isPremiumVerified =
    entitlementsOk && (user?.isPremium ?? false) && user?.plan !== "trial";
  const {
    status: deviceLockStatus,
    isChecking: isDeviceLockChecking,
    retry: retryDeviceLock,
  } = usePremiumDeviceLock(
    isElectron,
    isPremiumVerified,
    user?.loggedIn ?? false,
  );

  // Free-user premium promo (Discord CTA), server decides the every-30-launches
  // cadence keyed by hardware fingerprint. Only for verified-free users; premium
  // and trial users are excluded both here and server-side.
  const isFreePlanForPromo =
    entitlementsOk &&
    !(user?.isPremium ?? false) &&
    user?.plan !== "premium" &&
    user?.plan !== "trial";
  const {
    promoOpen,
    discordUrl: promoDiscordUrl,
    closePromo,
  } = usePremiumPromo({
    isElectron,
    loggedIn: user?.loggedIn ?? false,
    entitlementsVerified: entitlementsOk,
    isFreePlan: isFreePlanForPromo,
  });

  // Premium expiry, detects trial/premium→free transition, triggers safe revert
  const {
    revertModalOpen,
    revertReport,
    revertPhase,
    closeRevertModal,
    retryRevert,
    isActive: premiumIsActive,
  } = usePremiumExpiry({
    isPremium: user?.isPremium ?? false,
    plan: user?.plan,
    trialEndsAt: user?.trialEndsAt,
    isLoggedIn: user?.loggedIn ?? false,
    entitlementsVerified,
  });

  // All startup and promotional surfaces share this arbitration boundary.
  // Revert is the highest-priority flow; the remaining overlays are mutually
  // exclusive with onboarding and with each other.
  const competingOverlayActive =
    revertModalOpen ||
    phase === "language" ||
    showDisclaimer ||
    showPendingActivation ||
    showPatchNotes ||
    promoOpen;

  // ── Live entitlement refresh ────────────────────────────────────────────
  // Without this, admin-side plan changes (premium/trial/free) are only ever
  // picked up at app boot (resolveAuthState in the checkAuth effect below),
  // requiring the user to fully quit and relaunch SwitchControl to see the
  // change take effect. This hook re-fetches /api/me on mount and whenever
  // the window regains focus/visibility, so plan changes propagate live.
  const { refresh: refreshEntitlementsNow } = useEntitlementRefresh({
    refreshOnMount: false, // boot flow (checkAuth) already handles the initial fetch
    refreshOnFocus: true,
  });

  // Safety-net poll: SwitchControl is often left focused/visible for long
  // stretches (e.g. pinned overlay during a game), so focus/visibility
  // events alone may never fire. Poll periodically while visible so admin
  // plan changes still land without requiring a focus change or restart.
  useVisibilityInterval(
    refreshEntitlementsNow,
    45_000,
    "App:entitlementRefresh",
    "App.tsx",
    (user?.loggedIn ?? false) && entitlementsVerified,
  );

  // ── Trial-expiry redirect ──────────────────────────────────────────────────
  // When the revert modal opens (trial just ended or app reopened post-expiry),
  // immediately navigate to /dashboard so the revert summary is never obstructed
  // by a premium-gated page. The PremiumOverlayCard simultaneously returns null
  // via trialExpiryStore, preventing the z-9999 overlay from blocking the modal.
  useEffect(() => {
    if (!revertModalOpen) return;
    if (phase !== "authenticated") return;
    console.log(
      "[TrialExpiry] revert modal opened, redirecting to /dashboard",
    );
    setLocation("/dashboard");
  }, [revertModalOpen, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause ALL CSS animations when the tab is hidden, zero GPU work for background tabs.
  useEffect(() => {
    const sync = () =>
      document.documentElement.classList.toggle("tab-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // Backend-error listener, shows an error immediately instead of spinning for 50s.
  // The api.ts module-level listener already rejects the port poll; this sets the
  // UI state so the booting screen displays a human-readable message.
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (!api?.onBackendError) return;
    const remove = api.onBackendError((data: any) => {
      setBackendError(
        data?.error ?? "Backend failed to start. Please reinstall.",
      );
    });
    return remove;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // First-run baseline scan, records pre-existing applied state before the app touches anything
  useBaselineScan();

  const realtimeMetricsEnabled = useStore((s) => s.realtimeMetricsEnabled);
  const setTweak = useStore((s) => s.setTweak);
  const setSystemConditions = useSystemConditionsStore((s) => s.setConditions);
  const { toast } = useToast();

  // Startup reconciliation, fires once, non-blocking.
  // Reads real Windows tweak state via a single batched PowerShell call and
  // updates the Zustand store so every page reflects reality, not stale cache.
  // This is the fix for the AppData-delete scenario: deleting %AppData%/SwitchControl
  // wipes the persisted UI store (showing all tweaks OFF) but leaves all registry
  // and service changes intact in Windows. This call rebuilds truth from the OS.
  // Delayed to 8000ms to ensure it runs AFTER SysIntelligence Phase A finishes
  // (~3.5s of WMI probes). Overlapping batchCheckAll + Phase A was causing the
  // audio glitch (process-spawn burst starving the Windows audio scheduler thread).
  useEffect(() => {
    if (!isElectron) return;
    const t = setTimeout(async () => {
      try {
        const api = (window as any).electronAPI?.tweaks;
        if (!api) return;

        // Read local cached state first, needed to detect timer-res / power-mode-overlay
        // cases where the user had a tweak enabled but it reset (agent died / overlay reset).
        const localState: { appliedTweaks?: Record<string, boolean> } =
          await api.getLocalState().catch(() => ({ appliedTweaks: {} }));
        const prevEnabled: Record<string, boolean> = localState?.appliedTweaks ?? {};

        const results = await batchCheckAllTweaks();
        if (!results || Object.keys(results).length === 0) return;

        const verifiedStateMap: Record<string, boolean> = {};
        let reconciled = 0;

        for (const [tweakId, status] of Object.entries(results)) {
          const s = status as {
            isApplied?: boolean;
            applied?: boolean;
            unsupported?: boolean;
            error?: string | null;
          };
          if (s.unsupported || s.error) continue;
          if (!isRealTweak(tweakId)) continue;
          const finalState = s.isApplied ?? s.applied ?? false;
          console.info(
            `[App:STARTUP-RECONCILE] source=startup_reconcile id="${tweakId}" ` +
            `observed=${finalState}, read-only hydration`,
          );
          setTweak(tweakId, finalState);
          verifiedStateMap[tweakId] = finalState;
          reconciled++;
        }

        if (reconciled > 0) {
          console.log(
            `[App:STARTUP-RECONCILE] reconciled=${reconciled} tweaks from real Windows state`,
          );
        }

        // Part 3, timer-res auto-restart.
        // The timer-res agent dies when the app closes. If the user had it enabled,
        // restart it silently on startup rather than leaving it off.
        // Guard: skip if the slider-based keeper is already active (timer-resolution-slider
        // at a non-default value), that process survived the restart and is already holding
        // the resolution, so spawning the toggle agent would create a duplicate.
        const timerResStatus = results["timer-res"] as
          | { isApplied?: boolean; applied?: boolean; unsupported?: boolean }
          | undefined;
        const timerResWasEnabled = prevEnabled["timer-res"] === true;
        const timerResIsRunning = timerResStatus
          ? (timerResStatus.isApplied ?? timerResStatus.applied ?? false)
          : false;
        const sliderKeeperActive = (() => {
          try {
            const sv = useStore.getState().sliderValues ?? {};
            const ms10 = sv["timer-resolution-slider"] ?? 156;
            return ms10 < 156; // slider keeper alive means resolution is already held
          } catch { return false; }
        })();
        if (timerResWasEnabled && !timerResIsRunning && !timerResStatus?.unsupported && !sliderKeeperActive) {
          console.log(
            "[App:STARTUP-RECONCILE] timer-res: was enabled, agent not running, auto-restarting",
          );
          api.execute("timer-res", "apply").catch((e: unknown) => {
            console.warn("[App:STARTUP-RECONCILE] timer-res auto-restart failed:", e);
          });
        }

        // Part 4, power-mode-overlay auto-re-apply.
        // On some systems the Best Performance overlay resets to Balanced after reboot.
        // Re-apply silently if the user had it enabled but it's no longer active.
        const overlayStatus = results["power-mode-overlay"] as
          | { isApplied?: boolean; applied?: boolean; unsupported?: boolean }
          | undefined;
        const overlayWasEnabled = prevEnabled["power-mode-overlay"] === true;
        const overlayIsApplied = overlayStatus
          ? (overlayStatus.isApplied ?? overlayStatus.applied ?? false)
          : false;
        if (overlayWasEnabled && !overlayIsApplied && !overlayStatus?.unsupported) {
          console.log(
            "[App:STARTUP-RECONCILE] power-mode-overlay: was enabled, not active, auto-re-applying",
          );
          api.execute("power-mode-overlay", "apply").catch((e: unknown) => {
            console.warn("[App:STARTUP-RECONCILE] power-mode-overlay auto-re-apply failed:", e);
          });
        }

        // Part 5, Persist verified state back to tweak-state.json.
        // Keeps the local cache accurate so the next cold start reflects real
        // Windows state without waiting for a fresh batchCheck.
        if (Object.keys(verifiedStateMap).length > 0) {
          api.saveVerifiedState(verifiedStateMap).catch((e: unknown) => {
            console.warn("[App:STARTUP-RECONCILE] saveVerifiedState failed:", e);
          });
        }

        // Part 6, Detect silently reverted tweaks and surface root-cause.
        // A tweak is "silently reverted" if prevEnabled says it was ON but the
        // verified live state is OFF (Windows Tamper Protection or missing elevation
        // is the most common cause).
        const silentlyReverted = Object.keys(prevEnabled).filter(
          (id) => prevEnabled[id] === true && verifiedStateMap[id] === false,
        );

        // Fetch admin status and security status in parallel, both are needed
        // to show the most accurate root-cause message.
        const [adminResult, securityResult] = await Promise.allSettled([
          (window as any).electronAPI?.isAdmin?.() as Promise<boolean>,
          (window as any).electronAPI?.security?.getStatus?.() as Promise<any>,
        ]);

        const isAdminVal: boolean | null =
          adminResult.status === "fulfilled" && typeof adminResult.value === "boolean"
            ? adminResult.value
            : null;
        const tamperVal: boolean | null =
          securityResult.status === "fulfilled" &&
          securityResult.value?.available &&
          securityResult.value?.data?.tamperProtection != null
            ? (securityResult.value.data.tamperProtection as boolean)
            : null;

        setSystemConditions(isAdminVal, tamperVal);
        console.log(
          `[App:STARTUP-RECONCILE] conditions isAdmin=${isAdminVal} tamperProtection=${tamperVal}`,
        );

        if (silentlyReverted.length > 0) {
          const reasons: string[] = [];
          if (tamperVal === true) reasons.push("Tamper Protection is on");
          if (isAdminVal === false) reasons.push("app not running as Administrator");
          const reasonStr =
            reasons.length > 0 ? reasons.join(", ") : "Windows policy";
          console.warn(
            `[App:STARTUP-RECONCILE] ${silentlyReverted.length} tweak(s) were silently reverted, ${reasonStr}`,
          );
          toast({
            title: `${silentlyReverted.length} tweak${silentlyReverted.length === 1 ? "" : "s"} reverted by Windows`,
            description: `${reasonStr.charAt(0).toUpperCase() + reasonStr.slice(1)}. Open the Tweaks page for details.`,
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("[App:STARTUP-RECONCILE] batch check failed:", err);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the telemetry WebSocket ~2s after the user is authenticated.
  // The short delay prevents the WebSocket connect + first data burst from
  // competing with startup animations and initial render, keeping the app
  // entry smooth on low-end CPUs.
  useEffect(() => {
    if (phase !== "authenticated") return;
    telemetryManager.startWhenIdle();
  }, [phase]);


  // Recovery: if the WS was rejected (no_token) during startup because the
  // JWT wasn't ready yet, re-start the manager as soon as a fresh JWT lands.
  // The `start()` call is idempotent when already running, so this is safe.
  useEffect(() => {
    if (phase !== "authenticated") return;
    if (!jwt) return;
    if (!telemetryManager.authRejected) return;
    console.log(
      "[Telemetry] JWT now available after prior auth rejection, restarting manager",
    );
    telemetryManager.startWhenIdle();
  }, [jwt, phase]);

  // React to the "Real-time Metrics" toggle.
  // When disabled the telemetry WS stays connected but messages are discarded,
  // so re-enabling instantly resumes without a reconnect.
  useEffect(() => {
    // Dashboard telemetry is product UI, not an optional background service.
    // Keep it alive even if a stale/persisted preference is false during boot;
    // otherwise this effect can pause immediately after the route sets mode=full,
    // leaving LiveGraph stuck on its initial loading state until a route switch.
    const path = window.location.pathname;
    const dashboardRoute = path === "/" || path === "/dashboard";
    if (realtimeMetricsEnabled || dashboardRoute) {
      if (telemetryManager.demandMode !== "paused") {
        telemetryManager.resume();
      }
    } else {
      telemetryManager.pause();
    }
  }, [realtimeMetricsEnabled]);

  // Hidden/minimized is always a hard telemetry boundary. Live stats are
  // useful only while the dashboard is visible, so background polling must
  // stop by default rather than being an opt-in power preference.
  useEffect(() => {
    const pauseIfBackgrounded = () => {
      telemetryManager.pause();
    };
    const resumeIfVisible = () => {
      // The explicit Real-time Metrics toggle remains the higher-priority
      // user control. A hidden window can never force metrics back on.
      if (
        realtimeMetricsEnabled &&
        telemetryManager.demandMode !== "paused" &&
        !document.hidden &&
        document.hasFocus()
      ) {
        telemetryManager.resume();
      }
    };
    const resumeFromElectronFocus = () => {
      // Chromium's document.hasFocus() can remain false during Electron's
      // first-frame/window-show handoff even though the native window is
      // visibly focused. Trust the authenticated native focus signal; the
      // main process has already applied its own hide/minimize boundary.
      if (
        realtimeMetricsEnabled &&
        telemetryManager.demandMode !== "paused" &&
        !document.hidden
      ) {
        telemetryManager.resume();
      }
    };
    const syncVisibility = () => {
      if (document.hidden || !document.hasFocus()) {
        pauseIfBackgrounded();
      } else {
        resumeIfVisible();
      }
    };
    // Run immediately so toggling the setting applies right away even if the
    // window is already hidden.
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("blur", pauseIfBackgrounded);
    window.addEventListener("focus", resumeIfVisible);
    const unsubscribeElectronFocus =
      (window as any).electronAPI?.onWindowFocus?.(resumeFromElectronFocus) ?? null;
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("blur", pauseIfBackgrounded);
      window.removeEventListener("focus", resumeIfVisible);
      unsubscribeElectronFocus?.();
    };
  }, [realtimeMetricsEnabled]);

  // login_success → next phase.
  // First-time users: 500ms (welcome animation plays next, no need to hold long).
  // Returning users: 300ms (get to dashboard quickly, no welcome to wait for).
  useEffect(() => {
    if (phase !== "login_success") return;
    const delay = isFirstLogin ? 500 : 300;
    const t = setTimeout(() => {
      if (isFirstLogin) {
        const languageKey = user?.id
          ? `sc_language_prompt_seen_${user.id}`
          : null;
        setPhase(
          user?.loggedIn && user.id && languageKey && !localStorage.getItem(languageKey)
            ? "language"
            : "welcome",
        );
      } else {
        setPhase("authenticated");
        setLocation("/dashboard");
      }
    }, delay);
    return () => clearTimeout(t);
  }, [phase, isFirstLogin]);

  useEffect(() => {
    if (phase !== "authenticated") return;
    if (!user?.loggedIn) return;
    if (entitlementsAttempted) return;

    // Guard against setState-after-unmount: if the component unmounts while
    // refreshEntitlements() is in flight (e.g. user navigates away during login),
    // none of the .then/.catch/.finally branches should fire setState.
    let mounted = true;

    console.log(
      "[Entitlements] post-auth hydration begin, cached isPremium:",
      user?.isPremium,
      "plan:",
      user?.plan,
    );
    console.log(
      "[PremiumTruth] entitlement fetch start, cached isPremium:",
      user?.isPremium,
    );
    refreshEntitlements()
      .then((result) => {
        if (!mounted) return;
        console.log(
          "[Entitlements] post-auth hydration result, isPremium:",
          result.user?.isPremium ?? "null",
          "plan:",
          result.user?.plan ?? "null",
        );
        console.log(
          "[PremiumTruth] entitlement fetch result, isPremium:",
          result.user?.isPremium ?? "null (no user)",
        );
        if (result.verified && result.user) {
          setEntitlementsOk(true);
          setEntitlementsVerified(true);
          usePremiumGraceStore
            .getState()
            .setVerified(
              result.user.isPremium,
              result.user.plan ?? null,
              result.user.id ?? null,
            );
          console.log(
            "[Entitlements] grace store updated, isPremium:",
            result.user.isPremium,
            "plan:",
            result.user.plan,
          );
        } else if (result.verified) {
          console.warn(
            "[Entitlements] server returned no user, checking grace store for fallback",
          );
          console.warn(
            "[PremiumTruth] backend returned no user, checking grace store",
          );
          console.warn(
            "[Entitlements] server returned no user; grace data is not sufficient for cloud verification",
          );
        } else {
          console.warn(
            "[Entitlements] cloud verification unavailable, preserving prior verification state",
          );
          console.warn(
            "[PremiumTruth] cached user preserved, entitlement verification unchanged",
          );
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn(
          "[Entitlements] post-auth hydration error, checking grace store:",
          err,
        );
        console.warn(
          "[PremiumTruth] entitlement fetch failed, checking grace store fallback",
        );
         // Do not promote a grace snapshot after an unexpected refresh error.
         // The prior verification state is intentionally preserved unchanged.
      })
      .finally(() => {
        if (!mounted) return;
        setEntitlementsAttempted(true);
      });
    return () => { mounted = false; };
  }, [phase, user?.loggedIn, entitlementsAttempted]);

  // Phase-stabilization gate: let the dashboard's fade-in finish before any
  // tour overlay is allowed to mount.
  //
  // Welcome exit is now 0.7s. Dashboard fade-in is 0.35s with no delay.
  // 500ms for both paths gives a comfortable buffer after the animations settle.
  useEffect(() => {
    if (phase !== "authenticated") {
      setIsPhaseStable(false);
      return;
    }
    const delay = 500;
    console.log(
      `[TourTransition] phase entered authenticated, waiting ${delay}ms for dashboard to stabilize`,
    );
    const t = setTimeout(() => {
      setIsPhaseStable(true);
      console.log("[TourTransition] dashboard stable, tours unblocked");
    }, delay);
    return () => clearTimeout(t);
  }, [phase, isFirstLogin]);

  // When an admin re-grants a trial, the server resets hasSeenTrialActivation
  // and hasSeenTrialTour to false. Clear the matching session-level refs so the
  // flow eval can fire the trial sequence again within the same app session.
  useEffect(() => {
    if (user?.hasSeenTrialActivation === false)
      trialUnlockFiredRef.current = false;
  }, [user?.hasSeenTrialActivation]);

  useEffect(() => {
    if (user?.hasSeenTrialTour === false)
      trialTourFiredThisSessionRef.current = false;
  }, [user?.hasSeenTrialTour]);

  // When admin re-grants premium the server resets hasSeenPremiumUnlock to false.
  // Clear the session-level ref so the flow eval can fire the animation again.
  useEffect(() => {
    if (user?.hasSeenPremiumUnlock === false)
      unlockFiredThisSessionRef.current = false;
  }, [user?.hasSeenPremiumUnlock]);

  // Admin.tsx calls triggerFlowReset() after granting/revoking premium or trial.
  // This clears all in-session animation guards so the AppFlow can re-eval immediately,
  // even if the flag values haven't changed (e.g. hasSeenPremiumUnlock was already false).
  useEffect(() => {
    if (flowResetTs === 0) return;
    console.log(
      "[AppFlow] flowResetTs fired, clearing all session guards for re-eval",
    );
    unlockFiredThisSessionRef.current = false;
    trialUnlockFiredRef.current = false;
    trialTourFiredThisSessionRef.current = false;
    premiumTourFiredThisSessionRef.current = false;
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      localStorage.removeItem(`sc_unlock_seen_${userId}`);
      localStorage.removeItem(`sc_tour_seen_${userId}`);
      localStorage.removeItem(`sc_trial_tour_seen_${userId}`);
    }
  }, [flowResetTs]);

  useEffect(() => {
    if (isResetting) return;
    if (suppressFlowsRef.current) return;
    if (isSigningOut) return;
    if (!user?.loggedIn) return;
    if (phase !== "authenticated") return;
    if (!isPhaseStable) return;
    if (activeFlow !== "none") return;
    if (
      showDisclaimer ||
      showPendingActivation ||
      showPatchNotes ||
      revertModalOpen ||
      promoOpen
    ) return;

    const userId = user.id;
    const tourKey = `sc_tour_completed_${userId}`;
    const isFirstTimeUser = !localStorage.getItem(tourKey);

    console.log(
      "[AppFlow] Flow eval, isPremium:",
      user.isPremium,
      "plan:",
      user.plan,
      "trialEndsAt:",
      user.trialEndsAt,
      "hasSeenTrialActivation:",
      user.hasSeenTrialActivation,
      "hasSeenTrialTour:",
      user.hasSeenTrialTour,
      "hasSeenUnlock:",
      user.hasSeenPremiumUnlock,
      "hasSeenTour:",
      user.hasSeenPremiumTour,
      "isFirstTimeUser:",
      isFirstTimeUser,
      "isFirstLogin:",
      isFirstLogin,
      "entitlementsAttempted:",
      entitlementsAttempted,
      "entitlementsOk:",
      entitlementsOk,
      "unlockFired:",
      unlockFiredThisSessionRef.current,
      "trialUnlockFired:",
      trialUnlockFiredRef.current,
    );

    if (isFirstTimeUser && isFirstLogin && entitlementsAttempted) {
      console.log("[AppFlow] PRIORITY 1: First-time onboarding tour");
      setActiveFlow("firstTime");
      return;
    }

    if (!entitlementsOk) {
      console.log(
        "[AppFlow] Waiting for entitlementsOk, skipping premium flow checks",
      );
      return;
    }

    const trialOngoing = isTrialActive(user.plan, user.trialEndsAt);

    // PRIORITY 2: Trial activation (animation removed, go straight to tour)
    // Mark hasSeenTrialActivation=true immediately so we don't loop, fire the
    // server save in the background, then jump directly to the tour.
    if (
      trialOngoing &&
      user.hasSeenTrialActivation === false &&
      !trialUnlockFiredRef.current
    ) {
      console.log(
        "[AppFlow] PRIORITY 2: Trial, skipping animation, going straight to tour",
        { plan: user.plan, trialEndsAt: user.trialEndsAt },
      );
      trialUnlockFiredRef.current = true;
      // Optimistically mark seen in store so the AppFlow won't re-fire this branch
      const store = useAuthStore.getState();
      if (store.user)
        store.setUser({ ...store.user, hasSeenTrialActivation: true });
      postTrialActivationSeen().catch(() => {});
      // Go straight to tour
      trialTourFiredThisSessionRef.current = true;
      setActiveFlow("trialTour");
      return;
    }

    // PRIORITY 3: Trial guided tour
    // Guards: server-side hasSeenTrialTour (cross-session) +
    //         trialTourFiredThisSessionRef (same-session dedup).
    if (
      trialOngoing &&
      user.hasSeenTrialTour === false &&
      !trialTourFiredThisSessionRef.current
    ) {
      console.log("[AppFlow] PRIORITY 3: Trial tour, triggering", {
        plan: user.plan,
        trialEndsAt: user.trialEndsAt,
        hasSeenTrialTour: user.hasSeenTrialTour,
      });
      trialTourFiredThisSessionRef.current = true;
      setActiveFlow("trialTour");
      return;
    }

    // localStorage keys, act as a permanent local guard even if server save fails.
    // If the server has explicitly reset hasSeenPremiumUnlock to false (e.g. admin
    // re-grants premium), clear the local guard so the animation can replay.
    const localUnlockKey = `sc_unlock_seen_${userId}`;
    const localTourKey = `sc_tour_seen_${userId}`;
    if (user.hasSeenPremiumUnlock === false)
      localStorage.removeItem(localUnlockKey);
    const localUnlockSeen = localStorage.getItem(localUnlockKey) === "1";
    const localTourSeen = localStorage.getItem(localTourKey) === "1";

    if (
      user.isPremium === true &&
      !trialOngoing &&
      user.hasSeenPremiumUnlock === false &&
      !localUnlockSeen &&
      !unlockFiredThisSessionRef.current
    ) {
      console.log(
        "[AppFlow] PRIORITY 4: Premium unlock animation, triggering",
      );
      localStorage.setItem(localUnlockKey, "1"); // guard immediately so restart can't re-trigger
      unlockFiredThisSessionRef.current = true;
      setActiveFlow("premiumUnlock");
      return;
    }

    if (
      user.isPremium === true &&
      !trialOngoing &&
      user.hasSeenPremiumTour === false &&
      !localTourSeen &&
      !premiumTourFiredThisSessionRef.current
    ) {
      console.log("[AppFlow] PRIORITY 5: Premium guided tour");
      localStorage.setItem(localTourKey, "1"); // guard immediately
      premiumTourFiredThisSessionRef.current = true;
      setActiveFlow("premiumTour");
      return;
    }

    console.log("[AppFlow] No flow conditions met, staying idle");
  }, [
    user?.loggedIn,
    user?.isPremium,
    user?.plan,
    user?.trialEndsAt,
    user?.hasSeenPremiumUnlock,
    user?.hasSeenPremiumTour,
    user?.hasSeenTrialActivation,
    user?.hasSeenTrialTour,
    phase,
    activeFlow,
    isFirstLogin,
    entitlementsAttempted,
    entitlementsOk,
    isResetting,
    isPhaseStable,
    flowResetTs,
    showDisclaimer,
    showPendingActivation,
    showPatchNotes,
    isSigningOut,
    revertModalOpen,
    promoOpen,
  ]);

  const activeFlowRef = React.useRef<AppFlow>(activeFlow);
  activeFlowRef.current = activeFlow;

  // Track when window last lost focus, used to skip brief focus-loss from dialogs/file pickers
  const lastBlurTimeRef = React.useRef<number>(0);
  const lastEntitlementRefreshRef = React.useRef<number>(0);
  // F-6: Guard against concurrent entitlement refreshes. Without it, a focus
  // event firing while a visibilitychange-triggered refresh is still in flight
  // (or vice versa) launches a second /api/me call that races with the first
  // and can stomp the newer response with stale data.
  const entitlementRefreshInFlightRef = React.useRef<boolean>(false);
  // Minimum ms the window must be out of focus before we treat it as a real app-switch
  const FOCUS_AWAY_THRESHOLD_MS = 3000;
  // Minimum ms between focus-triggered entitlement refreshes to avoid hammering the server.
  // Kept low so that after an admin grant the next window-focus event reflects the
  // new plan quickly. Direct store patches (from handlePlanUpdated) bypass this entirely.
  const ENTITLEMENT_REFRESH_COOLDOWN_MS = 30_000;

  useEffect(() => {
    if (!user?.loggedIn || phase !== "authenticated") return;

    const handleBlur = () => {
      lastBlurTimeRef.current = Date.now();
    };

    // F-6: Single guarded refresh path used by both visibilitychange and focus.
    // Returns true if it actually fired so callers don't double-update timestamps.
    const safeRefresh = async (label: string): Promise<void> => {
      if (entitlementRefreshInFlightRef.current) return;
      entitlementRefreshInFlightRef.current = true;
      console.log(`[App] ${label}, refreshing entitlements...`);
      try {
        await refreshEntitlements();
      } finally {
        entitlementRefreshInFlightRef.current = false;
      }
    };

    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        activeFlowRef.current === "none"
      ) {
        const now = Date.now();
        const sinceLastRefresh = now - lastEntitlementRefreshRef.current;
        if (sinceLastRefresh < ENTITLEMENT_REFRESH_COOLDOWN_MS) return;
        if (entitlementRefreshInFlightRef.current) return;
        lastEntitlementRefreshRef.current = now;
        await safeRefresh("App visible");
      }
    };

    const handleFocus = async () => {
      if (activeFlowRef.current !== "none") {
        console.log("[App] Window focused but flow active, skipping refresh");
        return;
      }
      const awayMs = Date.now() - lastBlurTimeRef.current;
      // Skip if focus returned quickly, indicates a child dialog (file picker, etc.), not an app-switch
      if (awayMs < FOCUS_AWAY_THRESHOLD_MS && lastBlurTimeRef.current > 0)
        return;
      const now = Date.now();
      const sinceLastRefresh = now - lastEntitlementRefreshRef.current;
      if (sinceLastRefresh < ENTITLEMENT_REFRESH_COOLDOWN_MS) return;
      if (entitlementRefreshInFlightRef.current) return;
      lastEntitlementRefreshRef.current = now;
      await safeRefresh("Window focused");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user?.loggedIn, phase]);

  useEffect(() => {
    if (!isElectron) return;

    const api = (window as any).electronAPI;

    if (api?.onWindowFocus) {
      // Passive handler only, must not reinitialize app state, clear auth,
      // reset routing, remount layout trees, or destroy active page state.
      // Overlay clearing (data-overlay DOM mutations) was causing blank-screen
      // regressions on Alt-Tab return; removed entirely.
      const unsub = api.onWindowFocus(() => {
        console.log("[App] Electron window focus (passive)");
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (phase !== "authenticated") return;
    if (activeFlow !== "none") return;
    if (patchNotesCheckedRef.current) return;
    // Never show patch notes to brand-new users, they haven't used a prior
    // version so there's nothing "new" to highlight, and it would clash with
    // the onboarding tour that fires on first login.
    if (isFirstLogin) return;
    // Wait for entitlements to be confirmed first, this ensures the flow eval
    // has already run (and set activeFlow to "trialTour" etc. if needed) before
    // we decide to show patch notes. Without this guard, patch notes can pop up
    // over the top of the trial activation tour.
    if (!entitlementsAttempted) return;
    if (promoOpen) return;
    patchNotesCheckedRef.current = true;

    let mounted = true;
    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then((notes: { version: string }) => {
        if (!mounted) return;
        const lastSeen = localStorage.getItem(PATCH_NOTES_STORAGE_KEY);
        if (notes.version !== lastSeen) {
          setShowPatchNotes(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [phase, activeFlow, isFirstLogin, entitlementsAttempted, promoOpen]);

  // ── Splash completion, Splash.tsx is the sole timing authority ─────────
  // Splash calls onComplete() when its exit animation finishes.
  // CameraGlow fires here, not on a raw timer, so it never overlaps the splash.

  useEffect(() => {
    if (!isElectron) return;
    console.log("[App] Registering deep link auth callback (once)");
    const api = (window as any).electronAPI;

    let mounted = true; // P3-DL1: guard setState in async IPC deep-link callback
    const unsubAuth = api.auth.onCallback(async (url: string) => {
      console.log("[DeepLink] ===== RENDERER CALLBACK RECEIVED =====");
      console.log("[DeepLink] URL:", url);
      useAuthStore.getState().setElectronAuthState("callback_received");

      try {
        const parsed = new URL(url);
        const authCode =
          parsed.searchParams.get("code") || parsed.searchParams.get("token");
        const provider = parsed.searchParams.get("provider");
        const premiumActivated =
          parsed.searchParams.get("premium_activated") === "true";
        const currentUser = useAuthStore.getState().user;

        console.log(
          "[DeepLink] parsed, code:",
          authCode ? "present" : "missing",
          "provider:",
          provider,
          "premiumActivated:",
          premiumActivated,
          "currentUserLoggedIn:",
          currentUser?.loggedIn,
        );

        if (premiumActivated && currentUser?.loggedIn) {
          console.log(
            "[PremiumFlow] Premium purchase return, user already logged in, refreshing entitlements...",
          );

          const result = await retryRefreshEntitlements({
            attempts: 8,
            baseDelayMs: 500,
            initialDelayMs: 500,
          });

          if (!mounted) return; // P3-DL1: bail if effect cleaned up mid-await
          if (result.ok && result.user?.isPremium) {
            console.log(
              "[PremiumFlow] Premium confirmed, hasSeenUnlock:",
              result.user.hasSeenPremiumUnlock,
              "hasSeenTour:",
              result.user.hasSeenPremiumTour,
            );
            console.log("[Premium] Updated user:", result.user.plan);
            setEntitlementsOk(true);
            setEntitlementsVerified(true);
            setTimeout(() => triggerFlowReset(), 0);
            useAuthStore.getState().setElectronAuthState("authenticated");
            return;
          }

          console.warn(
            "[PremiumFlow] Premium not confirmed after retries, showing pending modal",
          );
          setShowPendingActivation(true);
          useAuthStore.getState().setElectronAuthState("authenticated");
          return;
        }

        if (authCode) {
          useAuthStore.getState().setElectronAuthState("exchanging");
          useAuthStore.getState().setValidating(true);

          // No hard timeout, let the exchange run to completion.
          // The fetch() has its own browser-level timeout; our 15 s race was
          // cutting off valid (but slow) OAuth sessions before the server
          // responded, then treating a transient network delay as a failure.
          const exchangedUser = await exchangeToken(authCode);
          if (!mounted) return; // P3-DL2: bail if effect cleaned up mid-await

          if (exchangedUser) {
            useAuthStore.getState().setToken(authCode);
            useAuthStore.getState().setUser(exchangedUser);
            useAuthStore.getState().setElectronAuthState("authenticated");
            console.log(
              `[Auth] exchange success, user=${exchangedUser.id} provider=${provider}`,
            );

            const welcomeKey = `sc_welcomed_${exchangedUser.id}`;
            const hasBeenWelcomed = localStorage.getItem(welcomeKey);
            // Read the live phase, phaseRef is updated every render so this
            // is always the current value even though this callback was
            // registered once with [] deps.
            const livePhase = phaseRef.current;

            const isGenuinelyNewUser = exchangedUser.hasInstalledApp === false;
            if (!hasBeenWelcomed && isGenuinelyNewUser) {
              setIsFirstLogin(true);
              localStorage.setItem(welcomeKey, "true");
              if (
                livePhase === "authenticated" ||
                livePhase === "welcome" ||
                livePhase === "disclaiming" ||
                livePhase === "language"
              ) {
                // Boot fast-path already moved us to "welcome" (or beyond) before
                // the deep-link arrived, any login_success transition here would
                // flash the login screen over the welcome animation.  Only jump to
                // "welcome" if we're not already there or past it.
                console.log(
                  `[Auth] first-time user but phase=${livePhase}, deep-link arrived late, no login flash`,
                );
                if (livePhase === "authenticated") {
                  setPhase("welcome");
                }
                // "welcome" / "disclaiming" / "language", already in the right
                // animation or required first-session gate; leave it alone.
              } else {
                // Normal path: login screen is visible, do the clean two-step
                // login_success → welcome transition.
                setPhase("login_success");
              }
            } else {
              // Returning user, including an existing account on a fresh
              // local profile. The server marker is authoritative; an empty
              // AppData folder must not manufacture a first-run experience.
              if (!hasBeenWelcomed) {
                localStorage.setItem(welcomeKey, "true");
              }
              if (
                livePhase === "authenticated" ||
                livePhase === "welcome" ||
                livePhase === "disclaiming" ||
                livePhase === "language"
              ) {
                // Already showing the app (fast-path boot beat the deep-link).
                // Navigate to dashboard without flashing the login screen,
                // except when the required language gate is already active.
                console.log(
                  `[Auth] returning user, phase=${livePhase}, navigating to dashboard`,
                );
                if (livePhase === "language") {
                  // The cached-session fast path may have mounted the required
                  // language gate before this late callback arrived. Never let
                  // the callback bypass that gate.
                  console.log(
                    "[Auth] callback arrived while language gate is active; leaving gate mounted",
                  );
                } else {
                  if (livePhase !== "authenticated") setPhase("authenticated");
                  setLocation("/dashboard");
                }
              } else {
                // Login screen is visible, do the polished blur-exit.
                setPhase("login_success");
              }
            }

            if (premiumActivated) {
              console.log(
                "[PremiumFlow] Exchange + premiumActivated, retrying entitlements...",
              );
              const premResult = await retryRefreshEntitlements({
                attempts: 8,
                baseDelayMs: 500,
                initialDelayMs: 300,
              });
              if (!mounted) return; // P3-DL3: bail after second await
              if (premResult.ok && premResult.user?.isPremium) {
                console.log("[PremiumFlow] Premium confirmed after login");
              } else {
                console.warn(
                  "[PremiumFlow] Premium not confirmed, showing pending",
                );
                setShowPendingActivation(true);
              }
            }
          } else {
            console.error("[Auth] Exchange failed, setting unauthenticated");
            // clear() resets electronAuthState to 'idle' and oauthError to null,
            // so set them AFTER the clear to avoid overwriting.
            useAuthStore.getState().clear();
            useAuthStore.getState().setElectronAuthState("failed");
            useAuthStore
              .getState()
              .setOauthError("Login failed. Please try again.");
            setPhase("unauthenticated");
          }
          useAuthStore.getState().setValidating(false);
        } else if (!premiumActivated) {
          console.log(
            "[DeepLink] No code and no premium flag, going to login",
          );
          useAuthStore.getState().setElectronAuthState("failed");
          useAuthStore
            .getState()
            .setOauthError("Login failed, no authentication code received.");
          setPhase("unauthenticated");
        }
      } catch (err) {
        console.error("[DeepLink] Error processing callback:", err);
        useAuthStore.getState().setElectronAuthState("failed");
        useAuthStore
          .getState()
          .setOauthError("Login failed. Please try again.");
        useAuthStore.getState().setValidating(false);
        setPhase("unauthenticated");
      }
    });

    return () => {
      mounted = false;
      unsubAuth();
    }; // P3-DL1
  }, []);

  useEffect(() => {
    if (!splashDone) return;
    // Activate CameraGlow immediately, no rAF delay needed. The GPU layer is
    // consolidated into a single filter:blur(12px) wrapper so there is no
    // compositor-stall risk from multiple simultaneous layer promotions.
    setShowGlow(true);

    let mounted = true; // P3-BA1: guard all setState after await in boot auth sequence
    const checkAuth = async () => {
      const hasCredential = !!(token || jwt);
      console.log(
        "[AuthTruth] Boot: token present:",
        !!token,
        "jwt present:",
        !!jwt,
        "user present:",
        !!user,
        "premium:",
        user?.isPremium,
      );
      console.log(
        "[AuthTruth] startup restore begin, hasCredential:",
        hasCredential,
        "cached isPremium:",
        user?.isPremium ?? "n/a",
        "plan:",
        user?.plan ?? "n/a",
      );

      // ── Hardened startup order ──────────────────────────────────────────────────────────────────────
      // 1. Load stored user/JWT
      // 2. FAST PATH: if cached session exists, mount dashboard immediately with cached state
      //    (eliminates the 2-3s cloud round-trip from blocking first useful content)
      // 3. resolveAuthState() always runs, but is now non-blocking to UI when fast path fires
      // 4. Cloud result reconciles: confirms entitlementsVerified, or forces logout on 401
      //
      // Premium is NEVER downgraded on network/server failure.
      // Only downgrade when cloud explicitly says loggedIn=false or plan=free.
      // ────────────────────────────────────────────────────────────────────────────────

      // ── Fast path: cached session → show dashboard immediately ──────────────
      // If we have a stored logged-in user + JWT, render the dashboard right now
      // using cached premium state. resolveAuthState() runs below as a background
      // reconciliation, it updates entitlementsVerified and user data when the
      // cloud responds, without blocking first paint.
      // setEntitlementsAttempted(true) prevents the post-auth refreshEntitlements
      // effect from firing a redundant second /api/me call.
      const hasCachedSession = !!(user?.loggedIn && jwt);
      if (hasCachedSession) {
        console.log(
          "[AuthTruth] Boot: fast path, cached session, mounting dashboard immediately",
          "isPremium:", user?.isPremium, "plan:", user?.plan,
        );
        setEntitlementsOk(true);
        setEntitlementsAttempted(true); // suppress redundant post-auth /api/me call

        // A cached/grace snapshot may keep the shell from flashing a logged-out
        // view, but it is not cloud verification. Keep entitlementsVerified
        // false until resolveAuthState() receives an authoritative response;
        // premium expiry uses this boundary before mutating Windows.
        console.log(
          "[AuthTruth] Boot: cached session mounted; cloud entitlement verification pending",
        );

        const welcomeKeyFast = `sc_welcomed_${user!.id}`;
        const hasBeenWelcomedFast = localStorage.getItem(welcomeKeyFast);
        const isGenuinelyNewUserFast = user!.hasInstalledApp === false;
        if (!hasBeenWelcomedFast && isGenuinelyNewUserFast) {
          setIsFirstLogin(true);
          localStorage.setItem(welcomeKeyFast, "true");
          const languageKeyFast = `sc_language_prompt_seen_${user!.id}`;
          setPhase(
            !localStorage.getItem(languageKeyFast) ? "language" : "welcome",
          );
        } else {
          if (!hasBeenWelcomedFast) {
            localStorage.setItem(welcomeKeyFast, "true");
          }
          setIsFirstLogin(false);
          setPhase("authenticated");
        }
      }

      // ── Cloud reconciliation, always runs, non-blocking when fast path fired ──
      const authState = await resolveAuthState();
      if (!mounted) return; // P3-BA1: bail if app unmounted during network call
      console.log(
        `[AuthTruth] Boot resolved verified=${authState.verified} reason=${authState.reason} user=${authState.user ? "yes" : "no"}`,
      );

      if (!hasCachedSession) setEntitlementsAttempted(true);

      if (authState.verified && authState.user) {
        // Cloud confirmed, update entitlements and grace store
        setEntitlementsOk(true);
        setEntitlementsVerified(true);
        usePremiumGraceStore
          .getState()
          .setVerified(
            authState.user.isPremium,
            authState.user.plan ?? null,
            authState.user.id ?? null,
          );
        console.log(
          "[AuthTruth] Boot: cloud-confirmed, entitlementsVerified=true",
        );

        // Proactive reissue if JWT within 1 day of expiry
        if (isElectron && authState.jwt) {
          try {
            const parts = authState.jwt.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(
                atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
              );
              const nowSec = Math.floor(Date.now() / 1000);
              if (payload.exp && nowSec >= payload.exp - 86400) {
                console.log(
                  "[AuthTruth] Boot: JWT expiring within 24h, proactive reissue...",
                );
                tryReissueJwt().catch(() => {});
              }
            }
          } catch {
            // Non-critical
          }
        }

        // If fast path already navigated to dashboard, no phase change needed.
        // If slow path (no cached session), transition now.
        if (!hasCachedSession) {
          const targetUser = authState.user;
          const welcomeKey = `sc_welcomed_${targetUser.id}`;
          const hasBeenWelcomed = localStorage.getItem(welcomeKey);
          const isGenuinelyNewUser = targetUser.hasInstalledApp === false;
          if (!hasBeenWelcomed && isGenuinelyNewUser) {
            setIsFirstLogin(true);
            localStorage.setItem(welcomeKey, "true");
            const languageKey = `sc_language_prompt_seen_${targetUser.id}`;
            setPhase(
              !localStorage.getItem(languageKey) ? "language" : "welcome",
            );
          } else {
            if (!hasBeenWelcomed) {
              localStorage.setItem(welcomeKey, "true");
            }
            setIsFirstLogin(false);
            setPhase("authenticated");
          }
        }
        return;
      }

      if (authState.reason === "logged_out_by_cloud") {
        // Cloud explicitly rejected the session, clear and force login.
        // This handles the case where a cached session is no longer valid.
        console.warn("[AuthTruth] Boot: logged_out_by_cloud, forcing logout");
        try {
          storeLogout();
        } catch (error) {
          // Auth cleanup must never be able to strand the app on the boot screen.
          console.error("[AuthTruth] Boot: local logout cleanup failed, clearing auth store directly", error);
          try {
            useAuthStore.getState().clear();
          } catch (fallbackError) {
            console.error("[AuthTruth] Boot: direct auth-store cleanup also failed", fallbackError);
          }
        }
        setPhase("unauthenticated");
        return;
      }

      // Unverified (network/server error) but we have cached user, preserve it
      if (authState.user) {
        console.warn(
          "[AuthTruth] Boot: cloud unreachable, preserving cached session. isPremium cached=",
          authState.user.isPremium,
        );
        // Do NOT clear premium; mark unverified so device lock stays off
        setEntitlementsOk(true); // allow UI to proceed with cached data
        setEntitlementsVerified(false); // but mark as unverified (cloud not confirmed)
        // Grace can preserve the cached UI session, but it must not become
        // entitlementsVerified: premium expiry and native mutations require a
        // fresh cloud-confirmed entitlement.

        if (!hasCachedSession) {
          const targetUser = authState.user;
          const welcomeKey = `sc_welcomed_${targetUser.id}`;
          const hasBeenWelcomed = localStorage.getItem(welcomeKey);
          const isGenuinelyNewUser = targetUser.hasInstalledApp === false;
          if (!hasBeenWelcomed && isGenuinelyNewUser) {
            setIsFirstLogin(true);
            localStorage.setItem(welcomeKey, "true");
            const languageKey = `sc_language_prompt_seen_${targetUser.id}`;
            setPhase(
              !localStorage.getItem(languageKey) ? "language" : "welcome",
            );
          } else {
            if (!hasBeenWelcomed) {
              localStorage.setItem(welcomeKey, "true");
            }
            setIsFirstLogin(false);
            setPhase("authenticated");
          }
        }
        return;
      }

      // No user at all, show login
      if (!hasCachedSession) {
        setPhase("unauthenticated");
      } else {
        // Had a cached session but cloud returned no user, force logout
        console.warn("[AuthTruth] Boot: cached session invalidated by cloud, forcing logout");
        try {
          storeLogout();
        } catch (error) {
          // Auth cleanup must never be able to strand the app on the boot screen.
          console.error("[AuthTruth] Boot: local logout cleanup failed, clearing auth store directly", error);
          try {
            useAuthStore.getState().clear();
          } catch (fallbackError) {
            console.error("[AuthTruth] Boot: direct auth-store cleanup also failed", fallbackError);
          }
        }
        setPhase("unauthenticated");
      }
    };

    checkAuth();
    return () => {
      mounted = false;
    }; // P3-BA1
  }, [splashDone]);

  const handleLogout = async () => {
    if (isSigningOut) return; // prevent double-trigger
    console.log(
      "[Auth] logout called, starting cinematic sign-out transition",
    );

    // Capture userId now, the store is wiped by performFullLogout below.
    const logoutUserId = user?.id ?? null;

    // 0. Suspend flow evaluation and dismiss any active flow (tour, unlock
    //    animation, etc.). This must happen before the auth store is wiped;
    //    otherwise the evaluator can restart a first-run tour while sign-out
    //    is still transitioning.
    setIsSigningOut(true);
    clearTourState();
    setActiveFlow("none");

    // 1. Lock interactions and start the visual fade-out

    // 2. Kick off backend logout concurrently so network time is "free"
    const logoutPromise = performFullLogout("user_clicked_signout");

    // 3. Let the dashboard fade-out complete (0.95s) + brief black hold (350ms)
    await new Promise<void>((resolve) => setTimeout(resolve, 1300));

    // 4. Ensure the network call is done before switching phase
    await logoutPromise;

    // 4b. Clear the welcome key so the next login on this device re-shows
    //     the welcome animation (fresh-start feel after sign-out).
    //     We intentionally keep sc_tour_completed_* so the intro tour
    //     doesn't replay, only the welcome animation resets.
    if (logoutUserId) {
      localStorage.removeItem(`sc_welcomed_${logoutUserId}`);
    }

    // 5. Reset all per-session entitlement state so the next login cycle
    //    starts clean.  Without this, entitlementsAttempted stays true and
    //    the refreshEntitlements() effect skips on re-login, leaving
    //    entitlementsOk=false which collapses the app shell to a black screen.
    setEntitlementsAttempted(false);
    setEntitlementsOk(false);
    setEntitlementsVerified(false);
    setIsFirstLogin(false);
    setShowPendingActivation(false);
    setShowPatchNotes(false);

    // 6. Switch phase, login screen will animate in.
    //    Also clear isSigningOut so pointer-events are restored for the
    //    login screen; leaving it true made login buttons unclickable.
    setPhase("unauthenticated");
    setIsSigningOut(false);
    setLocation("/");
  };

  const handleSafeRefreshEntitlements = useCallback(async () => {
    suppressFlowsRef.current = true;
    console.log("[Entitlements] manual refresh begin");
    console.log("[PremiumTruth] modal-triggered entitlement fetch start");
    try {
      const result = await refreshEntitlements();
      console.log(
        "[Entitlements] manual refresh result, isPremium:",
        result.user?.isPremium ?? "null",
        "plan:",
        result.user?.plan ?? "null",
      );
      console.log(
        "[PremiumTruth] modal-triggered entitlement fetch result, isPremium:",
        result.user?.isPremium ?? "null (no user)",
      );
      if (result.verified && result.user) {
        setEntitlementsOk(true);
        setEntitlementsVerified(true);
        usePremiumGraceStore
          .getState()
          .setVerified(
            result.user.isPremium,
            result.user.plan ?? null,
            result.user.id ?? null,
          );
        console.log(
          "[Entitlements] manual refresh, grace store updated, UI unlocked",
        );
      } else if (result.verified) {
        console.warn(
          "[Entitlements] manual refresh, server returned no user, checking grace store",
        );
        console.warn(
          "[Entitlements] manual refresh returned no user; grace data is not sufficient for cloud verification",
        );
      } else {
        console.warn(
          "[Entitlements] manual refresh was not cloud-verified, preserving prior verification state",
        );
      }
      return result;
    } finally {
      setTimeout(() => {
        suppressFlowsRef.current = false;
      }, 500);
    }
  }, []);

  const handleFactoryReset = async () => {
    console.log("[AppFlow] Factory reset, kill switch activated");
    setIsResetting(true);
    setActiveFlow("none");
    await postResetTourFlags();

    // Revert while the ownership/baseline files still exist. Wiping AppData
    // first would destroy the exact values needed to restore premium changes.
    if (isElectron) {
      try {
        const revertReport = await runPremiumRevert();
        const revertItems = [
          ...revertReport.tweakResults,
          ...revertReport.sliderResults,
          ...revertReport.presetResults,
          ...revertReport.networkResults,
        ];
        const revertIncomplete = revertReport.anyFailed ||
          revertReport.powerPlan.status === "failed" ||
          revertItems.some((item) => item.status === "failed" || item.status === "skipped_not_active");

        if (revertIncomplete) {
          console.error("[AppFlow] Factory reset blocked, premium changes were not fully reverted", revertReport);
          setIsResetting(false);
          window.alert(
            "Factory reset was stopped because some SwitchControl changes could not be safely reverted. Resolve the failed revert first, then try again."
          );
          return;
        }
      } catch (error) {
        console.error("[AppFlow] Factory reset blocked, premium revert failed", error);
        setIsResetting(false);
        window.alert(
          "Factory reset was stopped because SwitchControl could not verify its system changes were reverted."
        );
        return;
      }
    }

    await performFullLogout("factory_reset");
    clearSwitchControlStorage();
    if (isElectron && (window as any).electronAPI?.resetAppData) {
      await (window as any).electronAPI.resetAppData();
    } else {
      window.location.reload();
    }
  };

  // Resolve effective premium status: server value is authoritative for paid plans,
  // but for trial users we also gate on the local trial-end timestamp so the UI
  // locks immediately when the timer fires, without waiting for a server round-trip.
  const _isTrialUser = user?.plan === "trial";
  const _trialStillValid = isTrialActive(
    user?.plan ?? "",
    user?.trialEndsAt ?? null,
  );
  const _resolvedIsPremium =
    (user?.isPremium ?? false) && (!_isTrialUser || _trialStillValid);

  const authContextValue: AppAuthContextValue = {
    user: user,
    isPremium: entitlementsVerified && _resolvedIsPremium,
    entitlementsVerified,
    isSigningOut,
    logout: handleLogout,
    factoryReset: handleFactoryReset,
    safeRefreshEntitlements: handleSafeRefreshEntitlements,
  };
  console.log(
    "[PremiumTruth] authContextValue, entitlementsVerified:",
    entitlementsVerified,
    "isPremium:",
    authContextValue.isPremium,
    "storedIsPremium:",
    user?.isPremium,
  );

  return (
    <AppAuthContext.Provider value={authContextValue}>
      <UpgradeModalProvider>
        <CameraGlow active={showGlow} onComplete={() => setShowGlow(false)} />

        {/* ── Resetting overlay, covers the blank while factory reset runs ── */}
        {isResetting && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: "#14181D" }}
          >
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 70% 55% at 50% 48%, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.06) 40%, transparent 65%)",
              }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative z-10 flex flex-col items-center gap-5">
              <div className="w-10 h-10 rounded-full border-2 border-text-[#00D4FF]/30 border-t-text-[#00D4FF] animate-spin" />
              <p
                className="text-sm text-white/40 tracking-widest uppercase"
                style={{ letterSpacing: "0.18em" }}
              >
                Resetting…
              </p>
            </div>
          </div>
        )}

        {/* ── Persistent atmospheric background ─────────────────────────────
          Always mounted, always opacity:1, never conditionally hidden.
          The Splash at zIndex:1 covers it during startup so there is no need
          to hide it; keeping it opaque prevents any white-flash gap during
          the Splash → Booting transition. During authenticated phase the
          AppLayout AppBackground layers on top, both are transparent so
          the glows breathe through. */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 0,
            background: "#14181D",
          }}
        >
          {/* Static centre glow, no JS interpolation */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 90% 60% at 50% 48%, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.07) 35%, transparent 60%)",
            }}
          />
          {/* CSS-animated accents, compositor-only, zero JS frames */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 28% 18%, rgba(236,72,153,0.10) 0%, transparent 42%)",
              animation: "sc-auth-pink 6s ease-in-out infinite",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 72% 78%, rgba(56,189,248,0.08) 0%, transparent 40%)",
              animation: "sc-auth-cyan 7.5s ease-in-out 1.2s infinite",
            }}
          />
        </div>

        <AnimatePresence mode="wait">
          {phase === "splash" && (
            <motion.div
              key="splash"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
              className="h-full"
              style={{ position: "absolute", inset: 0, zIndex: 1 }}
            >
              <Splash
                onComplete={() => {
                  setPhase("booting");
                  setSplashDone(true);
                }}
              />
            </motion.div>
          )}

          {phase === "booting" && (
            <motion.div
              key="booting"
              initial={{ opacity: 1 }}
              animate={{
                opacity: 1,
                transition: { duration: 0.35, ease: "easeOut" },
              }}
              exit={{
                opacity: 0,
                transition: { duration: 0.45, ease: "easeIn" },
              }}
              style={{ position: "absolute", inset: 0, zIndex: 1 }}
              className="h-full flex items-center justify-center"
            >
              {backendError ? (
                <div className="flex flex-col items-center gap-4 max-w-xs text-center px-8">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}
                  >
                    <span className="text-red-400 text-lg font-bold">!</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Backend failed to start
                  </p>
                  <p className="text-[10px] text-white/25 leading-relaxed">
                    Please reinstall SwitchControl, then launch again.
                  </p>
                  <button
                    onClick={() => (window as any).electronAPI?.quitApp?.()}
                    className="mt-1 px-4 py-1.5 rounded-lg text-[10px] text-white/40 tracking-widest uppercase"
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-5">
                  <div className="relative flex items-center justify-center w-8 h-8">
                    <span
                      className="absolute w-8 h-8 rounded-full border border-text-[#00D4FF]/20 animate-ping"
                      style={{ animationDuration: "2.2s" }}
                    />
                    <span
                      className="w-2 h-2 rounded-full bg-text-[#00D4FF]/60 animate-pulse"
                      style={{ animationDuration: "1.6s" }}
                    />
                  </div>
                  <p
                    className="text-[10px] text-white/20 tracking-[0.28em] uppercase animate-pulse"
                    style={{
                      animationDuration: "2.4s",
                      animationDelay: "0.3s",
                    }}
                  >
                    Starting
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {(phase === "unauthenticated" || phase === "login_success") && (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
              }}
              exit={{
                opacity: 0,
                transition: { duration: 0.28, ease: [0.4, 0, 0.6, 1] },
              }}
              className="h-full"
              style={{ zIndex: 1 }}
            >
              <LoginScreen succeeded={phase === "login_success"} />
            </motion.div>
          )}

          {phase === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
                scale: 1,
                transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
              }}
              exit={{
                opacity: 0,
                filter: "blur(24px)",
                scale: 0.97,
                transition: { duration: 0.95, ease: [0.4, 0, 0.2, 1] },
              }}
              className="h-full"
              style={{ zIndex: 2 }}
            >
              <WelcomeAnimation
                userName={user?.username || null}
                isPremium={user?.isPremium}
                introDelay={0.4}
                onComplete={() => {
                  console.log(
                    "[Handoff] intro exit complete, mounting dashboard",
                  );
                  // Show the first-run disclaimer for brand-new users (once only).
                  const uid = user?.id;
                  const disclaimerKey = uid ? `sc_disclaimer_seen_${uid}` : null;
                  if (isFirstLogin && disclaimerKey && !localStorage.getItem(disclaimerKey)) {
                    console.log("[FirstRunDisclaimer] showing for first-time user, fading welcome out");
                    setPhase("disclaiming"); // triggers AnimatePresence exit on welcome div
                    setShowDisclaimer(true);
                    return; // hold off on setPhase("authenticated") until disclaimer is dismissed
                  }
                  setPhase("authenticated");
                  setLocation("/dashboard");
                }}
              />
            </motion.div>
          )}

          {phase === "authenticated" && (
            <motion.div
              key="app"
              // IMPORTANT: Do NOT use filter or scale/transform here.
              // Any CSS filter or transform on this wrapper creates a new containing
              // block for position:fixed descendants (the Sidebar, fixed modals).
              // That traps them inside this compositing layer, causing visual
              // misalignment until the filter clears. Opacity alone is safe, it
              // does NOT create a containing block.
              // The inner AppLayout page div (0.32s, blur 6px) provides the visual
              // entrance drama; clearContainingBlock cleans that up after it completes.
              initial={{ opacity: 1 }}
              animate={
                isSigningOut
                  ? {
                      opacity: 0,
                      transition: { duration: 0.95, ease: [0.4, 0, 0.2, 1] },
                    }
                  : {
                      opacity: 1,
                      transition: {
                        duration: 0.35,
                        delay: 0,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }
              }
              className="h-full"
              style={{ pointerEvents: isSigningOut ? "none" : undefined }}
              onAnimationStart={() =>
                console.log("[Handoff] dashboard fade-in started")
              }
              onAnimationComplete={() =>
                console.log(
                  "[Handoff] dashboard fade-in complete, layout stable",
                )
              }
            >
              <Router hook={useTransitionLocation}>
                <ElectronAppRoutes />
              </Router>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Required first-session language choice. The session is already
            authenticated at this point; the modal must complete before the
            welcome animation and any onboarding surface can begin. */}
        {phase === "language" && user?.loggedIn && user.id && (
          <FirstRunLanguageModal
            userId={user.id}
            accountLabel={user.username || user.email || user.id}
            onComplete={() => {
              console.log(
                "[FirstRunLanguage] choice saved, transitioning to welcome",
              );
              setPhase("welcome");
            }}
          />
        )}

        {/* First-run disclaimer, overlays the welcome screen for brand-new users.
            Shows between welcome animation end and dashboard mount. z-9998 so it
            sits above the welcome animation (z-2) but below any potential z-9999 overlays. */}
        <FirstRunDisclaimer
          show={showDisclaimer && !revertModalOpen}
          onComplete={() => {
            const uid = user?.id;
            if (uid) localStorage.setItem(`sc_disclaimer_seen_${uid}`, "true");
            console.log("[FirstRunDisclaimer] dismissed, transitioning to dashboard");
            setShowDisclaimer(false);
            setPhase("authenticated");
            setLocation("/dashboard");
          }}
        />

        {!isResetting && !competingOverlayActive && activeFlow === "firstTime" && (
          <OnboardingTour
            isFirstTime={isFirstLogin}
            onComplete={() => {
              if (user?.id) {
                localStorage.setItem(`sc_tour_completed_${user.id}`, "true");
              }
              setActiveFlow("none");
            }}
            onSkip={() => {
              if (user?.id) {
                localStorage.setItem(`sc_tour_completed_${user.id}`, "true");
              }
              setActiveFlow("none");
            }}
          />
        )}

        {!isResetting && !competingOverlayActive && activeFlow === "trialUnlock" && (
          <TrialActivationAnimation
            show={activeFlow === "trialUnlock"}
            onComplete={async () => {
              console.log("[AppFlow] Trial activation complete, persisting");
              const store = useAuthStore.getState();
              if (store.user)
                store.setUser({ ...store.user, hasSeenTrialActivation: true });
              await postTrialActivationSeen();

              // Arm the trialTour loop-guards before transitioning so the flow
              // eval cannot re-fire the tour once it finishes.
              const userId = useAuthStore.getState().user?.id;
              if (userId)
                localStorage.setItem(`sc_trial_tour_seen_${userId}`, "1");
              trialTourFiredThisSessionRef.current = true;

              setActiveFlow("trialTour");
            }}
          />
        )}

        {!isResetting && !competingOverlayActive && activeFlow === "trialTour" && (
          <TrialTour
            show={activeFlow === "trialTour"}
            onComplete={async () => {
              console.log("[AppFlow] Trial tour complete, persisting");
              const store = useAuthStore.getState();
              if (store.user)
                store.setUser({ ...store.user, hasSeenTrialTour: true });
              // Pre-arm premium flow guards so trial users can never bleed into premium flows
              const userId = store.user?.id;
              if (userId) {
                localStorage.setItem(`sc_unlock_seen_${userId}`, "1");
                localStorage.setItem(`sc_tour_seen_${userId}`, "1");
              }
              unlockFiredThisSessionRef.current = true;
              premiumTourFiredThisSessionRef.current = true;
              // Dismiss the UI before persisting the server flag. The optimistic
              // store/local guards already prevent a replay, and navigation must
              // never remain locked behind a slow or unavailable POST request.
              setActiveFlow("none");
              await postTrialTourSeen();
            }}
          />
        )}

        {!isResetting && !competingOverlayActive && activeFlow === "premiumUnlock" && (
          <PremiumUpgradeAnimation
            show={activeFlow === "premiumUnlock"}
            onComplete={() => {
              console.log(
                "[AppFlow] Unlock animation complete, transitioning to premiumTour",
              );
              const store = useAuthStore.getState();
              if (store.user) {
                store.setUser({ ...store.user, hasSeenPremiumUnlock: true });
              }
              // Fire-and-forget, do NOT await. setActiveFlow must fire immediately
              // so the tour blur-in overlaps the animation blur-out (no black gap).
              postUnlockSeen().catch(() => {});

              // Arm loop-guards before tour mounts so the flow eval can never re-fire
              const userId = useAuthStore.getState().user?.id;
              if (userId) localStorage.setItem(`sc_tour_seen_${userId}`, "1");
              premiumTourFiredThisSessionRef.current = true;

              setActiveFlow("premiumTour");
            }}
          />
        )}

        {!isResetting && !competingOverlayActive && activeFlow === "premiumTour" && (
          <GuidedTour
            show={activeFlow === "premiumTour"}
            onComplete={async () => {
              console.log(
                "[AppFlow] Premium tour complete, persisting before clearing flow",
              );
              const store = useAuthStore.getState();
              // Optimistic: update store immediately so any concurrent entitlement
              // refresh that fires before the server responds cannot overwrite us.
              if (store.user)
                store.setUser({ ...store.user, hasSeenPremiumTour: true });
              // Persist to server FIRST, the flow eval must not re-run until the
              // server flag is saved, otherwise a concurrent /api/me refresh can
              // return hasSeenPremiumTour=false and re-trigger the tour.
              await postTourSeen();
              // Clear the flow only after the server acknowledged the save.
              setActiveFlow("none");
            }}
          />
        )}

        {!isResetting && (
          <PendingActivationModal
            show={
              showPendingActivation &&
              !revertModalOpen &&
              activeFlow === "none" &&
              !showDisclaimer
            }
            onUpgradeDetected={() => {
              setShowPendingActivation(false);
            }}
            onDismiss={() => setShowPendingActivation(false)}
          />
        )}

        {!isResetting && (
          <PatchNotesModal
            show={
              showPatchNotes &&
              !revertModalOpen &&
              activeFlow === "none" &&
              !showDisclaimer &&
              !showPendingActivation &&
              !promoOpen
            }
            onDismiss={() => setShowPatchNotes(false)}
          />
        )}

        {/* Light Mode, global CSS class sync + one-time post-onboarding advisor.
            `ready` is strictly gated on onboarding being fully finished so the
            recommendation can never overlap welcome/tour UI. */}
        <AppModeClassSync />
        <LightModeAdvisor
          ready={
            !isResetting &&
            phase === "authenticated" &&
            isPhaseStable &&
            activeFlow === "none" &&
            !!user?.loggedIn &&
            !!user?.id &&
            !!localStorage.getItem(`sc_tour_completed_${user.id}`) &&
            (!isTrialActive(user.plan, user.trialEndsAt) ||
              user.hasSeenTrialTour === true)
          }
        />

        {/* ~3s polished fade shown while switching Normal ↔ Light Mode */}
        <ModeTransitionOverlay
          blocked={competingOverlayActive || activeFlow !== "none"}
        />

        {/* Premium expiry revert, shows after trial/premium lapses and revert runs */}
        <PremiumRevertModal
          open={revertModalOpen}
          onClose={closeRevertModal}
          report={revertReport}
          phase={revertPhase}
          onRetry={retryRevert}
          reason={useTrialExpiryStore((s) => s.revertReason)}
        />

        {/* Free-user premium promo, Discord CTA, at most once per ~30 launches.
            Rendered BEFORE DeviceLockModal so the lock always stays on top. */}
        <PremiumPromoPopup
          open={
            promoOpen &&
            !revertModalOpen &&
            !showDisclaimer &&
            !showPendingActivation &&
            !showPatchNotes &&
            activeFlow === "none"
          }
          discordUrl={promoDiscordUrl}
          onClose={closePromo}
        />

        {/* Premium device lock, must be last (highest z-order), not dismissible */}
        {isElectron && deviceLockStatus === "locked" && !revertModalOpen && (
          <DeviceLockModal
            userEmail={user?.email ?? null}
            userId={user?.id ?? null}
            onRetry={retryDeviceLock}
            isRetrying={isDeviceLockChecking}
            onLogout={handleLogout}
          />
        )}
      </UpgradeModalProvider>
    </AppAuthContext.Provider>
  );
}

function WebsiteContent() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true; // P3-W1: guard setState after await on unmount
    const checkSession = async () => {
      try {
        const response = await fetch("/api/me", {
          credentials: "include",
        });
        if (!mounted) return;
        if (response.ok) {
          const data = await response.json();
          if (!mounted) return;
          if (data.loggedIn) {
            setUser({
              id: data.id,
              email: data.email,
              username: data.name || data.firstName,
              avatarUrl: data.avatar,
              plan: data.plan || (data.isPremium ? "premium" : "free"),
              isPremium: data.isPremium,
              trialEndsAt: data.trialEndsAt || null,
              isAdmin: data.isAdmin || false,
              hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
              hasSeenPremiumTour: !!data.hasSeenPremiumTour,
              hasSeenTrialActivation: !!data.hasSeenTrialActivation,
              hasSeenTrialTour: !!data.hasSeenTrialTour,
              loggedIn: true,
            });
            // Acquire a JWT so the telemetry WebSocket can authenticate, then
            // start telemetry.  tryReissueJwt() is idempotent (deduped) and
            // stores the fresh token in useAuthStore automatically.
            tryReissueJwt()
              .then(() => telemetryManager.startWhenIdle())
              .catch(() => telemetryManager.startWhenIdle()); // start even if JWT fails
          }
        }
      } catch (err) {
        console.error("[Website] Session check failed:", err);
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    console.log(
      "[Auth] logout called because user_clicked_signout triggeredBy=WebsiteApp.handleLogout",
    );
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      console.log("[Auth] Backend session invalidated");
    } catch (err) {
      console.error("[Auth] Logout failed:", err);
    }
    setUser(null);
    window.location.href = "/";
  };

  const authContextValue: AppAuthContextValue = {
    user,
    isPremium: !!user && (user?.isPremium ?? false),
    entitlementsVerified: !!user,
    logout: handleLogout,
    isSigningOut: false,
    factoryReset: async () => {
      clearSwitchControlStorage();
      window.location.reload();
    },
    safeRefreshEntitlements: async () => ({ user: null }),
  };

  return (
    <AppAuthContext.Provider value={authContextValue}>
      <Router>
        <WebsiteRoutes />
      </Router>
    </AppAuthContext.Provider>
  );
}

export default function App() {
  return (
    <ErrorBoundary route="app-root">
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <MotionProvider>
            <TooltipProvider>
              <UserPreferencesSync />
              {isElectron ? (
                <div className="app-root">
                  <div className="titlebar">
                    <WindowControls />
                  </div>
                  <div className="app-content">
                    <ElectronAppContent />
                  </div>
                </div>
              ) : (
                <WebsiteContent />
              )}
              <Toaster />
            </TooltipProvider>
          </MotionProvider>
        </I18nProvider>
      </QueryClientProvider>
      <PerformanceOverlay />
    </ErrorBoundary>
  );
}
