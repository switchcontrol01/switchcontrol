# SwitchControl Electron App - Build Instructions

## Quick Start (Windows)

1. **Download and extract the ZIP**

2. **Install dependencies for the web app** (from root folder):
   ```bash
   npm install
   ```

3. **Build the web app**:
   ```bash
   npm run build
   ```

4. **Install Electron dependencies** (from electron folder):
   ```bash
   cd electron
   npm install
   ```

5. **Run in development mode**:
   ```bash
   npm start
   ```

6. **Build the Windows installer**:
   ```bash
   npm run dist:win
   ```
   The installer will be in `electron/dist/`

## Project Structure

```
electron/
├── main.js          # Electron main process
├── preload.js       # Preload script (IPC bridge)
├── executors/       # Tweak execution logic
│   └── tweaks.js    # Tier A-C tweak implementations
├── bin/             # Native binaries (LibreHardwareMonitor)
├── sensors-helper/  # Hardware sensor integration
└── package.json     # Electron dependencies & build config
```

## Environment Variables

For OAuth authentication, set these in the web server:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET`

## Deep Links

The app registers the `switchcontrol://` protocol for OAuth callbacks.

## Admin Privileges

Tier B tweaks require admin rights. The app will prompt for elevation when needed.
