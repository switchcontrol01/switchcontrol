import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { TWEAKS_DATA } from "./mock-data";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.fetchSettings,
  });
}

export function useTweaks() {
  return useQuery({
    queryKey: ["tweaks"],
    queryFn: api.fetchTweaks,
  });
}

export function useToggleTweak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tweakId, enabled, tweakTitle }: { tweakId: string; enabled: boolean; tweakTitle: string }) =>
      api.toggleTweak(tweakId, enabled, tweakTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tweaks"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useResetTweaks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.resetTweaks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tweaks"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

/* ── Apply Recommended Safety Guard ──
   Only tweaks that are boring-safe make it into Apply Recommended.
   Rejects: risky, network-risk, audio/mic-risk, reboot-required,
   unsupported, helper-required, unclear-revert.
*/
const GUARDED_TWEAK_IDS = new Set([
  // Network / ping-risk
  'bluetooth', 'wifi', 'tcp-congestion', 'tcp-task-offload', 'tcp-nagle',
  'tcp-timestamps', 'tcp-window-heuristics', 'udp-offloads', 'nic-flow-control',
  // System-breaking
  'disable-dcom', 'hyper-v', 'vbs', 'core-isolation', 'fax-printer',
  'fast-startup', 'disable-fso', 'irq-priority', 'synth-timers',
  // Unsupported / helper-required
  'hdcp', 'p-states', 'mouse-queue-size', 'kbd-queue-size', 'timer-resolution',
  // Reboot-required (blocked from bulk apply)
  'preemption', 'disable-mpo',
  // Audio / mic risk
  'bluetooth',
  // MMCSS aggressive (0 value)
  'sys-responsiveness',
]);

function isRecommendedSafe(t: (typeof TWEAKS_DATA)[number]): boolean {
  // Must be explicitly marked Recommended AND Safe
  if (t.level !== 'Recommended') return false;
  if (t.risk !== 'Safe') return false;
  if (!t.supported) return false;
  if (GUARDED_TWEAK_IDS.has(t.id)) return false;
  if (t.requiresReboot) return false;
  if (t.requiresAgent) return false;
  if (t.controlType === 'slider') return false; // sliders require manual choice
  if (t.requiresAdmin === false) return true;   // HKCU Safe = definitely OK
  return true; // HKLM Safe admin tweaks are OK for bulk apply
}

export function useApplyRecommended() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const recommendedIds = TWEAKS_DATA
        .filter(isRecommendedSafe)
        .map(t => t.id);
      // In Electron, use the guarded bulk path to protect audio/network devices
      if (typeof window !== 'undefined' && (window as any).electronAPI?.tweaks) {
        const { bulkApplyTweaks } = await import('@/hooks/use-tweak-executor');
        return bulkApplyTweaks(recommendedIds);
      }
      return api.applyRecommended(recommendedIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tweaks"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ["history"],
    queryFn: api.fetchHistory,
  });
}

export function useClearHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.clearHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

export function useAIScan() {
  return useQuery({
    queryKey: ["ai-scan"],
    queryFn: api.fetchAIScan,
  });
}

export function useRunAIScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.runAIScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-scan"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useClearRam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.clearRam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
