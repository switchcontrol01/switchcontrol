import Splash from "@/screens/Splash";
import Login from "@/screens/Login";
import Dashboard from "@/screens/Dashboard";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/lib/motion";
import { PremiumUnlockAnimation } from "@/components/PremiumUnlockAnimation";
import { WindowControls } from "@/components/WindowControls";

const TOKEN_KEY = "sc_auth_token_v1";

type Screen = "splash" | "login" | "dashboard";

function AppContent() {
  const [screen, setScreen] = useState<Screen>("splash");

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "#/";
    }

    const token = localStorage.getItem(TOKEN_KEY);
    const authed = Boolean(token && token.length > 10);

    setTimeout(() => {
      setScreen(authed ? "dashboard" : "login");
      window.location.hash = authed ? "#/dashboard" : "#/login";
    }, 1100);
  }, []);

  if (screen === "splash") {
    return <Splash onComplete={() => {}} />;
  }

  if (screen === "login") {
    return (
      <Login
        onLoginSuccess={() => {
          window.location.hash = "#/dashboard";
          setScreen("dashboard");
        }}
      />
    );
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <TooltipProvider>
          <div className="relative min-h-screen" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <WindowControls />
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
