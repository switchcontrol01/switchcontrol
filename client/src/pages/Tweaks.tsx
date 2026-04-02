import { AppLayout } from "@/components/layout/AppLayout";
import { TweaksList } from "@/components/tweaks/TweaksList";
import { Zap } from "lucide-react";
import { isElectronWithTweaks } from "@/hooks/use-tweak-executor";

export default function Tweaks() {
  const isElectron = isElectronWithTweaks();

  return (
    <AppLayout>
      <div className="space-y-6 h-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Zap className="size-8 text-primary" />
            System Tweaks
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            {isElectron
              ? "Real Windows optimizations — each toggle reads and writes your actual system state and verifies the change."
              : "Windows performance optimizations. Launch the desktop app to apply real system changes."}
          </p>
        </div>

        <div data-tour="advanced-premium-tweaks">
          <TweaksList />
        </div>
      </div>
    </AppLayout>
  );
}
