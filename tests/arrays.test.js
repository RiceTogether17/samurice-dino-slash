'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compact, countWhere } = require('../js/core/arrays.js');

test('compact keeps matching elements in order, in place', () => {
  const list = ['a', 'b', 'c', 'd'];
  const returned = compact(list, v => v !== 'b');
  assert.deepStrictEqual(list, ['a', 'c', 'd']);
  assert.strictEqual(returned, list, 'must mutate rather than allocate');
});

test('compact handles the empty, all-kept and all-dropped cases', () => {
  const empty = [];
  compact(empty, () => true);
  assert.deepStrictEqual(empty, []);

  const kept = [1, 2, 3];
  compact(kept, () => true);
  assert.deepStrictEqual(kept, [1, 2, 3]);

  const dropped = [1, 2, 3];
  compact(dropped, () => false);
  assert.deepStrictEqual(dropped, []);
});

test('compact does not leave stale trailing references', () => {
  // A leftover reference past the new length would keep a defeated entity —
  // and everything it points at — alive for the collector.
  const list = [{ id: 1 }, { id: 2 }];
  compact(list, e => e.id === 1);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[1], undefined);
});

test('countWhere counts without building an array', () => {
  assert.strictEqual(countWhere([1, 2, 3, 4], n => n > 2), 2);
  assert.strictEqual(countWhere([], () => true), 0);
});
