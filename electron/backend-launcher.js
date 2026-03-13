const { fork } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');

let backendProcess = null;
let backendReady = false;
let backendPort = null;

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

function waitForBackend(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        return reject(new Error(`Backend did not become ready within ${timeoutMs}ms`));
      }

      const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.status === 'ok') {
                return resolve(true);
              }
            } catch {}
          }
          setTimeout(check, 300);
        });
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

  try {
    const port = await findFreePort();
    backendPort = port;
    console.log('[Backend] Starting backend from:', indexPath, 'on port', port);

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      ELECTRON_BACKEND: '1',
    };

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

    console.log('[Backend] Waiting for readiness on port', port);
    await waitForBackend(port, 15000);
    backendReady = true;
    console.log('[Backend] Ready on port', port);

    return { port, ready: true };
  } catch (err) {
    console.error('[Backend] Failed to start:', err.message);
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    backendPort = null;
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
