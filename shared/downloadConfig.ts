export type DownloadReleaseConfig = {
  version: string;
  fileName: string;
  publicPath: string;
  platform: "windows";
  fileSizeMb?: number;
  releasedAt?: string;
};

export const INSTALLER_CONFIG: DownloadReleaseConfig = {
  version: "1.0.0",
  fileName: "SwitchControl-Setup.exe",
  publicPath: "/downloads/SwitchControl-Setup.exe",
  platform: "windows",
  fileSizeMb: 350,
  releasedAt: "2025-04-20",
};

export function installerUrl(source: string): string {
  return `${INSTALLER_CONFIG.publicPath}?source=${encodeURIComponent(source)}`;
}
