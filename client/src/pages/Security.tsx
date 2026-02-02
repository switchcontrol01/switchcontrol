import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, ShieldCheck, ShieldAlert, ShieldX, 
  Scan, AlertTriangle, CheckCircle, XCircle,
  Trash2, Lock, Unlock, Zap, RefreshCw, Clock,
  Activity, Cpu, HardDrive, AlertOctagon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useToast } from "@/hooks/use-toast";

interface DefenderStatus {
  realTimeProtection: boolean;
  tamperProtection: boolean;
  lastScanTime: string;
  engineVersion: string;
  signatureVersion: string;
  lastUpdated: string;
}

interface Threat {
  id: string;
  name: string;
  severity: "Severe" | "High" | "Medium" | "Low" | "Unknown";
  category: string;
  status: string;
  filePath?: string;
  processId?: number;
  cpuUsage?: number;
  ramUsage?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  Severe: "bg-red-500/20 text-red-400 border-red-500/30",
  High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  Unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30"
};

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  Severe: ShieldX,
  High: ShieldAlert,
  Medium: AlertTriangle,
  Low: Shield,
  Unknown: Shield
};

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
            : "bg-red-500/20 text-red-400 border-red-500/30"
        )}
      >
        {enabled ? "ON" : "OFF"}
      </Badge>
    </div>
  );
}

