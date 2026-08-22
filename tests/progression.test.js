'use strict';
/**
 * Where a returning player is dropped, and what a shared link may not do.
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadScript } = require('./helpers/loadScript.js');

function tracker(seed = {}) {
  const { ProgressTracker } = loadScript('js/progressTracker.js',
    { capture: ['ProgressTracker'] });
  const t = new ProgressTracker();
  for (const [id, patch] of Object.entries(seed)) {
    Object.assign(t.getStage(Number(id)), patch);
  }
  return t;
}

test('a brand new player is dropped on stage 1', () => {
  assert.strictEqual(tracker().nextStageId(30), 1);
});

test('a returning player is dropped on their first uncleared stage', () => {
  const t = tracker({ 1: { unlocked: true, stars: 3 }, 2: { unlocked: true, stars: 2 },
                      3: { unlocked: true, stars: 0 } });
  assert.strictEqual(t.nextStageId(30), 3);
});

test('a player who has cleared everything unlocked lands on the last one', () => {
  const t = tracker({ 1: { unlocked: true, stars: 3 }, 2: { unlocked: true, stars: 1 } });
  assert.strictEqual(t.nextStageId(30), 2, 'not stage 3, which is still locked');
});

test('the drop-in stage is never a locked stage', () => {
  // PLAY launches this directly, so a locked answer would dead-end the button.
  for (const seed of [{}, { 1: { unlocked: true, stars: 3 } },
                      { 1: { unlocked: true, stars: 3 }, 2: { unlocked: true, stars: 3 } }]) {
    const t = tracker(seed);
    assert.ok(t.isUnlocked(t.nextStageId(30)));
  }
});

test('a shared link cannot hand out progress', () => {
  // Deep links play a locked stage as a preview so the link lands on what was
  // shared. The rule that makes that safe: a preview grants nothing. This
  // pins the guard that enforces it.
  const fs = require('fs');
  const path = require('path');
  const { ROOT } = require('./helpers/loadScript.js');
  const src = fs.readFileSync(path.join(ROOT, 'js/slashGame.js'), 'utf8');

  assert.match(src, /if \(!this\._previewStage\) this\.progress\.completeStage\(/,
    'completeStage must be gated on not being a preview');
  assert.match(src, /_launchStage\(wanted, \{ preview: true \}\)/,
    'a locked deep-link target must launch as a preview');
  assert.match(src, /this\._previewStage = !!opts\.preview;/,
    '_launchStage must set the preview flag from its options');
});
