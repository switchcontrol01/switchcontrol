import { useAppAuth } from "@/App";
import { refreshEntitlements } from "@/lib/auth-store";

export function useAuth() {
  const { user, isPremium, logout, isSigningOut } = useAppAuth();

  return {
    user: user ? {
      loggedIn: true,
      id: user.id,
      email: user.email,
      name: user.username,
      firstName: user.username?.split(' ')[0] || null,
      lastName: null,
      avatar: user.avatarUrl,
      isPremium: user.isPremium,
      isAdmin: user.isAdmin,
      hasSeenPremiumUnlock: user.hasSeenPremiumUnlock,
      plan: user.plan,
      trialEndsAt: user.trialEndsAt,
    } : null,
    isLoading: false,
    isAuthenticated: !!user,
    isPremium,
    isSigningOut,
    logout,
    refetch: async () => {
      await refreshEntitlements();
    },
  };
}
