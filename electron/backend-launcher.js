const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const configStore = require('./config-store');
const fileLogger = require('./file-logger');

// Lazy reference so we don't form a require cycle on load
let _cl = null;
function cl() {
  if (!_cl) { try { _cl = require('./critical-logger'); } catch (e) {} }
  return _cl;
}

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

const TRACKED_KEYS = ['OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET', 'SESSION_SECRET'];

// Only these keys are forwarded from sc-config.json into the child env.
// Spreading the entire config object would silently pass unknown/stale keys
// (e.g. from a manually edited config or a previous version) to the child.
const CONFIG_ENV_ALLOWLIST = new Set(TRACKED_KEYS);

// Cached once at module load — require('./package.json') is synchronous and
// re-running it on every startBackend() call is wasteful.
const _appVersion = (() => { try { return require('./package.json').version; } catch { return undefined; } })();

let backendProcess = null;
let backendReady = false;
let backendPort = null;
let lastError = null;
let _sigkillTimer = null; // cleared on clean exit so double-stop doesn't stack timers

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
      // If the process already exited, stop polling immediately rather than
      // burning the remaining timeout window against a dead port.
      if (backendProcess === null) {
        const msg = `Backend process exited during health check (attempt ${attempt}, ${Date.now() - start}ms elapsed). Last failure: ${lastFailure}`;
        berr(msg);
        return reject(new Error(msg));
      }

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
    try { cl()?.writeCritical({ category: 'startup_failure', severity: 'fatal', source: 'backend-launcher', message: error }); } catch (e) {}
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

    const _configRaw = configStore.readConfig();
    // Only forward keys that are on the explicit allowlist — never spread the
    // entire config object, which may contain stale or unexpected keys.
    const configSecrets = Object.fromEntries(
      Object.entries(_configRaw).filter(([k]) => CONFIG_ENV_ALLOWLIST.has(k))
    );

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
      ...(_appVersion ? { npm_package_version: _appVersion } : {}),
    };

    // Strip DATABASE_URL BEFORE diagnostic logging — the Replit PostgreSQL
    // server is unreachable from the user's machine and the URL contains
    // credentials that must not appear in log files, even partially.
    if (env.DATABASE_URL) {
      console.warn('[Backend] WARNING: DATABASE_URL found in child env — stripping it for Electron mode');
      delete env.DATABASE_URL;
    }

    console.log('[Backend] ===== CHILD ENV KEY DIAGNOSTICS =====');
    for (const k of TRACKED_KEYS) {
      console.log(`[Backend]   child_env ${k}: ${!!env[k]}`);
    }
    console.log('[Backend] AI_MODEL in child env:', env.AI_MODEL || '(not set, will use gpt-4o-mini)');
    console.log('[Backend] DATABASE_URL in child env: NO (stripped for Electron mode)');
    console.log('[Backend] ELECTRON_BACKEND in child env:', env.ELECTRON_BACKEND || '(not set)');
    console.log('[Backend] ==========================================');

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
      try { cl()?.writeCritical({ category: 'startup_failure', severity: 'fatal', source: 'backend-launcher', message: error }); } catch (e) {}
      return { port: null, ready: false, error };
    }

    console.log('[Backend] Child process spawned, PID:', backendProcess.pid);

    backendProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        console.log('[Backend:stdout]', line);
        try { fileLogger.appendBackend('STDOUT ' + line); } catch (e) {}
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        console.error('[Backend:stderr]', line);
        try { fileLogger.appendBackend('STDERR ' + line); } catch (e) {}
      }
    });

    backendProcess.on('exit', (code, signal) => {
      blog(`Child process EXITED — code=${code} signal=${signal}`);
      // Clear the SIGKILL watchdog — process exited cleanly so there's
      // nothing to force-kill and we don't want stacked timers on double-stop.
      if (_sigkillTimer) { clearTimeout(_sigkillTimer); _sigkillTimer = null; }
      if (code !== 0 && code !== null) {
        lastError = `Backend process crashed with exit code ${code}`;
        berr(lastError);
        try { cl()?.writeCritical({ category: 'backend_failure', severity: 'error', source: 'backend-launcher', message: lastError }); } catch (e) {}
      }
      backendProcess = null;
      backendReady = false;
    });

    backendProcess.on('error', (err) => {
      lastError = `Backend process error: ${err.message}`;
      berr(lastError);
      backendProcess = null;
      backendReady = false;
      try { cl()?.writeCritical({ category: 'backend_failure', severity: 'error', source: 'backend-launcher', message: lastError, stack: err.stack }); } catch (e) {}
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
    try { cl()?.writeCritical({ category: 'startup_failure', severity: 'fatal', source: 'backend-launcher', message: err.message, stack: err.stack }); } catch (e) {}
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
    // Store the timer so the exit handler can cancel it on clean exit,
    // preventing stacked SIGKILL timeouts if stopBackend is called twice
    // (e.g. from both before-quit and will-quit handlers in main.js).
    _sigkillTimer = setTimeout(() => {
      _sigkillTimer = null;
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
