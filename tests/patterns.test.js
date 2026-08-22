'use strict';
/**
 * Combat patterns.
 *
 * The rebuild exists because the old battle's nine "mini-games" all reduced
 * to `{ answer, options }` — same physical action for every skill. These
 * tests protect the two things that fix: that each pattern has a genuinely
 * different verb, and that every word in the curriculum can still be played.
 */
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/combat/patterns.js');
const { loadScript } = require('./helpers/loadScript.js');

const { PHONICS_DATA } = loadScript('js/phonicsData.js', { capture: ['PHONICS_DATA'] });

const ENV = {
  W: 900, H: 520, relaxed: true, phase: 1, age: 0, floorY: 406,
  field: { x: 144, y: 125, w: 522, h: 177 },
};
const skillsOf = stage =>
  (stage.activities && stage.activities.length ? stage.activities : ['oral-blend']);

test('every word in every stage can build a playable round', () => {
  const failures = [];
  for (const stage of PHONICS_DATA.stageList) {
    for (const w of stage.words) {
      const built = P.build(skillsOf(stage), w, { words: stage.words, stage, phase: 1 });
      if (!built) failures.push(`stage ${stage.id} "${w.word}"`);
    }
  }
  assert.deepStrictEqual(failures, [], failures.join('\n'));
});

test('every round can be played through to completion', () => {
  // A round that cannot be finished is a soft-lock: the boss never takes
  // damage and the child cannot leave.
  const stuck = [];
  for (const stage of PHONICS_DATA.stageList) {
    for (const w of stage.words) {
      const { pattern, round } = P.build(skillsOf(stage), w,
        { words: stage.words, stage, phase: 1 });
      for (let i = 0; i < 3; i++) pattern.update(round, 1 / 60, { ...ENV, age: i });

      let done = false;
      for (let guard = 0; guard < 40 && !done; guard++) {
        const targets = pattern.targets(round);
        let acted = false;
        for (const t of targets) {
          const r = pattern.resolve(round, t.id);
          if (r && r.correct) { acted = true; done = !!r.complete; break; }
        }
        const ev = pattern.update(round, 1 / 60, ENV) || {};
        if (ev.complete) done = true;
        if (!acted && !targets.length && !ev.complete) break;
        if (!acted && targets.length) break;
      }
      if (!done) stuck.push(`${pattern.id} — stage ${stage.id} "${w.word}"`);
    }
  }
  assert.deepStrictEqual(stuck, [], stuck.join('\n'));
});

test('Blade Rush requires blend order, not just the right sounds', () => {
  const word = { word: 'cat', phonemes: ['c', 'a', 't'] };
  const round = P.bladeRush.build(word, { phase: 1 });
  P.bladeRush.update(round, 1 / 60, ENV);

  const last = round.runes.find(r => r.idx === 2);
  assert.strictEqual(P.bladeRush.resolve(round, last.id).correct, false,
    'jumping to the final sound must not count');

  const first = round.runes.find(r => r.idx === 0);
  assert.strictEqual(P.bladeRush.resolve(round, first.id).correct, true);
});

test('Sound Cleave refuses a cut inside a digraph', () => {
  const word = { word: 'ship', phonemes: ['sh', 'i', 'p'] };
  const round = P.soundCleave.build(word, {});
  assert.deepStrictEqual(round.boundaries, [2, 3]);
  assert.strictEqual(P.soundCleave.resolve(round, 'g1').correct, false,
    'cutting between s and h splits one sound in two');
  assert.strictEqual(P.soundCleave.resolve(round, 'g2').correct, true);
});

test('Sound Cleave declines words whose sounds do not spell them', () => {
  // "to" is /t/ + /oo/. There is no letter boundary to cut at, so the
  // mechanic would be asking for something impossible.
  assert.strictEqual(
    P.soundCleave.canBuild({ word: 'to', phonemes: ['t', 'oo'] }, {}), false);
  assert.strictEqual(
    P.soundCleave.canBuild({ word: 'ship', phonemes: ['sh', 'i', 'p'] }, {}), true);
});

