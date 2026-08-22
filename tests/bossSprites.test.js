'use strict';
/**
 * The boss's attack and hurt poses are resolved by parsing its sprite URL.
 * That parse was pinned to ".png" and broke silently when the art moved to
 * WebP — no error, just a boss frozen in its idle frame for a whole fight.
 * These tests pin the behaviour to the format-agnostic rule. The parse moved
 * to combat/combatEngine.js when the boss fight was rebuilt; the trap it
 * guards against did not move, so the tests came with it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers/loadScript.js');

const source = fs.readFileSync(path.join(ROOT, 'js/combat/combatEngine.js'), 'utf8');
const RE = new RegExp(
  source.match(/const m = src\.match\((\/.*?\/)\);/s)[1].slice(1, -1));

const species = url => {
  const m = url.match(RE);
  return m ? m[1].replace(/-(attack|hurt)$/, '') : '';
};

test('species parses out of any image extension', () => {
  for (const ext of ['png', 'webp', 'jpg', 'avif']) {
    assert.strictEqual(species(`https://x/assets/dinosaurs/trex.${ext}`), 'trex', ext);
    assert.strictEqual(species(`https://x/assets/dinosaurs/trex-attack.${ext}`), 'trex', ext);
    assert.strictEqual(species(`https://x/assets/dinosaurs/trex-hurt.${ext}`), 'trex', ext);
  }
});

test('cache-busting query strings do not defeat the parse', () => {
  // The sprite loader retries with ?retry=... appended after a failed load.
  assert.strictEqual(species('https://x/assets/dinosaurs/spinosaurus.webp?retry=12-2'), 'spinosaurus');
});

test('hyphenated species names survive the suffix strip', () => {
  assert.strictEqual(species('https://x/assets/dinosaurs/t-rex-boss-attack.webp'), 't-rex-boss');
});

test('every boss sprite key resolves to a file that exists', () => {
  const { loadScript } = require('./helpers/loadScript.js');
  const { PHONICS_DATA } = loadScript('js/phonicsData.js', { capture: ['PHONICS_DATA'] });
  const slashSrc = fs.readFileSync(path.join(ROOT, 'js/slashGame.js'), 'utf8');

  const problems = [];
  for (const key of new Set(Array.from(PHONICS_DATA.stageList, s => s.bossFile))) {
    const m = slashSrc.match(
      new RegExp(`['"\`]${key}['"\`]\\s*:\\s*['"\`]([^'"\`]+)['"\`]`));
    if (!m) { problems.push(`${key}: no entry in SLASH_SPRITES`); continue; }
    if (!fs.existsSync(path.join(ROOT, m[1]))) problems.push(`${key}: ${m[1]} missing`);
  }
  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('phase poses follow the naming the resolver depends on', () => {
  // Not every boss has extra poses — the resolver falls back to the idle
  // frame by design. What must hold is that the ones which DO exist are named
  // "<species>-<pose>.<ext>", because that is the only thing the parse and
  // the sprite-key lookup agree on.
  const dir = path.join(ROOT, 'assets/dinosaurs');
  const posed = fs.readdirSync(dir).filter(f => /-(attack|hurt)\.\w+$/.test(f));
  assert.ok(posed.length > 0, 'expected at least some phase art to ship');

  for (const file of posed) {
    const base = file.replace(/-(attack|hurt)\.\w+$/, '');
    const idle = fs.readdirSync(dir).find(f => f.replace(/\.\w+$/, '') === base);
    assert.ok(idle, `${file} has no matching idle frame "${base}" to fall back to`);
    // The resolver reconstructs the species from the URL, so the round trip
    // must land back on the idle frame's name.
    assert.strictEqual(species(`https://x/assets/dinosaurs/${file}`), base);
  }
});
