/**
 * Electron uses eager desktop routes because the packaged renderer loads from
 * file://. Prefetching is therefore unnecessary and must not create dynamic
 * imports that Rollup tries to analyze alongside the eager page imports.
 */
export function preloadDesktopRoute(_path: string): Promise<void> {
  return Promise.resolve();
}

export function preloadAllDesktopRoutes(): Promise<void> {
  return Promise.resolve();
}