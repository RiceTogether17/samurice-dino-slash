'use strict';
// === CHANGE LOG ===
// Step 2 (Phonics & Battle System):
// - Added adaptive word queueing from progress weak-phoneme tracking.
// - Added speech-synthesis tile pronunciation on hover/click.
// - Added live tile feedback flashes (correct/incorrect) + colour-coded tiles.
// - Added streak multiplier + speed/accuracy based slash-type scoring.
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
// SLASH TRAIL  (Phase 7)
// Bezier arc drawn from a phoneme tile to the boss when the player
// taps the correct tile.  Fades out over ~25 frames.
// ─────────────────────────────────────────────────────────────
class SlashTrail {
  /**
   * @param {number} tx  tile canvas-space X
   * @param {number} ty  tile canvas-space Y
   * @param {number} bx  boss canvas-space X
   * @param {number} by  boss canvas-space Y
   */
  constructor(tx, ty, bx, by) {
    this.tx = tx; this.ty = ty;
    this.bx = bx; this.by = by;
    // Control point arcs upward so the trail curves like a sword stroke
    this.cpx = (tx + bx) / 2;
    this.cpy = Math.min(ty, by) - 60;
    this.life = 1.0;  // 0→dead
  }
  update() { this.life -= 0.04; }  // ~25 frames
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life) * 0.85;
    const grd = ctx.createLinearGradient(this.tx, this.ty, this.bx, this.by);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.5, 'rgba(255,215,0,0.7)');
    grd.addColorStop(1, 'rgba(255,100,0,0.1)');
    ctx.strokeStyle = grd;
    ctx.lineWidth   = 3 + this.life * 4;
    ctx.lineCap     = 'round';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 14 * this.life;
    ctx.beginPath();
    ctx.moveTo(this.tx, this.ty);
    ctx.quadraticCurveTo(this.cpx, this.cpy, this.bx, this.by);
    ctx.stroke();
    ctx.restore();
  }
  isDead() { return this.life <= 0; }
}

