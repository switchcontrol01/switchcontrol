# SwitchControl - Gaming Optimization Dashboard

A premium gaming optimization dashboard with a cyberpunk aesthetic. 

---

## Hosting

SwitchControl is hosted on **Railway**, and Railway is the only PostgreSQL provider for this project. Replit is a development workspace/editor only; never use Replit's managed database or host production there. Use Railway's private `DATABASE_URL` from services running inside Railway and its public `DATABASE_PUBLIC_URL` from external tools or workspaces. Both point to the Railway database. Never put connection strings in tracked files or Markdown.

---

## Windows Desktop App Setup

### Prerequisites

1. **Node.js LTS** (v20 or newer) - Download from [nodejs.org](https://nodejs.org/)
2. **Visual Studio Code** - Download from [code.visualstudio.com](https://code.visualstudio.com/)
3. **Git** (optional) - For version control

### Step 1: Download the Project

1. In Replit, click the three dots menu (⋮) → **Download as ZIP**
2. Extract the ZIP to a folder, e.g., `C:\Projects\SwitchControl`

### Step 2: Open in VS Code

1. Open Visual Studio Code
2. Click **File → Open Folder**
3. Select your extracted `SwitchControl` folder
4. Open the integrated terminal: **Terminal → New Terminal** (or `Ctrl+``)

### Step 3: Run Setup Script

```bash
node scripts/setup-electron.js
```

This updates `package.json` with the Electron configuration and scripts.

### Step 4: Install Dependencies

```bash
npm ci
```

This will install all required packages including Electron.

### Step 5: Run in Development Mode

**Option A: Web Version Only**
```bash
npm run dev
```
Then open http://localhost:5000 in your browser.

**Option B: Desktop App (Electron)**
```bash
npm run electron:dev
```
This starts both the web server and opens the Electron desktop window.

### Step 6: App Icon (Already Included)

The Windows icon is already included in the `build/` folder:
- `build/icon.ico` - Windows installer icon
- `build/icon.png` - App icon

### Step 7: Build Windows Installer

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; do not continue to the installer step." }

npm run electron:build
if ($LASTEXITCODE -ne 0) { throw "Installer build failed." }
```

**Output location:** `release/SwitchControl-Setup-1.0.0.exe`

This creates:
- Windows installer (.exe)
- Desktop shortcut
- Start menu shortcut
- Auto-registered deep link protocol (`switchcontrol://`)

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start web development server |
| `npm run dev:web` | Start Vite dev server only |
| `npm run dev:server` | Start Express server only |
| `npm run electron:dev` | Start desktop app in dev mode |
| `npm run build` | Build web version for production |
| `npm run electron:build` | Build Windows installer (.exe) |

---

## Project Structure

```
SwitchControl/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   └── lib/            # Utilities
│   └── index.html
├── server/                 # Express backend
│   ├── index.ts
│   └── routes.ts
├── electron/               # Desktop app wrapper
│   ├── main.js             # Main process
│   └── preload.js          # Secure IPC bridge
├── build/                  # App icons
│   └── icon.ico            # Windows icon
├── shared/                 # Shared types/schemas
└── electron/package.json   # Authoritative Electron installer config
```

---

## Desktop App Features

### Current (Phase 1)
- Full dashboard UI in desktop window
- OAuth login support (Google, Discord)
- Deep linking for auth callbacks
- GPU acceleration enabled
- Smooth animations

### Prepared for Future (Phase 2)
The `preload.js` exposes a secure `switchControl` API ready for:
- Real system tweaks
- Startup app management
- Network optimization
- RAM clearing
- Debloat actions

All future features will be safe, reversible, and require explicit user action.

---

## Troubleshooting

### "npm run electron:dev" shows blank screen
- Make sure the web server started first (check terminal for "serving on port 5000")
- Try refreshing with `Ctrl+R` in the Electron window

### Build fails on Windows
- Ensure you have admin rights
- Run `npm cache clean --force` and try again
- Check that `build/icon.ico` exists

### OAuth redirect doesn't work in desktop
- The deep link protocol is registered during install
- For dev mode, OAuth will open in default browser

### Missing icon
- The icon is already included in `build/icon.ico`
- If you need to replace it, put your new `icon.ico` in the `build/` folder

---

## App Icon

The app icon is already configured in `build/icon.ico`. To use a custom icon:

1. Create a 256x256 PNG of your logo
2. Convert to .ico format at [icoconvert.com](https://icoconvert.com/)
3. Replace `build/icon.ico`
4. Run `npm run electron:build` to rebuild the installer

---

## Environment Variables

Keep database connection strings in environment variables, not in source control or Markdown. `DATABASE_URL` is the private Railway endpoint for the Railway-hosted app; `DATABASE_PUBLIC_URL` is the public Railway endpoint for external tools and workspaces.

The current server reads `RAILWAY_DATABASE_URL` first and then `DATABASE_URL`; it does not read `DATABASE_PUBLIC_URL` directly. For the app running outside Railway, set `RAILWAY_DATABASE_URL` to the public Railway endpoint until the runtime selector is updated.

For local development, create a `.env` file:

```env
DATABASE_URL=your_railway_private_postgres_connection_string
RAILWAY_DATABASE_URL=your_railway_public_postgres_connection_string
SESSION_SECRET=your_session_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
STRIPE_SECRET_KEY=your_stripe_key
```

---

## Support

- Website: [switchcontrol.org](https://switchcontrol.org)
- Discord: [Join our community](https://discord.com/invite/szJxKbXCJv)
- Email: switchcontrol67@gmail.com

---

## License

MIT License - See LICENSE file for details.
