/**
 * Compatibility entry point for older build overrides.
 *
 * Electron now uses the demand-loaded route map too. Keeping this module as a
 * re-export prevents a stale alias or downstream build override from silently
 * regressing to an eager/no-prefetch route implementation.
 */
export {
  loadDesktopRoute,
  preloadDesktopRoute,
  preloadAllDesktopRoutes,
} from "./route-prefetch";