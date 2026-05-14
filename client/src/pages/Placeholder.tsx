import { AppLayout } from "@/components/layout/AppLayout";
import { Construction } from "lucide-react";

export default function Placeholder({ title }: { title?: string }) {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="size-20 rounded-full bg-muted/30 flex items-center justify-center animate-pulse">
          <Construction className="size-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#E6EAF0]">{title || "Under Construction"}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            This page is part of the prototype roadmap. Check back in the next version update.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
