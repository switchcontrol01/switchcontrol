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

  // Gaming launchers & game publishers
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
  "roblox": "roblox.com",
  "roblox corporation": "roblox.com",

  // Peripheral / audio accessories
  "fifine": "fifine-audio.com",
  "fifine technology": "fifine-audio.com",
  "fifine technologies": "fifine-audio.com",

  // Screen recorders / capture
  "screenrec": "screenrec.com",
  "digital media solutions": "screenrec.com",

  // Browsers
  "mozilla": "mozilla.org",
  "mozilla corporation": "mozilla.org",
  "mozilla foundation": "mozilla.org",
  "google": "google.com",
  "google llc": "google.com",
  "opera": "opera.com",
  "opera software": "opera.com",
  "brave software": "brave.com",

  // Dev tools / runtimes
  "node.js foundation": "nodejs.org",
  "openjs foundation": "nodejs.org",
  "the qt company": "qt.io",
  "the qt company ltd": "qt.io",
  "qt company": "qt.io",

  // SwitchControl itself
  "switchtech": "switchcontrol.org",

  // Open source / community
  "translucenttb open source developers": "github.com",
  "translucenttb": "github.com",

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

// Known process-name → domain (for processes where publisher is absent/null).
// Keys are lowercase, no .exe extension, no spaces (normalised in processNameToDomain).
const PROCESS_NAME_DOMAINS: Record<string, string> = {
  // Browsers — use the product domain (firefox.com, not mozilla.org) so
  // Clearbit returns the correct product logo rather than the foundation logo.
  "firefox":              "firefox.com",
  "firefox-bin":          "firefox.com",
  "chrome":               "google.com",
  "chromium":             "chromium.org",
  "msedge":               "microsoft.com",
  "microsoftedge":        "microsoft.com",
  "brave":                "brave.com",
  "opera":                "opera.com",
  "vivaldi":              "vivaldi.com",
  "tor":                  "torproject.org",
  "torbrowser":           "torproject.org",
  "arc":                  "arc.net",

  // Communication
  "discord":              "discord.com",
  "slack":                "slack.com",
  "zoom":                 "zoom.us",
  "teams":                "microsoft.com",
  "msteams":              "microsoft.com",
  "telegram":             "telegram.org",
  "signal":               "signal.org",

  // Microsoft system processes
  "onedrive":             "microsoft.com",
  "microsoftedgeupdate":  "microsoft.com",
  "msedgewebview2":       "microsoft.com",
  "mscorsvw":             "microsoft.com",
  "officeclicktorun":     "microsoft.com",
  "winstore.app":         "microsoft.com",
  "windowsterminal":      "microsoft.com",
  "powershell":           "microsoft.com",
  "pwsh":                 "microsoft.com",

  // SwitchControl (the app itself — publisher "SwitchTech")
  "switchcontrol":        "switchcontrol.org",

  // Elgato / Stream Deck
  "streamdeck":           "elgato.com",
  "elgato streamdeck":    "elgato.com",
  "elgatostreamdeck":     "elgato.com",
  "elgatocontrolcenter":  "elgato.com",

  // Dev tools / runtimes
  "node":                 "nodejs.org",
  "nodejs":               "nodejs.org",
  "node.js":              "nodejs.org",
  "python":               "python.org",
  "python3":              "python.org",
  "code":                 "code.visualstudio.com",  // VS Code
  "cursor":               "cursor.sh",
  "git":                  "git-scm.com",
  "gitgui":               "git-scm.com",

  // Qt / CEF (embedded renderers)
  "qtwebengineprocess":   "qt.io",
  "qwebengineprocess":    "qt.io",

  // Open source / utilities
  "translucenttb":        "github.com",
  "everything":           "voidtools.com",
  "powertoys":            "microsoft.com",
  "autohotkey":           "autohotkey.com",
  "ahk":                  "autohotkey.com",
  "7zfm":                 "7-zip.org",
  "7zg":                  "7-zip.org",
  "winrar":               "rarlab.com",

  // Elgato Wave / Capture card control
  "waveplugin":           "elgato.com",
  "wavelinkservice":      "elgato.com",

  // Gaming launchers
  "steam":                "steampowered.com",
  "steamservice":         "steampowered.com",
  "epicgameslauncher":    "epicgames.com",
  "eosoverlayrenderer":   "epicgames.com",
  "twitch":               "twitch.tv",

  // NVIDIA
  "nvcontainer":          "nvidia.com",
  "nvdisplay":            "nvidia.com",
  "nvcplui":              "nvidia.com",
  "nvtelemetrycontainer": "nvidia.com",

  // AMD
  "amdrsservicex64":      "amd.com",
  "amdrssrcx64":          "amd.com",
  "amdnoiseai":           "amd.com",
  "amdnoisesuppression":  "amd.com",  // AMD Noise Suppression (startup entry name often IS the exe)
  "amdnoisesuppressionfx":"amd.com",
  "radeoninstaller":      "amd.com",
  "cscoreutility":        "amd.com",
  "amdupdater":           "amd.com",
  "amdcleanuputility":    "amd.com",

  // Realtek
  "rkauduservice":        "realtek.com",  // Realtek audio user-mode service
  "rkaudioservice":       "realtek.com",
  "rtkaudiosvc":          "realtek.com",
  "rtkaudsvc":            "realtek.com",
  "realtekhd":            "realtek.com",
  "rtwlanu":              "realtek.com",

  // Roblox
  "robloxplayer":         "roblox.com",
  "robloxplayerbeta":     "roblox.com",
  "robloxlauncher":       "roblox.com",
  "robloxcrashhandler":   "roblox.com",

  // Peripherals / audio accessories
  "fifinecontroldeck":    "fifine-audio.com",
  "fifinehub":            "fifine-audio.com",

  // Screen capture / recording
  "screenrec":            "screenrec.com",

  // Monitoring & utilities
  "rivatuner":            "guru3d.com",
  "msiafterburner":       "msi.com",
  "hwinfo64":             "hwinfo.com",
  "hwmonitor":            "cpuid.com",
  "cpuid":                "cpuid.com",

  // Corsair / Logitech / Razer peripherals
  "corsair":              "corsair.com",
  "icue":                 "corsair.com",
  "ghub":                 "logitech.com",
  "lghub":                "logitech.com",
  "synapse":              "razer.com",
  "razernari":            "razer.com",

  // Audio / streaming
  "obs64":                "obsproject.com",
  "obs32":                "obsproject.com",
  "voicemeeter":          "vb-audio.com",
  "voicemeeterpro":       "vb-audio.com",
  "voicemeeterremote64":  "vb-audio.com",
  "xsplit":               "xsplit.com",
  "xsplitbroadcaster":    "xsplit.com",
  "xsplitgamecaster":     "xsplit.com",
  "wirecast":             "telestream.net",

  // Media
  "spotify":              "spotify.com",

  // VPN
  "nordvpn":              "nordvpn.com",
  "expressvpn":           "expressvpn.com",
  "protonvpn":            "proton.me",
  "wireguard":            "wireguard.com",

  // Security / anti-cheat
  "easyanticheat":        "easy.ac",
  "battleye":             "battleye.com",

  // Games — use the game domain so the game logo shows, not the launcher/publisher logo
  "fortniteclient":                    "fortnite.com",
  "fortniteclient-win64-shipping":     "fortnite.com",
  "fortniteclient-win64-shipping_eac": "fortnite.com",

  // ── Windows / Microsoft scheduled tasks & services ──────────────────────────
  // All of these ship with Windows or Microsoft products; map to microsoft.com
  // so the Microsoft logo shows rather than a generic glyph.
  //
  // MDM / device management
  "mdmdiagnosticscleanup":             "microsoft.com",
  "mdmcorreenrollment":                "microsoft.com",
  "mdmdiagnostics":                    "microsoft.com",
  // Device join / AAD
  "automatic-device-join":             "microsoft.com",
  "automaticdevicejoin":               "microsoft.com",
  "deviceenroll":                      "microsoft.com",
  // Storage Sense
  "spaceagenttask":                    "microsoft.com",
  "spacemanagertask":                  "microsoft.com",
  // Windows Update / servicing
  "runonreboot":                       "microsoft.com",
  "retry":                             "microsoft.com",
  "pre-staged app cleanup":            "microsoft.com",
  "pre-stagedappcleanup":              "microsoft.com",
  "queuereporting":                    "microsoft.com",
  "recovery-check":                    "microsoft.com",
  "recoverycheck":                     "microsoft.com",
  // Login / auth
  "logincheck":                        "microsoft.com",
  "verifiedpublishercertstorecheck":   "microsoft.com",
  // Licensing / IMDS
  "license validation":                "microsoft.com",
  "licensevalidation":                 "microsoft.com",
  "licenseimdsintegration":            "microsoft.com",
  // DirectX / DXGI
  "directxdatabaseupdater":            "microsoft.com",
  "dxgiadaptercache":                  "microsoft.com",
  // Networking
  "ucpd velocity":                     "microsoft.com",
  "ucpdvelocity":                      "microsoft.com",
  "proxy":                             "microsoft.com",
  // Misc Windows tasks
  "spaceagent":                        "microsoft.com",
  "spacemanager":                      "microsoft.com",
  "diskfootprint":                     "microsoft.com",
  "diskdiagnostic":                    "microsoft.com",
  "diskcleanup":                       "microsoft.com",
  "maintenancewdagent":                "microsoft.com",
  "wdagentcleanup":                    "microsoft.com",
  "windowsupdateagent":                "microsoft.com",
  "scheduleddefrag":                   "microsoft.com",
  "silentcleanup":                     "microsoft.com",
  "wosc":                              "microsoft.com",
  "wuappx":                            "microsoft.com",
  "nettrace":                          "microsoft.com",
  "tcpipautotunning":                  "microsoft.com",
  "backgroundtransferhost":            "microsoft.com",
  "backgroundtaskhost":                "microsoft.com",
  "winsat":                            "microsoft.com",
  "defrag":                            "microsoft.com",
  "chkdsk":                            "microsoft.com",
  "srtasks":                           "microsoft.com",
  "tpm-maintenance":                   "microsoft.com",
  "tpmmaintenance":                    "microsoft.com",
  "usoclient":                         "microsoft.com",
  "musnotification":                   "microsoft.com",
  "musnotificationux":                 "microsoft.com",
  "gathernetworkinfo":                 "microsoft.com",
  "microsoftedgeupdatetaskmachinecore": "microsoft.com",
  "microsoftedgeupdatetaskmachinua":   "microsoft.com",
  "edgeupdatetaskmachinecore":         "microsoft.com",
  "edgeupdatetaskmachinua":            "microsoft.com",
  "nvtmreponsible":                    "nvidia.com",
  "nvdisplay.container":               "nvidia.com",
  "nvcontainer":                       "nvidia.com",

  // ── Third-party startup/registry entries (REGISTRY HKCU / task-scheduler) ───
  // These have "Unverified Publisher" so publisher-domain lookup fails;
  // process-name lookup is the only path to a correct logo.
  "volume controller sd plugin": "elgato.com",    // Stream Deck volume plugin
  "volumecontrollersdplugin":    "elgato.com",
  "fifinecontroldeck":           "fifine-audio.com",
  "fifine control deck":         "fifine-audio.com",
  "robloxplayerbeta":            "roblox.com",
  "startdvr":                    "microsoft.com",  // Windows Game DVR
  "startcn":                     "tencent.com",    // Honor of Kings / Tencent launcher
  "monitoring":                  "microsoft.com",  // Windows task
  "logon":                       "microsoft.com",  // Windows task
  "equalizerapoupdatechecker":   "github.com",     // EqualizerAPO (open source)
  "equalizerapo":                "github.com",
  "modifylinkupdate":            "microsoft.com",  // typically a Windows store update task
  "aimemoryboost":               "microsoft.com",  // Windows memory management task
  "forcetimer":                  "github.com",     // Force Timer Resolution (open source)
  "force timer resolution":      "github.com",
  "volumecontrol":               "elgato.com",
  // Logon / auth tasks
  "aadplugjoin":                 "microsoft.com",
  "aadregistrationservice":      "microsoft.com",
  "entraplugjoin":               "microsoft.com",
  // Windows Defender tasks
  "windowsdefenderscheduledsc":  "microsoft.com",
  "mpidleworker":                "microsoft.com",
  "mpcrashhandlerexe":           "microsoft.com",

  // ── AMD tasks / services ─────────────────────────────────────────────────────
  "amdnoisesuppression":               "amd.com",
  "amdupdater":                        "amd.com",
  "amdrsservicemanager":               "amd.com",
  "amdrsservice":                      "amd.com",
  "amdsettings":                       "amd.com",
  "cnext":                             "amd.com",
  "amdcpbsyssvc":                      "amd.com",
  "amdlogs":                           "amd.com",

  // ── Realtek tasks / services ─────────────────────────────────────────────────
  "rkauduservice":                     "realtek.com",
  "rkauduservice64":                   "realtek.com",
  "rtkauduservice":                    "realtek.com",
  "rtkauduservice64":                  "realtek.com",
  "rtkaudioservice64":                 "realtek.com",
  "rtkaudiouniversalservice":          "realtek.com",
  "rtkaudio":                          "realtek.com",
};

