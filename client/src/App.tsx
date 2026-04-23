import React, { useEffect, useState, createContext, useContext, useCallback, lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
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
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, validateToken, exchangeToken, AuthUser, refreshEntitlements, retryRefreshEntitlements, performFullLogout, postUnlockSeen, postTourSeen, postResetTourFlags, postTrialActivationSeen, postTrialTourSeen } from "@/lib/auth-store";
import { tryReissueJwt } from "@/lib/api";
import { isTrialActive } from "@/lib/trialCountdown";
import { telemetryManager } from "@/lib/telemetryManager";
import { useStore } from "@/lib/store";
import { PendingActivationModal } from "@/components/PendingActivationModal";
import { UpgradeModalProvider } from "@/contexts/UpgradeModalContext";
import { PatchNotesModal, PATCH_NOTES_STORAGE_KEY } from "@/components/PatchNotesModal";
import { DeviceLockModal } from "@/components/DeviceLockModal";
import { usePremiumDeviceLock } from "@/hooks/usePremiumDeviceLock";
import { usePremiumExpiry, useBaselineScan } from "@/hooks/usePremiumExpiry";
import { PremiumRevertModal } from "@/components/PremiumRevertModal";
import { usePremiumGraceStore } from "@/stores/premiumGraceStore";

import Splash from "@/screens/Splash";
import CameraGlow from "@/screens/CameraGlow";
import LoginScreen from "@/screens/Login";
import { WelcomeAnimation } from "@/components/WelcomeAnimation";
import { OnboardingTour } from "@/components/OnboardingTour";
import Home from "@/pages/Home";
import NetworkTweaks from "@/pages/NetworkTweaks";
import SystemCleaner from "@/pages/SystemCleaner";
import Settings from "@/pages/Settings";
import PowerPlan from "@/pages/PowerPlan";
import AppBooster from "@/pages/AppBooster";
import FocusMode from "@/pages/FocusMode";
import Debloater from "@/pages/Debloater";
import StartupApps from "@/pages/StartupApps";
import Tweaks from "@/pages/Tweaks";
import NicTuningPage from "@/pages/NicTuning";
import BiosAdvisor from "@/pages/BiosAdvisor";
import AiAdvisor from "@/pages/AiAdvisor";
import Security from "@/pages/Security";
import History from "@/pages/History";
const Landing = lazy(() => import("@/pages/Landing"));
const Features = lazy(() => import("@/pages/Features"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Download = lazy(() => import("@/pages/Download"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const FAQPage = lazy(() => import("@/pages/FAQ"));
const Success = lazy(() => import("@/pages/Success"));
const PremiumSuccess = lazy(() => import("@/pages/PremiumSuccess"));
const LoginPage = lazy(() => import("@/pages/Login"));
const AdminPage = lazy(() => import("@/pages/Admin"));

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

type AppPhase = "splash" | "booting" | "unauthenticated" | "login_success" | "welcome" | "authenticated";

interface AppAuthContextValue {
  user: AuthUser | null;
  isPremium: boolean;
  entitlementsVerified: boolean;
  isSigningOut: boolean;
  logout: () => void;
  factoryReset: () => Promise<void>;
  safeRefreshEntitlements: () => Promise<{ user: AuthUser | null }>;
}

const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  entitlementsVerified: false,
  isSigningOut: false,
  logout: () => {},
  factoryReset: async () => {},
  safeRefreshEntitlements: async () => ({ user: null }),
});

export function useAppAuth() {
  return useContext(AppAuthContext);
}

function ElectronAppRoutes() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Home} />
        <Route path="/tweaks" component={Tweaks} />
        <Route path="/power-plan" component={PowerPlan} />
        <Route path="/app-booster" component={AppBooster} />
        <Route path="/focus" component={FocusMode} />
        <Route path="/nic-tuning" component={NicTuningPage} />
        <Route path="/network" component={NetworkTweaks} />
        <Route path="/cleaner" component={SystemCleaner} />
        <Route path="/debloat" component={Debloater} />
        <Route path="/startup" component={StartupApps} />
        <Route path="/bios-advisor" component={BiosAdvisor} />
        <Route path="/ai-advisor" component={AiAdvisor} />
        <Route path="/security" component={Security} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route>
          <Home />
        </Route>
      </Switch>
    </Suspense>
  );
}

function WebsiteRoutes() {
  return (
    <Suspense fallback={null}>
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
        <Route>
          <Landing />
        </Route>
      </Switch>
    </Suspense>
  );
}

type AppFlow = "none" | "firstTime" | "trialUnlock" | "trialTour" | "premiumUnlock" | "premiumTour";

function ElectronAppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [showGlow, setShowGlow] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [activeFlow, setActiveFlow] = useState<AppFlow>("none");
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [entitlementsAttempted, setEntitlementsAttempted] = useState(false);
  const [entitlementsOk, setEntitlementsOk] = useState(false);
  const [entitlementsVerified, setEntitlementsVerified] = useState(false);
  const [showPendingActivation, setShowPendingActivation] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);
  // Becomes true 850ms after entering "authenticated" phase so tour flows don't
  // fire while the dashboard's own 750ms fade-in animation is still running.
  const [isPhaseStable, setIsPhaseStable] = useState(false);
  const patchNotesCheckedRef = React.useRef(false);
  const unlockFiredThisSessionRef = React.useRef(false);
  const trialUnlockFiredRef = React.useRef(false);
  const trialTourFiredThisSessionRef = React.useRef(false);
  const premiumTourFiredThisSessionRef = React.useRef(false);
  const suppressFlowsRef = React.useRef(false);
  const { token, jwt, user, setToken, setUser, logout: storeLogout, setValidating } = useAuthStore();
  const flowResetTs = useAuthStore(s => s.flowResetTs);
  const [, setLocation] = useHashLocation();

  // Premium device lock — Electron only, runs after entitlements confirmed from server
  const isPremiumVerified = entitlementsOk && (user?.isPremium ?? false);
  const {
    status: deviceLockStatus,
    isChecking: isDeviceLockChecking,
    retry: retryDeviceLock,
  } = usePremiumDeviceLock(isElectron, isPremiumVerified, user?.loggedIn ?? false);

  // Premium expiry — detects trial/premium→free transition, triggers safe revert
  const {
    revertModalOpen,
    revertReport,
    closeRevertModal,
    retryRevert,
    isActive: premiumIsActive,
  } = usePremiumExpiry({
    isPremium:            user?.isPremium ?? false,
    plan:                 user?.plan,
    trialEndsAt:          user?.trialEndsAt,
    isLoggedIn:           user?.loggedIn ?? false,
    entitlementsVerified,
  });

  // ── Trial-expiry redirect ──────────────────────────────────────────────────
  // When the revert modal opens (trial just ended or app reopened post-expiry),
  // immediately navigate to /dashboard so the revert summary is never obstructed
  // by a premium-gated page. The PremiumOverlayCard simultaneously returns null
  // via trialExpiryStore, preventing the z-9999 overlay from blocking the modal.
  useEffect(() => {
    if (!revertModalOpen) return;
    if (phase !== 'authenticated') return;
    console.log('[TrialExpiry] revert modal opened — redirecting to /dashboard');
    setLocation('/dashboard');
  }, [revertModalOpen, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // First-run baseline scan — records pre-existing applied state before the app touches anything
  useBaselineScan();

  const { realtimeMetricsEnabled, pauseWhenMinimized } = useStore();

  // Start the telemetry WebSocket as soon as the user is authenticated.
  // This warms up the connection before the Dashboard even mounts, so history
  // is already accumulating when they first visit (and never resets on tab switches).
  useEffect(() => {
    if (phase !== 'authenticated') return;
    telemetryManager.start();
  }, [phase]);

  // React to the "Real-time Metrics" toggle.
  // When disabled the telemetry WS stays connected but messages are discarded,
  // so re-enabling instantly resumes without a reconnect.
  useEffect(() => {
    if (realtimeMetricsEnabled) {
      telemetryManager.resume();
    } else {
      telemetryManager.pause();
    }
  }, [realtimeMetricsEnabled]);

  // React to the "Pause when minimized" toggle + document visibility changes.
  useEffect(() => {
    const handleVisibility = () => {
      if (!pauseWhenMinimized) return;
      if (document.hidden) {
        telemetryManager.pause();
      } else {
        // Only resume if the user hasn't separately disabled real-time metrics
        if (realtimeMetricsEnabled) telemetryManager.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    // Apply immediately so current state is reflected on toggle
    handleVisibility();
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pauseWhenMinimized, realtimeMetricsEnabled]);

  // login_success → next phase.
  // First-time users: 500ms (welcome animation plays next, no need to hold long).
  // Returning users: 300ms (get to dashboard quickly, no welcome to wait for).
  useEffect(() => {
    if (phase !== "login_success") return;
    const delay = isFirstLogin ? 500 : 300;
    const t = setTimeout(() => {
      if (isFirstLogin) {
        setPhase("welcome");
      } else {
        setPhase("authenticated");
        setLocation("/dashboard");
      }
    }, delay);
    return () => clearTimeout(t);
  }, [phase, isFirstLogin]);

  useEffect(() => {
    if (phase !== 'authenticated') return;
    if (!user?.loggedIn) return;
    if (entitlementsAttempted) return;

    console.log('[Entitlements] post-auth hydration begin — cached isPremium:', user?.isPremium, 'plan:', user?.plan);
    console.log('[PremiumTruth] entitlement fetch start — cached isPremium:', user?.isPremium);
    refreshEntitlements()
      .then((result) => {
        console.log('[Entitlements] post-auth hydration result — isPremium:', result.user?.isPremium ?? 'null', 'plan:', result.user?.plan ?? 'null');
        console.log('[PremiumTruth] entitlement fetch result — isPremium:', result.user?.isPremium ?? 'null (no user)');
        if (result.user) {
          setEntitlementsOk(true);
          setEntitlementsVerified(true);
          usePremiumGraceStore.getState().setVerified(
            result.user.isPremium,
            result.user.plan ?? null,
            result.user.id ?? null,
          );
          console.log('[Entitlements] grace store updated — isPremium:', result.user.isPremium, 'plan:', result.user.plan);
        } else {
          console.warn('[Entitlements] server returned no user — checking grace store for fallback');
          console.warn('[PremiumTruth] backend returned no user — checking grace store');
          const graceStatus = usePremiumGraceStore.getState().getStatus(true);
          console.log('[Entitlements] grace store status:', graceStatus);
          if (graceStatus === 'active' || graceStatus === 'grace') {
            console.log('[Entitlements] grace store active — entitlementsVerified set via grace fallback');
            setEntitlementsVerified(true);
          } else {
            console.warn('[Entitlements] grace store expired/unavailable — showing free state');
          }
        }
      })
      .catch((err) => {
        console.warn('[Entitlements] post-auth hydration error — checking grace store:', err);
        console.warn('[PremiumTruth] entitlement fetch failed — checking grace store fallback');
        const graceStatus = usePremiumGraceStore.getState().getStatus(true);
        if (graceStatus === 'active' || graceStatus === 'grace') {
          console.log('[Entitlements] grace fallback on error — entitlementsVerified set');
          setEntitlementsVerified(true);
        }
      })
      .finally(() => {
        setEntitlementsAttempted(true);
      });
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
    console.log(`[TourTransition] phase entered authenticated — waiting ${delay}ms for dashboard to stabilize`);
    const t = setTimeout(() => {
      setIsPhaseStable(true);
      console.log('[TourTransition] dashboard stable — tours unblocked');
    }, delay);
    return () => clearTimeout(t);
  }, [phase, isFirstLogin]);

  // When an admin re-grants a trial, the server resets hasSeenTrialActivation
  // and hasSeenTrialTour to false. Clear the matching session-level refs so the
  // flow eval can fire the trial sequence again within the same app session.
  useEffect(() => {
    if (user?.hasSeenTrialActivation === false) trialUnlockFiredRef.current = false;
  }, [user?.hasSeenTrialActivation]);

  useEffect(() => {
    if (user?.hasSeenTrialTour === false) trialTourFiredThisSessionRef.current = false;
  }, [user?.hasSeenTrialTour]);

  // When admin re-grants premium the server resets hasSeenPremiumUnlock to false.
  // Clear the session-level ref so the flow eval can fire the animation again.
  useEffect(() => {
    if (user?.hasSeenPremiumUnlock === false) unlockFiredThisSessionRef.current = false;
  }, [user?.hasSeenPremiumUnlock]);

  // Admin.tsx calls triggerFlowReset() after granting/revoking premium or trial.
  // This clears all in-session animation guards so the AppFlow can re-eval immediately,
  // even if the flag values haven't changed (e.g. hasSeenPremiumUnlock was already false).
  useEffect(() => {
    if (flowResetTs === 0) return;
    console.log('[AppFlow] flowResetTs fired — clearing all session guards for re-eval');
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
    if (!user?.loggedIn) return;
    if (phase !== "authenticated") return;
    if (!isPhaseStable) return;
    if (activeFlow !== "none") return;

    const userId = user.id;
    const tourKey = `sc_tour_completed_${userId}`;
    const isFirstTimeUser = !localStorage.getItem(tourKey);

    console.log('[AppFlow] Flow eval — isPremium:', user.isPremium,
      'plan:', user.plan,
      'trialEndsAt:', user.trialEndsAt,
      'hasSeenTrialActivation:', user.hasSeenTrialActivation,
      'hasSeenTrialTour:', user.hasSeenTrialTour,
      'hasSeenUnlock:', user.hasSeenPremiumUnlock,
      'hasSeenTour:', user.hasSeenPremiumTour,
      'isFirstTimeUser:', isFirstTimeUser,
      'isFirstLogin:', isFirstLogin,
      'entitlementsAttempted:', entitlementsAttempted,
      'entitlementsOk:', entitlementsOk,
      'unlockFired:', unlockFiredThisSessionRef.current,
      'trialUnlockFired:', trialUnlockFiredRef.current);

    if (isFirstTimeUser && isFirstLogin && entitlementsAttempted) {
      console.log('[AppFlow] PRIORITY 1: First-time onboarding tour');
      setActiveFlow("firstTime");
      return;
    }

    if (!entitlementsOk) {
      console.log('[AppFlow] Waiting for entitlementsOk — skipping premium flow checks');
      return;
    }

    const trialOngoing = isTrialActive(user.plan, user.trialEndsAt);

    // PRIORITY 2: Trial activation (animation removed — go straight to tour)
    // Mark hasSeenTrialActivation=true immediately so we don't loop, fire the
    // server save in the background, then jump directly to the tour.
    if (
      trialOngoing &&
      user.hasSeenTrialActivation === false &&
      !trialUnlockFiredRef.current
    ) {
      console.log('[AppFlow] PRIORITY 2: Trial — skipping animation, going straight to tour',
        { plan: user.plan, trialEndsAt: user.trialEndsAt });
      trialUnlockFiredRef.current = true;
      // Optimistically mark seen in store so the AppFlow won't re-fire this branch
      const store = useAuthStore.getState();
      if (store.user) store.setUser({ ...store.user, hasSeenTrialActivation: true });
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
      console.log('[AppFlow] PRIORITY 3: Trial tour — triggering',
        { plan: user.plan, trialEndsAt: user.trialEndsAt, hasSeenTrialTour: user.hasSeenTrialTour });
      trialTourFiredThisSessionRef.current = true;
      setActiveFlow("trialTour");
      return;
    }

    // localStorage keys — act as a permanent local guard even if server save fails.
    // If the server has explicitly reset hasSeenPremiumUnlock to false (e.g. admin
    // re-grants premium), clear the local guard so the animation can replay.
    const localUnlockKey  = `sc_unlock_seen_${userId}`;
    const localTourKey    = `sc_tour_seen_${userId}`;
    if (user.hasSeenPremiumUnlock === false) localStorage.removeItem(localUnlockKey);
    const localUnlockSeen = localStorage.getItem(localUnlockKey) === '1';
    const localTourSeen   = localStorage.getItem(localTourKey)   === '1';

    if (
      user.isPremium === true &&
      !trialOngoing &&
      user.hasSeenPremiumUnlock === false &&
      !localUnlockSeen &&
      !unlockFiredThisSessionRef.current
    ) {
      console.log('[AppFlow] PRIORITY 4: Premium unlock animation — triggering');
      localStorage.setItem(localUnlockKey, '1');  // guard immediately so restart can't re-trigger
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
      console.log('[AppFlow] PRIORITY 5: Premium guided tour');
      localStorage.setItem(localTourKey, '1');    // guard immediately
      premiumTourFiredThisSessionRef.current = true;
      setActiveFlow("premiumTour");
      return;
    }

    console.log('[AppFlow] No flow conditions met — staying idle');
  }, [user?.loggedIn, user?.isPremium, user?.plan, user?.trialEndsAt, user?.hasSeenPremiumUnlock, user?.hasSeenPremiumTour, user?.hasSeenTrialActivation, user?.hasSeenTrialTour, phase, activeFlow, isFirstLogin, entitlementsAttempted, entitlementsOk, isResetting, isPhaseStable, flowResetTs]);

  const activeFlowRef = React.useRef<AppFlow>(activeFlow);
  activeFlowRef.current = activeFlow;

  // Track when window last lost focus — used to skip brief focus-loss from dialogs/file pickers
  const lastBlurTimeRef = React.useRef<number>(0);
  const lastEntitlementRefreshRef = React.useRef<number>(0);
  // Minimum ms the window must be out of focus before we treat it as a real app-switch
  const FOCUS_AWAY_THRESHOLD_MS = 3000;
  // Minimum ms between focus-triggered entitlement refreshes to avoid hammering the server.
  // Kept low so that after an admin grant the next window-focus event reflects the
  // new plan quickly. Direct store patches (from handlePlanUpdated) bypass this entirely.
  const ENTITLEMENT_REFRESH_COOLDOWN_MS = 5_000;

  useEffect(() => {
    if (!user?.loggedIn || phase !== 'authenticated') return;

    const handleBlur = () => {
      lastBlurTimeRef.current = Date.now();
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && activeFlowRef.current === "none") {
        const now = Date.now();
        const sinceLastRefresh = now - lastEntitlementRefreshRef.current;
        if (sinceLastRefresh < ENTITLEMENT_REFRESH_COOLDOWN_MS) return;
        console.log('[App] App visible, refreshing entitlements...');
        lastEntitlementRefreshRef.current = now;
        await refreshEntitlements();
      }
    };

    const handleFocus = async () => {
      if (activeFlowRef.current !== "none") {
        console.log('[App] Window focused but flow active, skipping refresh');
        return;
      }
      const awayMs = Date.now() - lastBlurTimeRef.current;
      // Skip if focus returned quickly — indicates a child dialog (file picker, etc.), not an app-switch
      if (awayMs < FOCUS_AWAY_THRESHOLD_MS && lastBlurTimeRef.current > 0) return;
      const now = Date.now();
      const sinceLastRefresh = now - lastEntitlementRefreshRef.current;
      if (sinceLastRefresh < ENTITLEMENT_REFRESH_COOLDOWN_MS) return;
      console.log('[App] Window focused, refreshing entitlements...');
      lastEntitlementRefreshRef.current = now;
      await refreshEntitlements();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.loggedIn, phase]);

  useEffect(() => {
    if (!isElectron) return;
    
    const api = (window as any).electronAPI;
    
    if (api?.onWindowFocus) {
      // Passive handler only — must not reinitialize app state, clear auth,
      // reset routing, remount layout trees, or destroy active page state.
      // Overlay clearing (data-overlay DOM mutations) was causing blank-screen
      // regressions on Alt-Tab return; removed entirely.
      const unsub = api.onWindowFocus(() => {
        console.log('[App] Electron window focus (passive)');
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (phase !== "authenticated") return;
    if (activeFlow !== "none") return;
    if (patchNotesCheckedRef.current) return;
    patchNotesCheckedRef.current = true;

    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then((notes: { version: string }) => {
        const lastSeen = localStorage.getItem(PATCH_NOTES_STORAGE_KEY);
        if (notes.version !== lastSeen) {
          setShowPatchNotes(true);
        }
      })
      .catch(() => {});
  }, [phase, activeFlow]);

  // ── Splash completion — Splash.tsx is the sole timing authority ─────────
  // Splash calls onComplete() when its exit animation finishes.
  // CameraGlow fires here, not on a raw timer, so it never overlaps the splash.

  useEffect(() => {
    if (!isElectron) return;
    console.log('[App] Registering deep link auth callback (once)');
    const api = (window as any).electronAPI;

    const unsubAuth = api.auth.onCallback(async (url: string) => {
      console.log('[DeepLink] ===== RENDERER CALLBACK RECEIVED =====');
      console.log('[DeepLink] URL:', url);
      useAuthStore.getState().setElectronAuthState('callback_received');

      try {
        const parsed = new URL(url);
        const authCode = parsed.searchParams.get('code') || parsed.searchParams.get('token');
        const provider = parsed.searchParams.get('provider');
        const premiumActivated = parsed.searchParams.get('premium_activated') === 'true';
        const currentUser = useAuthStore.getState().user;

        console.log('[DeepLink] parsed — code:', authCode ? 'present' : 'missing', 'provider:', provider, 'premiumActivated:', premiumActivated, 'currentUserLoggedIn:', currentUser?.loggedIn);

        if (premiumActivated && currentUser?.loggedIn) {
          console.log('[PremiumFlow] Premium purchase return — user already logged in, refreshing entitlements...');

          const result = await retryRefreshEntitlements({
            attempts: 30,
            delayMs: 1000,
            initialDelayMs: 500,
          });

          if (result.ok && result.user?.isPremium) {
            console.log('[PremiumFlow] Premium confirmed — hasSeenUnlock:', result.user.hasSeenPremiumUnlock, 'hasSeenTour:', result.user.hasSeenPremiumTour);
            setEntitlementsOk(true);
            useAuthStore.getState().setElectronAuthState('authenticated');
            return;
          }

          console.warn('[PremiumFlow] Premium not confirmed after retries — showing pending modal');
          setShowPendingActivation(true);
          useAuthStore.getState().setElectronAuthState('authenticated');
          return;
        }

        if (authCode) {
          useAuthStore.getState().setElectronAuthState('exchanging');
          useAuthStore.getState().setValidating(true);

          // No hard timeout — let the exchange run to completion.
          // The fetch() has its own browser-level timeout; our 15 s race was
          // cutting off valid (but slow) OAuth sessions before the server
          // responded, then treating a transient network delay as a failure.
          const exchangedUser = await exchangeToken(authCode);

          if (exchangedUser) {
            useAuthStore.getState().setToken(authCode);
            useAuthStore.getState().setUser(exchangedUser);
            useAuthStore.getState().setElectronAuthState('authenticated');
            console.log(`[Auth] exchange success — user=${exchangedUser.id} provider=${provider}`);

            const welcomeKey = `sc_welcomed_${exchangedUser.id}`;
            const hasBeenWelcomed = localStorage.getItem(welcomeKey);

            if (!hasBeenWelcomed) {
              setIsFirstLogin(true);
              localStorage.setItem(welcomeKey, 'true');
              // First-time: login screen blur-exits, then welcome animation plays.
              setPhase("login_success");
            } else {
              // Returning user: login screen still blur-exits cleanly via
              // login_success → (600ms) → authenticated.  No welcome animation,
              // but the user gets the same polished transition out of the login
              // screen instead of an abrupt swap.
              setPhase("login_success");
            }

            if (premiumActivated) {
              console.log('[PremiumFlow] Exchange + premiumActivated — retrying entitlements...');
              const premResult = await retryRefreshEntitlements({
                attempts: 30,
                delayMs: 1000,
                initialDelayMs: 300,
              });
              if (premResult.ok && premResult.user?.isPremium) {
                console.log('[PremiumFlow] Premium confirmed after login');
              } else {
                console.warn('[PremiumFlow] Premium not confirmed — showing pending');
                setShowPendingActivation(true);
              }
            }
          } else {
            console.error('[Auth] Exchange failed — setting unauthenticated');
            // clear() resets electronAuthState to 'idle' and oauthError to null,
            // so set them AFTER the clear to avoid overwriting.
            useAuthStore.getState().clear();
            useAuthStore.getState().setElectronAuthState('failed');
            useAuthStore.getState().setOauthError('Login failed. Please try again.');
            setPhase("unauthenticated");
          }
          useAuthStore.getState().setValidating(false);
        } else if (!premiumActivated) {
          console.log('[DeepLink] No code and no premium flag — going to login');
          useAuthStore.getState().setElectronAuthState('failed');
          useAuthStore.getState().setOauthError('Login failed — no authentication code received.');
          setPhase("unauthenticated");
        }
      } catch (err) {
        console.error('[DeepLink] Error processing callback:', err);
        useAuthStore.getState().setElectronAuthState('failed');
        useAuthStore.getState().setOauthError('Login failed. Please try again.');
        useAuthStore.getState().setValidating(false);
        setPhase("unauthenticated");
      }
    });

    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!splashDone) return;
    // Fire CameraGlow exactly as splash completes — not during it
    setShowGlow(true);

    const checkAuth = async () => {
      const hasCredential = !!(token || jwt);
      console.log('[Auth] Boot: token present:', !!token, 'jwt present:', !!jwt, 'user present:', !!user, 'premium:', user?.isPremium);
      console.log('[Entitlements] startup restore begin — hasCredential:', hasCredential, 'cached isPremium:', user?.isPremium ?? 'n/a', 'plan:', user?.plan ?? 'n/a');

      if (hasCredential && user) {
        console.log('[Auth] Using stored user data:', user.id, 'isPremium:', user.isPremium);

        // Force a fresh entitlement fetch BEFORE transitioning to the dashboard so
        // there is no startup window where the UI shows stale (potentially wrong)
        // isPremium state. Mark entitlementsAttempted so the post-auth effect skips
        // its duplicate fetch. A 8 s timeout prevents the splash from hanging
        // if the server is unreachable at startup.
        //
        // AUTH GATE: serverExplicitlyRejected tracks whether the server was reachable
        // AND returned no valid session. Only set to true when the fetch completed (not
        // timed out) and still returned null — meaning the JWT is expired or revoked.
        // Network errors / timeouts use grace-store fallback and do NOT force logout,
        // to allow offline / slow-network app usage.
        let serverExplicitlyRejected = false;

        try {
          let timedOut = false;
          const _timeout = new Promise<{ user: null }>((resolve) =>
            setTimeout(() => { timedOut = true; resolve({ user: null }); }, 2500)
          );
          const result = await Promise.race([refreshEntitlements(), _timeout]);
          if (result.user) {
            console.log('[Entitlements] startup fetch OK — isPremium:', result.user.isPremium, 'plan:', result.user.plan);
            setEntitlementsOk(true);
            setEntitlementsVerified(true);
            usePremiumGraceStore.getState().setVerified(
              result.user.isPremium,
              result.user.plan ?? null,
              result.user.id ?? null,
            );
          } else if (timedOut) {
            // Server took > 8 s — treat like a network error, check grace store
            console.warn('[Entitlements] startup fetch timed out — checking grace store');
            const graceStatus = usePremiumGraceStore.getState().getStatus(false);
            console.log('[Entitlements] startup grace store status (timeout):', graceStatus);
            if (graceStatus === 'active' || graceStatus === 'grace') {
              console.log('[Entitlements] grace fallback on timeout — entitlementsVerified set');
              setEntitlementsVerified(true);
            } else {
              // Timeout + no grace: conservative — allow session but without entitlements
              console.warn('[Entitlements] startup timeout, no grace — allowing session in free state');
            }
          } else {
            // Server responded but returned no valid user (loggedIn: false, 401, etc.)
            // This is an EXPLICIT rejection — the stored JWT is expired or revoked.
            console.warn('[Auth] Boot: server explicitly rejected stored credentials — loggedIn=false or 4xx');
            const graceStatus = usePremiumGraceStore.getState().getStatus(true);
            console.log('[Entitlements] startup grace store status (rejected):', graceStatus);
            if (graceStatus === 'active' || graceStatus === 'grace') {
              // Grace store was verified recently — allow session but flag for re-auth soon
              console.log('[Entitlements] grace fallback on rejection — entitlementsVerified set');
              setEntitlementsVerified(true);
            } else {
              // Server said no AND no grace fallback → must force logout
              console.error('[Auth] Boot: JWT rejected by server + no grace store — forcing logout');
              serverExplicitlyRejected = true;
            }
          }
        } catch (err) {
          // Network error — server completely unreachable (no internet, server down)
          // Do NOT force logout; allow the cached session with grace-store fallback.
          console.warn('[Entitlements] startup fetch error (network unreachable) — checking grace store:', err);
          const graceStatus = usePremiumGraceStore.getState().getStatus(false);
          if (graceStatus === 'active' || graceStatus === 'grace') {
            console.log('[Entitlements] grace fallback on network error — entitlementsVerified set');
            setEntitlementsVerified(true);
          } else {
            console.warn('[Entitlements] network error + no grace — allowing session in free state');
          }
        }

        setEntitlementsAttempted(true);

        // Proactively reissue the JWT if it has expired or is within 1 day of expiry.
        // This way local API calls (App Booster, etc.) have a fresh token ready before
        // the user navigates anywhere — avoiding the first-request 401 in Electron.
        if (isElectron) {
          const storedJwt = useAuthStore.getState().jwt;
          if (storedJwt) {
            try {
              const parts = storedJwt.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                const nowSec = Math.floor(Date.now() / 1000);
                const oneDaySec = 86400;
                if (payload.exp && nowSec >= payload.exp - oneDaySec) {
                  console.log('[Auth] Boot: JWT expired or expiring within 24h — proactive reissue...');
                  tryReissueJwt().catch(() => {});
                }
              }
            } catch {
              // Non-critical — api.ts will handle it on first API call
            }
          }
        }

        // AUTH GATE: if server explicitly rejected the token, clear all state and
        // force the user back to the login screen — do NOT proceed to dashboard.
        if (serverExplicitlyRejected) {
          console.error('[Auth] Boot: forcing logout — dashboard mount blocked');
          storeLogout();
          setPhase("unauthenticated");
          return;
        }

        const welcomeKey = `sc_welcomed_${user.id}`;
        const hasBeenWelcomed = localStorage.getItem(welcomeKey);

        if (!hasBeenWelcomed) {
          console.log('[App] First time user detected, showing welcome');
          setIsFirstLogin(true);
          localStorage.setItem(welcomeKey, 'true');
          setPhase("welcome");
        } else {
          setPhase("authenticated");
        }
      } else if (hasCredential && !user) {
        console.log('[App] Credential exists but no user, re-exchanging...');
        setValidating(true);
        const exchangedUser = token ? await exchangeToken(token) : await validateToken('jwt');
        setValidating(false);

        if (exchangedUser) {
          setUser(exchangedUser);

          const welcomeKey = `sc_welcomed_${exchangedUser.id}`;
          const hasBeenWelcomed = localStorage.getItem(welcomeKey);

          if (!hasBeenWelcomed) {
            console.log('[App] First time user detected, showing welcome');
            setIsFirstLogin(true);
            localStorage.setItem(welcomeKey, 'true');
            setPhase("welcome");
          } else {
            setPhase("authenticated");
          }
        } else {
          console.log('[App] Boot: credential validation failed — clearing store');
          storeLogout();
          setPhase("unauthenticated");
        }
      } else {
        setPhase("unauthenticated");
      }
    };

    checkAuth();
  }, [splashDone]);

  const handleLogout = async () => {
    if (isSigningOut) return; // prevent double-trigger
    console.log('[Auth] logout called — starting cinematic sign-out transition');

    // 0. Immediately dismiss any active flow (tour, unlock animation, etc.)
    //    so the overlay doesn't persist into the sign-out transition.
    setActiveFlow("none");

    // 1. Immediately lock interactions and start the visual fade-out
    setIsSigningOut(true);

    // 2. Kick off backend logout concurrently so network time is "free"
    const logoutPromise = performFullLogout('user_clicked_signout');

    // 3. Let the app container's exit animation play (1.3s)
    await new Promise<void>((resolve) => setTimeout(resolve, 1300));

    // 4. Ensure the network call is done before switching phase
    await logoutPromise;

    // 5. Switch phase — login screen will animate in
    setPhase("unauthenticated");
    setLocation("/");
    // (isSigningOut stays true; we're leaving the phase so it doesn't matter)
  };

  const handleSafeRefreshEntitlements = useCallback(async () => {
    suppressFlowsRef.current = true;
    console.log('[Entitlements] manual refresh begin');
    console.log('[PremiumTruth] modal-triggered entitlement fetch start');
    try {
      const result = await refreshEntitlements();
      console.log('[Entitlements] manual refresh result — isPremium:', result.user?.isPremium ?? 'null', 'plan:', result.user?.plan ?? 'null');
      console.log('[PremiumTruth] modal-triggered entitlement fetch result — isPremium:', result.user?.isPremium ?? 'null (no user)');
      if (result.user) {
        setEntitlementsOk(true);
        setEntitlementsVerified(true);
        usePremiumGraceStore.getState().setVerified(
          result.user.isPremium,
          result.user.plan ?? null,
          result.user.id ?? null,
        );
        console.log('[Entitlements] manual refresh — grace store updated, UI unlocked');
      } else {
        console.warn('[Entitlements] manual refresh — server returned no user, checking grace store');
        const graceStatus = usePremiumGraceStore.getState().getStatus(true);
        console.log('[Entitlements] manual refresh — grace store status:', graceStatus);
        if (graceStatus === 'active' || graceStatus === 'grace') {
          console.log('[Entitlements] manual refresh — grace fallback active, entitlementsVerified set');
          setEntitlementsVerified(true);
        } else {
          setEntitlementsVerified(false);
        }
      }
      return result;
    } finally {
      setTimeout(() => { suppressFlowsRef.current = false; }, 500);
    }
  }, []);

  const handleFactoryReset = async () => {
    console.log('[AppFlow] Factory reset — kill switch activated');
    setIsResetting(true);
    setActiveFlow("none");
    await postResetTourFlags();
    await performFullLogout('factory_reset');
    localStorage.clear();
    sessionStorage.clear();
    if (isElectron && (window as any).electronAPI?.resetAppData) {
      await (window as any).electronAPI.resetAppData();
    } else {
      window.location.reload();
    }
  };

  // Resolve effective premium status: server value is authoritative for paid plans,
  // but for trial users we also gate on the local trial-end timestamp so the UI
  // locks immediately when the timer fires — without waiting for a server round-trip.
  const _isTrialUser      = user?.plan === 'trial';
  const _trialStillValid  = isTrialActive(user?.plan ?? '', user?.trialEndsAt ?? null);
  const _resolvedIsPremium = (user?.isPremium ?? false) && (!_isTrialUser || _trialStillValid);

  const authContextValue: AppAuthContextValue = {
    user: user,
    isPremium: entitlementsVerified && _resolvedIsPremium,
    entitlementsVerified,
    isSigningOut,
    logout: handleLogout,
    factoryReset: handleFactoryReset,
    safeRefreshEntitlements: handleSafeRefreshEntitlements,
  };
  console.log('[PremiumTruth] authContextValue — entitlementsVerified:', entitlementsVerified, 'isPremium:', authContextValue.isPremium, 'storedIsPremium:', user?.isPremium);

  return (
    <AppAuthContext.Provider value={authContextValue}>
      <UpgradeModalProvider>
      <CameraGlow active={showGlow} onComplete={() => setShowGlow(false)} />

      {/* ── Resetting overlay — covers the blank while factory reset runs ── */}
      {isResetting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "#07090D" }}>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 70% 55% at 50% 48%, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.06) 40%, transparent 65%)" }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative z-10 flex flex-col items-center gap-5">
            <div className="w-10 h-10 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin" />
            <p className="text-sm text-white/40 tracking-widest uppercase" style={{ letterSpacing: "0.18em" }}>Resetting…</p>
          </div>
        </div>
      )}

      {/* ── Persistent atmospheric background ─────────────────────────────
          This layer lives OUTSIDE AnimatePresence. It never unmounts.
          Login and Welcome are transparent overlays on top of it, so the
          dark atmosphere continues breathing during the transition instead
          of hard-cutting between two separate background layers.
          Shown from booting onward so there is never a blank gap after splash. */}
      {(phase === "booting" || phase === "unauthenticated" || phase === "login_success" || phase === "welcome") && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: "#080810" }}>
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                "radial-gradient(ellipse 90% 60% at 50% 48%, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.07) 35%, transparent 60%)",
                "radial-gradient(ellipse 70% 55% at 48% 44%, rgba(139,92,246,0.26) 0%, rgba(168,85,247,0.09) 35%, transparent 60%)",
                "radial-gradient(ellipse 90% 60% at 52% 52%, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.07) 35%, transparent 60%)",
              ]
            }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 28% 18%, rgba(236,72,153,0.10) 0%, transparent 42%)" }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 72% 78%, rgba(56,189,248,0.08) 0%, transparent 40%)" }}
            animate={{ opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          />
        </div>
      )}


      <AnimatePresence mode="sync">
        {phase === "splash" && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.004 }}
            transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
          >
            <Splash onComplete={() => {
              setPhase("booting");
              setSplashDone(true);
            }} />
          </motion.div>
        )}

        {phase === "booting" && (
          <motion.div
            key="booting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.35, ease: "easeOut" } }}
            exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeIn" } }}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
            className="h-full flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center w-8 h-8">
                <motion.div
                  className="absolute w-8 h-8 rounded-full border border-purple-400/20"
                  animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="w-2 h-2 rounded-full bg-purple-400/60"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <motion.p
                className="text-[10px] text-white/20 tracking-[0.28em] uppercase"
                animate={{ opacity: [0.3, 0.65, 0.3] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              >
                Starting
              </motion.p>
            </div>
          </motion.div>
        )}

        {(phase === "unauthenticated" || phase === "login_success") && (
          <motion.div
            key="login"
            initial={{ opacity: 0, filter: "blur(14px)", scale: 1.012 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { duration: 0.95, ease: [0.4, 0, 0.15, 1] } }}
            exit={{ opacity: 0, filter: "blur(24px)", scale: 0.96, transition: { duration: 1.1, ease: [0.4, 0, 0.6, 1] } }}
            className="h-full"
            style={{ zIndex: 1 }}
          >
            <LoginScreen succeeded={phase === "login_success"} />
          </motion.div>
        )}

        {phase === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, filter: "blur(28px)", scale: 1.018 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, filter: "blur(28px)", scale: 0.972, transition: { duration: 0.7, ease: [0.4, 0, 0.6, 1] } }}
            className="h-full"
            style={{ zIndex: 1 }}
          >
            <WelcomeAnimation 
              userName={user?.username || null}
              isPremium={user?.isPremium}
              introDelay={0.4}
              onComplete={() => {
                console.log('[Handoff] intro exit complete — mounting dashboard');
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
            // misalignment until the filter clears. Opacity alone is safe — it
            // does NOT create a containing block.
            // The inner AppLayout page div (0.32s, blur 6px) provides the visual
            // entrance drama; clearContainingBlock cleans that up after it completes.
            initial={{ opacity: 0 }}
            animate={
              isSigningOut
                ? { opacity: 0, scale: 0.975, filter: "blur(28px)", transition: { duration: 1.2, ease: [0.4, 0, 0.6, 1] } }
                : { opacity: 1, transition: { duration: 0.35, delay: 0, ease: [0.22, 1, 0.36, 1] } }
            }
            className="h-full"
            style={{ pointerEvents: isSigningOut ? "none" : undefined }}
            onAnimationStart={() => console.log('[Handoff] dashboard fade-in started')}
            onAnimationComplete={() => console.log('[Handoff] dashboard fade-in complete — layout stable')}
          >
            <Router hook={useHashLocation}>
              <ElectronAppRoutes />
            </Router>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!isResetting && activeFlow === "firstTime" && (
        <OnboardingTour
          isFirstTime={isFirstLogin}
          onComplete={() => {
            if (user?.id) {
              localStorage.setItem(`sc_tour_completed_${user.id}`, 'true');
            }
            setActiveFlow("none");
          }}
          onSkip={() => {
            if (user?.id) {
              localStorage.setItem(`sc_tour_completed_${user.id}`, 'true');
            }
            setActiveFlow("none");
          }}
        />
      )}
      
      {!isResetting && (
        <TrialActivationAnimation
          show={activeFlow === "trialUnlock"}
          onComplete={async () => {
            console.log('[AppFlow] Trial activation complete — persisting');
            const store = useAuthStore.getState();
            if (store.user) store.setUser({ ...store.user, hasSeenTrialActivation: true });
            await postTrialActivationSeen();

            // Arm the trialTour loop-guards before transitioning so the flow
            // eval cannot re-fire the tour once it finishes.
            const userId = useAuthStore.getState().user?.id;
            if (userId) localStorage.setItem(`sc_trial_tour_seen_${userId}`, '1');
            trialTourFiredThisSessionRef.current = true;

            setActiveFlow("trialTour");
          }}
        />
      )}

      {!isResetting && (
        <TrialTour
          show={activeFlow === "trialTour"}
          onComplete={async () => {
            console.log('[AppFlow] Trial tour complete — persisting');
            const store = useAuthStore.getState();
            if (store.user) store.setUser({ ...store.user, hasSeenTrialTour: true });
            // Pre-arm premium flow guards so trial users can never bleed into premium flows
            const userId = store.user?.id;
            if (userId) {
              localStorage.setItem(`sc_unlock_seen_${userId}`, '1');
              localStorage.setItem(`sc_tour_seen_${userId}`, '1');
            }
            unlockFiredThisSessionRef.current = true;
            premiumTourFiredThisSessionRef.current = true;
            await postTrialTourSeen();
            setActiveFlow("none");
          }}
        />
      )}

      {!isResetting && (
        <PremiumUpgradeAnimation 
          show={activeFlow === "premiumUnlock"} 
          onComplete={() => {
            console.log('[AppFlow] Unlock animation complete — transitioning to premiumTour');
            const store = useAuthStore.getState();
            if (store.user) {
              store.setUser({ ...store.user, hasSeenPremiumUnlock: true });
            }
            // Fire-and-forget — do NOT await. setActiveFlow must fire immediately
            // so the tour blur-in overlaps the animation blur-out (no black gap).
            postUnlockSeen().catch(() => {});

            // Arm loop-guards before tour mounts so the flow eval can never re-fire
            const userId = useAuthStore.getState().user?.id;
            if (userId) localStorage.setItem(`sc_tour_seen_${userId}`, '1');
            premiumTourFiredThisSessionRef.current = true;

            setActiveFlow("premiumTour");
          }} 
        />
      )}
      
      {!isResetting && (
        <GuidedTour 
          show={activeFlow === "premiumTour"} 
          onComplete={async () => {
            console.log('[AppFlow] Premium tour complete — persisting before clearing flow');
            const store = useAuthStore.getState();
            // Optimistic: update store immediately so any concurrent entitlement
            // refresh that fires before the server responds cannot overwrite us.
            if (store.user) store.setUser({ ...store.user, hasSeenPremiumTour: true });
            // Persist to server FIRST — the flow eval must not re-run until the
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
          show={showPendingActivation}
          onUpgradeDetected={() => {
            setShowPendingActivation(false);
          }}
          onDismiss={() => setShowPendingActivation(false)}
        />
      )}

      {!isResetting && (
        <PatchNotesModal
          show={showPatchNotes}
          onDismiss={() => setShowPatchNotes(false)}
        />
      )}

      {/* Premium expiry revert — shows after trial/premium lapses and revert runs */}
      <PremiumRevertModal
        open={revertModalOpen}
        onClose={closeRevertModal}
        report={revertReport}
        onRetry={retryRevert}
      />

      {/* Premium device lock — must be last (highest z-order), not dismissible */}
      {isElectron && deviceLockStatus === "locked" && (
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
    const checkSession = async () => {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (data.loggedIn) {
            setUser({
              id: data.id,
              email: data.email,
              username: data.name || data.firstName,
              avatarUrl: data.avatar,
              plan: data.plan || (data.isPremium ? 'premium' : 'free'),
              isPremium: data.isPremium,
              trialEndsAt: data.trialEndsAt || null,
              isAdmin: data.isAdmin || false,
              hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
              hasSeenPremiumTour: !!data.hasSeenPremiumTour,
              hasSeenTrialActivation: !!data.hasSeenTrialActivation,
              hasSeenTrialTour: !!data.hasSeenTrialTour,
              loggedIn: true,
            });
          }
        }
      } catch (err) {
        console.error('[Website] Session check failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    console.log('[Auth] logout called because user_clicked_signout triggeredBy=WebsiteApp.handleLogout');
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      console.log('[Auth] Backend session invalidated');
    } catch (err) {
      console.error('[Auth] Logout failed:', err);
    }
    setUser(null);
    window.location.href = '/';
  };

  const authContextValue: AppAuthContextValue = {
    user,
    isPremium: !!user && (user?.isPremium ?? false),
    entitlementsVerified: !!user,
    logout: handleLogout,
    factoryReset: async () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    },
    safeRefreshEntitlements: async () => ({ user: null }),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        <MotionProvider>
          <TooltipProvider>
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
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
