#!/usr/bin/env node
/**
 * tools/screenshot.js — capture gameplay screenshots for visual review.
 * Usage: node tools/screenshot.js --stage 1 --out shots/
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };

function serve(root) {
  const s = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(root, u === '/' ? '/index.html' : u);
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const stage = Number(get('--stage', 1));
  const outDir = path.resolve(ROOT, get('--out', 'shots'));
  const label = get('--label', 'shot');
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(ROOT);
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  if (args.includes('--no-cache')) {
    await page.addInitScript(() => { window.__DISABLE_SPRITE_CACHE = true; });
  }
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.launchSlashGame());
  await page.waitForFunction(
    () => typeof _slashGameInstance !== 'undefined' && _slashGameInstance
       && _slashGameInstance._spritesReady && _slashGameInstance._sheetsReady,
    null, { timeout: 30000 });
  await page.evaluate(s => {
    const g = _slashGameInstance;
    g.stageId = s; g._startRunner(); g.runner._runnerCountdownAge = 999;
  }, stage);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowRight');
  const out = path.join(outDir, `${label}-stage${stage}.png`);
  await page.screenshot({ path: out });
  console.log(out);
  await browser.close();
  server.close();
})();
