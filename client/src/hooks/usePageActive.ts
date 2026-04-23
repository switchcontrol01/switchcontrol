/**
 * usePageActive — returns true when the current route matches the given path.
 *
 * Usage:
 *   const active = usePageActive("/dashboard");
 *
 * Rules:
 *   - Exact match OR prefix match (with trailing segment).
 *   - Stable across re-renders; only causes re-render when route changes.
 *   - Works with wouter's useLocation — no extra deps.
 *
 * Use this to gate expensive page-specific work so it only runs while the
 * user is actually on that page.
 */
import { useLocation } from "wouter";

export function usePageActive(route: string): boolean {
  const [location] = useLocation();
  if (route === "/") return location === "/";
  return location === route || location.startsWith(route + "/");
}
