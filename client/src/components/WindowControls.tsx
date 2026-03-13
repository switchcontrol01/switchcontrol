import { Minus, X } from "lucide-react";
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
    <div className="titlebar-strip">
      <div className="titlebar-drag-region" />

      <div className="titlebar-controls">
        <button
          onClick={handleMinimize}
          className="titlebar-btn"
          data-testid="window-minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={handleMaximize}
          className="titlebar-btn"
          data-testid="window-maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1" y="1" width="8" height="8" rx="1.5" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          data-testid="window-close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