/**
 * Normalise a publisher string to a canonical domain suitable for icon lookup.
 * Returns null when no match can be found.
 */
export function publisherToDomain(publisher: string, name: string): string | null {
  // Product-name exact match takes priority over publisher so product-specific
  // logos always win — e.g. "firefox" → firefox.com (not mozilla.org),
  // "fortniteclient-win64-shipping" → fortnite.com (not epicgames.com).
  const nameKey0 = (name || "").toLowerCase().replace(/\.exe$/i, "").trim();
  if (nameKey0 && PROCESS_NAME_DOMAINS[nameKey0]) return PROCESS_NAME_DOMAINS[nameKey0];

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

  const nameLow = (name || "").toLowerCase();

  // Handle Squirrel installer names: "com.squirrel.AppName.AppName"
  // Extract the app segment and look it up in both tables.
  const squirrelMatch = nameLow.match(/^com\.squirrel\.(\w+)\.(\w+)$/);
  if (squirrelMatch) {
    const appSeg = squirrelMatch[2]; // e.g. "teams"
    const pubSeg = squirrelMatch[1]; // e.g. "Teams"
    for (const seg of [appSeg, pubSeg]) {
      if (PROCESS_NAME_DOMAINS[seg]) return PROCESS_NAME_DOMAINS[seg];
      if (PUBLISHER_DOMAINS[seg])    return PUBLISHER_DOMAINS[seg];
    }
  }

  // Check app name against publisher table (prefix match).
  // Use >= 3 so 3-char keys like "amd", "msi", "hp", "obs" are included.
  // Previously > 3 was used, which silently skipped them.
  for (const [key, domain] of Object.entries(PUBLISHER_DOMAINS)) {
    if (key.length >= 3 && nameLow.startsWith(key)) return domain;
  }

  // Fallback: match the name (stripped to alphanumeric, no spaces) against
  // PROCESS_NAME_DOMAINS.  Startup entry names are often the exe basename
  // (e.g. "AMDNoiseSuppression", "RkAudUService") so this catches cases where
  // there is no publisher string at all.
  const nameKey = nameLow.replace(/\s+/g, "").replace(/\.exe$/i, "");
  if (nameKey.length >= 3 && PROCESS_NAME_DOMAINS[nameKey]) return PROCESS_NAME_DOMAINS[nameKey];

  // Last-resort: try each PROCESS_NAME_DOMAINS key as a prefix of the normalised name
  for (const [key, domain] of Object.entries(PROCESS_NAME_DOMAINS)) {
    if (key.length >= 4 && nameKey.startsWith(key)) return domain;
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

// ── Per-domain icon source overrides ─────────────────────────────────────────
// Clearbit indexes by *company* domain, not *product* domain.  For apps whose
// product URL differs from their company URL, the Clearbit lookup fails and we
// fall through to a low-res DuckDuckGo favicon.  This map provides a custom
// ordered URL list so each well-known product shows its real branded icon.
const DOMAIN_SRC_OVERRIDES: Record<string, string[]> = {
  // Firefox: clearbit has no entry for firefox.com (product) → use Google's
  // high-quality favicon service, then DDG, then FaviconKit
  "firefox.com": [
    `https://www.google.com/s2/favicons?sz=128&domain=firefox.com`,
    `https://icons.duckduckgo.com/ip3/firefox.com.ico`,
    `https://api.faviconkit.com/firefox.com/64`,
  ],
  // Fortnite: clearbit sometimes misses fortnite.com → hit Google first
  "fortnite.com": [
    `https://logo.clearbit.com/fortnite.com`,
    `https://www.google.com/s2/favicons?sz=128&domain=fortnite.com`,
    `https://icons.duckduckgo.com/ip3/fortnite.com.ico`,
  ],
  // Chromium project → Google favicon is cleaner than clearbit
  "chromium.org": [
    `https://www.google.com/s2/favicons?sz=128&domain=chromium.org`,
    `https://logo.clearbit.com/chromium.org`,
    `https://icons.duckduckgo.com/ip3/chromium.org.ico`,
  ],
};

/**
 * Returns ordered list of image URLs to try for a given domain.
 * Per-domain overrides → Clearbit → Google S2 favicon → DuckDuckGo → FaviconKit.
 * Google's S2 service is used as a mid-tier fallback because it provides
 * higher-resolution icons (sz=128) than DuckDuckGo's ICO service.
 */
export function iconSrcsForDomain(domain: string): string[] {
  if (DOMAIN_SRC_OVERRIDES[domain]) return DOMAIN_SRC_OVERRIDES[domain];
  return [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://api.faviconkit.com/${domain}/64`,
  ];
}
