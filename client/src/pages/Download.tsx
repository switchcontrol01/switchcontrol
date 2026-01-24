import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Shield, CheckCircle, Monitor, Clock } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { brand } from "@/config/brand";
import { motion, useMotion } from "@/lib/motion";

export default function DownloadPage() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useMotion();

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black flex flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <style>{`
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glowPulse {
          0%, 100% { 
            filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.5)) drop-shadow(0 0 24px rgba(139, 92, 246, 0.3));
          }
          50% { 
            filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.7)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.5));
          }
        }
        .logo-animate {
          animation: logoFloat 3s ease-in-out infinite, glowPulse 2.5s ease-in-out infinite;
        }
        .logo-animate:hover {
          transform: scale(1.03);
          filter: drop-shadow(0 0 24px rgba(139, 92, 246, 0.8)) drop-shadow(0 0 48px rgba(139, 92, 246, 0.6));
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-animate {
            animation: logoFloat 8s ease-in-out infinite, glowPulse 6s ease-in-out infinite;
          }
        }
      `}</style>
      
      <header className="relative z-10 p-4">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <Card className="w-full max-w-lg bg-black/50 border-white/10 backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/40 to-purple-600/30 blur-2xl scale-150 opacity-60" />
                <motion.img 
                  src="/switchcontrol-logo.png" 
                  alt="SwitchControl"
                  className="relative w-[60px] h-[60px] md:w-[80px] md:h-[80px] rounded-2xl transition-all duration-300 object-contain logo-animate"
                  initial={{ opacity: 0, scale: prefersReducedMotion ? 0.95 : 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: prefersReducedMotion ? 0.2 : 0.4 }}
                  whileHover={{ scale: prefersReducedMotion ? 1.01 : 1.03 }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                New Release 2026
              </span>
            </div>
            <CardTitle className="text-2xl text-white">Download {brand.name}</CardTitle>
            <CardDescription>
              Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'User'}! Get the desktop app to start optimizing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                <span>Version 1.2.0 - Latest stable release</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Monitor className="size-4 text-primary shrink-0" />
                <span>Windows 10/11 (64-bit)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Shield className="size-4 text-blue-400 shrink-0" />
                <span>Digitally signed & virus-free</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Clock className="size-4 text-amber-400 shrink-0" />
                <span>~25 MB download size</span>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-base bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
              onClick={() => {
                alert('Download would start here. This is a demo - the actual installer is not yet available.');
              }}
              data-testid="button-download-windows"
            >
              <Download className="size-5 mr-2" />
              Download for Windows
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              By downloading, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-medium text-white mb-4">Installation Steps</h4>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 1, label: "Download", icon: Download },
                  { step: 2, label: "Install", icon: Monitor },
                  { step: 3, label: "Launch", icon: Shield },
                  { step: 4, label: "Optimize", icon: CheckCircle }
                ].map((item, index) => (
                  <motion.div
                    key={item.step}
                    className="text-center p-2 rounded-lg bg-white/5 border border-white/10"
                    initial={{ opacity: 0, y: prefersReducedMotion ? 5 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1, duration: prefersReducedMotion ? 0.15 : 0.3 }}
                    whileHover={{ scale: prefersReducedMotion ? 1.02 : 1.05, borderColor: 'rgba(139, 92, 246, 0.5)' }}
                  >
                    <item.icon className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium text-white">{item.step}</p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