test('Sound Strike answers depend on the position asked for', () => {
  const word = { word: 'cat', phonemes: ['c', 'a', 't'] };
  for (const [which, idx] of [['first', 0], ['middle', 1], ['last', 2]]) {
    const round = P.soundStrike.build(word, { which, phase: 1 });
    assert.strictEqual(round.answerIdx, idx, which);
  }
});

test('Sound Strike will not ask for a middle sound that does not exist', () => {
  const two = { word: 'at', phonemes: ['a', 't'] };
  assert.strictEqual(P.soundStrike.canBuild(two, { which: 'middle' }), false);
  assert.strictEqual(P.soundStrike.canBuild(two, { which: 'first' }), true);
});

test('Echo Duel makes inaction a correct, required response', () => {
  // This is the clearest proof the patterns are not a re-skinned button grid:
  // letting a non-rhyme pass is how you answer it.
  const words = [
    { word: 'cat', phonemes: ['c', 'a', 't'] },
    { word: 'bat', phonemes: ['b', 'a', 't'] },
    { word: 'dog', phonemes: ['d', 'o', 'g'] },
  ];
  const round = P.echoDuel.build(words[0], { words, phase: 1 });
  const nonRhyme = round.stones.find(s => !s.rhymes);
  assert.ok(nonRhyme, 'a non-rhyme must be present to be let through');
  assert.strictEqual(P.echoDuel.resolve(round, nonRhyme.id).correct, false,
    'slashing a non-rhyme is the mistake the pattern exists to surface');
});

test('Echo Duel counts a rhyme that reaches the player as a hit taken', () => {
  const words = [
    { word: 'cat', phonemes: ['c', 'a', 't'] },
    { word: 'bat', phonemes: ['b', 'a', 't'] },
    { word: 'dog', phonemes: ['d', 'o', 'g'] },
  ];
  const round = P.echoDuel.build(words[0], { words, phase: 1 });
  const env = { ...ENV, relaxed: false };
  let breached = false;
  for (let i = 0; i < 5000 && !breached; i++) {
    const ev = P.echoDuel.update(round, 1 / 60, env) || {};
    if (ev.breached) breached = true;
    if (ev.complete) break;
  }
  assert.ok(breached, 'an unslashed rhyme must eventually get through');
});

test('relaxed mode never lets the clock take a round away', () => {
  // Relaxed is the default for new readers. Nothing may advance on them.
  const word = { word: 'cat', phonemes: ['c', 'a', 't'] };
  const round = P.bladeRush.build(word, { phase: 1 });
  for (let i = 0; i < 2000; i++) {
    const ev = P.bladeRush.update(round, 1 / 60, { ...ENV, relaxed: true, age: i }) || {};
    assert.ok(!ev.breached, 'relaxed mode must never breach');
  }
});

test('each pattern implements the whole engine contract', () => {
  const required = ['id', 'title', 'skills', 'canBuild', 'build', 'skill',
                    'instruction', 'targets', 'hitTest', 'resolve', 'update', 'draw'];
  for (const pattern of P.ALL) {
    for (const key of required) {
      assert.ok(pattern[key] !== undefined, `${pattern.id} is missing ${key}`);
    }
    assert.ok(Array.isArray(pattern.skills) && pattern.skills.length,
      `${pattern.id} must declare the skills it plays`);
  }
});

test('every curriculum activity maps to a pattern', () => {
  const declared = new Set();
  for (const stage of PHONICS_DATA.stageList) for (const a of skillsOf(stage)) declared.add(a);
  const unmapped = [...declared].filter(a => !P.BY_SKILL[a]);
  assert.deepStrictEqual(unmapped, [],
    `activities with no mechanic: ${unmapped.join(', ')}`);
});

test('the skills actually spread across different mechanics', () => {
  // The failure being guarded against is the original one: many modes, one
  // play pattern. If everything collapsed onto a single pattern again, this
  // is where it would show.
  const used = new Set();
  for (const stage of PHONICS_DATA.stageList) {
    for (const w of stage.words) {
      const built = P.build(skillsOf(stage), w, { words: stage.words, stage, phase: 1 });
      if (built) used.add(built.pattern.id);
    }
  }
  assert.ok(used.size >= 4,
    `expected the campaign to exercise several mechanics, saw: ${[...used].join(', ')}`);
});
