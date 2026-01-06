import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground">
      <Sidebar />
      <main className="pl-64 min-h-screen">
        <div className="container max-w-7xl mx-auto p-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
