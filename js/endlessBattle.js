'use strict';
// ============================================================
// ENDLESS BATTLE — js/endlessBattle.js
//
// The quick single-word challenge that punctuates Dino Dash's endless
// runner. Split out of the old js/battleEngine.js when the campaign boss
// fight was rebuilt as real-time combat (js/combat/): that file's other
// 2,450 lines were the multiple-choice battle the rebuild replaced, and
// keeping them around would have left a dead second implementation of the
// thing the game no longer does.
//
// Shows tiles on the HTML overlay, draws canvas FX, returns a result.
// result types: 'perfect' | 'good' | 'miss' | 'timeout'
// ============================================================

// ============================================================
// ENDLESS BATTLE ENGINE — appended to battleEngine.js
// Lightweight single-word phonics challenge for endless runner.
// Shows tiles on HTML overlay, draws canvas FX, returns result.
//
// result types: 'perfect' | 'good' | 'miss' | 'timeout'
// ============================================================

class EndlessBattleEngine {
  // timeLimit: seconds (default 4)
  constructor(canvas, overlay, wordObj, sprites, audio, logicalW, logicalH, onDone, autoBlend = false, slowMoBonus = 0) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.overlay  = overlay;
    this.word     = wordObj;   // { word, phonemes, hint }
    this.sprites  = sprites || {};
    this.audio    = audio;
    this.W        = logicalW || canvas.clientWidth  || 480;
    this.H        = logicalH || canvas.clientHeight || 700;
    this.onDone   = onDone;   // callback(result:'perfect'|'good'|'miss'|'timeout', timeUsed)
    this._autoBlend = autoBlend;
    this._slowMoBonus = Math.max(0, slowMoBonus || 0);

    // Endless runner slow-mo power-up grants more blend time at the gate battle.
    this.timeLimit  = 4.5 + this._slowMoBonus;
    this._timeLeft  = this.timeLimit;
    this._age       = 0;
    this._built     = [];   // phonemes tapped so far
    this._usedIdx   = new Set();
    this._wrongCount = 0;
    this._state     = 'blend'; // blend | result | done
    this._result    = null;
    this._resultAge = 0;
    this._startTime = performance.now();

    // Visual FX
    this._particles = [];
    this._slashLines= [];
    this._screenShake = 0;
    this._bgFlash   = null;  // { color, alpha }

    // Build overlay
    this._buildOverlay();

    // ── Keyboard tile selection for EndlessBattle ────────────
    this._kbHandler = (e) => this._onKeyDownEBE(e);
    document.addEventListener('keydown', this._kbHandler);

