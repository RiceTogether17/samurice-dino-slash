// ─────────────────────────────────────────────────────────────
// core/renderPatch.js — route every canvas blit through SpriteCache
//
// The engines contain roughly two hundred `ctx.drawImage` call sites spread
// across ~20k lines. Rewriting each one to consult the scaled-texture cache
// would be an enormous, error-prone diff for exactly the same effect, so the
// cache is installed once here at the single choke point they all share.
//
// The wrapper is deliberately conservative: anything that is not a
// significant downscale is handed straight to the original implementation,
// so the fast path stays a plain function call plus two comparisons.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  if (typeof CanvasRenderingContext2D === 'undefined') return;
  // Escape hatch for A/B diagnostics — set before the scripts load to compare
  // rendering with and without the scaled-texture cache.
  if (root.__DISABLE_SPRITE_CACHE) return;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.drawImage.__spriteCached) return;

  const cache = root.SpriteCache;
  if (!cache) {
    console.warn('[renderPatch] SpriteCache missing — textures will not be pre-scaled');
    return;
  }

  const original = proto.drawImage;

  function patched(img, a, b, c, d, e, f, g, h) {
    // Blits issued by the cache itself go straight through, otherwise
    // filling a scaled copy would re-enter the cache that is filling it.
    if (cache.filling) return original.apply(this, arguments);
    // 5-arg form: drawImage(img, dx, dy, dw, dh)
    if (arguments.length === 5) {
      const src = cache.get(img, c, d);
      return original.call(this, src, a, b, c, d);
    }
    // 9-arg form: drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
    if (arguments.length === 9) {
      return cache.drawSub(this, img, a, b, c, d, e, f, g, h);
    }
    // 3-arg form draws at natural size — nothing to shrink.
    return original.apply(this, arguments);
  }
  patched.__spriteCached = true;

  // Keep the pristine version reachable for the cache and for diagnostics.
  patched.original = original;
  proto.drawImage = patched;

  // The scaled copies are sized for the current backing-store scale. A DPR
  // change (moving a window between displays) invalidates them.
  if (typeof window !== 'undefined' && window.matchMedia) {
    let lastDpr = window.devicePixelRatio;
    window.addEventListener('resize', () => {
      if (window.devicePixelRatio !== lastDpr) {
        lastDpr = window.devicePixelRatio;
        cache.clear();
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
