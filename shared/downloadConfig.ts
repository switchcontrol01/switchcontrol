export type DownloadReleaseConfig = {
  version: string;
  fileName: string;
  publicPath: string;
  platform: "windows";
  fileSizeMb?: number;
  releasedAt?: string;
};

export const INSTALLER_CONFIG: DownloadReleaseConfig = {
  version: "1.0.8",
  fileName: "SwitchControl Setup 1.0.8.exe",
  publicPath: "https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev/SwitchControl%20Setup%201.0.8.exe",
  platform: "windows",
  fileSizeMb: 350,
  releasedAt: "2026-05-14",
};

export function installerUrl(source: string): string {
  return `${INSTALLER_CONFIG.publicPath}?source=${encodeURIComponent(source)}`;
}
