// ─────────────────────────────────────────────────────────────
// core/arrays.js — allocation-free list maintenance
//
// The engines prune dead entities with `list = list.filter(pred)`, which
// allocates a fresh array every frame for every entity category. The runner
// does this for platforms, coins, power-ups, four kinds of minion, flying
// enemies, particles, dust and shockwaves — a dozen or so short-lived arrays
// per frame, each one more work for the garbage collector, whose pauses are
// exactly the hitches players read as lag.
//
// `compact` does the same job in place. Pair it with predicates hoisted to
// module scope (see runnerEngine.js) so the per-frame cost is genuinely zero
// allocations rather than trading an array for a closure.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  /**
   * Remove every element for which `keep` returns false, in place.
   * Order is preserved. Returns the same array for convenience.
   */
  function compact(list, keep) {
    let write = 0;
    for (let read = 0; read < list.length; read++) {
      const item = list[read];
      if (keep(item)) {
        if (write !== read) list[write] = item;
        write++;
      }
    }
    list.length = write;
    return list;
  }

  /** Count matching elements without building an intermediate array. */
  function countWhere(list, pred) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (pred(list[i])) n++;
    return n;
  }

  const api = { compact, countWhere };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArrayOps = api;
})(typeof window !== 'undefined' ? window : globalThis);
