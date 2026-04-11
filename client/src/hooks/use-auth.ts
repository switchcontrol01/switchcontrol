import { useAppAuth } from "@/App";

export function useAuth() {
  const { user, isPremium, logout } = useAppAuth();

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
    } : null,
    isLoading: false,
    isAuthenticated: !!user,
    isPremium,
    logout,
    refetch: async () => {},
  };
}
