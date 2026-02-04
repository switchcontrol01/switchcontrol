import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, Terminal } from "lucide-react";

interface DiagnosticsResult {
  isElectron: boolean;
  hasPreload: boolean;
  hasTelemetry: boolean;
  hasSystemAPI: boolean;
}

export function RuntimeDiagnostics({ compact = false }: { compact?: boolean }) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [debugOutput, setDebugOutput] = useState<string[]>([]);

  useEffect(() => {
    const isElectron = typeof navigator !== 'undefined' && 
      navigator.userAgent.toLowerCase().includes('electron');
    
    const hasPreload = typeof window !== 'undefined' && 
      typeof window.telemetry !== 'undefined';
    
    const hasTelemetry = typeof window !== 'undefined' && 
      typeof window.telemetry?.getLive === 'function';
    
    const hasSystemAPI = typeof window !== 'undefined' && 
      typeof window.sc?.getSystemSpecs === 'function';

    setDiagnostics({
      isElectron,
      hasPreload,
      hasTelemetry,
      hasSystemAPI
    });
  }, []);

  const runPing = async () => {
    try {
      if (window.telemetry?.getLive) {
        const result = await window.telemetry.getLive();
        setDebugOutput(prev => [...prev, `[PING] Telemetry response: CPU ${result.cpuLoadPercent}%, RAM ${result.ramUsedGb}GB`]);
      } else {
        setDebugOutput(prev => [...prev, `[PING] FAILED - window.telemetry.getLive not available`]);
      }
    } catch (err: any) {
      setDebugOutput(prev => [...prev, `[PING] ERROR: ${err.message}`]);
    }
  };

  const runGetGraphics = async () => {
    try {
      if (window.sc?.getSystemSpecs) {
        const specs = await window.sc.getSystemSpecs();
        setDebugOutput(prev => [...prev, `[GPU] ${specs.gpu.model} | VRAM: ${specs.gpu.vramGB}GB`]);
      } else {
        setDebugOutput(prev => [...prev, `[GPU] FAILED - window.sc.getSystemSpecs not available`]);
      }
    } catch (err: any) {
      setDebugOutput(prev => [...prev, `[GPU] ERROR: ${err.message}`]);
    }
  };

  const runGetDisks = async () => {
    try {
      if (window.sc?.getAllDisks) {
        const disks = await window.sc.getAllDisks();
        const diskInfo = disks.map(d => `${d.mount}: ${d.usedGB}/${d.totalGB}GB`).join(', ');
        setDebugOutput(prev => [...prev, `[DISKS] ${diskInfo || 'No disks found'}`]);
      } else {
        setDebugOutput(prev => [...prev, `[DISKS] FAILED - window.sc.getAllDisks not available`]);
      }
    } catch (err: any) {
      setDebugOutput(prev => [...prev, `[DISKS] ERROR: ${err.message}`]);
    }
  };

  if (!diagnostics) return null;

  const allGood = diagnostics.isElectron && diagnostics.hasPreload && diagnostics.hasTelemetry;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className={diagnostics.isElectron ? "text-emerald-400" : "text-amber-400"}>
          {diagnostics.isElectron ? "Electron" : "Browser"}
        </span>
        <span className="text-muted-foreground">|</span>
        <span className={diagnostics.hasPreload ? "text-emerald-400" : "text-red-400"}>
          Preload: {diagnostics.hasPreload ? "OK" : "Missing"}
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/10 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Terminal className="size-4 text-primary" />
        Runtime Diagnostics
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          {diagnostics.isElectron ? (
            <CheckCircle className="size-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="size-3.5 text-amber-400" />
          )}
          <span>Runtime: {diagnostics.isElectron ? "Electron" : "Browser"}</span>
        </div>

        <div className="flex items-center gap-2">
          {diagnostics.hasPreload ? (
            <CheckCircle className="size-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="size-3.5 text-red-400" />
          )}
          <span>Preload: {diagnostics.hasPreload ? "Connected" : "Missing"}</span>
        </div>

        <div className="flex items-center gap-2">
          {diagnostics.hasTelemetry ? (
            <CheckCircle className="size-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="size-3.5 text-red-400" />
          )}
          <span>Telemetry: {diagnostics.hasTelemetry ? "Available" : "Unavailable"}</span>
        </div>

        <div className="flex items-center gap-2">
          {diagnostics.hasSystemAPI ? (
            <CheckCircle className="size-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="size-3.5 text-red-400" />
          )}
          <span>System API: {diagnostics.hasSystemAPI ? "Available" : "Unavailable"}</span>
        </div>
      </div>

      {!allGood && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400">
          {!diagnostics.isElectron && "Running in browser mode - real sensor data unavailable. "}
          {diagnostics.isElectron && !diagnostics.hasPreload && "Preload bridge missing - check BrowserWindow preload path and contextBridge. "}
        </div>
      )}

      <div className="flex gap-2">
        <button 
          onClick={runPing}
          className="px-2 py-1 text-[10px] rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
        >
          Test Telemetry
        </button>
        <button 
          onClick={runGetGraphics}
          className="px-2 py-1 text-[10px] rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
        >
          Test GPU
        </button>
        <button 
          onClick={runGetDisks}
          className="px-2 py-1 text-[10px] rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
        >
          Test Disks
        </button>
      </div>

      {debugOutput.length > 0 && (
        <div className="p-2 rounded bg-black/50 border border-white/5 font-mono text-[10px] max-h-32 overflow-y-auto space-y-1">
          {debugOutput.slice(-5).map((line, i) => (
            <div key={i} className={line.includes('ERROR') || line.includes('FAILED') ? 'text-red-400' : 'text-emerald-400'}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
