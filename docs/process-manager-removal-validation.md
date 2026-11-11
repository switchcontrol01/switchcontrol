# Process Manager removal validation

## Build measurements

Measured on 2026-11-11 with Node 20.20.0, the same installed dependencies,
Vite configuration, and `npm run build` before and after removal. The baseline
included the workspace's existing unrelated dashboard changes; those files were
not changed for this removal.

Sizes below sum emitted `.js` files under each renderer's `assets/` directory.
Gzip totals compress each file separately using Node's default `gzipSync`.
They exclude CSS, images, native binaries, and installer compression.

| Output | Before (bytes) | After (bytes) | Reduction (bytes) |
| --- | ---: | ---: | ---: |
| Web JavaScript | 5,516,778 | 5,491,024 | 25,754 |
| Web JavaScript, gzip | 1,538,609 | 1,530,964 | 7,645 |
| Electron renderer JavaScript | 5,507,258 | 5,481,909 | 25,349 |
| Electron renderer JavaScript, gzip | 1,535,503 | 1,528,012 | 7,491 |
| Server bundle | 2,489,621 | 2,489,133 | 488 |

Each renderer now has 50 JavaScript files instead of 51. The removed
`page-ProcessManager` chunk measured 20,151 bytes (6,165 gzip) for web and
19,407 bytes (5,894 gzip) for Electron. Changes to Advisor and catalogs also
contribute to the totals, so the removed page size is not the total reduction.

Reproduce post-removal measurements with:

```sh
npm run build
node script/measure-build.cjs
```

These are build-size measurements only. Startup time, runtime RAM, and native
process overhead were not benchmarked. The removed native engine had already
been lazy-loaded; Electron's remaining desktop routes still load eagerly.

## Passed checks

- Production web, Electron renderer, and bundled server builds.
- `cd electron && npm run prebuild && npm run package:check`, with real icon,
  native-bin directory, renderer, and backend prerequisites present.
- The package check inspects generated renderer filenames/content and backend
  content for retired modules, bridge calls, and active feature claims.
- 145 available Node regression tests:

  ```sh
  node --import tsx --test $(find electron/test -name '*.test.cjs' \
    ! -name 'first-run-animation-runtime.test.cjs' -print)
  ```

- New regressions cover deleted files and imports, fallback routing contracts,
  old-URL prefetch, actual persisted sidebar migration, a runtime preload
  bridge check, legacy Advisor context/chat destinations, all supported locale
  catalogs and FAQ claims, and preservation of count telemetry, Startup and icons.
- A browser screenshot of `/process-manager` rendered the existing public
  landing-page fallback rather than an empty window.
- `git diff --check`.

## Validation limits

- The full `node --import tsx --test electron/test/*.test.cjs` command could not
  load the unrelated first-run animation runtime suite because `happy-dom` is
  not installed. All other suites passed; no dependency was added for this removal.
- No Windows build/runtime environment was available. A newly installed Windows
  package still needs verification of launch, old hash-URL fallback, dashboard
  counts/responsiveness, Startup actions/icons, and Advisor without process-control
  traffic. No Windows processes or stored user process-change records were modified.
- Signed-in desktop screens and live AI-provider responses were not browser-tested.
  Pure Advisor context serialization, retired-link filtering, and preload bridge
  behavior were tested without bypassing authentication or calling an AI provider.
- No release was published and no production deployment was made.
