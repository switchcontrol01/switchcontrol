import React, { useEffect, useState, createContext, useContext, useCallback } from "react";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUpgradeAnimation } from "@/components/PremiumUpgradeAnimation";
import { preloadAudio } from "@/lib/premium-audio";
import { GuidedTour } from "@/components/GuidedTour";
import { WindowControls } from "@/components/WindowControls";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, validateToken, exchangeToken, AuthUser, refreshEntitlements, retryRefreshEntitlements, performFullLogout, postUnlockSeen, postTourSeen } from "@/lib/auth-store";
import { PendingActivationModal } from "@/components/PendingActivationModal";

import Splash from "@/screens/Splash";
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
import BiosAdvisor from "@/pages/BiosAdvisor";
import Security from "@/pages/Security";
import Tweaks from "@/pages/Tweaks";
import History from "@/pages/History";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import Download from "@/pages/Download";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Success from "@/pages/Success";
import PremiumSuccess from "@/pages/PremiumSuccess";
import LoginPage from "@/pages/Login";

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

type AppPhase = "splash" | "unauthenticated" | "welcome" | "authenticated";

interface AppAuthContextValue {
  user: AuthUser | null;
  isPremium: boolean;
  logout: () => void;
  factoryReset: () => Promise<void>;
  safeRefreshEntitlements: () => Promise<{ user: AuthUser | null }>;
}

const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  logout: () => {},
  factoryReset: async () => {},
  safeRefreshEntitlements: async () => ({ user: null }),
});

export function useAppAuth() {
  return useContext(AppAuthContext);
}

function ElectronAppRoutes() {
  return (
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
      <Route path="/security" component={Security} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      <Route>
        <Home />
      </Route>
    </Switch>
  );
}

function WebsiteRoutes() {
  return (
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
  );
}

type AppFlow = "none" | "firstTime" | "premiumUnlock" | "premiumTour";

function ElectronAppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [activeFlow, setActiveFlow] = useState<AppFlow>("none");
  const [isResetting, setIsResetting] = useState(false);
  const [entitlementsAttempted, setEntitlementsAttempted] = useState(false);
  const [entitlementsOk, setEntitlementsOk] = useState(false);
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
    refreshEntitlements()
      .then((result) => {
        console.log('[AppFlow] Entitlements hydrated — isPremium:', result.user?.isPremium, 'hasSeenPremiumUnlock:', result.user?.hasSeenPremiumUnlock);
        if (result.user) {
          setEntitlementsOk(true);
        } else {
          console.warn('[AppFlow] Entitlement hydration returned no user — entitlementsOk stays false');
        }
      })
      .catch((err) => {
        console.warn('[AppFlow] Entitlement hydration failed — entitlementsOk stays false:', err);
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

    if (isFirstTimeUser && isFirstLogin && entitlementsAttempted) {
      console.log('[AppFlow] PRIORITY 1: First-time onboarding tour');
      setActiveFlow("firstTime");
      return;
    }

    if (!entitlementsOk) return;

    if (
      user.isPremium === true &&
      user.hasSeenPremiumUnlock === false &&
      !unlockFiredThisSessionRef.current
    ) {
      console.log('[AppFlow] PRIORITY 2: Premium unlock animation');
      unlockFiredThisSessionRef.current = true;
      setActiveFlow("premiumUnlock");
      return;
    }

    if (user.isPremium === true && user.hasSeenPremiumTour === false) {
      console.log('[AppFlow] PRIORITY 3: Premium guided tour');
      setActiveFlow("premiumTour");
      return;
    }
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
    const warmAudio = () => { preloadAudio(); window.removeEventListener('click', warmAudio); window.removeEventListener('keydown', warmAudio); };
    window.addEventListener('click', warmAudio, { once: true });
    window.addEventListener('keydown', warmAudio, { once: true });
    return () => { window.removeEventListener('click', warmAudio); window.removeEventListener('keydown', warmAudio); };
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setSplashDone(true);
    }, 2800);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    console.log('[App] Registering deep link auth callback (once)');
    const api = (window as any).electronAPI;

    api.auth.onCallback(async (url: string) => {
      console.log('[PremiumFlow] deep-link received:', url);
      useAuthStore.getState().setOauthDeepLinkReceived(true);

      try {
        const parsed = new URL(url);
        const newToken = parsed.searchParams.get('token');
        const provider = parsed.searchParams.get('provider');
        const premiumActivated = parsed.searchParams.get('premium_activated') === 'true';
        const currentUser = useAuthStore.getState().user;

        console.log('[PremiumFlow] parsed — token:', newToken ? 'present' : 'missing', 'provider:', provider, 'premiumActivated:', premiumActivated, 'currentUserLoggedIn:', currentUser?.loggedIn);

        if (premiumActivated && currentUser?.loggedIn) {
          console.log('[PremiumFlow] Premium purchase return — user already logged in, refreshing entitlements with retries...');

          const result = await retryRefreshEntitlements({
            attempts: 30,
            delayMs: 1000,
            initialDelayMs: 500,
          });

          if (result.ok && result.user?.isPremium) {
            console.log('[PremiumFlow] Premium confirmed — entitlement useEffect will handle animation');
            return;
          }

          console.warn('[PremiumFlow] Premium not confirmed after retries — showing pending modal');
          setShowPendingActivation(true);
          return;
        }

        if (newToken) {
          console.log('[Auth] exchangeToken starting — DO NOT clear store beforehand');
          useAuthStore.getState().setValidating(true);

          const EXCHANGE_TIMEOUT_MS = 15_000;
          const exchangedUser = await Promise.race([
            exchangeToken(newToken),
            new Promise<null>((resolve) => setTimeout(() => {
              console.warn('[Auth] exchangeToken timed out after', EXCHANGE_TIMEOUT_MS, 'ms');
              resolve(null);
            }, EXCHANGE_TIMEOUT_MS)),
          ]);

          if (exchangedUser) {
            useAuthStore.getState().setToken(newToken);
            useAuthStore.getState().setUser(exchangedUser);
            console.log(`[Auth] exchangeToken success — user=${exchangedUser.id} provider=${provider} ts=${Date.now()}`);

            if ((window as any).electronAPI?.debugCookies) {
              const cookies = await (window as any).electronAPI.debugCookies();
              console.log('[Auth][RENDERER] Electron cookies after exchangeToken:', cookies);
            }

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
              console.log('[PremiumFlow] Token exchange + premiumActivated — retrying until premium confirmed...');
              const premResult = await retryRefreshEntitlements({
                attempts: 30,
                delayMs: 1000,
                initialDelayMs: 300,
              });
              if (premResult.ok && premResult.user?.isPremium) {
                console.log('[PremiumFlow] Premium confirmed after login — entitlement useEffect will handle animation');
              } else {
                console.warn('[PremiumFlow] Premium not confirmed after login retries — showing pending');
                setShowPendingActivation(true);
              }
            }
          } else {
            console.error('[App] Token exchange failed — setting unauthenticated (NO cookie clear)');
            useAuthStore.getState().clear();
            setPhase("unauthenticated");
            useAuthStore.getState().setOauthError('Login failed. Please try again.');
          }
          useAuthStore.getState().setValidating(false);
        } else if (!premiumActivated) {
          console.log('[App] Deep link with no token and no premium flag — going to login');
          useAuthStore.getState().setOauthError('Login cancelled or timed out');
          setPhase("unauthenticated");
        }
      } catch (err) {
        console.error('[App] Error parsing auth callback:', err);
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
    try {
      const result = await refreshEntitlements();
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
    isPremium: user?.isPremium ?? false,
    logout: handleLogout,
    factoryReset: handleFactoryReset,
    safeRefreshEntitlements: handleSafeRefreshEntitlements,
  };

  return (
    <AppAuthContext.Provider value={authContextValue}>
      <AnimatePresence mode="wait">
        {phase === "splash" && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="h-full"
          >
            <Splash onComplete={() => {}} />
          </motion.div>
        )}

        {phase === "unauthenticated" && (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            <LoginScreen />
          </motion.div>
        )}

        {phase === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
    isPremium: user?.isPremium ?? false,
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
