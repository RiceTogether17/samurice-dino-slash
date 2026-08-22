'use strict';
/**
 * Every asset path the game names must exist on disk.
 *
 * This is the test the repository most needed: the audio manager was deriving
 * URLs for ~250 word recordings that were never produced, so each cold boot
 * fired that many failed requests, and nothing anywhere would have told you.
 * It also guards the PNG-to-WebP rename against a missed reference.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers/loadScript.js');

const SOURCES = ['index.html', 'sw.js', 'manifest.json',
  ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'js', 'core')).map(f => `js/core/${f}`),
  'css/style.css'];

const ASSET_RE = /assets\/[A-Za-z0-9_./-]+\.(png|webp|jpg|jpeg|svg|mp3|wav|ogg|json)/g;

/**
 * Drop comment lines before scanning. Documentation legitimately spells out
 * paths for files a contributor might add later ("drop word recordings in
 * assets/audio/words/"), and those are not broken references.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function referencedAssets() {
  const found = new Map();   // asset path -> files that name it
  for (const rel of SOURCES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const m of text.matchAll(ASSET_RE)) {
      if (!found.has(m[0])) found.set(m[0], []);
      if (!found.get(m[0]).includes(rel)) found.get(m[0]).push(rel);
    }
  }
  return found;
}

test('every statically referenced asset exists on disk', () => {
  const missing = [];
  for (const [asset, sources] of referencedAssets()) {
    if (!fs.existsSync(path.join(ROOT, asset))) missing.push(`${asset}  <- ${sources.join(', ')}`);
  }
  assert.deepStrictEqual(missing, [], `missing assets:\n${missing.join('\n')}`);
});

test('the audio manifest lists exactly what ships', () => {
  const manifestPath = path.join(ROOT, 'assets/audio/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'run tools/build-audio-manifest.js');
  const { files } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/audio', rel)), `manifest names missing ${rel}`);
  }

  const onDisk = [];
  const walk = (dir, base = '') => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, rel);
      else if (/\.(mp3|wav|ogg|m4a|webm)$/i.test(name)) onDisk.push(rel);
    }
  };
  walk(path.join(ROOT, 'assets/audio'));
  assert.deepStrictEqual([...files].sort(), onDisk.sort(), 'manifest is stale');
});

test('no oversized art slips back into the repository', () => {
  // The art once shipped as 1024x1536 PNGs totalling 109 MB. Nothing the game
  // draws needs to arrive as a multi-megabyte file.
  const LIMIT = 900 * 1024;
  const big = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else if (/\.(png|jpg|jpeg|webp)$/i.test(name) && fs.statSync(abs).size > LIMIT) {
        big.push(`${path.relative(ROOT, abs)} (${Math.round(fs.statSync(abs).size / 1024)} KB)`);
      }
    }
  };
  walk(path.join(ROOT, 'assets'));
  assert.deepStrictEqual(big, [], `oversized art — re-run tools/optimize-assets.js:\n${big.join('\n')}`);
});

test('the service worker precaches the core scripts it depends on', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  const missing = scripts.filter(s => !sw.includes(s));
  assert.deepStrictEqual(missing, [],
    `scripts loaded by index.html but absent from the precache list: ${missing.join(', ')}`);
});
