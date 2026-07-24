---
name: tsx esbuild platform fix
description: tsx ships an empty nested esbuild dir on Replit; need a CJS proxy each time node_modules is wiped
---

## The Rule
After any `rm -rf node_modules` + reinstall on Replit, the file
`node_modules/tsx/node_modules/esbuild/index.js` (and its `package.json`) must
be recreated as a proxy to the root `node_modules/esbuild/lib/main.js`.

Without it: `Error: Cannot find package '.../tsx/node_modules/esbuild/index.js'`
and the entire server refuses to start.

**Why:** tsx v4+ uses a nested esbuild directory for its ESM loader. On Replit
the directory exists but is empty (platform strips it). npm install does not
refill it because it considers the directory already "present".

**How to apply:** The `scripts/postinstall.js` script now handles this
automatically on every `npm install`. If node_modules is wiped and postinstall
fails, manually run:
```
mkdir -p node_modules/tsx/node_modules/esbuild
echo '{"name":"esbuild","version":"0.27.7","main":"index.js"}' > node_modules/tsx/node_modules/esbuild/package.json
echo 'module.exports = require("../../../esbuild/lib/main.js");' > node_modules/tsx/node_modules/esbuild/index.js
```

## Related: missing server runtime packages
`ws` and `systeminformation` were not in `package.json` originally. They are
now declared as direct dependencies. If node_modules is wiped and npm install
blocks them (ENOTEMPTY or firewall), use `npm pack <pkg>` in /tmp then `tar -xzf`
+ `cp -r package node_modules/<pkg>` to install manually.

## npm install on Replit quirks
- `cd electron && npm install` (postinstall) may block on `tar` package → wrapped
  in `scripts/postinstall.js` which catches the error and continues.
- ENOTEMPTY errors during `npm install` mean dirty node_modules; `rm -rf node_modules`
  then `npm install --legacy-peer-deps --no-audit --no-fund` resolves it.
- Run command: `node node_modules/tsx/dist/cli.mjs server/index.ts` (not `tsx server/index.ts` — tsx is not on PATH).
