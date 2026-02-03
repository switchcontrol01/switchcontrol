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
import { AnimatePresence, motion } from "framer-motion";

const TOKEN_KEY = "sc_auth_token_v1";

type Screen = "splash" | "login" | "dashboard";

const transitionVariants = [
  {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
  },
  {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
];

function AppContent() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [transitionIndex] = useState(() => Math.floor(Math.random() * transitionVariants.length));

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

  const variant = transitionVariants[transitionIndex];

  return (
    <AnimatePresence mode="wait">
      {screen === "splash" && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="h-full"
        >
          <Splash onComplete={() => {}} />
        </motion.div>
      )}

      {screen === "login" && (
        <motion.div
          key="login"
          initial={variant.initial}
          animate={variant.animate}
          exit={variant.exit}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          <Login
            onLoginSuccess={() => {
              window.location.hash = "#/dashboard";
              setScreen("dashboard");
            }}
          />
        </motion.div>
      )}

      {screen === "dashboard" && (
        <motion.div
          key="dashboard"
          initial={variant.initial}
          animate={variant.animate}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          <Dashboard />
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
