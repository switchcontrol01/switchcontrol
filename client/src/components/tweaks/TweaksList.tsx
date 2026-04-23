import { useState, useMemo, useEffect, useRef } from "react";
import { TweakCard } from "./TweakCard";
import { TweakSliderCard } from "./TweakSliderCard";
import { TWEAKS_DATA, TweakCategory, TweakLevel } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, RotateCcw, CheckCircle2, AlertTriangle, ShieldCheck, FlaskConical, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTweakExecutor, isElectronWithTweaks, isRealTweak, isSliderTweak, SLIDER_TWEAKS } from "@/hooks/use-tweak-executor";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";

const CATEGORIES = ["Performance", "Latency", "Input", "Visuals", "Services", "Privacy", "Aesthetics", "Sliders"];

const CATEGORY_MAP: Record<string, TweakCategory[]> = {
  "Performance": ["System and Power", "Memory and Storage", "GPU and Graphics"],
  "Latency":     ["Gaming and Latency"],
  "Input":       ["Input"],
  "Visuals":     ["GPU and Graphics", "Windows UX"],
  "Services":    ["Debloat and Apps", "System and Power"],
  "Privacy":     ["Privacy and Telemetry"],
  "Aesthetics":  ["Windows UX"],
  "Sliders":     [], // special — handled by controlType filter below
};

// ── Level tab config ─────────────────────────────────────────────────────────

type LevelFilter = "All" | TweakLevel;

const LEVEL_TABS: { id: LevelFilter; label: string; icon: typeof ShieldCheck; color: string; activeClass: string; warnOnFirstOpen?: boolean }[] = [
  { id: "All",          label: "All",          icon: Cpu,          color: "text-white/60",    activeClass: "bg-primary text-white border-primary shadow-[0_0_15px_rgba(168,85,247,0.3)]" },
  { id: "Recommended",  label: "Recommended",  icon: ShieldCheck,  color: "text-emerald-400", activeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.2)]" },
  { id: "Advanced",     label: "Advanced",     icon: SlidersHorizontal, color: "text-blue-400", activeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-[0_0_12px_rgba(96,165,250,0.2)]", warnOnFirstOpen: true },
  { id: "Experimental", label: "Experimental", icon: FlaskConical, color: "text-amber-400",  activeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_12px_rgba(251,191,36,0.2)]", warnOnFirstOpen: true },
];

const LEVEL_WARN: Record<string, { title: string; body: string }> = {
  Advanced: {
    title: "Advanced Tweaks",
    body:  "These tweaks modify system internals and are intended for power users. They carry a higher risk of instability on some hardware. Review each tweak before applying.",
  },
  Experimental: {
    title: "Experimental Tweaks",
    body:  "Experimental tweaks are unproven — they may cause crashes, performance regressions, or driver conflicts on certain systems. Apply at your own risk and create a restore point first.",
  },
};

export function TweaksList() {
  const { tweaks, toggleTweak, resetData, enableRecommended, setTweak } = useStore();
  const { syncAllTweaks, isElectron } = useTweakExecutor();
  const { toast } = useToast();
  const [search, setSearch]         = useState("");
  const [activeChip, setActiveChip] = useState<string>("All");
  const [activeLevel, setActiveLevel] = useState<LevelFilter>("All");
  const [showRisky, setShowRisky]   = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [warnLevel, setWarnLevel]   = useState<string | null>(null); // level name that needs confirmation
  const seenWarnings = useRef<Set<string>>(new Set());

  const handleLevelTab = (tab: typeof LEVEL_TABS[number]) => {
    if (tab.warnOnFirstOpen && !seenWarnings.current.has(tab.id)) {
      setWarnLevel(tab.id);
    } else {
      setActiveLevel(tab.id);
    }
  };

  const confirmLevelWarn = () => {
    if (!warnLevel) return;
    seenWarnings.current.add(warnLevel);
    setActiveLevel(warnLevel as LevelFilter);
    setWarnLevel(null);
  };

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

  // Zustand store is the single source of truth.
  // It is authoritative after two events:
  //   1. Initial syncAllTweaks (calls setTweak for every real tweak from live system read).
  //   2. Each successful toggle (onToggle → toggleTweak updates the store).
  // We do NOT use the executor's localState here because TweaksList and TweakCard
  // each hold separate useTweakExecutor() instances.  TweakCard's executor updates
  // its own localState after execution, but TweaksList's copy is never refreshed,
  // so reading it would give a stale disk-loaded value and cause visual bounce-back.
  const getTweakEnabled = (tweakId: string): boolean => tweaks[tweakId] ?? false;

  const filteredTweaks = useMemo(() => {
    return TWEAKS_DATA.filter((t) => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                            t.description.toLowerCase().includes(search.toLowerCase());
      let matchesChip: boolean;
      if (activeChip === "All") {
        matchesChip = true;
      } else if (activeChip === "Sliders") {
        matchesChip = t.controlType === "slider";
      } else {
        matchesChip = CATEGORY_MAP[activeChip]?.includes(t.category) ?? false;
      }
      const matchesRisk   = showRisky ? true : t.risk !== "Risky";
      const matchesLevel  = activeLevel === "All" || t.level === activeLevel;
      return matchesSearch && matchesChip && matchesRisk && matchesLevel;
    });
  }, [search, activeChip, showRisky, activeLevel]);

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

      {/* Level filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {LEVEL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeLevel === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleLevelTab(tab)}
              data-testid={`level-tab-${tab.id.toLowerCase()}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide border transition-all duration-300",
                isActive
                  ? tab.activeClass
                  : "bg-white/[0.04] text-white/40 border-white/[0.07] hover:text-white/60 hover:border-white/15"
              )}
            >
              <Icon className={cn("size-3", isActive ? "" : tab.color)} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Category chips */}
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

      {/* Level warning dialog */}
      <AnimatePresence>
        {warnLevel && LEVEL_WARN[warnLevel] && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[6px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setWarnLevel(null)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm pointer-events-auto"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassModalSurface className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <AlertTriangle className="size-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">{LEVEL_WARN[warnLevel].title}</h3>
                    <p className="text-sm text-white/55 mt-1 leading-relaxed">{LEVEL_WARN[warnLevel].body}</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setWarnLevel(null)}
                    data-testid="button-level-warn-cancel"
                    className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmLevelWarn}
                    data-testid="button-level-warn-confirm"
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 transition-colors"
                  >
                    I understand
                  </button>
                </div>
              </GlassModalSurface>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
              {tweak.controlType === "slider" ? (
                <TweakSliderCard tweak={tweak} />
              ) : (
                <TweakCard
                  tweak={tweak}
                  isEnabled={getTweakEnabled(tweak.id)}
                  onToggle={() => toggleTweak(tweak.id)}
                />
              )}
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
