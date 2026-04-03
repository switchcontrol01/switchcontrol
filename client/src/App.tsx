import React, { useEffect, useState, createContext, useContext, useCallback, lazy, Suspense } from "react";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUpgradeAnimation } from "@/components/PremiumUpgradeAnimation";

import { GuidedTour } from "@/components/GuidedTour";
import { WindowControls } from "@/components/WindowControls";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, validateToken, exchangeToken, AuthUser, refreshEntitlements, retryRefreshEntitlements, performFullLogout, postUnlockSeen, postTourSeen } from "@/lib/auth-store";
import { PendingActivationModal } from "@/components/PendingActivationModal";

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
const BiosAdvisor = lazy(() => import("@/pages/BiosAdvisor"));
const AiAdvisor = lazy(() => import("@/pages/AiAdvisor"));
const Security = lazy(() => import("@/pages/Security"));
const History = lazy(() => import("@/pages/History"));
const Landing = lazy(() => import("@/pages/Landing"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Download = lazy(() => import("@/pages/Download"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Success = lazy(() => import("@/pages/Success"));
const PremiumSuccess = lazy(() => import("@/pages/PremiumSuccess"));
const LoginPage = lazy(() => import("@/pages/Login"));

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

type AppPhase = "splash" | "unauthenticated" | "welcome" | "authenticated";

interface AppAuthContextValue {
  user: AuthUser | null;
  isPremium: boolean;
  entitlementsVerified: boolean;
  logout: () => void;
  factoryReset: () => Promise<void>;
  safeRefreshEntitlements: () => Promise<{ user: AuthUser | null }>;
}

const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  entitlementsVerified: false,
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
        <Route>
          <Landing />
        </Route>
      </Switch>
    </Suspense>
  );
}

type AppFlow = "none" | "firstTime" | "premiumUnlock" | "premiumTour";

function ElectronAppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [showGlow, setShowGlow] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [activeFlow, setActiveFlow] = useState<AppFlow>("none");
  const [isResetting, setIsResetting] = useState(false);
  const [entitlementsAttempted, setEntitlementsAttempted] = useState(false);
  const [entitlementsOk, setEntitlementsOk] = useState(false);
  const [entitlementsVerified, setEntitlementsVerified] = useState(false);
  const [showPendingActivation, setShowPendingActivation] = useState(false);
  const unlockFiredThisSessionRef = React.useRef(false);
  const suppressFlowsRef = React.useRef(false);
  const { token, jwt, user, setToken, setUser, logout: storeLogout, setValidating } = useAuthStore();
  const [, setLocation] = useHashLocation();

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

  useEffect(() => {
    if (isResetting) return;
    if (suppressFlowsRef.current) return;
    if (!user?.loggedIn) return;
    if (phase !== "authenticated") return;
    if (activeFlow !== "none") return;

    const userId = user.id;
    const tourKey = `sc_tour_completed_${userId}`;
    const isFirstTimeUser = !localStorage.getItem(tourKey);

    console.log('[AppFlow] Flow eval — isPremium:', user.isPremium,
      'hasSeenUnlock:', user.hasSeenPremiumUnlock,
      'hasSeenTour:', user.hasSeenPremiumTour,
      'isFirstTimeUser:', isFirstTimeUser,
      'isFirstLogin:', isFirstLogin,
      'entitlementsAttempted:', entitlementsAttempted,
      'entitlementsOk:', entitlementsOk,
      'unlockFired:', unlockFiredThisSessionRef.current);

    if (isFirstTimeUser && isFirstLogin && entitlementsAttempted) {
      console.log('[AppFlow] PRIORITY 1: First-time onboarding tour');
      setActiveFlow("firstTime");
      return;
    }

    if (!entitlementsOk) {
      console.log('[AppFlow] Waiting for entitlementsOk — skipping premium flow checks');
      return;
    }

    if (
      user.isPremium === true &&
      user.hasSeenPremiumUnlock === false &&
      !unlockFiredThisSessionRef.current
    ) {
      console.log('[AppFlow] PRIORITY 2: Premium unlock animation — triggering');
      unlockFiredThisSessionRef.current = true;
      setActiveFlow("premiumUnlock");
      return;
    }

    if (user.isPremium === true && user.hasSeenPremiumTour === false) {
      console.log('[AppFlow] PRIORITY 3: Premium guided tour');
      setActiveFlow("premiumTour");
      return;
    }

    console.log('[AppFlow] No flow conditions met — staying idle');
  }, [user?.loggedIn, user?.isPremium, user?.hasSeenPremiumUnlock, user?.hasSeenPremiumTour, phase, activeFlow, isFirstLogin, entitlementsAttempted, entitlementsOk, isResetting]);

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
    // Fire bloom ~1000ms before splash exits so it peaks during the dissolve.
    const glowTimer   = setTimeout(() => setShowGlow(true),    3800);
    // Splash lasts 4800ms total.
    const splashTimer = setTimeout(() => setSplashDone(true),  4800);
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
    console.log('[Auth] logout called because user_clicked_signout triggeredBy=handleLogout');
    await performFullLogout('user_clicked_signout');
    setPhase("unauthenticated");
    setLocation("/");
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
    logout: handleLogout,
    factoryReset: handleFactoryReset,
    safeRefreshEntitlements: handleSafeRefreshEntitlements,
  };
  console.log('[PremiumTruth] authContextValue — entitlementsVerified:', entitlementsVerified, 'isPremium:', authContextValue.isPremium, 'storedIsPremium:', user?.isPremium);

  return (
    <AppAuthContext.Provider value={authContextValue}>
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.25, 0.1, 0, 1] }}
            className="h-full"
          >
            <LoginScreen />
          </motion.div>
        )}

        {phase === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0, 1] }}
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
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
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
            console.log('[AppFlow] Premium tour complete — posting tour-seen');
            await postTourSeen();
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
              plan: data.isPremium ? 'premium' : 'free',
              isPremium: data.isPremium,
              hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
              hasSeenPremiumTour: !!data.hasSeenPremiumTour,
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
