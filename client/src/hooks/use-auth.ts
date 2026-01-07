import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AuthUser {
  loggedIn: boolean;
  id?: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  isPremium?: boolean;
}

async function fetchUser(): Promise<AuthUser> {
  const response = await fetch("/api/me", {
    credentials: "include",
  });

  if (!response.ok) {
    return { loggedIn: false };
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch } = useQuery<AuthUser>({
    queryKey: ["/api/me"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: true,
  });

  const logout = async () => {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      queryClient.setQueryData(['/api/me'], { loggedIn: false });
      queryClient.invalidateQueries({ queryKey: ['/api/me'] });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return {
    user: user?.loggedIn ? user : null,
    isLoading,
    isAuthenticated: user?.loggedIn ?? false,
    isPremium: user?.isPremium ?? false,
    logout,
    refetch,
  };
}
