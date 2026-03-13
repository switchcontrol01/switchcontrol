const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');

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

    function check() {
      attempt++;
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        return reject(new Error(`Backend health check timed out after ${timeoutMs}ms (${attempt} attempts)`));
      }

      const retryDelay = attempt <= 5 ? 100 : attempt <= 15 ? 200 : 350;

      const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.status === 'ok') {
                console.log(`[Backend] Health check PASSED — attempt ${attempt}, ${Date.now() - start}ms elapsed`);
                return resolve(true);
              }
            } catch (e) {
              console.warn(`[Backend] Health response parse error:`, e.message);
            }
          } else {
            console.log(`[Backend] Health check returned HTTP ${res.statusCode} (attempt ${attempt})`);
          }
          setTimeout(check, retryDelay);
        });
      });

      req.on('error', (err) => {
        if (attempt <= 3 || attempt % 10 === 0) {
          console.log(`[Backend] Health check attempt ${attempt} — ${err.code || err.message}`);
        }
        setTimeout(check, retryDelay);
      });

      req.on('timeout', () => {
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

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      ELECTRON_BACKEND: '1',
      ELECTRON_RUN_AS_NODE: '1',
    };

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
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        console.log('[Backend:stdout]', line);
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        console.error('[Backend:stderr]', line);
      }
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Backend] Child process EXITED — code=${code} signal=${signal}`);
      if (code !== 0 && code !== null) {
        lastError = `Backend process crashed with exit code ${code}`;
        console.error('[Backend]', lastError);
      }
      backendProcess = null;
      backendReady = false;
    });

    backendProcess.on('error', (err) => {
      lastError = `Backend process error: ${err.message}`;
      console.error('[Backend]', lastError);
      backendProcess = null;
      backendReady = false;
    });

    console.log('[Backend] Polling health endpoint: http://127.0.0.1:' + port + '/api/health');
    await waitForBackend(port, 20000);
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
