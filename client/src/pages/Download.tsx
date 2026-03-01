import { Link } from "wouter";
import { Download, Shield, CheckCircle, Monitor, Clock } from "lucide-react";
import { useAuth } from "@/components/ProtectedRoute";
import { brand } from "@/config/brand";
import { motion, useMotion } from "@/lib/motion";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import faviconImg from "@/assets/favicon.png";

export default function DownloadPage() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useMotion();

  return (
    <WebsiteShell variant="inner" bgVariant="download" showFooter={false}>
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

      <main className="flex-1 flex items-center justify-center p-4 min-h-[calc(100vh-80px)]">
        <GlassPanel variant="elevated" glow="purple" className="w-full max-w-lg p-0">
          <div className="p-6 sm:p-8 text-center border-b border-white/[0.06]">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/40 to-cyan-600/30 blur-2xl scale-150 opacity-60" />
                <motion.img 
                  src={faviconImg}
                  alt="SwitchControl"
                  className="relative w-20 h-20 md:w-24 md:h-24 rounded-[22%] transition-all duration-300 object-contain logo-animate"
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
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                v1.0.0 (Early Access)
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-download-title">Download {brand.name}</h1>
            <p className="text-sm text-white/50 mt-1">
              Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'User'}! Get the desktop app to start optimizing.
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-white/50">
                <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                <span>v1.0.0 (Early Access) - Latest build</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Monitor className="size-4 text-primary shrink-0" />
                <span>Windows Installer (.exe) • Windows 10/11 64-bit</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Shield className="size-4 text-blue-400 shrink-0" />
                <span>Digitally signed • No bundled software</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Clock className="size-4 text-amber-400 shrink-0" />
                <span>~25 MB • Installs in under 30 seconds</span>
              </div>
            </div>

            <GlowButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => {
                alert('Download would start here. This is a demo - the actual installer is not yet available.');
              }}
              data-testid="button-download-windows"
            >
              <Download className="size-5" />
              Download SwitchControl_v1.0.0_Setup.exe
            </GlowButton>

            <p className="text-xs text-center text-white/35">
              By downloading, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>

            <div className="pt-4 border-t border-white/[0.06]">
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
                    className="text-center p-2 rounded-xl bg-white/[0.03] border border-white/[0.08]"
                    initial={{ opacity: 0, y: prefersReducedMotion ? 5 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1, duration: prefersReducedMotion ? 0.15 : 0.3 }}
                    whileHover={{ scale: prefersReducedMotion ? 1.02 : 1.05, borderColor: 'rgba(139, 92, 246, 0.5)' }}
                    data-testid={`step-install-${item.step}`}
                  >
                    <item.icon className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium text-white">{item.step}</p>
                    <p className="text-[10px] text-white/40">{item.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </GlassPanel>
      </main>
    </WebsiteShell>
  );
}
