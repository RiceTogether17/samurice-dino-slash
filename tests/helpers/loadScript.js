'use strict';
/**
 * Load one of the game's browser scripts into a sandbox so Node can test it.
 *
 * The game ships as classic scripts against a real DOM, not modules, so the
 * only way to exercise its logic in a test runner is to evaluate a file in a
 * VM context with the handful of browser globals it touches stubbed out.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

/** Minimal browser surface: enough for data and pure-logic modules. */
function makeWindow(extra = {}) {
  const storage = new Map();
  const win = {
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear(),
    },
    navigator: { userAgent: 'node', hardwareConcurrency: 8, deviceMemory: 8 },
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    performance: { now: () => Date.now() },
    console,
    setTimeout,
    clearTimeout,
    ...extra,
  };
  win.window = win;
  win.globalThis = win;
  return win;
}

/**
 * Evaluate `relPath` (repo-relative) and return the sandbox.
 *
 * `capture` names top-level bindings to lift onto the returned object. A
 * script-level `const` is a lexical binding, not a property of the global
 * object, so it is invisible to the caller unless the script itself hands it
 * over — which is why the names are appended and evaluated in the same pass.
 */
function loadScript(relPath, { capture = [], ...extra } = {}) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const sandbox = makeWindow(extra);
  vm.createContext(sandbox);
  const epilogue = capture.length
    ? `\n;globalThis.__captured = { ${capture.join(', ')} };`
    : '';
  vm.runInContext(code + epilogue, sandbox, { filename: relPath });
  return Object.assign(sandbox, sandbox.__captured || {});
}

module.exports = { loadScript, makeWindow, ROOT };
