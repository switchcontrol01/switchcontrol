/**
 * Pure parsers for official driver release sources.
 *
 * Kept free of database/network imports so they can be unit-tested against
 * captured vendor responses. Every parser either returns a release that was
 * explicitly labelled by the vendor or throws — it never guesses from stray
 * numbers elsewhere on the page.
 */

export interface ParsedRelease {
  latest: string;
  releaseDate?: string;
  releaseNotes?: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function compareNumericVersions(a: string, b: string): number {
  const pa = a.split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** "Wed Nov 04, 2026" → "2026-11-04" */
function parseNvidiaDate(value: string | undefined): string | undefined {
  const m = value?.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  return month ? `${m[3]}-${month}-${m[2].padStart(2, "0")}` : undefined;
}

/** "11/04/2026 00:00:00" → "2026-11-04" */
function parseUsDate(value: string | undefined): string | undefined {
  const m = value?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : undefined;
}

/**
 * NVIDIA's official driver lookup service (the same service used by
 * nvidia.com/Download). Picks the newest non-beta WHQL Game Ready release.
 */
export function parseNvidiaLookup(json: unknown): ParsedRelease {
  const ids = (json as { IDS?: Array<{ downloadInfo?: Record<string, string> }> })?.IDS;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("NVIDIA lookup returned no driver records");
  }
  const releases = ids
    .map((item) => item.downloadInfo)
    .filter(
      (info): info is Record<string, string> =>
        !!info && /^\d{3}\.\d{2,3}$/.test(info.Version ?? "") && info.IsBeta !== "1",
    );
  if (releases.length === 0) throw new Error("NVIDIA lookup returned no stable WHQL release");
  releases.sort((a, b) => compareNumericVersions(b.Version, a.Version));
  const newest = releases[0];
  const name = decodeURIComponent(newest.Name ?? "GeForce Game Ready Driver");
  const releaseDate = parseNvidiaDate(newest.ReleaseDateTime);
  return {
    latest: newest.Version,
    releaseDate,
    releaseNotes: `${name} ${newest.Version} (WHQL)${releaseDate ? `, released ${releaseDate}` : ""}. Full notes are on NVIDIA's official driver page.`,
  };
}

/**
 * AMD's official Radeon driver download page. Each package is rendered as
 * "Revision Number Adrenalin 26.10.2 WHQL (Optional) … Release Date 2026-10-30".
 */
export function parseAmdAdrenalinPage(html: string): ParsedRelease {
  const text = htmlToText(html);
  const pattern =
    /Revision Number\s+Adrenalin\s+(\d{2}\.\d{1,2}\.\d{1,2})\s*(WHQL)?\s*(?:\((Recommended|Optional)\))?.{0,120}?Release Date\s+(\d{4}-\d{2}-\d{2})/gi;
  const releases = new Map<string, { date: string; channel?: string }>();
  for (const m of Array.from(text.matchAll(pattern))) {
    releases.set(m[1], { date: m[4], channel: m[3] });
  }
  if (releases.size === 0) throw new Error("AMD Adrenalin revision not found on official page");
  const newest = Array.from(releases.keys()).sort((a, b) => compareNumericVersions(b, a))[0];
  const info = releases.get(newest)!;
  const recommended = Array.from(releases.entries()).find(([, r]) => r.channel === "Recommended")?.[0];
  return {
    latest: newest,
    releaseDate: info.date,
    releaseNotes:
      `AMD Software: Adrenalin Edition ${newest}${info.channel ? ` (${info.channel})` : ""}, released ${info.date}.` +
      (recommended && recommended !== newest ? ` AMD's current Recommended release is ${recommended}.` : ""),
  };
}

/**
 * AMD's official chipset driver page:
 * "Chipset Drivers Revision Number 8.09.28.1124 … Release Date 2026-10-21".
 */
export function parseAmdChipsetPage(html: string): ParsedRelease {
  const text = htmlToText(html);
  const m = text.match(
    /Chipset Drivers\s+Revision Number\s+(\d+\.\d+\.\d+\.\d+).{0,120}?Release Date\s+(\d{4}-\d{2}-\d{2})/i,
  );
  if (!m) throw new Error("AMD chipset revision not found on official page");
  return {
    latest: m[1],
    releaseDate: m[2],
    releaseNotes: `AMD Chipset Drivers ${m[1]}, released ${m[2]}.`,
  };
}

/**
 * Intel Download Center pages expose the selected (latest) release in
 * <meta name="DownloadVersion"> and its date in <meta name="LastUpdate">.
 */
export function parseIntelDownloadPage(html: string, label: string): ParsedRelease {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${name}"`, "i"))?.[1];
  const raw = meta("DownloadVersion");
  const version = raw?.match(/\d+(?:\.\d+)+/)?.[0];
  if (!version) throw new Error(`${label} version not found in Intel DownloadVersion metadata`);
  const releaseDate = parseUsDate(meta("LastUpdate"));
  return {
    latest: version,
    releaseDate,
    releaseNotes: `${label} ${version}${releaseDate ? `, released ${releaseDate}` : ""}.`,
  };
}
