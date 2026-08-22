'use strict';
/**
 * Fight pacing.
 *
 * Damage used to be a flat number, which meant the same answer took a
 * world-1 boss down in a few hits and barely scratched a world-6 one. A
 * play-test killed a world-2 boss in five correct answers. Damage is now a
 * fraction of the boss's own health, so a fight is about the same length
 * everywhere; these tests keep it that way.
 *
 * The model here mirrors combatEngine's `_completeRound`. It is deliberately
 * a re-implementation rather than a call into the engine: the engine needs a
 * canvas, and what is being protected is the shape of the curve, not the
 * function.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadScript, ROOT } = require('./helpers/loadScript.js');

const { PHONICS_DATA } = loadScript('js/phonicsData.js', { capture: ['PHONICS_DATA'] });
const engineSrc = fs.readFileSync(path.join(ROOT, 'js/combat/combatEngine.js'), 'utf8');

const constant = name =>
  Number(engineSrc.match(new RegExp(`const ${name} = ([\\d.]+)`))[1]);

const ROUNDS_TO_WIN = constant('ROUNDS_TO_WIN');
const COMBO_STEP = constant('COMBO_STEP');
const COMBO_MAX = constant('COMBO_MAX');

function roundsToDefeat(bossMaxHp, { clean = true, buildCombo = true } = {}) {
  let hp = bossMaxHp;
  let streak = 0;
  let rounds = 0;
  while (hp > 0 && rounds < 200) {
    const combo = Math.min(COMBO_MAX, 1 + streak * COMBO_STEP);
    const dmg = Math.max(1, Math.round(
      (bossMaxHp / ROUNDS_TO_WIN) * (0.75 + 0.25 * combo) * (clean ? 1.15 : 0.75)));
    hp -= dmg;
    rounds++;
    streak = buildCombo ? streak + 1 : 0;
  }
  return rounds;
}

const bossHps = [...new Set(PHONICS_DATA.stageList.map(s => s.bossHp))];

test('every boss takes a similar number of rounds, whatever its health', () => {
  const lengths = bossHps.map(hp => roundsToDefeat(hp));
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  assert.ok(max - min <= 2,
    `fight length should not swing with boss HP: ${min}-${max} rounds`);
});

test('a fight is long enough to be a fight and short enough to finish', () => {
  for (const hp of bossHps) {
    const best = roundsToDefeat(hp, { clean: true, buildCombo: true });
    const worst = roundsToDefeat(hp, { clean: false, buildCombo: false });
    assert.ok(best >= 5, `boss ${hp} falls in ${best} rounds — too quick to be a boss`);
    assert.ok(worst <= 20, `boss ${hp} takes ${worst} rounds when struggling — too long`);
  }
});

test('playing well is rewarded but does not trivialise the fight', () => {
  for (const hp of bossHps) {
    const withCombo = roundsToDefeat(hp, { clean: true, buildCombo: true });
    const without = roundsToDefeat(hp, { clean: true, buildCombo: false });
    assert.ok(withCombo <= without, 'a combo must never make the fight longer');
    assert.ok(without - withCombo <= 6,
      `combo saves ${without - withCombo} rounds on boss ${hp} — too dominant`);
  }
});

test('a messy fight is slower than a clean one', () => {
  // Otherwise there is no mechanical reason to get it right first time.
  for (const hp of bossHps) {
    assert.ok(roundsToDefeat(hp, { clean: false, buildCombo: false })
            > roundsToDefeat(hp, { clean: true, buildCombo: false }),
      `misses must cost something on boss ${hp}`);
  }
});

test('the special attack is worth saving for but cannot end a fight alone', () => {
  const share = Number(engineSrc.match(/this\.bossMaxHp \* ([\d.]+)\)/)[1]);
  assert.ok(share >= 0.1, `Rice Storm at ${share} of boss HP is not worth charging`);
  assert.ok(share <= 0.25, `Rice Storm at ${share} of boss HP eclipses actual play`);
});
