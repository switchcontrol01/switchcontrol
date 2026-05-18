/**
 * electronAuth.ts
 * Single source of truth for packaged-Electron detection and auth-domain routing.
 * No imports from our own code — safe to import anywhere without circular risk.
 */

/** True when running inside a packaged (file://) Electron build. */
export const isPackagedElectron: boolean =
  typeof window !== 'undefined' &&
  !!(window as any).electronAPI?.isElectron &&
  window.location.protocol === 'file:';

/** True when running inside any Electron context (packaged or dev-over-HTTP). */
export const isElectronEnv: boolean =
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

/**
 * Auth domain prefix.
 * - Packaged Electron: absolute cloud URL (file:// cannot hit same-origin).
 * - Everything else (web, dev Electron via HTTP): empty → same-origin so local
 *   JWT secrets and admin grants work correctly in development.
 */
export const AUTH_DOMAIN: string = isPackagedElectron ? 'https://switchcontrol.org' : '';

/**
 * Clears auth cookies in the Electron shell (explicit sign-out only).
 * No-op if the preload doesn't expose the API.
 */
export async function clearElectronAuthCookies(): Promise<void> {
  if (typeof window === 'undefined') return;
  const api = (window as any).electronAPI;
  if (api?.clearAuthCookies) {
    try {
      await api.clearAuthCookies();
    } catch {
      // Non-fatal — cookies expire naturally
    }
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.log(
    `[ElectronAuth] packaged=${isPackagedElectron} electron=${isElectronEnv} ` +
    `domain="${AUTH_DOMAIN || '(same-origin)'}"`,
  );
}
