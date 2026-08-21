#!/usr/bin/env node
/**
 * SwitchControl Static Audit Script
 *
 * Run: `npm run audit`
 *
 * Scans the project for the patterns documented in
 *   SwitchControl Full System Audit Checklist v1.0
 * that can be detected without executing the app.
 *
 * Rules implemented (R1..R8):
 *   R1  setInterval / setTimeout chains inside useEffect without a clearInterval/clearTimeout in cleanup
 *   R2  addEventListener inside useEffect without a matching removeEventListener in cleanup
 *   R3  IntersectionObserver / ResizeObserver / MutationObserver inside useEffect without disconnect()
 *   R4  requestAnimationFrame use in a file with no cancelAnimationFrame anywhere
 *   R5  setInterval with hard-coded period <= 1000ms (CPU-hot polling)
 *   R6  Polling intervals (setInterval anywhere in client/) without a document.hidden guard
 *       and not using useVisibilityInterval — flagged as warnings (manual review)
 *   R7  async useEffect setState-after-await with no `cancelled` flag, AbortController,
 *       or mountedRef in the same effect (race-condition / setState-on-unmount risk)
 *   R8  electron/main.js ipcMain.on/handle registrations declared inside a function
 *       (risk of stacking when window is recreated)
 *
 * Pattern detection is regex-based and conservative — it is intended to
 * SURFACE candidates for human review, not to replace one. False positives
 * happen; that is preferable to false negatives.
 *
 * Output: a coloured, grouped report with per-rule counts and file:line markers.
 * Exit code:
 *   0  no critical findings
 *   1  one or more critical findings (R1, R2, R3, R8 — leaks / stacking)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["client/src", "server", "electron"];
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".local", "attached_assets",
  "electron/dist-electron", "out",
]);
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const C = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  red:   "\x1b[31m",
  green: "\x1b[32m",
  yel:   "\x1b[33m",
  blue:  "\x1b[34m",
  mag:   "\x1b[35m",
  cyan:  "\x1b[36m",
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (color, s) => (useColor ? `${C[color]}${s}${C.reset}` : s);

// --------------------------------------------------------------------- walk

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(ROOT, full);
    if ([...SKIP_DIRS].some(s => rel === s || rel.startsWith(s + path.sep))) continue;
    if (ent.isDirectory()) walk(full, out);
    else if (SOURCE_EXTS.has(path.extname(ent.name))) out.push(full);
  }
}

// --------------------------------------------------------------- useEffect extraction
// Returns array of { startLine, endLine, body } for each useEffect(() => { ... }, [...])
// Uses brace counting from the opening `{` of the effect callback.
function extractUseEffectBlocks(src) {
  const blocks = [];
  const re = /\buseEffect\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const openIdx = src.indexOf("{", m.index + 9);
    if (openIdx < 0) continue;
    let depth = 1;
    let i = openIdx + 1;
    let inStr = null; // '"' | "'" | "`"
    let inLineComment = false;
    let inBlockComment = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      const next = src[i + 1];
      if (inLineComment) { if (ch === "\n") inLineComment = false; i++; continue; }
      if (inBlockComment) { if (ch === "*" && next === "/") { inBlockComment = false; i += 2; continue; } i++; continue; }
      if (inStr) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === inStr) inStr = null;
        i++; continue;
      }
      if (ch === "/" && next === "/") { inLineComment = true; i += 2; continue; }
      if (ch === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = src.slice(openIdx, i);
    const startLine = src.slice(0, openIdx).split("\n").length;
    const endLine = src.slice(0, i).split("\n").length;
    blocks.push({ startLine, endLine, body });
  }
  return blocks;
}

// Returns true if the effect body contains a `return () => { ... }` cleanup.
function hasCleanupReturn(body) {
  return /return\s*\(?\s*(?:async\s*)?\(?\s*\)?\s*=>/.test(body)
      || /return\s+function\s*\(/.test(body);
}

// --------------------------------------------------------------- findings
const findings = []; // { rule, severity, file, line, msg }
const add = (rule, severity, file, line, msg) =>
  findings.push({ rule, severity, file: path.relative(ROOT, file), line, msg });

// --------------------------------------------------------------- per-file scans
function scanFile(file, src) {
  const isClient = file.includes(path.sep + "client" + path.sep);
  const isElectron = file.includes(path.sep + "electron" + path.sep);
  const blocks = extractUseEffectBlocks(src);

  // R1, R2, R3, R7 — per useEffect block
  for (const b of blocks) {
    const cleanup = hasCleanupReturn(b.body);

    // R1 setInterval / setTimeout without clear*
    // setInterval: MUST have clearInterval regardless of cleanup return (intervals
    // never self-terminate). setTimeout: tolerate missing clear if a cleanup return
    // exists (often the timeout sets a one-shot state and unmount handles the rest).
    const intervalMatches = [...b.body.matchAll(/\bset(Interval|Timeout)\s*\(/g)];
    for (const m of intervalMatches) {
      const kind = m[1]; // Interval | Timeout
      const hasClear = new RegExp(`\\bclear${kind}\\s*\\(`).test(b.body);
      const flag = kind === "Interval" ? !hasClear : (!hasClear && !cleanup);
      if (flag) {
        const lineOffset = b.body.slice(0, m.index).split("\n").length - 1;
        const sev = kind === "Interval" ? "critical" : "high";
        const msg = kind === "Interval"
          ? `setInterval(...) inside useEffect without clearInterval — leaks until window closes`
          : `setTimeout(...) inside useEffect with no clearTimeout and no cleanup return`;
        add("R1", sev, file, b.startLine + lineOffset, msg);
      }
    }

    // R2 addEventListener without removeEventListener
    // Suppress { once: true } — those self-remove after firing once.
    const addEls = [...b.body.matchAll(/\.addEventListener\s*\(\s*['"`]([^'"`]+)['"`]([^)]*)\)/g)];
    for (const m of addEls) {
      const event = m[1];
      const args  = m[2] || "";
      if (/once\s*:\s*true/.test(args)) continue;
      const hasRemove = new RegExp(`\\.removeEventListener\\s*\\(\\s*['\"\`]${event}['\"\`]`).test(b.body);
      if (!hasRemove) {
        const lineOffset = b.body.slice(0, m.index).split("\n").length - 1;
        add("R2", "critical", file, b.startLine + lineOffset,
            `addEventListener("${event}", ...) inside useEffect without matching removeEventListener`);
      }
    }

    // R3 Observers without disconnect()
    const obsMatches = [...b.body.matchAll(/\bnew\s+(IntersectionObserver|ResizeObserver|MutationObserver|PerformanceObserver)\b/g)];
    for (const m of obsMatches) {
      const kind = m[1];
      const hasDisconnect = /\.disconnect\s*\(/.test(b.body);
      if (!hasDisconnect) {
        const lineOffset = b.body.slice(0, m.index).split("\n").length - 1;
        add("R3", "critical", file, b.startLine + lineOffset,
            `new ${kind}(...) inside useEffect without .disconnect() in cleanup`);
      }
    }

    // R7 setState-after-await without cancellation guard
    // Heuristic: effect body uses `await` and `setX(` afterwards, but has no
    // `cancelled`, `abort`, `signal.aborted`, or `mountedRef.current` token.
    if (/\bawait\b/.test(b.body) && /\bset[A-Z][\w$]*\s*\(/.test(b.body)) {
      const hasGuard = /\b(cancelled|isCancelled|aborted|signal\.aborted|mountedRef\.current|abortController)\b/.test(b.body);
      if (!hasGuard) {
        // Find first setState after first await
        const awaitIdx = b.body.search(/\bawait\b/);
        const afterAwait = b.body.slice(awaitIdx);
        const setMatch = afterAwait.match(/\bset[A-Z][\w$]*\s*\(/);
        if (setMatch) {
          const absIdx = awaitIdx + setMatch.index;
          const lineOffset = b.body.slice(0, absIdx).split("\n").length - 1;
          add("R7", "high", file, b.startLine + lineOffset,
              `setState called after await inside useEffect with no cancelled/abort/mounted guard`);
        }
      }
    }
  }

  // R4 requestAnimationFrame without cancelAnimationFrame in same file
  if (/\brequestAnimationFrame\s*\(/.test(src) && !/\bcancelAnimationFrame\s*\(/.test(src)) {
    const m = src.match(/\brequestAnimationFrame\s*\(/);
    const line = src.slice(0, m.index).split("\n").length;
    add("R4", "medium", file, line,
        `requestAnimationFrame used but cancelAnimationFrame never called in this file`);
  }

  // R5 fast setInterval (<= 1000ms)
  const fastIntervals = [...src.matchAll(/\bsetInterval\s*\([^,]+,\s*(\d+)\s*\)/g)];
  for (const m of fastIntervals) {
    const ms = parseInt(m[1], 10);
    if (ms > 0 && ms <= 1000) {
      const line = src.slice(0, m.index).split("\n").length;
      add("R5", ms <= 500 ? "high" : "medium", file, line,
          `setInterval period ${ms}ms — CPU-hot polling, ensure visibility-gated`);
    }
  }

  // R6 setInterval on client without document.hidden guard and not useVisibilityInterval
  if (isClient) {
    const intervals = [...src.matchAll(/\bsetInterval\s*\(/g)];
    if (intervals.length > 0
        && !/document\.hidden/.test(src)
        && !/useVisibilityInterval/.test(src)
        && !file.endsWith("intervalGuard.ts")
        && !file.endsWith("pollingRegistry.ts")
        && !file.endsWith("useVisibilityInterval.ts")) {
      const m = intervals[0];
      const line = src.slice(0, m.index).split("\n").length;
      add("R6", "low", file, line,
          `setInterval(s) present but no document.hidden / useVisibilityInterval — consider visibility gating`);
    }
  }

  // R8 ipcMain.on/handle inside a function body (electron/main.js stacking risk)
  if (isElectron && file.endsWith("main.js")) {
    const ipcMatches = [...src.matchAll(/\bipcMain\.(on|handle|once)\s*\(/g)];
    for (const m of ipcMatches) {
      if (m[1] === "once") continue; // once is stacking-safe
      const pre = src.slice(0, m.index);
      // Find enclosing function declaration name (if any) by walking backwards
      let depth = 0;
      let enclosingFnName = null;
      for (let i = pre.length - 1; i >= 0; i--) {
        const ch = pre[i];
        if (ch === "}") depth++;
        else if (ch === "{") {
          if (depth === 0) {
            const lookback = pre.slice(Math.max(0, i - 200), i);
            const fnDecl = lookback.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*$/);
            const arrowAssign = lookback.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*$/);
            if (fnDecl) enclosingFnName = fnDecl[1];
            else if (arrowAssign) enclosingFnName = arrowAssign[1];
            break;
          }
          depth--;
        }
      }
      // Suppress if the enclosing function is invoked at most once anywhere
      // in this file (e.g. registerCriticalIPC() called once at startup).
      // Strip // and /* */ comments before counting so doc/comment refs don't inflate.
      const srcStripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      if (enclosingFnName) {
        const callRe = new RegExp(`\\b${enclosingFnName}\\s*\\(`, "g");
        const callCount = (srcStripped.match(callRe) || []).length - 1; // -1 for the definition itself
        if (callCount <= 1) continue;
      } else {
        // Not inside a named function — likely top-level inside an IIFE/whenReady. Skip.
        continue;
      }
      const line = pre.split("\n").length;
      const finalCount = (srcStripped.match(new RegExp(`\\b${enclosingFnName}\\s*\\(`, "g")) || []).length - 1;
      add("R8", "critical", file, line,
          `ipcMain.${m[1]}(...) declared inside ${enclosingFnName}() (called ${finalCount}× in file) — may stack listeners on repeat call`);
    }
  }
}

