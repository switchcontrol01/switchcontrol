import React, { useState } from "react";
import { Activity, Boxes, HardDrive, MemoryStick, ShieldCheck, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DebloaterNotebookFrame } from "./DebloaterNotebookFrame";
import { BATCH_PANELS, DebloaterIntensityCards, DebloaterOverviewStats } from "./DebloaterOverviewCards";

/** Deterministic Chromium fixture composed from the presentation components used by production. */
export function DebloaterReferenceFixture() {
  const [level, setLevel] = useState<"safe" | "balanced" | "aggressive" | "extreme">("extreme");
  const [tab, setTab] = useState<"curated" | "installed">("curated");
  return (
    <DebloaterNotebookFrame>
      <main className="debloater-page debloater-reference-fixture">
        <header className="debloater-notebook-head">
          <PageHeader
            icon={ShieldCheck}
            title="Debloater"
            subtitle="Role-based system reduction with real Windows integration. Honest results only."
          />
          <nav className="debloater-tabs flex gap-1 p-1 rounded-xl w-fit" aria-label="Debloater sections">
            <button type="button" onClick={() => setTab("curated")} data-selected={tab === "curated"}
              className={tab === "curated" ? "bg-primary/15 text-primary border border-primary/25 shadow-sm" : "text-muted-foreground hover:bg-[#21262D]"}>Curated Removals</button>
            <button type="button" onClick={() => setTab("installed")} data-selected={tab === "installed"}
              className={tab === "installed" ? "bg-primary/15 text-primary border border-primary/25 shadow-sm" : "text-muted-foreground hover:bg-[#21262D]"}>Installed Apps</button>
          </nav>
        </header>
        <div className="debloater-telemetry flex items-center gap-4 px-3 py-2">
          <span>0 processes</span><span>RAM 41%</span><span>CPU 0%</span><span>Scan system</span>
          <span className="sr-only" role="note">Illustrative reference values only; this fixture is not a Windows system scan.</span>
        </div>
        <DebloaterOverviewStats cards={[
          { key: "apps", label: "Removable items", value: "53", unit: "", icon: Boxes, color: "#00D4FF" },
          { key: "ram", label: "RAM recoverable", value: "1225", unit: "MB", icon: MemoryStick, color: "#22d3ee" },
          { key: "proc", label: "Live processes", value: "0", unit: "", icon: Activity, color: "#a855f7" },
          { key: "disk", label: "Disk recoverable", value: "1995", unit: "MB", icon: HardDrive, color: "#34d399" },
        ]} />
        {tab === "curated" && (
          <>
            <section className="debloater-intensity space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="size-4" aria-hidden="true" />
                <span>Choose your intensity</span>
              </div>
              <DebloaterIntensityCards cards={BATCH_PANELS} level={level} onSelect={setLevel} />
            </section>
            <div className="debloater-actionbar flex items-center justify-between gap-3">
              <div>44 of 53 selected at <b>{BATCH_PANELS.find(panel => panel.id === level)?.title ?? level}</b> level</div>
              <button type="button" data-testid="button-apply-debloat" disabled>Apply</button>
            </div>
          </>
        )}
        {tab === "installed" && (
          <section className="debloater-installed-empty">Installed Apps view is data-dependent; no Windows inventory is available in this fixture.</section>
        )}
      </main>
    </DebloaterNotebookFrame>
  );
}
