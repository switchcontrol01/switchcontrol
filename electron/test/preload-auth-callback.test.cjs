const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

test('preload auth callback invokes the supplied listener and cleans up', () => {
  let exposedApi = null;
  const listeners = new Map();
  const sent = [];
  const ipcRenderer = {
    on(channel, handler) {
      listeners.set(channel, handler);
    },
    once(channel, handler) {
      listeners.set(channel, handler);
    },
    removeListener(channel, handler) {
      if (listeners.get(channel) === handler) listeners.delete(channel);
    },
    send(channel, ...args) {
      sent.push([channel, ...args]);
    },
    invoke() {
      return Promise.resolve(null);
    },
  };
  const electronMock = {
    contextBridge: {
      exposeInMainWorld(_name, api) {
        exposedApi = api;
      },
    },
    ipcRenderer,
  };
  const originalLoad = Module._load;
  const originalWindow = global.window;
  global.window = { addEventListener() {} };
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const preloadPath = path.join(__dirname, '..', 'preload.js');
    delete require.cache[require.resolve(preloadPath)];
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }

  const payloads = [];
  const unsubscribe = exposedApi.auth.onCallback((payload) => payloads.push(payload));
  const payload = { code: 'example', state: 'state' };
  listeners.get('auth-callback')({}, payload);

  assert.deepEqual(payloads, [payload]);
  assert.deepEqual(sent, [['renderer:auth-ready']]);
  unsubscribe();
  assert.equal(listeners.has('auth-callback'), false);
});