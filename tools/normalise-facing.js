#!/usr/bin/env node
/**
 * tools/normalise-facing.js — make every boss face the player.
 *
 * Riku always stands on the left, so boss art has to face left. The art was
 * generated inconsistently: most sprites face left, a few face right, and
 * some `-attack` poses disagree with their own idle. A single flip at draw
 * time is wrong for one group or the other whichever way you set it, which
 * is why the codebase once carried a hand-maintained list of "sprites that
 * need flipping" and why bosses kept ending up facing away from the fight.
 *
 * Fixing it in the data removes the whole class of bug: after this the
 * renderer draws boss art as-is and never mirrors it.
 *
 * ── Why this is a table and not a detector ──────────────────────────────
 *
 * This tool used to guess, by comparing pixel mass either side of centre in
 * the upper body, on the theory that a dinosaur's head and neck sit on the
 * side it faces. It is wrong often enough to be dangerous: a big ear, a
 * raised tail or a swept wing outweighs a head, and the tool reported
 * "56 of 56 already facing the player" while four sprites faced right —
 * including the stage-2 boss, which shipped facing away from the player.
 *
 * A tool that confidently returns the wrong answer is worse than no tool.
 * The set is small, fixed, and human-checkable, so FACING below is a
 * reviewed table: every sprite was looked at on a contact sheet with a
 * centre line drawn through it. The pixel heuristic is kept, demoted to a
 * cross-check that prints where it disagrees — useful for spotting a new
 * sprite that was classified carelessly, never a source of truth.
 *
 * Adding art? Put it in the table. tests/bossSprites.test.js fails on any
 * sprite file that is not classified, so this cannot be skipped.
 *
 * Usage:
 *   node tools/normalise-facing.js          # report
 *   node tools/normalise-facing.js --write  # flip the right-facing ones
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'dinosaurs');

/**
 * Reviewed facing for every sprite in assets/dinosaurs.
 *
 *   'left'    — faces the player. Correct; left as-is.
 *   'right'   — faces away. Flipped by --write, and becomes 'left' on disk.
 *   'centred' — faces the viewer; neither flip is wrong.
 *   'right-text' — faces away, but MUST NOT be mirrored. See below.
 *
 * Entries are what the art looked like when reviewed. After a --write run
 * the files marked 'right' face left, so their entries are updated to
 * 'left' in the same commit — the table always describes what is on disk.
 *
 * ── 'right-text': why some art may never be flipped ─────────────────────
 *
 * A mirror flips everything in the image, including any writing in it.
 * glyph-goblin holds ABC blocks; flipping it to face the player turned the
 * B and the C backwards. This is a game that teaches letter–sound
 * correspondence to five-year-olds, and letter reversal is precisely the
 * confusion early readers have — so the boss of the letter-sounds stage
 * cannot be the thing modelling it.
 *
 * Facing the wrong way is a presentation bug. A mirrored B is a teaching
 * error. Where the two conflict the letters win, and the sprite keeps its
 * facing. Any future art carrying letters, numerals or kanji belongs in
 * this category too.
 */
const FACING = {
  'ankylosaurus-attack': 'left',
  'ankylosaurus-hurt': 'left',
  'ankylosaurus': 'left',
  'bamboo-bub': 'centred',
  'brachiosaurus-attack': 'left',
  'brachiosaurus-hurt': 'left',
  'brachiosaurus': 'left',
  'dilophosaurus-attack': 'left',
  'dilophosaurus-hurt': 'left',
  'dilophosaurus': 'left',
  'dojo-dino': 'centred',
  'echo-imp': 'left',        // was 'right' — the stage-2 boss, seen facing away in play
  // Faces away, and stays that way: it holds ABC blocks, and mirroring it
  // reverses the B and the C. See the 'right-text' note above.
  'glyph-goblin': 'right-text',
  'mini-w1-attack': 'left',
  'mini-w1-hurt': 'left',
  'mini-w1': 'left',
  'mini-w2-attack': 'left',
  'mini-w2-hurt': 'left',
  'mini-w2': 'left',
  'mini-w3-attack': 'left',
  'mini-w3-hurt': 'left',
  'mini-w3': 'left',
  'mini-w4-attack': 'left',  // was 'right' — disagreed with its own idle and hurt poses
  'mini-w4-hurt': 'left',
  'mini-w4': 'left',
  'mini-w5-attack': 'left',
  'mini-w5-hurt': 'left',
  'mini-w5': 'left',
  'mini-w6-attack': 'left',
  'mini-w6-hurt': 'left',
  'mini-w6': 'left',
  'pachycephalosaurus-attack': 'left',
  'pachycephalosaurus-hurt': 'left',
  'pachycephalosaurus': 'left',
  'paddy-pup': 'centred',
  'pteranodon-attack': 'left',
  'pteranodon-hurt': 'left',
  'pteranodon': 'left',      // was 'right' — disagreed with its own attack pose
  'reed-raptor': 'left',
  'rhyme-sprite': 'centred',
  'sound-sprout': 'centred',
  'spinosaurus-attack': 'left',
  'spinosaurus-hurt': 'left',
  'spinosaurus': 'left',
  'stegosaurus-attack': 'left',
  'stegosaurus-hurt': 'left',
  'stegosaurus': 'left',
  'trex-attack': 'left',
  'trex-hurt': 'left',
  'trex': 'left',
  'triceratops-attack': 'left',
  'triceratops-hurt': 'left',
  'triceratops': 'left',
  'velociraptor-attack': 'left',
  'velociraptor-hurt': 'left',
  'velociraptor': 'left',
};

