import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, navigate] = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 30, // 30 seconds - balance security and performance
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      }
      setIsChecking(false);
    }
  }, [user, isLoading, navigate]);

  if (isLoading || isChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

export function useAuth() {
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 30, // 30 seconds - balance security and performance
    refetchOnWindowFocus: true,
  });

  return { user, isLoading, isAuthenticated: !!user, refetch };
}
