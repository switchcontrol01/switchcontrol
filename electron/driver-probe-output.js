'use strict';

/**
 * Extracts the Driver Intelligence probe payload from PowerShell stdout.
 *
 * Windows PowerShell may write warnings or host text to stdout before the
 * payload, so the probe emits a single `SCDRV:` marker line. Plain JSON output
 * from older probe builds is still accepted. Only string values are kept.
 */
function parseDriverProbeOutput(raw) {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const marked = [...lines].reverse().find((line) => line.startsWith('SCDRV:'));
  const candidate = marked ? marked.slice('SCDRV:'.length) : text.trim();
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, data: {} };
    }
    const data = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) data[key] = value.trim();
    }
    return { ok: true, data };
  } catch {
    return { ok: false, data: {} };
  }
}

module.exports = { parseDriverProbeOutput };
