const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const configStore = require('./config-store');
const fileLogger = require('./file-logger');

// Convenience: log to console (which mirrors to the main startup log file)
// AND append to the dedicated backend.log so we can see the child stream
// separately from the main process log.
function blog(...args) {
  const line = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
    return String(a);
  }).join(' ');
  console.log('[Backend]', line);
  try { fileLogger.appendBackend(line); } catch (e) {}
}
function berr(...args) {
  const line = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
    return String(a);
  }).join(' ');
  console.error('[Backend]', line);
  try { fileLogger.appendBackend('ERROR ' + line); } catch (e) {}
}

const TRACKED_KEYS = ['OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

let backendProcess = null;
let backendReady = false;
let backendPort = null;
let lastError = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function waitForBackend(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let attempt = 0;
    let lastFailure = 'no attempts yet';

    function check() {
      attempt++;
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        const msg = `Backend health check timed out after ${timeoutMs}ms (${attempt} attempts). Last failure: ${lastFailure}`;
        berr(msg);
        return reject(new Error(msg));
      }

      const retryDelay = attempt <= 5 ? 50 : attempt <= 15 ? 150 : 300;
      const url = `http://127.0.0.1:${port}/api/health`;

      const req = http.get(url, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.status === 'ok') {
                blog(`Health check PASSED — attempt ${attempt}, ${Date.now() - start}ms elapsed, body=${body}`);
                return resolve(true);
              }
              lastFailure = `HTTP 200 but status not ok: ${body}`;
            } catch (e) {
              lastFailure = `HTTP 200 but body parse error: ${e.message}`;
            }
          } else {
            lastFailure = `HTTP ${res.statusCode} body=${body.substring(0, 200)}`;
          }
          fileLogger.appendBackend(`HEALTH attempt=${attempt} elapsed=${elapsed}ms FAIL ${lastFailure}`);
          setTimeout(check, retryDelay);
        });
      });

      req.on('error', (err) => {
        lastFailure = `${err.code || 'ERR'} ${err.message}`;
        fileLogger.appendBackend(`HEALTH attempt=${attempt} elapsed=${elapsed}ms ERR ${lastFailure}`);
        setTimeout(check, retryDelay);
      });

      req.on('timeout', () => {
        lastFailure = 'request timeout (2000ms)';
        fileLogger.appendBackend(`HEALTH attempt=${attempt} elapsed=${elapsed}ms TIMEOUT`);
        req.destroy();
        setTimeout(check, retryDelay);
      });
    }

    check();
  });
}

