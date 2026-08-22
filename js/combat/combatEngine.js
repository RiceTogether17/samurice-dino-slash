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
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          this._moveCursor(k === 'ArrowLeft' ? -1 : 1);
          e.preventDefault();
        } else if (k === ' ' || k === 'Enter') {
          this._strikeCursor();
          e.preventDefault();
        } else if (k === 'h' || k === 'H') {
          this._speakTarget();
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
    _strike(x, y) {
      if (!this._round || !this._pattern || this.state !== 'duel') return;
      const id = this._pattern.hitTest(this._round, x, y, this._layout());
      if (id == null) return;
      this._slashFx.push({ x, y, age: 0, life: 18, angle: Math.random() * Math.PI });
      this.audio?.sfxSlash?.();
      this._apply(this._pattern.resolve(this._round, id));
    }

    _swipe(start, end) {
      if (!this._round || !this._pattern || this.state !== 'duel') return;
      if (!this._pattern.onSwipe) { this._strike(end.x, end.y); return; }
      this._slashFx.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2,
                           age: 0, life: 20,
                           angle: Math.atan2(end.y - start.y, end.x - start.x) });
      this.audio?.sfxSlash?.();
      this._apply(this._pattern.onSwipe(this._round, start, end, this._layout()));
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
      this._apply(this._pattern.resolve(this._round, t.id));
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
      const base = 18 + (this.stage.world || 1) * 2;
      const dmg = Math.round(base * combo * (clean ? 1.25 : 0.7));

      this.bossHp = Math.max(0, this.bossHp - dmg);
      this.score += dmg * 3 + (clean ? 40 : 10);
      this._correctBlends++;
      this._bossShake = 14;
      this._flash = 0.35;
      this.audio?.sfxBossHit?.();
      this._floaters.push({ text: `-${dmg}`, x: this._layout().boss.x, y: this._layout().boss.y - 40,
                            age: 0, life: 60, tone: 'dmg' });

      if (clean) {
        this._charge = Math.min(this._chargeMax, this._charge + 1);
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

      const pct = this.bossHp / this.bossMaxHp;
      const phase = pct <= BOSS_PHASE_3 ? 3 : pct <= BOSS_PHASE_2 ? 2 : 1;
      if (phase !== this._bossPhase) {
        this._bossPhase = phase;
        this._say(phase === 3 ? 'The boss is enraged!' : 'The boss speeds up!', 'warn', 2200);
      }

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
      this._drawSlashes(ctx);
      this._drawFloaters(ctx);
      this._drawHud(ctx, L);
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

      this._drawFighter(ctx, L.riku, this.sprites['riku-idle'], this._rikuShake, false);
      this._drawFighter(ctx, L.boss, this.sprites[this._resolveBossSpriteKey()], this._bossShake, true);

      if (this._flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this._flash})`;
        ctx.fillRect(0, 0, L.W, L.H);
      }
    }

    _drawFighter(ctx, spot, sprite, shake, flip) {
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
        if (flip) ctx.scale(-1, 1);
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
        ctx.save();
        ctx.font = '900 20px "Nunito", system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
        const t = `COMBO x${this._streak}`;
        ctx.strokeText(t, L.W / 2, 84); ctx.fillText(t, L.W / 2, 84);
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
