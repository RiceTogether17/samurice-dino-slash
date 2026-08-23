'use strict';
/**
 * The spaced-review ladder.
 *
 * This is the game's reason to come back tomorrow that is not a prize, so
 * the properties worth protecting are the ones a parent would care about:
 * words you miss come back soon, words you know go quiet, and the day's
 * practice ends.
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/learn/review.js');

const DAY = 86400000;
function ladder(startUtc = Date.UTC(2026, 2, 1, 12)) {
  let mem = null;
  let now = startUtc;
  const store = { read: () => mem, write: d => { mem = JSON.parse(JSON.stringify(d)); } };
  const L = new R.ReviewLadder(store, () => now);
  return {
    L,
    advance(days) { now += days * DAY; return this; },
    reload() { return new R.ReviewLadder(store, () => now); },
    get raw() { return mem; },
  };
}

test('a correct answer moves a word up and quietens it', () => {
  const h = ladder();
  h.L.grade('cat', true);
  assert.strictEqual(h.L.entry('cat').box, 2);
  assert.deepStrictEqual(h.L.dueWords(), [], 'a word just answered is not due again today');
  h.advance(1);
  assert.deepStrictEqual(h.L.dueWords(), ['cat'], 'box 2 rests one day');
});

test('a missed word comes back the same day', () => {
  const h = ladder();
  h.L.grade('ship', false);
  assert.deepStrictEqual(h.L.dueWords(), ['ship']);
});

test('the rest between reviews grows as a word is learned', () => {
  const h = ladder();
  const gaps = [];
  for (let i = 0; i < R.BOXES; i++) {
    const before = R.dayNumber(Date.UTC(2026, 2, 1, 12)) + gaps.reduce((a, b) => a + b, 0);
    h.L.grade('sun', true);
    const gap = h.L.entry('sun').dueDay - before;
    gaps.push(gap);
    h.advance(gap);          // stand on the day the word next comes due
  }
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(gaps[i] >= gaps[i - 1],
      `interval shrank from ${gaps[i - 1]} to ${gaps[i]} days at box ${i + 1}`);
  }
  assert.ok(gaps[gaps.length - 1] >= 7, 'a learned word should go quiet for a week or more');
});

test('a miss costs ground but does not wipe a word out', () => {
  // Resetting a fortnight-old word to zero for one bad tap is both harsh
  // and inaccurate — the child has not forgotten it.
  const h = ladder();
  for (let i = 0; i < 4; i++) { h.L.grade('rain', true); h.advance(20); }
  const before = h.L.entry('rain').box;
  assert.ok(before >= 4, 'setup: the word should be well up the ladder');
  h.L.grade('rain', false);
  const after = h.L.entry('rain').box;
  assert.ok(after < before, 'a miss must cost something');
  assert.ok(after > 1, 'a miss must not undo weeks of work');
});

test('a word never falls below the bottom box', () => {
  const h = ladder();
  for (let i = 0; i < 10; i++) h.L.grade('was', false);
  assert.strictEqual(h.L.entry('was').box, 1);
});

test('the day has an end', () => {
  // The point of the cap: a child who has practised is told they are done,
  // rather than being handed another queue.
  const h = ladder();
  for (let i = 0; i < R.DAILY_TARGET; i++) h.L.grade('w' + i, false);
  assert.ok(h.L.dueCount() >= R.DAILY_TARGET, 'setup: plenty is genuinely due');
  assert.strictEqual(h.L.remainingToday(), 0);
  assert.deepStrictEqual(h.L.todaysQueue(), []);
  assert.strictEqual(h.L.doneForToday(), true);
});

test('the day ends whichever mode the practice happened in', () => {
  // Campaign words count too. Playing thirty stage words is practice; the
  // game must not then ask for twelve more.
  const h = ladder();
  for (let i = 0; i < 30; i++) h.L.grade('c' + i, true, { stage: 3 });
  assert.strictEqual(h.L.doneForToday(), true);
});

test('a new day restores the allowance', () => {
  const h = ladder();
  for (let i = 0; i < R.DAILY_TARGET; i++) h.L.grade('w' + i, false);
  assert.strictEqual(h.L.remainingToday(), 0);
  h.advance(1);
  assert.strictEqual(h.L.remainingToday(), R.DAILY_TARGET);
  assert.ok(h.L.todaysQueue().length > 0, 'yesterday\'s misses are waiting');
});

test('a backlog is served worst-first and never all at once', () => {
  // Two weeks away should not present sixty words.
  const h = ladder();
  for (let i = 0; i < 40; i++) h.L.grade('w' + i, true);
  h.advance(14);
  const queue = h.L.todaysQueue();
  assert.strictEqual(queue.length, R.DAILY_TARGET, 'the queue is capped, not the backlog');
  assert.ok(h.L.dueCount() > queue.length, 'setup: more is due than is served');
});

test('the most overdue words come first', () => {
  const h = ladder();
  h.L.grade('old', true);      // box 2 → due in 1 day
  h.advance(1);
  h.L.grade('new', true);      // box 2 → due tomorrow
  h.advance(5);
  const queue = h.L.todaysQueue();
  assert.strictEqual(queue[0], 'old');
});

test('nothing is due before it has been seen', () => {
  const h = ladder();
  assert.deepStrictEqual(h.L.dueWords(), []);
  assert.strictEqual(h.L.doneForToday(), true, 'an empty ladder asks for nothing');
});

test('introduce files a word without counting as practice', () => {
  const h = ladder();
  h.L.introduce('pond', 7);
  assert.strictEqual(h.L.entry('pond').box, 1);
  assert.deepStrictEqual(h.L.dueWords(), ['pond']);
  assert.strictEqual(h.L.stats().doneToday, 0);
  assert.strictEqual(h.L.introduce('pond', 7), false, 'introducing twice must not reset it');
});

test('the ladder survives a reload', () => {
  const h = ladder();
  h.L.grade('moon', true);
  h.advance(1);
  assert.strictEqual(h.reload().entry('moon').box, 2);
});

test('corrupt or foreign storage is discarded, not crashed on', () => {
  let mem = { v: 99, words: 'not an object' };
  const store = { read: () => mem, write: d => { mem = d; } };
  const L = new R.ReviewLadder(store, () => Date.now());
  assert.deepStrictEqual(L.dueWords(), []);
  L.grade('cat', true);
  assert.strictEqual(L.entry('cat').box, 2);
});

test('words are matched regardless of case', () => {
  const h = ladder();
  h.L.grade('Cat', true);
  assert.ok(h.L.entry('cat'), 'CAT on a card and cat in the data are one word');
});

test('mastery is reachable and is reported', () => {
  const h = ladder();
  for (let i = 0; i < R.BOXES; i++) { h.L.grade('fish', true); h.advance(20); }
  assert.strictEqual(h.L.entry('fish').box, R.MASTERED_BOX);
  assert.strictEqual(h.L.stats().mastered, 1);
});

test('a mastered word still comes round again', () => {
  // Reading is not a checkbox. Nothing leaves the ladder for good.
  const h = ladder();
  for (let i = 0; i < R.BOXES + 2; i++) { h.L.grade('fish', true); h.advance(20); }
  assert.ok(h.L.entry('fish').dueDay > R.dayNumber(Date.now()) - 1000);
  h.advance(60);
  assert.deepStrictEqual(h.L.dueWords(), ['fish']);
});