    // Auto-blend mode (power-up)
    if (this._autoBlend) {
      setTimeout(() => this._doAutoBlend(), 200);
    } else {
      // Speak word prompt
      if (audio) setTimeout(() => audio.playWord(wordObj.word), 250);
    }
  }

  _buildOverlay() {
    const ov = this.overlay;
    ov.innerHTML = '';
    ov.className = 'battle-overlay endless-battle-overlay active';

    // Hint emoji
    const hint = document.createElement('div');
    hint.className = 'ebe-hint';
    hint.textContent = this.word.hint || '📖';
    ov.appendChild(hint);

    // Word being built (blanks)
    this._blanksEl = document.createElement('div');
    this._blanksEl.className = 'ebe-blanks';
    ov.appendChild(this._blanksEl);
    this._renderBlanks();

    // Timer bar
    this._timerBarEl = document.createElement('div');
    this._timerBarEl.className = 'ebe-timer-bar';
    const timerFill = document.createElement('div');
    timerFill.className = 'ebe-timer-fill';
    this._timerFillEl = timerFill;
    this._timerBarEl.appendChild(timerFill);
    ov.appendChild(this._timerBarEl);

    // Phoneme tiles
    this._tilesEl = document.createElement('div');
    this._tilesEl.className = 'ebe-tiles';
    ov.appendChild(this._tilesEl);
    this._renderTiles();

    // Result message (hidden initially)
    this._resultEl = document.createElement('div');
    this._resultEl.className = 'ebe-result hidden';
    ov.appendChild(this._resultEl);
  }

  _renderBlanks() {
    const html = this.word.phonemes.map((ph, i) => {
      const filled = this._built[i];
      return filled
        ? `<span class="ebe-blank ebe-blank-filled">${filled.toUpperCase()}</span>`
        : `<span class="ebe-blank"></span>`;
    }).join('');
    this._blanksEl.innerHTML = html;
  }

  _shuffledPhonemes() {
    const arr = [...this.word.phonemes.map((ph, i) => ({ ph, i }))];
    for (let n = arr.length - 1; n > 0; n--) {
      const k = Math.floor(Math.random() * (n + 1));
      [arr[n], arr[k]] = [arr[k], arr[n]];
    }
    return arr;
  }

  _renderTiles() {
    this._tilesEl.innerHTML = '';
    this._tileEls = {};
    const shuffled = this._shuffledPhonemes();
    for (const { ph, i } of shuffled) {
      const btn = document.createElement('button');
      const _isUsedEbe = this._usedIdx.has(i);
      btn.className = 'ebe-tile' + (_isUsedEbe ? ' ebe-tile-used' : '');
      btn.textContent = ph.toUpperCase();
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', `Phoneme ${ph.toUpperCase()}${_isUsedEbe ? ', used' : ''}`);
      btn.setAttribute('aria-disabled', _isUsedEbe ? 'true' : 'false');
      btn.setAttribute('title', `${ph.toUpperCase()} — press '${ph[0].toUpperCase()}' key`);
      if (!this._usedIdx.has(i)) {
        const tap = (e) => { e.preventDefault(); this._onTap(ph, i, btn); };
        btn.addEventListener('touchstart', tap, { passive: false });
        btn.addEventListener('mousedown',  tap);
        btn.addEventListener('mouseenter', () => this.audio?.playPhoneme(ph));
      }
      this._tilesEl.appendChild(btn);
      this._tileEls[i] = btn;
    }
  }

  _onTap(ph, idx, btn) {
    if (this._state !== 'blend') return;
    if (this._usedIdx.has(idx)) return;

    this.audio?.playPhoneme(ph);

    const expected = this.word.phonemes[this._built.length];
    if (ph === expected) {
      // Correct!
      this._built.push(ph);
      this._usedIdx.add(idx);
      btn.classList.add('ebe-tile-used');
      this._renderBlanks();
      // Tile sparkle
      this._spawnTileParticles(btn, '#FFD700');
      if (this._built.length >= this.word.phonemes.length) {
        this._finish();
      }
    } else {
      // Wrong!
      this._wrongCount++;
      btn.classList.add('ebe-tile-wrong');
      setTimeout(() => btn.classList.remove('ebe-tile-wrong'), 400);
      this.audio?.sfxWrongBlend();
      this._screenShake = 8;
      // Slide the overlay to indicate error
      this.overlay.classList.add('ebe-shake');
      setTimeout(() => this.overlay.classList.remove('ebe-shake'), 320);
      if (this._wrongCount >= 3) {
        this._endMiss();
      }
    }
  }

  _spawnTileParticles(btn, color) {
    // Can't get exact canvas coords from overlay btn easily — use center of canvas
    const cx = this.W / 2;
    const cy = this.H * 0.55;
    for (let i = 0; i < 8; i++) {
      this._particles.push(new EndlessParticle(cx + (Math.random()-0.5)*60, cy, {
        color, type:'star', r:4+Math.random()*5, decay:0.04,
      }));
    }
  }

  _finish() {
    const timeUsed = (performance.now() - this._startTime) / 1000;
    const isPerfect = timeUsed < this.timeLimit * 0.5 && this._wrongCount === 0;
    this._result = isPerfect ? 'perfect' : 'good';
    this._showResult(isPerfect);
  }

  _endMiss() {
    this._result = 'miss';
    this._showResult(false, true);
  }

  _endTimeout() {
    this._result = 'timeout';
    this._showResult(false, true);
  }

  _showResult(isPerfect, isMiss = false) {
    this._state = 'result';
    this._resultAge = 0;

    const cx = this.W / 2;
    const cy = this.H / 2;

    if (isPerfect) {
      this._bgFlash = { color: '#FFD700', alpha: 0.5 };
      this._screenShake = 20;
      // Big explosion
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        this._particles.push(new EndlessParticle(cx, cy, {
          vx: Math.cos(a) * (4 + Math.random() * 6),
          vy: Math.sin(a) * (4 + Math.random() * 6) - 2,
          color: ['#FFD700','#FF8C00','#FF4500','#fff'][Math.floor(Math.random()*4)],
          type: Math.random() > 0.5 ? 'star' : 'circle',
          r: 4 + Math.random() * 8, decay: 0.018,
        }));
      }
      // Slash lines
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const l = 60 + Math.random() * 100;
        this._slashLines.push({ x: cx, y: cy, a, l, life: 1 });
      }
      this.audio?.sfxPerfectBlend();
      this._resultEl.textContent = '✨ PERFECT! ✨';
      this._resultEl.className = 'ebe-result ebe-result-perfect';
    } else if (isMiss) {
      this._bgFlash = { color: '#FF0000', alpha: 0.25 };
      this._screenShake = 12;
      this.audio?.sfxWrongBlend();
      // Miss animation particles
      for (let i = 0; i < 10; i++) {
        this._particles.push(new EndlessParticle(cx, cy, {
          color: '#FF4444', type: 'circle', r: 4+Math.random()*5, decay: 0.035,
        }));
      }
      // Show "slip on rice grain" emoji
      this._resultEl.innerHTML = '😅 MISS!<br><span style="font-size:0.7em">Riku slipped on a rice grain!</span>';
      this._resultEl.className = 'ebe-result ebe-result-miss';
    } else {
      // Good blend
      this._bgFlash = { color: '#00FF88', alpha: 0.3 };
      this._screenShake = 8;
      for (let i = 0; i < 15; i++) {
        this._particles.push(new EndlessParticle(cx, cy, {
          color: '#00FF88', type: 'star', r: 5+Math.random()*6, decay: 0.025,
        }));
      }
      // Slash
      for (let i = 0; i < 3; i++) {
        const a = -0.3 + i * 0.3;
        this._slashLines.push({ x: cx - 80 + i*40, y: cy, a, l: 80, life: 1 });
      }
      this.audio?.sfxSlash();
      this.audio?.sfxBlendChime?.();
      this._resultEl.textContent = '⚔️ NICE SLASH!';
      this._resultEl.className = 'ebe-result ebe-result-good';
    }

    // Also pronounce the word
    if (this.audio && !isMiss) {
      this.audio.playBlendSequence(this.word.phonemes, this.word.word);
    }

    // Hide tiles
    this._tilesEl.style.opacity = '0';
    this._timerBarEl.style.display = 'none';

    // Schedule dismiss
    setTimeout(() => this._dismiss(), isPerfect ? 1800 : 1200);
  }

  _dismiss() {
    this._state = 'done';
    if (this._kbHandler) {
      document.removeEventListener('keydown', this._kbHandler);
      this._kbHandler = null;
    }
    const timeUsed = (performance.now() - this._startTime) / 1000;
    this.overlay.classList.remove('active');
    this.overlay.innerHTML = '';
    if (this.onDone) this.onDone(this._result, timeUsed);
  }

  _onKeyDownEBE(e) {
    if (this._state !== 'blend') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    if (key.length !== 1) return;
    const k = key.toLowerCase();
    // Find matching tile in the rendered order: exact first, then prefix
    const phonemes = this.word.phonemes;
    for (const pass of ['exact', 'prefix']) {
      for (let i = 0; i < phonemes.length; i++) {
        if (this._usedIdx.has(i)) continue;
        const ph = phonemes[i].toLowerCase();
        const match = pass === 'exact' ? ph === k : ph.startsWith(k);
        if (match && this._tileEls[i]) {
          e.preventDefault();
          this._onTap(phonemes[i], i, this._tileEls[i]);
          return;
        }
      }
    }
  }

  _doAutoBlend() {
    // Auto-complete all phonemes in order
    const autoNext = (i) => {
      if (i >= this.word.phonemes.length) { this._finish(); return; }
      const ph = this.word.phonemes[i];
      // Find tile that hasn't been used
      const btn = Object.values(this._tileEls).find(
        b => b.textContent.toLowerCase() === ph && !b.classList.contains('ebe-tile-used')
      );
      if (btn) {
        this._built.push(ph);
        this._usedIdx.add(i);
        btn.classList.add('ebe-tile-used');
        this._renderBlanks();
        this._spawnTileParticles(btn, '#FFD700');
        if (this.audio) this.audio.playPhoneme(ph);
      }
      setTimeout(() => autoNext(i + 1), 250);
    };
    autoNext(0);
  }

  update(dt) {
    this._age++;
    if (this._state === 'blend') {
      this._timeLeft -= dt;
      // Update timer bar
      const pct = Math.max(0, this._timeLeft / this.timeLimit);
      if (this._timerFillEl) {
        this._timerFillEl.style.width = (pct * 100) + '%';
        const urgency = pct < 0.3;
        this._timerFillEl.style.background = urgency
          ? `rgba(255,${Math.floor(pct * 800)},0,0.9)` : '#00FF88';
        if (urgency && Math.floor(this._age / 8) % 2 === 0) {
          this._timerBarEl.classList.add('ebe-timer-urgent');
        } else {
          this._timerBarEl.classList.remove('ebe-timer-urgent');
        }
      }
      if (this._timeLeft <= 0) this._endTimeout();
    }

    if (this._resultAge !== undefined) this._resultAge++;
    if (this._bgFlash) this._bgFlash.alpha *= 0.92;
    if (this._screenShake > 0) this._screenShake--;
    for (const p of this._particles) p.update();
    for (const sl of this._slashLines) { sl.life -= 0.06; sl.l += 4; }
    this._particles    = this._particles.filter(p => !p.isDead());
    this._slashLines   = this._slashLines.filter(sl => sl.life > 0);
  }

  drawFX() {
    // Draw canvas-layer visual effects (called from SlashGame loop)
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // Shake offset
    const sx = this._screenShake > 0 ? (Math.random()-0.5) * this._screenShake : 0;
    const sy = this._screenShake > 0 ? (Math.random()-0.5) * this._screenShake : 0;
    ctx.save();
    ctx.translate(sx, sy);

    // Background flash
    if (this._bgFlash && this._bgFlash.alpha > 0.01) {
      ctx.fillStyle = this._bgFlash.color;
      ctx.globalAlpha = this._bgFlash.alpha;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Slash lines
    for (const sl of this._slashLines) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sl.life);
      const grd = ctx.createLinearGradient(
        sl.x, sl.y,
        sl.x + Math.cos(sl.a) * sl.l, sl.y + Math.sin(sl.a) * sl.l
      );
      grd.addColorStop(0, '#fff');
      grd.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth   = 4 * sl.life;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(sl.x, sl.y);
      ctx.lineTo(sl.x + Math.cos(sl.a) * sl.l, sl.y + Math.sin(sl.a) * sl.l);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
    for (const p of this._particles) p.draw(ctx);

    ctx.restore();
  }

  isDone() { return this._state === 'done'; }
}
