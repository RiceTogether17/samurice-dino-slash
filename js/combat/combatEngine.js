// ─────────────────────────────────────────────────────────────
// combat/combatEngine.js — the boss fight, rebuilt as real combat
//
// WHY THIS REPLACES battleEngine.js
//
// The old battle offered nine "mini-games", and every one of them ended up
// building the same object: `{ answer, options }`. Whatever the skill —
// segmenting, rhyming, counting sounds — the child's physical action was
// identical: read a prompt, tap one of four buttons, see a tick. An audit of
// the sibling project PhonicsQuest names this exact failure: *many different
// educational modes, but too few truly different play patterns.* Samurice had
// it worse, because it sells itself as an action game: the runner was a real
// platformer and the battle was a quiz wearing a dinosaur costume.
//
// So the phonics is now the fighting, not a quiz between rounds of fighting.
// Sounds arrive on the field as runes and the child acts on them directly —
// slashing them in blend order, cutting a word at its sound boundaries,
// striking the one in a named position, deflecting only the rhymes. Each
// skill gets its own verb (see combat/patterns/). The engine here owns the
// arena, the health, the combo economy and the input; a pattern owns what is
// on the field and what a hit means.
//
// It keeps battleEngine's public surface so slashGame.js drives it unchanged.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const TAP_SLOP = 14;          // px of movement still counted as a tap
  const ROUND_GAP_MS = 900;     // beat between rounds so a result can land
  const COMBO_STEP = 0.25;      // damage multiplier gained per linked hit
  const COMBO_MAX = 3;
  // Damage is a fraction of the boss's own health rather than a flat number,
  // so a fight lasts about the same number of rounds in world 1 and world 6.
  // Play-testing the flat version killed a world-2 boss in five correct
  // answers, which is not a boss fight.
  const ROUNDS_TO_WIN = 10;
  const CHIP_DAMAGE = 8;        // what a second miss costs the player
  const BOSS_PHASE_2 = 0.55;
  const BOSS_PHASE_3 = 0.25;

  class CombatEngine {
    constructor(canvas, overlay, stage, collectedPhonemes, sprites, audio, progress, W, H) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.overlay = overlay;
      this.stage = stage || {};
      this.sprites = sprites || {};
      this.audio = audio;
      this.progress = progress;
      this.W = W; this.H = H;

      // ── Fighters ───────────────────────────────────────────
      this.rikuMaxHp = 100;
      this.rikuHp = 100;
      this.bossMaxHp = stage.bossHp || 200;
      this.bossHp = this.bossMaxHp;

      // ── Run state ──────────────────────────────────────────
      this.state = 'intro';   // intro | duel | resolving | boss-defeated | done
      this.done = false;
      this.outcome = null;
      this.score = 0;
      this.learnedWords = [];
      this._learned = new Set();
      this._correctBlends = 0;
      this._streak = 0;
      this._bestStreak = 0;
      this._attempts = 0;
      this._hits = 0;
      this._roundNum = 0;
      this._paused = false;
      this._age = 0;
      this._bossPhase = 1;
      this._bossShake = 0;
      this._rikuShake = 0;
      this._flash = 0;
      this._slashFx = [];
      this._floaters = [];
      this._shards = [];
      this._banner = null;
      this._specialFx = 0;
      this._nextRoundAt = 0;
      // Impact feedback. A hit used to be a 14-frame wobble and a small
      // number that faded before you could read it — you could lose health
      // without ever seeing why. Every hit now stops the world for a moment,
      // flashes the sprite, knocks it back, and leaves a number up long
      // enough to read.
      this._freeze = 0;          // hit-stop frames
      this._bossFlash = 0;
      this._rikuFlash = 0;
      this._bossKnock = 0;
      this._rikuKnock = 0;
      this._tintCache = new Map();
      // Health bars drain toward the real value rather than snapping, so the
      // amount just lost is visible as a trailing ghost.
      this._bossHpShown = this.bossHp;
      this._rikuHpShown = this.rikuHp;

      // Sounds gathered in the runner charge the special attack, so the
      // platforming half of the stage feeds the fighting half.
      this._charge = 0;
      this._chargeMax = 6;
      this._collected = Array.isArray(collectedPhonemes) ? collectedPhonemes : [];

      // Relaxed mode is the default for new readers: runes hold position
      // instead of advancing, so nothing is lost by thinking for a while.
      this.relaxed = true;
      try { this.relaxed = localStorage.getItem('samurice_relaxed') !== '0'; } catch (_) {}

      // Each mechanic is taught once, the first time it ever appears. Without
      // this a child meets "cut the word between its sounds" with no idea
      // that swiping is even a thing the game accepts.
      this._seenPatterns = new Set();
      try {
        const raw = localStorage.getItem('samurice_seen_patterns');
        if (raw) this._seenPatterns = new Set(JSON.parse(raw));
      } catch (_) { /* private mode: teach it again, which is harmless */ }

      this._words = (stage.words || []).filter(w => w && w.word);
      this._wordMisses = new Map();   // word -> misses, for adaptive weighting
      // A review session is a fixed list, not a pool: each word is asked
      // once and the fight ends when the list does. Campaign stages leave
      // this unset and draw with replacement until the boss falls.
      this._pool = stage.oneShotWords ? this._words.slice() : null;
      if (this._pool) {
        for (let i = this._pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this._pool[i], this._pool[j]] = [this._pool[j], this._pool[i]];
        }
      }
      // How many clean rounds should take the boss down. A fixed list sizes
      // this to its own length; see the one-shot branch in `_completeRound`,
      // which then paces the bar to land on the last word exactly.
      this._roundsToWin = Math.max(1, stage.roundsToWin || ROUNDS_TO_WIN);
      this._round = null;
      this._pattern = null;
      this._attemptInRound = 0;
      this._feedback = { text: '', tone: 'neutral', until: 0 };

      this._buildOverlay();
      this._bindInput();
      this._nextRound();
    }

    // ── Arena geometry ───────────────────────────────────────
    // One source of truth: the HUD, the fighters and the duel field all read
    // from here, so nothing drifts when the canvas resizes.
    _layout() {
      const W = this.W, H = this.H;
      const floorY = Math.round(H * 0.78);
      // The duel field stops short of the boss so runes never fly through
      // it — the fighters frame the play area rather than sitting inside it.
      const fieldX = Math.round(W * 0.16);
      const fieldRight = Math.round(W * 0.74);
      return {
        W, H, floorY,
        // `y` is the fighters' feet, so both stand on the same ground line
        // whatever size they are.
        riku: { x: Math.round(W * 0.085), y: floorY, size: Math.round(H * 0.30) },
        boss: { x: Math.round(W * 0.865), y: floorY, size: Math.round(H * 0.42) },
        field: {
          x: fieldX,
          // Clear of the HUD: the health bars end around 0.12H and patterns
          // draw their own status line just above the field.
          y: Math.round(H * 0.24),
          w: fieldRight - fieldX,
          h: Math.round(H * 0.34),
        },
      };
    }

    // ── DOM strip ────────────────────────────────────────────
    // Action lives on the canvas, but the two controls a struggling reader
    // reaches for — hear it again, give me a hint — stay real buttons, and
    // the coach's words go in a live region so a screen reader announces them.
    _buildOverlay() {
      if (!this.overlay) return;
      this.overlay.classList.remove('hidden');
      this.overlay.classList.add('active');
      this.overlay.innerHTML = `
        <div class="cb-strip">
          <button class="cb-btn cb-hear" type="button">Hear it</button>
          <button class="cb-btn cb-hint" type="button">Hint</button>
        </div>
        <p class="cb-coach" role="status" aria-live="polite"></p>`;
      this._hearBtn = this.overlay.querySelector('.cb-hear');
      this._hintBtn = this.overlay.querySelector('.cb-hint');
      this._coachEl = this.overlay.querySelector('.cb-coach');
      this._hearBtn.addEventListener('click', () => this._speakTarget());
      this._hintBtn.addEventListener('click', () => this._useHint());
    }

    _bindInput() {
      const pos = e => {
        const r = this.canvas.getBoundingClientRect();
        const p = e.touches ? e.touches[0] : e;
        return { x: (p.clientX - r.left) * (this.W / r.width),
                 y: (p.clientY - r.top) * (this.H / r.height) };
      };
      this._down = e => {
        if (this._paused || this.done) return;
        this._drag = { ...pos(e), moved: 0 };
        this._trail = [{ ...this._drag }];
      };
      this._move = e => {
        if (!this._drag) return;
        const p = pos(e);
        this._drag.moved += Math.hypot(p.x - this._trail[this._trail.length - 1].x,
                                       p.y - this._trail[this._trail.length - 1].y);
        this._trail.push(p);
        if (this._trail.length > 24) this._trail.shift();
        if (e.cancelable) e.preventDefault();
      };
      this._up = e => {
        if (!this._drag) return;
        const start = this._drag;
        const end = this._trail[this._trail.length - 1] || start;
        this._drag = null;
        if (this._paused || this.done) return;
        // A short press is a strike at a point; a long one is a swipe, which
        // is the whole input for cutting a word apart.
        if (start.moved < TAP_SLOP) this._strike(end.x, end.y);
        else this._swipe(start, end);
      };
      this._key = e => {
        if (this.done) return;
        const k = e.key;
        if (this.state === 'primer') {
          if (k === ' ' || k === 'Enter') { this._dismissPrimer(); e.preventDefault(); }
          return;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          this._moveCursor(k === 'ArrowLeft' ? -1 : 1);
          e.preventDefault();
        } else if (k === ' ' || k === 'Enter') {
          this._strikeCursor();
          e.preventDefault();
        } else if (k === 'h' || k === 'H') {
          this._speakTarget();
        } else if (k === 's' || k === 'S') {
          this._unleashSpecial();
          e.preventDefault();
        }
      };
      this.canvas.addEventListener('pointerdown', this._down);
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      window.addEventListener('pointerup', this._up);
      document.addEventListener('keydown', this._key);
    }

    // ── Round flow ───────────────────────────────────────────
    _ladder() { return root.Review ? root.Review.shared() : null; }

    _pickWord() {
      if (this._pool) return this._pool.shift() || null;
      if (!this._words.length) return null;
      // Words the child has missed come round again sooner. Same principle as
      // PhonicsQuest's weighted selection: practice should concentrate where
      // it is needed rather than cycling uniformly.
      //
      // The review ladder gets a say too: a word this stage teaches that is
      // due for review is worth more than a word the child cleared an hour
      // ago, so the fight quietly doubles as the day's practice.
      const ladder = this._ladder();
      const due = new Set(ladder ? ladder.dueWords() : []);
      const weighted = [];
      for (const w of this._words) {
        const misses = this._wordMisses.get(w.word) || 0;
        let weight = 1 + Math.min(4, misses * 2);
        if (due.has(String(w.word).toLowerCase())) weight += 2;
        for (let i = 0; i < weight; i++) weighted.push(w);
      }
      const pool = weighted.filter(w => w.word !== this._lastWord);
      const from = pool.length ? pool : weighted;
      return from[Math.floor(Math.random() * from.length)];
    }

    _nextRound() {
      const word = this._pickWord();
      if (!word) { this._win(); return; }
      this._lastWord = word.word;
      this._roundNum++;

      const skills = (this.stage.activities || []).slice();
      // A stage with no declared activities still gets the signature mechanic.
      if (!skills.length) skills.push('oral-blend');

      const registry = root.CombatPatterns;
      const built = registry ? registry.build(skills, word, {
        words: this._words,
        stage: this.stage,
        phase: this._bossPhase,
      }) : null;

      if (!built) { this._win(); return; }
      this._pattern = built.pattern;
      this._round = built.round;
      this._attemptInRound = 0;

      if (!this._seenPatterns.has(this._pattern.id)) {
        this.state = 'primer';
        this._primerAge = 0;
        this._say(this._pattern.howTo, 'neutral', 9000);
        return;
      }
      this.state = 'duel';
      this._say(this._pattern.instruction(this._round), 'neutral', 2600);
      setTimeout(() => { if (!this.done) this._speakTarget(); }, 320);
    }

    _speakTarget() {
      if (!this._round || !this.audio) return;
      const w = this._round.word;
      if (this._pattern && this._pattern.speak) this._pattern.speak(this._round, this.audio);
      else if (w) this.audio.playWord(w.word);
    }

    _useHint() {
      if (!this._round || !this._pattern) return;
      if (this._pattern.hint) this._pattern.hint(this._round);
      this._say('Watch the glow.', 'hint', 1800);
      this.score = Math.max(0, this.score - 5);
    }

    // ── Input resolution ─────────────────────────────────────
    _dismissPrimer() {
      if (this.state !== 'primer' || this._primerAge < 20) return;
      this._seenPatterns.add(this._pattern.id);
      try {
        localStorage.setItem('samurice_seen_patterns',
                             JSON.stringify([...this._seenPatterns]));
      } catch (_) { /* nothing to do */ }
      this.state = 'duel';
      this._say(this._pattern.instruction(this._round), 'neutral', 2600);
      setTimeout(() => { if (!this.done) this._speakTarget(); }, 200);
    }

    _strike(x, y) {
      if (this.state === 'primer') { this._dismissPrimer(); return; }
      if (!this._round || !this._pattern || this.state !== 'duel') return;
      if (this._hitRiku(x, y) && this._unleashSpecial()) return;
      const id = this._pattern.hitTest(this._round, x, y, this._layout());
      if (id == null) return;
      this._slashFx.push({ x, y, age: 0, life: 18, angle: Math.random() * Math.PI });
      this.audio?.sfxSlash?.();
      const res = this._pattern.resolve(this._round, id);
      if (res) res.at = { x, y };
      this._apply(res);
    }

    _swipe(start, end) {
      if (!this._round || !this._pattern || this.state !== 'duel') return;
      if (!this._pattern.onSwipe) { this._strike(end.x, end.y); return; }
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      this._slashFx.push({ ...mid, age: 0, life: 20,
                           angle: Math.atan2(end.y - start.y, end.x - start.x) });
      this.audio?.sfxSlash?.();
      const res = this._pattern.onSwipe(this._round, start, end, this._layout());
      if (res) res.at = mid;
      this._apply(res);
    }

    /**
     * Rice Storm — the charge meter's payoff.
     *
     * Deliberately damage only: it never answers a round for the child. The
     * reward for accuracy is a bigger hit, not a skipped question, so the
     * thing being rewarded stays the thing being learned.
     */
    _unleashSpecial() {
      if (this._charge < this._chargeMax || this.state !== 'duel') return false;
      this._charge = 0;
      const dmg = Math.round(this.bossMaxHp * 0.16) + this._streak * 6;
      this.score += dmg * 4;
      this._specialFx = 40;
      this._hit('boss', dmg, { crit: true });
      this._showBanner('RICE STORM!', '#FF7043');
      this.audio?.sfxStarPower?.();
      this.audio?.sfxBossHit?.();
      if (this.bossHp <= 0) this._endRound(true);
      return true;
    }

    /** Did this strike land on Riku himself? That is how the special fires. */
    _hitRiku(x, y) {
      const L = this._layout();
      return Math.abs(x - L.riku.x) < L.riku.size * 0.5 &&
             y > L.riku.y - L.riku.size && y < L.riku.y + 10;
    }

    /**
     * Every hit in the fight goes through here.
     *
     * Centralised on purpose: damage was previously applied in five places,
     * three of which forgot to show a number at all, so the player could lose
     * health with no visible cause. Feedback scales with the size of the hit —
     * a chip is a nudge, a Rice Storm stops the screen.
     *
     * @param {'boss'|'riku'} who
     * @param {number} amount
     */
    _hit(who, amount, opts = {}) {
      const L = this._layout();
      const big = amount / (who === 'boss' ? this.bossMaxHp : this.rikuMaxHp);
      const weight = Math.min(1, big * 4 + (opts.crit ? 0.5 : 0));

      if (who === 'boss') {
        this.bossHp = Math.max(0, this.bossHp - amount);
        this._bossFlash = 1;
        this._bossKnock = 10 + weight * 22;
        this._bossShake = 12 + weight * 20;
      } else {
        this.rikuHp = Math.max(0, this.rikuHp - amount);
        this._rikuFlash = 1;
        this._rikuKnock = -(8 + weight * 16);
        this._rikuShake = 12 + weight * 16;
      }

      // Hit-stop: the frames where nothing moves are what make an impact
      // feel like it landed. Kept short so play never feels sluggish.
      this._freeze = Math.max(this._freeze, Math.round(3 + weight * 7));
      this._flash = Math.max(this._flash, 0.18 + weight * 0.35);

      const spot = who === 'boss' ? L.boss : L.riku;
      this._floaters.push({
        text: `-${amount}`,
        x: spot.x + (who === 'boss' ? -10 : 10),
        y: spot.y - spot.size * 0.72,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -2.4 - weight,
        age: 0,
        // Long enough to actually read: about a second and a half.
        life: 92,
        tone: who === 'boss' ? 'dmg' : 'hurt',
        crit: !!opts.crit,
      });
      if (!root.REDUCED_MOTION) this._burst({ x: spot.x, y: spot.y - spot.size * 0.5 });
    }

    _showBanner(text, color) {
      this._banner = { text, color, age: 0, life: 70 };
    }

    /** Shatter shards where a sound was cut. Density follows the quality tier. */
    _burst(at) {
      if (!at || root.REDUCED_MOTION) return;
      const density = root.Quality ? root.Quality.flags.particles : 1;
      const n = Math.round(14 * density);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        this._shards.push({
          x: at.x, y: at.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
          r: 2 + Math.random() * 3, age: 0, life: 26 + Math.random() * 16,
          hue: 40 + Math.random() * 40,
        });
      }
    }

    _moveCursor(dir) {
      if (!this._round || !this._pattern) return;
      const list = this._pattern.targets(this._round);
      if (!list.length) return;
      const cur = this._round.cursor || 0;
      this._round.cursor = (cur + dir + list.length) % list.length;
    }

    _strikeCursor() {
      if (!this._round || !this._pattern || this.state !== 'duel') return;
      const list = this._pattern.targets(this._round);
      if (!list.length) return;
      const t = list[this._round.cursor || 0];
      this._slashFx.push({ x: t.x, y: t.y, age: 0, life: 18, angle: 0.5 });
      this.audio?.sfxSlash?.();
      const res = this._pattern.resolve(this._round, t.id);
      if (res) res.at = { x: t.x, y: t.y };
      this._apply(res);
    }

    /** Turn a pattern's verdict into damage, combo, coaching and score. */
    _apply(result) {
      if (!result) return;
      const word = this._round.word;
      const skill = this._pattern.skill(this._round);

      if (result.correct) {
        this._streak++;
        this._bestStreak = Math.max(this._bestStreak, this._streak);
        this._hits++; this._attempts++;
        this.audio?.sfxCoin?.();
        this._burst(result.at);
        // Rewards escalate rather than firing at one volume for everything:
        // a sound landing is a spark, a run of them earns a banner, a clean
        // round earns charge, and only the boss falling gets the full show.
        if (this._streak === 3 || this._streak === 5 || this._streak % 8 === 0) {
          this._showBanner(`${this._streak} IN A ROW!`, '#FFD54F');
          this.audio?.sfxBoost?.();
        }
        if (result.complete) this._completeRound(result, word, skill);
        return;
      }

      // Missed.
      this._attempts++;
      this._streak = 0;
      this._attemptInRound++;
      this._wordMisses.set(word.word, (this._wordMisses.get(word.word) || 0) + 1);
      this.audio?.sfxWrongBlend?.();

      const reply = root.Coach.respond({
        attempt: this._attemptInRound,
        skill,
        given: result.given,
        correct: result.expected,
        phonemes: word.phonemes || [],
        word: word.word,
      });
      this._say(reply.text, reply.stage === 'coach' ? 'coach' : 'reteach', 4200);

      if (reply.stage === 'reteach') {
        // The second miss costs health and ends the round with the answer
        // shown, rather than letting a child grind a single word forever.
        this._hit('riku', CHIP_DAMAGE);
        this.progress?.recordBlend?.(this.stage.id, word.word, false, false, word.phonemes || []);
        this._ladder()?.grade(word.word, false, { stage: this.stage.id });
        if (this._pattern.reveal) this._pattern.reveal(this._round);
        this._endRound(false);
      }
    }

    _completeRound(result, word, skill) {
      const combo = Math.min(COMBO_MAX, 1 + this._streak * COMBO_STEP);
      const clean = this._attemptInRound === 0;
      // Combo is compressed into the multiplier rather than applied raw: at
      // full stretch it should reward mastery with a shorter fight, not turn
      // three lucky answers into an instant win.
      const base = this.bossMaxHp / this._roundsToWin;
      let dmg = Math.max(1, Math.round(base * (0.75 + 0.25 * combo) * (clean ? 1.15 : 0.75)));
      // A fixed list has no spare rounds to speed through: spread whatever
      // health is left over the words that are left, so the bar reaches
      // empty on the last word rather than three words early.
      if (this._pool) dmg = Math.max(1, Math.ceil(this.bossHp / (this._pool.length + 1)));

      this.score += dmg * 3 + (clean ? 40 : 10);
      this._correctBlends++;
      this.audio?.sfxBossHit?.();
      this._hit('boss', dmg, { crit: clean && this._streak >= 3 });

      if (clean) {
        const was = this._charge;
        this._charge = Math.min(this._chargeMax, this._charge + 1);
        this._showBanner('PERFECT!', '#7CFF9B');
        if (was < this._chargeMax && this._charge >= this._chargeMax) {
          this._showBanner('RICE STORM READY — tap Riku!', '#FF7043');
          this.audio?.sfxStarPower?.();
        }
        if (!this._learned.has(word.word)) {
          this._learned.add(word.word);
          this.learnedWords = [...this._learned];
        }
      }
      this.progress?.recordBlend?.(this.stage.id, word.word, true, clean, word.phonemes || []);
      // Only a first-attempt answer moves a word up the ladder. Getting it
      // right after being told the answer is worth praise, not promotion.
      this._ladder()?.grade(word.word, clean, { stage: this.stage.id });
      this._say(root.Coach.praise({ skill, word: word.word, phonemes: word.phonemes || [],
                                    correct: result.expected }), 'praise', 3000);
      this._endRound(true);
    }

    _endRound(won) {
      this.state = 'resolving';
      this._nextRoundAt = this._age + Math.round(ROUND_GAP_MS / 16.7);
      if (!won) this._checkLose();
    }

    _checkLose() {
      if (this.rikuHp <= 0 && !this.done) {
        this.done = true;
        this.outcome = 'defeat';
        this.state = 'done';
        this.audio?.sfxHurt?.();
      }
    }

    _win() {
      if (this.done) return;
      this.state = 'boss-defeated';
      this._defeatFrames = 120;
      this.audio?.sfxVictory?.();
    }

    // ── Per-frame ────────────────────────────────────────────
    update(dt = 1 / 60) {
      if (this._paused || this.done) return;
      // Hit-stop. Nothing advances for a few frames after an impact — this is
      // what separates "the number changed" from "that landed".
      if (this._freeze > 0) { this._freeze--; return; }
      this._age++;
      if (this._bossShake > 0) this._bossShake--;
      if (this._rikuShake > 0) this._rikuShake--;
      if (this._flash > 0) this._flash = Math.max(0, this._flash - 0.03);
      this._bossFlash = Math.max(0, this._bossFlash - 0.07);
      this._rikuFlash = Math.max(0, this._rikuFlash - 0.07);
      this._bossKnock *= 0.86;
      this._rikuKnock *= 0.86;
      // Health bars chase the real value so the loss is legible as movement.
      this._bossHpShown += (this.bossHp - this._bossHpShown) * 0.10;
      this._rikuHpShown += (this.rikuHp - this._rikuHpShown) * 0.10;

      for (let i = this._slashFx.length - 1; i >= 0; i--) {
        if (++this._slashFx[i].age > this._slashFx[i].life) this._slashFx.splice(i, 1);
      }
      for (let i = this._floaters.length - 1; i >= 0; i--) {
        const f = this._floaters[i];
        f.age++; f.y -= 1.1;
        if (f.age > f.life) this._floaters.splice(i, 1);
      }
      for (let i = this._shards.length - 1; i >= 0; i--) {
        const p = this._shards[i];
        p.age++; p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.98;
        if (p.age > p.life) this._shards.splice(i, 1);
      }
      if (this._banner && ++this._banner.age > this._banner.life) this._banner = null;
      if (this._specialFx > 0) this._specialFx--;

      const pct = this.bossHp / this.bossMaxHp;
      const phase = pct <= BOSS_PHASE_3 ? 3 : pct <= BOSS_PHASE_2 ? 2 : 1;
      if (phase !== this._bossPhase) {
        this._bossPhase = phase;
        this._say(phase === 3 ? 'The boss is enraged!' : 'The boss speeds up!', 'warn', 2200);
      }

      if (this.state === 'primer') { this._primerAge++; return; }
      if (this.state === 'boss-defeated') {
        if (--this._defeatFrames <= 0) { this.done = true; this.outcome = 'victory'; this.state = 'done'; }
        return;
      }
      if (this.state === 'resolving') {
        if (this._age >= this._nextRoundAt) {
          if (this.bossHp <= 0) this._win();
          else if (this.rikuHp <= 0) this._checkLose();
          else this._nextRound();
        }
        return;
      }
      if (this.state !== 'duel' || !this._round || !this._pattern) return;

      const env = { ...this._layout(), relaxed: this.relaxed, phase: this._bossPhase, age: this._age };
      const events = this._pattern.update(this._round, dt, env) || {};
      // A rune that reaches the player is a hit taken — the only way the
      // clock can hurt you, and only when relaxed mode is off.
      if (events.breached) {
        this._hit('riku', CHIP_DAMAGE);
        this._streak = 0;
        this.audio?.sfxHurt?.();
        this._say('It got through. Watch the order.', 'coach', 2200);
        this._checkLose();
      }
      if (events.complete) this._apply({ correct: true, complete: true, expected: events.expected });
    }

    draw() {
      const ctx = this.ctx;
      const L = this._layout();
      this._drawArena(ctx, L);
      if (this.state === 'duel' && this._round && this._pattern) {
        this._pattern.draw(this._round, ctx,
          { ...L, relaxed: this.relaxed, phase: this._bossPhase, age: this._age });
      }
      if (this.state === 'primer') this._drawPrimer(ctx, L);
      if (this.state === 'boss-defeated') this._drawVictory(ctx, L);
      this._drawShards(ctx);
      this._drawSlashes(ctx);
      if (this._specialFx > 0) this._drawSpecial(ctx, L);
      this._drawFloaters(ctx);
      this._drawHud(ctx, L);
      this._drawCharge(ctx, L);
      if (this._banner) this._drawBanner(ctx, L);
      if (this._paused) this._drawPause(ctx, L);
    }

    // ── Rendering ────────────────────────────────────────────
    _drawArena(ctx, L) {
      const key = `${this.stage.arenaBg || this.stage.bg || 'none'}@${L.W}x${L.H}`;
      const sp = this.sprites[this.stage.arenaBg] || this.sprites[this.stage.bg];
      if (sp && sp.complete && sp.naturalWidth > 0) {
        if (!this._bgCache || this._bgKey !== key) {
          const c = document.createElement('canvas');
          c.width = Math.max(1, L.W); c.height = Math.max(1, L.H);
          const g = c.getContext('2d');
          const s = Math.max(L.W / sp.naturalWidth, L.H / sp.naturalHeight);
          g.drawImage(sp, (L.W - sp.naturalWidth * s) / 2, (L.H - sp.naturalHeight * s) / 2,
                      sp.naturalWidth * s, sp.naturalHeight * s);
          g.fillStyle = 'rgba(6,10,26,0.42)';
          g.fillRect(0, 0, L.W, L.H);
          this._bgCache = c; this._bgKey = key;
        }
        ctx.drawImage(this._bgCache, 0, 0);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, L.H);
        g.addColorStop(0, '#1a2140'); g.addColorStop(1, '#0b0f1f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
      }

      // Ground line the fighters stand on.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, L.floorY, L.W, L.H - L.floorY);
      ctx.fillStyle = this.stage.groundColor || '#2E7D32';
      ctx.fillRect(0, L.floorY, L.W, 6);

      this._drawFighter(ctx, L.riku, this.sprites['riku-idle'],
                        this._rikuShake, this._rikuFlash, this._rikuKnock);
      this._drawFighter(ctx, L.boss, this.sprites[this._resolveBossSpriteKey()],
                        this._bossShake, this._bossFlash, this._bossKnock);

      if (this._flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this._flash})`;
        ctx.fillRect(0, 0, L.W, L.H);
      }
    }

    /**
     * Boss art is never mirrored here. The sprites were generated facing
     * inconsistent directions, so a flip at draw time is wrong for one group
     * or the other whichever way it is set — that is how the boss ended up
     * facing away from the fight. tools/normalise-facing.js fixes the data so
     * every boss already faces the player, and this stays a plain blit.
     */
    _drawFighter(ctx, spot, sprite, shake, flash = 0, knock = 0) {
      const sx = shake > 0 && !root.REDUCED_MOTION ? (Math.random() - 0.5) * shake : 0;
      const bob = Math.sin(this._age * 0.045) * spot.size * 0.02;
      ctx.save();
      ctx.translate(spot.x + sx + knock, spot.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 2, spot.size * 0.30, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const h = spot.size;
        const w = h * (sprite.naturalWidth / sprite.naturalHeight);
        // A squash on impact reads as force before the eye finds the number.
        const squash = 1 + flash * 0.12;
        ctx.drawImage(sprite, -w * squash / 2, -h + bob + h * (1 - 1 / squash), w * squash, h / squash);
        if (flash > 0.02) {
          const tint = this._tinted(sprite);
          if (tint) {
            ctx.globalAlpha = flash * 0.72;
            ctx.drawImage(tint, -w * squash / 2, -h + bob + h * (1 - 1 / squash), w * squash, h / squash);
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
    }

    _resolveBossSpriteKey() {
      const sp = this.sprites[this.stage.bossFile];
      const src = sp && typeof sp.src === 'string' ? sp.src : '';
      // Any image extension: pinning this to .png once silently disabled every
      // phase pose the moment the art moved to WebP.
      const m = src.match(/\/([A-Za-z0-9_-]+)\.[A-Za-z0-9]+(?:$|[?#])/);
      const species = (m ? m[1] : '').replace(/-(attack|hurt)$/, '');
      if (this._bossShake > 6 && species && this.sprites[`${species}-hurt`]) return `${species}-hurt`;
      if (this.state === 'duel' && species && this.sprites[`${species}-attack`]
          && this._age % 240 < 40) return `${species}-attack`;
      if (species && this.sprites[species]) return species;
      return this.stage.bossFile;
    }

    _drawSlashes(ctx) {
      for (const s of this._slashFx) {
        const t = s.age / s.life;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.moveTo(-60 - t * 40, 0);
        ctx.lineTo(60 + t * 40, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawShards(ctx) {
      for (const p of this._shards) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = `hsl(${p.hue},100%,62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _drawSpecial(ctx, L) {
      const t = 1 - this._specialFx / 40;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#FFD54F';
      ctx.lineWidth = 10 * (1 - t) + 2;
      for (let i = 0; i < 5; i++) {
        const y = L.field.y + L.field.h * (i / 4);
        ctx.beginPath();
        ctx.moveTo(L.riku.x, y - 40 + t * 60);
        ctx.lineTo(L.boss.x, y + 40 - t * 60);
        ctx.stroke();
      }
      ctx.restore();
    }

    /**
     * The charge meter, drawn under Riku so the payoff sits with the fighter
     * it belongs to rather than in a corner of the HUD.
     */
    _drawCharge(ctx, L) {
      const full = this._charge >= this._chargeMax;
      const w = L.riku.size * 0.9, h = 9;
      const x = L.riku.x - w / 2;
      const y = L.riku.y - L.riku.size - 18;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 6); ctx.fill();
      const pct = this._charge / this._chargeMax;
      if (pct > 0) {
        const pulse = full ? 0.75 + Math.sin(this._age * 0.2) * 0.25 : 1;
        ctx.globalAlpha = pulse;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#FFB300'); g.addColorStop(1, '#FF7043');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(x, y, w * pct, h, 4); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (full) {
        ctx.fillStyle = '#FFD54F';
        ctx.font = '900 11px "Nunito", system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('TAP ME', L.riku.x, y - 6);
      }
      ctx.restore();
    }

    _drawBanner(ctx, L) {
      const b = this._banner;
      const t = b.age / b.life;
      const pop = t < 0.2 ? t / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.2);
      ctx.translate(L.W / 2, L.field.y + L.field.h + 40);
      ctx.scale(0.75 + pop * 0.35, 0.75 + pop * 0.35);
      ctx.font = '900 30px "Nunito", system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
    }

    /**
     * Damage numbers.
     *
     * The shape of the animation is the whole point: punch in oversized,
     * settle, hold still while it is read, then leave. The previous version
     * faded linearly from frame zero, so the number was already half gone by
     * the time the eye found it.
     */
    _drawFloaters(ctx) {
      for (const f of this._floaters) {
        const t = f.age / f.life;
        let scale;
        if (f.age < 6) scale = 0.4 + (f.age / 6) * 1.05;        // punch in
        else if (f.age < 14) scale = 1.45 - ((f.age - 6) / 8) * 0.45;  // settle
        else scale = 1.0;
        const alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;      // hold, then go

        const size = (f.crit ? 40 : 30) * scale;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        // Keep the number on screen. Fighters stand near the edges, so a
        // number anchored to one — "CRITICAL" especially — ran off it.
        ctx.font = `900 ${size}px "Nunito", system-ui`;
        const half = Math.max(ctx.measureText(f.text).width,
                              f.crit ? ctx.measureText('CRITICAL').width * 0.42 * 2.4 : 0) / 2;
        const x = Math.min(Math.max(f.x, half + 10), this.W - half - 10);
        ctx.translate(x, Math.max(f.y, size * 0.8 + 66));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        // Heavy outline so a number stays readable over any painted arena.
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = size * 0.22;
        ctx.strokeText(f.text, 0, 0);
        const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
        if (f.tone === 'hurt') {
          grad.addColorStop(0, '#FFB4A8'); grad.addColorStop(1, '#E53935');
        } else if (f.crit) {
          grad.addColorStop(0, '#FFF6C2'); grad.addColorStop(1, '#FF8F00');
        } else {
          grad.addColorStop(0, '#FFF3C4'); grad.addColorStop(1, '#FFB300');
        }
        ctx.fillStyle = grad;
        ctx.fillText(f.text, 0, 0);
        if (f.crit && f.age < 40) {
          ctx.font = `900 ${size * 0.42}px "Nunito", system-ui`;
          ctx.strokeText('CRITICAL', 0, size * 0.72);
          ctx.fillStyle = '#FFD54F';
          ctx.fillText('CRITICAL', 0, size * 0.72);
        }
        ctx.restore();
      }
    }

    /**
     * A white-tinted copy of a sprite, cached per source, used for the hit
     * flash. Re-tinting every frame would mean a full-sprite composite per
     * hit frame; this pays for it once.
     */
    _tinted(sprite) {
      const key = sprite.src || sprite;
      let c = this._tintCache.get(key);
      if (c) return c;
      const w = sprite.naturalWidth, h = sprite.naturalHeight;
      if (!w || !h) return null;
      const cap = 320;                       // the flash never needs full res
      const s = Math.min(1, cap / Math.max(w, h));
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s));
      c.height = Math.max(1, Math.round(h * s));
      const g = c.getContext('2d');
      g.drawImage(sprite, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      this._tintCache.set(key, c);
      return c;
    }

    _drawHud(ctx, L) {
      const marginL = 64, marginR = 116;
      const barW = Math.min(L.W * 0.42, 200, (L.W - marginL - marginR - 24) / 2);
      /**
       * `ghost` is the value the bar is still draining from. The white band
       * between it and the real value is exactly the damage just taken, held
       * on screen for about a second — the clearest read there is on "how
       * much did that cost me".
       */
      const bar = (x, pct, ghost, c1, c2, label, right) => {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.roundRect(x - 3, 39, barW + 6, 24, 13); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.roundRect(x, 42, barW, 18, 9); ctx.fill();

        if (ghost > pct + 0.001) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.roundRect(x, 42, barW * ghost, 18, 9); ctx.fill();
        }
        if (pct > 0) {
          const g = ctx.createLinearGradient(x, 42, x, 60);
          g.addColorStop(0, c1); g.addColorStop(1, c2);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.roundRect(x, 42, barW * pct, 18, 9); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.beginPath(); ctx.roundRect(x + 2, 44, Math.max(0, barW * pct - 4), 6, 3); ctx.fill();
        }
        ctx.font = '800 11px "Nunito", system-ui';
        ctx.fillStyle = '#fff';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(label, right ? x + barW : x, 33);
      };
      const rp = Math.max(0, this.rikuHp / this.rikuMaxHp);
      const bp = Math.max(0, this.bossHp / this.bossMaxHp);
      bar(marginL, rp, Math.max(0, this._rikuHpShown / this.rikuMaxHp),
          rp > 0.5 ? '#6DD56B' : rp > 0.25 ? '#FFCA28' : '#FF5252', '#2E7D32',
          `RIKU ${Math.ceil(this.rikuHp)}`, false);
      bar(L.W - marginR - barW, bp, Math.max(0, this._bossHpShown / this.bossMaxHp),
          '#FF7043', '#B71C1C',
          `${this.stage.bossName || 'Boss'} ${Math.ceil(this.bossHp)}`, true);

      // Combo meter — the reason to keep a run of correct sounds going.
      if (this._streak > 1) {
        // Left-aligned under Riku's health, not centred: the middle of the
        // screen belongs to whatever status line the active pattern draws.
        ctx.save();
        ctx.font = '900 18px "Nunito", system-ui';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
        const t = `COMBO x${this._streak}`;
        ctx.strokeText(t, marginL, 84); ctx.fillText(t, marginL, 84);
        ctx.restore();
      }

      if (this._round && this._pattern && this.state === 'duel') {
        ctx.save();
        ctx.font = 'bold 15px "Nunito", system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        const label = this._pattern.title;
        const w = ctx.measureText(label).width;
        ctx.beginPath(); ctx.roundRect(L.W / 2 - w / 2 - 12, 8, w + 24, 22, 11); ctx.fill();
        ctx.fillStyle = '#EAF2FF';
        ctx.fillText(label, L.W / 2, 24);
        ctx.restore();
      }
    }

    /**
     * First-encounter primer: the one time a child is told what a new
     * mechanic's verb actually is. Blocks play until dismissed, because a
     * mechanic explained while sounds are already closing in is not explained.
     */
    _drawPrimer(ctx, L) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,8,20,0.82)';
      ctx.fillRect(0, 0, L.W, L.H);

      const cw = Math.min(L.W * 0.78, 560);
      const ch = Math.min(L.H * 0.56, 250);
      const cx = L.W / 2, cy = L.H * 0.44;
      const pop = Math.min(1, this._primerAge / 12);

      ctx.translate(cx, cy);
      ctx.scale(0.9 + pop * 0.1, 0.9 + pop * 0.1);
      ctx.globalAlpha = pop;

      const g = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2);
      g.addColorStop(0, '#243A6B');
      g.addColorStop(1, '#101A33');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#FFD54F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 20);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD54F';
      ctx.font = '900 15px "Nunito", system-ui';
      ctx.fillText('NEW MOVE', 0, -ch / 2 + 34);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(Math.min(34, cw * 0.075))}px "Nunito", system-ui`;
      ctx.fillText(this._pattern.title, 0, -ch / 2 + 74);

      ctx.fillStyle = '#D9E4FF';
      ctx.font = `600 ${Math.round(Math.min(17, cw * 0.036))}px "Nunito", system-ui`;
      this._wrap(ctx, this._pattern.howTo, cw - 64).forEach((line, i) => {
        ctx.fillText(line, 0, -ch / 2 + 112 + i * 24);
      });

      if (this._primerAge > 20) {
        ctx.globalAlpha = pop * (0.65 + Math.sin(this._age * 0.12) * 0.35);
        ctx.fillStyle = '#7CFF9B';
        ctx.font = '900 17px "Nunito", system-ui';
        ctx.fillText('Tap anywhere to start', 0, ch / 2 - 26);
      }
      ctx.restore();
    }

    /** Greedy word wrap, so a how-to line never runs off its card. */
    _wrap(ctx, text, maxWidth) {
      const words = String(text).split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; }
        else line = next;
      }
      if (line) lines.push(line);
      return lines;
    }

    /** The boss falling is the one moment that earns the full celebration. */
    _drawVictory(ctx, L) {
      const t = 1 - this._defeatFrames / 120;
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, t * 1.2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.globalAlpha = 1;

      if (!this._confetti) {
        this._confetti = Array.from({ length: root.LOW_FX ? 24 : 70 }, () => ({
          x: Math.random() * L.W, y: -Math.random() * L.H,
          vy: 2 + Math.random() * 3.4, vx: (Math.random() - 0.5) * 2,
          w: 5 + Math.random() * 8, h: 4 + Math.random() * 6,
          rot: Math.random() * Math.PI, rotV: (Math.random() - 0.5) * 0.2,
          c: ['#FFD700', '#FF4081', '#00E5FF', '#76FF03', '#FF9800', '#fff'][Math.floor(Math.random() * 6)],
        }));
      }
      for (const c of this._confetti) {
        c.y += c.vy; c.x += c.vx; c.rot += c.rotV;
        if (c.y > L.H + 20) { c.y = -20; c.x = Math.random() * L.W; }
        ctx.save();
        ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        ctx.fillStyle = c.c;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }

      const pop = Math.min(1, t * 4);
      ctx.translate(L.W / 2, L.H * 0.42);
      ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
      ctx.textAlign = 'center';
      ctx.font = '900 46px "Nunito", system-ui';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText('BOSS DOWN!', 0, 0);
      ctx.fillStyle = '#FFD700';
      ctx.fillText('BOSS DOWN!', 0, 0);
      ctx.font = '900 20px "Nunito", system-ui';
      ctx.fillStyle = '#EAF2FF';
      ctx.fillText(`Best streak x${this._bestStreak}  ·  ${this.getAccuracyPercent()}% accurate`, 0, 40);
      ctx.restore();
    }

    _drawPause(ctx, L) {
      const cx = L.W / 2, cy = L.H / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(6,4,10,0.74)';
      ctx.fillRect(0, 0, L.W, L.H);

      const pw = Math.min(320, L.W * 0.76), ph = 196;
      const px = cx - pw / 2, py = cy - ph / 2;
      ctx.fillStyle = 'rgba(18,12,20,0.94)';
      ctx.strokeStyle = root.UI.THEME.goldDim;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.fill(); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(Math.min(30, pw * 0.11))}px ${root.UI.THEME.font}`;
      ctx.fillStyle = root.UI.THEME.rice;
      ctx.fillText('Paused', cx, py + 36);

      const rw = Math.min(160, pw * 0.55);
      const grad = ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
      grad.addColorStop(0, 'rgba(242,193,78,0)');
      grad.addColorStop(0.5, root.UI.THEME.gold);
      grad.addColorStop(1, 'rgba(242,193,78,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - rw / 2, py + 58, rw, 2);

      const btnW = pw - 44, btnH = 46;
      const resumeY = py + 74;
      const g2 = ctx.createLinearGradient(0, resumeY, 0, resumeY + btnH);
      g2.addColorStop(0, '#D8433A'); g2.addColorStop(1, root.UI.THEME.lacquerDk);
      ctx.fillStyle = g2;
      ctx.strokeStyle = 'rgba(255,226,168,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(px + 22, resumeY, btnW, btnH, 13); ctx.fill(); ctx.stroke();
      ctx.font = `900 ${Math.round(Math.min(19, pw * 0.068))}px ${root.UI.THEME.font}`;
      ctx.fillStyle = '#FFF8E9';
      ctx.fillText('Resume', cx, resumeY + btnH / 2);
      this._pauseResumeBtnRect = { x: px + 22, y: resumeY, w: btnW, h: btnH };

      const quitY = resumeY + btnH + 12;
      ctx.fillStyle = 'rgba(28,18,26,0.85)';
      ctx.strokeStyle = root.UI.THEME.stroke; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(px + 22, quitY, btnW, btnH - 6, 13); ctx.fill(); ctx.stroke();
      ctx.font = `800 ${Math.round(Math.min(15, pw * 0.055))}px ${root.UI.THEME.font}`;
      ctx.fillStyle = root.UI.THEME.muted;
      ctx.fillText('Quit to map', cx, quitY + (btnH - 6) / 2);
      this._pauseQuitBtnRect = { x: px + 22, y: quitY, w: btnW, h: btnH - 6 };
      ctx.restore();
    }

    // ── Messaging ────────────────────────────────────────────
    _say(text, tone = 'neutral', ms = 2500) {
      this._feedback = { text, tone, until: this._age + Math.round(ms / 16.7) };
      if (this._coachEl) {
        this._coachEl.textContent = text;
        this._coachEl.dataset.tone = tone;
      }
    }

    // ── Public surface expected by slashGame ─────────────────
    applyCoinBonus() {
      // Sounds collected in the runner arrive as a head start on the special.
      this._charge = Math.min(this._chargeMax, this._charge + 2);
      this.bossHp = Math.max(0, this.bossHp - Math.round(this.bossMaxHp * 0.08));
    }

    getAccuracyPercent() {
      return this._attempts ? Math.round((this._hits / this._attempts) * 100) : 100;
    }

    _togglePause() { this._paused = !this._paused; }
    _stopBlendTimer() { /* no timers to stop: pacing is frame-driven */ }

    destroy() {
      this._destroyed = true;
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('pointermove', this._move);
      window.removeEventListener('pointerup', this._up);
      document.removeEventListener('keydown', this._key);
      if (this.overlay) this.overlay.innerHTML = '';
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { CombatEngine };
  root.CombatEngine = CombatEngine;
})(typeof window !== 'undefined' ? window : globalThis);
