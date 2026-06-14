---
name: Ownership store batch writes
description: Pattern for batching N ownership-store writes into 1 disk flush during parallel revert loops.
---

# Ownership Store Batch Write Pattern

## The Rule
The premium-revert-pipeline calls `recordRevert()` for each item inside a `Promise.all`. Without batching this causes N atomic disk writes (one per reverted tweak).

**Why:** Each `recordRevert()` calls `saveOwnership()` which does a full atomic `writeFileSync → renameSync` cycle. With 10 tweaks to revert, that's 10 disk writes in parallel.

## How to Apply
`ownership-store.js` exports `beginBatch()` / `endBatch()`:
```js
ownershipStore.beginBatch();
await Promise.all(items.map(item => revertItem(item))); // each calls recordRevert
ownershipStore.endBatch(); // single atomic flush here
```
- `beginBatch()`: sets `_batchMode = true` — saveOwnership skips disk write
- `endBatch()`: sets `_batchMode = false` + calls `saveOwnership(_cache)` once
- In-memory cache stays consistent throughout; only the disk write is deferred

**Power plan reverts (Phase 2)** run sequentially after `endBatch()` — they write individually, which is correct (strict ordering required).