/** Valid table values. */
const FACINGS = new Set(['left', 'right', 'centred', 'right-text']);

/**
 * Sprites --write will mirror. Note 'right-text' is deliberately excluded:
 * it faces away and is left alone anyway.
 */
const NEEDS_FLIP = new Set(
  Object.entries(FACING).filter(([, f]) => f === 'right').map(([n]) => n));

const baseName = file => file.replace(/\.(webp|png)$/i, '');
const spriteFiles = () =>
  fs.readdirSync(DIR).filter(f => /\.(webp|png)$/i.test(f)).sort();

/** Ratio above which a mass difference counts as a facing rather than noise. */
const CONFIDENCE = 1.05;

/**
 * The old detector, kept only to cross-check the table. Do not promote this
 * back to a decision — see the note at the top of the file.
 */
async function guessFacing(file) {
  const sharp = require('sharp');
  const meta = await sharp(file).metadata();
  const raw = await sharp(file).ensureAlpha().raw().toBuffer();
  const W = meta.width, H = meta.height;
  let left = 0, right = 0;
  for (let y = Math.floor(H * 0.10); y < Math.floor(H * 0.40); y++) {
    for (let x = 0; x < W; x++) {
      if (raw[(y * W + x) * 4 + 3] > 40) (x < W / 2 ? left++ : right++);
    }
  }
  if (left > right * CONFIDENCE) return 'left';
  if (right > left * CONFIDENCE) return 'right';
  return 'centred';
}

async function main() {
  const write = process.argv.includes('--write');
  const files = spriteFiles();

  const unclassified = files.map(baseName).filter(n => !(n in FACING));
  const badValues = Object.entries(FACING)
    .filter(([, f]) => !FACINGS.has(f)).map(([n, f]) => `${n}: ${f}`);
  const missing = Object.keys(FACING).filter(
    n => !files.some(f => baseName(f) === n));

  const flipped = [];
  const disagreements = [];

  for (const name of files) {
    const key = baseName(name);
    const file = path.join(DIR, name);
    const declared = FACING[key];
    if (!declared) continue;

    const guess = await guessFacing(file);
    if (guess !== declared) disagreements.push(`${key}: table says ${declared}, pixels suggest ${guess}`);

    if (!NEEDS_FLIP.has(key)) continue;
    flipped.push(key);
    if (write) {
      const sharp = require('sharp');
      const out = await sharp(file).flop().webp({ quality: 82, effort: 5 }).toBuffer();
      fs.writeFileSync(file, out);
    }
  }

  console.log(`${files.length} boss sprites checked against the reviewed table`);
  console.log(`  facing the player already: ${files.length - flipped.length}`);
  console.log(`  ${write ? 'flipped' : 'would flip'}: ${flipped.length}`);
  for (const f of flipped) console.log(`    ${f}`);

  if (disagreements.length) {
    console.log(`\ncross-check — the pixel heuristic disagrees on ${disagreements.length}:`);
    for (const d of disagreements) console.log(`    ${d}`);
    console.log('  (the heuristic is unreliable on big ears, raised tails and swept');
    console.log('   wings — check the art before trusting it over the table)');
  }

  const textLocked = Object.entries(FACING)
    .filter(([, f]) => f === 'right-text').map(([n]) => n);
  if (textLocked.length) {
    console.log(`\nfacing away but never flipped (carries letters):`);
    for (const n of textLocked) console.log(`    ${n}`);
  }

  if (badValues.length) {
    console.log(`\nunknown facing values:`);
    for (const v of badValues) console.log(`    ${v}`);
  }
  if (unclassified.length) {
    console.log(`\nNOT IN THE TABLE — classify these before shipping:`);
    for (const n of unclassified) console.log(`    ${n}`);
  }
  if (missing.length) {
    console.log(`\nin the table but not on disk:`);
    for (const n of missing) console.log(`    ${n}`);
  }
  if (!write && flipped.length) console.log('\ndry run — pass --write to apply');
  if (unclassified.length || badValues.length) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { FACING, FACINGS, NEEDS_FLIP, DIR, baseName, spriteFiles };
