import { createRoot } from "react-dom/client";
import "./lib/api"; // must be first — installs global fetch interceptor for Electron
import App from "./App";
import "./index.css";

// ── Global renderer error pipeline ───────────────────────────────────────────
// Captures window-level exceptions and unhandled promise rejections that escape
// the React tree (i.e. not caught by ErrorBoundary).
// Reports them through the preload narrow IPC bridge to critical.log.
// CPU cost: zero — handlers are passive and fire only on actual errors.

function sendRendererCritical(event: {
  source: string;
  message: string;
  stack?: string;
  severity?: string;
}) {
  try {
    const api = (window as any).electronAPI?.logs;
    if (api?.reportCritical) {
      api.reportCritical({
        category: 'renderer_failure',
        severity: event.severity ?? 'error',
        source:   event.source,
        message:  event.message,
        stack:    event.stack,
        route:    typeof window !== 'undefined' ? window.location?.hash : undefined,
      }).catch(() => {});
    }
  } catch (e) {}
}

window.addEventListener('error', (e) => {
  const err = e.error instanceof Error ? e.error : null;
  sendRendererCritical({
    source:  'window.onerror',
    message: err ? err.message : (e.message || 'Unknown script error'),
    stack:   err?.stack,
  });
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const err = reason instanceof Error ? reason : null;
  sendRendererCritical({
    source:  'unhandledRejection',
    message: err ? err.message : String(reason ?? 'Unhandled promise rejection'),
    stack:   err?.stack,
  });
});

createRoot(document.getElementById("root")!).render(<App />);
