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
js/core/ui.js            shared look for the canvas menus
js/core/quality.js       device tier + adaptive graphics settings
js/core/spriteCache.js   pre-scaled texture cache
js/core/renderPatch.js   installs the cache over ctx.drawImage
js/phonicsData.js        the curriculum: 6 worlds x 5 stages
js/progressTracker.js    save data, achievements, shop
js/audioManager.js       Web Audio + speech synthesis
js/runnerEngine.js       the auto-runner phase
js/endlessBattle.js      the quick word challenge inside Dino Dash
js/learn/review.js       the spaced-review ladder
js/combat/coach.js       what to say when an answer is wrong
js/combat/patterns.js    one play mechanic per phonics skill
js/combat/combatEngine.js the boss fight
js/tutorial.js           first-play onboarding
js/slashGame.js          state machine, menus, world map
js/game.js               entry points and mode chooser
js/parentDashboard.js    progress reporting
js/engagementEngine.js   streaks, daily gift, login calendar
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

### Fight pacing

Damage is a fraction of the boss's own health (`bossMaxHp / ROUNDS_TO_WIN`),
not a flat number. With a flat value the same answer flattened a world-1 boss
and barely marked a world-6 one; a play-test killed a world-2 boss in five
correct answers. Every boss now falls in 8-14 rounds depending on how cleanly
it is fought, and `tests/balance.test.js` fails if that spread drifts, if a
combo starts trivialising fights, or if misses stop costing anything.

Rice Storm — the charge meter's payoff — is deliberately damage only. It never
answers a round, so what is rewarded stays what is being learned.

Two properties are enforced by `tests/patterns.test.js` and worth keeping:
every word in all 30 stages must build a round and be playable to completion
(a round that cannot finish is a soft-lock), and relaxed mode — the default
for new readers — must never let the clock take a round away.

Adding a skill means adding a pattern and an entry in `BY_SKILL`. If a new
activity has no mechanic, the tests fail rather than silently falling back.

## Menus

The title screen is DOM (`#modeChooser` in `index.html`); everything past
PLAY is drawn on the canvas. Both now share one palette — ink ground, lacquer
for the single primary action, gold for accents, frosted panels over the
game's own painted backgrounds.

`js/core/ui.js` carries that for the canvas side: `scene` (painted background
plus a tunable scrim, cached per size), `heading`, `chip`, `card` and `ghost`.
Describe a menu with those rather than drawing one from scratch, or it will
drift — the mode picker used to be eight saturated pills in eight different
colours with no hierarchy, and stage select was dark green cards on a dark
green field.

### Game feel

Impacts go through one path per engine (`_hit` in combat, `_doPlayerHit` in
the runner) and scale their feedback to the size of the blow: hit-stop, a
white flash and squash on the struck sprite, knockback, screen shake, and a
damage number that punches in, holds while it is read, then leaves. Health
bars drain toward the new value so the amount lost is visible as movement.

The rule behind all of it: **anything that fades from frame zero is invisible.**
Both the combat floaters and the runner's particles used to, and both were
unreadable for it. Hold, then fade.

Two traps worth knowing:

- **Never set `display` on a screen's id selector.** `.screen { display: none }`
  is what hides inactive screens, and an id outranks it — doing this left the
  title screen painted on top of the running game. Put layout in
  `#id.active` instead. `tools/smoke.js` asserts exactly one screen is visible.
- **Neither top corner of the canvas is yours.** The pause button (left) and
  the fullscreen and close buttons (right) are DOM elements floating over it.
  Anything the HUD draws under them is invisible — this is how the runner's
  hearts ended up hidden behind the pause button. Keep 62 px clear on the left
  and 116 px on the right. This bites once per HUD — the campaign runner, the
  endless runner, and anything added later.

### Scrolling canvas screens

Achievements and the shop hold more than one screenful. Both read a scroll
offset when drawing and, for a long time, nothing anywhere wrote to one —
half of each list was simply unreachable. Anything long now goes through
`_scrollWindow(ctx, key, top, bottom, contentH, draw)`:

