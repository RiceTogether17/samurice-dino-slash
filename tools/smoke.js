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
    () => !!(window.SpriteCache && window.Quality && window.ArrayOps && window.UI)));

  // Exactly one screen may be visible. An id selector setting `display` on a
  // screen outranks `.screen { display: none }`, which once left the title
  // screen painted on top of the running game.
  const visible = await page.evaluate(() => [...document.querySelectorAll('.screen')]
    .filter(el => getComputedStyle(el).display !== 'none')
    .map(el => el.id));
  check('exactly one screen is visible', visible.length === 1, visible.join(', '));
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
  check('boss art resolves', await page.evaluate(
    () => !!_slashGameInstance.battle._resolveBossSpriteKey()));

  // Combat is the point of the rebuild, so check it actually fights: a round
  // exists, striking the right target damages the boss, and a wrong strike
  // draws a coaching line instead of the answer.
  // A first-time player meets a new mechanic behind a primer card that
  // explains its verb. Check it appears, then dismiss it the way a tap would.
  check('a new mechanic is taught before it is played', await page.evaluate(
    () => _slashGameInstance.battle.state === 'primer'),
    await page.evaluate(() => _slashGameInstance.battle._pattern?.howTo || 'no primer'));

  await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    be._primerAge = 999;
    be._dismissPrimer();
  });

  check('a duel round is live', await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    return be.state === 'duel' && !!be._round && !!be._pattern;
  }), await page.evaluate(() => _slashGameInstance.battle._pattern?.id || 'none'));

  const fight = await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    const before = be.bossHp;
    let guard = 0;
    // Play the current round correctly until it completes.
    while (guard++ < 60) {
      if (be.state === 'primer') { be._primerAge = 999; be._dismissPrimer(); continue; }
      if (be.state !== 'duel') break;
      const targets = be._pattern.targets(be._round);
      if (!targets.length) { be.update(1 / 60); continue; }
      let acted = false;
      for (const t of targets) {
        const r = be._pattern.resolve(be._round, t.id);
        if (r && r.correct) { be._apply(r); acted = true; break; }
      }
      if (!acted) break;
    }
    return { before, after: be.bossHp, streak: be._streak, score: be.score };
  });
  check('correct play damages the boss', fight.after < fight.before,
    `${fight.before} -> ${fight.after}`);

  const coached = await page.evaluate(() => {
    const be = _slashGameInstance.battle;
    if (be.state === 'primer') { be._primerAge = 999; be._dismissPrimer(); }
    // Force a Sound Strike round and hit a rune that is knowably wrong.
    // Probing targets by calling resolve() would not do: resolve mutates the
    // round, so a probe that happened to be correct would consume it.
    const pattern = window.CombatPatterns.soundStrike;
    const stage = be.stage;
    const word = (stage.words || []).find(w => (w.phonemes || []).length >= 3);
    if (!word) return null;
    be._pattern = pattern;
    be._round = pattern.build(word, { words: stage.words, stage, phase: 1, which: 'first' });
    be._attemptInRound = 0;
    be.state = 'duel';
    const wrong = be._round.runes.find(r => r.idx !== be._round.answerIdx);
    const res = pattern.resolve(be._round, wrong.id);
    be._apply(res);
    return { text: be._feedback.text, tone: be._feedback.tone,
             revealsAnswer: be._feedback.text.includes(word.phonemes[be._round.answerIdx]) };
  });
  check('a first miss coaches instead of failing the child',
    !!coached && coached.tone === 'coach',
    coached ? `"${coached.text}"` : 'no miss produced');

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

  // ── The shareable end card ─────────────────────────────────
  const card = await page.evaluate(async () => {
    const g = _slashGameInstance;
    const stage = PHONICS_DATA.stageList[2];
    g.stageId = 3;
    g._battleResults = { learnedWords: stage.words.slice(0, 4).map(w => w.word) };
    const blob = await g._composeEndCard(stage);
    if (!blob) return { ok: false, why: 'no blob' };
    const bitmap = await createImageBitmap(blob);
    return { ok: true, bytes: blob.size, w: bitmap.width, h: bitmap.height, type: blob.type };
  });
  check('the win composes a shareable card',
    card.ok && card.w === 1200 && card.h === 630 && card.bytes > 20000 && card.bytes < 600000,
    card.ok ? `${card.w}x${card.h}, ${Math.round(card.bytes / 1024)}KB ${card.type}` : card.why);

  // ── The review loop ────────────────────────────────────────
  // The ladder is the game's reason to come back, so the whole round trip is
  // checked here: due words in, a fight that ends with the list, grades out.
  const review = await page.evaluate(async () => {
    const g = _slashGameInstance;
    const L = window.Review.shared();
    L.reset();
    const seed = [];
    for (const st of PHONICS_DATA.stageList.slice(0, 4)) {
      for (const w of st.words.slice(0, 2)) seed.push(w.word);
    }
    seed.forEach(w => L.introduce(w, 1));
    const due = L.todaysQueue().length;

    g.battle = null;
    g.state = 'mode-select';
    g._startReview();
    if (g.state !== 'review') return { failed: 'did not enter review', due };
    const words = g.review.stage.words.length;
    const notAStage = g.review.stage.id === 0;

    for (let i = 0; i < 900 && g.state === 'review'; i++) {
      const be = g.review;
      if (!be) break;
      if (be.state === 'primer') { be._primerAge = 999; be._dismissPrimer(); }
      else if (be.state === 'duel') {
        for (const t of be._pattern.targets(be._round) || []) {
          const r = be._pattern.resolve(be._round, t.id);
          if (r && r.correct) { be._apply(r); break; }
        }
      }
      await new Promise(r => setTimeout(r, 30));
    }
    return {
      due, words, notAStage,
      state: g.state,
      summary: g._reviewSummary,
      after: L.stats(),
    };
  });
  check('a review session is built from the words that are due',
    review.words === review.due && review.due > 0,
    `${review.words} words for ${review.due} due`);
  check('a review clears no campaign progress', review.notAStage === true);
  check('a review ends when its word list does', review.state === 'review-done',
    review.summary ? `${review.summary.correct}/${review.summary.words} first try` : review.state);
  check('answering moves words up the ladder',
    review.after && review.after.doneToday >= review.words && review.after.due === 0,
    JSON.stringify(review.after));

  // The stopping cue: once the day's practice is done the game says so.
  const stop = await page.evaluate(() => {
    const L = window.Review.shared();
    return { done: L.doneForToday(), queue: L.todaysQueue().length };
  });
  check('the game stops asking once the day is done',
    stop.done === true && stop.queue === 0, JSON.stringify(stop));

  // A shared ?s=<stage> link must land on that stage without granting it.
  {
    const p2 = await browser.newPage({ viewport: { width: 900, height: 520 } });
    await p2.goto(`http://127.0.0.1:${port}/index.html?s=12`, { waitUntil: 'domcontentloaded' });
    const landed = await p2.waitForFunction(
      () => typeof _slashGameInstance !== 'undefined' && _slashGameInstance
         && _slashGameInstance.state === 'runner',
      null, { timeout: 45000 }).then(() => true).catch(() => false);
    const info = landed ? await p2.evaluate(() => ({
      stage: _slashGameInstance.stageId,
      preview: !!_slashGameInstance._previewStage,
      ownNext: _slashGameInstance.progress.nextStageId(30),
    })) : null;
    check('a shared link opens the stage it names', !!info && info.stage === 12,
      info ? `stage ${info.stage}, preview ${info.preview}` : 'never reached the runner');
    check('a shared link grants no progress', !!info && info.ownNext === 1,
      info ? `their own next stage is still ${info.ownNext}` : '');
    await p2.close();
  }

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
