import { useState, useEffect } from "react";
import Splash from "./Splash";
import Login from "./Login";

type BootPhase = "splash" | "login" | "app";

interface BootGateProps {
  children: React.ReactNode;
}

export default function BootGate({ children }: BootGateProps) {
  const [phase, setPhase] = useState<BootPhase>("splash");

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("switchcontrol_auth") === "true";
    if (isAuthenticated) {
      setPhase("app");
    }
  }, []);

  const handleSplashComplete = () => {
    const isAuthenticated = localStorage.getItem("switchcontrol_auth") === "true";
    setPhase(isAuthenticated ? "app" : "login");
  };

  const handleLoginSuccess = () => {
    setPhase("app");
  };

  if (phase === "splash") {
    return <Splash onComplete={handleSplashComplete} />;
  }

  if (phase === "login") {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <>{children}</>;
}
