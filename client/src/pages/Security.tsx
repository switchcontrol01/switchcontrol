import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, ShieldCheck, ShieldAlert,
  Scan, AlertTriangle, CheckCircle,
  Trash2, Lock, Unlock, Zap, RefreshCw, Clock,
  HardDrive, AlertOctagon, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, staggerContainer, useMotion } from "@/lib/motion";

// Defender integration pending - UI placeholder only

function StatusIndicator({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge 
        variant="outline" 
        className={cn(
          "font-medium",
          enabled 
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
            : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
        )}
      >
        {enabled ? "ON" : "Pending"}
      </Badge>
    </div>
  );
}

export default function Security() {
  const { prefersReducedMotion } = useMotion();

  const MotionDiv = prefersReducedMotion ? "div" : motion.div;
  const containerProps = prefersReducedMotion ? {} : {
    variants: staggerContainer,
    initial: "initial",
    animate: "animate"
  };

  return (
    <AppLayout>
      <MotionDiv className="space-y-6" {...containerProps}>
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-amber-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-400">Defender Integration Pending</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Windows Defender integration will be enabled in the next update. 
                  This page currently shows a preview of the upcoming security features.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-gradient-to-br from-card to-card/80 border-white/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" />
                    Defender Status
                  </CardTitle>
                  <CardDescription>
                    Windows Defender real-time protection status
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" disabled>
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusIndicator enabled={true} label="Real-Time Protection" />
              <StatusIndicator enabled={true} label="Tamper Protection" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="size-3.5" />
                    <span className="text-xs">Last Scan</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-400">
                    Pending connection
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <HardDrive className="size-3.5" />
                    <span className="text-xs">Engine Version</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-400 font-mono">
                    --
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-card/80 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scan className="size-5 text-cyan-400" />
                Scan Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full bg-primary/50 hover:bg-primary/60 cursor-not-allowed"
                disabled
              >
                <Zap className="size-4 mr-2" />
                Quick Scan
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled
              >
                <Shield className="size-4 mr-2" />
                Full Scan
              </Button>
              <div className="pt-3 border-t border-white/10">
                <Button
                  className="w-full bg-red-500/10 border-red-500/20 text-red-400/60 cursor-not-allowed"
                  variant="outline"
                  disabled
                >
                  <AlertOctagon className="size-4 mr-2" />
                  Emergency Cleanup
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Available in next update
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-br from-card to-card/80 border-white/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-400" />
                  Detected Threats
                </CardTitle>
                <CardDescription>
                  Threat detection will be available after integration
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" disabled>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-zinc-500/20 mb-4">
                <CheckCircle className="size-8 text-zinc-400" />
              </div>
              <h3 className="font-medium text-zinc-400 mb-1">Waiting for Integration</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Threat detection and management will be available once Windows Defender integration is enabled.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground text-center">
              SwitchControl uses Windows Defender to display and manage system security.
              This is not a standalone antivirus solution. Detection accuracy depends on Windows Defender.
            </p>
          </CardContent>
        </Card>
      </MotionDiv>
    </AppLayout>
  );
}
