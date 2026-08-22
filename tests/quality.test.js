'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Quality = require('../js/core/quality.js');

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _map: m,
  };
}

const feed = (q, ms, windows = 1) => {
  for (let w = 0; w < windows; w++) for (let i = 0; i < 90; i++) q.sample(ms);
};

test('device detection separates low-end phones from desktops', () => {
  assert.strictEqual(Quality.detectTier({ deviceMemory: 2, hardwareConcurrency: 4, mobile: true }), 'low');
  assert.strictEqual(Quality.detectTier({ deviceMemory: 8, hardwareConcurrency: 2, mobile: false }), 'low');
  assert.strictEqual(Quality.detectTier({ deviceMemory: 16, hardwareConcurrency: 12, mobile: false }), 'high');
  assert.strictEqual(Quality.detectTier({ deviceMemory: 4, hardwareConcurrency: 8, mobile: true }), 'medium');
});

test('sustained expensive frames step the tier down', () => {
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, fakeStorage());
  assert.strictEqual(q.tier, 'high');
  feed(q, 30);
  assert.strictEqual(q.tier, 'medium');
  feed(q, 30);
  assert.strictEqual(q.tier, 'low');
  feed(q, 30);
  assert.strictEqual(q.tier, 'low', 'must not fall below the lowest tier');
});

test('recovery is slower than degradation and needs a sustained clean streak', () => {
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, fakeStorage());
  feed(q, 30);                      // high -> medium
  assert.strictEqual(q.tier, 'medium');
  feed(q, 2);                       // a single good window is not enough
  assert.strictEqual(q.tier, 'medium');
  feed(q, 2);                       // ...a second one earns the upgrade
  assert.strictEqual(q.tier, 'high');
});

test('each downgrade raises the bar for climbing back', () => {
  // A device that keeps failing should stop trying, rather than flapping
  // between tiers and making the picture visibly pulse.
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, fakeStorage());
  feed(q, 30);                      // -> medium (upgrade cost now 2)
  feed(q, 30);                      // -> low    (upgrade cost now 4)
  feed(q, 2, 3);
  assert.strictEqual(q.tier, 'low', 'three clean windows is still short');
  feed(q, 2);
  assert.strictEqual(q.tier, 'medium');
});

test('frames in the middle band leave the tier alone', () => {
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, fakeStorage());
  feed(q, 7, 10);                   // between the upgrade and downgrade marks
  assert.strictEqual(q.tier, 'high');
});

test('a pinned tier disables adaptation and is persisted', () => {
  const store = fakeStorage();
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, store);
  q.prefer('low');
  assert.strictEqual(q.tier, 'low');
  assert.strictEqual(q.adaptive, false);
  feed(q, 1, 10);
  assert.strictEqual(q.tier, 'low', 'pinned tier must ignore measurements');
  assert.strictEqual(store.getItem('samurice_quality'), 'low');
});

test('choosing auto hands control back to adaptation', () => {
  const store = fakeStorage();
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, store);
  q.prefer('low');
  q.prefer('auto');
  assert.strictEqual(q.adaptive, true);
  assert.strictEqual(store.getItem('samurice_quality'), 'auto');
  feed(q, 2, 4);
  assert.notStrictEqual(q.tier, 'low', 'adaptation should resume');
});

test('a saved preference is restored on the next visit', () => {
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 },
    fakeStorage({ samurice_quality: 'medium' }));
  assert.strictEqual(q.tier, 'medium');
  assert.strictEqual(q.adaptive, false);
});

test('the old sticky lowfx flag no longer traps a device forever', () => {
  // The bug this replaced: one bad session pinned reduced effects permanently.
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 },
    fakeStorage({ samurice_lowfx: '1' }));
  assert.strictEqual(q.adaptive, true, 'must be free to recover');
});

test('tier presets stay ordered from cheapest to richest', () => {
  const { low, medium, high } = Quality.PRESETS;
  assert.ok(low.particles < medium.particles && medium.particles <= high.particles);
  assert.ok(low.maxDpr <= medium.maxDpr && medium.maxDpr <= high.maxDpr);
  assert.ok(low.shadowBlurMax < high.shadowBlurMax);
  assert.strictEqual(low.glow, false, 'the cheap tier must drop glow entirely');
});

test('storage failures do not break quality selection', () => {
  const hostile = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('private mode'); },
    removeItem() { throw new Error('private mode'); },
  };
  const q = Quality.createQuality({ deviceMemory: 16, hardwareConcurrency: 12 }, hostile);
  assert.ok(Quality.TIERS.includes(q.tier));
  assert.doesNotThrow(() => q.prefer('low'));
});