// --------------------------------------------------------------- run

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

  const t0 = Date.now();
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
    scanFile(f, src);
  }
  const ms = Date.now() - t0;

  // ----- report
  const byRule = {};
  for (const f of findings) (byRule[f.rule] ||= []).push(f);
  const RULES = [
    ["R1", "setInterval/setTimeout in useEffect missing cleanup"],
    ["R2", "addEventListener in useEffect missing removeEventListener"],
    ["R3", "Observer in useEffect missing .disconnect()"],
    ["R4", "requestAnimationFrame without cancelAnimationFrame in file"],
    ["R5", "setInterval period <= 1000ms (CPU-hot polling)"],
    ["R6", "setInterval without document.hidden / useVisibilityInterval gate"],
    ["R7", "setState after await in useEffect without cancellation guard"],
    ["R8", "ipcMain.on/handle inside a function (stacking risk)"],
  ];

  console.log(c("bold", "\nSwitchControl Static Audit Report"));
  console.log(c("dim", `Scanned ${files.length} source files in ${ms}ms`));
  console.log(c("dim", "─".repeat(72)));

  let totalCritical = 0, totalHigh = 0, totalMedium = 0, totalLow = 0;
  for (const [rule, label] of RULES) {
    const list = byRule[rule] || [];
    if (list.length === 0) {
      console.log(`${c("green", "✓")} ${c("bold", rule)} ${label} ${c("dim", "(0)")}`);
      continue;
    }
    const crit = list.filter(x => x.severity === "critical").length;
    const high = list.filter(x => x.severity === "high").length;
    const med  = list.filter(x => x.severity === "medium").length;
    const low  = list.filter(x => x.severity === "low").length;
    totalCritical += crit; totalHigh += high; totalMedium += med; totalLow += low;

    const sevColor = crit > 0 ? "red" : high > 0 ? "yel" : med > 0 ? "mag" : "blue";
    const mark = crit > 0 ? "✗" : high > 0 ? "!" : "•";
    console.log(`${c(sevColor, mark)} ${c("bold", rule)} ${label} ${c("dim", `(${list.length})`)}`);
    for (const f of list.slice(0, 20)) {
      const sev = f.severity.toUpperCase().padEnd(8);
      const sc = f.severity === "critical" ? "red" : f.severity === "high" ? "yel" : f.severity === "medium" ? "mag" : "blue";
      console.log(`    ${c(sc, sev)} ${c("cyan", f.file + ":" + f.line)}  ${c("dim", f.msg)}`);
    }
    if (list.length > 20) console.log(c("dim", `    ... ${list.length - 20} more`));
  }

  console.log(c("dim", "─".repeat(72)));
  const summary = [
    `${c("red",  "critical: " + totalCritical)}`,
    `${c("yel",  "high: "     + totalHigh)}`,
    `${c("mag",  "medium: "   + totalMedium)}`,
    `${c("blue", "low: "      + totalLow)}`,
  ].join("  ");
  console.log(c("bold", "Summary: ") + summary);
  console.log("");

  // JSON sidecar for tooling
  const outPath = path.join(ROOT, "audit-report.json");
  fs.writeFileSync(outPath, JSON.stringify({
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    durationMs: ms,
    totals: { critical: totalCritical, high: totalHigh, medium: totalMedium, low: totalLow },
    findings,
  }, null, 2));
  console.log(c("dim", `JSON report written to ${path.relative(ROOT, outPath)}`));

  process.exit(totalCritical > 0 ? 1 : 0);
}

main();