async function startBackend(app) {
  if (backendProcess) {
    console.log('[Backend] Already running, pid:', backendProcess.pid);
    return { port: backendPort, ready: backendReady };
  }

  console.log('[Backend] ===== STARTUP DIAGNOSTICS =====');
  console.log('[Backend] process.execPath:', process.execPath);
  console.log('[Backend] process.resourcesPath:', process.resourcesPath);
  console.log('[Backend] app.isPackaged:', app.isPackaged);
  console.log('[Backend] app.getAppPath():', app.getAppPath());

  const indexPath = path.join(process.resourcesPath, 'dist', 'index.cjs');
  console.log('[Backend] Expected bundle path:', indexPath);

  if (!fs.existsSync(indexPath)) {
    const error = `Backend bundle not found at: ${indexPath}`;
    console.error('[Backend] FATAL:', error);

    const distDir = path.join(process.resourcesPath, 'dist');
    if (fs.existsSync(distDir)) {
      console.error('[Backend] Contents of dist/:', fs.readdirSync(distDir).join(', '));
    } else {
      console.error('[Backend] dist/ directory does not exist in resources');
    }

    lastError = error;
    return { port: null, ready: false, error };
  }

  const stat = fs.statSync(indexPath);
  console.log('[Backend] Bundle size:', (stat.size / 1024 / 1024).toFixed(1) + ' MB');

  try {
    const port = await findFreePort();
    backendPort = port;
    console.log('[Backend] Free port found:', port);

    let userDataPath = '';
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      console.warn('[Backend] Could not get userData path:', e.message);
    }

    const configSecrets = configStore.readConfig();

    console.log('[Backend] ELECTRON_USER_DATA:', userDataPath || '(not set)');
    console.log('[Backend] ===== ENV KEY DIAGNOSTICS =====');
    for (const k of TRACKED_KEYS) {
      const inParent = !!process.env[k];
      const inConfig = !!(configSecrets[k]);
      console.log(`[Backend]   ${k}: parent_env=${inParent} | config_file=${inConfig} | will_use=${inParent || inConfig}`);
    }
    console.log('[Backend] =====================================');

    const env = {
      ...process.env,
      ...configSecrets,
      NODE_ENV: 'production',
      PORT: String(port),
      ELECTRON_BACKEND: '1',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_USER_DATA: userDataPath,
    };

    console.log('[Backend] ===== CHILD ENV KEY DIAGNOSTICS =====');
    for (const k of TRACKED_KEYS) {
      console.log(`[Backend]   child_env ${k}: ${!!env[k]}`);
    }
    console.log('[Backend] AI_MODEL in child env:', env.AI_MODEL || '(not set, will use gpt-4o-mini)');
    console.log('[Backend] DATABASE_URL in child env:', env.DATABASE_URL ? `YES (${env.DATABASE_URL.substring(0, 30)}...)` : 'NO — Electron offline mode (expected; cloud DB unreachable from user machine)');
    console.log('[Backend] ELECTRON_BACKEND in child env:', env.ELECTRON_BACKEND || '(not set)');
    console.log('[Backend] ==========================================');

    // Explicitly strip DATABASE_URL when running as Electron backend.
    // The Replit PostgreSQL server is unreachable from the user's machine —
    // if this key leaks in (e.g. via a system env var or sc-config.json),
    // the server would try to open PG connections and hang.
    if (env.DATABASE_URL) {
      console.warn('[Backend] WARNING: DATABASE_URL found in child env — stripping it for Electron mode');
      delete env.DATABASE_URL;
    }

    console.log('[Backend] Spawning child process...');
    console.log('[Backend]   execPath:', process.execPath);
    console.log('[Backend]   script:', indexPath);
    console.log('[Backend]   ELECTRON_RUN_AS_NODE: 1 (runs as plain Node.js)');
    console.log('[Backend]   PORT:', port);
    console.log('[Backend]   cwd:', path.dirname(indexPath));

    backendProcess = spawn(process.execPath, [indexPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(indexPath),
      windowsHide: true,
    });

    if (!backendProcess.pid) {
      const error = 'spawn() returned process with no PID — child failed to start';
      console.error('[Backend] FATAL:', error);
      lastError = error;
      backendProcess = null;
      return { port: null, ready: false, error };
    }

    console.log('[Backend] Child process spawned, PID:', backendProcess.pid);

    backendProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        console.log('[Backend:stdout]', line);
        try { fileLogger.appendBackend('STDOUT ' + line); } catch (e) {}
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        console.error('[Backend:stderr]', line);
        try { fileLogger.appendBackend('STDERR ' + line); } catch (e) {}
      }
    });

    backendProcess.on('exit', (code, signal) => {
      blog(`Child process EXITED — code=${code} signal=${signal}`);
      if (code !== 0 && code !== null) {
        lastError = `Backend process crashed with exit code ${code}`;
        berr(lastError);
      }
      backendProcess = null;
      backendReady = false;
    });

    backendProcess.on('error', (err) => {
      lastError = `Backend process error: ${err.message}`;
      berr(lastError);
      backendProcess = null;
      backendReady = false;
    });

    console.log('[Backend] Polling health endpoint: http://127.0.0.1:' + port + '/api/health');
    await waitForBackend(port, 40000);
    backendReady = true;
    lastError = null;

    console.log('[Backend] ===== BACKEND READY =====');
    console.log('[Backend] PID:', backendProcess?.pid);
    console.log('[Backend] Port:', port);
    console.log('[Backend] Ready: true');
    console.log('[Backend] getBackendPort() will return:', port);
    console.log('[Backend] isBackendReady() will return: true');
    console.log('[Backend] ========================');

    return { port, ready: true };

  } catch (err) {
    lastError = err.message;
    console.error('[Backend] ===== STARTUP FAILED =====');
    console.error('[Backend] Error:', err.message);
    if (backendProcess) {
      console.error('[Backend] Killing child process PID:', backendProcess.pid);
      try { backendProcess.kill('SIGTERM'); } catch {}
      backendProcess = null;
    }
    backendPort = null;
    console.error('[Backend] getBackendPort() will return: null');
    console.error('[Backend] isBackendReady() will return: false');
    console.error('[Backend] ========================');
    return { port: null, ready: false, error: err.message };
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('[Backend] Stopping backend process PID:', backendProcess.pid);
    try {
      backendProcess.kill('SIGTERM');
    } catch (e) {
      console.warn('[Backend] SIGTERM failed:', e.message);
    }
    setTimeout(() => {
      if (backendProcess) {
        try {
          backendProcess.kill('SIGKILL');
        } catch {}
        backendProcess = null;
      }
    }, 3000);
    backendReady = false;
  }
}

function isBackendReady() {
  return backendReady;
}

function getBackendPort() {
  return backendReady ? backendPort : null;
}

function getLastError() {
  return lastError;
}

module.exports = {
  startBackend,
  stopBackend,
  isBackendReady,
  getBackendPort,
  getLastError,
};
