import { useState, useMemo, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { 
  Search, 
  Info, 
  X, 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle,
  ShieldCheck,
  Lock,
  Crown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  NETWORK_TWEAKS, 
  NETWORK_CATEGORIES, 
  NetworkTweak, 
  NetworkCategory,
  SafetyLevel,
  TweakLevel,
  ImpactLevel
} from "@/lib/network-tweaks-data";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion } from "@/lib/motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { PremiumSurface } from "@/components/ui/premium-surface";
import { AnimatedCrown, PremiumBadge } from "@/components/ui/animated-crown";
import { PremiumPageOverlay, PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";

const SafetyBadge = ({ level }: { level: SafetyLevel }) => {
  const colors = {
    Safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Risky: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level}
    </span>
  );
};

const LevelBadge = ({ level }: { level: TweakLevel }) => {
  const colors = {
    Recommended: "bg-primary/10 text-primary border-primary/20",
    Advanced: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Experimental: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};

const ImpactPill = ({ label, value }: { label: string; value: ImpactLevel }) => {
  if (value === "None") return null;
  
  const colors = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    High: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  
  return (
    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", colors[value])}>
      {label}: {value}
    </span>
  );
};

interface NetworkTweakCardProps {
  tweak: NetworkTweak;
  isEnabled: boolean;
  onToggle: () => void;
  onInfoClick: () => void;
}

function NetworkTweakCard({ tweak, isEnabled, onToggle, onInfoClick }: NetworkTweakCardProps) {
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      whileHover={{ scale: prefersReducedMotion ? 1.005 : 1.01, y: prefersReducedMotion ? -1 : -2 }}
      transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
    >
      <GlassCard 
        className={cn(
          "group flex items-start justify-between p-4 transition-all duration-300",
          isEnabled 
            ? "border-primary/30 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]" 
            : "hover:bg-white/5"
        )}
        hoverEffect={false}
      >
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn(
              "font-medium text-sm transition-colors",
              isEnabled ? "text-primary-foreground" : "text-foreground group-hover:text-white"
            )}>
              {tweak.name}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{tweak.summary}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <LevelBadge level={tweak.level} />
            <SafetyBadge level={tweak.safety} />
          </div>
          {tweak.warning && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium mt-1">
              <AlertTriangle className="size-3" />
              {tweak.warning}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pl-4 shrink-0">
          <motion.div
            whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
            whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
          >
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onInfoClick}
              data-testid={`button-info-${tweak.id}`}
              className="size-8 text-muted-foreground hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
            >
              <Info className="size-4" />
            </Button>
          </motion.div>

          <Switch 
            checked={isEnabled} 
            onCheckedChange={onToggle} 
            data-testid={`switch-tweak-${tweak.id}`}
            className="data-[state=checked]:bg-primary shadow-lg"
          />
        </div>
      </GlassCard>
    </motion.div>
  );
}

interface InfoPanelProps {
  tweak: NetworkTweak | null;
  onClose: () => void;
}

