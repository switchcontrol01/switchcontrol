import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { 
  Zap, 
  Battery, 
  Wifi, 
  Rocket, 
  Moon, 
  Trash2, 
  ShieldCheck, 
  List, 
  Settings,
  X,
  ArrowRight
} from "lucide-react";

const MODULES = [
  {
    id: "tweaks",
    name: "Tweaks",
    icon: Zap,
    description: "38+ system optimizations",
    details: "Registry and system tweaks to reduce latency and improve responsiveness. Each tweak is categorized by impact and risk level.",
    color: "from-primary/20 to-primary/10",
    preview: ["Disable Game DVR", "Optimize MMCSS", "Reduce USB Polling"]
  },
  {
    id: "power",
    name: "Power Plan",
    icon: Battery,
    description: "Custom power profiles",
    details: "Create and apply gaming-optimized power plans that prioritize performance over power saving.",
    color: "from-orange-500/20 to-orange-600/10",
    preview: ["Maximum Performance", "Balanced Gaming", "Efficiency Mode"]
  },
  {
    id: "network",
    name: "Network Tweaks",
    icon: Wifi,
    description: "TCP/IP, DNS, UDP optimization",
    details: "Network stack optimizations to minimize ping and reduce packet loss. Includes DNS and routing tweaks.",
    color: "from-cyan-500/20 to-cyan-600/10",
    preview: ["Nagle Algorithm", "TCP ACK Frequency", "DNS Cache"]
  },
  {
    id: "booster",
    name: "App Booster",
    icon: Rocket,
    description: "Per-app performance profiles",
    details: "Create custom optimization profiles for specific games and applications.",
    color: "from-pink-500/20 to-pink-600/10",
    preview: ["Fortnite Profile", "Valorant Profile", "Custom Profiles"]
  },
  {
    id: "focus",
    name: "Focus Mode",
    icon: Moon,
    description: "Zero distractions gaming",
    details: "Block notifications, overlays, and background apps while gaming for maximum focus.",
    color: "from-indigo-500/20 to-indigo-600/10",
    preview: ["Block Notifications", "Disable Overlays", "Pause Updates"]
  },
  {
    id: "cleaner",
    name: "Cleaner",
    icon: Trash2,
    description: "Impact-based system cleaning",
    details: "Smart cleaning that targets performance waste, not just disk space. See CPU and RAM impact before cleaning.",
    color: "from-emerald-500/20 to-emerald-600/10",
    preview: ["Temp Files", "Shader Cache", "Update Cleanup"]
  },
  {
    id: "debloat",
    name: "Debloat",
    icon: ShieldCheck,
    description: "Role-based Windows debloating",
    details: "Remove unnecessary Windows components based on your PC's role. All changes are reversible.",
    color: "from-red-500/20 to-red-600/10",
    preview: ["Remove Bloatware", "Disable Telemetry", "Safe Restore"]
  },
  {
    id: "startup",
    name: "Startup",
    icon: List,
    description: "Delayed startup engine",
    details: "Control startup apps with smart delays. Faster boot without disabling apps you need.",
    color: "from-yellow-500/20 to-yellow-600/10",
    preview: ["Boot Timeline", "Delay Apps", "Quick Presets"]
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings,
    description: "Customize everything",
    details: "Configure app behavior, themes, notifications, and sync preferences across devices.",
    color: "from-zinc-500/20 to-zinc-600/10",
    preview: ["Themes", "Auto Updates", "Backup Config"]
  }
];

export function ModuleShowcase() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const { prefersReducedMotion } = useMotion();
  
  const activeModule = MODULES.find(m => m.id === selectedModule);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
        {MODULES.map((module, index) => {
          const Icon = module.icon;
          const isActive = selectedModule === module.id;
          
          return (
            <motion.div
              key={module.id}
              initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: prefersReducedMotion ? 0.15 : 0.3 }}
              viewport={{ once: true }}
            >
              <button
                onClick={() => setSelectedModule(isActive ? null : module.id)}
                className={cn(
                  "w-full p-3 rounded-xl border transition-all duration-300 text-center group",
                  isActive 
                    ? `bg-gradient-to-br ${module.color} border-primary/50 shadow-lg shadow-primary/20`
                    : "bg-white/5 border-white/10 hover:border-primary/30 hover:bg-white/[0.07]"
                )}
                data-testid={`module-${module.id}`}
              >
                <Icon className={cn(
                  "size-6 mx-auto mb-2 transition-all duration-300",
                  isActive ? "text-primary scale-110" : "text-muted-foreground group-hover:text-primary"
                )} />
                <p className={cn(
                  "text-xs font-medium transition-colors",
                  isActive ? "text-white" : "text-muted-foreground group-hover:text-white"
                )}>
                  {module.name}
                </p>
              </button>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeModule && (
          <motion.div
            key={activeModule.id}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: prefersReducedMotion ? -5 : -10, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.3 }}
          >
            <Card className={cn("bg-gradient-to-br border-white/10 overflow-hidden", activeModule.color)}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-white/10">
                      <activeModule.icon className="size-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{activeModule.name}</h3>
                      <p className="text-sm text-white/70">{activeModule.description}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedModule(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    aria-label="Close module details"
                    data-testid="button-close-module"
                  >
                    <X className="size-4 text-white/50 hover:text-white" />
                  </button>
                </div>
                
                <p className="text-white/80 mb-4 leading-relaxed">{activeModule.details}</p>
                
                <div className="flex flex-wrap gap-2">
                  {activeModule.preview.map((item, i) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, scale: prefersReducedMotion ? 0.95 : 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * (prefersReducedMotion ? 0.05 : 0.1) }}
                    >
                      <Badge variant="outline" className="bg-white/10 border-white/20 text-white/90">
                        {item}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
                
                <motion.div
                  className="mt-4 pt-4 border-t border-white/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: prefersReducedMotion ? 0.15 : 0.3 }}
                >
                  <p className="text-xs text-white/50 flex items-center gap-1">
                    <ArrowRight className="size-3" />
                    Available in the dashboard
                  </p>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!selectedModule && (
        <p className="text-center text-sm text-muted-foreground">
          Click any module to see details
        </p>
      )}
    </div>
  );
}