function ThreatRow({ 
  threat, 
  onQuarantine, 
  onRemove, 
  onAllow,
  isLoading 
}: { 
  threat: Threat; 
  onQuarantine: () => void;
  onRemove: () => void;
  onAllow: () => void;
  isLoading: boolean;
}) {
  const [showAllowConfirm, setShowAllowConfirm] = useState(false);
  const SeverityIcon = SEVERITY_ICONS[threat.severity] || Shield;

  return (
    <motion.div
      variants={staggerItem}
      className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn(
            "p-2 rounded-lg",
            SEVERITY_COLORS[threat.severity]?.split(" ")[0] || "bg-gray-500/20"
          )}>
            <SeverityIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-white truncate">{threat.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{threat.category}</p>
            {threat.filePath && (
              <p className="text-xs text-muted-foreground/70 mt-1 truncate font-mono">
                {threat.filePath}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={SEVERITY_COLORS[threat.severity]}>
            {threat.severity}
          </Badge>
          <Badge variant="outline" className="bg-white/5 text-muted-foreground border-white/10">
            {threat.status}
          </Badge>
        </div>
      </div>

      {(threat.cpuUsage !== undefined || threat.ramUsage !== undefined) && (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {threat.cpuUsage !== undefined && (
            <div className="flex items-center gap-1.5">
              <Cpu className="size-3.5" />
              <span>CPU: {threat.cpuUsage.toFixed(1)}%</span>
            </div>
          )}
          {threat.ramUsage !== undefined && (
            <div className="flex items-center gap-1.5">
              <Activity className="size-3.5" />
              <span>RAM: {threat.ramUsage.toFixed(1)} MB</span>
            </div>
          )}
        </div>
      )}

      {!threat.cpuUsage && !threat.ramUsage && (
        <p className="mt-3 text-xs text-muted-foreground/70 italic">
          Inactive file – no runtime impact
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onQuarantine}
          disabled={isLoading}
          className="bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400"
        >
          <Lock className="size-3.5 mr-1.5" />
          Quarantine
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={isLoading}
          className="bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400"
        >
          <Trash2 className="size-3.5 mr-1.5" />
          Remove
        </Button>
        {!showAllowConfirm ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAllowConfirm(true)}
            disabled={isLoading}
            className="text-muted-foreground hover:text-white"
          >
            <Unlock className="size-3.5 mr-1.5" />
            Allow
          </Button>
        ) : (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-amber-400">⚠️ This may reduce security</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                onAllow();
                setShowAllowConfirm(false);
              }}
              disabled={isLoading}
            >
              Confirm Allow
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAllowConfirm(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Security() {
  const { prefersReducedMotion } = useMotion();
  const { toast } = useToast();
  const [status, setStatus] = useState<DefenderStatus | null>(null);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scanningType, setScanningType] = useState<"quick" | "full" | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const electronAvailable = typeof window !== "undefined" && 
      (window as any).switchControl?.security !== undefined;
    setIsElectron(electronAvailable);
    
    if (electronAvailable) {
      fetchStatus();
      fetchThreats();
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const result = await (window as any).switchControl.security.getStatus();
      if (result.success) {
        setStatus(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch Defender status:", error);
    }
  };

  const fetchThreats = async () => {
    try {
      const result = await (window as any).switchControl.security.getThreats();
      if (result.success) {
        setThreats(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch threats:", error);
    }
  };

  const startScan = async (type: "quick" | "full") => {
    if (!isElectron) {
      toast({
        title: "Desktop App Required",
        description: "Scanning requires the SwitchControl desktop application.",
        variant: "destructive"
      });
      return;
    }

    setScanningType(type);
    try {
      const scanFn = type === "quick" 
        ? (window as any).switchControl.security.startQuickScan
        : (window as any).switchControl.security.startFullScan;
      
      const result = await scanFn();
      
      if (result.success) {
        toast({
          title: "Scan Started",
          description: `${type === "quick" ? "Quick" : "Full"} scan initiated. This may take a few minutes.`
        });
        setTimeout(fetchThreats, 5000);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to start scan.",
        variant: "destructive"
      });
    } finally {
      setScanningType(null);
    }
  };

  const handleThreatAction = async (
    threatId: string, 
    action: "quarantine" | "remove" | "allow",
    filePath?: string
  ) => {
    if (!isElectron) return;

    setIsLoading(true);
    try {
      let result;
      switch (action) {
        case "quarantine":
          result = await (window as any).switchControl.security.quarantineThreat(threatId);
          break;
        case "remove":
          result = await (window as any).switchControl.security.removeThreat(threatId);
          break;
        case "allow":
          if (!filePath) {
            toast({
              title: "Cannot Allow",
              description: "File path is required to add exclusion.",
              variant: "destructive"
            });
            setIsLoading(false);
            return;
          }
          result = await (window as any).switchControl.security.allowThreat(threatId, filePath);
          break;
      }

      if (result.success) {
        toast({
          title: "Action Completed",
          description: `Threat ${action}d successfully.`
        });
        fetchThreats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Action Failed",
        description: error.message || `Failed to ${action} threat.`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyCleanup = async () => {
    if (!isElectron) {
      toast({
        title: "Desktop App Required",
        description: "Emergency cleanup requires the SwitchControl desktop application.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await (window as any).switchControl.security.emergencyCleanup();
      
      if (result.success) {
        toast({
          title: "Emergency Cleanup Complete",
          description: "Suspicious processes terminated and quick scan initiated."
        });
        fetchStatus();
        setTimeout(fetchThreats, 5000);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Cleanup Failed",
        description: error.message || "Emergency cleanup failed.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const MotionDiv = prefersReducedMotion ? "div" : motion.div;
  const containerProps = prefersReducedMotion ? {} : {
    variants: staggerContainer,
    initial: "initial",
    animate: "animate"
  };

  return (
    <AppLayout>
      <MotionDiv className="space-y-6" {...containerProps}>
        {!isElectron && (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-400">Desktop App Required</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Security features require the SwitchControl desktop application running on Windows 
                    with administrator privileges. The web version can only display this interface.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchStatus}
                  disabled={!isElectron}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusIndicator 
                enabled={status?.realTimeProtection ?? true} 
                label="Real-Time Protection" 
              />
              <StatusIndicator 
                enabled={status?.tamperProtection ?? true} 
                label="Tamper Protection" 
              />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="size-3.5" />
                    <span className="text-xs">Last Scan</span>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {status?.lastScanTime || "Unknown"}
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <HardDrive className="size-3.5" />
                    <span className="text-xs">Engine Version</span>
                  </div>
                  <p className="text-sm font-medium text-white font-mono">
                    {status?.engineVersion || "Unknown"}
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
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => startScan("quick")}
                disabled={scanningType !== null || !isElectron}
              >
                {scanningType === "quick" ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="size-4 mr-2" />
                    Quick Scan
                  </>
                )}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => startScan("full")}
                disabled={scanningType !== null || !isElectron}
              >
                {scanningType === "full" ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Shield className="size-4 mr-2" />
                    Full Scan
                  </>
                )}
              </Button>
              <div className="pt-3 border-t border-white/10">
                <Button
                  className="w-full bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400"
                  variant="outline"
                  onClick={handleEmergencyCleanup}
                  disabled={isLoading || !isElectron}
                >
                  <AlertOctagon className="size-4 mr-2" />
                  Emergency Cleanup
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Kills suspicious processes & runs quick scan
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
                  {threats.length === 0 
                    ? "No threats detected" 
                    : `${threats.length} threat${threats.length !== 1 ? "s" : ""} found`}
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={fetchThreats}
                disabled={!isElectron}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {threats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-emerald-500/20 mb-4">
                  <CheckCircle className="size-8 text-emerald-400" />
                </div>
                <h3 className="font-medium text-white mb-1">System Clean</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  No threats have been detected. Run a scan to check for any security issues.
                </p>
              </div>
            ) : (
              <MotionDiv 
                className="space-y-3" 
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {threats.map((threat) => (
                  <ThreatRow
                    key={threat.id}
                    threat={threat}
                    onQuarantine={() => handleThreatAction(threat.id, "quarantine")}
                    onRemove={() => handleThreatAction(threat.id, "remove")}
                    onAllow={() => handleThreatAction(threat.id, "allow", threat.filePath)}
                    isLoading={isLoading}
                  />
                ))}
              </MotionDiv>
            )}
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