function InfoPanel({ tweak, onClose }: InfoPanelProps) {
  const { prefersReducedMotion } = useMotion();

  useEffect(() => {
    if (!tweak) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tweak, onClose]);

  const expectedEntries: [string, ImpactLevel | undefined][] = tweak ? [
    ["Network", tweak.expected.network],
    ["Latency", tweak.expected.latency],
    ["Risk", tweak.expected.stabilityRisk],
  ] : [];
  
  const activeExpected = expectedEntries.filter(([, v]) => v && v !== "None");

  return (
    <AnimatePresence>
      {tweak && (
        <>
          <motion.div 
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            data-testid="modal-backdrop"
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />
          <motion.div 
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg"
            role="dialog"
            aria-modal="true"
            data-testid={`modal-tweak-${tweak.id}`}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="relative bg-black/90 border border-white/10 rounded-lg p-6 shadow-2xl backdrop-blur-xl max-h-[80vh] overflow-y-auto">
              <motion.button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                data-testid="button-close-modal"
                whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
                whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
              >
                <X className="h-5 w-5 text-white" />
                <span className="sr-only">Close</span>
              </motion.button>
              
              <div className="space-y-1.5 pr-8">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  {tweak.name}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{tweak.category}</span>
                  <LevelBadge level={tweak.level} />
                  <SafetyBadge level={tweak.safety} />
                </div>
              </div>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white">Description</h4>
                  <p className="text-sm text-muted-foreground">{tweak.description}</p>
                </div>
                
                {activeExpected.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">Expected Change</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {activeExpected.map(([label, value]) => (
                        <ImpactPill key={label} label={label} value={value!} />
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white">Impact</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                    {tweak.impact.map((item, index) => (
                      <li key={index} className={item.toLowerCase().includes("risk") || item.toLowerCase().includes("break") ? "text-yellow-400" : undefined}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {tweak.warning && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <AlertTriangle className="size-4 shrink-0" />
                    {tweak.warning}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function NetworkTweaks() {
  console.log("MOUNT NetworkTweaks");
  const { isPremium } = useAuth();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<NetworkCategory | "All">("All");
  const [enabledTweaks, setEnabledTweaks] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("networkTweaksEnabled");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<NetworkCategory>>(
    new Set(NETWORK_CATEGORIES)
  );
  const [selectedTweak, setSelectedTweak] = useState<NetworkTweak | null>(null);

  const toggleTweak = useCallback((id: string) => {
    setEnabledTweaks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem("networkTweaksEnabled", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category: NetworkCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const filteredTweaks = useMemo(() => {
    return NETWORK_TWEAKS.filter(tweak => {
      const matchesSearch = search === "" || 
        tweak.name.toLowerCase().includes(search.toLowerCase()) ||
        tweak.summary.toLowerCase().includes(search.toLowerCase()) ||
        tweak.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "All" || tweak.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const tweaksByCategory = useMemo(() => {
    const grouped: Record<NetworkCategory, NetworkTweak[]> = {
      "SMB": [],
      "TCP/IP": [],
      "UDP": [],
      "Security": [],
      "DNS": [],
    };
    filteredTweaks.forEach(tweak => {
      grouped[tweak.category].push(tweak);
    });
    return grouped;
  }, [filteredTweaks]);

  const closePanel = useCallback(() => {
    setSelectedTweak(null);
  }, []);

  return (
    <AppLayout>
      <div className={cn("p-8 space-y-8", !isPremium && "opacity-60 blur-[2px]")}>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Network Tweaks
            </h1>
            <PremiumHeaderBadge isLocked={!isPremium} />
          </div>
          <p className="text-muted-foreground">
            Optimize latency, throughput, and stability. Apply carefully.
          </p>
        </div>

        <GlassCard className="p-4 border-[hsl(270,60%,55%,0.2)] bg-[hsl(270,60%,55%,0.05)]">
          <div className="flex gap-3">
            <Info className="size-5 text-[hsl(270,60%,55%)] shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-white">Setting Expectations</h3>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li>Users with baseline ping of ~40ms or lower may not observe further ping reduction. Instead, improvements typically manifest as reduced jitter, better packet consistency, and smoother network behavior under load.</li>
                <li>Network tweaks optimize your local network stack—they cannot overcome physical distance to game servers, ISP routing inefficiencies, or upstream congestion.</li>
                <li>Results vary based on hardware, driver quality, and network conditions. Monitor your experience over multiple sessions before evaluating effectiveness.</li>
              </ul>
            </div>
          </div>
        </GlassCard>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search network tweaks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-black/40 border-white/10"
              data-testid="input-search-network"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeCategory === "All" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory("All")}
              className={cn(
                "text-xs",
                activeCategory === "All" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-black/40 border-white/10 hover:bg-white/10"
              )}
              data-testid="filter-all"
            >
              All
            </Button>
            {NETWORK_CATEGORIES.map(category => (
              <Button
                key={category}
                variant={activeCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "text-xs",
                  activeCategory === category 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-black/40 border-white/10 hover:bg-white/10"
                )}
                data-testid={`filter-${category.toLowerCase().replace("/", "-")}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {NETWORK_CATEGORIES.map(category => {
            const categoryTweaks = tweaksByCategory[category];
            if (categoryTweaks.length === 0) return null;

            return (
              <Collapsible
                key={category}
                open={expandedCategories.has(category)}
                onOpenChange={() => toggleCategory(category)}
              >
                <CollapsibleTrigger asChild>
                  <button 
                    className="flex items-center gap-2 w-full text-left group cursor-pointer"
                    data-testid={`category-${category.toLowerCase().replace("/", "-")}`}
                  >
                    {expandedCategories.has(category) ? (
                      <ChevronDown className="size-5 text-muted-foreground group-hover:text-white transition-colors" />
                    ) : (
                      <ChevronRight className="size-5 text-muted-foreground group-hover:text-white transition-colors" />
                    )}
                    <h2 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                      {category}
                    </h2>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({categoryTweaks.length} tweaks)
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    {categoryTweaks.map(tweak => (
                      <NetworkTweakCard
                        key={tweak.id}
                        tweak={tweak}
                        isEnabled={enabledTweaks.has(tweak.id)}
                        onToggle={() => toggleTweak(tweak.id)}
                        onInfoClick={() => setSelectedTweak(tweak)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {filteredTweaks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No tweaks found matching your search.
          </div>
        )}
      </div>

      <InfoPanel tweak={selectedTweak} onClose={closePanel} />
      
      {!isPremium && (
        <PremiumPageOverlay 
          featureName="Network Tweaks is a Premium Feature" 
          buttonText="Unlock Network Tweaks"
          description="Advanced latency, TCP/IP, and throughput optimizations are available with SwitchControl Premium."
        />
      )}
    </AppLayout>
  );
}
