'use strict';
// ============================================================
// BATTLE ENGINE — js/battleEngine.js
// Phonics combat: player blends collected phonemes into words
// to deal damage to the boss. This is the educational heart.
//
// Canvas draws: background, boss, Riku, HP bars, slash effects.
// DOM overlay draws: interactive phoneme tiles, word builder,
//   type-input, submit button, timer bar. (Better for touch/mobile)
// ============================================================

const BOSS_ATTACK_INTERVAL = 5500;  // ms between boss attacks when idle
const BLEND_TIME           = 14;    // seconds per blend attempt
const MIN_TILE_POOL        = 6;     // minimum tiles given (supplement if few collected)

// ─────────────────────────────────────────────────────────────
// SLASH PARTICLE
// ─────────────────────────────────────────────────────────────
class SlashParticle {
  constructor(x, y) {
    this.x     = x; this.y = y;
    this.lines = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = 30 + Math.random() * 40;
      this.lines.push({ a, l, life: 1 });
    }
    this.life = 1;
  }
  update() {
    this.life -= 0.04;
    this.lines.forEach(ln => { ln.l += 3; ln.life -= 0.05; });
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    this.lines.forEach(ln => {
      const grd = ctx.createLinearGradient(
        this.x, this.y,
        this.x + Math.cos(ln.a) * ln.l, this.y + Math.sin(ln.a) * ln.l,
      );
      grd.addColorStop(0, '#fff');
      grd.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth   = 3 * ln.life;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(ln.a) * ln.l, this.y + Math.sin(ln.a) * ln.l);
      ctx.stroke();
    });
    ctx.restore();
  }
  isDead() { return this.life <= 0; }
}

// ─────────────────────────────────────────────────────────────
// DAMAGE POP
// ─────────────────────────────────────────────────────────────
class DamagePop {
  constructor(x, y, text, color = '#FFD700') {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.vy = -3; this.life = 1; this.scale = 0.3;
  }
  update() {
    this.y    += this.vy;
    this.vy   *= 0.96;
    this.life -= 0.022;
    this.scale = Math.min(1.6, this.scale + 0.12);
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.font        = 'bold 28px "Comic Sans MS", system-ui';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 4;
    ctx.strokeText(this.text, 0, 0);
    ctx.fillStyle   = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
  isDead() { return this.life <= 0; }
}

// ─────────────────────────────────────────────────────────────
// BATTLE ENGINE
// ─────────────────────────────────────────────────────────────
class BattleEngine {
  constructor(canvas, overlay, stageData, collectedPhonemes, sprites, audio, progress, logicalW, logicalH) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.overlay   = overlay;   // DOM element: #battleOverlay
    this.stage     = stageData;
    this.sprites   = sprites || {};
    this.audio     = audio;
    this.progress  = progress;

    // Use logical dimensions passed from SlashGame (avoids DPR physical-pixel bug)
    this.W = logicalW || canvas.clientWidth  || 480;
    this.H = logicalH || canvas.clientHeight || 700;

    // HP
    this.bossMaxHp = stageData.bossHp;
    this.bossHp    = stageData.bossHp;
    this.rikuMaxHp = 100;
    this.rikuHp    = 100;

    // Build the tile pool from collected phonemes
    // If not enough, supplement from the first stage word's phonemes
    this.tilePool  = this._buildTilePool(collectedPhonemes, stageData);
    this.availableWords = stageData.words;

    // Battle state
    this.state    = 'idle';    // idle | blending | boss-attack | riku-attack | won | lost
    this._age     = 0;
    this._bossAttackTimer = BOSS_ATTACK_INTERVAL;
    this._combo   = 0;
    this.score    = 0;

    // Animations
    this.slashParticles = [];
    this.damagePops     = [];
    this._bossShake     = 0;
    this._rikuShake     = 0;
    this._bossBobOffset = 0;

    // Blend session
    this._blendTimeLeft  = BLEND_TIME;
    this._blendTick      = 0;
    this._blendTimer     = null;
    this._currentBuilt   = [];   // array of phonemes selected so far
    this._typingMode     = false;

    // DOM refs (created by setupDOM)
    this._tileEls   = [];
    this._setupDOM();

    this.done    = false;
    this.outcome = null;  // 'victory' | 'defeat'
  }

