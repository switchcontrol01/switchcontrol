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
