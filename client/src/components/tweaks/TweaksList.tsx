import { useState, useMemo, useEffect } from "react";
import { TweakCard } from "./TweakCard";
import { TWEAKS_DATA, TweakCategory } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTweakExecutor, isElectronWithTweaks, isRealTweak } from "@/hooks/use-tweak-executor";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = ["Performance", "Latency", "Visuals", "Services", "Aesthetics"];

const CATEGORY_MAP: Record<string, TweakCategory[]> = {
  "Performance": ["System and Power", "Memory and Storage", "GPU and Graphics"],
  "Latency":     ["Gaming and Latency", "Network"],
  "Visuals":     ["GPU and Graphics", "Windows UX"],
  "Services":    ["Debloat and Apps", "System and Power"],
  "Aesthetics":  ["Windows UX"],
};

export function TweaksList() {
  const { tweaks, toggleTweak, resetData, enableRecommended, setTweak } = useStore();
  const { syncAllTweaks, localState, isElectron } = useTweakExecutor();
  const { toast } = useToast();
  const [search, setSearch]       = useState("");
  const [activeChip, setActiveChip] = useState<string>("All");
  const [showRisky, setShowRisky] = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  // Log state on load so we can verify what's stored
  useEffect(() => {
    const enabledIds = Object.entries(tweaks).filter(([, v]) => v).map(([k]) => k);
    console.log(`[Tweaks:LOAD] source=zustand-persist enabled=${enabledIds.length} total_known=${Object.keys(tweaks).length}`);
    if (enabledIds.length > 0) {
      console.log(`[Tweaks:LOAD] enabled_ids=${enabledIds.join(", ")}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On load: verify all real tweak states against the system
  useEffect(() => {
    if (!isElectron) return;
    setSyncing(true);
    setSyncFailed(false);
    syncAllTweaks()
      .then((results) => {
        if (!results) return;
        Object.entries(results).forEach(([tweakId, status]) => {
          const s = status as { isApplied: boolean; applied: boolean; unsupported?: boolean; error: string | null };
          if (!s.error && !s.unsupported && isRealTweak(tweakId)) {
            setTweak(tweakId, s.isApplied ?? s.applied ?? false);
          }
        });
      })
      .catch((err) => {
        console.error('[TweaksList] Failed to sync:', err);
        setSyncFailed(true);
        toast({
          title: 'Sync Failed',
          description: 'Could not read tweak states from system. Using cached values.',
          variant: 'destructive',
        });
      })
      .finally(() => setSyncing(false));
  }, [isElectron, syncAllTweaks, setTweak, toast]);

  const getTweakEnabled = (tweakId: string): boolean => {
    const storeValue = tweaks[tweakId] ?? false;
    if (isElectron && isRealTweak(tweakId)) {
      if (syncFailed) return storeValue;
      const hasLocalState = tweakId in localState.appliedTweaks;
      return hasLocalState ? localState.appliedTweaks[tweakId] : storeValue;
    }
    return storeValue;
  };

  const filteredTweaks = useMemo(() => {
    return TWEAKS_DATA.filter((t) => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                            t.description.toLowerCase().includes(search.toLowerCase());
      const matchesChip   = activeChip === "All" || (CATEGORY_MAP[activeChip]?.includes(t.category));
      const matchesRisk   = showRisky ? true : t.risk !== "Risky";
      return matchesSearch && matchesChip && matchesRisk;
    });
  }, [search, activeChip, showRisky]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Top Bar */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search tweaks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-tweaks"
            className="pl-9 bg-black/40 border-white/5 focus:border-primary/50 transition-all rounded-xl h-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={enableRecommended}
            size="sm"
            data-testid="button-apply-safe"
            className="h-9 px-4 gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="size-4" />
            Apply Safe
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={resetData}
            data-testid="button-reset-tweaks"
            className="h-9 gap-2 border-white/5 hover:bg-white/5"
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRisky(!showRisky)}
            data-testid="button-filter-settings"
            className={cn(
              "h-9 w-9 p-0 transition-colors",
              showRisky
                ? "text-orange-400 bg-orange-500/10 border border-orange-500/25 hover:bg-orange-500/20"
                : "hover:bg-white/5"
            )}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </motion.div>

      {/* Filter Chips */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {["All", ...CATEGORIES].map((chip, i) => (
            <motion.div
              key={chip}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.18 + i * 0.045, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={() => setActiveChip(chip)}
                data-testid={chip === "All" ? "filter-chip-all" : `filter-chip-${chip.toLowerCase().replace(/\s+/g, '-')}`}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border",
                  activeChip === chip
                    ? "bg-primary text-white border-primary shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                    : "bg-white/5 text-muted-foreground border-white/5 hover:border-white/10"
                )}
              >
                {chip}
              </button>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Sync status indicator */}
      <AnimatePresence>
        {isElectron && syncing && (
          <motion.div
            className="text-xs text-muted-foreground flex items-center gap-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
            Verifying tweak states from system…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tweaks Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-12 items-start">
        <AnimatePresence mode="popLayout">
          {filteredTweaks.map((tweak, index) => (
            <motion.div
              key={tweak.id}
              className="self-start"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{
                duration: 0.25,
                delay: Math.min(index, 8) * 0.03,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ willChange: "opacity, transform" }}
            >
              <TweakCard
                tweak={tweak}
                isEnabled={getTweakEnabled(tweak.id)}
                onToggle={() => toggleTweak(tweak.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredTweaks.length === 0 && (
          <motion.div
            className="col-span-full text-center py-20 text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            No tweaks found matching your search.
          </motion.div>
        )}
      </div>
    </div>
  );
}
