export type DownloadReleaseConfig = {
  version: string;
  fileName: string;
  publicPath: string;
  platform: "windows";
  fileSizeMb?: number;
  releasedAt?: string;
};

export const INSTALLER_CONFIG: DownloadReleaseConfig = {
  version: "1.3.6",
  fileName: "SwitchControl Setup 1.3.6.exe",
  // Keep the storage provider private behind the Railway app route. Railway
  // redirects this path to the Cloudflare R2 object using its server secret.
  publicPath: "/downloads/SwitchControl%20Setup%201.3.6.exe",
  platform: "windows",
  fileSizeMb: 110,
  releasedAt: "2026-11-15",
};

export function installerUrl(source: string): string {
  return `${INSTALLER_CONFIG.publicPath}?source=${encodeURIComponent(source)}`;
}
