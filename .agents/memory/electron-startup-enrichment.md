---
name: Electron startup spec enrichment
description: How cachedSpecs is populated at boot — disk cache, WMI paths, psLimiter gating, and two-stage enrichment to avoid AMD hangs and PS saturation.
---

## The rule

On every launch, `loadSystemSpecs()` checks `specs-cache.json` before spawning any WMI/si process. Most users never run a WMI call at boot.

**Why:** The original enrichment fired si.graphics() + si.fsSize() + si.cpu() + WMI all in parallel at startup, racing with batchCheckAll and syncAll. AMD users waited 3-4s for si.graphics() to time out on every single boot.

## Disk cache (specs-cache.json)

- **Location:** `SPECS_CACHE_FILE` from `user-data-paths.js` → `%APPDATA%\SwitchControl\specs-cache.json`
- **Serve instantly (<4h):** return `cachedSpecs` from file, no enrichment
- **Background refresh (4h–24h):** serve file, fire `_enrichSpecsInBackground()` silently only on the 15th launch
- **Ignore (>24h):** discard file, run full fresh enrichment (handles GPU swaps, Windows Update)
- RAM fields are always refreshed from `os.totalmem()/os.freemem()` (change each boot)
- Written at end of enrichment Stage 2 (`_saveSpecsToDisk`)

## Two-stage enrichment

**Stage 1 (immediate):** WMI `Win32_VideoController` via psLimiter → GPU model + VRAM → patch `cachedSpecs`, push `specs:enriched` IPC to renderer.

**Stage 2 (deferred 3s):** `si.cpu()` + `si.fsSize()` — delayed to let batchCheckAll/syncAll PS calls finish first. Updates CPU physicalCores/speed + disk widget data. Saves disk cache.

## si.graphics() removal

`si.graphics()` is **not called** from `_enrichSpecsInBackground()`. WMI `Win32_VideoController` returns both Name and AdapterRAM — covers everything the enrichment needed.

In `startTelemetryPolling()`, si.graphics() is only called if the GPU vendor is **NOT AMD** (vendor determined from WMI fast-path). AMD = skip DXGI call entirely.

## psLimiter coverage

Both startup PS calls now go through psLimiter:
- `startTelemetryPolling:wmiGpu` — the WMI fast-path name lookup
- `_enrichSpecsInBackground:gpu` — the enrichment WMI Name+AdapterRAM lookup

If the limiter is full (6 concurrent slots), enrichment falls back to `wmiGpuModelName` (set by fast-path) rather than silently returning empty.

## How to apply

- Any change that adds a new WMI/PS call to the startup path MUST acquire a psLimiter slot.
- Any new field added to `cachedSpecs` must also be added to `_saveSpecsToDisk()` so it persists to disk.
- Do NOT call `si.graphics()` in enrichment or any startup path — use WMI instead.
