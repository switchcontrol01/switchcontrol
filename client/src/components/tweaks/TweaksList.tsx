import { useState, useMemo, useEffect } from "react";
import { TweakCard } from "./TweakCard";
import { TWEAKS_DATA, TweakCategory } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, RotateCcw, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTweakExecutor, isElectronWithTweaks, isTierATweak } from "@/hooks/use-tweak-executor";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "Performance", 
  "Latency", 
  "Visuals", 
  "Services", 
  "Aesthetics"
];

// Map our actual categories to these UI filter chips for the VTRL style
const CATEGORY_MAP: Record<string, TweakCategory[]> = {
  "Performance": ["System and Power", "Memory and Storage", "GPU and Graphics"],
  "Latency": ["Gaming and Latency", "Network"],
  "Visuals": ["GPU and Graphics", "Windows UX"],
  "Services": ["Debloat and Apps", "System and Power"],
  "Aesthetics": ["Windows UX"]
};

export function TweaksList() {
  const { tweaks, toggleTweak, resetData, enableRecommended, setTweak } = useStore();
  const { syncAllTweaks, localState, isElectron } = useTweakExecutor();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState<string>("All");
  const [showRisky, setShowRisky] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    if (isElectron) {
      setSyncing(true);
      setSyncFailed(false);
      syncAllTweaks()
        .then((results) => {
          if (results && Object.keys(results).length > 0) {
            Object.entries(results).forEach(([tweakId, status]) => {
              const s = status as { applied: boolean; error: string | null };
              if (!s.error && isTierATweak(tweakId)) {
                setTweak(tweakId, s.applied);
              }
            });
          }
        })
        .catch((err) => {
          console.error('[TweaksList] Failed to sync tweaks:', err);
          setSyncFailed(true);
          toast({
            title: 'Sync Failed',
            description: 'Could not sync tweak states from system. Using cached values.',
            variant: 'destructive',
          });
        })
        .finally(() => {
          setSyncing(false);
        });
    }
  }, [isElectron, syncAllTweaks, setTweak, toast]);

  const getTweakEnabled = (tweakId: string): boolean => {
    const storeValue = tweaks[tweakId] ?? false;
    if (isElectron && isTierATweak(tweakId)) {
      if (syncFailed) {
        return storeValue;
      }
      const hasLocalState = tweakId in localState.appliedTweaks;
      return hasLocalState ? localState.appliedTweaks[tweakId] : storeValue;
    }
    return storeValue;
  };

  const filteredTweaks = useMemo(() => {
    return TWEAKS_DATA.filter((t) => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                          t.description.toLowerCase().includes(search.toLowerCase());
      
      const matchesChip = activeChip === "All" || (CATEGORY_MAP[activeChip]?.includes(t.category));
      const matchesRisk = showRisky ? true : t.risk !== "Risky";
      
      return matchesSearch && matchesChip && matchesRisk;
    });
  }, [search, activeChip, showRisky]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Top Bar - Redesigned */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          <Button variant="outline" size="sm" onClick={resetData} data-testid="button-reset-tweaks" className="h-9 gap-2 border-white/5 hover:bg-white/5">
            <RotateCcw className="size-4" />
            Reset
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="button-filter-settings" className="h-9 w-9 p-0">
                <SlidersHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-black/90 backdrop-blur-xl border-white/10">
              <DropdownMenuCheckboxItem checked={showRisky} onCheckedChange={setShowRisky} data-testid="checkbox-show-risky">
                Show Risky
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filter Chips - Redesigned */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          <button
            onClick={() => setActiveChip("All")}
            data-testid="filter-chip-all"
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border",
              activeChip === "All" 
                ? "bg-primary text-white border-primary shadow-[0_0_15px_rgba(168,85,247,0.3)]" 
                : "bg-white/5 text-muted-foreground border-white/5 hover:border-white/10"
            )}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveChip(cat)}
              data-testid={`filter-chip-${cat.toLowerCase().replace(/\s+/g, '-')}`}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border",
                activeChip === cat 
                  ? "bg-primary text-white border-primary shadow-[0_0_15px_rgba(168,85,247,0.3)]" 
                  : "bg-white/5 text-muted-foreground border-white/5 hover:border-white/10"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Tweaks Grid - Redesigned to 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-12">
        {filteredTweaks.map(tweak => (
          <TweakCard
            key={tweak.id}
            tweak={tweak}
            isEnabled={getTweakEnabled(tweak.id)}
            onToggle={() => toggleTweak(tweak.id)}
          />
        ))}

        {filteredTweaks.length === 0 && (
          <div className="col-span-full text-center py-20 text-muted-foreground">
            No tweaks found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
