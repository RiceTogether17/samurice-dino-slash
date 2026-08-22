#!/usr/bin/env node
/**
 * tools/optimize-assets.js — shrink the shipped art.
 *
 * The art was exported straight from the generator as 1024x1536 PNGs. PNG is
 * a poor fit for painted, photographic-style artwork: the set weighed 109 MB,
 * which is the whole download budget of a phone on mobile data spent before
 * the first frame, plus the CPU cost of decoding 43 multi-megapixel images.
 *
 * WebP at high quality carries the same pixels for roughly a tenth of the
 * bytes. Resolution is preserved wherever the art is genuinely drawn large
 * (bosses fill most of the screen; backgrounds are scaled to screen height)
 * and capped only for art that is never drawn big — tiles, pickups, minions.
 *
 * Runtime scaling cost is handled separately by js/core/spriteCache.js; this
 * tool is purely about download size and decode time.
 *
 * Usage:
 *   node tools/optimize-assets.js            # report what would change
 *   node tools/optimize-assets.js --write    # convert, and delete the PNGs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

// Longest-side cap per directory. `null` keeps the source resolution.
const RULES = {
  backgrounds: { max: null, quality: 82 },  // scaled to full screen height
  dinosaurs:   { max: null, quality: 82 },  // bosses fill ~70% of the canvas
  sprites:     { max: 640,  quality: 85 },  // characters/tiles, <=300px on screen
  items:       { max: 256,  quality: 85 },  // small pickups and shop icons
  // assets/icons is deliberately absent: PWA and favicon entries must stay PNG.
};

const fmt = n => (n / 1048576).toFixed(1) + ' MB';

async function run() {
  let before = 0, after = 0, count = 0;
  const converted = [];

  for (const [dir, rule] of Object.entries(RULES)) {
    const abs = path.join(ROOT, 'assets', dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      const src = path.join(abs, name);
      const dst = src.replace(/\.png$/i, '.webp');
      const srcBytes = fs.statSync(src).size;

      let img = sharp(src);
      const meta = await img.metadata();
      if (rule.max && Math.max(meta.width, meta.height) > rule.max) {
        img = img.resize({
          width:  meta.width  >= meta.height ? rule.max : null,
          height: meta.height >  meta.width  ? rule.max : null,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      const buf = await img.webp({ quality: rule.quality, effort: 5 }).toBuffer();

      before += srcBytes;
      after  += buf.length;
      count++;
      converted.push(`assets/${dir}/${name}`);

      if (WRITE) {
        fs.writeFileSync(dst, buf);
        fs.unlinkSync(src);
      }
    }
  }

  console.log(`${count} images: ${fmt(before)} -> ${fmt(after)} ` +
              `(${(100 - after / before * 100).toFixed(1)}% smaller)`);
  if (!WRITE) console.log('dry run — pass --write to apply');
  return converted;
}

run().catch(e => { console.error(e); process.exit(1); });
