import { useState, useMemo, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TweakCard } from "./TweakCard";
import { TweakSliderCard } from "./TweakSliderCard";
import { TweakPresetCard } from "./TweakPresetCard";
import { TWEAKS_DATA, TweakCategory, TweakLevel, Tweak } from "@/lib/mock-data";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, RotateCcw, Sparkles, AlertTriangle, ShieldCheck, FlaskConical, Cpu, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTweakExecutor, isElectronWithTweaks, isRealTweak, isSliderTweak, SLIDER_TWEAKS } from "@/hooks/use-tweak-executor";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";
import { useOptimizationStore } from "@/stores/optimizationStore";
import { OptimizationFlow } from "@/components/optimization/OptimizationFlow";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";

// Module-level sync generation counter — persists across component remounts.
// Incremented when a new mount starts its sync; old in-flight syncs that
// resolve after the counter has moved discard their results rather than
// overwriting state written by the current mount.
let _syncGeneration = 0;

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

// Below this item count, keep the original per-card AnimatePresence grid —
// virtualization only kicks in once a section is actually large (e.g. "All").
const VIRTUALIZE_THRESHOLD = 30;
const ESTIMATED_ROW_HEIGHT = 150;

// ── Virtualized tweak grid (large sections only) ────────────────────────
// Chunks items into 2-per-row (matching the lg:grid-cols-2 layout) and lets
// react-virtual render only the rows near the viewport. Row height is
// measured dynamically so variable-height cards and the 1-col mobile
// layout both size correctly.
//
// IMPORTANT: the virtualizer scrolls the page's existing scroll root
// (#app-scroll-root) — NOT a nested div. This avoids the scroll-within-scroll
// trap where the user has to scroll inside a fixed-height inner box.
function VirtualizedTweakGrid({
  items, renderItem,
}: {
  items: Tweak[];
  renderItem: (tweak: Tweak, index: number) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // scrollMargin = distance from the scroll root's top edge to this container.
  // Measured after mount so the virtualizer's windowing math is correct.
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const scrollRoot = document.getElementById("app-scroll-root");
    if (!scrollRoot) return;
    // getBoundingClientRect gives positions relative to the viewport;
    // subtracting the scroll root's rect and adding its scrollTop gives the
    // container's offset from the scroll root's content top.
    const rootRect = scrollRoot.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setScrollMargin(containerRect.top - rootRect.top + scrollRoot.scrollTop);
  }, [items]); // re-measure when items change (filter change can shift layout)

  const rows = useMemo(() => {
    const out: Tweak[][] = [];
    for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
    return out;
  }, [items]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    // Use the app's top-level scroll container so the page scrolls naturally.
    getScrollElement: () => document.getElementById("app-scroll-root"),
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    getItemKey: (index) => rows[index].map(t => t.id).join("|"),
    measureElement: (el) => el.getBoundingClientRect().height,
    scrollMargin,
  });

  return (
    <div ref={containerRef} data-testid="grid-tweaks-virtualized"
      style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="pb-4"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {row.map((tweak, i) => (
                <div key={tweak.id} id={`tweak-card-${tweak.id}`} className="self-start">
                  {renderItem(tweak, virtualRow.index * 2 + i)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Level tab config ─────────────────────────────────────────────────────────

type LevelFilter = "All" | TweakLevel;

const LEVEL_TABS: { id: LevelFilter; label: string; icon: typeof ShieldCheck; color: string; activeClass: string; warnOnFirstOpen?: boolean }[] = [
  { id: "All",          label: "All",          icon: Cpu,          color: "text-[#A0A8B3]",    activeClass: "bg-primary text-[#E6EAF0] border-primary shadow-[0_0_15px_rgba(0,212,255,0.3)]" },
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
  const { tweaks, toggleTweak, resetData, setTweak } = useStore();
  const startOptimizationFlow = useOptimizationStore(s => s.startFlow);
  const { syncAllTweaks, isElectron } = useTweakExecutor();
  const { toast } = useToast();
  const { isPremium } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const [search, setSearch]         = useState("");
  const [activeChip, setActiveChip] = useState<string>("All");
  const [activeLevel, setActiveLevel] = useState<LevelFilter>("All");
  const [showRisky, setShowRisky]   = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [warnLevel, setWarnLevel]   = useState<string | null>(null); // level name that needs confirmation
  const [lockShaking, setLockShaking] = useState(false);
  // Runtime-detected unsupported reasons from backend (e.g. USB power setting not found).
  // These override/supplement the static frontend registry reasons.
  const [runtimeUnsupportedReasons, setRuntimeUnsupportedReasons] = useState<Record<string, string>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const seenWarnings = useRef<Set<string>>(new Set());

  const handleApplyRecommended = () => {
    if (!isPremium) {
      // Shake the lock badge then open the upgrade modal
      setLockShaking(true);
      setTimeout(() => setLockShaking(false), 600);
      openUpgradeModal('Apply Recommended');
      return;
    }
    startOptimizationFlow();
  };

  // Read ?tweak=<id> deep-link param on mount and scroll to that card.
  // The Electron app uses a hash-based router, so the param may live inside
  // window.location.hash (e.g. "#/tweaks?tweak=timer-res") rather than in
  // window.location.search — check both.
  useEffect(() => {
    const hashStr  = window.location.hash;            // "#/tweaks?tweak=timer-res"
    const qIdx     = hashStr.indexOf("?");
    const searchStr = qIdx >= 0 ? hashStr.slice(qIdx + 1) : window.location.search;
    const params   = new URLSearchParams(searchStr);
    const tweakId  = params.get("tweak");
    if (!tweakId) return;
    const target = TWEAKS_DATA.find((t) => t.id === tweakId);
    if (!target) return;
    // Clear the URL param so a refresh shows the full list
    if (qIdx >= 0) {
      // Hash-router: strip ?... from the hash, preserve the path fragment
      const newHash = hashStr.slice(0, qIdx);
      window.history.replaceState({}, "", window.location.pathname + window.location.search + newHash);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("tweak");
      window.history.replaceState({}, "", url.toString());
    }
    // Pre-fill search so the tweak is visible, reset filters
    setSearch(target.title);
    setActiveChip("All");
    setActiveLevel("All");
    setHighlightId(tweakId);
    // Scroll to the card after it renders
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`tweak-card-${tweakId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(scrollTimer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // On load: verify all real tweak states against the system.
  // toast is intentionally excluded from deps — it is used only in the catch
  // path and its identity changes every render (shadcn useToast). Including it
  // would re-trigger a full 65-PowerShell sync on every render cycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isElectron) return;
    // Claim this generation — any older in-flight sync will see a mismatch and
    // discard its results rather than overwriting what this mount resolves to.
    const myGen = ++_syncGeneration;
    setSyncing(true);
    setSyncFailed(false);
    console.log(`[Tweaks:SYNC] hydration start gen=${myGen}`);
    syncAllTweaks()
      .then((results) => {
        if (myGen !== _syncGeneration) {
          console.log(`[Tweaks:SYNC] stale result discarded gen=${myGen} current=${_syncGeneration}`);
          return;
        }
        if (!results || Object.keys(results).length === 0) {
          console.log('[Tweaks:SYNC] skipped (no results from syncAll)');
          return;
        }
        let reconciled = 0;
        const runtimeReasons: Record<string, string> = {};
        Object.entries(results).forEach(([tweakId, status]) => {
          const s = status as { isApplied: boolean; applied: boolean; unsupported?: boolean; unsupportedReason?: string; error: string | null };
          if (s.unsupported) {
            // Runtime unsupported — backend confirmed this tweak cannot run on this system.
            // Log prominently so it appears in logs even if the UI still shows the card.
            const reason = s.unsupportedReason ?? 'Backend confirmed this tweak is not available on this system.';
            console.info(`[TweakSupport] id=${tweakId}, supported=false, reason="${reason}" (runtime check)`);
            runtimeReasons[tweakId] = reason;
            return;
          }
          if (!s.error && isRealTweak(tweakId)) {
            const finalState = s.isApplied ?? s.applied ?? false;
            setTweak(tweakId, finalState);
            reconciled++;
          }
        });
        if (Object.keys(runtimeReasons).length > 0) {
          setRuntimeUnsupportedReasons(prev => ({ ...prev, ...runtimeReasons }));
        }
        console.log(`[Tweaks:SYNC] hydration done gen=${myGen} reconciled=${reconciled}`);
      })
      .catch((err) => {
        if (myGen !== _syncGeneration) return; // stale — don't surface error
        console.error('[TweaksList] Failed to sync:', err);
        setSyncFailed(true);
        toast({
          title: 'Sync Failed',
          description: 'Could not read tweak states from system. Using cached values.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (myGen === _syncGeneration) setSyncing(false);
      });
  }, [isElectron, syncAllTweaks, setTweak]); // toast excluded — see comment above

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
    const items = TWEAKS_DATA.filter((t) => {
      if (t.isAdvancedTuning) return false; // rendered in its own "Advanced Tuning" section below
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
    // Sort: toggle tweaks first, then slider tweaks at the bottom
    return items.sort((a, b) => {
      const aSlider = a.controlType === "slider" ? 1 : 0;
      const bSlider = b.controlType === "slider" ? 1 : 0;
      return aSlider - bSlider;
    });
  }, [search, activeChip, showRisky, activeLevel]);

  const toggleTweaks = useMemo(() => filteredTweaks.filter(t => t.controlType !== "slider"), [filteredTweaks]);
  const sliderTweaks = useMemo(() => filteredTweaks.filter(t => t.controlType === "slider"), [filteredTweaks]);

  // ── Advanced Tuning section — always rendered regardless of category chip,
  // but still respects search / level / risk filters so it doesn't clutter
  // an unrelated search or a "Recommended"-only view.
  const advancedTuningTweaks = useMemo(() => {
    return TWEAKS_DATA.filter((t) => {
      if (!t.isAdvancedTuning) return false;
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                            t.description.toLowerCase().includes(search.toLowerCase());
      const matchesRisk  = showRisky ? true : t.risk !== "Risky";
      const matchesLevel = activeLevel === "All" || t.level === activeLevel;
      return matchesSearch && matchesRisk && matchesLevel;
    });
  }, [search, showRisky, activeLevel]);

  const advancedSliderTweaks = useMemo(() => advancedTuningTweaks.filter(t => t.controlType === "slider"), [advancedTuningTweaks]);
  const advancedPresetTweaks = useMemo(() => advancedTuningTweaks.filter(t => t.controlType === "preset"), [advancedTuningTweaks]);

  // Conflict detection: ids of toggle tweaks currently enabled, plus preset tweaks
  // currently applied at a non-default option. Passed to preset cards so they can
  // warn when a preset option conflicts with another currently-active tweak.
  const presetOptions = useStore((s) => s.presetOptions);
  const activeConflictIds = useMemo(() => {
    const enabledToggleIds = Object.entries(tweaks).filter(([, v]) => v).map(([k]) => k);
    const nonDefaultPresetIds = Object.entries(presetOptions)
      .filter(([id, optionId]) => {
        const t = TWEAKS_DATA.find(x => x.id === id);
        return t?.presetConfig && optionId !== t.presetConfig.defaultOptionId;
      })
      .map(([id]) => id);
    return [...enabledToggleIds, ...nonDefaultPresetIds];
  }, [tweaks, presetOptions]);

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
            placeholder="Search tweaks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-tweaks"
            className="pl-9 bg-[#1A1F26] border-[#2A313A] focus:border-primary/50 transition-all rounded-xl h-10"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Apply Recommended — premium-gated */}
          <div className="relative">
            <Button
              onClick={handleApplyRecommended}
              size="sm"
              data-testid="button-apply-safe"
              className="h-9 px-4 gap-2 bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20"
            >
              <Sparkles className="size-4" />
              Apply Recommended
            </Button>

            {/* Lock badge — only visible to non-premium users */}
            {!isPremium && (
              <motion.div
                className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full cursor-pointer z-10"
                style={{
                  background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                  boxShadow: "0 0 8px rgba(245,158,11,0.55), 0 2px 4px rgba(0,0,0,0.4)",
                  rotate: "15deg",
                }}
                animate={lockShaking ? {
                  rotate: ["15deg", "-20deg", "25deg", "-18deg", "15deg"],
                  scale:  [1, 1.25, 1.15, 1.2, 1],
                } : { rotate: "15deg", scale: 1 }}
                transition={lockShaking ? {
                  duration: 0.5,
                  ease: "easeInOut",
                } : { duration: 0.3 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLockShaking(true);
                  setTimeout(() => setLockShaking(false), 600);
                  openUpgradeModal('Apply Recommended');
                }}
                title="Premium feature"
              >
                <Lock className="size-2.5 text-white" strokeWidth={2.5} />
              </motion.div>
            )}
          </div>
          <Button
            variant="outline" size="sm"
            onClick={resetData}
            data-testid="button-reset-tweaks"
            className="h-9 gap-2 border-[#2A313A] hover:bg-[#2A313A]"
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
                : "hover:bg-[#2A313A]"
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
                  : "bg-[#1A1F26] text-[#6B7380] border-[#2A313A] hover:text-[#A0A8B3] hover:border-[#2A313A]"
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
                    ? "bg-primary text-[#E6EAF0] border-primary shadow-[0_0_15px_rgba(0,212,255,0.3)]"
                    : "bg-[#1A1F26] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A]"
                )}
              >
                {chip}
              </button>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Level warning dialog — rendered via portal so fixed positioning
          covers the full Electron window regardless of ancestor transforms */}
      {createPortal(
        <AnimatePresence>
          {warnLevel && LEVEL_WARN[warnLevel] && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                style={{ zIndex: 9998 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setWarnLevel(null)}
              />
              <motion.div
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm pointer-events-auto px-4"
                style={{ zIndex: 9999 }}
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
                      <h3 className="font-semibold text-[#E6EAF0] text-base">{LEVEL_WARN[warnLevel].title}</h3>
                      <p className="text-sm text-[#A0A8B3] mt-1 leading-relaxed">{LEVEL_WARN[warnLevel].body}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setWarnLevel(null)}
                      data-testid="button-level-warn-cancel"
                      className="px-4 py-2 rounded-lg text-sm text-[#6B7380] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-colors"
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
        </AnimatePresence>,
        document.body
      )}

      {/* Sync status indicator */}
      <AnimatePresence>
        {isElectron && (syncing || syncFailed) && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {syncFailed ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/8 border border-orange-500/15 text-xs text-orange-400/80">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>Could not read system state — using cached values.</span>
              </div>
            ) : (
              <div className="relative rounded-lg border border-[#1E2530] bg-[#0D1117]/40 px-3 py-2 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 w-[40%] bg-gradient-to-r from-transparent via-cyan-400/[0.05] to-transparent pointer-events-none"
                  animate={{ x: ['-100%', '300%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                />
                <div className="relative flex items-center gap-2.5 text-xs">
                  <span className="size-1.5 rounded-full bg-cyan-400/80 animate-pulse shrink-0" />
                  <span className="text-[#6B7380]">Verifying tweak states from system…</span>
                  <div className="ml-auto overflow-hidden rounded-full h-0.5 w-16 bg-[#1E2530]">
                    <motion.div
                      className="h-full rounded-full bg-cyan-400/50"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tweaks Grid — toggles first, then a divider, then sliders below */}
      <div className="space-y-4 pb-12">
        {/* Toggle tweaks */}
        {toggleTweaks.length > 0 && (
          toggleTweaks.length > VIRTUALIZE_THRESHOLD ? (
            <VirtualizedTweakGrid
              items={toggleTweaks}
              renderItem={(tweak) => (
                <TweakCard
                  tweak={tweak}
                  isEnabled={getTweakEnabled(tweak.id)}
                  onToggle={() => toggleTweak(tweak.id)}
                  isVerifying={
                    syncing &&
                    isElectron &&
                    isRealTweak(tweak.id) &&
                    !getTweakEnabled(tweak.id) &&
                    tweak.id !== highlightId
                  }
                  isHighlighted={tweak.id === highlightId}
                  runtimeUnsupportedReason={runtimeUnsupportedReasons[tweak.id]}
                />
              )}
            />
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <AnimatePresence mode="popLayout">
              {toggleTweaks.map((tweak, index) => (
                <motion.div
                  key={tweak.id}
                  id={`tweak-card-${tweak.id}`}
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
                    isVerifying={
                      syncing &&
                      isElectron &&
                      isRealTweak(tweak.id) &&
                      !getTweakEnabled(tweak.id) &&
                      tweak.id !== highlightId
                    }
                    isHighlighted={tweak.id === highlightId}
                    runtimeUnsupportedReason={runtimeUnsupportedReasons[tweak.id]}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          )
        )}

        {/* Divider between toggles and sliders */}
        {toggleTweaks.length > 0 && sliderTweaks.length > 0 && (
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] font-semibold tracking-wider text-[#6B7380] uppercase">
              Slider Tweaks
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
        )}

        {/* Slider tweaks */}
        {sliderTweaks.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <AnimatePresence mode="popLayout">
              {sliderTweaks.map((tweak, index) => (
                <motion.div
                  key={tweak.id}
                  id={`tweak-card-${tweak.id}`}
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
                  <TweakSliderCard tweak={tweak} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Advanced Tuning section — always visible regardless of category chip.
            Combines the 3 isAdvancedTuning-flagged sliders with the 3 preset-card
            profiles into one dedicated bottom section. */}
        {advancedTuningTweaks.length > 0 && (
          <>
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[10px] font-semibold tracking-wider text-[#6B7380] uppercase">
                Advanced Tuning
              </span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <AnimatePresence mode="popLayout">
                {advancedSliderTweaks.map((tweak, index) => (
                  <motion.div
                    key={tweak.id}
                    id={`tweak-card-${tweak.id}`}
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
                    <TweakSliderCard tweak={tweak} />
                  </motion.div>
                ))}
                {advancedPresetTweaks.map((tweak, index) => (
                  <motion.div
                    key={tweak.id}
                    id={`tweak-card-${tweak.id}`}
                    className="self-start"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    transition={{
                      duration: 0.25,
                      delay: Math.min(advancedSliderTweaks.length + index, 8) * 0.03,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{ willChange: "opacity, transform" }}
                  >
                    <TweakPresetCard tweak={tweak} activeConflictIds={activeConflictIds} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}

        {filteredTweaks.length === 0 && advancedTuningTweaks.length === 0 && (
          <motion.div
            className="text-center py-20 text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            No tweaks found matching your search.
          </motion.div>
        )}
      </div>

      {/* Optimization flow modal — isolated store, never causes TweaksList re-renders */}
      <OptimizationFlow />
    </div>
  );
}
