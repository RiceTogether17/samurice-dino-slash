'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./helpers/loadScript');
const { PHONICS_DATA } = loadScript('js/phonicsData.js', { capture: ['PHONICS_DATA'] });
const { generateRunnerLevel } = loadScript('js/runnerEngine.js', { capture: ['generateRunnerLevel'] });
const { CombatEngine } = loadScript('js/combat/combatEngine.js');

test('all 30 generated routes have a safe start, reachable checkpoint, and complete sound groups', () => {
  for (const stage of PHONICS_DATA.stageList) {
    const level = generateRunnerLevel(stage, 520, {});
    const words = stage.words.slice(0, stage.journey.words);
    assert.equal(level.coins.length, words.reduce((n, w) => n + (w.sight ? 1 : w.phonemes.length), 0), `stage ${stage.id}`);
    assert.ok(level.coins.every(c => c.worldX >= 800));
    assert.ok(level.checkpoint.worldX > 800 && level.checkpoint.worldX < level.flag.worldX);
    assert.ok(level.totalWidth > level.flag.worldX);
    for (const p of [...level.platforms, ...level.movingPlatforms]) assert.ok(Number.isFinite(p.worldX));
  }
});

test('every chapter builds up practice and ends with a longer guardian fight', () => {
  for (const world of PHONICS_DATA.WORLDS) {
    const stages = world.stageIds.map(id => PHONICS_DATA.getStage(id));
    for (let i = 1; i < stages.length; i++) {
      assert.ok(stages[i].journey.words >= stages[i - 1].journey.words);
      assert.ok(stages[i].roundsToWin >= stages[i - 1].roundsToWin);
      assert.ok(stages[i].journey.terrain >= stages[i - 1].journey.terrain);
    }
    assert.ok(stages[4].roundsToWin > stages[0].roundsToWin);
  }
});

test('bamboo introduces fragile platforms after its opening stage', () => {
  const intro = generateRunnerLevel(PHONICS_DATA.getStage(6), 520, {});
  const practice = generateRunnerLevel(PHONICS_DATA.getStage(7), 520, {});
  assert.ok(intro.platforms.every(p => !p.fragile));
  assert.ok(practice.platforms.some(p => p.fragile));
});

test('real combat damage keeps each stage within a finite 5–17 answer session', () => {
  for (const stage of PHONICS_DATA.stageList) {
    for (const clean of [true, false]) {
      const e = Object.create(CombatEngine.prototype);
      Object.assign(e, { bossMaxHp: stage.bossHp, bossHp: stage.bossHp, _roundsToWin: stage.roundsToWin,
        _streak: 0, _attemptInRound: clean ? 0 : 1, _pool: null, score: 0, _correctBlends: 0,
        _charge: 0, _chargeMax: 6, _learned: new Set(), stage, audio: null, progress: null });
      e._hit = (_, damage) => { e.bossHp -= damage; };
      e._showBanner = e._say = e._endRound = () => {};
      e._ladder = () => null;
      // Coaching has its own tests; isolate the live damage calculation here.
      const sandbox = loadScript('js/combat/combatEngine.js', { Coach: { praise: () => '' } });
      let rounds = 0;
      while (e.bossHp > 0 && rounds < 30) {
        sandbox.CombatEngine.prototype._completeRound.call(e, {}, stage.words[0], 'first');
        if (clean) e._streak++;
        rounds++;
      }
      assert.ok(rounds >= 5 && rounds <= 17, `stage ${stage.id}: ${rounds} answers`);
    }
  }
});
