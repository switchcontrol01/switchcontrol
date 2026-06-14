import { createRoot } from "react-dom/client";
import "./lib/api"; // must be first — installs global fetch interceptor for Electron
import { installIntervalGuard } from "./lib/intervalGuard";
import App from "./App";
// Font CSS imports are in index.css — Vite's CSS pipeline resolves @import
// from node_modules correctly on all platforms (Windows included).
// Importing them here as JS caused Rollup to fail resolution on Windows
// when the Vite root is set to the client/ subdirectory.
import "./index.css";

// Install the 2000ms minimum interval guard before any component code runs.
// This must happen synchronously before createRoot so every subsequent
// setInterval call in any component or hook goes through the guard.
installIntervalGuard();

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

const _isElectron = !!(window as any).electronAPI;

// In website mode, hold the dark lock until React mounts, then reveal.
if (!_isElectron) {
  document.documentElement.style.opacity = '0';
  document.documentElement.style.background = '#070b14';
  document.documentElement.style.backgroundColor = '#070b14';
  document.body.style.background = '#070b14';
  document.body.style.backgroundColor = '#070b14';
}
console.log(`[LAUNCH:R0] renderer bootstrap | electron=${_isElectron} | t=+${performance.now().toFixed(0)}ms`);

console.log(`[LAUNCH:R1] createRoot dispatching | t=+${performance.now().toFixed(0)}ms`);
createRoot(document.getElementById("root")!).render(<App />);

// Remove the static #boot-shell AFTER React has committed its first painted frame.
// Double-rAF: first rAF = layout, second rAF = first paint committed.
// Removing before first paint would expose a blank/white frame.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const shell = document.getElementById('boot-shell');
    if (shell) {
      shell.style.transition = 'opacity 0.15s ease-out';
      shell.style.opacity = '0';
      setTimeout(() => { try { shell.remove(); } catch {} }, 160);
    }
  });
});

if (!_isElectron) {
  document.documentElement.style.opacity = '1';
}
