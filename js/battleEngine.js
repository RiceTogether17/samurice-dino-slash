'use strict';
// ============================================================
// BATTLE ENGINE — js/battleEngine.js
// One-word-at-a-time phonics combat.
//
// Each round shows ONE target word with:
//   • A big picture emoji hint
//   • Blank slots showing how many phonemes are needed
//   • Only the tiles for that word (shuffled)
//
// Player clicks tiles in order → auto-submits when all placed.
// 3 wrong orderings → skip word (with HP penalty).
// Timer running out → boss attacks, skip to next word.
//
// Runner phonemes collected = bonus Riku HP (+2 per phoneme, max +40).
// ============================================================

const BLEND_TIME  = 20;   // seconds per word attempt
const MAX_WRONGS  = 3;    // wrong-order attempts before skipping

// Boss phase thresholds
const BOSS_PHASE2_PCT = 0.50;  // 50% HP → Phase 2 (faster, angrier)
const BOSS_PHASE3_PCT = 0.25;  // 25% HP → Phase 3 (enraged)

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

    // HP — runner phonemes give Riku a bonus (reward for good runner play)
    const bonusHp      = Math.min(40, collectedPhonemes.length * 2);
    this.rikuMaxHp     = 100 + bonusHp;
    this.rikuHp        = 100 + bonusHp;
    this.bossMaxHp     = stageData.bossHp;
    this.bossHp        = stageData.bossHp;

    // Word queue — shuffled copy of stage words, one at a time
    this._wordQueue     = this._shuffleArray([...stageData.words]);
    this._wordQueueIdx  = 0;
    this._currentWord   = null;
    this._shuffledPh    = [];   // shuffled phoneme tiles for current word
    this._usedTileIdx   = new Set();  // which tile positions have been clicked

    // Battle state
    this.state       = 'idle';
    this._age        = 0;
    this._combo      = 0;
    this.score       = 0;
    this._bossPhase  = 1;   // 1, 2, or 3
    this._phaseFlash = 0;   // frames of phase-change visual effect
    this._specialReady = false;  // Riku special attack charged

    // Animations
    this.slashParticles = [];
    this.damagePops     = [];
    this._bossShake     = 0;
    this._rikuShake     = 0;
    this._bossBobOffset = 0;

    // Blend session
    this._blendTimeLeft  = BLEND_TIME;
    this._blendTimer     = null;
    this._currentBuilt   = [];   // phonemes selected so far
    this._wrongAttempts  = 0;    // wrong-order attempts for current word
    this._showFirstHint  = false; // highlight first phoneme tile on penultimate attempt

    // Pause
    this._paused = false;

    // DOM refs (created by _setupDOM)
    this._tileEls   = [];
    this._setupDOM();

    this.done      = false;
    this.outcome   = null;  // 'victory' | 'defeat'
    this._destroyed = false; // guards against orphaned setTimeout callbacks after destroy()

    // Kick off first word after a short delay (let canvas settle)
    setTimeout(() => { if (!this._destroyed) { this._startNextWord(); this._startBlendTimer(); } }, 400);
  }

  // ── Utility: Fisher-Yates shuffle ───────────────────────────
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── DOM setup ────────────────────────────────────────────────
  // Layout (top → bottom):
  //   1. controls   — Clear + Hear buttons (sticky top)
  //   2. target     — big emoji + blank slots
  //   3. pool       — shuffled tiles for current word
  //   4. timer bar
  //   5. feedback
  _setupDOM() {
    this.overlay.innerHTML = '';

    // ── 1. Controls ─────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'be-controls';

    this._clearBtn = document.createElement('button');
    this._clearBtn.className   = 'be-btn be-btn-clear';
    this._clearBtn.innerHTML   = '✕ Clear';
    this._clearBtn.title       = 'Clear your answer';
    this._clearBtn.addEventListener('click', () => this._clearBuild());
    this._clearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._clearBuild(); });

    this._hearBtn = document.createElement('button');
    this._hearBtn.className   = 'be-btn be-btn-hear';
    this._hearBtn.innerHTML   = '🔊 Hear';
    this._hearBtn.title       = 'Hear the word';
    this._hearBtn.addEventListener('click', () => {
      if (this._currentWord) {
        this.audio?.playBlendSequence(this._currentWord.phonemes, this._currentWord.word);
      }
    });
    this._hearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._hearBtn.click(); });

    controls.append(this._clearBtn, this._hearBtn);
    this.overlay.appendChild(controls);

    // ── 2. Target hint (emoji + blank slots) ────────────────
    this._targetEl = document.createElement('div');
    this._targetEl.className = 'be-target';

    this._targetEmojiEl = document.createElement('div');
    this._targetEmojiEl.className = 'be-target-emoji';
    this._targetEmojiEl.textContent = '❓';

    this._blanksEl = document.createElement('div');
    this._blanksEl.className = 'be-blanks';

    this._targetEl.append(this._targetEmojiEl, this._blanksEl);
    this.overlay.appendChild(this._targetEl);

    // ── 3. Tile pool ─────────────────────────────────────────
    this._poolEl = document.createElement('div');
    this._poolEl.className = 'be-pool';
    this.overlay.appendChild(this._poolEl);

    // ── 4. Timer bar ─────────────────────────────────────────
    this._timerBarWrap = document.createElement('div');
    this._timerBarWrap.className = 'be-timer-wrap';
    this._timerBar = document.createElement('div');
    this._timerBar.className = 'be-timer-fill';
    this._timerBarWrap.appendChild(this._timerBar);
    this.overlay.appendChild(this._timerBarWrap);

    // ── 5. Feedback line ─────────────────────────────────────
    this._feedbackEl = document.createElement('div');
    this._feedbackEl.className = 'be-feedback';
    this.overlay.appendChild(this._feedbackEl);
  }

  // ── Start next word ──────────────────────────────────────────
  _startNextWord() {
    if (this.done) return;

    // Cycle through queue (re-shuffle when exhausted)
    if (this._wordQueueIdx >= this._wordQueue.length) {
      this._wordQueue    = this._shuffleArray([...this.stage.words]);
      this._wordQueueIdx = 0;
    }
    this._currentWord   = this._wordQueue[this._wordQueueIdx++];
    this._shuffledPh    = this._shuffleArray([...this._currentWord.phonemes]); // randomise tile order
    this._wrongAttempts = 0;
    this._currentBuilt  = [];
    this._usedTileIdx   = new Set();
    this._showFirstHint = false;

    this._renderTargetHint();
    this._renderCurrentWordTiles();
    this._setFeedback('');

    // Speak the word as an audio hint (delayed so the tile animation settles first)
    setTimeout(() => {
      if (!this.done) this.audio?.playWord(this._currentWord.word);
    }, 350);
  }

  // ── Render target hint (emoji + blank slots) ─────────────────
  _renderTargetHint() {
    if (!this._currentWord) return;
    this._targetEmojiEl.textContent = this._currentWord.hint;
    this._renderBlanks();
  }

  _renderBlanks() {
    if (!this._currentWord) return;
    const html = this._currentWord.phonemes.map((ph, i) => {
      const built = this._currentBuilt[i];
      if (built) {
        return `<span class="be-blank be-blank-filled">${built.toUpperCase()}</span>`;
      }
      return `<span class="be-blank"></span>`;
    }).join('');
    this._blanksEl.innerHTML = html;
  }

  // ── Render tiles for current word only ───────────────────────
  _renderCurrentWordTiles() {
    this._poolEl.innerHTML = '';
    this._tileEls = [];
    // Track if we've already applied the hint to one tile (avoid double-hint for repeated phonemes)
    let hintApplied = false;

    this._shuffledPh.forEach((ph, idx) => {
      const isUsed = this._usedTileIdx.has(idx);
      // Hint: highlight the tile matching the first needed phoneme on penultimate attempt
      const isHint = this._showFirstHint && !isUsed && !hintApplied &&
                     ph === this._currentWord.phonemes[this._currentBuilt.length];
      if (isHint) hintApplied = true;

      const tile   = document.createElement('button');
      tile.className        = 'be-tile' + (isUsed ? ' be-tile-used' : '') + (isHint ? ' be-tile-hint' : '');
      tile.textContent      = ph.toUpperCase();
      tile.dataset.phoneme  = ph;
      tile.dataset.idx      = idx;

      if (!isUsed) {
        tile.addEventListener('click', () => this._onTileClick(ph, tile, idx));
        tile.addEventListener('mouseenter', () => this.audio?.playPhoneme(ph));
        tile.addEventListener('touchstart', () => {
          this.audio?.playPhoneme(ph);
        }, { passive: true });
        tile.addEventListener('touchend', (e) => {
          e.preventDefault();
          this._onTileClick(ph, tile, idx);
        });
      }

      this._tileEls.push(tile);
      this._poolEl.appendChild(tile);
    });
  }

  // ── Tile click ───────────────────────────────────────────────
  _onTileClick(phoneme, tileEl, tileIdx) {
    if (this.state !== 'idle' && this.state !== 'blending') return;
    if (this._usedTileIdx.has(tileIdx)) return;

    this.state = 'blending';
    this._currentBuilt.push(phoneme);
    this._usedTileIdx.add(tileIdx);
    tileEl.classList.add('be-tile-used');

    this.audio?.playPhoneme(phoneme);

    this._renderBlanks();
    this._setFeedback('');

    // Auto-submit when all phonemes are placed
    if (this._currentBuilt.length === this._currentWord.phonemes.length) {
      setTimeout(() => this._checkCurrentWord(), 300);
    }
  }

  // ── Check if built order matches target ─────────────────────
  _checkCurrentWord() {
    if (this.done) return;
    const built  = this._currentBuilt.join('');
    const target = this._currentWord.phonemes.join('');

    if (built === target) {
      this._successBlend(this._currentWord);
    } else {
      this._wrongAttempts++;
      if (this._wrongAttempts >= MAX_WRONGS) {
        this._skipWord();
      } else {
        this._wrongOrder();
      }
    }
  }

  // ── Wrong order: let player try again ────────────────────────
  _wrongOrder() {
    this._combo = 0;
    this.state  = 'idle';

    const dmg  = Math.floor(this.stage.bossAttack * 0.3);
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    this._rikuShake = 8;
    if (this.audio) this.audio.sfxWrongBlend();

    const triesLeft = MAX_WRONGS - this._wrongAttempts;
    const hintMsg = triesLeft === 1 ? ' 💡 Hint: first tile is glowing!' : '';
    this._setFeedback(`❌ Not quite! ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left${hintMsg}`, '#FF5252');

    const _fy = Math.round(this.H * 0.58);
    this.damagePops.push(new DamagePop(Math.round(this.W * 0.22), Math.round(_fy * 0.50), `-${dmg}`, '#FF5252'));

    // On penultimate attempt, hint the first correct tile
    this._showFirstHint = (this._wrongAttempts >= MAX_WRONGS - 1);

    // Reset build and re-render tiles in the same shuffled order
    this._currentBuilt = [];
    this._usedTileIdx  = new Set();
    this._renderCurrentWordTiles();
    this._renderBlanks();

    if (this.rikuHp <= 0) { this._lose(); return; }
  }

  // ── Skip word after 3 failures ───────────────────────────────
  _skipWord() {
    this._stopBlendTimer();
    this.state = 'boss-attack';
    this._combo = 0;

    const dmg = this.stage.bossAttack;
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    this._rikuShake = 14;
    this._bossShake = 6;
    if (this.audio) this.audio.sfxHurt();

    const wordUp = this._currentWord.word.toUpperCase();
    this._setFeedback(`💦 "${wordUp}" — the answer was: ${this._currentWord.phonemes.map(p=>p.toUpperCase()).join(' · ')}`, '#FF9800');

    const _fy = Math.round(this.H * 0.58);
    this.damagePops.push(new DamagePop(Math.round(this.W * 0.22), Math.round(_fy * 0.50), `🦖 -${dmg}`, '#FF5252'));

    if (this.progress) this.progress.recordBlend(this.stage.id, this._currentWord.word, false);

    setTimeout(() => {
      if (this._destroyed) return;
      if (this.rikuHp <= 0) { this._lose(); return; }
      this.state = 'idle';
      this._startNextWord();
      this._startBlendTimer();
    }, 1600);
  }

  // ── Boss phase check ─────────────────────────────────────────
  _checkBossPhase() {
    const pct = this.bossHp / this.bossMaxHp;
    const oldPhase = this._bossPhase;
    if (pct <= BOSS_PHASE3_PCT && this._bossPhase < 3) {
      this._bossPhase = 3;
    } else if (pct <= BOSS_PHASE2_PCT && this._bossPhase < 2) {
      this._bossPhase = 2;
    }
    if (this._bossPhase !== oldPhase) {
      this._enterBossPhase(this._bossPhase);
    }
  }

  _enterBossPhase(phase) {
    this._phaseFlash = 80;  // frames of flash effect
    this._bossShake  = 30;
    const msgs = {
      2: ['💢 BOSS RAGE MODE!', `${this.stage.bossName} is angry!`],
      3: ['🔥 BERSERK MODE!',    `${this.stage.bossName} goes WILD!`],
    };
    const [title, sub] = msgs[phase] || ['⚡ PHASE CHANGE!', ''];
    this._setFeedback(`${title} — ${sub}`, phase === 3 ? '#FF1744' : '#FF9800');
    this.damagePops.push(new DamagePop(
      Math.round(this.W * 0.72), Math.round(this.H * 0.25),
      title, phase === 3 ? '#FF1744' : '#FF8F00',
    ));
    if (this.audio) this.audio.sfxBossHit();
  }

  // ── Riku special attack (combo ≥ 5) ─────────────────────────
  _rikuSpecialAttack(wordObj) {
    this._specialReady = false;
    const floorY = Math.round(this.H * 0.58);
    const bossX  = Math.round(this.W * 0.72);
    const bossY  = Math.round(floorY * 0.50);
    const specialDmg = Math.floor(wordObj.damage * 3.5);

    this.bossHp = Math.max(0, this.bossHp - specialDmg);
    this._bossShake = 40;

    // Massive particle burst
    for (let i = 0; i < 8; i++) {
      this.slashParticles.push(new SlashParticle(
        bossX + (Math.random() - 0.5) * 80,
        bossY + (Math.random() - 0.5) * 80,
      ));
    }
    this.damagePops.push(new DamagePop(bossX, bossY - 50,  `⚡ MEGA STRIKE! -${specialDmg}`, '#FFD700'));
    this.damagePops.push(new DamagePop(bossX, bossY - 100, '🍚 RICE POWER!! 🍚', '#FF4081'));
    this._setFeedback(`🌟 RIKU SPECIAL ATTACK!! ${specialDmg} DAMAGE! 🌟`, '#FFD700');
    this._checkBossPhase();
  }

  // ── Successful blend ─────────────────────────────────────────
  _successBlend(wordObj) {
    this._stopBlendTimer();
    this.state = 'riku-attack';

    const timeBonus = this._blendTimeLeft / BLEND_TIME;
    const comboMult = 1 + Math.min(this._combo, 4) * 0.25;
    // Phase damage multiplier — reward surviving to later boss phases
    const phaseMult = this._bossPhase === 3 ? 1.2 :
                      this._bossPhase === 2 ? 1.1 : 1.0;
    const damage    = Math.floor(wordObj.damage * comboMult * (0.7 + timeBonus * 0.3) * phaseMult);

    this._combo++;
    this.bossHp  = Math.max(0, this.bossHp - damage);
    this.score  += damage * 2;
    this._bossShake = 22;

    // Mark special as ready at combo 5
    if (this._combo >= 5) this._specialReady = true;

    if (this.progress) this.progress.recordBlend(this.stage.id, wordObj.word, true);
    if (this.audio)    this.audio.sfxSlash();
    if (this.audio)    this.audio.sfxBossHit();
    setTimeout(() => {
      if (this._destroyed) return;
      if (this.audio) this.audio.playBlendSequence(wordObj.phonemes, wordObj.word);
    }, 200);

    const floorY = Math.round(this.H * 0.58);
    const bossX  = Math.round(this.W * 0.72);
    const bossY  = Math.round(floorY * 0.50);

    // At combo 5+: trigger Riku's special attack
    if (this._combo >= 5 && this._specialReady) {
      setTimeout(() => this._rikuSpecialAttack(wordObj), 400);
    } else {
      for (let i = 0; i < 3; i++) {
        this.slashParticles.push(new SlashParticle(
          bossX + (Math.random()-0.5)*40,
          bossY + (Math.random()-0.5)*40,
        ));
      }
    }

    const _praisePerfect = ['PERFECT! 💥','RICE POWER! 🍚⚡','UNSTOPPABLE! 🔥','SAMURAI STRIKE! ⚔️','PHONICS FURY! 💫'];
    const _praiseGreat   = ['GREAT! ⚔️','NICE SLICE! 🗡️','WORD WARRIOR! 🏆','SLICED IT! ✨','DINO SMASHER! 💪'];
    const _rng = Math.floor(Math.random() * 5);
    const gradeText = this._combo >= 5 ? `✨ RIKU SPECIAL! ×${this._combo}` :
                      this._combo >= 3 ? `COMBO ×${this._combo}! ⚡` :
                      timeBonus > 0.7  ? _praisePerfect[_rng] : _praiseGreat[_rng];

    this.damagePops.push(new DamagePop(bossX, bossY - 40, `-${damage}`, '#FFD700'));
    this.damagePops.push(new DamagePop(bossX, bossY - 80, gradeText, '#fff'));
    this._setFeedback(`⚔️ "${wordObj.word.toUpperCase()}" — ${gradeText} (${damage} dmg)`, '#FFD700');

    this._checkBossPhase();

    const delay = this._combo >= 5 ? 2000 : 1400;
    setTimeout(() => {
      if (this._destroyed) return;
      if (this.bossHp <= 0) {
        this._win();
      } else {
        this.state = 'idle';
        this._startNextWord();
        this._startBlendTimer();
      }
    }, delay);
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
    // Phase amplifies boss attack
    const phaseMult = this._bossPhase === 3 ? 1.5 : this._bossPhase === 2 ? 1.25 : 1.0;
    this._bossShake = this._bossPhase >= 2 ? 14 : 8;
    this._combo = 0;

    const dmg = Math.floor(this.stage.bossAttack * phaseMult);
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    if (this.audio) this.audio.sfxBossHit();
    if (this.audio) this.audio.sfxHurt();

    const _fy = Math.round(this.H * 0.58);
    const roar = this._bossPhase === 3 ? '🔥 ENRAGED! ' : this._bossPhase === 2 ? '💢 ' : '';
    this.damagePops.push(new DamagePop(Math.round(this.W * 0.22), Math.round(_fy * 0.50), `🦖 -${dmg}`, '#FF5252'));
    this._setFeedback(`${roar}⚡ Too slow! Boss attacks! — blend faster!`, '#FF9800');

    // Phase 3: shorter recovery so boss feels relentless
    const recoverDelay = this._bossPhase === 3 ? 900 : this._bossPhase === 2 ? 1050 : 1200;
    setTimeout(() => {
      if (this._destroyed) return;
      if (this.rikuHp <= 0) { this._lose(); return; }
      this.state = 'idle';
      this._startNextWord();
      this._startBlendTimer();
    }, recoverDelay);
  }

  // ── Clear build (keep current word, reset attempts) ──────────
  _clearBuild() {
    if (this.state === 'riku-attack' || this.state === 'boss-attack') return;
    this._currentBuilt = [];
    this._usedTileIdx  = new Set();
    this._renderCurrentWordTiles();
    this._renderBlanks();
    this._setFeedback('');
    this.state = 'idle';
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
    if (this._paused) return;
    this._age++;
    if (this._bossShake  > 0) this._bossShake--;
    if (this._rikuShake  > 0) this._rikuShake--;
    if (this._phaseFlash > 0) this._phaseFlash--;
    // Boss bob speed increases with phase
    const bobSpeed = this._bossPhase === 3 ? 0.09 : this._bossPhase === 2 ? 0.06 : 0.04;
    this._bossBobOffset = Math.sin(this._age * bobSpeed) * (this._bossPhase >= 2 ? 9 : 5);

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

    // ── Phase change flash overlay ──────────────────────────────
    if (this._phaseFlash > 0) {
      const alpha = (this._phaseFlash / 80) * 0.35;
      ctx.fillStyle = this._bossPhase === 3
        ? `rgba(255,23,68,${alpha})`
        : `rgba(255,111,0,${alpha})`;
      ctx.fillRect(0, 0, this.W, this.H);

      // Phase banner
      if (this._phaseFlash > 40) {
        const bannerAlpha = (this._phaseFlash - 40) / 40;
        ctx.save();
        ctx.globalAlpha = bannerAlpha;
        ctx.font        = `bold ${Math.min(32, this.W * 0.065)}px "Comic Sans MS", system-ui`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle   = this._bossPhase === 3 ? '#FF1744' : '#FF8F00';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
        ctx.fillText(
          this._bossPhase === 3 ? '🔥 BERSERK MODE! 🔥' : '💢 BOSS RAGE! 💢',
          this.W / 2, this.H / 2,
        );
        ctx.restore();
      }
    }

    // ── Combo badge ─────────────────────────────────────────────
    if (this._combo >= 2 && this.state === 'idle') {
      const pulse = 0.8 + 0.2 * Math.sin(this._age * 0.2);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font        = `bold ${16 + this._combo * 2}px "Comic Sans MS", system-ui`;
      ctx.fillStyle   = '#FFD700';
      ctx.textAlign   = 'right';
      ctx.shadowColor = '#FF6F00';
      ctx.shadowBlur  = 8;
      ctx.fillText(`🔥 COMBO ×${this._combo}`, this.W - 12, 90);
      ctx.restore();
    }

    // ── Special attack ready badge ───────────────────────────────
    if (this._specialReady && this.state === 'idle') {
      const pulse = 0.7 + 0.3 * Math.sin(this._age * 0.3);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font        = `bold 18px "Comic Sans MS", system-ui`;
      ctx.fillStyle   = '#FF4081';
      ctx.textAlign   = 'left';
      ctx.shadowColor = '#FF1744'; ctx.shadowBlur = 10;
      ctx.fillText(`✨ SPECIAL READY!`, 12, 90);
      ctx.restore();
    }

    // ── Boss phase indicator ─────────────────────────────────────
    if (this._bossPhase >= 2) {
      const phaseColor = this._bossPhase === 3 ? '#FF1744' : '#FF8F00';
      const phaseLabel = this._bossPhase === 3 ? '🔥 BERSERK' : '💢 RAGE';
      ctx.save();
      ctx.font      = 'bold 12px "Comic Sans MS", system-ui';
      ctx.fillStyle = phaseColor;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      const alpha = 0.6 + 0.4 * Math.sin(this._age * 0.18);
      ctx.globalAlpha = alpha;
      ctx.fillText(phaseLabel, Math.round(this.W * 0.72), Math.round(this.H * 0.04));
      ctx.restore();
    }

    // ── Pause overlay ────────────────────────────────────────────
    if (this._paused) this._drawPauseOverlay(ctx);
  }

  // ── Pause helpers ─────────────────────────────────────────────
  _togglePause() {
    this._paused = !this._paused;
    if (this._paused) {
      this._stopBlendTimer();
    } else {
      // Resume the blend timer from where it left off
      if ((this.state === 'idle' || this.state === 'blending') && this._blendTimeLeft > 0) {
        this._resumeBlendTimer();
      }
    }
  }

  // Restart blend-timer interval without resetting _blendTimeLeft
  _resumeBlendTimer() {
    this._stopBlendTimer();
    this._blendTimer = setInterval(() => {
      this._blendTimeLeft -= 0.1;
      const pct = Math.max(0, this._blendTimeLeft / BLEND_TIME);
      this._timerBar.style.width  = (pct * 100) + '%';
      this._timerBar.className = 'be-timer-fill' +
        (pct < 0.25 ? ' be-timer-urgent' : pct < 0.5 ? ' be-timer-warn' : '');
      if (this._blendTimeLeft <= 0) {
        this._stopBlendTimer();
        this._bossAutoAttack();
      }
    }, 100);
  }

  _drawPauseOverlay(ctx) {
    const cx = this.W / 2;
    const cy = Math.round(this.H * 0.30); // centre in upper canvas (battle UI below)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, this.W, this.H * 0.60);
    // Panel
    const pw = Math.min(300, this.W * 0.72);
    const ph = 145;
    ctx.fillStyle   = 'rgba(10,10,30,0.88)';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 18); ctx.fill(); ctx.stroke();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(this.W * 0.068)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle    = '#FFD700';
    ctx.shadowColor  = '#FF6F00';
    ctx.shadowBlur   = 14;
    ctx.fillText('⏸ PAUSED', cx, cy - 32);
    ctx.shadowBlur   = 0;
    ctx.font      = `${Math.round(this.W * 0.034)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.fillText('P or ESC to resume', cx, cy + 8);
    ctx.fillStyle = '#FF9800';
    ctx.font      = `${Math.round(this.W * 0.031)}px "Comic Sans MS", system-ui`;
    ctx.fillText('Q — quit to map', cx, cy + 42);
    ctx.restore();
  }

  _drawBackground(ctx) {
    const bgKey = this.stage.bg;
    const bgSp  = bgKey && this.sprites[bgKey];
    if (bgSp && bgSp.complete && bgSp.naturalWidth > 0) {
      const imgW = bgSp.naturalWidth;
      const imgH = bgSp.naturalHeight;
      const scale = Math.max(this.W / imgW, this.H / imgH);
      const dw = imgW * scale;
      const dh = imgH * scale;
      ctx.drawImage(bgSp, (this.W - dw) / 2, (this.H - dh) / 2, dw, dh);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(0, 0, this.W, this.H);
    } else {
      // Fallback: gradient fills the full canvas so no bare areas show
      const colors = this.stage.skyColor || ['#1565C0', '#42A5F5'];
      const grad   = ctx.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0,    colors[0]);
      grad.addColorStop(0.65, colors[1]);
      grad.addColorStop(1,    colors[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, this.H * 0.55, this.W, 30);
    }

    ctx.font      = `bold 14px system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.stage.name}  ⚔️  Boss Battle`, this.W / 2, 26);
  }

  _floorY() { return Math.round(this.H * 0.58); }

  _drawFloor(ctx) {
    const fy = this._floorY();
    // Soft shadow above the ground line
    const shadow = ctx.createLinearGradient(0, fy - 18, 0, fy + 4);
    shadow.addColorStop(0, 'rgba(0,0,0,0.0)');
    shadow.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, fy - 18, this.W, 22);
    // Thin grass strip only — background image shows through below
    ctx.fillStyle = this.stage.groundColor || '#2E7D32';
    ctx.fillRect(0, fy, this.W, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(0, fy, this.W, 2);
  }

  _drawBoss(ctx) {
    const fy     = this._floorY();
    const bH     = Math.round(fy * 0.90);
    const bW     = Math.round(bH * 0.85);
    const bCX    = Math.round(this.W * 0.72);
    const bFeetY = fy;
    const bCY    = bFeetY - bH / 2;

    const shakeX = this._bossShake > 0 ? (Math.random() - 0.5) * 14 : 0;
    const shakeY = this._bossShake > 0 ? (Math.random() - 0.5) * 8  : 0;
    const bob    = this._bossBobOffset;
    const scale  = 1 + Math.min(0.25, this._bossShake * 0.012);
    const hpPct  = this.bossHp / this.bossMaxHp;
    const sp     = this.sprites[this.stage.bossFile];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(bCX, bFeetY + 6, bW * 0.38, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(bCX + shakeX, bCY + shakeY + bob);
    ctx.scale(scale, scale);

    if (sp && sp.complete && sp.naturalWidth > 0) {
      ctx.save();
      ctx.scale(-1, 1);
      // Phase 3: red glow filter
      if (this._bossPhase === 3) {
        ctx.shadowColor = '#FF1744';
        ctx.shadowBlur  = 30 + Math.sin(this._age * 0.18) * 12;
      } else if (this._bossPhase === 2) {
        ctx.shadowColor = '#FF8F00';
        ctx.shadowBlur  = 16 + Math.sin(this._age * 0.15) * 6;
      }
      ctx.drawImage(sp, -bW / 2, -bH / 2, bW, bH);
      ctx.restore();
      if (this._bossPhase >= 2) {
        const phaseAlpha = (this._bossPhase === 3 ? 0.32 : 0.18) *
                           (0.6 + 0.4 * Math.sin(this._age * 0.22));
        ctx.globalAlpha = phaseAlpha;
        ctx.fillStyle   = this._bossPhase === 3 ? '#FF1744' : '#FF8F00';
        ctx.beginPath(); ctx.ellipse(0, 0, bW / 2, bH / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (hpPct < 0.3) {
        ctx.globalAlpha = 0.28 * (0.6 + 0.4 * Math.sin(this._age * 0.25));
        ctx.fillStyle   = '#F44336';
        ctx.beginPath(); ctx.ellipse(0, 0, bW / 2, bH / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      this._drawFallbackBoss(ctx, hpPct, bW, bH);
    }
    ctx.restore();

    const nameY = bFeetY - bH + bob - 12;
    ctx.font        = `bold ${Math.max(13, Math.floor(this.W * 0.027))}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#fff';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 5;
    ctx.fillText(this.stage.bossName, bCX + shakeX, nameY);
    if (hpPct < 0.25) {
      ctx.font = '20px serif';
      ctx.fillText('😤', bCX + shakeX, nameY - 22);
    }
    ctx.shadowBlur = 0;
  }

  _drawFallbackBoss(ctx, hpPct, bossW, bossH) {
    const s   = (bossH || 160) / 160;
    const c   = this.stage.accentColor || '#FF6F00';
    const hue = hpPct < 0.3 ? '#B71C1C' : c;

    ctx.fillStyle = hue;
    ctx.beginPath(); ctx.ellipse(0, 20*s, 44*s, 36*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-36*s, -18*s, 34*s, 24*s, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4E342E';
    ctx.beginPath();
    ctx.moveTo(-64*s, -10*s); ctx.quadraticCurveTo(-52*s, 2*s, -22*s, -4*s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((-58 + i*10)*s, -10*s);
      ctx.lineTo((-54 + i*10)*s, -2*s);
      ctx.lineTo((-50 + i*10)*s, -10*s);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#FFF176';
    ctx.beginPath(); ctx.ellipse(-30*s, -24*s, 10*s, 10*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath(); ctx.ellipse(-28*s, -24*s, 5*s, 6*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hue;
    ctx.fillRect(10*s, -2*s, 16*s, 10*s); ctx.fillRect(10*s, 10*s, 12*s, 10*s);
    ctx.beginPath();
    ctx.moveTo(44*s, 20*s); ctx.quadraticCurveTo(80*s, 40*s, 90*s, 10*s);
    ctx.lineWidth = 18*s; ctx.strokeStyle = hue; ctx.stroke();
    ctx.fillStyle = hue;
    ctx.fillRect(-20*s, 52*s, 20*s, 28*s); ctx.fillRect(8*s, 52*s, 20*s, 28*s);
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-24*s, 76*s, 26*s, 8*s); ctx.fillRect(6*s, 76*s, 26*s, 8*s);
    if (hpPct < 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10*s, -30*s); ctx.lineTo(10*s, 10*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20*s, -10*s);  ctx.lineTo(5*s, 30*s);  ctx.stroke();
    }
  }

  _drawRiku(ctx) {
    const fy     = this._floorY();

    // Resolve sprite first so we can use its natural aspect ratio (avoids stretching)
    let spKey = 'riku-idle';
    if (this.state === 'riku-attack')                         spKey = 'riku-run';
    if (this.state === 'boss-attack' || this._rikuShake > 0) spKey = 'riku-hurt';
    if (this.done && this.outcome === 'victory')              spKey = 'riku-victory';
    const sp = this.sprites[spKey] || this.sprites['riku-idle'] || this.sprites['riku-run'];

    const rH     = Math.round(fy * 0.78);
    const _ar    = (sp && sp.complete && sp.naturalWidth > 0) ? sp.naturalWidth / sp.naturalHeight : 0.65;
    const rW     = Math.round(rH * _ar);
    const rCX    = Math.round(this.W * 0.22);
    const rFeetY = fy;
    const rCY    = rFeetY - rH / 2;

    const shakeX = this._rikuShake > 0 ? (Math.random() - 0.5) * 10 : 0;
    const shakeY = this._rikuShake > 0 ? (Math.random() - 0.5) * 5  : 0;
    const bob    = this.state === 'idle' ? Math.sin(this._age * 0.05) * 3 : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(rCX, rFeetY + 6, rW * 0.36, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(rCX + shakeX, rCY + shakeY + bob);
    if (sp && sp.complete && sp.naturalWidth > 0) {
      if (this.state === 'riku-attack') { ctx.rotate(0.18); ctx.translate(12, 0); }
      ctx.drawImage(sp, -rW / 2, -rH / 2, rW, rH);
    } else {
      this._drawFallbackRiku(ctx, rW, rH);
    }
    ctx.restore();

    if (this.done && this.outcome === 'victory') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + this._age * 0.05;
        ctx.font = '18px serif'; ctx.textAlign = 'center';
        ctx.fillText('✨', rCX + Math.cos(a) * 60, rCY + Math.sin(a) * 60);
      }
    }
  }

  _drawFallbackRiku(ctx, w, h) {
    const cx = 0;
    const ty = -h / 2;

    ctx.fillStyle = '#F5F5F0';
    ctx.beginPath(); ctx.ellipse(cx, ty + h * 0.55, w * 0.38, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - w * 0.38, ty + h * 0.38, w * 0.76, h * 0.16);
    ctx.fillStyle = '#fff9e0';
    ctx.beginPath(); ctx.ellipse(cx, ty + h * 0.24, w * 0.3, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(cx - 10, ty + h * 0.22, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, ty + h * 0.22, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3322';
    ctx.fillRect(cx - w * 0.3, ty + h * 0.08, w * 0.6, 7);

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

    const drawBar = (x, pct, col1, col2, label, textRight) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(x - 2, barY - 2, barW + 4, barH + 4, barH / 2 + 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(x, barY, barW, barH, barH / 2); ctx.fill();
      if (pct > 0) {
        const g = ctx.createLinearGradient(x, barY, x, barY + barH);
        g.addColorStop(0, col1);
        g.addColorStop(1, col2);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(x, barY, barW * pct, barH, barH / 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.roundRect(x + 2, barY + 2, barW * pct - 4, barH * 0.4, (barH * 0.4) / 2); ctx.fill();
      }
      ctx.font = 'bold 11px "Comic Sans MS", system-ui';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      ctx.textAlign = textRight ? 'right' : 'left';
      ctx.fillText(label, textRight ? x + barW : x, barY - 8);
      ctx.shadowBlur = 0;
    };

    const rikuPct = Math.max(0, this.rikuHp / this.rikuMaxHp);
    const rikuC1 = rikuPct > 0.5 ? '#6DD56B' : rikuPct > 0.25 ? '#FFCA28' : '#FF5252';
    const rikuC2 = rikuPct > 0.5 ? '#2E7D32' : rikuPct > 0.25 ? '#F57F17' : '#B71C1C';
    drawBar(margin, rikuPct, rikuC1, rikuC2,
      `🍚 RIKU  ${Math.ceil(this.rikuHp)}/${this.rikuMaxHp}`, false);

    const bossPct = Math.max(0, this.bossHp / this.bossMaxHp);
    drawBar(this.W - margin - barW, bossPct, '#FF7043', '#B71C1C',
      `${this.stage.bossName}  ${Math.ceil(this.bossHp)}/${this.bossMaxHp}  🦖`, true);

    ctx.restore();
  }

  // ── Cleanup ──────────────────────────────────────────────────
  destroy() {
    this._destroyed = true;
    this._stopBlendTimer();
    this.overlay.innerHTML = '';
  }
}

// ============================================================
// ENDLESS BATTLE ENGINE — appended to battleEngine.js
// Lightweight single-word phonics challenge for endless runner.
// Shows tiles on HTML overlay, draws canvas FX, returns result.
//
// result types: 'perfect' | 'good' | 'miss' | 'timeout'
// ============================================================

class EndlessBattleEngine {
  // timeLimit: seconds (default 4)
  constructor(canvas, overlay, wordObj, sprites, audio, logicalW, logicalH, onDone, autoBlend = false) {
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

    this.timeLimit  = 4.5;
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
      btn.className = 'ebe-tile' + (this._usedIdx.has(i) ? ' ebe-tile-used' : '');
      btn.textContent = ph.toUpperCase();
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
    const timeUsed = (performance.now() - this._startTime) / 1000;
    this.overlay.classList.remove('active');
    this.overlay.innerHTML = '';
    if (this.onDone) this.onDone(this._result, timeUsed);
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
