import { useState, useEffect, useCallback } from "react";
import Splash from "./Splash";
import Login from "./Login";

type BootPhase = "splash" | "login" | "app";

const AUTH_TOKEN_KEY = "sc_auth_token_v1";

function isAuthenticated(): boolean {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return !!token && token.startsWith("mock_token_");
}

interface BootGateProps {
  children: React.ReactNode;
}

export default function BootGate({ children }: BootGateProps) {
  const [phase, setPhase] = useState<BootPhase>("splash");

  const handleSplashComplete = useCallback(() => {
    if (isAuthenticated()) {
      setPhase("app");
    } else {
      setPhase("login");
    }
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setPhase("app");
  }, []);

  if (phase === "splash") {
    return <Splash onComplete={handleSplashComplete} />;
  }

  if (phase === "login") {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <>{children}</>;
}
