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
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="titlebar-btn"
          data-testid="window-maximize"
          aria-label="Maximize"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="8" height="8" rx="1.5" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          data-testid="window-close"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
