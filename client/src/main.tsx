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

// ── Dark-lock before React mounts ────────────────────────────────────────────
// Belt-and-suspenders: index.html already sets opacity:0 and background:#07090D
// on <html> as inline attributes, but we re-assert here in case HMR or any
// module side-effect has overwritten them before this script runs.
// This MUST run synchronously before createRoot so the very first React paint
// is already behind a dark, fully-opaque root layer.
document.documentElement.style.opacity = '0';
document.documentElement.style.background = '#07090D';
document.documentElement.style.backgroundColor = '#07090D';
document.body.style.background = '#07090D';
document.body.style.backgroundColor = '#07090D';
console.log(`[LAUNCH:R0] renderer bootstrap — opacity locked to 0 | t=+${performance.now().toFixed(0)}ms`);

console.log(`[LAUNCH:R1] createRoot dispatching | t=+${performance.now().toFixed(0)}ms`);
createRoot(document.getElementById("root")!).render(<App />);

// In non-Electron (website) mode there is no Splash handshake, so reveal immediately.
// In Electron mode, Splash.tsx manages the reveal after app:window-shown.
if (!(window as any).electronAPI) {
  document.documentElement.style.opacity = '1';
}
