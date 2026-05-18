import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/auth-store";

export interface AppAuthContextValue {
  user: AuthUser | null;
  isPremium: boolean;
  entitlementsVerified: boolean;
  isSigningOut: boolean;
  logout: () => void;
  factoryReset: () => Promise<void>;
  safeRefreshEntitlements: () => Promise<{ user: AuthUser | null }>;
}

export const AppAuthContext = createContext<AppAuthContextValue>({
  user: null,
  isPremium: false,
  entitlementsVerified: false,
  isSigningOut: false,
  logout: () => {},
  factoryReset: async () => {},
  safeRefreshEntitlements: async () => ({ user: null }),
});

export function useAppAuth() {
  return useContext(AppAuthContext);
}
