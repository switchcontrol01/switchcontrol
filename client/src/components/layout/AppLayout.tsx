import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-x-hidden">
      {/* Noise Overlay */}
      <div className="fixed inset-0 z-0 bg-noise opacity-30 pointer-events-none mix-blend-overlay" />
      
      <Sidebar />
      <main className="pl-64 min-h-screen relative z-10">
        <div className="container max-w-7xl mx-auto p-8 animate-in fade-in duration-700 slide-in-from-bottom-4 ease-out">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
