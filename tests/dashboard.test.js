'use strict';
/**
 * What the parent dashboard reports.
 *
 * This screen is the one an adult reads to decide whether the game is
 * teaching anything, so a number on it being wrong is worse than a number
 * on it being ugly. The tests here are about honesty, not layout.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadScript, ROOT } = require('./helpers/loadScript.js');

const dashSrc = fs.readFileSync(path.join(ROOT, 'js/parentDashboard.js'), 'utf8');
const { ProgressTracker } = loadScript('js/progressTracker.js', { capture: ['ProgressTracker'] });

test('a sound that has never been asked is not reported as mastered', () => {
  // The old map coloured a sound green whenever its weak score was zero,
  // and the weak score only moves on a miss — so every sound the child had
  // never met was shown to their parent as mastered.
  const t = new ProgressTracker();
  t.recordBlend(1, 'cat', true, true, ['c', 'a', 't']);
  const stats = t.getPhonemeStats();

  assert.ok(stats.c && stats.c.n === 1, 'a practised sound is counted');
  assert.strictEqual(stats.sh, undefined, 'an unpractised sound has no record at all');
});

test('misses and attempts are both counted, per sound', () => {
  const t = new ProgressTracker();
  t.recordBlend(1, 'ship', false, false, ['sh', 'i', 'p']);
  t.recordBlend(1, 'shop', true, true, ['sh', 'o', 'p']);
  const stats = t.getPhonemeStats();
  // Spread across the sandbox boundary: deepStrictEqual compares prototypes,
  // and objects built inside the VM realm are never reference-equal to ours.
  assert.deepStrictEqual({ ...stats.sh }, { n: 2, wrong: 1 });
  assert.deepStrictEqual({ ...stats.i }, { n: 1, wrong: 1 });
  assert.deepStrictEqual({ ...stats.o }, { n: 1, wrong: 0 });
});

test('the dashboard classifies sounds from attempts, not from the weak score', () => {
  assert.ok(dashSrc.includes('getPhonemeStats'),
    'the map must read attempt counts');
  assert.ok(dashSrc.includes('pd-ph-new'),
    'there must be a state for "not practised yet" — without one the map lies');
});

test('the dashboard reports the review ladder', () => {
  // Stars and rice say the child played. Only the ladder says whether they
  // are reading, so it must be on the screen and in the shared report.
  assert.ok(dashSrc.includes('_renderReview'), 'the reading section must exist');
  assert.ok(/spaced review/i.test(dashSrc),
    'the shared progress report must include the review figures');
});

test('the report names the words that keep slipping', () => {
  // "3 words need work" is not something a parent can act on.
  assert.ok(dashSrc.includes('allWords'),
    'the report should list the words themselves, not just a count');
});