* the offset property is registered in the `SCROLLABLE` map, which is also
  what tells `_bindMenuScroll` whether a drag means anything on this screen;
* the drawing code publishes `contentH` every frame, so the clamp stays
  right when the list or the window changes size;
* the list is clipped to a real window and faded at each end when there is
  more.

A related trap: the canvas listens for **both** `touchstart` and `click`. On
a touch device the synthetic click lands ~300 ms after the touch, so an
unguarded handler acts twice — once on the screen you tapped, once on
whatever replaced it. `_canvasClick` ignores a click that follows a touch,
and a drag past a few pixels sets `_swallowClick` so scrolling does not also
press what is under the finger.

### Tiling painted backdrops

The endless runner repeats a campaign backdrop behind the action. These are
painted scenes, not tileable textures: their left and right edges have
nothing to do with each other, and repeating one put a hard vertical seam on
screen. The cached tile is the image followed by a mirrored copy of itself,
so every join meets its own reflection. It costs one extra canvas of memory
and nothing per frame — the blit is still 1:1.

## Retention

The game's reason to come back is the material, not a prize. This is a
deliberate position and the code is arranged to hold it.

### The review ladder — `js/learn/review.js`

A Leitner ladder of six boxes. Every word a child answers is filed in one,
and the box decides how many days pass before it is asked again:

| Box | 1 | 2 | 3 | 4 | 5 | 6 |
|-----|---|---|---|---|---|---|
| Days of rest | 0 | 1 | 2 | 4 | 8 | 16 |

Right answers move a word up; a miss drops it **two** boxes, not back to
one — wiping out a fortnight of work over one bad tap is punishing and
inaccurate. Everything is scheduled in whole local days, so there is no
midnight boundary to race.

Every mode grades into the same ladder. The campaign already practises
these words, so a child who plays thirty stage words has practised, and the
game does not then ask for twelve more. Combat also weights word selection
toward whatever is due, which makes a stage fight double as review.

Two rules that are easy to break by accident:

* **The day's queue is capped** (`DAILY_TARGET`). An uncapped ladder turns
  into a chore the first time somebody takes a week off, and a five-year-old
  who opens the game to sixty due words closes it again. A backlog is served
  worst-first, `DAILY_TARGET` at a time.
* **Nothing leaves the ladder.** A word in the top box still comes round
  again. Reading is not a checkbox.

### The review session

`_startReview` in `slashGame.js` builds a synthetic stage from the due
words: the arena and boss of the furthest stage in the queue, and every
mechanic those stages use, so each word is reviewed with the verb it was
taught with. Two combat options support it — `stage.oneShotWords` draws each
word once instead of sampling with replacement, and `stage.roundsToWin` plus
the one-shot branch in `_completeRound` pace the health bar across the words
that remain, so it empties on the last word rather than three words early.
`stage.id` is `0`, which is what stops a review touching campaign progress.

### The stopping cue

`_drawReviewDone` ends the session by saying the practice is finished. It
does not hide the other buttons — a child who wants to keep playing still
can — but "that's enough for today" is a first-class button next to "keep
playing", and nothing on the screen implies more is owed.

### What was removed, and why it must not come back

The engagement layer used to open with a numbered list that named its own
methods accurately: a "variable-ratio reward (most addictive loop)", a "Live
Countdown Timer — FOMO", and a "Streak Shield — spend rice to save a streak
(loss aversion)". Those are a slot machine, a sale timer and an insurance
policy, and the audience is five-year-olds. Beyond the ethics, nudge
techniques aimed at children are what the UK Children's Code exists to
prohibit, so this is a shipping risk as well.

| Was | Is | Why |
|-----|----|-----|
| Lucky Jar, random 8–60 rice | Daily Gift, fixed `DAILY_GIFT`, amount shown before the tap | The uncertainty was the mechanism; a known gift conditions nobody |
| Live countdown to midnight | A line saying what is ready to practise | Nothing expires at midnight, so there is nothing to count down |
| Streak Shield, 75 rice | Free automatic grace for one missed day | Selling protection only works if the child fears the loss |

