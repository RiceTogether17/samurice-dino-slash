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
  const state = get('--state', 'runner');
  if (state === 'runner') {
    await page.evaluate(s => {
      const g = _slashGameInstance;
      g.stageId = s; g._startRunner();
      g._runnerCountdownAge = -1;   // skip the 3-2-1 intro (lives on the game)
    }, stage);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2500);
    await page.keyboard.up('ArrowRight');
  } else if (state === 'battle') {
    // Reach the battle the way a player does: finish the runner and let the
    // engine run its own handoff. Forcing the state directly skips the
    // transition that repaints the screen, so the capture would show stale
    // runner pixels that no real player ever sees.
    await page.evaluate(s => {
      const g = _slashGameInstance;
      g.stageId = s;
      g._startRunner();
      g._runnerCountdownAge = -1;
      g.runner.coins.forEach(c => { c.collected = true; });
      g.runner.done = true;
      g.runner.outcome = 'flag';
    }, stage);
    await page.waitForFunction(() => _slashGameInstance.state === 'battle',
      null, { timeout: 20000 });
    // Combat picks a pattern at random from the stage's activities; force one
    // so each mechanic can be reviewed on demand rather than by re-rolling.
    const forced = get('--pattern', null);
    if (forced) {
      await page.evaluate(id => {
        const be = _slashGameInstance.battle;
        const pattern = window.CombatPatterns.ALL.find(p => p.id === id);
        const stage = be.stage;
        const word = (stage.words || []).find(w =>
          pattern.canBuild(w, { words: stage.words, stage, phase: 1,
                                which: pattern.skills[0] }));
        if (!word) throw new Error(`no word in this stage supports ${id}`);
        be._pattern = pattern;
        be._round = pattern.build(word, { words: stage.words, stage, phase: 1,
                                          which: pattern.skills[0] });
        be._attemptInRound = 0;
        be.state = 'duel';
        be._say(pattern.instruction(be._round), 'neutral', 8000);
      }, forced);
    }
    if (get('--victory', null)) {
      await page.evaluate(() => {
        const be = _slashGameInstance.battle;
        if (be.state === 'primer') { be._primerAge = 999; be._dismissPrimer(); }
        be.bossHp = 0; be._win();
      });
      await page.waitForTimeout(Number(get('--victory-ms', 700)));
    } else if (get('--skip-primer', null)) {
      await page.evaluate(() => {
        const be = _slashGameInstance.battle;
        if (be.state === 'primer') { be._primerAge = 999; be._dismissPrimer(); }
      });
    }
    await page.waitForTimeout(get('--victory', null) ? 0 : 2500);
  } else {
    await page.evaluate(st => { _slashGameInstance.state = st; }, state);
    await page.waitForTimeout(1200);
  }
  const out = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: out });
  console.log(out);
  await browser.close();
  server.close();
})();
