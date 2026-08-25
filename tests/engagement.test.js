'use strict';
/**
 * What the game does to keep a child coming back.
 *
 * These tests exist because the engagement layer was built on three
 * mechanics that its own header comment named accurately: a variable-ratio
 * reward, a FOMO countdown, and a purchasable defence against losing a
 * streak. They were pointed at five-year-olds. The properties below are
 * what replaced them, and they are worth pinning: a regression here is not
 * a rendering bug, it is the game going back to pressuring children.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadScript, ROOT } = require('./helpers/loadScript.js');

const engageSrc = fs.readFileSync(path.join(ROOT, 'js/engagementEngine.js'), 'utf8');
const trackerSrc = fs.readFileSync(path.join(ROOT, 'js/progressTracker.js'), 'utf8');

test('the daily reward is a fixed amount, not a random one', () => {
  // A random payout on a fixed schedule is a variable-ratio reward — the
  // uncertainty is what makes the schedule hard to stop.
  const gift = engageSrc.match(/const DAILY_GIFT = (\d+)/);
  assert.ok(gift, 'the daily gift should be one named constant');
  const claim = engageSrc.slice(engageSrc.indexOf('claimGift()'),
                                engageSrc.indexOf('// ── 7-Day Login Calendar'));
  assert.ok(!/Math\.random/.test(claim),
    'the daily gift must not be randomised');
});

test('the size of the gift is shown before it is claimed', () => {
  assert.ok(/Daily gift: 🌾\$\{DAILY_GIFT\}/.test(engageSrc),
    'the label must state the amount up front — a known gift conditions nobody');
});

test('nothing counts down on screen', () => {
  for (const banned of ['_startCountdown', '_formatCountdown', '_msUntilMidnight']) {
    assert.ok(!engageSrc.includes(banned),
      `${banned} is a countdown to a deadline a child cannot control`);
  }
  assert.ok(!/setInterval/.test(engageSrc),
    'a ticking timer on a rewards panel is a pressure device');
});

test('streak protection cannot be bought', () => {
  for (const banned of ['SHIELD_COST', 'canUseShield', 'useShield', 'shieldActive']) {
    assert.ok(!engageSrc.includes(banned),
      `${banned} survives — selling insurance against a loss only works on fear of the loss`);
  }
  assert.ok(!trackerSrc.includes('_consumeStreakShield'),
    'the tracker must not honour a purchased shield any more');
});

test('a missed day is forgiven for free', () => {
  const T = loadScript('js/progressTracker.js', { capture: ['ProgressTracker'] });
  const Tracker = T.ProgressTracker;
  const day = n => {
    const d = new Date(Date.UTC(2026, 5, n));
    return d.toISOString().slice(0, 10);
  };
  const t = new Tracker();
  t.data.loginStreak = 5;

  t.data.lastLoginDate = day(10);
  t._dateStr = (off = 0) => day(12 + off);   // today is the 12th: one day missed
  t._checkLoginStreak();
  assert.strictEqual(t.data.loginStreak, 6, 'a single missed day must not cost anything');

  t.data.lastLoginDate = day(8);
  t._dateStr = (off = 0) => day(12 + off);   // four days missed
  t._checkLoginStreak();
  assert.strictEqual(t.data.loginStreak, 1, 'a real lapse still resets — a streak has to mean something');
});

test('the record book contains no invented players', () => {
  // It used to ship ten of them — NinjaRice99, DinoSlayer, PhonicsKing —
  // all scoring above a child who had just started, on a screen captioned
  // "scores on this device". Manufactured social comparison, and a false
  // caption on top of it.
  assert.ok(!trackerSrc.includes('FAKE_LEADERS'),
    'fabricated competitors must not come back');
  for (const ghost of ['NinjaRice99', 'DinoSlayer', 'PhonicsKing', 'BlendMaster']) {
    assert.ok(!trackerSrc.includes(ghost), `${ghost} is not a real player`);
  }

  const T = loadScript('js/progressTracker.js', { capture: ['ProgressTracker'] });
  const t = new T.ProgressTracker();
  t.data.runLog = [];
  assert.deepStrictEqual(t.getRecordBook(), [],
    'an empty book must stay empty rather than being padded');
});

test('the record book is built from runs that really happened', () => {
  const T = loadScript('js/progressTracker.js', { capture: ['ProgressTracker'] });
  const t = new T.ProgressTracker();
  t.data.runLog = [];
  t.setPlayerName('Mia');
  t.recordEndlessRun(1200, 340, 6);
  t.recordEndlessRun(400, 90, 2);
  t.recordEndlessRun(0, 0, 0);      // a mis-tap, not a run

  const book = t.getRecordBook();
  assert.strictEqual(book.length, 2, 'a zero-distance run is not a record');
  assert.strictEqual(book[0].score, 1200, 'best first');
  assert.strictEqual(book[0].name, 'Mia');
  assert.strictEqual(book[0].isBest, true);
});

test('the record book cannot grow without bound', () => {
  const T = loadScript('js/progressTracker.js', { capture: ['ProgressTracker'] });
  const t = new T.ProgressTracker();
  t.data.runLog = [];
  for (let i = 0; i < 200; i++) t.recordEndlessRun(i + 1, i + 1, 0);
  assert.ok(t.data.runLog.length <= 20, `run log grew to ${t.data.runLog.length}`);
  assert.ok(t.getRecordBook().length <= 10);
  assert.strictEqual(t.getRecordBook()[0].score, 200, 'the best run survives the trim');
});
