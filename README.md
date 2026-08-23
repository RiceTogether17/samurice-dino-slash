# ⚔️ Samurice Dino Slash

Riku the Samurice fights dinosaurs using phonics power!
Blend words correctly to unleash devastating sword moves.

A kid-friendly, arcade-style phonics action game — run, jump, collect phoneme coins, and battle dinosaur bosses by blending words.

## Play

Deployed on GitHub Pages:
**https://RiceTogether17.github.io/samurice-dino-slash/**

## Controls

**Desktop**
- Arrow keys — move / jump
- Enter — confirm
- Escape / P — pause
- Q (while paused) — quit to map

**Mobile**
- On-screen D-pad — move & jump
- Tap phoneme tiles in order to blend words

## Game Modes

**Campaign (main mode)** — a Mario-style world map: **6 Worlds × 5 stages = 30 stages**,
sequenced by the science-of-reading progression so children master every phonics process:

| World | Theme | Phonics Skill |
|-------|-------|---------------|
| 1 · Rice Paddy Valley | 🌾 | Phonemic Awareness & Letter Sounds (first/last/middle sounds, rhyming, letter→sound) |
| 2 · Bamboo Dojo Forest | 🎋 | CVC Blending & Segmenting (short a/e/i/o/u) |
| 3 · Cherry Blossom Temple | 🌸 | Digraphs (sh, ch, th, wh) & Consonant Blends |
| 4 · Ancient Rice Ruins | 🏯 | Long Vowels — Magic-e & Vowel Teams |
| 5 · Mountain Terraces | ⛰️ | Sight Words & Word Families |
| 6 · Volcanic Peak | 🌋 | Multisyllabic Words & Mastery |

Each stage = an auto-runner (collect phoneme coins = **segmenting**) + a **boss
fight where the phonics *is* the fighting**. Sounds arrive on the field as runes
and you act on them directly — each skill has its own mechanic, not a shared
grid of buttons:

| Mechanic | What you do | Trains |
|---|---|---|
| ⚔️ **Blade Rush** | Slash the sounds in blend order before they reach you | Oral blending |
| 🪓 **Sound Cleave** | Cut a solid word apart at its sound boundaries | Segmenting, sound counting |
| 🎯 **Sound Strike** | Strike the sound in a named position out of a turning ring | First / last / middle sounds |
| 🛡️ **Echo Duel** | Deflect the words that rhyme — **let the others fly past** | Rhyme |
| ⚡ **Flash Guard** | The word flashes, then hides; strike the shield that carried it | Sight words |

Echo Duel is the one to try first: letting a non-rhyme through is how you
answer it, so *not acting* is a real move.

**Teaching design (teach → then test):**

- 🎓 **A coach, not an answer key** — get something wrong and the first reply is
  a cue and something to listen for, with the answer withheld. Only on a second
  miss does the game name the slip, give the rule and show the answer. Get it
  right and it tells you *why* it worked, not just "correct".
- 😌 **Relaxed Mode** holds the sounds still, so thinking time is never punished.
- 👁️ **Sight words stay whole** — in the runner, irregular sight words (the, was, said…)
  are collected as one whole-word coin instead of being sounded out letter-by-letter.
- 😊 **Relaxed Mode on by default** for new readers (no timer pressure); the timer can be
  switched on anytime from the stage-select screen for an extra challenge.

**Daily Review** — the words come back. Every word a child answers is filed on
a six-box [Leitner ladder](docs/ARCHITECTURE.md#the-review-ladder--jslearnreviewjs);
the box decides how many days pass before it is asked again (0, 1, 2, 4, 8, 16).
Right answers move a word up and quieten it; misses drop it back and it returns
the same day. Review is fought as a boss fight using each word's own mechanic,
not a worksheet.

The session is deliberately finite. The day's queue is capped, so two weeks
away does not present sixty words, and when the practice is done the game says
so and offers "that's enough for today" as a real button. There is no
countdown, no random-prize spin and nothing to buy to protect a streak — a
missed day is forgiven for free. The reason to come back is that the words you
nearly knew are due. See [Retention](docs/ARCHITECTURE.md#retention) for what
was removed and why it must not come back.

Plus shop, achievements, daily challenge, and an endless mode.

**Record book** — Dino Dash keeps the runs that happened on this device, with
an optional player name for a shared tablet. No invented rivals: an empty
book says so.

**For grown-ups** — the Progress screen leads with the review ladder: how many
words are learning, coming back at longer gaps, or known; what is due today;
and the words that keep slipping, *by name*, so there is something to read
together tonight. The sound map only claims a sound is solid when there is a
record of the child getting it right.

**Dino Dash** — Flappy-style side mode.

## Development

Static site — no build step required. Open `index.html` directly or deploy to
any static host (GitHub Pages, Netlify, Vercel, etc.).

Tooling is dev-only; the shipped game has no dependencies.

```bash
npm install
npm test              # unit tests (node --test)
npm run smoke         # end-to-end playthrough in headless Chromium
npm run lint          # eslint
npm run profile       # measure frame cost in headless Chromium
npm run perf:check    # the performance budget CI enforces
npm run screenshot    # capture gameplay stills for visual review
```

After changing art or audio:

```bash
npm run optimize-assets -- --write   # re-encode art to WebP
npm run audio:manifest               # rebuild the shipped-audio manifest
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit
together, why rendering goes through a texture cache, and which performance
numbers matter.

Made with ❤️ — Educational phonics + cute action = perfect for kids.
