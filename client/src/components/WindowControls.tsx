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
    <div className="titlebar-strip">
      <div className="titlebar-drag-region" />

      <div className="titlebar-controls">
        <motion.button
          onClick={handleMinimize}
          className="titlebar-btn"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          data-testid="window-minimize"
        >
          <Minus className="w-3.5 h-3.5 text-white/60 group-hover:text-white/90 transition-colors" />
        </motion.button>
        <motion.button
          onClick={handleMaximize}
          className="titlebar-btn"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          data-testid="window-maximize"
        >
          <Square className="w-2.5 h-2.5 text-white/60 group-hover:text-white/90 transition-colors" />
        </motion.button>
        <motion.button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          data-testid="window-close"
        >
          <X className="w-3.5 h-3.5 text-white/60 transition-colors" />
        </motion.button>
      </div>
    </div>
  );
}
