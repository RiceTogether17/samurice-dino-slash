#!/usr/bin/env node
/**
 * tools/profile.js — headless frame-cost profiler for Samurice Dino Slash.
 *
 * Boots the real game in Chromium, drives it into a gameplay state, and
 * measures how long each animation-frame callback actually occupies the main
 * thread. Frame *cost* is the number that matters: raw FPS is capped by vsync
 * and hides how much headroom a slow phone would have left.
 *
 * Usage:
 *   node tools/profile.js                 # profile the runner, stage 1
 *   node tools/profile.js --stage 21      # a later, busier stage
 *   node tools/profile.js --frames 600    # longer sample
 *   node tools/profile.js --cpu 4         # emulate a 4x-slower CPU
 *   node tools/profile.js --json out.json # machine-readable output
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

function parseArgs(argv) {
  const out = { stage: 1, frames: 420, cpu: 1, json: null, state: 'runner' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stage') out.stage = Number(argv[++i]);
    else if (a === '--frames') out.frames = Number(argv[++i]);
    else if (a === '--cpu') out.cpu = Number(argv[++i]);
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--state') out.state = argv[++i];
  }
  return out;
}

function serve(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function stats(samples) {
  if (!samples.length) return null;
  const s = [...samples].sort((a, b) => a - b);
  const pick = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return {
    frames: s.length,
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3),
    p50: +pick(0.50).toFixed(3),
    p95: +pick(0.95).toFixed(3),
    p99: +pick(0.99).toFixed(3),
    max: +s[s.length - 1].toFixed(3),
    /** Frames that blew the 16.7 ms budget — i.e. visible stutter. */
    overBudget: +((s.filter(v => v > 16.7).length / s.length) * 100).toFixed(1),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const server = await serve(ROOT);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // The blit counter must be installed before any game script so that
  // core/renderPatch.js captures it as its "original" — that way the counter
  // records the blits that genuinely reach the canvas, not the requests the
  // engines make before the scaled-texture cache rewrites them.
  await page.addInitScript(() => {
    window.__blit = { calls: 0, srcMP: 0, frames: 0, downscaled: 0 };
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (img, ...a) {
      const b = window.__blit;
      b.calls++;
      let sw, sh, dw, dh;
      if (a.length >= 8) { sw = a[2]; sh = a[3]; dw = a[6]; dh = a[7]; }
      else if (a.length === 4) {
        sw = img.naturalWidth || img.width; sh = img.naturalHeight || img.height;
        dw = a[2]; dh = a[3];
      } else {
        sw = dw = img.naturalWidth || img.width;
        sh = dh = img.naturalHeight || img.height;
      }
      b.srcMP += (sw * sh) / 1e6;
      if (sw > dw * 2 || sh > dh * 2) b.downscaled++;
      return orig.call(this, img, ...a);
    };
    const raf = window.requestAnimationFrame.bind(window);
    (function tick() { window.__blit.frames++; raf(tick); })();
  });

  await page.goto(base + '/index.html', { waitUntil: 'load' });

  if (opts.cpu > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
  }

  // Boot the slash game and wait for its asset gate to open.
  await page.evaluate(() => { window.launchSlashGame(); });
  await page.waitForFunction(
    () => typeof _slashGameInstance !== 'undefined' && _slashGameInstance
       && _slashGameInstance._spritesReady && _slashGameInstance._sheetsReady,
    null, { timeout: 30000 },
  );

  // Drive straight into the requested gameplay state.
  await page.evaluate(({ stage, state }) => {
    const g = _slashGameInstance;
    g.stageId = stage;
    if (state === 'runner') g._startRunner();
    else g.state = state;
  }, opts);

  // Instrument the engine's real update+draw. Timing the rAF callback instead
  // would be dominated by the loop's frame-pacing early-return, which does no
  // work at all and drags the median to zero.
  await page.evaluate(() => {
    window.__frameCosts = [];
    window.__drawCosts = [];
    window.__updateCosts = [];
    const g = _slashGameInstance;
    const target = g.runner || g.battle;
    if (!target) return;
    const proto = Object.getPrototypeOf(target);
    const wrap = (name, bucket) => {
      const orig = proto[name];
      if (typeof orig !== 'function' || orig.__profiled) return;
      const fn = function (...args) {
        const t0 = performance.now();
        const r = orig.apply(this, args);
        bucket.push(performance.now() - t0);
        return r;
      };
      fn.__profiled = true;
      proto[name] = fn;
    };
    wrap('update', window.__updateCosts);
    wrap('draw', window.__drawCosts);

  });

  // Hold a movement key so the runner actually scrolls and spawns entities.
  await page.evaluate(() => {
    const g = _slashGameInstance;
    if (g.runner) g.runner._runnerCountdownAge = 999;
  });
  await page.keyboard.down('ArrowRight');

  // Discard warm-up frames, then sample.
  await page.evaluate(() => {
    window.__drawCosts.length = 0; window.__updateCosts.length = 0;
    window.__blit.calls = 0; window.__blit.srcMP = 0;
    window.__blit.frames = 0; window.__blit.downscaled = 0;
  });
  await page.waitForFunction(
    n => window.__drawCosts.length >= n, opts.frames, { timeout: 120000 },
  );
  await page.keyboard.up('ArrowRight');

  const draws = await page.evaluate(() => window.__drawCosts.slice());
  const updates = await page.evaluate(() => window.__updateCosts.slice());
  // Total per-frame engine cost is what a real device's 16.7 ms budget faces.
  const costs = draws.map((d, i) => d + (updates[i] || 0));
  const blit = await page.evaluate(() => {
    const b = window.__blit;
    return {
      drawImageCallsPerFrame: +(b.calls / Math.max(1, b.frames)).toFixed(1),
      /** Megapixels of source texture resampled per frame. */
      sourceMPPerFrame: +(b.srcMP / Math.max(1, b.frames)).toFixed(2),
      /** Blits shrinking a texture by >2x — the ones that need pre-scaling. */
      heavyDownscalesPerFrame: +(b.downscaled / Math.max(1, b.frames)).toFixed(1),
    };
  });
  const cache = await page.evaluate(() => (window.SpriteCache
    ? window.SpriteCache.stats : null));
  const heap = await page.evaluate(() => performance.memory
    ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : null);
  const quality = await page.evaluate(() => ({
    LOW_FX: !!window.LOW_FX,
    tier: window.Quality ? window.Quality.tier : null,
    dpr: _slashGameInstance ? _slashGameInstance._dpr : null,
  }));

  const result = {
    stage: opts.stage, state: opts.state, cpuThrottle: opts.cpu,
    frameCostMs: stats(costs), drawMs: stats(draws), updateMs: stats(updates),
    blit, cache, heap, quality,
    errors: errors.slice(0, 10),
  };

  console.log(JSON.stringify(result, null, 2));
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(result, null, 2));

  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
