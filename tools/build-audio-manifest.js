#!/usr/bin/env node
/**
 * tools/build-audio-manifest.js
 *
 * Writes assets/audio/manifest.json listing the audio that actually ships.
 *
 * Without it the audio manager guesses URLs from the phonics tables and fires
 * a request for every word in all 30 stages. Most of those recordings were
 * never produced, so every cold boot generated ~250 failed requests competing
 * with sprite loading for connections. The manifest lets the manager skip
 * straight to its speech-synthesis fallback for anything not present.
 *
 * Re-run whenever audio files are added or removed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');
const PLAYABLE = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm']);

function walk(dir, base = '') {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) out = out.concat(walk(abs, rel));
    else if (PLAYABLE.has(path.extname(name).toLowerCase())) out.push(rel);
  }
  return out;
}

const files = walk(AUDIO).filter(f => f !== 'manifest.json');
const manifest = { generated: new Date().toISOString().slice(0, 10), files };

fs.mkdirSync(AUDIO, { recursive: true });
fs.writeFileSync(path.join(AUDIO, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const byDir = files.reduce((m, f) => {
  const d = f.includes('/') ? f.split('/')[0] : '.';
  m[d] = (m[d] || 0) + 1;
  return m;
}, {});
console.log(`assets/audio/manifest.json — ${files.length} files`);
for (const [d, n] of Object.entries(byDir)) console.log(`  ${d}: ${n}`);
