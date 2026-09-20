import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/auth-store";

export interface AppAuthContextValue {
  user: AuthUser | null;
  isPremium: boolean;
  isAdmin: boolean;
  entitlementsVerified: boolean;
  isSigningOut: boolean;
  canSimulateFirstTimeUser: boolean;
  logout: () => void;
  factoryReset: () => Promise<void>;
  simulateFirstTimeUser: () => Promise<boolean>;
  safeRefreshEntitlements: () => Promise<{ user: AuthUser | null }>;
}

export const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  isAdmin: false,
  entitlementsVerified: false,
  isSigningOut: false,
  canSimulateFirstTimeUser: false,
  logout: () => {},
  factoryReset: async () => {},
  simulateFirstTimeUser: async () => false,
  safeRefreshEntitlements: async () => ({ user: null }),
});

export function useAppAuth() {
  return useContext(AppAuthContext);
}
