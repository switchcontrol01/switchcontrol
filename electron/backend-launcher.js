const { fork } = require('child_process');
const path = require('path');
const http = require('http');

let backendProcess = null;
let backendReady = false;
let backendPort = 5000;

function waitForBackend(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        return reject(new Error(`Backend did not become ready within ${timeoutMs}ms`));
      }

      const req = http.get(`http://localhost:${port}/api/health`, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve(true);
        } else {
          setTimeout(check, 300);
        }
      });

      req.on('error', () => {
        setTimeout(check, 300);
      });

      req.on('timeout', () => {
        req.destroy();
        setTimeout(check, 300);
      });
    }

    check();
  });
}

async function startBackend(app) {
  if (backendProcess) {
    console.log('[Backend] Already running');
    return { port: backendPort, ready: backendReady };
  }

  const indexPath = path.join(process.resourcesPath, 'dist', 'index.cjs');
  const fs = require('fs');

  if (!fs.existsSync(indexPath)) {
    console.error('[Backend] dist/index.cjs not found at:', indexPath);
    return { port: null, ready: false, error: 'Backend bundle not found' };
  }

  console.log('[Backend] Starting backend from:', indexPath);

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(backendPort),
    ELECTRON_BACKEND: '1',
  };

  try {
    backendProcess = fork(indexPath, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: path.dirname(indexPath),
    });

    backendProcess.stdout?.on('data', (data) => {
      console.log('[Backend:stdout]', data.toString().trim());
    });

    backendProcess.stderr?.on('data', (data) => {
      console.error('[Backend:stderr]', data.toString().trim());
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Backend] Process exited: code=${code} signal=${signal}`);
      backendProcess = null;
      backendReady = false;
    });

    backendProcess.on('error', (err) => {
      console.error('[Backend] Process error:', err.message);
      backendProcess = null;
      backendReady = false;
    });

    console.log('[Backend] Waiting for readiness on port', backendPort);
    await waitForBackend(backendPort, 15000);
    backendReady = true;
    console.log('[Backend] Ready on port', backendPort);

    return { port: backendPort, ready: true };
  } catch (err) {
    console.error('[Backend] Failed to start:', err.message);
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    return { port: null, ready: false, error: err.message };
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('[Backend] Stopping backend process');
    backendProcess.kill('SIGTERM');
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill('SIGKILL');
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

module.exports = {
  startBackend,
  stopBackend,
  isBackendReady,
  getBackendPort,
};
