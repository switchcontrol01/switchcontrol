import { useEffect, useState } from "react";
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

const TOKEN_KEY = "sc_auth_token_v1";
const USER_KEY = "sc_auth_user_v1";
const AUTH_DOMAIN = "https://switchcontrol.org";

type AppPhase = "splash" | "login" | "app";

interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  plan: string;
  isPremium: boolean;
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

async function fetchUserFromAPI(token: string): Promise<AuthUser | null> {
  try {
    console.log('[App] Fetching user from API with token');
    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('[App] API /me failed with status:', response.status);
      return null;
    }
    
    const user = await response.json();
    console.log('[App] User data from API:', user);
    return user;
  } catch (err) {
    console.error('[App] Failed to fetch user from API:', err);
    return null;
  }
}

function AppContent() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [, setLocation] = useHashLocation();

  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && (window as any).auth?.onCallback;
    
    if (isElectron) {
      console.log('[App] Registering auth callback listener');
      
      (window as any).auth.onCallback(async (url: string) => {
        console.log('[App] AUTH CALLBACK:', url);
        
        try {
          const parsed = new URL(url);
          const token = parsed.searchParams.get('token');
          const provider = parsed.searchParams.get('provider');
          
          console.log('[App] Parsed token:', token ? 'present' : 'missing');
          console.log('[App] Provider:', provider);
          
          if (token) {
            localStorage.setItem(TOKEN_KEY, token);
            
            const user = await fetchUserFromAPI(token);
            
            if (user) {
              localStorage.setItem(USER_KEY, JSON.stringify(user));
              console.log('[App] User stored, transitioning to app phase');
              setPhase("app");
              setLocation("/dashboard");
            } else {
              console.error('[App] Failed to fetch user after auth');
              localStorage.removeItem(TOKEN_KEY);
            }
          } else {
            console.error('[App] No token in callback URL');
          }
        } catch (err) {
          console.error('[App] Error parsing auth callback:', err);
        }
      });

      return () => {
        (window as any).auth?.removeCallbackListener();
      };
    }
  }, [setLocation]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const isAuthed = Boolean(token && token.length > 10);

    const timer = setTimeout(() => {
      setPhase(isAuthed ? "app" : "login");
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  return (
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

      {phase === "login" && (
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

      {phase === "app" && (
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