  // ── Tile pool construction ───────────────────────────────────
  _buildTilePool(collectedPhonemes, stage) {
    let pool = collectedPhonemes.map(c => c.phoneme);
    // Ensure at minimum 2 complete words can be formed
    if (pool.length < MIN_TILE_POOL) {
      const supplement = stage.words.slice(0, 2).flatMap(w => w.phonemes);
      pool = [...new Set([...pool, ...supplement])];
    }
    // Deduplicate while keeping educational variety (keep max 2 of each)
    const counts = {};
    return pool.filter(ph => {
      counts[ph] = (counts[ph] || 0) + 1;
      return counts[ph] <= 2;
    });
  }

  // ── Available words given current tile pool ──────────────────
  _wordsFromPool() {
    const poolCounts = {};
    this.tilePool.forEach(ph => { poolCounts[ph] = (poolCounts[ph] || 0) + 1; });
    return this.availableWords.filter(w => {
      const needed = {};
      w.phonemes.forEach(ph => { needed[ph] = (needed[ph] || 0) + 1; });
      return Object.entries(needed).every(([ph, cnt]) => (poolCounts[ph] || 0) >= cnt);
    });
  }

  // ── DOM setup: phoneme tiles + controls ─────────────────────
  _setupDOM() {
    // Clear any stale content
    this.overlay.innerHTML = '';

    // Hint words (bottom of canvas area) — shown above tiles
    this._hintEl = document.createElement('div');
    this._hintEl.className = 'be-hints';
    this._hintEl.title = 'Hint: words you can make!';
    this.overlay.appendChild(this._hintEl);

    // Word being built (shows tiles in order)
    this._buildEl = document.createElement('div');
    this._buildEl.className = 'be-build';
    this.overlay.appendChild(this._buildEl);

    // Timer bar
    this._timerBarWrap = document.createElement('div');
    this._timerBarWrap.className = 'be-timer-wrap';
    this._timerBar = document.createElement('div');
    this._timerBar.className = 'be-timer-fill';
    this._timerBarWrap.appendChild(this._timerBar);
    this.overlay.appendChild(this._timerBarWrap);

    // Tile pool
    this._poolEl = document.createElement('div');
    this._poolEl.className = 'be-pool';
    this.overlay.appendChild(this._poolEl);

    // Controls row
    const controls = document.createElement('div');
    controls.className = 'be-controls';

    // ── Primary action buttons (big, thumb-friendly) ────────────
    this._submitBtn = document.createElement('button');
    this._submitBtn.className   = 'be-btn be-btn-slash';
    this._submitBtn.innerHTML   = '⚔️ SLASH!';
    this._submitBtn.addEventListener('click', () => this._submitBuild());
    this._submitBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._submitBuild(); });

    this._clearBtn = document.createElement('button');
    this._clearBtn.className   = 'be-btn be-btn-clear';
    this._clearBtn.textContent = '✕';
    this._clearBtn.title       = 'Clear';
    this._clearBtn.addEventListener('click', () => this._clearBuild());
    this._clearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._clearBuild(); });

    this._hearBtn = document.createElement('button');
    this._hearBtn.className   = 'be-btn be-btn-hear';
    this._hearBtn.textContent = '🔊';
    this._hearBtn.title = 'Hear the word';
    this._hearBtn.addEventListener('click', () => {
      if (this._currentBuilt.length > 0) {
        const word = this.availableWords.find(w => w.phonemes.join('') === this._currentBuilt.join(''));
        if (word) this.audio?.playBlendSequence(word.phonemes, word.word);
        else this._currentBuilt.forEach(ph => this.audio?.playPhoneme(ph));
      }
    });
    this._hearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._hearBtn.click(); });

    // Hidden text input kept for keyboard users
    this._typeInput = document.createElement('input');
    this._typeInput.className   = 'be-type-input';
    this._typeInput.placeholder = 'Type & Enter…';
    this._typeInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') this._submitTyped();
    });

    controls.append(this._submitBtn, this._clearBtn, this._hearBtn, this._typeInput);
    this.overlay.appendChild(controls);

    // Feedback line
    this._feedbackEl = document.createElement('div');
    this._feedbackEl.className = 'be-feedback';
    this.overlay.appendChild(this._feedbackEl);

    this._renderTiles();
    this._renderHints();
    this._startBlendTimer();
  }

  _renderTiles() {
    this._poolEl.innerHTML = '';
    this._tileEls = [];
    const usedInBuild = {};
    this._currentBuilt.forEach(ph => { usedInBuild[ph] = (usedInBuild[ph] || 0) + 1; });

    this.tilePool.forEach((ph, idx) => {
      const used = (usedInBuild[ph] || 0);
      const tile = document.createElement('button');
      tile.className = 'be-tile';
      tile.textContent = ph.toUpperCase();
      tile.dataset.phoneme = ph;
      tile.dataset.idx = idx;
      // Mark as used if already placed
      if (used > 0) {
        tile.classList.add('be-tile-used');
        used > 0 && (usedInBuild[ph]--);
      }
      tile.addEventListener('click', () => this._onTileClick(ph, tile));
      tile.addEventListener('mouseenter', () => this.audio?.playPhoneme(ph));
      // Touch: play sound on start (must be in user-gesture handler for audio context),
      // then handle selection on touchend — preventing the ghost click that would double-fire.
      tile.addEventListener('touchstart', () => {
        this.audio?.playPhoneme(ph);
      }, { passive: true });
      tile.addEventListener('touchend', (e) => {
        e.preventDefault();   // stop ghost click
        this._onTileClick(ph, tile);
      });
      this._tileEls.push(tile);
      this._poolEl.appendChild(tile);
    });
  }

  _renderHints() {
    const possible = this._wordsFromPool().slice(0, 4);
    this._hintEl.innerHTML = possible.map(w =>
      `<span class="be-hint-word">${w.hint} <em>${w.word}</em></span>`
    ).join('');
  }

  _renderBuild() {
    this._buildEl.innerHTML = this._currentBuilt.length === 0
      ? '<span class="be-build-placeholder">Click tiles to build a word…</span>'
      : this._currentBuilt.map(ph => `<span class="be-build-tile">${ph.toUpperCase()}</span>`).join('');
  }

  // ── Tile click ───────────────────────────────────────────────
  _onTileClick(phoneme, tileEl) {
    if (this.state !== 'idle' && this.state !== 'blending') return;
    if (tileEl.classList.contains('be-tile-used')) return;

    this.state = 'blending';
    this._currentBuilt.push(phoneme);
    tileEl.classList.add('be-tile-used');

    if (this.audio) this.audio.playPhoneme(phoneme);

    this._renderBuild();
    this._setFeedback('');
  }

  // ── Submit ───────────────────────────────────────────────────
  _submitBuild() {
    const word = this._currentBuilt.join('');
    this._checkWord(word, false);
  }

  _submitTyped() {
    const word = this._typeInput.value.trim().toLowerCase();
    if (!word) return;
    this._typeInput.value = '';
    this._checkWord(word, true);
  }

  _checkWord(attempt, typed) {
    const match = this.availableWords.find(w => w.word === attempt || w.word === attempt.toLowerCase());

    if (!match) {
      this._wrongBlend(`"${attempt.toUpperCase()}" isn't in the word list — try again!`);
      return;
    }

    // Check that phonemes can be formed from tile pool
    const poolCounts = {};
    this.tilePool.forEach(ph => { poolCounts[ph] = (poolCounts[ph] || 0) + 1; });
    const needed = {};
    match.phonemes.forEach(ph => { needed[ph] = (needed[ph] || 0) + 1; });
    const canForm = Object.entries(needed).every(([ph, cnt]) => (poolCounts[ph] || 0) >= cnt);

    if (!canForm) {
      this._wrongBlend(`You haven't collected all the tiles for "${match.word}" yet!`);
      return;
    }

    this._successBlend(match, typed);
  }

  _successBlend(wordObj, typed) {
    this._stopBlendTimer();
    this.state = 'riku-attack';

    const timeBonus  = this._blendTimeLeft / BLEND_TIME;
    const comboMult  = 1 + Math.min(this._combo, 4) * 0.25;
    const speedBonus = typed ? 1.3 : 1.0;
    const damage     = Math.floor(wordObj.damage * comboMult * (0.7 + timeBonus * 0.3) * speedBonus);

    this._combo++;
    this.bossHp  = Math.max(0, this.bossHp - damage);
    this.score  += damage * 2;
    this._bossShake = 22;

    if (this.progress) this.progress.recordBlend(this.stage.id, wordObj.word, true);
    if (this.audio)    this.audio.sfxSlash();
    if (this.audio)    this.audio.sfxBossHit();
    setTimeout(() => {
      if (this.audio) this.audio.playBlendSequence(wordObj.phonemes, wordObj.word);
    }, 200);

    // Slash particles at boss center
    const bossX = Math.floor(this.W * 0.72);
    const bossY = Math.floor(this.H * 0.38);
    for (let i = 0; i < 3; i++) {
      this.slashParticles.push(new SlashParticle(bossX + (Math.random()-0.5)*40, bossY + (Math.random()-0.5)*40));
    }

    const gradeText = this._combo >= 3 ? `COMBO ×${this._combo}! ⚡` :
                      timeBonus > 0.7  ? 'PERFECT! 💥' : 'GREAT! ⚔️';
    this.damagePops.push(new DamagePop(bossX, bossY - 40, `-${damage}`, '#FFD700'));
    this.damagePops.push(new DamagePop(bossX, bossY - 80, gradeText, '#fff'));

    this._setFeedback(`⚔️ "${wordObj.word.toUpperCase()}" — ${gradeText} (${damage} dmg)`, '#FFD700');

    setTimeout(() => {
      if (this.bossHp <= 0) {
        this._win();
      } else {
        this._clearBuild();
        this.state = 'idle';
        this._startBlendTimer();
        this._renderHints();
      }
    }, 1400);
  }

  _wrongBlend(msg) {
    this._combo   = 0;
    this.state    = 'boss-attack';
    this._rikuShake = 14;
    const dmg     = Math.floor(this.stage.bossAttack * 0.5);
    this.rikuHp   = Math.max(0, this.rikuHp - dmg);

    if (this.progress) this.progress.recordBlend(this.stage.id, '', false);
    if (this.audio) this.audio.sfxWrongBlend();
    if (this.audio) this.audio.sfxHurt();

    this.damagePops.push(new DamagePop(Math.floor(this.W * 0.25), Math.floor(this.H * 0.35), `-${dmg}`, '#FF5252'));
    this._setFeedback('❌ ' + msg, '#FF5252');

    setTimeout(() => {
      this._clearBuild();
      if (this.rikuHp <= 0) { this._lose(); return; }
      this.state = 'idle';
      this._startBlendTimer();
    }, 1000);
  }

  // ── Timer ────────────────────────────────────────────────────
  _startBlendTimer() {
    this._stopBlendTimer();
    this._blendTimeLeft = BLEND_TIME;
    this._timerBar.style.width = '100%';
    this._timerBar.className = 'be-timer-fill';
    this._blendTimer = setInterval(() => {
      this._blendTimeLeft -= 0.1;
      const pct = Math.max(0, this._blendTimeLeft / BLEND_TIME);
      this._timerBar.style.width  = (pct * 100) + '%';
      this._timerBar.style.background = '';  // let CSS classes handle colour
      this._timerBar.className = 'be-timer-fill' +
        (pct < 0.25 ? ' be-timer-urgent' : pct < 0.5 ? ' be-timer-warn' : '');
      if (this._blendTimeLeft <= 0) {
        this._stopBlendTimer();
        this._bossAutoAttack();
      }
    }, 100);
  }

  _stopBlendTimer() {
    if (this._blendTimer) { clearInterval(this._blendTimer); this._blendTimer = null; }
  }

  _bossAutoAttack() {
    if (this.done) return;
    this.state = 'boss-attack';
    this._bossShake = 8;
    const dmg = this.stage.bossAttack;
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    if (this.audio) this.audio.sfxBossHit();
    if (this.audio) this.audio.sfxHurt();
    this.damagePops.push(new DamagePop(Math.floor(this.W * 0.25), Math.floor(this.H * 0.35), `🦖 -${dmg}`, '#FF5252'));
    this._setFeedback(`⚡ Boss attacks! -${dmg} HP — blend faster!`, '#FF9800');
    this._combo = 0;
    setTimeout(() => {
      this._clearBuild();
      if (this.rikuHp <= 0) { this._lose(); return; }
      this.state = 'idle';
      this._startBlendTimer();
    }, 1200);
  }

  // ── Clear build ──────────────────────────────────────────────
  _clearBuild() {
    this._currentBuilt = [];
    this._typeInput.value = '';
    this._renderBuild();
    this._renderTiles();
  }

  // ── Feedback text ────────────────────────────────────────────
  _setFeedback(msg, color = '#fff') {
    this._feedbackEl.textContent  = msg;
    this._feedbackEl.style.color  = color;
  }

  // ── Win / Lose ───────────────────────────────────────────────
  _win() {
    this._stopBlendTimer();
    this.done    = true;
    this.outcome = 'victory';
    if (this.audio) this.audio.sfxVictory();
  }

  _lose() {
    this._stopBlendTimer();
    this.done    = true;
    this.outcome = 'defeat';
    if (this.audio) this.audio.sfxHurt();
  }

  // ── Update ───────────────────────────────────────────────────
  update() {
    if (this.done) return;
    this._age++;
    if (this._bossShake > 0) this._bossShake--;
    if (this._rikuShake > 0) this._rikuShake--;
    this._bossBobOffset = Math.sin(this._age * 0.04) * 5;

    this.slashParticles.forEach(p => p.update());
    this.slashParticles = this.slashParticles.filter(p => !p.isDead());
    this.damagePops.forEach(p => p.update());
    this.damagePops = this.damagePops.filter(p => !p.isDead());
  }

  // ── Draw ─────────────────────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    this._drawBackground(ctx);
    this._drawFloor(ctx);
    this._drawBoss(ctx);
    this._drawRiku(ctx);
    this._drawHPBars(ctx);

    this.slashParticles.forEach(p => p.draw(ctx));
    this.damagePops.forEach(p => p.draw(ctx));

    // Combo badge
    if (this._combo >= 2 && this.state === 'idle') {
      const pulse = 0.8 + 0.2 * Math.sin(this._age * 0.2);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font        = `bold ${16 + this._combo * 2}px "Comic Sans MS", system-ui`;
      ctx.fillStyle   = '#FFD700';
      ctx.textAlign   = 'right';
      ctx.shadowColor = '#FF6F00';
      ctx.shadowBlur  = 8;
      ctx.fillText(`🔥 COMBO ×${this._combo}`, this.W - 12, 96);
      ctx.restore();
    }
  }

  _drawBackground(ctx) {
    const bgKey = this.stage.bg;
    const bgSp  = bgKey && this.sprites[bgKey];
    if (bgSp && bgSp.complete && bgSp.naturalWidth > 0) {
      // Fill entire canvas with background image (cover fit)
      const imgW = bgSp.naturalWidth;
      const imgH = bgSp.naturalHeight;
      const scale = Math.max(this.W / imgW, this.H / imgH);
      const dw = imgW * scale;
      const dh = imgH * scale;
      ctx.drawImage(bgSp, (this.W - dw) / 2, (this.H - dh) / 2, dw, dh);
      // Dark overlay so characters are readable
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(0, 0, this.W, this.H);
    } else {
      // Procedural fallback
      const colors = this.stage.skyColor || ['#1565C0', '#42A5F5'];
      const grad   = ctx.createLinearGradient(0, 0, 0, this.H * 0.75);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H * 0.75);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, this.H * 0.55, this.W, 30);
    }

    // Stage name watermark (always shown)
    ctx.font      = `bold 14px system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.stage.name}  ⚔️  Boss Battle`, this.W / 2, 26);
  }

  _drawFloor(ctx) {
    const floorY = this.H * 0.72;
    ctx.fillStyle = this.stage.groundColor || '#2E7D32';
    ctx.fillRect(0, floorY, this.W, this.H - floorY);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, floorY, this.W, 8);
  }

  _drawBoss(ctx) {
    const bossX  = Math.floor(this.W * 0.70);
    const bossY  = Math.floor(this.H * 0.32) + this._bossBobOffset;
    const shakeX = this._bossShake > 0 ? (Math.random() - 0.5) * 12 : 0;
    const shakeY = this._bossShake > 0 ? (Math.random() - 0.5) * 7  : 0;
    const scale  = 1 + Math.min(0.35, this._bossShake * 0.016);
    // Boss drawn larger so it feels threatening
    const bossW  = Math.min(160, Math.floor(this.W * 0.32));
    const bossH  = bossW;

    ctx.save();
    ctx.translate(bossX + shakeX, bossY + shakeY);
    ctx.scale(scale, scale);

    const hpPct = this.bossHp / this.bossMaxHp;
    const sp    = this.sprites[this.stage.bossFile];

    if (sp && sp.complete && sp.naturalWidth > 0) {
      // Draw with the sprite facing left (flip horizontally — boss faces Riku on the left)
      ctx.save();
      ctx.scale(-1, 1);   // mirror so boss faces left
      ctx.drawImage(sp, -bossW / 2, -bossH / 2, bossW, bossH);
      ctx.restore();

      // Red flash at low HP
      if (hpPct < 0.3) {
        ctx.globalAlpha = 0.28 * (0.6 + 0.4 * Math.sin(this._age * 0.25));
        ctx.fillStyle   = '#F44336';
        ctx.beginPath(); ctx.ellipse(0, 0, bossW / 2, bossH / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      this._drawFallbackBoss(ctx, hpPct);
    }
    ctx.restore();

    // Boss name tag above sprite
    ctx.font        = `bold ${Math.max(12, Math.floor(this.W * 0.028))}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#fff';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 5;
    ctx.fillText(this.stage.bossName, bossX, bossY - bossH / 2 - 12);

    // Angry emoji at very low HP
    if (hpPct < 0.25) {
      ctx.font      = '18px serif';
      ctx.fillText('😤', bossX, bossY - bossH / 2 - 32);
    }
    ctx.shadowBlur = 0;
  }

  _drawFallbackBoss(ctx, hpPct) {
    // T-Rex silhouette in stage accent color, darkened at low HP
    const c   = this.stage.accentColor || '#FF6F00';
    const hue = hpPct < 0.3 ? '#B71C1C' : c;

    // Body
    ctx.fillStyle = hue;
    ctx.beginPath(); ctx.ellipse(0, 20, 44, 36, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.beginPath(); ctx.ellipse(-36, -18, 34, 24, -0.3, 0, Math.PI * 2); ctx.fill();

    // Jaw
    ctx.fillStyle = '#4E342E';
    ctx.beginPath();
    ctx.moveTo(-64, -10);
    ctx.quadraticCurveTo(-52, 2, -22, -4);
    ctx.closePath();
    ctx.fill();

    // Teeth
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-58 + i * 10, -10);
      ctx.lineTo(-54 + i * 10, -2);
      ctx.lineTo(-50 + i * 10, -10);
      ctx.closePath();
      ctx.fill();
    }

    // Eye
    ctx.fillStyle = '#FFF176';
    ctx.beginPath(); ctx.ellipse(-30, -24, 10, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath(); ctx.ellipse(-28, -24, 5, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Tiny arms
    ctx.fillStyle = hue;
    ctx.fillRect(10, -2, 16, 10); ctx.fillRect(10, 10, 12, 10);

    // Tail
    ctx.beginPath();
    ctx.moveTo(44, 20);
    ctx.quadraticCurveTo(80, 40, 90, 10);
    ctx.lineWidth = 18; ctx.strokeStyle = hue; ctx.stroke();

    // Legs
    ctx.fillStyle = hue;
    ctx.fillRect(-20, 52, 20, 28);
    ctx.fillRect(8,   52, 20, 28);
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-24, 76, 26, 8);  // feet
    ctx.fillRect(6,   76, 26, 8);

    // Crack overlay at low HP
    if (hpPct < 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(10, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, -10);  ctx.lineTo(5, 30);  ctx.stroke();
    }
  }

  _drawRiku(ctx) {
    const rx     = Math.floor(this.W * 0.22);
    const ry     = Math.floor(this.H * 0.38);
    const shakeX = this._rikuShake > 0 ? (Math.random() - 0.5) * 8 : 0;
    const shakeY = this._rikuShake > 0 ? (Math.random() - 0.5) * 4 : 0;
    const rW     = 90;
    const rH     = 105;

    // Pick sprite based on current battle state
    let spKey = 'riku-idle';
    if (this.state === 'riku-attack')                                    spKey = 'riku-run';
    if (this.state === 'boss-attack' || this._rikuShake > 0)            spKey = 'riku-hurt';
    if (this.state === 'won' || this.done && this.outcome === 'victory') spKey = 'riku-victory';

    // Gentle idle bob
    const bob = this.state === 'idle'
      ? Math.sin(this._age * 0.05) * 3
      : 0;

    ctx.save();
    ctx.translate(rx + shakeX, ry + shakeY + bob);

    const sp = this.sprites[spKey]
            || this.sprites['riku-idle']
            || this.sprites['riku-run'];

    if (sp && sp.complete && sp.naturalWidth > 0) {
      // Attack state: lean forward (slight rightward tilt)
      if (this.state === 'riku-attack') {
        ctx.rotate(0.18);
        ctx.translate(10, 0);
      }
      ctx.drawImage(sp, -rW / 2, -rH / 2, rW, rH);
    } else {
      this._drawFallbackRiku(ctx, rW, rH);
    }
    ctx.restore();

    // Victory sparkles when won
    if (this.done && this.outcome === 'victory') {
      for (let i = 0; i < 3; i++) {
        const a   = (i / 3) * Math.PI * 2 + this._age * 0.05;
        const r   = 55;
        const spx = rx + Math.cos(a) * r;
        const spy = ry + Math.sin(a) * r;
        ctx.font      = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('✨', spx, spy);
      }
    }
  }

  _drawFallbackRiku(ctx, w, h) {
    const cx = 0;
    const ty = -h / 2;

    // Body
    ctx.fillStyle = '#F5F5F0';
    ctx.beginPath(); ctx.ellipse(cx, ty + h * 0.55, w * 0.38, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();

    // Nori
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - w * 0.38, ty + h * 0.38, w * 0.76, h * 0.16);

    // Face
    ctx.fillStyle = '#fff9e0';
    ctx.beginPath(); ctx.ellipse(cx, ty + h * 0.24, w * 0.3, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(cx - 10, ty + h * 0.22, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, ty + h * 0.22, 4, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Hachimaki
    ctx.fillStyle = '#ff3322';
    ctx.fillRect(cx - w * 0.3, ty + h * 0.08, w * 0.6, 7);

    // Battle pose sword (thrust toward right = toward boss)
    const swingAng = this.state === 'riku-attack' ? -0.4 : 0.1;
    ctx.save();
    ctx.translate(cx + 20, ty + h * 0.5);
    ctx.rotate(swingAng);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, -3, 45, 6);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(40, -2, 8, 4);
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-4, -8, 6, 16);
    ctx.restore();
  }

  _drawHPBars(ctx) {
    const margin = 14;
    const barW   = Math.min(this.W * 0.42, 200);
    const barH   = 22;
    const barY   = 42;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'middle';

    // ── Helper: draw one HP bar ──────────────────────────────
    const drawBar = (x, pct, col1, col2, label, textRight) => {
      // Track (dark inset)
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(x - 2, barY - 2, barW + 4, barH + 4, barH / 2 + 2); ctx.fill();
      // Track inner
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(x, barY, barW, barH, barH / 2); ctx.fill();
      // Fill
      if (pct > 0) {
        const g = ctx.createLinearGradient(x, barY, x, barY + barH);
        g.addColorStop(0, col1);
        g.addColorStop(1, col2);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(x, barY, barW * pct, barH, barH / 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.roundRect(x + 2, barY + 2, barW * pct - 4, barH * 0.4, (barH * 0.4) / 2); ctx.fill();
      }
      // Label above bar
      ctx.font = 'bold 11px "Comic Sans MS", system-ui';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      ctx.textAlign = textRight ? 'right' : 'left';
      ctx.fillText(label, textRight ? x + barW : x, barY - 8);
      ctx.shadowBlur = 0;
    };

    // ── Riku HP (top-left) ───────────────────────────────────
    const rikuPct = Math.max(0, this.rikuHp / this.rikuMaxHp);
    const rikuC1 = rikuPct > 0.5 ? '#6DD56B' : rikuPct > 0.25 ? '#FFCA28' : '#FF5252';
    const rikuC2 = rikuPct > 0.5 ? '#2E7D32' : rikuPct > 0.25 ? '#F57F17' : '#B71C1C';
    drawBar(margin, rikuPct, rikuC1, rikuC2,
      `🍚 RIKU  ${Math.ceil(this.rikuHp)}/${this.rikuMaxHp}`, false);

    // ── Boss HP (top-right) ──────────────────────────────────
    const bossPct = Math.max(0, this.bossHp / this.bossMaxHp);
    drawBar(this.W - margin - barW, bossPct, '#FF7043', '#B71C1C',
      `${this.stage.bossName}  ${Math.ceil(this.bossHp)}/${this.bossMaxHp}  🦖`, true);

    ctx.restore();
  }

  // ── Cleanup ──────────────────────────────────────────────────
  destroy() {
    this._stopBlendTimer();
    this.overlay.innerHTML = '';
  }
}
