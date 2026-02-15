import { AppLayout } from "@/components/layout/AppLayout";
import { TweaksList } from "@/components/tweaks/TweaksList";
import { Zap } from "lucide-react";

export default function Tweaks() {
  return (
    <AppLayout>
      <div className="space-y-6 h-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Zap className="size-8 text-primary" />
            System Tweaks
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Fine-tune your Windows experience. Toggle settings to simulate optimization. 
            <span className="text-yellow-500 ml-2 text-sm font-medium">⚠️ Actions are simulated for this prototype.</span>
          </p>
        </div>
        
        <div data-tour="advanced-premium-tweaks">
          <TweaksList />
        </div>
      </div>
    </AppLayout>
  );
}
