/**
 * Namespace-targeted localStorage cleanup.
 *
 * NEVER call localStorage.clear() — it wipes unrelated browser/app state that
 * shares the same storage origin (other tabs, Electron webview context, etc.).
 *
 * All SwitchControl keys follow one of two conventions:
 *   1. Prefixed  — starts with "sc_"              (vast majority)
 *   2. Unprefixed — legacy names listed in SC_LEGACY_KEYS
 *
 * sessionStorage is intentionally NOT cleared here: SwitchControl never writes
 * to sessionStorage, so clearing it would only harm any other code that does.
 */

const SC_LEGACY_KEYS: readonly string[] = [
  'switchcontrol-powerplan',
  'extreme-labs-unlocked',
];

/**
 * Remove every SwitchControl-owned key from localStorage.
 * Safe to call even if the storage is already empty.
 */
export function clearSwitchControlStorage(): void {
  const toDelete: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('sc_') || (SC_LEGACY_KEYS as string[]).includes(key)) {
      toDelete.push(key);
    }
  }

  for (const key of toDelete) {
    localStorage.removeItem(key);
  }
}
