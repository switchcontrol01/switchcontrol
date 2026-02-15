import React, { useEffect, useState, createContext, useContext, useCallback } from "react";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUnlockAnimation } from "@/components/PremiumUnlockAnimation";
import { PremiumUpgradeAnimation, shouldShowPremiumAnimation } from "@/components/PremiumUpgradeAnimation";
import { GuidedTour, usePremiumTourState } from "@/components/GuidedTour";
import { WindowControls } from "@/components/WindowControls";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, validateToken, exchangeToken, AuthUser, refreshEntitlements, retryRefreshEntitlements, performFullLogout } from "@/lib/auth-store";
import { usePremiumActivation } from "@/lib/premium-activation-store";
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
}

const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  logout: () => {},
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

function ElectronAppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showUpgradeAnimation, setShowUpgradeAnimation] = useState(false);
  const [showPendingActivation, setShowPendingActivation] = useState(false);
  const { showTour: showPremiumTour, triggerTour: triggerPremiumTour, completeTour: completePremiumTour } = usePremiumTourState();
  const { token, user, setToken, setUser, logout: storeLogout, setValidating } = useAuthStore();
  const [, setLocation] = useHashLocation();

  const handlePremiumUpgrade = useCallback(() => {
    console.log('[TEMP-LOG] handlePremiumUpgrade called');
    console.log('[App] Premium upgrade detected!');
    if (shouldShowPremiumAnimation()) {
      console.log('[TEMP-LOG] shouldShowPremiumAnimation=true, setting showUpgradeAnimation=true');
      setShowUpgradeAnimation(true);
    } else {
      console.log('[App] Animation already shown, skipping');
      triggerPremiumTour();
    }
  }, [triggerPremiumTour]);

  const triggerActivation = usePremiumActivation((s) => s.triggerActivation);
  
  const handleUpgradeAnimationComplete = useCallback(() => {
    setShowUpgradeAnimation(false);
    triggerActivation();
    triggerPremiumTour();
  }, [triggerPremiumTour, triggerActivation]);

  useEffect(() => {
    if (!user?.loggedIn || phase !== 'authenticated') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] App focused, refreshing entitlements...');
        // Clear any stuck focus states
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        const result = await refreshEntitlements();
        if (result.upgraded) {
          handlePremiumUpgrade();
        }
      }
    };

    const handleFocus = async () => {
      console.log('[App] Window focused, refreshing entitlements...');
      // Clear any stuck focus states
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const result = await refreshEntitlements();
      if (result.upgraded) {
        handlePremiumUpgrade();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.loggedIn, phase, handlePremiumUpgrade]);

  // Electron window focus event - clear any stuck UI states and force reflow
  useEffect(() => {
    if (!isElectron) return;
    
    const api = (window as any).electronAPI;
    
    const resetUIState = () => {
      console.log('[App] Resetting UI state on focus');
      
      // Blur any focused element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      
      // Force reflow to clear any stuck visual states
      const root = document.getElementById('root');
      if (root) {
        root.style.display = 'none';
        void root.offsetHeight; // Force reflow
        root.style.display = '';
      }
      
      // Clear any stuck overlay classes
      document.querySelectorAll('[data-overlay]').forEach(el => {
        (el as HTMLElement).style.pointerEvents = '';
        (el as HTMLElement).style.opacity = '';
      });
      
      // Remove any stuck focus rings
      document.querySelectorAll('.ring-2, .ring-primary, [class*="focus:ring"]').forEach(el => {
        (el as HTMLElement).blur();
      });
    };
    
    if (api?.onWindowFocus) {
      api.onWindowFocus(() => {
        console.log('[App] Electron window focus - clearing UI state');
        resetUIState();
      });
      
      return () => {
        api.removeWindowFocusListener?.();
      };
    }
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setSplashDone(true);
    }, 2800);
    return () => clearTimeout(splashTimer);
  }, []);

  const handlePremiumUpgradeRef = React.useRef(handlePremiumUpgrade);
  handlePremiumUpgradeRef.current = handlePremiumUpgrade;

  useEffect(() => {
    if (!isElectron) return;
    console.log('[App] Registering deep link auth callback (once)');
    const api = (window as any).electronAPI;

    api.auth.onCallback(async (url: string) => {
      console.log('[TEMP-LOG] deep-link callback fired');
      console.log('[PremiumFlow] deep-link received:', url);

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

          if (result.ok && result.upgraded) {
            console.log('[PremiumFlow] Premium upgrade confirmed via retries — playing animation');
            handlePremiumUpgradeRef.current();
            return;
          }

          if (result.ok && result.user?.isPremium) {
            console.log('[PremiumFlow] User already premium, no upgrade animation needed');
            return;
          }

          console.warn('[PremiumFlow] Premium not confirmed after retries — showing pending modal');
          setShowPendingActivation(true);
          return;
        }

        if (newToken) {
          console.log('[Auth] exchangeToken starting — DO NOT clear store beforehand');
          useAuthStore.getState().setValidating(true);

          const exchangedUser = await exchangeToken(newToken);

          if (exchangedUser) {
            useAuthStore.getState().setToken(newToken);
            useAuthStore.getState().setUser(exchangedUser);
            console.log(`[Auth] exchangeToken success, now validating /api/me in 300ms — user=${exchangedUser.id} provider=${provider} ts=${Date.now()}`);

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
              console.log('[PremiumFlow] Token exchange + premiumActivated — validating premium with retries...');
              const premResult = await retryRefreshEntitlements({
                attempts: 30,
                delayMs: 1000,
                initialDelayMs: 300,
              });
              if (premResult.ok && premResult.upgraded) {
                console.log('[PremiumFlow] Premium confirmed after login — playing animation');
                handlePremiumUpgradeRef.current();
              } else if (premResult.ok && premResult.user?.isPremium) {
                console.log('[PremiumFlow] Already premium after login, no animation');
              } else {
                console.warn('[PremiumFlow] Premium not confirmed after login retries — showing pending');
                setShowPendingActivation(true);
              }
            }
          } else {
            console.error('[App] Token exchange failed — setting unauthenticated (NO cookie clear)');
            useAuthStore.getState().clear();
            setPhase("unauthenticated");
          }
          useAuthStore.getState().setValidating(false);
        } else if (!premiumActivated) {
          console.log('[App] Deep link with no token and no premium flag — going to login');
          setPhase("unauthenticated");
        }
      } catch (err) {
        console.error('[App] Error parsing auth callback:', err);
        useAuthStore.getState().setValidating(false);
      }
    });

    return () => {
      (window as any).electronAPI?.auth?.removeCallbackListener?.();
    };
  }, []);

  useEffect(() => {
    if (!splashDone) return;

    const checkAuth = async () => {
      // Boot logging for auth state
      console.log('[Auth] Boot: token present:', !!token, 'user present:', !!user, 'premium:', user?.isPremium);
      
      // For Electron, use stored user data (cookies don't work cross-origin)
      if (token && user) {
        console.log('[Auth] Using stored user data:', user.id, 'isPremium:', user.isPremium);
        
        // Check if first time for this user
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
      } else if (token && !user) {
        // Token exists but no user - try to exchange again
        console.log('[App] Token exists but no user, re-exchanging...');
        setValidating(true);
        const exchangedUser = await exchangeToken(token);
        setValidating(false);
        
        if (exchangedUser) {
          setUser(exchangedUser);
          
          // Check if first time for this user
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
          console.log('[App] Boot: token exchange failed — clearing store (NO cookie clear, NO performFullLogout)');
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

  const authContextValue: AppAuthContextValue = {
    user: user,
    isPremium: user?.isPremium ?? false,
    logout: handleLogout,
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
                if (isFirstLogin) {
                  const tourKey = `sc_tour_completed_${user?.id}`;
                  if (!localStorage.getItem(tourKey)) {
                    setTimeout(() => setShowTour(true), 800);
                  }
                }
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
      
      {showTour && (
        <OnboardingTour
          onComplete={() => {
            setShowTour(false);
            if (user?.id) {
              localStorage.setItem(`sc_tour_completed_${user.id}`, 'true');
            }
          }}
          onSkip={() => {
            setShowTour(false);
            if (user?.id) {
              localStorage.setItem(`sc_tour_completed_${user.id}`, 'true');
            }
          }}
        />
      )}
      
      <PremiumUpgradeAnimation 
        show={showUpgradeAnimation} 
        onComplete={handleUpgradeAnimationComplete} 
      />
      
      <GuidedTour 
        show={showPremiumTour} 
        onComplete={completePremiumTour} 
      />
      
      <PendingActivationModal
        show={showPendingActivation}
        onUpgradeDetected={() => {
          setShowPendingActivation(false);
          handlePremiumUpgrade();
        }}
        onDismiss={() => setShowPendingActivation(false)}
      />
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
    localStorage.removeItem('sc_auth_token_v2');
    setUser(null);
    window.location.href = '/';
  };

  const authContextValue: AppAuthContextValue = {
    user,
    isPremium: user?.isPremium ?? false,
    logout: handleLogout,
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
          <PremiumUnlockAnimation />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}
