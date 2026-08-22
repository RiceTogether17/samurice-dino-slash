'use strict';
/**
 * The coaching ladder.
 *
 * The behaviour worth protecting is what the game does NOT do: hand over the
 * answer the first time a child gets something wrong. The old battle replied
 * "Blend failed!" and moved on, which tells a child they failed and nothing
 * they can act on.
 */
const test = require('node:test');
const assert = require('node:assert');
const Coach = require('../js/combat/coach.js');

test('a first miss withholds the answer and gives something to do', () => {
  const r = Coach.respond({
    attempt: 1, skill: 'segment-it',
    given: 's|h|i|p', correct: 'sh|i|p',
    phonemes: ['sh', 'i', 'p'], word: 'ship',
  });
  assert.strictEqual(r.stage, 'coach');
  assert.strictEqual(r.reveal, false);
  assert.ok(r.text.length > 10, 'must actually say something');
  assert.ok(!/\/sh\/ \+ \/i\/ \+ \/p\//.test(r.text), 'must not spell out the answer');
});

test('a second miss names the slip, gives the rule, then the answer', () => {
  const r = Coach.respond({
    attempt: 2, skill: 'segment-it',
    given: 's|h|i|p', correct: 'sh|i|p',
    phonemes: ['sh', 'i', 'p'], word: 'ship',
  });
  assert.strictEqual(r.stage, 'reteach');
  assert.strictEqual(r.reveal, true);
  assert.match(r.text, /\/sh\//, 'the answer is shown by the second miss');
});

test('splitting a digraph is diagnosed as its own mistake', () => {
  // "s" + "h" instead of "sh" is a specific, teachable slip — not just wrong.
  const m = Coach.diagnose({
    skill: 'segment-it', given: 's|h|i|p', correct: 'sh|i|p',
    phonemes: ['sh', 'i', 'p'], word: 'ship',
  });
  assert.strictEqual(m.key, 'digraph-split');
});

test('counting letters instead of sounds is told apart from miscounting', () => {
  const asLetters = Coach.diagnose({
    skill: 'sound-count', given: 4, correct: 3, word: 'ship', phonemes: ['sh', 'i', 'p'],
  });
  assert.strictEqual(asLetters.key, 'counted-letters');

  const justWrong = Coach.diagnose({
    skill: 'sound-count', given: 2, correct: 3, word: 'ship', phonemes: ['sh', 'i', 'p'],
  });
  assert.notStrictEqual(justWrong.key, 'counted-letters');
});

test('right sounds in the wrong order is diagnosed as order, not as wrong', () => {
  const m = Coach.diagnose({
    skill: 'segment-it', given: 't|a|s', correct: 's|a|t',
    phonemes: ['s', 'a', 't'], word: 'sat',
  });
  assert.strictEqual(m.key, 'order');
});

test('taking a sound from the wrong end is diagnosed positionally', () => {
  const m = Coach.diagnose({
    skill: 'first', given: 't', correct: 's', phonemes: ['s', 'a', 't'], word: 'sat',
  });
  assert.strictEqual(m.key, 'position');
});

test('a rhyme answer that matches the opening instead of the ending', () => {
  const m = Coach.diagnose({ skill: 'rhyme', given: 'cup', correct: 'bat', word: 'cat' });
  assert.strictEqual(m.key, 'rhyme-onset');
});

test('every misconception carries a cue usable before the answer is known', () => {
  for (const [k, m] of Object.entries(Coach.MISCONCEPTIONS)) {
    assert.ok(m.cue && m.cue.length > 12, `${k} needs a usable cue`);
    assert.ok(m.rule && m.rule.length > 12, `${k} needs a rule`);
    assert.ok(m.label, `${k} needs a label for reporting`);
  }
});

test('praise explains why a correct answer works', () => {
  const p = Coach.praise({ skill: 'sound-count', word: 'ship', phonemes: ['sh', 'i', 'p'] });
  assert.match(p, /3 sounds/);
  assert.match(p, /4 letters/, 'the point of the round is letters vs sounds');

  assert.match(Coach.praise({ skill: 'first', word: 'sat', correct: 's' }), /starts with/);
  assert.ok(Coach.praise({ skill: 'anything', word: 'cat', phonemes: ['c', 'a', 't'] }).length > 0);
});

test('an unrecognised slip still produces usable coaching', () => {
  // Coverage without authoring: nothing may fall through to a bare "wrong".
  const r = Coach.respond({ attempt: 1, skill: 'mystery', given: 'zzz', correct: 'qqq' });
  assert.ok(r.text.length > 10);
  assert.strictEqual(r.stage, 'coach');
});
