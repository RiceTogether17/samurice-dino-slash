#!/usr/bin/env node
/**
 * tools/smoke.js — end-to-end check that the game still plays.
 *
 * Boots the real page, walks a stage from the world map through the runner
 * and the boss battle to the win screen, and fails on any page error or
 * failed request. Unit tests cover the pieces; this covers the wiring, which
 * is where a renamed asset or a load-order slip actually shows up.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

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

const steps = [];
const fail = [];
function check(name, ok, detail = '') {
  steps.push(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail.push(name);
}

(async () => {
  const server = await serve(ROOT);
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

  const pageErrors = [];
  const badRequests = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('response', r => {
    // Google Fonts is blocked in sandboxed CI; it is not a game asset.
    if (r.status() >= 400 && !r.url().includes('fonts.googleapis')) {
      badRequests.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  check('page loads', true);

  await page.evaluate(() => window.launchSlashGame());
  await page.waitForFunction(
    () => typeof _slashGameInstance !== 'undefined' && _slashGameInstance
       && _slashGameInstance._spritesReady && _slashGameInstance._sheetsReady,
    null, { timeout: 30000 });
  check('assets finish loading', true);

  check('core modules present', await page.evaluate(
    () => !!(window.SpriteCache && window.Quality && window.ArrayOps)));
  check('texture cache installed', await page.evaluate(
    () => !!CanvasRenderingContext2D.prototype.drawImage.__spriteCached));

  // Runner
  await page.evaluate(() => {
    const g = _slashGameInstance;
    g.stageId = 3;
    g._startRunner();
    g._runnerCountdownAge = -1;
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2000);
  const moved = await page.evaluate(() => _slashGameInstance.runner.player.worldX);
  await page.keyboard.up('ArrowRight');
  check('runner advances the player', moved > 150, `worldX=${Math.round(moved)}`);
  check('texture cache is being hit', await page.evaluate(
    () => window.SpriteCache.stats.hits > 100),
    await page.evaluate(() => JSON.stringify(window.SpriteCache.stats)));

  // Runner -> battle handoff
  await page.evaluate(() => {
    const r = _slashGameInstance.runner;
    r.coins.forEach(c => { c.collected = true; });
    r.done = true;
    r.outcome = 'flag';
  });
  await page.waitForFunction(() => _slashGameInstance.state === 'battle',
    null, { timeout: 20000 });
  check('battle starts', true);
  check('boss phase art resolves', await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    const idle = be._resolveBossSpriteKey();
    be.state = 'boss-attack';
    const attack = be._resolveBossSpriteKey();
    be.state = 'idle';
    return !!idle && !!attack;
  }));

  // Battle -> win. Zeroing bossHp is not enough: the engine only checks it
  // when damage is applied, so drive the defeat through the same entry point
  // a winning blend uses.
  await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    be.bossHp = 0;
    be._win();
  });
  await page.waitForFunction(
    () => ['stage-win', 'boss-defeated', 'battle-results']
      .includes(_slashGameInstance.state), null, { timeout: 25000 });
  check('boss defeat resolves to a result screen', true,
    await page.evaluate(() => _slashGameInstance.state));

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('no failed requests', badRequests.length === 0, badRequests.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  console.log(steps.join('\n'));
  if (fail.length) {
    console.error(`\n${fail.length} smoke check(s) failed: ${fail.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll smoke checks passed.');
  }
})();
