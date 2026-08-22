'use strict';
const test = require('node:test');
const assert = require('node:assert');
const SpriteCache = require('../js/core/spriteCache.js');

/** A canvas stand-in that records how many scaled copies were produced. */
function fakeCanvasFactory(log) {
  return (w, h) => {
    log.push([w, h]);
    return {
      width: w,
      height: h,
      getContext: () => ({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage() {},
      }),
    };
  };
}

const img = (w, h) => ({ naturalWidth: w, naturalHeight: h, complete: true });

test('quantise rounds up onto the ladder without overshooting badly', () => {
  assert.strictEqual(SpriteCache.quantise(40), 40);
  assert.strictEqual(SpriteCache.quantise(41), 48);
  // Never more than ~1.35x oversample, or the cache stops paying for itself.
  for (const v of [9, 33, 100, 300, 700]) {
    const q = SpriteCache.quantise(v);
    assert.ok(q >= v, `${q} >= ${v}`);
    assert.ok(q / v < 1.4, `${q}/${v} within budget`);
  }
});

test('a texture drawn at the same size is only scaled once', () => {
  const log = [];
  const cache = SpriteCache.createCache(fakeCanvasFactory(log));
  const source = img(1024, 1536);
  for (let i = 0; i < 100; i++) cache.get(source, 40, 60);
  assert.strictEqual(log.length, 1, 'one scaled copy for a hundred draws');
  assert.strictEqual(cache.stats.hits, 99);
  assert.strictEqual(cache.stats.misses, 1);
});

test('textures near their draw size are passed through unscaled', () => {
  const log = [];
  const cache = SpriteCache.createCache(fakeCanvasFactory(log));
  const source = img(64, 64);
  assert.strictEqual(cache.get(source, 60, 60), source);
  assert.strictEqual(log.length, 0, 'no copy worth making');
});

test('an image still decoding is never cached', () => {
  // Caching a blank decode would persist it for the life of the page.
  const log = [];
  const cache = SpriteCache.createCache(fakeCanvasFactory(log));
  const pending = { naturalWidth: 0, naturalHeight: 0, complete: false };
  assert.strictEqual(cache.get(pending, 40, 60), pending);
  assert.strictEqual(log.length, 0);
});

test('nonsensical target sizes fall back to the original', () => {
  const cache = SpriteCache.createCache(fakeCanvasFactory([]));
  const source = img(1024, 1536);
  assert.strictEqual(cache.get(source, 0, 60), source);
  assert.strictEqual(cache.get(source, -5, 60), source);
  assert.strictEqual(cache.get(source, NaN, 60), source);
});

test('animated scaling reuses buckets instead of thrashing', () => {
  const log = [];
  const cache = SpriteCache.createCache(fakeCanvasFactory(log));
  const source = img(1024, 1536);
  // A coin pulsing between 38 and 44 px must not allocate a copy per frame.
  for (let f = 0; f < 120; f++) {
    const size = 38 + (f % 7);
    cache.get(source, size, size * 1.5);
  }
  assert.ok(log.length <= 3, `expected a handful of buckets, got ${log.length}`);
});

test('the cache stays inside its memory budget', () => {
  const log = [];
  const cache = SpriteCache.createCache(fakeCanvasFactory(log));
  // Many distinct large textures should evict rather than grow without bound.
  for (let i = 0; i < 400; i++) {
    cache.get({ naturalWidth: 2048, naturalHeight: 2048, complete: true, src: `i${i}` }, 1024, 1024);
  }
  assert.ok(cache.stats.evictions > 0, 'eviction must kick in');
  assert.ok(cache.stats.pixels <= 12e6, `budget held: ${cache.stats.pixels}`);
});

test('clear releases every entry and its per-image backref', () => {
  const cache = SpriteCache.createCache(fakeCanvasFactory([]));
  const source = img(1024, 1536);
  cache.get(source, 40, 60);
  assert.strictEqual(cache.stats.entries, 1);
  cache.clear();
  assert.strictEqual(cache.stats.entries, 0);
  assert.strictEqual(source.__scVariants.size, 0, 'stale backref would leak');
});

test('the filling flag brackets the cache\'s own blits', () => {
  // renderPatch relies on this to avoid recursing into the cache it is filling.
  const cache = SpriteCache.createCache((w, h) => ({
    width: w, height: h,
    getContext: () => ({
      drawImage() { assert.strictEqual(cache.filling, true); },
    }),
  }));
  assert.strictEqual(cache.filling, false);
  cache.get(img(1024, 1536), 40, 60);
  assert.strictEqual(cache.filling, false, 'flag must be cleared afterwards');
});
