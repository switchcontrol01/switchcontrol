import { useStore } from "@/lib/store";

/**
 * Log an action to BOTH the local Zustand history store (immediately visible
 * in the History page) AND the server audit log (persisted across devices).
 *
 * Always use this instead of a bare fetch("/api/history") so the History page
 * updates instantly without requiring a reload.
 */
export function logHistory(
  action: string,
  page: string,
  result: string = "Applied",
  notes?: string
): void {
  useStore.getState().applyAction(action, page, result, notes);
  fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, page, result, notes }),
  }).catch(() => {});
}
