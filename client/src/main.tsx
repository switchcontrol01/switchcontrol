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

// ── Drag / drop lockdown ─────────────────────────────────────────────────────
// Prevents UI elements and links from being dragged out of the window.
// Without these listeners, Chromium lets users drag <a> tags onto the desktop
// creating .url shortcut files that expose internal file:// paths.
document.addEventListener('dragstart', (e) => { e.preventDefault(); }, true);
document.addEventListener('dragover',  (e) => { e.preventDefault(); }, true);
document.addEventListener('drop',      (e) => { e.preventDefault(); }, true);

// Block any in-page click on a file:// link (belt + suspenders alongside main.js will-navigate).
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest?.('a') as HTMLAnchorElement | null;
  if (a?.href?.startsWith('file://')) e.preventDefault();
}, true);

console.log('[LAUNCH:R1] renderer entry — createRoot dispatching');
createRoot(document.getElementById("root")!).render(<App />);

// In non-Electron (website) mode there is no Splash handshake, so reveal immediately.
// In Electron mode, Splash.tsx sends app:first-frame-ready after one rAF and then
// sets documentElement.style.opacity = '1' — do not override that here.
if (!(window as any).electronAPI) {
  document.documentElement.style.opacity = '1';
}
