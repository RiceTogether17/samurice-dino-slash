# Architecture

The game is a static site: no build step, no bundler, no framework. `index.html`
loads a series of classic scripts that share one global scope, and everything
renders into a single `<canvas>`. Deployment is a file copy.

That constraint is deliberate — it keeps the project deployable to GitHub Pages
and hackable without tooling — but it shapes how new code is added.

## Load order

Scripts are loaded in dependency order. `js/core/` comes first because
everything else assumes it exists.

```
js/core/arrays.js        allocation-free list maintenance
js/core/quality.js       device tier + adaptive graphics settings
js/core/spriteCache.js   pre-scaled texture cache
js/core/renderPatch.js   installs the cache over ctx.drawImage
js/phonicsData.js        the curriculum: 6 worlds x 5 stages
js/progressTracker.js    save data, achievements, shop
js/audioManager.js       Web Audio + speech synthesis
js/runnerEngine.js       the auto-runner phase
js/battleEngine.js       the word-blending boss phase
js/tutorial.js           first-play onboarding
js/slashGame.js          state machine, menus, world map
js/game.js               entry points and mode chooser
js/parentDashboard.js    progress reporting
js/engagementEngine.js   streaks and daily challenge
```

`sw.js` precaches this list for offline play. **If you add a script to
`index.html`, add it to `sw.js` too** — `tests/assets.test.js` enforces this,
because a script missing from the precache breaks the installed app offline
while working perfectly in the browser.

## The `js/core/` layer

These are the only files written to be testable outside a browser: each one
attaches its API to `window` for the game and to `module.exports` for
`node --test`. They have no DOM dependencies beyond an injectable canvas
factory. New shared infrastructure belongs here.

### `spriteCache.js` and `renderPatch.js`

The art is authored at 1024x1536 but drawn at 24-120 px. Canvas2D has no mipmap
chain, so a shrinking `drawImage` re-reads the entire source bitmap. Measured on
the runner, that was ~91 megapixels of texture resampled per frame — about
5.5 gigapixels/second at 60 FPS, far past a mid-range phone's budget, and the
main reason the game stuttered.

`spriteCache` scales each texture once into an offscreen canvas at a quantised
size and blits that afterwards. `renderPatch` installs it over
`CanvasRenderingContext2D.prototype.drawImage`, which is a deliberate choice:
the engines contain ~200 call sites, and one interception point is far less
error-prone than 200 edits. Set `window.__DISABLE_SPRITE_CACHE = true` before
the scripts load to A/B it.

The cache guards against re-entrancy with a `filling` flag rather than a saved
function reference, because the scaled copies live on `OffscreenCanvas`, whose
context rejects `CanvasRenderingContext2D` methods.

### `quality.js`

Three tiers (`low`/`medium`/`high`) gating glow, blur radius, particle density,
ambient effects, parallax depth, screen shake and render scale. Adaptation is
driven by the engine's own update+draw time, not the frame interval — the
interval also moves with vsync, throttling and page visibility, none of which
the renderer controls.

Quality drops fast and recovers slowly, and each downgrade lengthens the clean
streak the next upgrade needs, so a borderline device settles instead of
flapping. Players can pin a tier in the settings popover, which stops
adaptation. `window.LOW_FX` remains as a derived alias for older engine code.

## Performance work

Two numbers matter, both from `tools/profile.js`:

- **source megapixels per frame** — how much texture the GPU reads. Hardware
  independent, so it means the same thing on a laptop and on CI. Budget: 5.
- **frame cost p95** — how long the engine's own update+draw takes. Budget:
  8 ms, roughly half a 60 FPS frame, since compositing, GC, audio and input
  need the rest.

```bash
npm run profile -- --stage 21 --frames 300   # measure
npm run profile -- --stage 21 --cpu 8        # emulate a slow phone
npm run perf:check                           # the budget CI enforces
```

Both budgets are enforced by `.github/workflows/ci.yml`. The original bug
produced no test failure and no console error — only a game that felt bad — so
the budget is what turns that class of regression into a red build.

## Assets

Art ships as WebP. `tools/optimize-assets.js` regenerates it from PNG sources,
preserving resolution where art is drawn large (bosses, backgrounds) and
capping it where it never is (sprites 640 px, pickups 256 px).

Audio is gated by `assets/audio/manifest.json`, built by
`tools/build-audio-manifest.js`. The manager only requests what the manifest
lists; anything absent falls back to speech synthesis with no network request.
**Re-run that tool after adding or removing audio** — a stale manifest fails
`tests/assets.test.js`.

## Testing

`node --test` over `tests/`. Browser scripts are evaluated in a VM sandbox by
`tests/helpers/loadScript.js`; because a top-level `const` is a lexical binding
rather than a global property, pass `capture: ['NAME']` to lift one out.

The highest-value tests are the boring ones: `assets.test.js` verifies every
referenced file exists (the audio manager once requested ~250 recordings that
were never produced) and `phonicsData.test.js` checks the curriculum is
internally consistent, since a typo there teaches a child the wrong thing
rather than throwing.