// ─────────────────────────────────────────────────────────────
// COMBO RING  (Phase 7)
// Expanding ring that radiates from the boss on streak milestones
// (combo ≥ 3 or ≥ 5).  Signals the player they've hit a hot streak.
// ─────────────────────────────────────────────────────────────
class ComboRing {
  /**
   * @param {number} x     centre X (boss position)
   * @param {number} y     centre Y (boss position)
   * @param {string} color ring colour (gold for ×3, magenta for ×5)
   */
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.color  = color;
    this.radius = 20;
    this.life   = 1.0;
  }
  update() {
    this.radius += 7;  // ring grows outward
    this.life   -= 0.045;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life) * 0.7;
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3 + this.life * 3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 18 * this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
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
    ctx.font        = 'bold 28px "Nunito", "Comic Sans MS", system-ui';
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
    this._blendTime  = stageData.blendTime ?? BLEND_TIME;
    this.sprites   = sprites || {};
    this.audio     = audio;
    this.progress  = progress;
    this._equippedEffects = this.progress?.getEquippedEffects?.() || {};

    // Use logical dimensions passed from SlashGame (avoids DPR physical-pixel bug)
    this.W = logicalW || canvas.clientWidth  || 480;
    this.H = logicalH || canvas.clientHeight || 700;

    // HP — runner phonemes give Riku a bonus (reward for good runner play)
    const bonusHp      = Math.min(40, collectedPhonemes.length * 2);
    this.rikuMaxHp     = 100 + bonusHp;
    this.rikuHp        = 100 + bonusHp;
    this.bossMaxHp     = stageData.bossHp;
    this.bossHp        = stageData.bossHp;

    // Word queue — adaptive ordering based on weak phonemes first
    this._wordQueue     = this._buildAdaptiveWordQueue();
    this._wordQueueIdx  = 0;
    this._currentWord   = null;

    // ── Sound Detective challenge rounds (phonemic-awareness modes) ──
    // Periodically a round asks the child to ISOLATE a sound (first /
    // last / middle / missing) instead of blending a whole word. This
    // mirrors the listen-and-identify modes that strong phonics apps use
    // and builds positional sound vocabulary.
    this._roundNum      = 0;
    this._isChallenge   = false;
    this._challenge     = null;
    this._challengeEvery = stageData.challengeEvery ?? 4;   // every Nth round is a mini-game round (1 = every round)
    this._stageActivities = Array.isArray(stageData.activities) ? stageData.activities : [];
    this._challengesSolved = 0;
    this._shuffledPh    = [];   // shuffled phoneme tiles for current word
    this._usedTileIdx   = new Set();  // which tile positions have been clicked

    // Battle state
    this.state       = 'idle';
    this._age        = 0;
    this._combo      = 0;
    this._streak     = 0;      // consecutive successful blends for streak multiplier
    this._attemptedBlends = 0; // local battle accuracy tracking
    this._correctBlends   = 0; // local battle accuracy tracking
    this.score       = 0;
    this._bossPhase  = 1;   // 1, 2, or 3
    this._phaseFlash = 0;
    this._coinBonus  = 1;     // >1 when the runner's coins were all collected
    this._tileStolen = false; // phase-2 gimmick: boss locked a distractor tile
    this._defeatFrames = 0;   // boss defeat animation countdown   // frames of phase-change visual effect
    this._specialReady = false;  // Riku special attack charged
    this._companionMercy = this._equippedEffects.battleMercy || 0;
    this._starterShield = !!this._equippedEffects.starterShield;

    // Animations
    this.slashParticles = [];
    this._slashTrails   = [];   // Phase 7: bezier arcs from tile → boss
    this._comboRings    = [];   // Phase 7: expanding rings at boss on streak milestones
    this._gradeFloat    = null;
    this.damagePops     = [];
    this._bossShake     = 0;
    this._rikuShake     = 0;
    this._bossBobOffset = 0;

    // Blend session
    this._blendTimeLeft  = this._blendTime;
    this._blendTimer     = null;
    this._currentBuilt   = [];   // phonemes selected so far
    this._builtTileIdxes = [];   // parallel array: tile index for each built phoneme (enables undo)
    this._wrongAttempts  = 0;    // wrong-order attempts for current word
    this._showFirstHint  = false; // highlight first phoneme tile on penultimate attempt
    this._feedbackFlashTimer = 0; // tiny visual pulse when a tile is right/wrong

    // Relaxed mode — no timer penalty for younger / slower learners
    this._relaxedMode = localStorage.getItem('samurice_relaxed') === '1';

    // Track words successfully learned this battle (for end-of-stage summary)
    this._learnedWords = [];

    // Pause
    this._paused = false;
    this._pauseResumeBtnRect = null;
    this._pauseQuitBtnRect   = null;

    // DOM refs (created by _setupDOM)
    this._tileEls   = [];
    this._setupDOM();

    this.done      = false;
    this.outcome   = null;  // 'victory' | 'defeat'
    this._destroyed = false; // guards against orphaned setTimeout callbacks after destroy()

    // ── Keyboard tile selection ──────────────────────────────
    this._kbHandler = (e) => this._onKeyDown(e);
    document.addEventListener('keydown', this._kbHandler);

    // Kick off first word after a short delay (let canvas settle)
    setTimeout(() => { if (!this._destroyed) { this._startNextWord(); this._startBlendTimer(); } }, 400);
  }

  // ── Keyboard tile selection ─────────────────────────────────
  // Letter keys select the first non-used tile whose phoneme starts
  // with that letter; Backspace undoes the last placed tile.
  _onKeyDown(e) {
    if (this._paused || this.done) return;
    if (this.state !== 'idle' && this.state !== 'blending') return;
    // Ignore modifier combos (Ctrl+R reload etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Sound Detective rounds: match a letter key to an option tile.
    if (this._isChallenge && this._challenge) {
      const key = e.key;
      // Segment It: number keys 1–4 select option cards
      if (this._challenge.type === 'segment-it') {
        const idx = parseInt(key) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < this._tileEls.length) {
          e.preventDefault();
          const card = this._tileEls[idx];
          this._onSegmentCardClick(card.dataset.segKey, card);
        }
        return;
      }
      // Word-choice rounds (Rhyme / Sight Word): number keys 1–4 pick a card.
      if (this._challenge.cardKind === 'word') {
        const idx = parseInt(key) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < this._tileEls.length) {
          e.preventDefault();
          const card = this._tileEls[idx];
          this._onWordCardClick(card.dataset.wordKey, card);
        }
        return;
      }
      if (key.length !== 1) return;
      const k = key.toLowerCase();
      for (const pass of ['exact', 'prefix']) {
        for (let i = 0; i < this._challenge.options.length; i++) {
          const ph = this._challenge.options[i].toLowerCase();
          const match = pass === 'exact' ? ph === k : ph.startsWith(k);
          if (match && this._tileEls[i]) {
            e.preventDefault();
            this._onChallengeTileClick(this._challenge.options[i], this._tileEls[i]);
            return;
          }
        }
      }
      return;
    }

    const key = e.key;
    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault();
      this._undoLastTile();
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      this._clearBuild();
      return;
    }
    // Single printable character → match tile
    if (key.length !== 1) return;
    const k = key.toLowerCase();
    // Prefer exact-match first, then startsWith
    for (const pass of ['exact', 'prefix']) {
      for (let i = 0; i < this._shuffledPh.length; i++) {
        if (this._usedTileIdx.has(i)) continue;
        const ph = this._shuffledPh[i].toLowerCase();
        const match = pass === 'exact' ? ph === k : ph.startsWith(k);
        if (match) {
          e.preventDefault();
          this._onTileClick(this._shuffledPh[i], this._tileEls[i], i);
          return;
        }
      }
    }
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
    this._clearBtn.title       = 'Clear your answer (Escape)';
    this._clearBtn.setAttribute('aria-label', 'Clear answer (Escape key)');
    this._clearBtn.addEventListener('click', () => this._clearBuild());
    this._clearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._clearBuild(); });

    this._undoBtn = document.createElement('button');
    this._undoBtn.className   = 'be-btn be-btn-undo';
    this._undoBtn.innerHTML   = '↩ Undo';
    this._undoBtn.title       = 'Undo last tile (Backspace)';
    this._undoBtn.setAttribute('aria-label', 'Undo last tile (Backspace key)');
    this._undoBtn.addEventListener('click', () => this._undoLastTile());
    this._undoBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._undoLastTile(); });

    this._hearBtn = document.createElement('button');
    this._hearBtn.className   = 'be-btn be-btn-hear';
    this._hearBtn.innerHTML   = '🔊 Hear';
    this._hearBtn.title       = 'Hear the word';
    this._hearBtn.setAttribute('aria-label', 'Hear the word pronounced');
    this._hearBtn.addEventListener('click', () => {
      if (this._currentWord) {
        this.audio?.playBlendSequence(this._currentWord.phonemes, this._currentWord.word);
      }
    });
    this._hearBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._hearBtn.click(); });

    // Phase 8: explicit Hint button — reveals the next correct tile on demand
    this._hintBtn = document.createElement('button');
    this._hintBtn.className   = 'be-btn be-btn-hint';
    this._hintBtn.innerHTML   = '💡 Hint';
    this._hintBtn.title       = 'Highlight the next correct tile';
    this._hintBtn.setAttribute('aria-label', 'Show a hint — highlight the next tile');
    this._hintBtn.addEventListener('click', () => this._useHint());
    this._hintBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._useHint(); });

    controls.append(this._clearBtn, this._undoBtn, this._hearBtn, this._hintBtn);
    this.overlay.appendChild(controls);

    // ── 2. Target hint (emoji + blank slots) ────────────────
    this._targetEl = document.createElement('div');
    this._targetEl.className = 'be-target';

    this._targetEmojiEl = document.createElement('div');
    this._targetEmojiEl.className = 'be-target-emoji';
    this._targetEmojiEl.textContent = '❓';

    this._blanksEl = document.createElement('div');
    this._blanksEl.className = 'be-blanks';

    // Word structure label (e.g. "CCVCC") — letter-based, not phoneme-count-based
    this._structLabelEl = document.createElement('div');
    this._structLabelEl.className = 'be-struct-label';

    // Phase 8: live word preview — "SH · I · P = SHIP" shown as tiles are placed
    this._wordPreviewEl = document.createElement('div');
    this._wordPreviewEl.className = 'be-word-preview';

    this._targetEl.append(this._targetEmojiEl, this._blanksEl, this._structLabelEl, this._wordPreviewEl);
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

    // ── 6. "SAY IT!" celebration banner (educational moment) ──
    this._sayItBanner = document.createElement('div');
    this._sayItBanner.className = 'be-say-it-banner';
    this._sayItBanner.setAttribute('aria-live', 'assertive');
    this._sayItBanner.style.display = 'none';
    this.overlay.appendChild(this._sayItBanner);

    // ── 7. Relaxed mode indicator ─────────────────────────────
    if (this._relaxedMode) {
      const relaxedBadge = document.createElement('div');
      relaxedBadge.className = 'be-relaxed-badge';
      relaxedBadge.textContent = '😊 Relaxed Mode — no time pressure!';
      this.overlay.insertBefore(relaxedBadge, this.overlay.firstChild);
    }
  }

  // ── Start next word ──────────────────────────────────────────
  _startNextWord() {
    if (this.done) return;
    this._roundNum++;

    // Cycle through queue (re-shuffle when exhausted)
    if (this._wordQueueIdx >= this._wordQueue.length) {
      this._wordQueue    = this._buildAdaptiveWordQueue();
      this._wordQueueIdx = 0;
    }
    this._currentWord   = this._wordQueue[this._wordQueueIdx++];

    // Mini-game rounds (Sound Detective, Rhyme, Letter Sound, Sight Word…).
    // challengeEvery === 1 → EVERY round is a mini-game (used by sight-word
    // stages so irregular words are never sounded out letter-by-letter).
    // Otherwise every Nth round becomes a mini-game after a short warm-up.
    const alwaysChallenge = this._challengeEvery <= 1;
    const warmedUp = this._roundNum >= 3;
    const dueForChallenge = alwaysChallenge ||
        (warmedUp && this._roundNum % this._challengeEvery === 0);
    if (dueForChallenge && this._stageActivityTypes(this._currentWord).length > 0) {
      this._startChallengeRound(this._currentWord);
      return;
    }
    this._isChallenge = false;
    this._challenge   = null;
    // Tile pool = the word's phonemes + a world-scaled number of
    // distractors. With zero distractors the puzzle is order-only and
    // can be solved by tapping left-to-right; wrong-but-plausible
    // options make the child actually listen to each sound.
    //   World 1 stages 1-2: 0 (gentle first steps)
    //   World 1 stage 3+:   1   ·   World 2: 1   ·   World 3+: 2
    const _w = this.stage.world || 1;
    const _local = this.stage.local || 1;
    const distractorCount = _w === 1 ? (_local <= 2 ? 0 : 1) : Math.min(2, _w - 1);
    const distractors = this._pickBlendDistractors(this._currentWord, distractorCount);
    this._shuffledPh    = this._shuffleArray([...this._currentWord.phonemes, ...distractors]);
    this._wrongAttempts  = 0;
    this._currentBuilt   = [];
    this._builtTileIdxes = [];
    this._usedTileIdx    = new Set();
    this._showFirstHint = false;

    this._renderTargetHint();
    this._renderCurrentWordTiles();
    this._setFeedback('');
    // Phase 8: reset hint button so it's available for each new word
    if (this._hintBtn) { this._hintBtn.disabled = false; }
    if (this._wordPreviewEl) this._wordPreviewEl.textContent = '';

    // Speak the word as an audio hint (delayed so the tile animation settles first)
    setTimeout(() => {
      if (!this.done) this.audio?.playWord(this._currentWord.word);
    }, 350);
  }

  // ═════════════════════════════════════════════════════════════
  // SOUND DETECTIVE — phonemic-awareness challenge rounds
  // The child isolates a single sound by position instead of
  // blending the whole word: First / Last / Middle / Missing.
  // One mechanic (pick the sound for the highlighted slot) framed
  // four ways to teach positional sound vocabulary.
  // ═════════════════════════════════════════════════════════════
  // ── SEGMENT IT challenge (PhonicsQuest-inspired) ─────────────
  // Player sees the full word and picks the correct phoneme split.
  _startSegmentItRound(baseWord) {
    const phonemes  = baseWord.phonemes;
    const options   = this._generateSegmentItOptions(phonemes);
    const correctKey = phonemes.join('|');
    this._challenge = {
      type: 'segment-it', baseWord, phonemes,
      blankIdx: -1, answer: correctKey, options,
      instr: '🕵️ How do you BREAK UP the sounds?',
      tag:   'SEGMENT IT',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#CE93D8');
    if (this._hintBtn) this._hintBtn.disabled = false;
    setTimeout(() => { if (!this.done) this.audio?.playWord(baseWord.word); }, 350);
  }

  _generateSegmentItOptions(phonemes) {
    const correct = { key: phonemes.join('|'), phonemes: [...phonemes] };
    const d = [];
    if (phonemes.length === 3) {
      d.push({ key: `${phonemes[0]+phonemes[1]}|${phonemes[2]}`, phonemes: [phonemes[0]+phonemes[1], phonemes[2]] });
      d.push({ key: `${phonemes[0]}|${phonemes[1]+phonemes[2]}`, phonemes: [phonemes[0], phonemes[1]+phonemes[2]] });
      d.push({ key: phonemes.join(''), phonemes: [phonemes.join('')] });
    } else if (phonemes.length >= 4) {
      const p = phonemes;
      d.push({ key: [p[0]+p[1], ...p.slice(2)].join('|'), phonemes: [p[0]+p[1], ...p.slice(2)] });
      d.push({ key: [...p.slice(0,-2), p[p.length-2]+p[p.length-1]].join('|'), phonemes: [...p.slice(0,-2), p[p.length-2]+p[p.length-1]] });
      d.push({ key: [p[0], p[1]+p[2], ...p.slice(3)].join('|'), phonemes: [p[0], p[1]+p[2], ...p.slice(3)] });
    } else {
      d.push({ key: phonemes.join(''), phonemes: [phonemes.join('')] });
      d.push({ key: [phonemes[1],phonemes[0]].join('|'), phonemes: [phonemes[1],phonemes[0]] });
      d.push({ key: [phonemes[0],phonemes[0]].join('|'), phonemes: [phonemes[0],phonemes[0]] });
    }
    return this._shuffleArray([correct, ...d.slice(0, 3)]);
  }

  _renderSegmentItTiles() {
    this._poolEl.classList.add('be-pool-segment');
    this._tileEls = [];
    const c = this._challenge;
    c.options.forEach((opt) => {
      const isHint = this._showFirstHint && opt.key === c.answer;
      const card = document.createElement('button');
      card.className = 'be-segment-card' + (isHint ? ' be-tile-hint' : '');
      card.innerHTML = opt.phonemes.map(p => `<span class="be-seg-ph">${p.toUpperCase()}</span>`).join('<span class="be-seg-dot">•</span>');
      card.dataset.segKey = opt.key;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Segments: ${opt.phonemes.join(' - ')}`);
      card.addEventListener('click', () => this._onSegmentCardClick(opt.key, card));
      card.addEventListener('touchend', (e) => { e.preventDefault(); this._onSegmentCardClick(opt.key, card); });
      this._tileEls.push(card);
      this._poolEl.appendChild(card);
    });
  }

  _onSegmentCardClick(key, cardEl) {
    if (this.done || !this._isChallenge) return;
    if (this.state !== 'idle') return;
    const now = Date.now();
    if (now - (this._lastTileClickMs || 0) < 80) return;
    this._lastTileClickMs = now;
    if (key === this._challenge.answer) {
      this._flashTileFeedback(cardEl, 'ok');
      this._challengeSuccess(cardEl);
    } else {
      this._flashTileFeedback(cardEl, 'bad');
      this._onWrongChallenge(cardEl);
    }
  }

  // Which question types make sense for a given word?
  _validChallengeTypes(wordObj) {
    const len = wordObj?.phonemes?.length || 0;
    if (len < 2) return [];
    const types = ['first', 'last', 'missing'];
    if (len === 3) { types.push('middle'); types.push('segment-it'); }
    return types;
  }

  // Blank-slot index for each question type.
  _challengeBlankIndex(type, len) {
    switch (type) {
      case 'first':  return 0;
      case 'last':   return len - 1;
      case 'middle': return Math.floor(len / 2);
      case 'missing':
      default:       return Math.floor(Math.random() * len);
    }
  }

  // Pick distractor phonemes for a standard blending round. Prefers
  // phonetically confusable sounds (b/d, m/n, short vowels…) so a wrong
  // tap is a teachable near-miss, then falls back to the stage pool.
  // Never returns a phoneme that appears in the word itself.
  _pickBlendDistractors(wordObj, count) {
    if (count <= 0) return [];
    const CONFUSABLE = {
      b:['d','p'], d:['b','t'], p:['b','q'], t:['d'], m:['n'], n:['m'],
      a:['e','u'], e:['a','i'], i:['e'], o:['u'], u:['o','a'],
      s:['z','c'], f:['v'], v:['f'], g:['k'], k:['g','c'], c:['k','s'],
      sh:['ch','th'], ch:['sh','j'], th:['sh','f'], w:['v'], l:['r'], r:['l'],
    };
    const inWord = new Set((wordObj.phonemes || []).map(p => p.toLowerCase()));
    const picks = [];
    const tryAdd = (p) => {
      const lp = (p || '').toLowerCase();
      if (lp && !inWord.has(lp) && !picks.includes(lp)) picks.push(lp);
    };
    // 1. confusables of the word's own sounds (shuffled for variety)
    for (const ph of this._shuffleArray([...wordObj.phonemes])) {
      (CONFUSABLE[ph.toLowerCase()] || []).forEach(tryAdd);
      if (picks.length >= count) break;
    }
    // 2. top up from the stage-wide phoneme pool
    if (picks.length < count) {
      for (const p of this._shuffleArray([...this._distractorPool()])) {
        tryAdd(p);
        if (picks.length >= count) break;
      }
    }
    return picks.slice(0, count);
  }

  // Build a pool of distractor phonemes drawn from this stage's words.
  _distractorPool() {
    if (this._distractorCache) return this._distractorCache;
    const set = new Set();
    (this.stage.words || []).forEach(w =>
      (w.phonemes || []).forEach(p => set.add(p.toLowerCase())));
    // Guarantee a few basics so small stages still have options.
    ['s','t','m','n','p','b','a','e','i','o','u'].forEach(p => set.add(p));
    this._distractorCache = [...set];
    return this._distractorCache;
  }

  // The rime (rhyming part) of a word: from its last vowel sound to the end.
  _rimeOf(wordObj) {
    if (wordObj?.rime) return wordObj.rime.toLowerCase();
    const ph = wordObj?.phonemes || [];
    let vi = -1;
    for (let i = 0; i < ph.length; i++) { if (/[aeiou]/i.test(ph[i])) vi = i; }
    if (vi < 0) return ph.join('').toLowerCase();
    return ph.slice(vi).join('').toLowerCase();
  }

  // Words in this stage that rhyme / don't rhyme with the target.
  _rhymePartners(target) {
    const rime  = this._rimeOf(target);
    const words = this.stage.words || [];
    const correct = words.filter(x => x.word !== target.word && this._rimeOf(x) === rime);
    const others  = words.filter(x => x.word !== target.word && this._rimeOf(x) !== rime);
    return { rime, correct, others };
  }

  // Can a given mini-game type be built for this word / stage?
  _canBuildChallenge(type, w) {
    const len = w?.phonemes?.length || 0;
    switch (type) {
      case 'first': case 'last': case 'missing': return len >= 2;
      case 'middle':       return len >= 3;
      case 'letter-sound': return len >= 1;
      case 'oral-blend': {
        const hinted = (this.stage.words || []).filter(x => x.hint && x.word !== w.word);
        return !!w.hint && len >= 2 && len <= 4 && hinted.length >= 2;
      }
      case 'sound-count':  return len >= 2 && len <= 5;
      case 'segment-it':   return len >= 2;
      case 'rhyme':        return this._rhymePartners(w).correct.length > 0;
      case 'sight-word':   return (this.stage.words || []).length >= 2;
      default:             return false;
    }
  }

  // The mini-game types this stage wants (intersected with what's buildable),
  // falling back to the default Sound Detective set.
  _stageActivityTypes(wordObj) {
    if (this._stageActivities && this._stageActivities.length) {
      const list = this._stageActivities.filter(t => this._canBuildChallenge(t, wordObj));
      if (list.length) return list;
    }
    return this._validChallengeTypes(wordObj);
  }

  // ── Mini-game dispatcher ─────────────────────────────────────
  _startChallengeRound(baseWord) {
    this._isChallenge   = true;
    this._wrongAttempts = 0;
    this._showFirstHint = false;
    this.state          = 'idle';

    const types = this._stageActivityTypes(baseWord);
    const type  = types[Math.floor(Math.random() * types.length)];

    // Teach-before-test: the FIRST time each skill appears in a battle,
    // model it in plain language before asking (explicit instruction).
    if (!this._skillCoached) this._skillCoached = new Set();
    const firstTime = !this._skillCoached.has(type);
    this._skillCoached.add(type);

    switch (type) {
      case 'segment-it':   this._startSegmentItRound(baseWord); break;
      case 'rhyme':        this._startRhymeRound(baseWord); break;
      case 'sight-word':   this._startSightWordRound(baseWord); break;
      case 'letter-sound': this._startLetterSoundRound(baseWord); break;
      case 'oral-blend':   this._startOralBlendRound(baseWord); break;
      case 'sound-count':  this._startSoundCountRound(baseWord); break;
      default:             this._startSoundIsoRound(type, baseWord); break;
    }
    if (firstTime) this._coachSkill(type, baseWord);
  }

  // ── Skill Coach — plain-language "I do" before the child's "you do" ──
  _coachSkill(type, baseWord) {
    const tips = {
      first:        '🎓 NEW! FIRST SOUND — listen to the sound the word STARTS with.',
      last:         '🎓 NEW! LAST SOUND — listen to the sound the word ENDS with.',
      middle:       '🎓 NEW! MIDDLE SOUND — listen for the vowel sound in the middle.',
      missing:      '🎓 NEW! MISSING SOUND — which sound do you hear that isn’t shown?',
      'letter-sound':'🎓 NEW! LETTER SOUNDS — tap the letter that MAKES that sound.',
      rhyme:        '🎓 NEW! RHYMING — rhyming words end the same, like cat & hat.',
      'sight-word': '🎓 NEW! SIGHT WORDS — some words you just KNOW. Find the one you hear.',
      'segment-it': '🎓 NEW! SEGMENT IT — break the word into its separate sounds.',
      'oral-blend': '🎓 NEW! HEAR & FIND — listen to the sounds, blend them in your head, find the picture!',
      'sound-count':'🎓 NEW! COUNT THE SOUNDS — how many sounds does the word have?',
    };
    const tip = tips[type];
    if (!tip) return;
    // The coaching banner replaces the round prompt until the child acts,
    // and we model the example aloud a beat after it appears.
    this._setFeedback(tip, '#FFE082');
    setTimeout(() => {
      if (this._destroyed || this.done) return;
      if (type === 'letter-sound' && this._challenge?.playTarget) {
        this.audio?.playPhoneme(this._challenge.playTarget);
      } else if (baseWord) {
        this.audio?.playWord(baseWord.word);
      }
    }, 750);
  }

  // ── Phonemic awareness: isolate First / Last / Middle / Missing sound ──
  _startSoundIsoRound(type, baseWord) {
    const phonemes = baseWord.phonemes;
    const blankIdx = this._challengeBlankIndex(type, phonemes.length);
    const answer   = phonemes[blankIdx].toLowerCase();

    // Pick 2 distractors of the same broad kind where possible.
    const answerIsVowel = /^[aeiou]$/.test(answer);
    const pool = this._distractorPool().filter(p =>
      p !== answer && /^[aeiou]$/.test(p) === answerIsVowel);
    const fallback = this._distractorPool().filter(p => p !== answer);
    const distractors = [];
    const src = pool.length >= 2 ? pool : fallback;
    const shuffledSrc = this._shuffleArray([...src]);
    for (const p of shuffledSrc) {
      if (distractors.length >= 2) break;
      if (!distractors.includes(p)) distractors.push(p);
    }

    const options = this._shuffleArray([answer, ...distractors]);

    const labels = {
      first:   { instr: '🕵️ Which sound does it START with?', tag: 'FIRST SOUND' },
      last:    { instr: '🕵️ Which sound does it END with?',   tag: 'LAST SOUND'  },
      middle:  { instr: '🕵️ Find the MIDDLE sound!',          tag: 'MIDDLE SOUND'},
      missing: { instr: '🕵️ Which sound is MISSING?',         tag: 'MISSING SOUND'},
    };

    this._challenge = {
      type, baseWord, phonemes, blankIdx, answer, options,
      cardKind: 'phoneme',
      instr: labels[type].instr, tag: labels[type].tag,
    };
    this._currentWord = baseWord;   // Hear button still speaks the whole word

    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#80D8FF');
    if (this._hintBtn) this._hintBtn.disabled = false;

    // Speak the word so the child can listen for the target sound.
    setTimeout(() => { if (!this.done) this.audio?.playWord(baseWord.word); }, 350);
  }

  // ── Letter Sounds: hear a sound, tap the letter that makes it ──
  _startLetterSoundRound(baseWord) {
    const phonemes = baseWord.phonemes;
    const idx      = Math.floor(Math.random() * phonemes.length);
    const answer   = phonemes[idx].toLowerCase();

    const answerIsVowel = /^[aeiou]/.test(answer);
    const pool = this._distractorPool().filter(p =>
      p !== answer && /^[aeiou]/.test(p) === answerIsVowel);
    const fallback = this._distractorPool().filter(p => p !== answer);
    const src = pool.length >= 2 ? pool : fallback;
    const distractors = [];
    for (const p of this._shuffleArray([...src])) {
      if (distractors.length >= 2) break;
      if (!distractors.includes(p)) distractors.push(p);
    }

    const options = this._shuffleArray([answer, ...distractors]);
    this._challenge = {
      type: 'letter-sound', baseWord, phonemes, blankIdx: idx, answer, options,
      cardKind: 'phoneme', playTarget: answer,
      instr: '🔡 Tap the letter for the sound you hear!', tag: 'LETTER SOUND',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#FFD180');
    if (this._hintBtn) this._hintBtn.disabled = false;
    // Play the SOUND (not the word) so the child maps sound → letter.
    setTimeout(() => { if (!this.done) this.audio?.playPhoneme?.(answer); }, 350);
  }

  // ── Rhyme: pick the word that rhymes with the target ──
  _startRhymeRound(baseWord) {
    const { correct, others } = this._rhymePartners(baseWord);
    if (!correct.length) { this._startSoundIsoRound('last', baseWord); return; }
    const right    = correct[Math.floor(Math.random() * correct.length)];
    const distract = this._shuffleArray([...others]).slice(0, 3);
    const options  = this._shuffleArray([right, ...distract])
      .map(w => ({ key: w.word, word: w.word, hint: w.hint }));

    this._challenge = {
      type: 'rhyme', baseWord, answer: right.word, options,
      cardKind: 'word', showHint: true, playTarget: baseWord.word,
      instr: `🎵 Which word RHYMES with "${baseWord.word.toUpperCase()}"?`, tag: 'RHYME TIME',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#80D8FF');
    if (this._hintBtn) this._hintBtn.disabled = false;
    setTimeout(() => { if (!this.done) this.audio?.playWord(baseWord.word); }, 350);
  }

  // ── Sight Words: hear the word, find it among look-alikes ──
  _startSightWordRound(baseWord) {
    const others   = (this.stage.words || []).filter(w => w.word !== baseWord.word);
    const distract = this._shuffleArray([...others]).slice(0, 3);
    const options  = this._shuffleArray([baseWord, ...distract])
      .map(w => ({ key: w.word, word: w.word, hint: w.hint }));

    this._challenge = {
      type: 'sight-word', baseWord, answer: baseWord.word, options,
      cardKind: 'word', showHint: false, playTarget: baseWord.word,
      instr: '👁️ Find the word you hear!', tag: 'SIGHT WORD',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#A5D6A7');
    if (this._hintBtn) this._hintBtn.disabled = false;
    setTimeout(() => { if (!this.done) this.audio?.playWord(baseWord.word); }, 350);
  }

  // ── ORAL BLEND (PhonicsQuest 'Hear the Sounds') ──────────────
  // Pure phonemic awareness: the child HEARS the phonemes spoken one
  // by one (never the whole word) and picks the matching PICTURE.
  // No print anywhere — this is the pre-reading step.
  _startOralBlendRound(baseWord) {
    const others   = (this.stage.words || []).filter(w => w.hint && w.word !== baseWord.word);
    const distract = this._shuffleArray([...others]).slice(0, 3);
    const options  = this._shuffleArray([baseWord, ...distract])
      .map(w => ({ key: w.word, word: w.word, hint: w.hint }));
    this._challenge = {
      type: 'oral-blend', baseWord, answer: baseWord.word, options,
      cardKind: 'word', cardStyle: 'picture', showHint: true, playTarget: null,
      instr: '👂 Listen to the sounds… which picture is it?', tag: 'HEAR & FIND',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#80D8FF');
    if (this._hintBtn) this._hintBtn.disabled = false;
    setTimeout(() => this._playOralSequence(baseWord), 500);
  }

  // Speak the phonemes spaced apart so the child blends them mentally.
  _playOralSequence(wordObj) {
    if (this.done || this._destroyed) return;
    (wordObj.phonemes || []).forEach((ph, i) => {
      setTimeout(() => { if (!this.done) this.audio?.playPhoneme(ph); }, i * 620);
    });
  }

  // ── SOUND COUNT (PhonicsQuest 'Count the Sounds') ────────────
  // The child hears the word segmented and counts its phonemes.
  _startSoundCountRound(baseWord) {
    const n = (baseWord.phonemes || []).length;
    const opts = new Set([n]);
    for (const d of [n - 1, n + 1, n - 2, n + 2]) {
      if (opts.size >= 4) break;
      if (d >= 1 && d <= 6) opts.add(d);
    }
    const options = this._shuffleArray([...opts]).map(k => ({ key: String(k), word: String(k) }));
    this._challenge = {
      type: 'sound-count', baseWord, answer: String(n), options,
      cardKind: 'word', cardStyle: 'number', showHint: false, playTarget: null,
      instr: '🔢 How many sounds do you hear?', tag: 'COUNT THE SOUNDS',
    };
    this._currentWord = baseWord;
    this._renderChallengePrompt();
    this._renderChallengeTiles();
    this._setFeedback(this._challenge.instr, '#FFCC80');
    if (this._hintBtn) this._hintBtn.disabled = false;
    setTimeout(() => this._playOralSequence(baseWord), 500);
  }

  // Prompt: emoji + the word shown as slots, the queried slot a glowing "?".
  _renderChallengePrompt() {
    const c = this._challenge;
    // Hide structure label during challenge rounds — focus is on the challenge, not the structure.
    if (this._structLabelEl) this._structLabelEl.style.display = 'none';
    // Sight Word hides the emoji (it would give the answer away); others show it.
    this._targetEmojiEl.textContent =
      c.type === 'sight-word' ? '🔊' :
      c.type === 'letter-sound' ? '🔡' :
      c.type === 'oral-blend' ? '👂' :
      c.type === 'sound-count' ? '🔢' :
      (c.baseWord.hint || '🔊');

    if (c.type === 'oral-blend') {
      // No print at all — the sounds live in the child's ears.
      this._blanksEl.innerHTML = `<span class="be-blank be-blank-query">👂 ?</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '👂 HEAR & FIND — BLEND THE SOUNDS';
        this._wordPreviewEl.style.color = '#80D8FF';
      }
      return;
    }

    if (c.type === 'sound-count') {
      // No slots shown — visible slots would give the count away.
      this._blanksEl.innerHTML = `<span class="be-blank be-blank-query">🔢 ?</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '🔢 COUNT THE SOUNDS';
        this._wordPreviewEl.style.color = '#FFCC80';
      }
      return;
    }

    if (c.type === 'segment-it') {
      this._blanksEl.innerHTML = `<span class="be-blank be-blank-ghost be-word-full">${c.baseWord.word.toUpperCase()}</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '🕵️ SOUND DETECTIVE — SEGMENT IT';
        this._wordPreviewEl.style.color = '#CE93D8';
      }
      return;
    }

    if (c.type === 'sight-word') {
      this._blanksEl.innerHTML = `<span class="be-blank be-blank-query">🔊 ?</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '👁️ SIGHT WORD — LISTEN & FIND';
        this._wordPreviewEl.style.color = '#A5D6A7';
      }
      return;
    }

    if (c.type === 'rhyme') {
      this._blanksEl.innerHTML =
        `<span class="be-blank be-blank-ghost be-word-full">${c.baseWord.word.toUpperCase()}</span>` +
        `<span class="be-blank be-blank-query">🎵</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '🎵 RHYME TIME — FIND THE MATCH';
        this._wordPreviewEl.style.color = '#80D8FF';
      }
      return;
    }

    if (c.type === 'letter-sound') {
      this._blanksEl.innerHTML = `<span class="be-blank be-blank-query">🔊 ?</span>`;
      if (this._wordPreviewEl) {
        this._wordPreviewEl.textContent = '🔡 LETTER SOUND — TAP THE LETTER';
        this._wordPreviewEl.style.color = '#FFD180';
      }
      return;
    }

    const html = c.phonemes.map((ph, i) => {
      if (i === c.blankIdx) {
        return `<span class="be-blank be-blank-query">?</span>`;
      }
      return `<span class="be-blank be-blank-ghost">${ph.toUpperCase()}</span>`;
    }).join('');
    this._blanksEl.innerHTML = html;

    if (this._wordPreviewEl) {
      this._wordPreviewEl.textContent = `🕵️ SOUND DETECTIVE — ${c.tag}`;
      this._wordPreviewEl.style.color = '#80D8FF';
    }
  }

  _renderChallengeTiles() {
    this._poolEl.innerHTML = '';
    this._poolEl.classList.remove('be-pool-segment');
    this._tileEls = [];
    const c = this._challenge;
    if (c.type === 'segment-it') { this._renderSegmentItTiles(); return; }
    if (c.cardKind === 'word')   { this._renderWordCards(); return; }
    c.options.forEach((ph, idx) => {
      const colorClass = this._getPhonemeColorClass(ph);
      const isHint = this._showFirstHint && ph === c.answer;
      const tile = document.createElement('button');
      tile.className   = 'be-tile ' + colorClass + (isHint ? ' be-tile-hint' : '');
      tile.textContent = ph.toUpperCase();
      tile.dataset.phoneme = ph;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', `Sound ${ph.toUpperCase()}`);
      tile.setAttribute('title', `${ph.toUpperCase()} — press '${ph[0].toUpperCase()}' key`);
      tile.addEventListener('click', () => this._onChallengeTileClick(ph, tile));
      tile.addEventListener('mouseenter', () => { this.audio?.playPhoneme(ph); });
      tile.addEventListener('touchstart', () => { this.audio?.playPhoneme(ph); }, { passive: true });
      tile.addEventListener('touchend', (e) => { e.preventDefault(); this._onChallengeTileClick(ph, tile); });
      this._tileEls.push(tile);
      this._poolEl.appendChild(tile);
    });
  }

  _onChallengeTileClick(phoneme, tileEl) {
    if (this.done || !this._isChallenge) return;
    if (this.state !== 'idle') return;
    const now = Date.now();
    if (now - (this._lastTileClickMs || 0) < 80) return;
    this._lastTileClickMs = now;

    this.audio?.playPhoneme(phoneme);
    if (phoneme === this._challenge.answer) {
      this._flashTileFeedback(tileEl, 'ok');
      this._challengeSuccess(tileEl);
    } else {
      this._flashTileFeedback(tileEl, 'bad');
      this._onWrongChallenge(tileEl);
    }
  }

  // ── Word-choice cards (Rhyme / Sight Word) ───────────────────
  _renderWordCards() {
    this._poolEl.classList.add('be-pool-segment'); // reuse the card-grid layout
    this._tileEls = [];
    const c = this._challenge;
    c.options.forEach((opt) => {
      const isHint = this._showFirstHint && opt.key === c.answer;
      const card = document.createElement('button');
      card.className = 'be-segment-card be-word-card' + (isHint ? ' be-tile-hint' : '');
      if (c.cardStyle === 'picture') {
        // Picture-only card — no print, pure listening comprehension
        card.innerHTML = `<span class="be-card-picture">${opt.hint || '❓'}</span>`;
        card.setAttribute('aria-label', 'picture choice');
      } else if (c.cardStyle === 'number') {
        card.innerHTML = `<span class="be-card-number">${opt.word}</span>`;
      } else {
        const emoji = (c.showHint && opt.hint) ? `<span class="be-seg-dot">${opt.hint}</span>` : '';
        card.innerHTML = `${emoji}<span class="be-seg-ph">${opt.word}</span>`;
      }
      card.dataset.wordKey = opt.key;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', opt.word);
      card.addEventListener('click', () => this._onWordCardClick(opt.key, card));
      card.addEventListener('touchend', (e) => { e.preventDefault(); this._onWordCardClick(opt.key, card); });
      this._tileEls.push(card);
      this._poolEl.appendChild(card);
    });
  }

  _onWordCardClick(key, cardEl) {
    if (this.done || !this._isChallenge) return;
    if (this.state !== 'idle') return;
    const now = Date.now();
    if (now - (this._lastTileClickMs || 0) < 80) return;
    this._lastTileClickMs = now;
    if (key === this._challenge.answer) {
      this._flashTileFeedback(cardEl, 'ok');
      this._challengeSuccess(cardEl);
    } else {
      this._flashTileFeedback(cardEl, 'bad');
      this._onWrongChallenge(cardEl);
    }
  }

  _onWrongChallenge(tileEl) {
    this.audio?.sfxWrongBlend?.();
    this._wrongAttempts++;
    this._setFeedback(`❌ Listen again… find the ${this._challenge.tag.toLowerCase()}.`, '#FF8A80');
    if (this._challenge.type === 'segment-it') {
      setTimeout(() => { if (!this.done) this.audio?.playBlendSequence?.(this._challenge.phonemes, this._challenge.baseWord.word); }, 500);
    } else if (this._challenge.cardKind === 'word') {
      // Rhyme / Sight Word — replay the target word, not a single phoneme.
      setTimeout(() => { if (!this.done) this.audio?.playWord?.(this._challenge.playTarget || this._challenge.baseWord.word); }, 500);
    } else {
      setTimeout(() => { if (!this.done) this.audio?.playPhoneme?.(this._challenge.answer); }, 500);
    }

    const pokeDmg = Math.max(2, Math.floor(this.stage.bossAttack * 0.14));
    this.rikuHp = Math.max(0, this.rikuHp - this._applyIncomingDamage(pokeDmg, 'wrong-order'));
    this._rikuShake = 7;
    this._combo = 0; this._streak = 0;

    if (this._wrongAttempts >= MAX_WRONGS) {
      this._challengeReveal();
      return;
    }
    // Glow the correct tile on the final attempt to keep it fair.
    this._showFirstHint = this._wrongAttempts >= MAX_WRONGS - 1;
    this._renderChallengeTiles();
    if (this.rikuHp <= 0) this._lose();
  }

  // Out of tries: reveal the answer, light boss poke, move on.
  _challengeReveal() {
    if (this.done) return;
    this._stopBlendTimer();
    this.state = 'boss-attack';
    const ans = this._challenge.type === 'segment-it'
      ? this._challenge.phonemes.map(p => p.toUpperCase()).join(' • ')
      : this._challenge.answer.toUpperCase();
    this._setFeedback(`💦 The ${this._challenge.tag.toLowerCase()} was "${ans}"`, '#FF9800');
    this.audio?.sfxHurt?.();
    setTimeout(() => {
      if (this._destroyed) return;
      if (this.rikuHp <= 0) { this._lose(); return; }
      this.state = 'idle';
      this._startNextWord();
      this._startBlendTimer();
    }, 1500);
  }

  _challengeSuccess(tileEl) {
    this._stopBlendTimer();
    this.state = 'riku-attack';

    const timeBonus = Math.max(0, this._blendTimeLeft / this._blendTime);
    const streakMult = 1 + Math.min(this._streak, 8) * 0.12;
    const phaseMult  = this._bossPhase === 3 ? 1.2 : this._bossPhase === 2 ? 1.1 : 1.0;
    // Detective rounds are a single decisive strike — solid but not huge.
    const base   = Math.max(12, Math.floor(this.stage.bossAttack * 1.1));
    const damage = Math.floor(base * streakMult * (0.78 + timeBonus * 0.22) * phaseMult * this._coinBonus);

    this._combo++; this._streak++; this._attemptedBlends++; this._correctBlends++;
    this._challengesSolved++;
    this.bossHp = Math.max(0, this.bossHp - damage);
    this.score += Math.floor(damage * 2.0);
    this._bossShake = 22;
    if (this._combo >= 5) this._specialReady = true;

    // Slash sparks + trail from tile → boss (reuse the blend visuals).
    if (this.canvas && tileEl) {
      const cr = this.canvas.getBoundingClientRect();
      const tr = tileEl.getBoundingClientRect();
      const scx = this.W / cr.width, scy = this.H / cr.height;
      const tx = (tr.left + tr.width / 2 - cr.left) * scx;
      const ty = (tr.top + tr.height / 2 - cr.top) * scy;
      const bossX = Math.round(this.W * 0.72);
      const bossY = Math.round(this.H * 0.58 * 0.50);
      this._slashTrails.push(new SlashTrail(tx, ty, bossX, bossY));
      for (let i = 0; i < 4; i++) this.slashParticles.push(new SlashParticle(tx, ty));
    }

    // Credit the isolated sound toward phoneme mastery (lightens its weak-count).
    if (this.progress) {
      this.progress.recordBlend(this.stage.id, this._challenge.baseWord.word,
        true, timeBonus > 0.82, [this._challenge.answer]);
    }

    if (this.audio) { this.audio.sfxSlash(); this.audio.sfxBlendChime?.(); this.audio.sfxBossHit(); }

    const bossX = Math.round(this.W * 0.72);
    const bossY = Math.round(this.H * 0.58 * 0.50);
    const praise = this._combo >= 3 ? `🕵️ DETECTIVE STREAK ×${this._combo}!` : '🕵️ GOOD EAR!';
    this.damagePops.push(new DamagePop(bossX, bossY - 40, `-${damage}`, '#80D8FF'));
    this.damagePops.push(new DamagePop(bossX, bossY - 80, praise, '#fff'));
    this._gradeFloat = { text: praise, life: 1.0, color: '#40C4FF' };
    this._setFeedback(`🕵️ Correct! "${this._challenge.answer.toUpperCase()}" — ${praise} (${damage} dmg)`, '#80D8FF');

    // Reinforce: say the whole word so they hear the sound in context.
    setTimeout(() => {
      if (this._destroyed) return;
      this.audio?.playBlendSequence?.(this._challenge.baseWord.phonemes, this._challenge.baseWord.word);
    }, 220);

    this._checkBossPhase();

    setTimeout(() => {
      if (this._destroyed) return;
      if (this.bossHp <= 0) { this._win(); return; }
      this.state = 'idle';
      this._startNextWord();
      this._startBlendTimer();
    }, 1400);
  }

  // Returns C/V structure from the word's spelling — "crash" → "CCVCC".
  // Uses letters, not phoneme-slot count, so multi-letter phonemes like "cr"
  // and "sh" correctly contribute two C's each rather than one.
  _getWordStructure(word) {
    const v = new Set(['a','e','i','o','u']);
    return (word || '').toLowerCase().split('').map(ch => v.has(ch) ? 'V' : 'C').join('');
  }

  // ── Render target hint (emoji + blank slots) ─────────────────
  _renderTargetHint() {
    if (!this._currentWord) return;
    this._targetEmojiEl.textContent = this._currentWord.hint;
    if (this._structLabelEl) {
      this._structLabelEl.textContent = this._getWordStructure(this._currentWord.word);
      this._structLabelEl.style.display = '';
    }
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

    // Phase 8: live word preview — show built phonemes joined, fading to target word
    if (this._wordPreviewEl) {
      if (this._currentBuilt.length === 0) {
        this._wordPreviewEl.textContent = '';
      } else {
        const joined = this._currentBuilt.map(p => p.toUpperCase()).join(' · ');
        const full   = this._currentWord.word.toUpperCase();
        // Show "SH · I · P = SHIP" once all phonemes are placed, otherwise "SH · I ···"
        const isComplete = this._currentBuilt.length === this._currentWord.phonemes.length;
        this._wordPreviewEl.textContent = isComplete
          ? `${joined} = ${full}!`
          : `${joined} ···`;
        this._wordPreviewEl.style.color = isComplete ? '#76FF03' : '#FFD700';
      }
    }
  }

  // ── Render tiles for current word only ───────────────────────
  _renderCurrentWordTiles() {
    this._poolEl.innerHTML = '';
    this._tileEls = [];
    // Track if we've already applied the hint to one tile (avoid double-hint for repeated phonemes)
    let hintApplied = false;

    this._shuffledPh.forEach((ph, idx) => {
      const colorClass = this._getPhonemeColorClass(ph);
      const isUsed = this._usedTileIdx.has(idx);
      // Hint: highlight the tile matching the first needed phoneme on penultimate attempt
      const isHint = this._showFirstHint && !isUsed && !hintApplied &&
                     ph === this._currentWord.phonemes[this._currentBuilt.length];
      if (isHint) hintApplied = true;

      const tile   = document.createElement('button');
      tile.className        = 'be-tile ' + colorClass + (isUsed ? ' be-tile-used' : '') + (isHint ? ' be-tile-hint' : '');
      tile.textContent      = ph.toUpperCase();
      tile.dataset.phoneme  = ph;
      tile.dataset.idx      = idx;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', `Phoneme tile ${ph.toUpperCase()}${isUsed ? ', used' : ''}`);
      tile.setAttribute('aria-disabled', isUsed ? 'true' : 'false');
      tile.setAttribute('title', `${ph.toUpperCase()} — press '${ph[0].toUpperCase()}' key`);

      if (!isUsed) {
        tile.addEventListener('click', () => this._onTileClick(ph, tile, idx));
        tile.addEventListener('mouseenter', () => { this.audio?.playPhoneme(ph); });
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
    if (this.done) return;
    // Cooldown: prevent accidental double-taps only (was 300ms — too sluggish for fast blenders)
    const now = Date.now();
    if (now - (this._lastTileClickMs || 0) < 80) return;
    this._lastTileClickMs = now;

    const expected = this._currentWord.phonemes[this._currentBuilt.length];
    this.audio?.playPhoneme(phoneme);

    // Live correctness feedback per tile (green/red flash)
    if (phoneme !== expected) {
      this._onWrongTile(expected, phoneme, tileEl);
      return;
    }

    this.state = 'blending';
    this._currentBuilt.push(phoneme);
    this._builtTileIdxes.push(tileIdx);   // track for undo
    this._usedTileIdx.add(tileIdx);
    tileEl.classList.add('be-tile-used');
    this._flashTileFeedback(tileEl, 'ok');

    // Emit slash sparks + slash trail from tile's canvas-space position → boss
    if (this.canvas) {
      const cr  = this.canvas.getBoundingClientRect();
      const tr  = tileEl.getBoundingClientRect();
      const scx = this.W / cr.width;
      const scy = this.H / cr.height;
      const tx  = (tr.left + tr.width  / 2 - cr.left) * scx;
      const ty  = (tr.top  + tr.height / 2 - cr.top)  * scy;
      for (let i = 0; i < 4; i++) {
        this.slashParticles.push(new SlashParticle(tx, ty));
      }
      // Phase 7: bezier arc from tile → boss (drawn behind particles)
      const bossX = Math.round(this.W * 0.72);
      const bossY = Math.round(this.H * 0.58 * 0.50);
      this._slashTrails.push(new SlashTrail(tx, ty, bossX, bossY));
    }

    this._renderBlanks();
    this._setFeedback('✅ Nice sound! Keep blending…', '#7CFC9A');

    // Auto-submit when all phonemes are placed
    if (this._currentBuilt.length === this._currentWord.phonemes.length) {
      setTimeout(() => this._checkCurrentWord(), 220);
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

  // ── Adaptive queue: weak phonemes get served earlier ─────────────────
  _buildAdaptiveWordQueue() {
    const words = [...(this.stage.words || [])];
    const weakMap = this.progress?.getWeakPhonemes?.(this.stage.id) || {};
    const scored = words.map(w => ({ word: w, score: this._getWordWeaknessScore(w, weakMap) + Math.random() * 0.35 }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map(x => x.word);
  }

  _getWordWeaknessScore(wordObj, weakMap) {
    const bonus = (wordObj.phonemes || []).reduce((sum, ph) => sum + (weakMap[ph.toLowerCase()] || 0), 0);
    return bonus + ((wordObj.phonemes?.length || 0) >= 4 ? 0.25 : 0);
  }

  // ── Tile pronunciation helper using speech synthesis ─────────────────
  _pronounceTile(phoneme) {
    // Reuse AudioManager's UK-female voice preference when available.
    if (this.audio?.speak) {
      this.audio.speak(phoneme, 0.86, 1.12);
      return;
    }
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(phoneme);
    u.rate = 0.86;
    u.pitch = 1.12;
    u.lang = 'en-GB';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  // ── Visual tile categories (colour-coded phonics groups) ─────────────
  _getPhonemeColorClass(phoneme) {
    const ph = String(phoneme || '').toLowerCase();
    const vowels = new Set(['a','e','i','o','u']);
    if (vowels.has(ph)) return 'be-tile-vowel';
    if (/^(sh|ch|th|wh|ph|ck|ng)$/.test(ph)) return 'be-tile-digraph';
    if (ph.length >= 2) return 'be-tile-blend';
    return 'be-tile-cons';
  }

  _flashTileFeedback(tileEl, type) {
    if (!tileEl) return;
    const cls = type === 'ok' ? 'be-tile-flash-ok' : 'be-tile-flash-bad';
    tileEl.classList.remove('be-tile-flash-ok', 'be-tile-flash-bad');
    tileEl.classList.add(cls);
    setTimeout(() => tileEl.classList.remove(cls), 240);
  }

  _onWrongTile(expected, got, tileEl) {
    this._flashTileFeedback(tileEl, 'bad');
    this.audio?.sfxWrongBlend?.();
    this._setFeedback(`❌ Try '${String(expected).toUpperCase()}' first. You tapped '${String(got).toUpperCase()}'.`, '#FF8A80');
    // After brief pause, play the CORRECT phoneme so the child hears what to listen for
    setTimeout(() => {
      if (!this.done) this.audio?.playPhoneme?.(expected);
    }, 650);

    this._wrongAttempts++;
    if (this._wrongAttempts >= MAX_WRONGS) {
      this._skipWord();
      return;
    }

    // keep pressure but lighter than full-word failure
    const pokeDmg = Math.max(2, Math.floor(this.stage.bossAttack * 0.12));
    this.rikuHp = Math.max(0, this.rikuHp - pokeDmg);
    this._rikuShake = 5;
    this._currentBuilt   = [];
    this._builtTileIdxes = [];
    this._usedTileIdx    = new Set();
    const _hintThreshold = (this.stage.id <= 2) ? 1 : MAX_WRONGS - 1;
    this._showFirstHint = (this._wrongAttempts >= _hintThreshold);
    this._renderCurrentWordTiles();
    this._renderBlanks();
    if (this.rikuHp <= 0) this._lose();
  }

  // ── Incoming-damage filter: shop/companion effects can soften hits ──
  _applyIncomingDamage(baseDmg, label = 'blocked') {
    // Starter shield from companion blocks one incoming hit.
    if (this._starterShield) {
      this._starterShield = false;
      this.damagePops.push(new DamagePop(Math.round(this.W * 0.24), Math.round(this.H * 0.30), '🛡️ BLOCK!', '#80D8FF'));
      this._setFeedback('🛡️ Companion shield blocked the hit!', '#80D8FF');
      return 0;
    }
    // Companion mercy grants a few free mistakes before HP damage.
    if (this._companionMercy > 0) {
      this._companionMercy--;
      this.damagePops.push(new DamagePop(Math.round(this.W * 0.24), Math.round(this.H * 0.33), '🐾 SAVE!', '#C5E1A5'));
      this._setFeedback('🐾 Companion helped! No damage this time.', '#C5E1A5');
      return 0;
    }
    return baseDmg;
  }

  _getSwordDamageMult() {
    return this._equippedEffects.swordDamageMult || 1;
  }

  getAccuracyPercent() {
    if (this._attemptedBlends <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((this._correctBlends / this._attemptedBlends) * 100)));
  }

  // ── Wrong order: let player try again ────────────────────────
  _wrongOrder() {
    this._combo = 0;
    this._streak = 0;
    this._attemptedBlends++;
    this.state  = 'idle';

    const rawDmg  = Math.floor(this.stage.bossAttack * 0.3);
    const dmg = this._applyIncomingDamage(rawDmg, 'wrong-order');
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    this._rikuShake = 8;
    if (this.audio) this.audio.sfxWrongBlend();

    const triesLeft = MAX_WRONGS - this._wrongAttempts;
    const hintMsg = triesLeft === 1 ? ' 💡 Hint: first tile is glowing!' : '';
    this._setFeedback(`❌ Not quite! ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left${hintMsg}`, '#FF5252');

    const _fy = Math.round(this.H * 0.58);
    this.damagePops.push(new DamagePop(Math.round(this.W * 0.22), Math.round(_fy * 0.50), `-${dmg}`, '#FF5252'));

    // Hint the first correct tile; for early stages show hint from 1st wrong attempt
    const _hintAt = (this.stage.id <= 2) ? 1 : MAX_WRONGS - 1;
    this._showFirstHint = (this._wrongAttempts >= _hintAt);

    // Reset build and re-render tiles in the same shuffled order
    this._currentBuilt = [];
    this._usedTileIdx  = new Set();
    this._renderCurrentWordTiles();
    this._renderBlanks();

    if (this.rikuHp <= 0) { this._lose(); return; }
  }

  // ── Skip word after 3 failures ───────────────────────────────
  _skipWord() {
    if (this.done || this.state === 'boss-attack') return;
    this._stopBlendTimer();
    this.state = 'boss-attack';
    this._combo = 0;
    this._streak = 0;
    this._attemptedBlends++;

    const rawDmg = this.stage.bossAttack;
    const dmg = this._applyIncomingDamage(rawDmg, 'skip');
    this.rikuHp = Math.max(0, this.rikuHp - dmg);
    this._rikuShake = 14;
    this._bossShake = 6;
    if (this.audio) this.audio.sfxHurt();

    const wordUp = this._currentWord.word.toUpperCase();
    this._setFeedback(`💦 "${wordUp}" — the answer was: ${this._currentWord.phonemes.map(p=>p.toUpperCase()).join(' · ')}`, '#FF9800');

    const _fy = Math.round(this.H * 0.58);
    this.damagePops.push(new DamagePop(Math.round(this.W * 0.22), Math.round(_fy * 0.50), `🦖 -${dmg}`, '#FF5252'));

    if (this.progress) this.progress.recordBlend(this.stage.id, this._currentWord.word, false, false, this._currentWord.phonemes);

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

    // Phase-2 gimmick: the boss "steals" a tile — always a distractor,
    // never a sound the word needs, so the round stays solvable.
    if (phase === 2 && Array.isArray(this._tileEls) && this._tileEls.length) {
      const wordPh = new Set((this._currentWord?.phonemes || []).map(p => p.toLowerCase()));
      const idx = (this._shuffledPh || []).findIndex((ph, i) =>
        !wordPh.has(String(ph).toLowerCase()) && !this._usedTileIdx.has(i));
      if (idx >= 0 && this._tileEls[idx]) {
        const el = this._tileEls[idx];
        el.classList.add('be-tile-used', 'be-tile-stolen');
        el.textContent = '🔒';
        this._usedTileIdx.add(idx);
        this._tileStolen = true;
        setTimeout(() => {
          if (!this._destroyed) this._setFeedback(`😈 ${this.stage.bossName} locked one of your tiles! Beat the word to break the lock!`, '#FF9800');
        }, 1400);
      }
    }
  }

  // ── Riku special attack (combo ≥ 5) ─────────────────────────
  _rikuSpecialAttack(wordObj) {
    this._specialReady = false;
    const floorY = Math.round(this.H * 0.58);
    const bossX  = Math.round(this.W * 0.72);
    const bossY  = Math.round(floorY * 0.50);
    const specialDmg = Math.floor(wordObj.damage * 3.5 * this._getSwordDamageMult());

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

    const timeBonus = Math.max(0, this._blendTimeLeft / this._blendTime);
    const accuracyPct = this._attemptedBlends > 0 ? (this._correctBlends / this._attemptedBlends) : 1;
    // Streak multiplier grows steadily for clean chains.
    const streakMult = 1 + Math.min(this._streak, 8) * 0.12;
    // Phase damage multiplier — reward surviving to later boss phases
    const phaseMult = this._bossPhase === 3 ? 1.2 :
                      this._bossPhase === 2 ? 1.1 : 1.0;

    // Slash type derived from speed + accuracy for educational feedback.
    let slashType = 'Standard Slash';
    let slashMult = 1.0;
    if (timeBonus > 0.72 && accuracyPct >= 0.85) { slashType = '⚡ Speed Slash'; slashMult = 1.28; }
    if (timeBonus > 0.82 && accuracyPct >= 0.93) { slashType = '🌈 Precision Slash'; slashMult = 1.45; }

    const damage = Math.floor(wordObj.damage * streakMult * (0.72 + timeBonus * 0.28) * phaseMult * slashMult * this._coinBonus);

    this._combo++;
    this._streak++;
    this._attemptedBlends++;
    this._correctBlends++;
    // Phase-2 gimmick payoff: beating the word breaks the boss's lock
    if (this._tileStolen) {
      this._tileStolen = false;
      setTimeout(() => {
        if (!this._destroyed) this._setFeedback('🎉 Lock broken — you won your sound back!', '#76FF03');
      }, 1200);
    }
    this.bossHp  = Math.max(0, this.bossHp - damage);
    this.score  += Math.floor(damage * (1.8 + accuracyPct * 0.4));
    this._bossShake = 22;

    // Mark special as ready at combo 5
    if (this._combo >= 5) this._specialReady = true;

    // Combo burst rings — more milestones, escalating drama
    const comboMilestones = [3, 5, 8, 12, 20];
    if (comboMilestones.includes(this._combo)) {
      const ringColor = this._combo >= 12 ? '#FF00FF'  // legendary: magenta
                      : this._combo >= 8  ? '#FF4081'  // hot: pink
                      : this._combo >= 5  ? '#FF8C00'  // fire: orange
                      :                    '#FFD700';  // starter: gold
      const ringCount = this._combo >= 12 ? 5 : this._combo >= 8 ? 4 : this._combo >= 5 ? 3 : 2;
      const ringX = Math.round(this.W * 0.72);
      const ringY = Math.round(this.H * 0.58 * 0.50);
      for (let r = 0; r < ringCount; r++) {
        const ring = new ComboRing(ringX, ringY, ringColor);
        ring.radius = 20 + r * 22;
        this._comboRings.push(ring);
      }
    }

    if (this.progress) this.progress.recordBlend(this.stage.id, wordObj.word, true, timeBonus > 0.82, wordObj.phonemes);
    // Track unique words the child successfully blended (for end-of-stage summary)
    if (!this._learnedWords.includes(wordObj.word)) {
      this._learnedWords.push(wordObj.word);
    }
    if (this.audio)    this.audio.sfxSlash();
    if (this.audio)    this.audio.sfxBlendChime?.();
    if (this.audio)    this.audio.sfxBossHit();
    // Show the "SAY IT!" educational prompt — the key moment where child echoes the word
    this._showSayItBanner(wordObj.word);
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
                      this._combo >= 3 ? `STREAK ×${this._combo}! ⚡` :
                      timeBonus > 0.7  ? _praisePerfect[_rng] : _praiseGreat[_rng];

    this.damagePops.push(new DamagePop(bossX, bossY - 40, `-${damage}`, '#FFD700'));
    this.damagePops.push(new DamagePop(bossX, bossY - 80, `${slashType} • ${gradeText}`, '#fff'));

    // ── Grade floater: large centered text with scale+fade ────
    const gfColor = this._combo >= 5 ? '#FF4081' :
                    this._combo >= 3 ? '#FF9800' :
                    timeBonus > 0.7  ? '#76FF03' : '#FFFFFF';
    this._gradeFloat = { text: gradeText, life: 1.0, color: gfColor };
    this._setFeedback(`⚔️ "${wordObj.word.toUpperCase()}" — ${slashType} • ${gradeText} (${damage} dmg, acc ${Math.round(accuracyPct * 100)}%)`, '#FFD700');

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

  // ── Timer (performance.now()-based: no drift) ───────────────
  _startBlendTimer() {
    this._stopBlendTimer();
    this._blendTimeLeft   = this._blendTime;
    this._timerStartedAt  = performance.now();  // absolute start time
    this._timerBar.style.width = '100%';
    this._timerBar.className = 'be-timer-fill';
    this._blendTimer = setInterval(() => {
      const elapsed = (performance.now() - this._timerStartedAt) / 1000;
      this._blendTimeLeft = Math.max(0, this._blendTime - elapsed);
      const pct = this._blendTimeLeft / this._blendTime;
      this._timerBar.style.width  = (pct * 100) + '%';
      this._timerBar.className = 'be-timer-fill' +
        (pct < 0.25 ? ' be-timer-urgent' : pct < 0.5 ? ' be-timer-warn' : '');
      if (this._blendTimeLeft <= 0) {
        this._stopBlendTimer();
        this._bossAutoAttack();
      }
    }, 50); // 50ms poll for smoother bar
  }

  _stopBlendTimer() {
    if (this._blendTimer) { clearInterval(this._blendTimer); this._blendTimer = null; }
    // Record remaining time so _resumeBlendTimer can pick up exactly here
    this._timerPausedLeft = this._blendTimeLeft;
  }

  _bossAutoAttack() {
    if (this.done || this.state === 'boss-attack') return;

    // Relaxed mode: timer expiry never hurts — just encourage and restart
    if (this._relaxedMode) {
      this._setFeedback('⏰ Take your time! Try again — you can do it! 😊', '#FFD700');
      this.damagePops.push(new DamagePop(
        Math.round(this.W * 0.5), Math.round(this.H * 0.3),
        '😊 No rush!', '#FFD700',
      ));
      setTimeout(() => {
        if (this._destroyed || this.done) return;
        this._startNextWord();
        this._startBlendTimer();
      }, 1200);
      return;
    }

    this.state = 'boss-attack';
    // Phase amplifies boss attack
    const phaseMult = this._bossPhase === 3 ? 1.5 : this._bossPhase === 2 ? 1.25 : 1.0;
    this._bossShake = this._bossPhase >= 2 ? 14 : 8;
    this._combo = 0;
    this._streak = 0;

    const rawDmg = Math.floor(this.stage.bossAttack * phaseMult);
    const dmg = this._applyIncomingDamage(rawDmg, 'timeout');
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
    if (this._isChallenge) return;   // nothing to clear in a detective round
    if (this.state === 'riku-attack' || this.state === 'boss-attack') return;
    this._currentBuilt   = [];
    this._builtTileIdxes = [];
    this._usedTileIdx    = new Set();
    this._renderCurrentWordTiles();
    this._renderBlanks();
    this._setFeedback('');
    this.state = 'idle';
  }

  // ── Phase 8: explicit hint — reveal the next correct tile ───
  _useHint() {
    if (this.done) return;
    // Disable button so it can't be spammed mid-word
    if (this._hintBtn) this._hintBtn.disabled = true;
    this._showFirstHint = true;
    if (this._isChallenge && this._challenge) {
      this._renderChallengeTiles();
      this._setFeedback('💡 Hint: the right sound is glowing!', '#FFD700');
      return;
    }
    if (!this._currentWord) return;
    this._renderCurrentWordTiles();
    this._setFeedback('💡 Hint: look for the glowing tile!', '#FFD700');
  }

  // ── Undo: remove the last placed tile ───────────────────────
  _undoLastTile() {
    if (this._isChallenge) return;   // no tile placement to undo in a detective round
    if (this.state === 'riku-attack' || this.state === 'boss-attack') return;
    if (!this._currentBuilt.length) return;
    this._currentBuilt.pop();
    const lastIdx = this._builtTileIdxes.pop();
    if (lastIdx !== undefined) this._usedTileIdx.delete(lastIdx);
    this._renderCurrentWordTiles();
    this._renderBlanks();
    this._setFeedback('↩ Tile removed — try again!', '#FFD54F');
    if (this.state === 'blending') this.state = 'idle';
  }

  // ── Feedback text ────────────────────────────────────────────
  _setFeedback(msg, color = '#fff') {
    this._feedbackEl.textContent  = msg;
    this._feedbackEl.style.color  = color;
  }

  // ── "SAY IT!" banner — the key educational moment ────────────
  // After a correct blend, prompt the child to say the word aloud
  // and play a slow, clear pronunciation for them to echo.
  _showSayItBanner(word) {
    if (!this._sayItBanner) return;
    this._sayItBanner.innerHTML =
      `<span class="be-say-it-emoji">🗣️</span>` +
      `<span class="be-say-it-word">SAY IT: ${word.toUpperCase()}!</span>` +
      `<span class="be-say-it-sub">Say it out loud!</span>`;
    this._sayItBanner.style.display = 'flex';
    this._sayItBanner.classList.remove('be-say-it-pop');
    // Trigger reflow to restart animation
    void this._sayItBanner.offsetWidth;
    this._sayItBanner.classList.add('be-say-it-pop');

    // Speak the word slowly and clearly so the child can echo it
    const speakWord = (w, rate = 0.72, pitch = 1.05) => {
      if (this.audio?.speak) {
        this.audio.speak(w, rate, pitch);
      } else if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(w);
        u.rate = rate; u.pitch = pitch; u.volume = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    };
    speakWord(word);

    setTimeout(() => {
      if (this._sayItBanner) {
        this._sayItBanner.classList.remove('be-say-it-pop');
        this._sayItBanner.style.display = 'none';
      }
    }, 1500);
  }

  // ── Win / Lose ───────────────────────────────────────────────
  // Runner reward: collecting every coin grants bonus battle damage.
  applyCoinBonus() {
    this._coinBonus = 1.1;
    setTimeout(() => {
      if (!this._destroyed) {
        this._setFeedback(`🌟 You found ALL the sounds — BONUS DAMAGE!`, '#76FF03');
      }
    }, 900);
  }

  _win() {
    this._stopBlendTimer();
    this.learnedWords = [...this._learnedWords];   // expose for stage-win summary
    // Boss defeat theatre: slow-mo whoosh, boss tips over with dizzy
    // stars and falls off-screen, THEN the results card appears.
    this.state         = 'boss-defeated';
    this._defeatFrames = 130;
    this.overlay?.classList?.add('hidden');
    if (this.audio) {
      this.audio.sfxSlowMo?.();
      setTimeout(() => { if (!this._destroyed) this.audio.sfxVictory(); }, 550);
    }
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
    if (this.state === 'boss-defeated' && this._defeatFrames > 0) {
      this._defeatFrames--;
      if (this._defeatFrames <= 0) { this.done = true; this.outcome = 'victory'; }
    }
    // Boss bob speed increases with phase
    const bobSpeed = this._bossPhase === 3 ? 0.09 : this._bossPhase === 2 ? 0.06 : 0.04;
    this._bossBobOffset = Math.sin(this._age * bobSpeed) * (this._bossPhase >= 2 ? 9 : 5);

    this.slashParticles.forEach(p => p.update());
    this.slashParticles = this.slashParticles.filter(p => !p.isDead());
    this._slashTrails.forEach(t => t.update());
    this._slashTrails = this._slashTrails.filter(t => !t.isDead());
    this._comboRings.forEach(r => r.update());
    this._comboRings = this._comboRings.filter(r => !r.isDead());
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

    // Phase 7: slash trails drawn behind particles (tile → boss arcs)
    this._slashTrails.forEach(t => t.draw(ctx));
    // Phase 7: combo burst rings expand around boss at streak milestones
    this._comboRings.forEach(r => r.draw(ctx));
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
        ctx.font        = `bold ${Math.min(32, this.W * 0.065)}px "Nunito", "Comic Sans MS", system-ui`;
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
      ctx.font        = `bold ${16 + this._combo * 2}px "Nunito", "Comic Sans MS", system-ui`;
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
      ctx.font        = `bold 18px "Nunito", "Comic Sans MS", system-ui`;
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
      ctx.font      = 'bold 12px "Nunito", "Comic Sans MS", system-ui';
      ctx.fillStyle = phaseColor;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      const alpha = 0.6 + 0.4 * Math.sin(this._age * 0.18);
      ctx.globalAlpha = alpha;
      ctx.fillText(phaseLabel, Math.round(this.W * 0.72), Math.round(this.H * 0.04));
      ctx.restore();
    }

    // ── Grade floater: large centered PERFECT!/GREAT! ───────────
    if (this._gradeFloat) {
      const gf = this._gradeFloat;
      gf.life -= 0.022;
      if (gf.life <= 0) {
        this._gradeFloat = null;
      } else {
        const fadeIn  = Math.min(1, (1 - gf.life) * 8);   // snappy pop-in
        const fadeOut = gf.life < 0.35 ? gf.life / 0.35 : 1;
        const alpha   = Math.min(fadeIn, fadeOut);
        const scale   = 0.5 + 0.6 * Math.min(1, (1 - gf.life) * 5); // pop from small
        const fontSize = Math.min(64, this.W * 0.12);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.W / 2, this.H * 0.38);
        ctx.scale(scale, scale);
        ctx.font        = `900 ${fontSize}px "Nunito", "Comic Sans MS", system-ui`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur  = 20;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth   = fontSize * 0.07;
        ctx.strokeText(gf.text, 0, 0);
        ctx.fillStyle   = gf.color;
        ctx.fillText(gf.text, 0, 0);
        ctx.restore();
      }
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

  // Resume blend-timer from where it was paused (no reset)
  _resumeBlendTimer() {
    this._stopBlendTimer();
    // Re-anchor start time so remaining time counts from now
    const resumeFrom = this._timerPausedLeft ?? this._blendTimeLeft;
    this._blendTimeLeft  = resumeFrom;
    this._timerStartedAt = performance.now() - (this._blendTime - resumeFrom) * 1000;
    this._blendTimer = setInterval(() => {
      const elapsed = (performance.now() - this._timerStartedAt) / 1000;
      this._blendTimeLeft = Math.max(0, this._blendTime - elapsed);
      const pct = this._blendTimeLeft / this._blendTime;
      this._timerBar.style.width  = (pct * 100) + '%';
      this._timerBar.className = 'be-timer-fill' +
        (pct < 0.25 ? ' be-timer-urgent' : pct < 0.5 ? ' be-timer-warn' : '');
      if (this._blendTimeLeft <= 0) {
        this._stopBlendTimer();
        this._bossAutoAttack();
      }
    }, 50);
  }

  _drawPauseOverlay(ctx) {
    const cx = this.W / 2;
    // Centre in the upper canvas portion (battle overlay takes bottom half)
    const cy = Math.round(this.H * 0.28);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, this.W, this.H * 0.62);
    // Panel
    const pw = Math.min(300, this.W * 0.74);
    const ph = 186;
    const px = cx - pw / 2, py = cy - ph / 2;
    ctx.fillStyle   = 'rgba(10,10,30,0.92)';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.fill(); ctx.stroke();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(this.W * 0.068)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle    = '#FFD700';
    ctx.shadowColor  = '#FF6F00'; ctx.shadowBlur = 14;
    ctx.fillText('⏸ PAUSED', cx, py + 32);
    ctx.shadowBlur   = 0;
    // ── Resume button ────────────────────────────────────────
    const btnW = pw - 40, btnH = 44;
    const resumeY = py + 64;
    ctx.fillStyle = 'rgba(50,180,80,0.85)';
    ctx.strokeStyle = '#7CFC9A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px + 20, resumeY, btnW, btnH, 12); ctx.fill(); ctx.stroke();
    ctx.font = `bold ${Math.round(this.W * 0.042)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.fillText('▶ RESUME', cx, resumeY + btnH / 2);
    this._pauseResumeBtnRect = { x: px + 20, y: resumeY, w: btnW, h: btnH };
    // ── Quit button ──────────────────────────────────────────
    const quitY = resumeY + btnH + 12;
    ctx.fillStyle = 'rgba(180,50,20,0.75)';
    ctx.strokeStyle = '#FF7043'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px + 20, quitY, btnW, btnH, 12); ctx.fill(); ctx.stroke();
    ctx.font = `bold ${Math.round(this.W * 0.038)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD9D0';
    ctx.fillText('🗺 Quit to Map', cx, quitY + btnH / 2);
    this._pauseQuitBtnRect = { x: px + 20, y: quitY, w: btnW, h: btnH };
    ctx.restore();
  }

  _drawBackground(ctx) {
    // Prefer the world's dedicated battle arena; fall back to the stage bg
    const arenaSp = this.stage.arenaBg && this.sprites[this.stage.arenaBg];
    const stageSp = this.stage.bg && this.sprites[this.stage.bg];
    const bgSp  = (arenaSp && arenaSp.complete && arenaSp.naturalWidth > 0) ? arenaSp : stageSp;
    if (bgSp && bgSp.complete && bgSp.naturalWidth > 0) {
      // Arena paintings are large; scale + darken once into a
      // screen-sized cache so each frame is a single 1:1 blit.
      const key = (bgSp.src || '') + '@' + this.W + 'x' + this.H;
      if (!this._bgCache || this._bgCacheKey !== key) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, this.W); c.height = Math.max(1, this.H);
        const g = c.getContext('2d');
        const scale = Math.max(this.W / bgSp.naturalWidth, this.H / bgSp.naturalHeight);
        const dw = bgSp.naturalWidth * scale, dh = bgSp.naturalHeight * scale;
        g.drawImage(bgSp, (this.W - dw) / 2, (this.H - dh) / 2, dw, dh);
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.fillRect(0, 0, this.W, this.H);
        this._bgCache    = c;
        this._bgCacheKey = key;
      }
      ctx.drawImage(this._bgCache, 0, 0);
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
    const foe = this.stage.bossName || 'Boss';
    ctx.fillText(`${this.stage.name}  ⚔️  ${foe}`, this.W / 2, 26);
  }

  _floorY() { return Math.round(this.H * 0.58); }

  _drawFloor(ctx) {
    const fy = this._floorY();
    // Soft shadow above the ground line (gradient cached per floor Y)
    if (!this._floorGrad || this._floorGradY !== fy) {
      const shadow = ctx.createLinearGradient(0, fy - 18, 0, fy + 4);
      shadow.addColorStop(0, 'rgba(0,0,0,0.0)');
      shadow.addColorStop(1, 'rgba(0,0,0,0.45)');
      this._floorGrad  = shadow;
      this._floorGradY = fy;
    }
    ctx.fillStyle = this._floorGrad;
    ctx.fillRect(0, fy - 18, this.W, 22);
    // Thin grass strip only — background image shows through below
    ctx.fillStyle = this.stage.groundColor || '#2E7D32';
    ctx.fillRect(0, fy, this.W, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(0, fy, this.W, 2);
  }


  _resolveBossSpriteKey() {
    const stageSprite = this.sprites[this.stage.bossFile];
    const src = stageSprite && typeof stageSprite.src === 'string' ? stageSprite.src : '';
    const match = src.match(/\/([A-Za-z0-9_-]+)\.png(?:$|[?#])/);
    const rawBase = match ? match[1] : '';
    const species = rawBase.replace(/-(attack|hurt)$/, '');

    if (this.state === 'boss-defeated' && species && this.sprites[`${species}-hurt`]) return `${species}-hurt`;
    if (this.state === 'boss-attack' && species && this.sprites[`${species}-attack`]) return `${species}-attack`;
    if ((this.state === 'riku-attack' || this._bossShake > 0) && species && this.sprites[`${species}-hurt`]) return `${species}-hurt`;
    if (species && this.sprites[species]) return species;
    return this.stage.bossFile;
  }

  _drawBoss(ctx) {
    const fy     = this._floorY();
    const bH     = Math.round(fy * 0.90);
    const bW     = Math.round(bH * 0.85);
    const bCX    = Math.round(this.W * 0.72);
    const bFeetY = fy;
    const bCY    = bFeetY - bH / 2;

    // Phase 9: suppress shake for prefers-reduced-motion
    const shakeX = (this._bossShake > 0 && !window.REDUCED_MOTION) ? (Math.random() - 0.5) * 14 : 0;
    const shakeY = (this._bossShake > 0 && !window.REDUCED_MOTION) ? (Math.random() - 0.5) * 8  : 0;
    const bob    = this._bossBobOffset;
    const scale  = 1 + Math.min(0.25, this._bossShake * 0.012);
    const hpPct  = this.bossHp / this.bossMaxHp;
    const spKey  = this._resolveBossSpriteKey();
    const sp     = this.sprites[spKey] || this.sprites[this.stage.bossFile];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(bCX, bFeetY + 6, bW * 0.38, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Defeat theatre: white flash → tip over → drop off-screen ──
    let defeatRot = 0, defeatDy = 0, defeatAlpha = 1;
    if (this.state === 'boss-defeated') {
      const p = 1 - this._defeatFrames / 130;             // 0 → 1
      defeatRot   = Math.min(1.35, p * 2.2);              // tips over first
      defeatDy    = p > 0.45 ? Math.pow((p - 0.45) / 0.55, 2) * this.H * 0.9 : 0;
      defeatAlpha = p > 0.8 ? Math.max(0, 1 - (p - 0.8) / 0.2) : 1;
      if (p < 0.12) {                                     // initial impact flash
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - p / 0.12)})`;
        ctx.fillRect(0, 0, this.W, this.H);
      }
      // Dizzy stars orbit the falling boss
      for (let i = 0; i < 3; i++) {
        const a = p * 9 + (i / 3) * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = defeatAlpha;
        ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💫', bCX + Math.cos(a) * 60, bCY - bH * 0.35 + defeatDy + Math.sin(a) * 22);
        ctx.restore();
      }
    }

    ctx.translate(bCX + shakeX, bCY + shakeY + bob + defeatDy);
    ctx.rotate(defeatRot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = defeatAlpha;

    if (sp && sp.complete && sp.naturalWidth > 0) {
      ctx.save();
      // All battle art is normalised to face LEFT (toward the player),
      // so no mirroring is needed — right-facing sources were flipped
      // on disk (spinosaurus, pteranodon, dilophosaurus-hurt, mini-w2-hurt).
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

    // Foe taunt — speech bubble for the first few seconds of battle
    if (this._age < 300 && !this.done) {
      const TAUNTS = [
        "You'll never read MY words!",
        'My words are TOO tricky!',
        'Grrr… no blending allowed!',
        'These sounds are MINE!',
        'You can’t spell past me!',
      ];
      const taunt = TAUNTS[(this.stage.id || 1) % TAUNTS.length];
      const fade  = this._age < 30 ? this._age / 30 : this._age > 260 ? (300 - this._age) / 40 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      ctx.font = `bold ${Math.max(12, Math.floor(this.W * 0.02))}px "Nunito", "Comic Sans MS", system-ui`;
      const tw = ctx.measureText(taunt).width;
      // Sit above the boss's head, clamped on-screen (tall foes reach the
      // canvas top); shift left so it never collides with the HP bar.
      const bx = Math.min(bCX - tw / 2 - 14, this.W - tw - 40) - 60;
      const by = Math.max(46, bFeetY - bH - 66 + bob);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(bx, by, tw + 28, 34, 16); ctx.fill(); ctx.stroke();
      // Bubble tail points toward the boss
      const bubbleCX = bx + (tw + 28) / 2;
      ctx.beginPath();
      ctx.moveTo(bubbleCX + 14, by + 33); ctx.lineTo(bubbleCX + 34, by + 47); ctx.lineTo(bubbleCX + 34, by + 33);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7B1E1E';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(taunt, bubbleCX, by + 18);
      ctx.restore();
    }

    const nameY = bFeetY - bH + bob - 12;
    ctx.font        = `bold ${Math.max(13, Math.floor(this.W * 0.027))}px "Nunito", "Comic Sans MS", system-ui`;
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

    const shakeX = (this._rikuShake > 0 && !window.REDUCED_MOTION) ? (Math.random() - 0.5) * 10 : 0;
    const shakeY = (this._rikuShake > 0 && !window.REDUCED_MOTION) ? (Math.random() - 0.5) * 5  : 0;
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
      ctx.font = 'bold 11px "Nunito", "Comic Sans MS", system-ui';
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
    if (this._kbHandler) {
      document.removeEventListener('keydown', this._kbHandler);
      this._kbHandler = null;
    }
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
