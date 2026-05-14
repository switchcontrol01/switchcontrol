import { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface GravityItem {
  id: string;
  label: string;
  category?: string;
}

interface Props {
  items: GravityItem[];
  trigger: boolean;
  onComplete?: () => void;
  className?: string;
}

const MAX_VISIBLE = 30;

export function FileGravityCore({ items, trigger, onComplete, className }: Props) {
  const [phase, setPhase] = useState<"idle" | "collapsing" | "pulse" | "clear">("idle");

  const visibleItems = useMemo(() => {
    if (items.length <= MAX_VISIBLE) return items;
    // Aggregate by category
    const byCat = new Map<string, GravityItem[]>();
    items.forEach((i) => {
      const cat = i.category ?? "Other";
      byCat.set(cat, [...(byCat.get(cat) ?? []), i]);
    });
    return Array.from(byCat.entries()).map(([cat, group]) => ({
      id: `cat-${cat}`,
      label: `${cat} (${group.length})`,
      category: cat,
    }));
  }, [items]);

  useEffect(() => {
    if (!trigger || phase !== "idle") return;
    setPhase("collapsing");
    const t1 = setTimeout(() => setPhase("pulse"), 600);
    const t2 = setTimeout(() => setPhase("clear"), 900);
    const t3 = setTimeout(() => {
      setPhase("idle");
      onComplete?.();
    }, 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [trigger, phase, onComplete]);

  if (phase === "idle" && !trigger) return null;

  return (
    <div className={cn("relative w-full h-48 overflow-hidden rounded-xl", className)}>
      <AnimatePresence>
        {phase !== "clear" && phase !== "idle" && (
          <>
            {/* Floating items */}
            {visibleItems.map((item, i) => {
              const cols = Math.min(5, Math.ceil(Math.sqrt(visibleItems.length)));
              const row = Math.floor(i / cols);
              const col = i % cols;
              const xBase = (col / Math.max(1, cols - 1)) * 100;
              const yBase = (row / Math.max(1, Math.ceil(visibleItems.length / cols) - 1)) * 100;

              return (
                <motion.div
                  key={item.id}
                  className="absolute px-2 py-1 rounded-md text-[10px] font-medium border border-[#2A313A] bg-[#21262D] text-[#E6EAF0] whitespace-nowrap"
                  style={{ left: `${xBase}%`, top: `${yBase}%`, transform: "translate(-50%, -50%)" }}
                  initial={{ opacity: 0, scale: 0.8, x: 0, y: 0 }}
                  animate={
                    phase === "collapsing"
                      ? {
                          opacity: 0,
                          scale: 0.3,
                          x: 50 - xBase,
                          y: 50 - yBase,
                        }
                      : phase === "pulse"
                        ? { opacity: 0, scale: 0 }
                        : { opacity: 0 }
                  }
                  transition={{
                    duration: 0.5,
                    delay: i * 0.025,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {item.label}
                </motion.div>
              );
            })}

            {/* Core pulse */}
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 48,
                height: 48,
                background: "radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%)",
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={
                phase === "pulse"
                  ? { scale: [0, 1.5, 2], opacity: [0, 1, 0] }
                  : { scale: 0, opacity: 0 }
              }
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function useGravityTrigger() {
  const [trigger, setTrigger] = useState(false);

  const fire = useCallback(() => {
    setTrigger(true);
    setTimeout(() => setTrigger(false), 1200);
  }, []);

  return { trigger, fire };
}
