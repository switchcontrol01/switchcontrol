/**
 * publisherIcons.ts — shared publisher→domain mapping and icon-service URLs.
 *
 * Used by StartupAppRow and ProcessManager to render real logos for known
 * publishers when the native shell.getFileIcon call returns null.
 *
 * Keep in sync with InstalledAppsPanel's PUBLISHER_DOMAINS as new publishers
 * are added; InstalledAppsPanel maintains its own copy so we don't risk
 * breaking a working component.
 */

const PUBLISHER_DOMAINS: Record<string, string> = {
  // Microsoft
  "microsoft": "microsoft.com",
  "microsoft corporation": "microsoft.com",

  // CPU / GPU / chipset
  "nvidia": "nvidia.com",
  "nvidia corporation": "nvidia.com",
  "amd": "amd.com",
  "advanced micro devices": "amd.com",
  "advanced micro devices inc": "amd.com",
  "advanced micro devices, inc": "amd.com",
  "advanced micro devices, inc.": "amd.com",
  "intel": "intel.com",
  "intel corporation": "intel.com",
  "qualcomm": "qualcomm.com",
  "qualcomm technologies": "qualcomm.com",

  // Motherboard / audio / peripherals
  "realtek": "realtek.com",
  "realtek semiconductor": "realtek.com",
  "realtek semiconductor corp": "realtek.com",
  "realtek semiconductor corp.": "realtek.com",
  "asus": "asus.com",
  "asustek computer inc": "asus.com",
  "gigabyte": "gigabyte.com",
  "gigabyte technology": "gigabyte.com",
  "msi": "msi.com",
  "micro-star international": "msi.com",
  "corsair": "corsair.com",
  "corsair memory inc": "corsair.com",
  "logitech": "logitech.com",
  "logitech inc": "logitech.com",
  "razer": "razer.com",
  "razer inc": "razer.com",
  "steelseries": "steelseries.com",
  "hyperx": "hyperx.com",
  "roccat": "roccat.com",
  "elgato": "elgato.com",
  "creative technology": "creative.com",
  "creative labs": "creative.com",
  "nzxt": "nzxt.com",

  // Gaming launchers
  "valve": "steampowered.com",
  "valve corporation": "steampowered.com",
  "epic games": "epicgames.com",
  "epic games inc": "epicgames.com",
  "epic": "epicgames.com",
  "gog.com": "gog.com",
  "ea": "ea.com",
  "electronic arts": "ea.com",
  "riot games": "riotgames.com",
  "blizzard": "battle.net",
  "blizzard entertainment": "battle.net",
  "activision": "activision.com",
  "ubisoft": "ubisoft.com",
  "rockstar": "rockstargames.com",
  "rockstar games": "rockstargames.com",
  "bethesda": "bethesda.net",
  "2k games": "2k.com",
  "cdprojekt": "cdprojektred.com",

  // Browsers
  "mozilla": "mozilla.org",
  "mozilla corporation": "mozilla.org",
  "mozilla foundation": "mozilla.org",
  "google": "google.com",
  "google llc": "google.com",
  "opera": "opera.com",
  "opera software": "opera.com",
  "brave software": "brave.com",

  // Communication / productivity
  "discord": "discord.com",
  "discord inc": "discord.com",
  "slack": "slack.com",
  "slack technologies": "slack.com",
  "zoom": "zoom.us",
  "zoom video communications": "zoom.us",
  "telegram": "telegram.org",
  "signal": "signal.org",
  "spotify": "spotify.com",
  "spotify ab": "spotify.com",
  "dropbox": "dropbox.com",
  "apple": "apple.com",
  "apple inc": "apple.com",

  // Cloud / storage
  "amazon": "amazon.com",
  "amazon.com": "amazon.com",
  "western digital": "westerndigital.com",
  "samsung": "samsung.com",
  "samsung electronics": "samsung.com",
  "seagate": "seagate.com",
  "seagate technology": "seagate.com",

  // Utilities
  "7-zip": "7-zip.org",
  "igor pavlov": "7-zip.org",
  "winrar": "rarlab.com",
  "rarlab": "rarlab.com",
  "teamviewer": "teamviewer.com",
  "anydesk": "anydesk.com",
  "malwarebytes": "malwarebytes.com",
  "obs project": "obsproject.com",
  "streamlabs": "streamlabs.com",
  "nvidia geforce": "nvidia.com",

  // OEM / display
  "hp": "hp.com",
  "hewlett-packard": "hp.com",
  "dell": "dell.com",
  "dell inc": "dell.com",
  "lenovo": "lenovo.com",
  "lg": "lg.com",
  "lg electronics": "lg.com",
  "acer": "acer.com",
  "sony": "sony.com",

  // Storage / RAM
  "kingston": "kingston.com",
  "kingston technology": "kingston.com",
  "kingston technology company": "kingston.com",
  "crucial": "crucial.com",
  "micron": "micron.com",
  "micron technology": "micron.com",
  "adata": "adata.com",
  "adata technology": "adata.com",
  "sk hynix": "skhynix.com",
  "sk hynix inc": "skhynix.com",
  "hynix": "skhynix.com",

  // Anti-cheat / security software
  "easy anti-cheat": "easy.ac",
  "easyanticheat": "easy.ac",
  "epic games (eac)": "easy.ac",
  "battleye innovations": "battleye.com",
  "battleye": "battleye.com",
  "vanguard": "playvalorant.com",

  // VPN
  "nordvpn": "nordvpn.com",
  "nord security": "nordvpn.com",
  "expressvpn": "expressvpn.com",
  "express vpn international": "expressvpn.com",
  "proton": "proton.me",
  "proton ag": "proton.me",
  "protonvpn": "proton.me",
  "wireguard": "wireguard.com",

  // Streaming / broadcast
  "vb-audio software": "vb-audio.com",
  "vb-audio": "vb-audio.com",
  "voicemeeter": "vb-audio.com",
  "xsplit": "xsplit.com",
  "splitmedialabs": "xsplit.com",
  "wirecast": "telestream.net",
  "telestream": "telestream.net",

  // Browsers (additional)
  "vivaldi technologies": "vivaldi.com",
  "vivaldi": "vivaldi.com",
  "tor project": "torproject.org",
  "the tor project": "torproject.org",
  "browser company": "arc.net",
  "the browser company": "arc.net",
};

