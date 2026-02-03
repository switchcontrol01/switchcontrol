import { Minus, Square, X } from "lucide-react";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      system?: {
        openExternal: (url: string) => Promise<boolean>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      auth?: {
        onCallback: (callback: (data: { token: string; user: AuthUser }) => void) => void;
        removeCallbackListener: () => void;
      };
    };
  }
}

interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  isPremium: boolean;
}

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
