#!/usr/bin/env node
/**
 * tools/normalise-facing.js — make every boss face the player.
 *
 * The boss art was generated inconsistently: sixteen sprites face left,
 * seven face right. Riku always stands on the left, so a single flip at draw
 * time is wrong for one group or the other whichever way you set it — which
 * is why the codebase once carried a hand-maintained list of "sprites that
 * need flipping", and why the boss ended up facing away from the fight.
 *
 * Fixing it in the data instead removes the whole class of bug: after this,
 * the renderer draws boss art as-is and never mirrors it.
 *
 * Facing is detected from pixel mass in the upper body — a dinosaur's head
 * and neck sit on the side it faces.
 *
 * Usage:
 *   node tools/normalise-facing.js          # report
 *   node tools/normalise-facing.js --write  # flip the right-facing ones
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'dinosaurs');
const WRITE = process.argv.includes('--write');

/** Ratio above which the mass difference counts as a facing, not noise. */
const CONFIDENCE = 1.05;

async function facingOf(file) {
  const meta = await sharp(file).metadata();
  const raw = await sharp(file).ensureAlpha().raw().toBuffer();
  const W = meta.width, H = meta.height;
  let left = 0, right = 0;
  // Upper body only: legs and tails are symmetric enough to drown the signal.
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
  const files = fs.readdirSync(DIR).filter(f => /\.(webp|png)$/i.test(f)).sort();
  const flipped = [];
  const kept = [];

  for (const name of files) {
    const file = path.join(DIR, name);
    const facing = await facingOf(file);
    if (facing !== 'right') { kept.push(`${name} (${facing})`); continue; }
    flipped.push(name);
    if (WRITE) {
      const out = await sharp(file).flop()
        .webp({ quality: 82, effort: 5 }).toBuffer();
      fs.writeFileSync(file, out);
    }
  }

  console.log(`${files.length} boss sprites checked`);
  console.log(`  already facing the player: ${kept.length}`);
  console.log(`  ${WRITE ? 'flipped' : 'would flip'}: ${flipped.length}`);
  for (const f of flipped) console.log(`    ${f}`);
  if (!WRITE && flipped.length) console.log('\ndry run — pass --write to apply');
}

main().catch(e => { console.error(e); process.exit(1); });
