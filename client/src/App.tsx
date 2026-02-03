import { useEffect, useState, createContext, useContext } from "react";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUnlockAnimation } from "@/components/PremiumUnlockAnimation";
import { WindowControls } from "@/components/WindowControls";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, validateToken, exchangeToken, AuthUser } from "@/lib/auth-store";

import Splash from "@/screens/Splash";
import Login from "@/screens/Login";
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

type AppPhase = "splash" | "unauthenticated" | "authenticated";

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

function AppRoutes() {
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
      <Route path="/settings" component={Settings} />
      <Route>
        <Home />
      </Route>
    </Switch>
  );
}

function AppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [splashDone, setSplashDone] = useState(false);
  const { token, user, setToken, setUser, logout: storeLogout, setValidating } = useAuthStore();
  const [, setLocation] = useHashLocation();

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setSplashDone(true);
    }, 2800);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && (window as any).auth?.onCallback;
    
    if (isElectron) {
      console.log('[App] Registering deep link auth callback');
      
      (window as any).auth.onCallback(async (url: string) => {
        console.log('[App] AUTH CALLBACK:', url);
        
        try {
          const parsed = new URL(url);
          const newToken = parsed.searchParams.get('token');
          const provider = parsed.searchParams.get('provider');
          
          console.log('[App] Token:', newToken ? 'present' : 'missing', 'Provider:', provider);
          
          if (newToken) {
            setValidating(true);
            storeLogout();
            
            const exchangedUser = await exchangeToken(newToken);
            
            if (exchangedUser) {
              setToken(newToken);
              setUser(exchangedUser);
              console.log('[App] Token exchanged, user authenticated:', exchangedUser.id);
              setPhase("authenticated");
              setLocation("/dashboard");
            } else {
              console.error('[App] Token exchange failed');
              storeLogout();
              setPhase("unauthenticated");
            }
            setValidating(false);
          } else {
            storeLogout();
            setPhase("unauthenticated");
          }
        } catch (err) {
          console.error('[App] Error parsing auth callback:', err);
          setValidating(false);
        }
      });

      return () => {
        (window as any).auth?.removeCallbackListener?.();
      };
    }
  }, [setToken, setUser, setLocation, setValidating]);

  useEffect(() => {
    if (!splashDone) return;

    const checkAuth = async () => {
      if (token) {
        console.log('[App] Existing token found, validating...');
        setValidating(true);
        const validatedUser = await validateToken(token);
        setValidating(false);
        
        if (validatedUser) {
          setUser(validatedUser);
          setPhase("authenticated");
        } else {
          console.log('[App] Stored token invalid, clearing');
          storeLogout();
          setPhase("unauthenticated");
        }
      } else {
        setPhase("unauthenticated");
      }
    };

    checkAuth();
  }, [splashDone, token, setUser, storeLogout, setValidating]);

  const handleLogout = () => {
    storeLogout();
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
            <Login />
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
              <AppRoutes />
            </Router>
          </motion.div>
        )}
      </AnimatePresence>
    </AppAuthContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <TooltipProvider>
          <div className="app-root">
            <div className="titlebar">
              <WindowControls />
            </div>
            <div className="app-content">
              <AppContent />
            </div>
          </div>
          <Toaster />
          <PremiumUnlockAnimation />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}
