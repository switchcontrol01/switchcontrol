import { useState, useMemo } from "react";
import { TweakCard } from "./TweakCard";
import { TWEAKS_DATA, TweakCategory } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CATEGORIES: TweakCategory[] = [
  "System and Power",
  "Memory and Storage",
  "Privacy and Telemetry",
  "Gaming and Latency",
  "GPU and Graphics",
  "Network",
  "Debloat and Apps",
  "Windows UX"
];

export function TweaksList() {
  const { tweaks, toggleTweak, resetData, enableRecommended } = useStore();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [showRisky, setShowRisky] = useState(false);

  const filteredTweaks = useMemo(() => {
    return TWEAKS_DATA.filter((t) => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                          t.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      const matchesRisk = showRisky ? true : t.risk !== "Risky";
      
      return matchesSearch && matchesCategory && matchesRisk;
    });
  }, [search, activeCategory, showRisky]);

  // Group by category for the list view
  const groupedTweaks = useMemo(() => {
    const groups: Record<string, typeof TWEAKS_DATA> = {};
    filteredTweaks.forEach(t => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });
    return groups;
  }, [filteredTweaks]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input 
              placeholder="Search tweaks..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card/50 border-border/50 focus:bg-card transition-all"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="size-4" />
                Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem checked={showRisky} onCheckedChange={setShowRisky}>
                Show Risky Tweaks
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={resetData} title="Reset All">
            <RotateCcw className="size-4" />
          </Button>
        </div>

        {/* Category Chips */}
        <ScrollArea className="w-full whitespace-nowrap pb-2">
          <div className="flex gap-2">
            <Button
              variant={activeCategory === "All" ? "default" : "secondary"}
              size="sm"
              onClick={() => setActiveCategory("All")}
              className="rounded-full text-xs h-7"
            >
              All
            </Button>
            {CATEGORIES.map(cat => (
              <Button
                key={cat}
                variant={activeCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full text-xs h-7 border-border/50 bg-transparent",
                  activeCategory === cat ? "bg-primary border-primary" : "hover:bg-accent/50"
                )}
              >
                {cat}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Recommended Action */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-sm text-primary-foreground">Quick Optimize</h3>
          <p className="text-xs text-muted-foreground">Enable all safe recommended settings.</p>
        </div>
        <Button onClick={enableRecommended} size="sm" className="gap-2 bg-primary text-white hover:bg-primary/90">
          <CheckCircle2 className="size-4" />
          Apply Recommended
        </Button>
      </div>

      {/* List */}
      <div className="space-y-8 pb-12">
        {Object.entries(groupedTweaks).map(([category, items]) => (
          <div key={category} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">
              {category}
            </h2>
            <div className="grid gap-3">
              {items.map(tweak => (
                <TweakCard
                  key={tweak.id}
                  tweak={tweak}
                  isEnabled={!!tweaks[tweak.id]}
                  onToggle={() => toggleTweak(tweak.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredTweaks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No tweaks found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
