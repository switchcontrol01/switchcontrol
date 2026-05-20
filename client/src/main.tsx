import { createRoot } from "react-dom/client";
import "./lib/api"; // must be first — installs global fetch interceptor for Electron
import { installIntervalGuard } from "./lib/intervalGuard";
import App from "./App";
// Local font bundles — served from the JS bundle, zero network dependency.
// Inter and JetBrains Mono load instantly in Electron (no Google Fonts request).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
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

// ── Dark-lock before React mounts ────────────────────────────────────────────
// Belt-and-suspenders: index.html already sets opacity:0 and background:#07090D
// on <html> as inline attributes, but we re-assert here in case HMR or any
// module side-effect has overwritten them before this script runs.
// This MUST run synchronously before createRoot so the very first React paint
// is already behind a dark, fully-opaque root layer.
const _isElectron = !!(window as any).electronAPI;

// In Electron mode, the inline <script> in index.html has already set opacity=1
// and sc-electron-no-cover (removes body::before).  The Splash will be visible
// immediately when show() fires.  We do NOT touch opacity here.
// In website mode, we keep the dark lock until React mounts, then reveal.
if (!_isElectron) {
  document.documentElement.style.opacity = '0';
  document.documentElement.style.background = '#07090D';
  document.documentElement.style.backgroundColor = '#07090D';
  document.body.style.background = '#07090D';
  document.body.style.backgroundColor = '#07090D';
}
console.log(`[LAUNCH:R0] renderer bootstrap | electron=${_isElectron} | t=+${performance.now().toFixed(0)}ms`);

// Remove the static #boot-shell (rendered by the HTML parser before any JS)
// as soon as React has committed its first frame.  The 200ms fade lets the
// dark splash content appear underneath so the transition is invisible.
requestAnimationFrame(() => {
  const shell = document.getElementById('boot-shell');
  if (!shell) return;
  shell.style.transition = 'opacity 200ms ease';
  shell.style.opacity = '0';
  setTimeout(() => { try { shell.remove(); } catch {} }, 210);
});

console.log(`[LAUNCH:R1] createRoot dispatching | t=+${performance.now().toFixed(0)}ms`);
createRoot(document.getElementById("root")!).render(<App />);

if (!_isElectron) {
  document.documentElement.style.opacity = '1';
}