`tests/engagement.test.js` pins all three by name. It asserts the absence of
`setInterval`, `SHIELD_COST`, `canUseShield` and the countdown helpers, and
that the daily gift contains no `Math.random`. A failure there is not a
rendering bug — it is the game going back to pressuring children.

What stayed, because it rewards returning without punishing absence: XP and
levels, the 7-day calendar, and the welcome-back bonus.

## Reach

Two numbers decide whether a shared link becomes a session, and both are
measured, not guessed.

**Taps to play.** PLAY drops straight into `progress.nextStageId()`; the mode
picker lives behind "More modes". It used to be four taps across four menus.
Keep it at one — anything added to that path costs sessions.

**First contentful paint.** The web font loads non-blocking (`media="print"`,
flipped to `all` on load). Measured with the font host unreachable, on the
same build: 13,712 ms blocking versus 204 ms non-blocking. Never add a
render-blocking third-party request; `domInteractive` is ~128 ms and should
stay that way.

**Shared links.** `?s=<stage>` opens that stage. If the recipient has not
unlocked it, it runs as a *preview*: playable, but `completeStage` is skipped
so it grants nothing. That combination is what lets a link land on the thing
being shared without handing out progression, and `tests/progression.test.js`
plus `tools/smoke.js` both pin it.

The share text is deliberately written for a grown-up ("My reader just beat
… They read ship, chat and fish"), because that is who forwards this kind of
game — parent to parent, teacher to teacher. A five-year-old is not going to
post a high score.

**The end card.** `_composeEndCard` paints the win at 1200×630 — the arena it
happened in, Riku, the boss, the stars, and the words the child read in the
largest type on the card. Text travels in a message; an image travels
everywhere else, and the words are the point of sending it. It is JPEG, not
PNG: the PNG of a full-bleed painted scene was over a megabyte. The share
tries `navigator.share` with the file, falls back to saving the image plus
the text on the clipboard, and falls back again to the plain text share —
every path ends with the button having done something.

### Sprite framing and facing

Two rules that bit hard enough to be worth writing down.

**Draw the character, not the frame.** Sprite frames carry wildly different
amounts of empty space — `riku-idle`'s character fills 46% of its frame's
height, `riku-hurt`'s fills 86%. Scaling by frame height drew Riku at about
half the size the layout asked for, and made him nearly double the instant a
pose swapped in. `_contentBox` measures the opaque bounding box once per
sprite (off a 128px downscale, so it is a ~16K-pixel scan, not 1.5M) and
`_drawFighter` fits *that* to `spot.size`, aligning feet to the floor line
and content centre to `spot.x`. Any new fighter art gets correct framing for
free; nobody has to trim padding by hand.

**Facing is a reviewed table, not a guess.** Riku stands on the left, so
bosses face left. `tools/normalise-facing.js` used to infer facing from pixel
mass either side of centre. It is wrong often enough to be dangerous: a big
ear, a raised tail or a swept wing outweighs a head. It reported "56 of 56
already facing the player" while four sprites faced right — including the
stage-2 boss, which shipped facing away from the fight for the whole stage.
The classification is now an explicit table, every entry eyeballed on a
contact sheet with a centre line drawn through it; the pixel heuristic is
kept only as a cross-check that prints disagreements. `tests/bossSprites.js`
fails on any sprite file missing from the table, so new art must be reviewed.

One category is not about facing at all: **`right-text` marks art that must
never be mirrored**. `glyph-goblin` holds ABC blocks, and flipping it to face
the player reversed the B and the C. Letter reversal is exactly the confusion
early readers have, so on a phonics game's letter-sounds boss it is a
teaching error, not a cosmetic one. Facing the wrong way is a presentation
bug; a backwards B is worse. The letters win.

### Honesty rules

Three things on the old screens were not true, and each one is now pinned by
a test because each was easy to write by accident:

* **No invented players.** The record book holds runs from this device. An
  empty book says it is empty rather than padding itself
  (`tests/engagement.test.js`).
* **No mastery without evidence.** The sound map reads attempt counts, so a
  sound the child has never been asked about cannot be coloured green
  (`tests/dashboard.test.js`).
* **No pressure mechanics.** See the Retention section's was/is table.

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
