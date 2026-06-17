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
  const { profile, loading, error, fetch, refresh, initSpecsFetched, activeHardwareProfile } = useSystemIntelligenceStore();

  // Only trigger the initial fetch on first mount of the app session.
  // Once initSpecsFetched is true, no page remount will re-run deep polling.
  useEffect(() => {
    if (!initSpecsFetched) {
      fetch();
    }
  }, [fetch, initSpecsFetched]);

  // Use the cached profile for instant UI; falls back to null if nothing loaded yet.
  const displayProfile = profile ?? activeHardwareProfile;

  return {
    profile: displayProfile,
    loading,
    error,
    refresh,
    motherboard: formatMotherboard(displayProfile),
    bios: formatBios(displayProfile),
    cpu: formatCpu(displayProfile),
    gpu: formatGpu(displayProfile),
    ram: formatRam(displayProfile),
    storage: formatStorage(displayProfile),
    network: formatNetwork(displayProfile),
  };
}
