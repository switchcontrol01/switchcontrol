/**
 * update-helpers.ts
 *
 * Shared formatting utilities for update UI components.
 * Used by UpdateCard, UpdateBanner, and any future update-related views.
 */

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSpeed(bps: number): string {
  if (!bps) return '0 KB/s';
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}
