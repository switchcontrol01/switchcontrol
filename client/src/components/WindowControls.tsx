import { Minus, Square, X } from "lucide-react";
import "@/types/electron.d";

export function WindowControls() {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
  
  if (!isElectron) return null;

  const handleMinimize = () => {
    window.electronAPI?.window.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.window.close();
  };

  return (
    <div className="titlebar-controls fixed top-0 right-0 z-[9999] flex items-center h-8">
      <button
        onClick={handleMinimize}
        className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
        data-testid="window-minimize"
      >
        <Minus className="w-4 h-4 text-white/70" />
      </button>
      <button
        onClick={handleMaximize}
        className="w-12 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
        data-testid="window-maximize"
      >
        <Square className="w-3 h-3 text-white/70" />
      </button>
      <button
        onClick={handleClose}
        className="w-12 h-8 flex items-center justify-center hover:bg-red-500 transition-colors"
        data-testid="window-close"
      >
        <X className="w-4 h-4 text-white/70" />
      </button>
    </div>
  );
}
