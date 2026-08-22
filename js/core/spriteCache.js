// ─────────────────────────────────────────────────────────────
// core/spriteCache.js — pre-scaled texture cache ("poor man's mipmaps")
//
// WHY THIS EXISTS
// The art in this game is authored at 1024x1536 but drawn at 24-120 px.
// Canvas2D has no mipmap chain, so every `drawImage` that shrinks a texture
// re-reads the *entire* source bitmap. Profiling the runner measured
// ~91 megapixels of source texture resampled per frame — around 5.5
// gigapixels/second at 60 FPS, which is far past what a mid-range phone GPU
// can sustain. That is the single largest cause of the game's stutter.
//
// The fix: the first time a texture is needed at a given size, scale it once
// into an offscreen canvas and keep it. Every later frame blits that canvas
// roughly 1:1, so per-frame source reads drop by two orders of magnitude.
//
// Sizes are quantised onto a ~1.25x geometric ladder so an animating scale
// (a coin pulsing, a boss lunging) reuses a handful of cache entries instead
// of allocating a fresh canvas every frame.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  // Quantisation ladder: at most ~25% oversample in each axis, which keeps
  // downscaled art crisp while bounding the number of cached variants.
  const STEPS = [
    8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160,
    192, 256, 320, 384, 512, 640, 768, 1024, 1280, 1536, 2048,
  ];

  function quantise(v) {
    for (let i = 0; i < STEPS.length; i++) if (STEPS[i] >= v) return STEPS[i];
    return Math.ceil(v);
  }

  // Only pay for a cached copy when the shrink is big enough to matter.
  // Textures already close to their draw size are cheap to blit directly.
  const MIN_SHRINK = 1.35;
  // Roughly 48 MB of RGBA backing store. Beyond this the least-recently-used
  // entries are dropped — a bounded cache never becomes its own memory bug.
  const MAX_PIXELS = 12e6;

  function createCache(makeCanvas) {
    // Bookkeeping list for LRU eviction. The *lookup* path deliberately does
    // not touch this — see the per-image map below.
    const all = new Set();       // entry objects
    let totalPixels = 0;
    let clock = 0;
    const stats = { hits: 0, misses: 0, evictions: 0, bytes: 0 };

    // When the global drawImage is intercepted (see core/renderPatch.js), the
    // blits this cache issues itself must bypass the interception or it would
    // recurse into the cache it is busy filling. A re-entrancy flag is used
    // rather than a saved function reference because the scaled copies live on
    // OffscreenCanvas, whose context does not accept CanvasRenderingContext2D
    // methods — calling one on it throws an illegal-invocation TypeError.
    let filling = false;

    // Cache entries hang off the source image itself under a numeric key, so a
    // steady-state frame costs one property read and one Map.get on a small
    // integer — no string building, no allocation. This matters: the runner
    // issues ~80 blits per frame and every one of them takes this path.
    const bucketKey = (qw, qh) => qw * 8192 + qh;

    function evictIfNeeded() {
      if (totalPixels <= MAX_PIXELS) return;
      const sorted = [...all].sort((a, b) => a.used - b.used);
      for (const e of sorted) {
        all.delete(e);
        e.owner.delete(e.key);
        totalPixels -= e.pixels;
        stats.evictions++;
        if (totalPixels <= MAX_PIXELS * 0.8) break;
      }
      stats.bytes = totalPixels * 4;
    }

    /**
     * Returns a drawable sized close to `w`x`h`. May be the original image
     * when scaling it would not pay for itself.
     */
    function get(img, w, h) {
      const sw = img.naturalWidth || img.width || 0;
      const sh = img.naturalHeight || img.height || 0;
      // An image still decoding has no usable pixels yet; drawing it now would
      // bake a blank frame into the cache permanently.
      if (!sw || !sh || img.complete === false) return img;
      if (!(w > 0) || !(h > 0)) return img;
      // Textures already near their draw size are cheap to blit directly.
      if (sw < w * MIN_SHRINK && sh < h * MIN_SHRINK) return img;

      const qw = sw < w ? sw : quantise(w);
      const qh = sh < h ? sh : quantise(h);
      const key = bucketKey(qw, qh);

      let owner = img.__scVariants;
      if (owner) {
        const hit = owner.get(key);
        if (hit) { hit.used = ++clock; stats.hits++; return hit.canvas; }
      } else {
        owner = img.__scVariants = new Map();
      }

      const canvas = makeCanvas(qw, qh);
      if (!canvas) return img;
      const g = canvas.getContext('2d');
      if (!g) return img;
      g.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
      filling = true;
      try {
        g.drawImage(img, 0, 0, sw, sh, 0, 0, qw, qh);
      } catch (_) {
        return img; // tainted or not yet decodable — fall back to the original
      } finally {
        filling = false;
      }

      const pixels = qw * qh;
      const entry = { canvas, pixels, used: ++clock, owner, key };
      owner.set(key, entry);
      all.add(entry);
      totalPixels += pixels;
      stats.misses++;
      stats.bytes = totalPixels * 4;
      evictIfNeeded();
      return canvas;
    }

    // Every blit the cache issues itself must bypass any interception layered
    // on top of drawImage, otherwise the wrapper re-enters this code forever.
    function blit(ctx, args) {
      filling = true;
      try { ctx.drawImage.apply(ctx, args); } finally { filling = false; }
    }

    /** Drop-in for the 5-argument `ctx.drawImage`. */
    function draw(ctx, img, dx, dy, dw, dh) {
      blit(ctx, [get(img, dw, dh), dx, dy, dw, dh]);
    }

    /**
     * Drop-in for the 9-argument `ctx.drawImage` (sprite-sheet frames).
     * The whole sheet is cached at the required scale, then the sub-rect is
     * blitted out of that — so animation frames all share one scaled copy.
     */
    function drawSub(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
      const nw = img.naturalWidth || img.width || 0;
      const nh = img.naturalHeight || img.height || 0;
      if (!nw || !nh || !sw || !sh) return;
      const scaleX = dw / sw;
      const scaleY = dh / sh;
      if (scaleX > 1 / MIN_SHRINK && scaleY > 1 / MIN_SHRINK) {
        blit(ctx, [img, sx, sy, sw, sh, dx, dy, dw, dh]);
        return;
      }
      const sheet = get(img, nw * scaleX, nh * scaleY);
      if (sheet === img) {
        blit(ctx, [img, sx, sy, sw, sh, dx, dy, dw, dh]);
        return;
      }
      const kx = sheet.width / nw;
      const ky = sheet.height / nh;
      blit(ctx, [sheet, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh]);
    }

    /**
     * Scale a set of images up front so the first frame that needs them does
     * not pay a decode-and-scale spike mid-gameplay.
     */
    function warm(images, sizes) {
      for (const img of images) {
        if (!img) continue;
        for (const [w, h] of sizes) get(img, w, h);
      }
    }

    function clear() {
      for (const e of all) e.owner.delete(e.key);
      all.clear();
      totalPixels = 0;
      stats.bytes = 0;
    }

    return {
      get, draw, drawSub, warm, clear, quantise,
      /** True while the cache is issuing its own blits — see renderPatch. */
      get filling() { return filling; },
      get stats() { return { ...stats, entries: all.size, pixels: totalPixels }; },
    };
  }

  const browserCanvas = (w, h) => {
    if (typeof document === 'undefined') return null;
    // OffscreenCanvas keeps the scaled copies off the DOM where available.
    if (typeof OffscreenCanvas !== 'undefined') {
      try { return new OffscreenCanvas(w, h); } catch (_) { /* fall through */ }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  const api = createCache(browserCanvas);
  api.createCache = createCache;   // exposed so tests can inject a fake canvas
  api.quantise = quantise;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpriteCache = api;
})(typeof window !== 'undefined' ? window : globalThis);
