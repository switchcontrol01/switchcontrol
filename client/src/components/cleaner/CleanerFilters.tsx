import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, X, SortDesc } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemFilterType =
  | "all"
  | "found"
  | "selected"
  | "safe"
  | "admin"
  | "biggest"
  | "priority";

interface Props {
  search:    string;
  filter:    ItemFilterType;
  onSearch:  (v: string) => void;
  onFilter:  (f: ItemFilterType) => void;
  foundCount: number;
  totalCount: number;
}

const FILTER_OPTS: { id: ItemFilterType; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "found",    label: "Found only" },
  { id: "selected", label: "Selected" },
  { id: "safe",     label: "Safe only" },
  { id: "admin",    label: "Admin" },
  { id: "biggest",  label: "Biggest first" },
  { id: "priority", label: "Priority" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CleanerFilters({ search, filter, onSearch, onFilter, foundCount, totalCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2.5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
        <Input
          ref={inputRef}
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search items by name or description…"
          className="pl-9 h-9 bg-[#21262D] border-[#2A313A] text-sm"
          data-testid="input-search-items"
        />
        {search && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            onClick={() => { onSearch(""); inputRef.current?.focus(); }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SortDesc className="size-3.5 text-muted-foreground/40 shrink-0" />
        {FILTER_OPTS.map(f => (
          <button
            key={f.id}
            onClick={() => onFilter(f.id)}
            data-testid={`filter-${f.id}`}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] border transition-all",
              filter === f.id
                ? "bg-primary/15 border-primary/30 text-primary"
                : "border-[#2A313A] text-muted-foreground hover:text-foreground/80 hover:border-[#2A313A]5"
            )}
          >
            {f.label}
          </button>
        ))}

        <span className="ml-auto text-[10px] text-muted-foreground/40">
          {foundCount > 0 ? `${foundCount} found / ` : ""}{totalCount} items
        </span>
      </div>
    </div>
  );
}
