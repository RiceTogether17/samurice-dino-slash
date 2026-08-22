// ─────────────────────────────────────────────────────────────
// core/quality.js — device-aware, self-correcting graphics quality
//
// The previous behaviour was a one-way latch: the first time a device
// averaged under 40 FPS, `samurice_lowfx` was written to localStorage and the
// game rendered in reduced-effects mode on that device *forever*. A single
// unlucky stretch — a background tab, a load hitch, another app stealing the
// CPU — permanently downgraded the visuals with no way back.
//
// This replaces it with three tiers and hysteresis. Quality drops quickly when
// frames are genuinely expensive (players notice stutter immediately) and
// recovers slowly and cautiously when they are cheap again, requiring a longer
// clean streak after each downgrade so a borderline device settles instead of
// oscillating. Players can also pin a tier by hand, which disables adaptation.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const TIERS = ['low', 'medium', 'high'];

  // What each tier switches off. Read these instead of testing tier names, so
  // adding a tier later does not mean auditing every draw call.
  const PRESETS = {
    high:   { glow: true,  shadowBlurMax: 16, particles: 1.0,  ambient: true,  parallax: 3, screenShake: true,  maxDpr: 2 },
    medium: { glow: true,  shadowBlurMax: 8,  particles: 0.6,  ambient: true,  parallax: 2, screenShake: true,  maxDpr: 1.5 },
    low:    { glow: false, shadowBlurMax: 0,  particles: 0.35, ambient: false, parallax: 1, screenShake: false, maxDpr: 1 },
  };

  const STORAGE_KEY = 'samurice_quality';   // 'auto' | 'low' | 'medium' | 'high'
  const LEGACY_KEY  = 'samurice_lowfx';

  // Thresholds are measured against the *engine's own* update+draw time, not
  // the frame interval. A 60 FPS frame is 16.7 ms in total and the engine is
  // only one tenant of it — compositing, GC, audio and input need room too —
  // so the engine budget is about half the frame. Downgrade is deliberately
  // more sensitive than upgrade: shipping a stutter is worse than shipping a
  // slightly plainer frame.
  const DOWNGRADE_MS = 9;   // engine eating most of the frame
  const UPGRADE_MS   = 5;   // comfortably inside its share
  const WINDOW = 90;        // frames per decision (~1.5 s at 60 FPS)

  function detectTier(env) {
    const mem     = env.deviceMemory || 0;
    const cores   = env.hardwareConcurrency || 0;
    const dpr     = env.devicePixelRatio || 1;
    const mobile  = !!env.mobile;

    // Anything that reports very little memory or very few cores is a
    // low-end phone regardless of what else it claims.
    if ((mem && mem <= 2) || (cores && cores <= 2)) return 'low';
    if (mobile && dpr >= 3 && (!mem || mem <= 4)) return 'medium';
    if (mobile && (!mem || mem <= 4)) return 'medium';
    if (mem && mem >= 8 && cores && cores >= 8) return 'high';
    return mobile ? 'medium' : 'high';
  }

  function createQuality(env, storage) {
    let pinned = null;
    try {
      const saved = storage && storage.getItem(STORAGE_KEY);
      if (saved && saved !== 'auto' && TIERS.includes(saved)) pinned = saved;
      // Honour the old sticky flag once, then let adaptation take over.
      else if (!saved && storage && storage.getItem(LEGACY_KEY) === '1') pinned = null;
    } catch (_) { /* private mode — stay on defaults */ }

    let tier = pinned || detectTier(env);
    // How many clean windows the next upgrade needs. Each downgrade raises the
    // bar, so a device that keeps failing stops trying to climb back.
    let upgradeCost = 1;
    let goodWindows = 0;
    let samples = [];
    const listeners = [];

    const api = {
      get tier() { return tier; },
      get flags() { return PRESETS[tier]; },
      get adaptive() { return !pinned; },
      TIERS,

      /** Feed one frame's cost in milliseconds. */
      sample(ms) {
        if (pinned || !(ms > 0)) return tier;
        samples.push(ms);
        if (samples.length < WINDOW) return tier;

        const sorted = samples.slice().sort((a, b) => a - b);
        // The 75th percentile ignores one-off spikes (a GC pause, a texture
        // upload) while still reacting to work that is consistently too slow.
        const p75 = sorted[Math.floor(sorted.length * 0.75)];
        samples = [];

        if (p75 > DOWNGRADE_MS && tier !== 'low') {
          goodWindows = 0;
          upgradeCost = Math.min(8, upgradeCost * 2);
          set(TIERS[TIERS.indexOf(tier) - 1], 'slow frames');
        } else if (p75 < UPGRADE_MS && tier !== 'high') {
          if (++goodWindows >= upgradeCost) {
            goodWindows = 0;
            set(TIERS[TIERS.indexOf(tier) + 1], 'frames have headroom');
          }
        } else {
          goodWindows = 0;
        }
        return tier;
      },

      /** Pin a tier, or pass 'auto' to hand control back to adaptation. */
      prefer(choice) {
        if (choice === 'auto') { pinned = null; }
        else if (TIERS.includes(choice)) { pinned = choice; set(choice, 'player choice'); }
        else return tier;
        try {
          storage && storage.setItem(STORAGE_KEY, pinned || 'auto');
          storage && storage.removeItem(LEGACY_KEY);
        } catch (_) { /* ignore */ }
        return tier;
      },

      onChange(fn) { listeners.push(fn); },
      reset() { samples = []; goodWindows = 0; upgradeCost = 1; },
    };

    function set(next, reason) {
      if (!next || next === tier) return;
      const prev = tier;
      tier = next;
      // Existing engine code branches on this global; keep it in step so the
      // whole codebase does not have to change at once.
      root.LOW_FX = PRESETS[tier].glow === false;
      listeners.forEach(fn => { try { fn(tier, prev, reason); } catch (_) {} });
    }

    root.LOW_FX = PRESETS[tier].glow === false;
    return api;
  }

  const env = typeof navigator !== 'undefined' ? {
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    devicePixelRatio: root.devicePixelRatio,
    mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
  } : {};

  let storage = null;
  try { storage = root.localStorage || null; } catch (_) { storage = null; }

  const api = createQuality(env, storage);
  api.createQuality = createQuality;   // for tests
  api.detectTier = detectTier;
  api.PRESETS = PRESETS;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Quality = api;
})(typeof window !== 'undefined' ? window : globalThis);
