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
    _pickWord() {
      if (!this._words.length) return null;
      // Words the child has missed come round again sooner. Same principle as
      // PhonicsQuest's weighted selection: practice should concentrate where
      // it is needed rather than cycling uniformly.
      const weighted = [];
      for (const w of this._words) {
        const misses = this._wordMisses.get(w.word) || 0;
        const weight = 1 + Math.min(4, misses * 2);
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
      this.bossHp = Math.max(0, this.bossHp - dmg);
      this.score += dmg * 4;
      this._specialFx = 40;
      this._bossShake = 26;
      this._flash = 0.6;
      const L = this._layout();
      this._floaters.push({ text: `-${dmg}`, x: L.boss.x, y: L.boss.y - L.boss.size * 0.7,
                            age: 0, life: 70, tone: 'dmg' });
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
      this._rikuShake = 10;

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
        this.rikuHp = Math.max(0, this.rikuHp - CHIP_DAMAGE);
        this.progress?.recordBlend?.(this.stage.id, word.word, false, false, word.phonemes || []);
        if (this._pattern.reveal) this._pattern.reveal(this._round);
        this._endRound(false);
      }
    }

    _completeRound(result, word, skill) {
      const combo = Math.min(COMBO_MAX, 1 + this._streak * COMBO_STEP);
      const clean = this._attemptInRound === 0;
      const base = this.bossMaxHp / ROUNDS_TO_WIN;
      // Combo is compressed into the multiplier rather than applied raw: at
      // full stretch it should reward mastery with a shorter fight, not turn
      // three lucky answers into an instant win.
      const dmg = Math.max(1, Math.round(base * (0.75 + 0.25 * combo) * (clean ? 1.15 : 0.75)));

      this.bossHp = Math.max(0, this.bossHp - dmg);
      this.score += dmg * 3 + (clean ? 40 : 10);
      this._correctBlends++;
      this._bossShake = 14;
      this._flash = 0.35;
      this.audio?.sfxBossHit?.();
      this._floaters.push({ text: `-${dmg}`, x: this._layout().boss.x, y: this._layout().boss.y - 40,
                            age: 0, life: 60, tone: 'dmg' });

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
      this._age++;
      if (this._bossShake > 0) this._bossShake--;
      if (this._rikuShake > 0) this._rikuShake--;
      if (this._flash > 0) this._flash = Math.max(0, this._flash - 0.03);

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
        this.rikuHp = Math.max(0, this.rikuHp - CHIP_DAMAGE);
        this._streak = 0;
        this._rikuShake = 12;
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

      this._drawFighter(ctx, L.riku, this.sprites['riku-idle'], this._rikuShake);
      this._drawFighter(ctx, L.boss, this.sprites[this._resolveBossSpriteKey()], this._bossShake);

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
    _drawFighter(ctx, spot, sprite, shake) {
      const sx = shake > 0 && !root.REDUCED_MOTION ? (Math.random() - 0.5) * shake : 0;
      const bob = Math.sin(this._age * 0.045) * spot.size * 0.02;
      ctx.save();
      ctx.translate(spot.x + sx, spot.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 2, spot.size * 0.30, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const h = spot.size;
        const w = h * (sprite.naturalWidth / sprite.naturalHeight);
        ctx.drawImage(sprite, -w / 2, -h + bob, w, h);
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

    _drawFloaters(ctx) {
      for (const f of this._floaters) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
        ctx.font = '900 26px "Nunito", system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.tone === 'dmg' ? '#FFD54F' : '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
    }

    _drawHud(ctx, L) {
      const marginL = 64, marginR = 116;
      const barW = Math.min(L.W * 0.42, 200, (L.W - marginL - marginR - 24) / 2);
      const bar = (x, pct, c1, c2, label, right) => {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.roundRect(x - 2, 40, barW + 4, 22, 13); ctx.fill();
        if (pct > 0) {
          const g = ctx.createLinearGradient(x, 42, x, 62);
          g.addColorStop(0, c1); g.addColorStop(1, c2);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.roundRect(x, 42, barW * pct, 18, 9); ctx.fill();
        }
        ctx.font = 'bold 11px "Nunito", system-ui';
        ctx.fillStyle = '#fff';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(label, right ? x + barW : x, 34);
      };
      const rp = Math.max(0, this.rikuHp / this.rikuMaxHp);
      bar(marginL, rp, rp > 0.5 ? '#6DD56B' : '#FF5252', '#2E7D32',
          `RIKU ${Math.ceil(this.rikuHp)}`, false);
      bar(L.W - marginR - barW, Math.max(0, this.bossHp / this.bossMaxHp), '#FF7043', '#B71C1C',
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
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '900 34px "Nunito", system-ui';
      ctx.fillText('Paused', L.W / 2, L.H / 2 - 24);
      const bw = 190, bh = 44;
      this._pauseResumeBtnRect = { x: L.W / 2 - bw / 2, y: L.H / 2, w: bw, h: bh };
      this._pauseQuitBtnRect   = { x: L.W / 2 - bw / 2, y: L.H / 2 + 56, w: bw, h: bh };
      for (const [r, t, c] of [[this._pauseResumeBtnRect, 'Resume', '#43A047'],
                               [this._pauseQuitBtnRect, 'Quit to map', '#546E7A']]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 17px "Nunito", system-ui';
        ctx.fillText(t, r.x + r.w / 2, r.y + 28);
      }
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
