/**
 * useSystemIntelligence — React hook for the shared System Intelligence profile.
 *
 * Triggers a fetch on first mount (no-op if already loaded/loading).
 * Returns the cached profile from the Zustand store.
 */

import { useEffect } from "react";
import {
  useSystemIntelligenceStore,
  SystemIntelligenceProfile,
  formatMotherboard,
  formatBios,
  formatCpu,
  formatGpu,
  formatRam,
  formatStorage,
  formatNetwork,
} from "@/stores/systemIntelligenceStore";

export interface UseSystemIntelligenceResult {
  profile: SystemIntelligenceProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // Convenience formatted strings
  motherboard: string;
  bios: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  network: string;
}

export function useSystemIntelligence(): UseSystemIntelligenceResult {
  const { profile, loading, error, fetch, refresh } = useSystemIntelligenceStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    profile,
    loading,
    error,
    refresh,
    motherboard: formatMotherboard(profile),
    bios: formatBios(profile),
    cpu: formatCpu(profile),
    gpu: formatGpu(profile),
    ram: formatRam(profile),
    storage: formatStorage(profile),
    network: formatNetwork(profile),
  };
}
