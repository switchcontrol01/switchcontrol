import { Minus, Square, X } from "lucide-react";
import { motion } from "framer-motion";
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
    <div className="titlebar-controls fixed top-0 right-0 z-[9999] flex items-center h-8 gap-0.5 pr-1">
      <motion.button
        onClick={handleMinimize}
        className="w-9 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] backdrop-blur-md border border-white/[0.04] transition-colors duration-150"
        whileHover={{ scale: 1.06, backgroundColor: "rgba(168, 85, 247, 0.15)" }}
        whileTap={{ scale: 0.95 }}
        data-testid="window-minimize"
      >
        <Minus className="w-3.5 h-3.5 text-white/60" />
      </motion.button>
      <motion.button
        onClick={handleMaximize}
        className="w-9 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] backdrop-blur-md border border-white/[0.04] transition-colors duration-150"
        whileHover={{ scale: 1.06, backgroundColor: "rgba(168, 85, 247, 0.15)" }}
        whileTap={{ scale: 0.95 }}
        data-testid="window-maximize"
      >
        <Square className="w-2.5 h-2.5 text-white/60" />
      </motion.button>
      <motion.button
        onClick={handleClose}
        className="w-9 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] backdrop-blur-md border border-white/[0.04] transition-colors duration-150"
        whileHover={{ scale: 1.06, backgroundColor: "rgba(239, 68, 68, 0.4)" }}
        whileTap={{ scale: 0.95 }}
        data-testid="window-close"
      >
        <X className="w-3.5 h-3.5 text-white/60" />
      </motion.button>
    </div>
  );
}