// Known process-name → domain (for processes where publisher is absent/null)
const PROCESS_NAME_DOMAINS: Record<string, string> = {
  "firefox":              "mozilla.org",
  "chrome":               "google.com",
  "msedge":               "microsoft.com",
  "brave":                "brave.com",
  "opera":                "opera.com",
  "discord":              "discord.com",
  "steam":                "steampowered.com",
  "steamservice":         "steampowered.com",
  "epicgameslauncher":    "epicgames.com",
  "eosoverlayrenderer":   "epicgames.com",
  "spotify":              "spotify.com",
  "slack":                "slack.com",
  "zoom":                 "zoom.us",
  "teams":                "microsoft.com",
  "msteams":              "microsoft.com",
  "onedrive":             "microsoft.com",
  "nvcontainer":          "nvidia.com",
  "nvdisplay":            "nvidia.com",
  "amdrsservicex64":      "amd.com",
  "amdrssrcx64":          "amd.com",
  "amdnoiseai":           "amd.com",
  "radeoninstaller":      "amd.com",
  "cscoreutility":        "amd.com",
  "rivatuner":            "guru3d.com",
  "msiafterburner":       "msi.com",
  "corsair":              "corsair.com",
  "icue":                 "corsair.com",
  "ghub":                 "logitech.com",
  "lghub":                "logitech.com",
  "synapse":              "razer.com",
  "razernari":            "razer.com",
  "obs64":                "obsproject.com",
  "obs32":                "obsproject.com",
  "twitch":               "twitch.tv",
  "vivaldi":              "vivaldi.com",
  "tor":                  "torproject.org",
  "torbrowser":           "torproject.org",
  "arc":                  "arc.net",
  "easyanticheat":        "easy.ac",
  "battleye":             "battleye.com",
  "nordvpn":              "nordvpn.com",
  "expressvpn":           "expressvpn.com",
  "protonvpn":            "proton.me",
  "wireguard":            "wireguard.com",
  "voicemeeter":          "vb-audio.com",
  "voicemeeterpro":       "vb-audio.com",
  "voicemeeterremote64":  "vb-audio.com",
  "xsplit":               "xsplit.com",
  "xsplitbroadcaster":    "xsplit.com",
  "xsplitgamecaster":     "xsplit.com",
  "wirecast":             "telestream.net",
};

/**
 * Normalise a publisher string to a canonical domain suitable for icon lookup.
 * Returns null when no match can be found.
 */
export function publisherToDomain(publisher: string, name: string): string | null {
  const raw = (publisher || "")
    .toLowerCase()
    .replace(/[,.'"\u00ae\u2122]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (raw && PUBLISHER_DOMAINS[raw]) return PUBLISHER_DOMAINS[raw];

  // Strip common legal suffixes and retry
  const stripped = raw
    .replace(/\s+(inc|corp|llc|ltd|gmbh|co|bv|ag|sa|ab|plc|pty|srl|s\.a\.|s\.l\.)\.?\s*$/, "")
    .trim();
  if (stripped !== raw && stripped && PUBLISHER_DOMAINS[stripped]) return PUBLISHER_DOMAINS[stripped];

  // Check app name against publisher table (covers e.g. "Discord" → "discord.com")
  const nameLow = (name || "").toLowerCase();
  for (const [key, domain] of Object.entries(PUBLISHER_DOMAINS)) {
    if (key.length > 3 && nameLow.startsWith(key)) return domain;
  }

  return null;
}

/**
 * Derive a domain from a process name (no-extension, lowercase).
 * Used by Process Manager where publisher can be null for many entries.
 */
export function processNameToDomain(procName: string): string | null {
  const key = (procName || "").toLowerCase().replace(/\.exe$/i, "").trim();
  return PROCESS_NAME_DOMAINS[key] ?? null;
}

/**
 * Returns ordered list of image URLs to try for a given domain.
 * Clearbit → DuckDuckGo → FaviconKit (same cascade as InstalledAppsPanel).
 */
export function iconSrcsForDomain(domain: string): string[] {
  return [
    `https://logo.clearbit.com/${domain}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://api.faviconkit.com/${domain}/64`,
  ];
}
