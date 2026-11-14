import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Gauge, Gauge as GaugeIcon, Leaf, Sliders, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../client/src/components/ui/tabs";
import {
  PowerPlanHeroPresentation,
  PowerPlanProfileCards,
  type ProfileCardPresentation,
  type PowerPlanImpact,
  type PowerPlanProfileId,
  type PowerPlanTheme,
} from "../../client/src/pages/PowerPlanPresentation";

const themes: Record<PowerPlanProfileId, PowerPlanTheme> = {
  performance: { accent: "#ef555e", glow: "rgba(239,85,94,.22)", borderColor: "rgba(239,85,94,.42)", bgGrad: "linear-gradient(160deg,rgba(239,85,94,.18),rgba(234,88,12,.08) 50%,rgba(0,0,0,.6))" },
  balanced: { accent: "#18bfd2", glow: "rgba(24,191,210,.22)", borderColor: "rgba(24,191,210,.42)", bgGrad: "linear-gradient(160deg,rgba(24,191,210,.18),rgba(6,182,212,.08) 50%,rgba(0,0,0,.6))" },
  efficiency: { accent: "#42c896", glow: "rgba(66,200,150,.2)", borderColor: "rgba(66,200,150,.42)", bgGrad: "linear-gradient(160deg,rgba(66,200,150,.18),rgba(20,184,166,.08) 50%,rgba(0,0,0,.6))" },
  custom: { accent: "#b294d2", glow: "rgba(178,148,210,.2)", borderColor: "rgba(178,148,210,.44)", bgGrad: "linear-gradient(160deg,rgba(178,148,210,.18),rgba(139,92,246,.08) 50%,rgba(0,0,0,.6))" },
};
const impact: Record<PowerPlanProfileId, PowerPlanImpact> = {
  performance: { latency: 95, speed: 100, battery: 5 },
  balanced: { latency: 68, speed: 80, battery: 42 },
  efficiency: { latency: 22, speed: 45, battery: 95 },
  custom: { latency: 62, speed: 60, battery: 37 },
};
const profileDefinitions = [
  { id: "performance", name: "Maximum Performance", description: "SwitchControl's strongest verified profile: maximum CPU availability, active cooling, no parking, no idle states, and power-saving features disabled.", iconName: "zap", compatibility: ["desktop", "laptop"], keySettings: ["CPU 100%–100%", "Aggressive boost", "All cores active", "Idle off", "EPP 0", "USB/PCIe off"] },
  { id: "balanced", name: "Balanced Gaming", description: "Smart scaling for consistent frame times, strong foreground performance, and controlled heat.", iconName: "gauge", compatibility: ["desktop", "laptop"], keySettings: ["CPU 5%–100%", "Efficient boost", "All cores available", "EPP 32", "USB/PCIe off", "Sleep off"] },
  { id: "efficiency", name: "Efficiency / Laptop", description: "Laptop-first efficiency with dynamic scaling, sleep protection, and lower power draw.", iconName: "leaf", compatibility: ["laptop"], keySettings: ["CPU 5%–85%", "Efficient boost", "Parking enabled", "EPP 80", "USB save", "Sleep 15m"] },
] as const;
const icons = { zap: Zap, gauge: GaugeIcon, leaf: Leaf };

function Fixture() {
  const [active, setActive] = useState<PowerPlanProfileId>("performance");
  const [expanded, setExpanded] = useState<PowerPlanProfileId | null>(null);
  const [tab, setTab] = useState("profiles");
  const [notice, setNotice] = useState("Local fixture only · no Windows state queried");

  const profiles: ProfileCardPresentation[] = profileDefinitions.map(profile => ({
    ...profile,
    icon: icons[profile.iconName],
    compatibility: [...profile.compatibility],
    keySettings: [...profile.keySettings],
    theme: themes[profile.id],
    impact: impact[profile.id],
    active: active === profile.id,
    applying: false,
  }));

  return (
    <div className="power-plan-capture-canvas">
      <main className="power-plan-page space-y-6 relative" data-testid="power-plan-production-fixture">
        <PowerPlanHeroPresentation
          planLoading={false}
          planName="No active plan reported"
          planDescription="Fixture only — no Windows power state was queried."
          translate={text => text}
          onRefresh={() => setNotice("Fixture refreshed · no system query performed")}
          statusBadges={<span className="pp-fixture-status">{notice}</span>}
        />
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="bg-[#14181D]/80 border border-[#2A313A]">
            <TabsTrigger value="profiles"><Gauge className="size-4 mr-2" /> Power Profiles</TabsTrigger>
            <TabsTrigger value="custom"><Sliders className="size-4 mr-2" /> Custom Builder</TabsTrigger>
          </TabsList>
          <TabsContent value="profiles" className="space-y-6">
            <PowerPlanProfileCards
              profiles={profiles}
              custom={{
                name: "Custom Plan",
                theme: themes.custom,
                impact: impact.custom,
                keySettings: ["CPU: Custom", "Boost: Custom", "Park: Custom", "USB: Custom", "Sleep: Custom"],
                applied: active === "custom",
                applying: false,
              }}
              expandedProfileId={expanded}
              applyingProfileId={null}
              closeMatch={false}
              onActivate={id => {
                setActive(id);
                setNotice("Fixture state updated · not Windows readback");
              }}
              onApplyCustom={() => {
                setActive("custom");
                setNotice("Custom preview selected · no Windows change");
              }}
              onToggleSettings={id => setExpanded(current => current === id ? null : id)}
              onEditCustom={() => {
                setTab("custom");
                setNotice("Custom Builder opened in local fixture");
              }}
              translate={text => text}
            />
          </TabsContent>
          <TabsContent value="custom">
            <section className="pp-fixture-builder">
              <h2>Custom Builder</h2>
              <p>Fixture-only builder state. No Windows settings are read or changed.</p>
            </section>
          </TabsContent>
        </Tabs>
      </main>
      <style>{`
        html, body, #root { margin:0; min-width:100%; min-height:100%; background:#090b10; }
        * { box-sizing:border-box; }
        .power-plan-capture-canvas { width:769px; height:454px; overflow:hidden; padding:34px 0 0 30px; background:#090b10; }
        .power-plan-capture-canvas .power-plan-page { width:581px; height:410px; overflow:hidden; padding:14px 16px; }
        .power-plan-capture-canvas .pp-fixture-status { padding:2px 7px; border:1px solid rgba(24,191,210,.24); border-radius:9px; color:#77c8d3; background:rgba(7,17,32,.5); font-size:8px; }
        .power-plan-capture-canvas .pp-fixture-builder { padding:12px; border:1px solid rgba(143,191,204,.2); border-radius:10px; color:#d9e4ec; background:#111a2a; }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
