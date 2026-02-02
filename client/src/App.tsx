import { useState, useEffect, useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import Splash from "@/screens/Splash";
import Login from "@/screens/Login";
import Dashboard from "@/pages/Home";
import Tweaks from "@/pages/Tweaks";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import PowerPlan from "@/pages/PowerPlan";
import NetworkTweaks from "@/pages/NetworkTweaks";
import SystemCleaner from "@/pages/SystemCleaner";
import Debloater from "@/pages/Debloater";
import StartupApps from "@/pages/StartupApps";
import FocusMode from "@/pages/FocusMode";
import AppBooster from "@/pages/AppBooster";
import BiosAdvisor from "@/pages/BiosAdvisor";
import Security from "@/pages/Security";
import { PremiumUnlockAnimation } from "@/components/PremiumUnlockAnimation";

const AUTH_TOKEN_KEY = "sc_auth_token_v1";

function isAuthenticated(): boolean {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return !!token && token.length > 10;
}

function getHashRoute(): string {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") {
    return "/";
  }
  return hash.replace(/^#/, "");
}

function navigateHash(path: string): void {
  window.location.hash = path;
}

type BootPhase = "splash" | "login" | "dashboard";

function BootGate() {
  const [phase, setPhase] = useState<BootPhase>("splash");

  const handleSplashComplete = useCallback(() => {
    if (isAuthenticated()) {
      setPhase("dashboard");
      navigateHash("/dashboard");
    } else {
      setPhase("login");
      navigateHash("/login");
    }
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setPhase("dashboard");
    navigateHash("/dashboard");
  }, []);

  if (phase === "splash") {
    return <Splash onComplete={handleSplashComplete} />;
  }

  if (phase === "login") {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <AppRouter />;
}

function AppRouter() {
  const [route, setRoute] = useState(getHashRoute());

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getHashRoute());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigateHash("/login");
      window.location.reload();
    }
  }, []);

  switch (route) {
    case "/":
    case "/dashboard":
      return <Dashboard />;
    case "/tweaks":
      return <Tweaks />;
    case "/history":
      return <History />;
    case "/settings":
      return <Settings />;
    case "/power-plan":
      return <PowerPlan />;
    case "/network":
      return <NetworkTweaks />;
    case "/app-booster":
      return <AppBooster />;
    case "/focus":
      return <FocusMode />;
    case "/cleaner":
      return <SystemCleaner />;
    case "/debloat":
      return <Debloater />;
    case "/startup":
      return <StartupApps />;
    case "/bios-advisor":
      return <BiosAdvisor />;
    case "/security":
      return <Security />;
    default:
      navigateHash("/dashboard");
      return <Dashboard />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <TooltipProvider>
          <BootGate />
          <Toaster />
          <PremiumUnlockAnimation />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}

export default App;
