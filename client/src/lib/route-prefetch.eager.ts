/**
 * Electron desktop pages are bundled eagerly so file:// navigation never waits
 * on a route chunk. Sidebar prefetch calls remain harmless no-ops.
 */
export function preloadDesktopRoute(_path: string): Promise<void> {
  return Promise.resolve();
}

export function preloadAllDesktopRoutes(): Promise<void> {
  return Promise.resolve();
}