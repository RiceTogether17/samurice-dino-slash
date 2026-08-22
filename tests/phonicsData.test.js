'use strict';
/**
 * Integrity checks on the phonics curriculum.
 *
 * The stage tables are hand-maintained and drive everything: coins in the
 * runner, blending targets in battles, mini-game selection and the world map.
 * A typo here does not throw — it quietly teaches a child the wrong thing, or
 * spawns a stage that cannot be completed.
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadScript } = require('./helpers/loadScript.js');

const { PHONICS_DATA } = loadScript('js/phonicsData.js', { capture: ['PHONICS_DATA'] });

test('the campaign is six worlds of five stages', () => {
  assert.strictEqual(PHONICS_DATA.WORLDS.length, 6);
  assert.strictEqual(PHONICS_DATA.stageList.length, 30);
  for (const w of PHONICS_DATA.WORLDS) {
    assert.strictEqual(w.stageIds.length, 5, `world ${w.id} should have 5 stages`);
  }
});

test('stage ids are unique and run 1..30 in order', () => {
  // Array.from re-creates the list in this realm: the data is built inside a
  // VM sandbox, and deepStrictEqual compares prototypes across realms.
  const ids = Array.from(PHONICS_DATA.stageList, s => s.id);
  assert.deepStrictEqual(ids, Array.from({ length: 30 }, (_, i) => i + 1));
});

test('every stage carries the fields the engines read', () => {
  for (const stage of PHONICS_DATA.stageList) {
    const where = `stage ${stage.id} (${stage.name})`;
    assert.ok(stage.name, `${where}: name`);
    assert.ok(stage.world >= 1 && stage.world <= 6, `${where}: world in range`);
    assert.ok(Array.isArray(stage.words) && stage.words.length > 0, `${where}: words`);
    assert.ok(stage.bossName, `${where}: bossName`);
    assert.ok(Number.isFinite(stage.bossHp) && stage.bossHp > 0, `${where}: bossHp`);
  }
});

test('exactly one boss stage closes each world', () => {
  for (const w of PHONICS_DATA.WORLDS) {
    const stages = w.stageIds.map(id => PHONICS_DATA.stageList[id - 1]);
    const bosses = stages.filter(s => s.isBoss);
    assert.strictEqual(bosses.length, 1, `world ${w.id} needs exactly one boss`);
    assert.strictEqual(bosses[0].id, stages[stages.length - 1].id, 'boss must be last');
  }
});

test('every decodable word has phonemes that spell it back', () => {
  // The runner drops one coin per phoneme and the battle rebuilds the word by
  // concatenating them, so a mismatch makes a stage impossible to finish.
  //
  // Sight words are exempt by design: "to" really is taught as /t/ + /oo/,
  // and the irregular spelling is the reason they are learned whole.
  const problems = [];
  for (const stage of PHONICS_DATA.stageList) {
    for (const w of stage.words) {
      if (w.sight) continue;
      if (!Array.isArray(w.phonemes) || w.phonemes.length === 0) {
        problems.push(`stage ${stage.id}: "${w.word}" has no phonemes`);
        continue;
      }
      const joined = w.phonemes.join('').toLowerCase();
      if (joined !== String(w.word).toLowerCase()) {
        problems.push(`stage ${stage.id}: "${w.word}" != phonemes ${JSON.stringify(w.phonemes)}`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('difficulty rises monotonically across the campaign', () => {
  // Boss HP is the coarse difficulty dial; a later world must never be easier
  // than an earlier one or the progression stops meaning anything.
  const byWorld = PHONICS_DATA.WORLDS.map(w => {
    const hp = w.stageIds.map(id => PHONICS_DATA.stageList[id - 1].bossHp);
    return hp.reduce((a, b) => a + b, 0) / hp.length;
  });
  for (let i = 1; i < byWorld.length; i++) {
    assert.ok(byWorld[i] >= byWorld[i - 1],
      `world ${i + 1} average boss HP (${byWorld[i]}) is below world ${i} (${byWorld[i - 1]})`);
  }
});

test('no word is so long it cannot be blended on a phone', () => {
  for (const stage of PHONICS_DATA.stageList) {
    for (const w of stage.words) {
      assert.ok(w.phonemes.length <= 6,
        `stage ${stage.id}: "${w.word}" has ${w.phonemes.length} phoneme tiles`);
    }
  }
});
