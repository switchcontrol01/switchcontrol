import { useState, useMemo, memo, useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, ChevronUp, HardDrive, Shield, Zap, Gauge,
  AlertTriangle, ShieldCheck, ShieldAlert, Ban,
} from "lucide-react";

interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: string;
  risk: "safe" | "moderate" | "advanced";
  requiresAdmin: boolean;
  diskBased: boolean;
}

interface ScanFinding {
  id: string;
  sizeBytes: number;
  fileCount: number;
  found: boolean;
  scanStatus: string;
}

interface CategoryData {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  items: ItemDef[];
  totalBytes: number;
  totalFiles: number;
  selectedBytes: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
}

interface Props {
  categories: Record<string, ItemDef[]>;
  findings: Record<string, ScanFinding>;
  selected: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleCategory: (cat: string) => void;
  onSelectAllInCategory: (cat: string) => void;
  scanStatus: "idle" | "scanning" | "done" | "error";
  search: string;
  filterType: string;
}

const CAT_META: Record<string, { label: string; icon: typeof HardDrive; color: string; bg: string; border: string }> = {
  storage:     { label: "Storage Noise",     icon: HardDrive, color: "text-[#00D4FF]", bg: "bg-[#00D4FF]", border: "border-[#00D4FF]" },
  privacy:     { label: "Privacy Residue",   icon: Shield,    color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20" },
  latency:     { label: "Latency Killers",   icon: Zap,       color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  performance: { label: "Performance Waste", icon: Gauge,     color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
};

const RISK_META: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof ShieldCheck }> = {
  safe:     { label: "Safe",     color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: ShieldCheck },
  moderate: { label: "Moderate", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20", icon: ShieldAlert },
  advanced: { label: "Risky",    color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20", icon: AlertTriangle },
};

function RiskBadge({ risk }: { risk: string }) {
  const meta = RISK_META[risk] ?? RISK_META.safe;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border", meta.bg, meta.border, meta.color)}>
      <Icon className="size-2.5" />
      {meta.label}
    </span>
  );
}

const CategoryRow = memo(function CategoryRow({
  cat, expanded, onToggle, onSelectAll,
}: {
  cat: CategoryData;
  expanded: boolean;
  onToggle: () => void;
  onSelectAll: () => void;
}) {
  const meta = CAT_META[cat.key] ?? CAT_META.storage;
  const Icon = meta.icon;
  const hasFound = cat.totalBytes > 0;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-200",
        expanded
          ? cn(meta.bg, meta.border, "shadow-[0_0_12px_rgba(0,212,255,0.08)]")
          : "bg-[#1A1F26] border-[#2A313A] hover:bg-[#21262D] hover:border-[#2A313A]"
      )}
    >
      <span className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
        <Icon className={cn("size-4", meta.color)} />
      </span>

      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#E6EAF0]">{cat.label}</span>
          <span className="text-[10px] text-muted-foreground/50">{cat.items.length} items</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {hasFound ? (
            <>
              <span className="text-xs font-semibold text-[#E6EAF0] tabular-nums">{fmtBytes(cat.totalBytes)}</span>
              <span className="text-[10px] text-muted-foreground/40">{cat.totalFiles} files</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/30">Nothing found</span>
          )}
          {cat.selectedCount > 0 && (
            <span className="text-[10px] text-emerald-400/70 tabular-nums">
              {cat.selectedCount} selected · {fmtBytes(cat.selectedBytes)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasFound && (
          <Checkbox
            checked={cat.allSelected}
            onCheckedChange={(v) => { v !== "indeterminate" && onSelectAll(); }}
            className="size-4 border-[#2A313A]"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {expanded ? <ChevronUp className="size-4 text-[#6B7380]" /> : <ChevronDown className="size-4 text-[#6B7380]" />}
      </div>
    </button>
  );
});

const ItemRow = memo(function ItemRow({
  item, finding, selected, onToggle,
}: {
  item: ItemDef;
  finding?: ScanFinding;
  selected: boolean;
  onToggle: () => void;
}) {
  const found = finding?.found ?? false;
  const size = finding?.sizeBytes ?? 0;

  if (!found) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 opacity-30">
        <Ban className="size-3.5 text-muted-foreground/30 shrink-0" />
        <span className="text-xs text-muted-foreground/30">{item.name} — not found</span>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150",
        selected
          ? "bg-[#21262D] border-cyan-500/20 shadow-[0_0_12px_rgba(34,211,238,0.06)]"
          : "bg-transparent border-transparent hover:bg-[#1A1F26]"
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="size-4 shrink-0 border-[#2A313A]"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#E6EAF0] truncate">{item.name}</span>
          <RiskBadge risk={item.risk} />
          {item.requiresAdmin && (
            <span className="text-[9px] px-1 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400">
              Admin
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{item.description}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-[#E6EAF0] tabular-nums">{fmtBytes(size)}</p>
        <p className="text-[9px] text-muted-foreground/40 tabular-nums">{finding?.fileCount ?? 0} files</p>
      </div>
    </motion.div>
  );
});

export function CleanerCategoryAccordion({
  categories, findings, selected, onToggleItem, onToggleCategory, onSelectAllInCategory,
  scanStatus, search, filterType,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand safe category when filter changes to safe
  useEffect(() => {
    if (filterType === "safe") {
      setExpanded(prev => new Set([...Array.from(prev), "storage", "privacy", "performance", "latency"]));
    }
  }, [filterType]);

  const categoryData = useMemo(() => {
    const result: CategoryData[] = [];
    for (const [key, items] of Object.entries(categories)) {
      const filtered = items.filter(item => {
        if (search) {
          const q = search.toLowerCase();
          if (!item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false;
        }
        const f = findings[item.id];
        if (filterType === "found" && !f?.found) return false;
        if (filterType === "selected" && !selected.has(item.id)) return false;
        if (filterType === "safe" && item.risk !== "safe") return false;
        if (filterType === "admin" && !item.requiresAdmin) return false;
        return true;
      });

      if (filtered.length === 0 && (filterType !== "all" || search)) continue;

      const totalBytes = filtered.reduce((a, item) => a + (findings[item.id]?.sizeBytes ?? 0), 0);
      const totalFiles = filtered.reduce((a, item) => a + (findings[item.id]?.fileCount ?? 0), 0);
      const selItems = filtered.filter(i => selected.has(i.id));
      const selectedBytes = selItems.reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
      const selectedCount = selItems.length;
      const allSelected = filtered.length > 0 && filtered.every(i => selected.has(i.id));
      const someSelected = selItems.length > 0 && !allSelected;

      const meta = CAT_META[key] ?? CAT_META.storage;
      result.push({
        key, label: meta.label, icon: meta.icon, color: meta.color,
        items: filtered, totalBytes, totalFiles, selectedBytes, selectedCount, allSelected, someSelected,
      });
    }

    if (filterType === "biggest") {
      result.sort((a, b) => b.totalBytes - a.totalBytes);
    }
    return result;
  }, [categories, findings, selected, search, filterType]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  if (scanStatus !== "done" && scanStatus !== "scanning") {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground/40">Click "Scan System" to discover junk</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="cleaner-accordion">
      {categoryData.map(cat => (
        <div key={cat.key} className="space-y-1">
          <CategoryRow
            cat={cat}
            expanded={expanded.has(cat.key)}
            onToggle={() => toggleExpand(cat.key)}
            onSelectAll={() => onSelectAllInCategory(cat.key)}
          />
          <AnimatePresence>
            {expanded.has(cat.key) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="pl-3 pr-1 py-1 space-y-0.5">
                  {cat.items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      finding={findings[item.id]}
                      selected={selected.has(item.id)}
                      onToggle={() => onToggleItem(item.id)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
