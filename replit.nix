{pkgs}: {
  deps = [
    pkgs.libunwind
    pkgs.wineWowPackages.stable
    pkgs.chromium
    pkgs.python3
  ];
}
