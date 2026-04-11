import React, { useEffect, useState, createContext, useContext, useCallback, lazy, Suspense } from "react";
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
import { isTrialActive } from "@/lib/trialCountdown";
import { telemetryManager } from "@/lib/telemetryManager";
import { PendingActivationModal } from "@/components/PendingActivationModal";
import { UpgradeModalProvider } from "@/contexts/UpgradeModalContext";
import { PatchNotesModal, PATCH_NOTES_STORAGE_KEY } from "@/components/PatchNotesModal";
import { DeviceLockModal } from "@/components/DeviceLockModal";
import { usePremiumDeviceLock } from "@/hooks/usePremiumDeviceLock";

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
import BiosAdvisor from "@/pages/BiosAdvisor";
import AiAdvisor from "@/pages/AiAdvisor";
import Security from "@/pages/Security";
import History from "@/pages/History";
const Landing = lazy(() => import("@/pages/Landing"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Download = lazy(() => import("@/pages/Download"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Success = lazy(() => import("@/pages/Success"));
const PremiumSuccess = lazy(() => import("@/pages/PremiumSuccess"));
const LoginPage = lazy(() => import("@/pages/Login"));
const AdminPage = lazy(() => import("@/pages/Admin"));

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

type AppPhase = "splash" | "unauthenticated" | "welcome" | "authenticated";

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
        <Route path="/pricing" component={Pricing} />
        <Route path="/download" component={Download} />
        <Route path="/login" component={LoginPage} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
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
  const [, setLocation] = useHashLocation();

  // Premium device lock — Electron only, runs after entitlements confirmed from server
  const isPremiumVerified = entitlementsOk && (user?.isPremium ?? false);
  const {
    status: deviceLockStatus,
    isChecking: isDeviceLockChecking,
    retry: retryDeviceLock,
  } = usePremiumDeviceLock(isElectron, isPremiumVerified, user?.loggedIn ?? false);

  // Start the telemetry WebSocket as soon as the user is authenticated.
  // This warms up the connection before the Dashboard even mounts, so history
  // is already accumulating when they first visit (and never resets on tab switches).
  useEffect(() => {
    if (phase !== 'authenticated') return;
    telemetryManager.start();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'authenticated') return;
    if (!user?.loggedIn) return;
    if (entitlementsAttempted) return;

    console.log('[AppFlow] Hydrating entitlements for this session...');
    console.log('[PremiumTruth] entitlement fetch start — cached isPremium:', user?.isPremium);
    refreshEntitlements()
      .then((result) => {
        console.log('[AppFlow] Entitlements hydrated — isPremium:', result.user?.isPremium, 'hasSeenPremiumUnlock:', result.user?.hasSeenPremiumUnlock);
        console.log('[PremiumTruth] entitlement fetch result — isPremium:', result.user?.isPremium ?? 'null (no user)');
        if (result.user) {
          setEntitlementsOk(true);
          setEntitlementsVerified(true);
        } else {
          console.warn('[AppFlow] Entitlement hydration returned no user — entitlementsOk stays false');
          console.warn('[PremiumTruth] backend returned no user — isPremium forced to false');
        }
      })
      .catch((err) => {
        console.warn('[AppFlow] Entitlement hydration failed:', err);
        console.warn('[PremiumTruth] entitlement fetch failed — isPremium stays false (no stale fallback)');
      })
      .finally(() => {
        setEntitlementsAttempted(true);
      });
  }, [phase, user?.loggedIn, entitlementsAttempted]);

  // Phase-stabilization gate: let the dashboard's 750ms fade-in finish before
  // any tour overlay is allowed to mount. Resets whenever phase leaves "authenticated".
  useEffect(() => {
    if (phase !== "authenticated") {
      setIsPhaseStable(false);
      return;
    }
    console.log('[TourTransition] phase entered authenticated — waiting for dashboard to stabilize');
    const t = setTimeout(() => {
      setIsPhaseStable(true);
      console.log('[TourTransition] dashboard stable — tours unblocked');
    }, 850);
    return () => clearTimeout(t);
  }, [phase]);

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

    const localTrialUnlockKey  = `sc_trial_unlock_seen_${userId}`;
    const localTrialTourKey    = `sc_trial_tour_seen_${userId}`;
    const localTrialUnlockSeen = localStorage.getItem(localTrialUnlockKey) === '1';
    const localTrialTourSeen   = localStorage.getItem(localTrialTourKey)   === '1';

    if (
      trialOngoing &&
      user.hasSeenTrialActivation === false &&
      !localTrialUnlockSeen &&
      !trialUnlockFiredRef.current
    ) {
      console.log('[AppFlow] PRIORITY 2: Trial activation animation — triggering');
      localStorage.setItem(localTrialUnlockKey, '1');
      trialUnlockFiredRef.current = true;
      setActiveFlow("trialUnlock");
      return;
    }

    if (
      trialOngoing &&
      user.hasSeenTrialTour === false &&
      !localTrialTourSeen &&
      !trialTourFiredThisSessionRef.current
    ) {
      console.log('[AppFlow] PRIORITY 3: Trial tour');
      localStorage.setItem(localTrialTourKey, '1');
      trialTourFiredThisSessionRef.current = true;
      setActiveFlow("trialTour");
      return;
    }

    // localStorage keys — act as a permanent local guard even if server save fails
    const localUnlockKey  = `sc_unlock_seen_${userId}`;
    const localTourKey    = `sc_tour_seen_${userId}`;
    const localUnlockSeen = localStorage.getItem(localUnlockKey) === '1';
    const localTourSeen   = localStorage.getItem(localTourKey)   === '1';

    if (
      user.isPremium === true &&
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
  }, [user?.loggedIn, user?.isPremium, user?.plan, user?.trialEndsAt, user?.hasSeenPremiumUnlock, user?.hasSeenPremiumTour, user?.hasSeenTrialActivation, user?.hasSeenTrialTour, phase, activeFlow, isFirstLogin, entitlementsAttempted, entitlementsOk, isResetting, isPhaseStable]);

  const activeFlowRef = React.useRef<AppFlow>(activeFlow);
  activeFlowRef.current = activeFlow;

  useEffect(() => {
    if (!user?.loggedIn || phase !== 'authenticated') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && activeFlowRef.current === "none") {
        console.log('[App] App visible, refreshing entitlements...');
        await refreshEntitlements();
      }
    };

    const handleFocus = async () => {
      if (activeFlowRef.current === "none") {
        console.log('[App] Window focused, refreshing entitlements...');
        await refreshEntitlements();
      } else {
        console.log('[App] Window focused but flow active, skipping refresh');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.loggedIn, phase]);

  useEffect(() => {
    if (!isElectron) return;
    
    const api = (window as any).electronAPI;
    
    const resetUIState = () => {
      if (activeFlow !== "none") {
        console.log('[App] Focus reset skipped — flow active:', activeFlow);
        return;
      }
      const authState = useAuthStore.getState().electronAuthState;
      if (authState !== 'idle' && authState !== 'authenticated' && authState !== 'failed') {
        console.log('[App] Focus reset skipped — auth in progress:', authState);
        return;
      }
      console.log('[App] Resetting UI state on focus');
      
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      
      document.querySelectorAll('[data-overlay]').forEach(el => {
        (el as HTMLElement).style.pointerEvents = '';
        (el as HTMLElement).style.opacity = '';
      });
      
      document.querySelectorAll('.ring-2, .ring-primary, [class*="focus:ring"]').forEach(el => {
        (el as HTMLElement).blur();
      });
    };
    
    if (api?.onWindowFocus) {
      api.onWindowFocus(() => {
        console.log('[App] Electron window focus');
        resetUIState();
      });
      
      return () => {
        api.removeWindowFocusListener?.();
      };
    }
  }, [activeFlow]);

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

  // ── Splash timers — start immediately on mount ───────────────────────────
  useEffect(() => {
    const glowTimer   = setTimeout(() => setShowGlow(true), 3800);
    const splashTimer = setTimeout(() => setSplashDone(true), 4800);
    return () => {
      clearTimeout(glowTimer);
      clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    console.log('[App] Registering deep link auth callback (once)');
    const api = (window as any).electronAPI;

    api.auth.onCallback(async (url: string) => {
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

          const EXCHANGE_TIMEOUT_MS = 15_000;
          const exchangedUser = await Promise.race([
            exchangeToken(authCode),
            new Promise<null>((resolve) => setTimeout(() => {
              console.warn('[Auth] exchangeToken timed out after', EXCHANGE_TIMEOUT_MS, 'ms');
              resolve(null);
            }, EXCHANGE_TIMEOUT_MS)),
          ]);

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
              setPhase("welcome");
            } else {
              setPhase("authenticated");
              setLocation("/dashboard");
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
            useAuthStore.getState().setElectronAuthState('failed');
            useAuthStore.getState().clear();
            setPhase("unauthenticated");
            useAuthStore.getState().setOauthError('Login failed. Please try again.');
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

    return () => {
      (window as any).electronAPI?.auth?.removeCallbackListener?.();
    };
  }, []);

  useEffect(() => {
    if (!splashDone) return;

    const checkAuth = async () => {
      const hasCredential = !!(token || jwt);
      console.log('[Auth] Boot: token present:', !!token, 'jwt present:', !!jwt, 'user present:', !!user, 'premium:', user?.isPremium);

      if (hasCredential && user) {
        console.log('[Auth] Using stored user data:', user.id, 'isPremium:', user.isPremium);

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
    console.log('[PremiumTruth] modal-triggered entitlement fetch start');
    try {
      const result = await refreshEntitlements();
      console.log('[PremiumTruth] modal-triggered entitlement fetch result — isPremium:', result.user?.isPremium ?? 'null (no user)');
      if (result.user) {
        setEntitlementsVerified(true);
      } else {
        setEntitlementsVerified(false);
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

  const authContextValue: AppAuthContextValue = {
    user: user,
    isPremium: entitlementsVerified && (user?.isPremium ?? false),
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

      <AnimatePresence mode="sync">
        {phase === "splash" && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.008, filter: "blur(8px)" }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
            style={{ position: "absolute", inset: 0 }}
          >
            <Splash onComplete={() => {}} />
          </motion.div>
        )}

        {phase === "unauthenticated" && (
          <motion.div
            key="login"
            initial={{ opacity: 0, filter: "blur(12px)", scale: 1.012 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            <LoginScreen />
          </motion.div>
        )}

        {phase === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, filter: "blur(12px)", scale: 1.012 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            <WelcomeAnimation 
              userName={user?.username || null}
              isPremium={user?.isPremium}
              onComplete={() => {
                setPhase("authenticated");
                setLocation("/dashboard");
              }}
            />
          </motion.div>
        )}

        {phase === "authenticated" && (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.995, filter: "blur(4px)" }}
            animate={
              isSigningOut
                ? { opacity: 0, scale: 0.975, filter: "blur(24px)", transition: { duration: 1.1, ease: [0.4, 0, 0.6, 1] } }
                : { opacity: 1, scale: 1,     filter: "blur(0px)",  transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] } }
            }
            className="h-full"
            style={{ pointerEvents: isSigningOut ? "none" : undefined }}
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
            await postTrialTourSeen();
            setActiveFlow("none");
          }}
        />
      )}

      {!isResetting && (
        <PremiumUpgradeAnimation 
          show={activeFlow === "premiumUnlock"} 
          onComplete={async () => {
            console.log('[AppFlow] Unlock animation complete — setting optimistic local flag');
            const store = useAuthStore.getState();
            if (store.user) {
              store.setUser({ ...store.user, hasSeenPremiumUnlock: true });
            }
            console.log('[AppFlow] Posting unlock-seen to server');
            await postUnlockSeen();
            console.log('[AppFlow] Unlock persisted — transitioning to premiumTour');
            setActiveFlow("premiumTour");
          }} 
        />
      )}
      
      {!isResetting && (
        <GuidedTour 
          show={activeFlow === "premiumTour"} 
          onComplete={async () => {
            console.log('[AppFlow] Premium tour complete — optimistic store update then persist');
            const store = useAuthStore.getState();
            if (store.user) store.setUser({ ...store.user, hasSeenPremiumTour: true });
            setActiveFlow("none");
            await postTourSeen();
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

      {/* Premium device lock — must be last (highest z-order), not dismissible */}
      {isElectron && deviceLockStatus === "locked" && (
        <DeviceLockModal
          userEmail={user?.email ?? null}
          userId={user?.id ?? null}
          onRetry={retryDeviceLock}
          isRetrying={isDeviceLockChecking}
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
  );
}
