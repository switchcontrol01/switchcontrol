# Debloater status evidence

The Debloater has one native source of truth for curated Windows items:

1. `server/routes/debloater.ts` owns the catalog definition and sends only the
   canonical identity (package name, registry path/name, service name, or
   scheduled-task paths) to Electron.
2. `electron/debloat-contract.cjs` validates that identity and normalizes the
   PowerShell result into exactly `present`, `absent`, or `unknown`.
3. `electron/debloat-helper.js` runs the native query. Missing targets are
   `absent`; a query error, timeout, inaccessible target, empty response, or
   malformed response is `unknown`. It logs the canonical target and the
   normalized state without logging user profile data.
4. The remove handler classifies the command output, then performs the same
   native query again. `already-absent` is returned only when the command
   explicitly reported a no-op and the post-query state is `absent`. Any
   inconclusive post-query is `verification-inconclusive`.
5. The renderer (`client/src/pages/Debloater.tsx`) normalizes scan states,
   removes only confirmed `absent` items from the actionable set, and displays
   native evidence on result rows. The server persists the result only when
   the Electron response contains `ok`, `verified`, and the expected native
   state.

`electron/test/debloat-regressions.test.cjs` covers the pure normalizer,
canonical identity checks, scalar/array PowerShell shapes, missing targets,
query errors, malformed output, stale baselines, and server result
normalization. Those tests run on Linux but are not Windows evidence.

## Real Windows validation

Run the evidence script below from an elevated PowerShell prompt on a Windows
machine. It checks one AppX package, one registry value, one service, and the
scheduled-task group. Each record includes the raw native query outcome, a
second independent Windows command, and a yes/no/unknown conclusion. The
script does not mutate the machine.

```powershell
.\electron\test\debloat-windows-validation.ps1 -OutputPath .\debloat-windows-evidence.json
```

The generated evidence file is intentionally local: it may contain the
machine's installed-state details and must not be committed or uploaded.