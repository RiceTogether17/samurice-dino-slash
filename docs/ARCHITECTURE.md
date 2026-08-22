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
js/endlessBattle.js      the quick word challenge inside Dino Dash
js/combat/coach.js       what to say when an answer is wrong
js/combat/patterns.js    one play mechanic per phonics skill
js/combat/combatEngine.js the boss fight
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

The art was authored at 1024x1536 but drawn at 24-120 px. Canvas2D has no
mipmap chain, so a shrinking `drawImage` re-reads the entire source bitmap.
Measured on the runner before this work, that was 31-36 megapixels of texture
resampled per frame — around 2 gigapixels/second at 60 FPS, past what a
mid-range phone can sustain, and the main reason the game stuttered. It is now
under 1 MP/frame; see `tools/baselines/`.

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

## Combat: why the boss fight was rebuilt

The old `js/battleEngine.js` offered nine "mini-games" — segmenting, rhyming,
counting sounds, spotting a first or last sound. Every one of them ended up
building the same object: `{ answer, options }`. Whatever the skill, the
child's physical action was identical: read a prompt, tap one of four buttons,
see a tick.

The sibling project PhonicsQuest was audited for exactly this and the finding
generalises: *many different educational modes, but too few truly different
play patterns.* Samurice had it worse, because it sells itself as an action
game. The runner was a real platformer; the battle was a quiz wearing a
dinosaur costume, and the two halves shared nothing but a background.

So the phonics is now the fighting. `js/combat/` splits into three pieces:

- **`patterns.js`** — one *verb* per skill family, not one screen per skill:

  | Pattern | Verb | Skills |
  |---|---|---|
  | Blade Rush | slash the sounds in blend order before they reach you | oral-blend |
  | Sound Cleave | cut a solid word apart at its sound boundaries | segment-it, sound-count |
  | Sound Strike | pick the sound in a named position out of a turning ring | first, last, middle, letter-sound |
  | Echo Duel | deflect the rhymes, let the others pass | rhyme |
  | Flash Guard | the word is shown then hidden; strike the shield that had it | sight-word |

  Echo Duel is the clearest evidence this is a real change rather than a
  re-skin: **doing nothing is a required, correct response there.** No
  arrangement of a button grid produces that.

- **`combatEngine.js`** — the arena, health, the combo economy, input and
  round flow. It knows nothing about phonics; a pattern knows nothing about
  damage. Patterns implement a small contract (`canBuild`, `build`, `targets`,
  `hitTest`, `resolve`, `update`, `draw`) so the engine can drive any of them.

- **`coach.js`** — the reply to a wrong answer, modelled on PhonicsQuest's
  teaching ladder. First miss gives a cue and something to listen for and
  **withholds the answer**; second miss names the slip, gives the rule, then
  the answer; a correct answer gets one line of *why* it worked. Diagnosis
  runs off the phoneme data rather than hand-authored notes, so it covers the
  whole curriculum instead of the handful of words somebody wrote notes for.

Two properties are enforced by `tests/patterns.test.js` and worth keeping:
every word in all 30 stages must build a round and be playable to completion
(a round that cannot finish is a soft-lock), and relaxed mode — the default
for new readers — must never let the clock take a round away.

Adding a skill means adding a pattern and an entry in `BY_SKILL`. If a new
activity has no mechanic, the tests fail rather than silently falling back.

## Performance work

Two numbers matter, both from `tools/profile.js`:

- **source megapixels per frame** — how much texture the GPU reads. Hardware
  independent, so it means the same thing on a laptop and on CI. Budget: 5.
  Note that wall-clock draw time on a *desktop* can move the other way on
  light stages, where the cache's bookkeeping costs more than the texture
  reads it saves. That trade is deliberate: desktop has slack, phones do not.
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
