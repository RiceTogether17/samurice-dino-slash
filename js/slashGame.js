'use strict';
// ============================================================
// SLASH GAME — js/slashGame.js
// Main orchestrator for Samurice Dino Slash.
// State machine: MENU → STAGE_SELECT → RUNNER → TRANSITION
//                → BATTLE → STAGE_WIN/LOSE → STAGE_SELECT
//
// Keeps Dino Dash (game.js) 100% untouched.
// Overrides launchSlashGame() from game.js.
// ============================================================

// ── Sprite manifest ──────────────────────────────────────────
// All slash-game sprites live in assets/sprites/ and assets/dinosaurs/.
// Dino Dash originals remain at assets/*.png (game.js untouched).
const SLASH_SPRITES = {
  // ── Riku animation frames ─────────────────────────────────
  'riku-idle':     'assets/sprites/riku-idle.png',
  'riku-walk-1':   'assets/sprites/riku-walk-1.png',
  'riku-walk-2':   'assets/sprites/riku-walk-2.png',
  'riku-walk-3':   'assets/sprites/riku-walk-3.png',
  'riku-walk-4':   'assets/sprites/riku-walk-4.png',
  'riku-run':      'assets/sprites/riku-run.png',       // attack/run pose
  'riku-jump':     'assets/sprites/riku-jump-1.png',    // alias
  'riku-jump-1':   'assets/sprites/riku-jump-1.png',
  'riku-hurt':     'assets/sprites/riku-hurt.png',
  'riku-victory':  'assets/sprites/riku-victory.png',
  // ── Minion dino ───────────────────────────────────────────
  'minion-dino':   'assets/sprites/dino-minion.png',
  // ── Stage bosses ──────────────────────────────────────────
  'stage-1-rex':    'assets/dinosaurs/stage-1-rex.png',
  'stage-1-tri':    'assets/dinosaurs/stage-1-tri.png',
  'stage-2-rapi':   'assets/dinosaurs/stage-2-rapi.png',
  'stage-2-stego':  'assets/dinosaurs/stage-2-stego.png',
  'stage-3-brachio':'assets/dinosaurs/brachiosaurus.png',
  'stage-3-ptera':  'assets/dinosaurs/pteranodon.png',
  'stage-4-anky':   'assets/dinosaurs/ankylosaurus.png',
  'stage-5-spino':  'assets/dinosaurs/spinosaurus.png',
  'stage-5-pachy':  'assets/dinosaurs/pachycephalosaurus.png',
  'stage-6-dilo':   'assets/dinosaurs/dilophosaurus.png',
  // ── Stage backgrounds (.jpg) ──────────────────────────────
  'stage-1-rice-paddy':       'assets/backgrounds/stage-1.jpg',
  'stage-2-bamboo':           'assets/backgrounds/stage-2.jpg',
  'stage-3-cherry-temple':    'assets/backgrounds/stage-3.jpg',
  'stage-4-ruins':            'assets/backgrounds/stage-4.jpg',
  'stage-5-mountain-terraces':'assets/backgrounds/stage-5.jpg',
  'stage-6-volcanic':         'assets/backgrounds/stage-6.jpg',
  'victory-golden-harvest':   'assets/backgrounds/victory.jpg',
};

// ─────────────────────────────────────────────────────────────
// SLASH GAME
// ─────────────────────────────────────────────────────────────
class SlashGame {
  constructor(canvasId, overlayId) {
    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas.getContext('2d');
    this.overlay = document.getElementById(overlayId);

    this._dpr = window.devicePixelRatio || 1;
    this._setupCanvas();

    // Global modules
    this.audio    = new AudioManager();
    this.progress = new ProgressTracker();
    this.sprites  = {};

    // State
    this.state     = 'menu';   // menu | stage-select | runner | transition | battle | stage-win | stage-lose | credits
    this.stageId   = 1;
    this._age      = 0;
    this._transFrames = 0;
    this._transMsg    = '';

    // Sub-engines (created/destroyed per phase)
    this.runner  = null;
    this.battle  = null;

    // Input for menus
    this._menuSel = 0;
    this._bindMenuInput();

    // Load sprites (non-blocking)
    this._loadSprites();

    // RAF loop
    this._loop = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }

  // ── Canvas ───────────────────────────────────────────────────
  _setupCanvas() {
    const dpr  = this._dpr;
    const wrap = this.canvas.parentElement;
    const resize = () => {
      const W = wrap.clientWidth  || 480;
      const H = wrap.clientHeight || 700;
      this.canvas.width  = W * dpr;
      this.canvas.height = H * dpr;
      this.canvas.style.width  = W + 'px';
      this.canvas.style.height = H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = W;
      this.H = H;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  // ── Sprite loading ───────────────────────────────────────────
  _loadSprites() {
    Object.entries(SLASH_SPRITES).forEach(([key, url]) => {
      const img = new Image();
      img.src   = url;
      this.sprites[key] = img;
    });
  }

  // ── Menu input (keyboard) ─────────────────────────────────────
  _bindMenuInput() {
    this._menuKd = (e) => {
      if (this.state === 'stage-select') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          this._menuSel = Math.min(5, this._menuSel + 1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          this._menuSel = Math.max(0, this._menuSel - 1);
        }
        if (e.key === 'Enter' || e.key === ' ') this._launchStage(this._menuSel + 1);
      }
      if (this.state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
        this.state = 'stage-select';
      }
    };
    document.addEventListener('keydown', this._menuKd);

    // Canvas click → menu interaction
    this._canvasClick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx   = (e.clientX - rect.left);
      const my   = (e.clientY - rect.top);
      this._handleCanvasClick(mx, my);
    };
    this._canvasTap = (e) => {
      if (e.touches.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const t    = e.touches[0];
      const mx   = t.clientX - rect.left;
      const my   = t.clientY - rect.top;
      this._handleCanvasClick(mx, my);
    };
    this.canvas.addEventListener('click',      this._canvasClick);
    this.canvas.addEventListener('touchstart', this._canvasTap, { passive: true });
  }

  _handleCanvasClick(mx, my) {
    if (this.state === 'menu') {
      this.state = 'stage-select';
      return;
    }
    if (this.state === 'stage-select') {
      // Hit-test stage cards
      const cards = this._stageCardRects || [];
      cards.forEach((r, i) => {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          if (this.progress.isUnlocked(i + 1)) {
            this._menuSel = i;
            this._launchStage(i + 1);
          }
        }
      });
      return;
    }
    if (this.state === 'stage-win' || this.state === 'stage-lose') {
      // Hit-test buttons
      const btns = this._resultBtnRects || [];
      btns.forEach(btn => {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          btn.action();
        }
      });
    }
  }

  // ── Stage launch ─────────────────────────────────────────────
  _launchStage(id) {
    if (!this.progress.isUnlocked(id)) return;
    this.stageId = id;
    this.overlay.classList.add('hidden');
    this.audio.preloadStage(id);
    this._startRunner();
  }

  // ── D-pad helpers ─────────────────────────────────────────────
  _showDpad() {
    const el = document.getElementById('runnerControls');
    if (el) el.classList.remove('hidden');
  }
  _hideDpad() {
    const el = document.getElementById('runnerControls');
    if (el) el.classList.add('hidden');
  }

  // ── RUNNER PHASE ─────────────────────────────────────────────
  _startRunner() {
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    if (this.battle) { this.battle.destroy(); this.battle = null; }

    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';

    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    this.runner = new RunnerEngine(this.canvas, stage, this.sprites, this.audio, this.W, this.H);

    // Wire D-pad buttons
    const dL = document.getElementById('dpadLeft');
    const dR = document.getElementById('dpadRight');
    const dJ = document.getElementById('dpadJump');
    if (dL && dR && dJ) this.runner.bindDpad(dL, dR, dJ);
    this._showDpad();

    this.state  = 'runner';
  }

  // ── TRANSITION ───────────────────────────────────────────────
  _startTransition(msg, callback, duration = 120) {
    this.state         = 'transition';
    this._transMsg     = msg;
    this._transFrames  = duration;
    this._transCallback = callback;
  }

  // ── BATTLE PHASE ─────────────────────────────────────────────
  _startBattle(collectedPhonemes) {
    if (this.runner) { this.runner.destroy(); this.runner = null; }

    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';

    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    this.battle = new BattleEngine(
      this.canvas, this.overlay, stage, collectedPhonemes,
      this.sprites, this.audio, this.progress, this.W, this.H,
    );
    this.state = 'battle';
  }

  // ── STAGE WIN ────────────────────────────────────────────────
  _onStageWin() {
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    const score = this.battle ? this.battle.score : 0;
    this.progress.completeStage(this.stageId, score);
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.audio.sfxVictory();
    this.state = 'stage-win';
    this._resultBtnRects = [];
  }

  // ── STAGE LOSE ───────────────────────────────────────────────
  _onStageLose() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.state = 'stage-lose';
    this._resultBtnRects = [];
  }

  // ── EXIT ─────────────────────────────────────────────────────
  exit() {
    if (this.runner)  { this.runner.destroy();  this.runner  = null; }
    if (this.battle)  { this.battle.destroy();  this.battle  = null; }
    this._hideDpad();
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    document.removeEventListener('keydown', this._menuKd);
    this.canvas.removeEventListener('click',      this._canvasClick);
    this.canvas.removeEventListener('touchstart', this._canvasTap);
    cancelAnimationFrame(this._rafId);
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────
  _loop() {
    this._rafId = requestAnimationFrame(this._loop);
    this._age++;

    switch (this.state) {
      case 'menu':         this._updateMenu();       break;
      case 'stage-select': this._updateStageSelect(); break;
      case 'runner':       this._updateRunner();     break;
      case 'transition':   this._updateTransition(); break;
      case 'battle':       this._updateBattle();     break;
      case 'stage-win':    this._drawStageWin();     break;
      case 'stage-lose':   this._drawStageLose();    break;
    }
  }

  // ── MENU STATE ───────────────────────────────────────────────
  _updateMenu() {
    this._drawMenu();
  }

  _drawMenu() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    ctx.clearRect(0, 0, W, H);

    // Animated background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a4a0f');
    grad.addColorStop(0.5, '#2d6a1f');
    grad.addColorStop(1, '#3d8c2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Floating rice particles
    for (let i = 0; i < 8; i++) {
      const x  = ((i * 137 + this._age * 0.5) % W);
      const y  = (H - ((this._age * 0.3 + i * 90) % H));
      ctx.globalAlpha = 0.2 + 0.1 * Math.sin(this._age * 0.05 + i);
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍚', x, y);
    }
    ctx.globalAlpha = 1;

    // Title panel
    const panW = Math.min(380, W - 40);
    const panX = (W - panW) / 2;
    const panY = H * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(panX, panY, panW, H * 0.72, 24); ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Riku sprite
    const riku = this.sprites['riku-idle'] || this.sprites['riku-run'];
    const rW   = 90; const rH = 105;
    const rX   = W / 2 - rW / 2;
    const rY   = panY + 22;
    if (riku && riku.complete && riku.naturalWidth > 0) {
      ctx.drawImage(riku, rX, rY, rW, rH);
    } else {
      // Fallback rice ball
      ctx.font = '64px serif'; ctx.textAlign = 'center';
      ctx.fillText('🍙', W / 2, rY + 70);
    }

    // Title
    ctx.font        = `bold ${Math.min(32, W * 0.07)}px "Comic Sans MS", system-ui`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = '#2d6a1f';
    ctx.lineWidth   = 5;
    ctx.strokeText('⚔️ Samurice Dino Slash', W / 2, rY + rH + 14);
    ctx.fillStyle   = '#FFD700';
    ctx.fillText('⚔️ Samurice Dino Slash', W / 2, rY + rH + 14);

    // Subtitle
    ctx.font      = `${Math.min(14, W * 0.033)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Phonics Platformer · 6 Stages · 150 Words', W / 2, rY + rH + 56);

    // Riku's flavour tagline
    ctx.font      = 'bold 15px "Comic Sans MS", system-ui';
    ctx.fillStyle = '#FFD700';
    const pulse   = 0.7 + 0.3 * Math.sin(this._age * 0.06);
    ctx.globalAlpha = pulse;
    ctx.fillText('🍚 Rice Power · Phonics Mastery! 🍚', W / 2, rY + rH + 86);
    ctx.globalAlpha = 1;

    // Progress summary
    const completed = PHONICS_DATA.stageList.filter((_, i) => this.progress.getStars(i + 1) > 0).length;
    ctx.font      = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${completed}/6 stages cleared · ${this.progress.getRicePoints()} 🍚 rice points`, W / 2, rY + rH + 112);

    // TAP TO START pulse
    const tap = 0.65 + 0.35 * Math.sin(this._age * 0.07);
    ctx.globalAlpha = tap;
    ctx.font        = `bold ${Math.min(22, W * 0.05)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#fff';
    ctx.fillText('Tap anywhere to start! ▶', W / 2, panY + H * 0.72 - 52);
    ctx.globalAlpha = 1;

    ctx.textBaseline = 'alphabetic';
  }

  // ── STAGE SELECT ─────────────────────────────────────────────
  _updateStageSelect() {
    this._drawStageSelect();
  }

  _drawStageSelect() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    ctx.clearRect(0, 0, W, H);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1b0a');
    grad.addColorStop(1, '#1a3a12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.font      = `bold ${Math.min(22, W * 0.055)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('⚔️ Choose Your Stage', W / 2, 18);

    ctx.font      = 'bold 13px system-ui';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`🍚 ${this.progress.getRicePoints()} rice points`, W / 2, 50);

    // Stage cards (2 columns × 3 rows or 1 column on narrow)
    const cols   = W > 480 ? 2 : 1;
    const rows   = Math.ceil(6 / cols);
    const margin = 14;
    const cw     = (W - margin * (cols + 1)) / cols;
    const ch     = (H - 90 - margin * (rows + 1)) / rows;
    this._stageCardRects = [];

    for (let i = 0; i < 6; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = margin + col * (cw + margin);
      const y   = 82 + margin + row * (ch + margin);

      this._stageCardRects.push({ x, y, w: cw, h: ch });

      const stageId  = i + 1;
      const stage    = PHONICS_DATA.stageList[i];
      const summary  = this.progress.getStageSummary(stageId);
      const unlocked = summary.unlocked;
      const sel      = this._menuSel === i;

      // Card background
      ctx.fillStyle = unlocked
        ? (sel ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.07)')
        : 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 14); ctx.fill();

      ctx.strokeStyle = sel ? '#FFD700' : (unlocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
      ctx.lineWidth   = sel ? 2.5 : 1;
      ctx.stroke();

      if (!unlocked) {
        // Lock icon
        ctx.font      = `${Math.min(28, cw * 0.3)}px serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('🔒', x + cw / 2, y + ch / 2 + 8);
        ctx.font      = 'bold 11px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(`Stage ${stageId} — Locked`, x + cw / 2, y + ch / 2 + 34);
        continue;
      }

      // Stage color accent strip
      ctx.fillStyle = stage.accentColor + '55';
      ctx.beginPath(); ctx.roundRect(x, y, cw, 6, [14, 14, 0, 0]); ctx.fill();

      // Stage number + name
      ctx.font      = `bold ${Math.min(15, cw * 0.12)}px "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText(`Stage ${stageId}`, x + cw / 2, y + 22);

      ctx.font      = `bold ${Math.min(13, cw * 0.1)}px "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#fff';
      ctx.fillText(stage.name, x + cw / 2, y + 40);

      // Pattern label
      ctx.font      = `${Math.min(10, cw * 0.08)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(stage.pattern, x + cw / 2, y + 56);

      // Stars
      const starY = y + ch - 28;
      const starX = x + cw / 2 - 30;
      ctx.font = '18px serif';
      for (let s = 0; s < 3; s++) {
        ctx.globalAlpha = s < summary.stars ? 1 : 0.2;
        ctx.fillText('⭐', starX + s * 22, starY);
      }
      ctx.globalAlpha = 1;

      // Mastered words count
      if (summary.mastered > 0) {
        ctx.font      = '10px system-ui';
        ctx.fillStyle = '#8BC34A';
        ctx.fillText(`${summary.mastered} words mastered`, x + cw / 2, y + ch - 8);
      }

      // Phoneme word examples
      const eg = stage.words.slice(0, 3).map(w => `${w.hint} ${w.word}`).join('  ');
      ctx.font      = `${Math.min(10, cw * 0.08)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(eg, x + cw / 2, y + 70);
    }

    // Back hint
    ctx.font      = '12px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('← Back (press Escape)', W / 2, H - 10);

    ctx.textBaseline = 'alphabetic';
  }

  // ── RUNNER UPDATE ────────────────────────────────────────────
  _updateRunner() {
    if (!this.runner) return;
    this.runner.update();
    this.runner.draw();

    if (!this.runner.done) return;

    if (this.runner.outcome === 'flag') {
      const coins = this.runner.getCollectedPhonemes();
      this.progress.recordRunnerComplete(this.stageId, this.runner.getCollectedCount());
      this._startTransition(
        `🦖 ${PHONICS_DATA.stageList[this.stageId - 1].bossName} appears!\n⚔️ Time to BLEND!`,
        () => this._startBattle(coins),
        130,
      );
    } else if (this.runner.outcome === 'death') {
      this._startTransition('💦 Riku fell! Try again!', () => this._startRunner(), 90);
    } else {
      // Timeout: still go to battle with what was collected
      const coins = this.runner.getCollectedPhonemes();
      this.progress.recordRunnerComplete(this.stageId, this.runner.getCollectedCount());
      this._startTransition(
        `⏱ Time's up! Boss battle with ${coins.length} phonemes!`,
        () => this._startBattle(coins),
        100,
      );
    }
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    this._hideDpad();
  }

  // ── TRANSITION UPDATE ────────────────────────────────────────
  _updateTransition() {
    this._transFrames--;
    this._drawTransition();
    if (this._transFrames <= 0 && this._transCallback) {
      const cb = this._transCallback;
      this._transCallback = null;
      cb();
    }
  }

  _drawTransition() {
    const ctx  = this.ctx;
    const W    = this.W; const H = this.H;
    const prog = 1 - this._transFrames / 130;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);

    // Dramatic slash line
    if (prog > 0.2 && prog < 0.8) {
      const sx = -W * 0.1 + W * 1.2 * (prog - 0.2) / 0.6;
      ctx.strokeStyle = 'rgba(255,215,0,0.6)';
      ctx.lineWidth   = 6 + Math.sin(prog * Math.PI * 4) * 3;
      ctx.beginPath();
      ctx.moveTo(sx - 60, 0); ctx.lineTo(sx + 60, H);
      ctx.stroke();
    }

    // Message
    const alpha = Math.min(1, Math.min(prog * 3, (1 - prog) * 3));
    ctx.save();
    ctx.globalAlpha = alpha;
    const lines = this._transMsg.split('\n');
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 16;
    lines.forEach((line, i) => {
      const size = i === 0 ? Math.min(28, W * 0.06) : Math.min(20, W * 0.04);
      ctx.font      = `bold ${size}px "Comic Sans MS", system-ui`;
      ctx.fillStyle = i === 0 ? '#FFD700' : '#fff';
      ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * (size + 10));
    });
    ctx.restore();
  }

  // ── BATTLE UPDATE ────────────────────────────────────────────
  _updateBattle() {
    if (!this.battle) return;
    this.battle.update();
    this.battle.draw();

    if (!this.battle.done) return;
    if (this.battle.outcome === 'victory') this._onStageWin();
    else this._onStageLose();
  }

  // ── STAGE WIN SCREEN ─────────────────────────────────────────
  _drawStageWin() {
    const ctx   = this.ctx;
    const W     = this.W; const H = this.H;
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    ctx.clearRect(0, 0, W, H);

    // Golden sky
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a4a0f');
    grad.addColorStop(0.5, '#3d8c2a');
    grad.addColorStop(1, '#8BC34A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Confetti
    for (let i = 0; i < 20; i++) {
      const x = ((i * 173 + this._age * 1.5) % W);
      const y = (this._age * 1.2 + i * 45) % H;
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.fillText(['🎉','⭐','🍚','✨','🏆'][i % 5], x, y);
    }

    // Panel
    const pw = Math.min(360, W - 40);
    const ph = 320;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font      = `bold ${Math.min(28, W * 0.062)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText('🎉 VICTORY!', W / 2, py + 20);

    ctx.font      = `bold 16px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`Stage ${this.stageId}: ${stage.name}`, W / 2, py + 66);

    // Stars earned
    const stars = this.progress.getStars(this.stageId);
    ctx.font = '36px serif';
    for (let s = 0; s < 3; s++) {
      ctx.globalAlpha = s < stars ? 1 : 0.2;
      ctx.fillText('⭐', W / 2 - 52 + s * 52, py + 98);
    }
    ctx.globalAlpha = 1;

    ctx.font      = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${this.progress.getMasteredWords(this.stageId).length} words mastered!`, W / 2, py + 152);
    ctx.fillText(`🍚 +${stars * 50 + 20} rice points`, W / 2, py + 174);

    // Buttons
    this._resultBtnRects = [
      { label: '▶ Next Stage', x: W/2 - 100, y: py + 210, w: 200, h: 40,
        action: () => {
          if (this.stageId < 6 && this.progress.isUnlocked(this.stageId + 1)) {
            this.stageId++;
            this._launchStage(this.stageId);
          } else {
            this.state = 'stage-select';
          }
        }
      },
      { label: '🗺 Stage Select', x: W/2 - 80, y: py + 264, w: 160, h: 36,
        action: () => { this.state = 'stage-select'; }
      },
    ];
    this._drawResultButtons(ctx);

    ctx.textBaseline = 'alphabetic';
  }

  // ── STAGE LOSE SCREEN ────────────────────────────────────────
  _drawStageLose() {
    const ctx   = this.ctx;
    const W     = this.W; const H = this.H;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#1a0505';
    ctx.fillRect(0, 0, W, H);

    const pw = Math.min(340, W - 40);
    const ph = 280;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font      = `bold ${Math.min(26, W * 0.058)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FF5252';
    ctx.fillText('💦 Rice Spilled…', W / 2, py + 22);

    ctx.font      = '15px "Comic Sans MS", system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText("Riku needs more practice!", W / 2, py + 72);
    ctx.fillText("Collect more phoneme coins in the runner", W / 2, py + 96);
    ctx.fillText("to get more tiles for blending!", W / 2, py + 116);

    this._resultBtnRects = [
      { label: '🔄 Try Again',  x: W/2 - 90, y: py + 158, w: 180, h: 42,
        action: () => this._launchStage(this.stageId) },
      { label: '🗺 Stage Select', x: W/2 - 70, y: py + 214, w: 140, h: 36,
        action: () => { this.state = 'stage-select'; } },
    ];
    this._drawResultButtons(ctx);
    ctx.textBaseline = 'alphabetic';
  }

  _drawResultButtons(ctx) {
    this._resultBtnRects.forEach(btn => {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(btn.x + 2, btn.y + 3, btn.w, btn.h, 10); ctx.fill();
      // Button
      ctx.fillStyle = '#ff4500';
      ctx.beginPath(); ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10); ctx.fill();
      ctx.strokeStyle = '#ff6633'; ctx.lineWidth = 1.5; ctx.stroke();
      // Label
      ctx.fillStyle   = '#fff';
      ctx.font        = `bold ${Math.min(14, btn.w * 0.08)}px "Comic Sans MS", system-ui`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.textBaseline = 'top';
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GLOBAL INIT & NAVIGATION
// ─────────────────────────────────────────────────────────────

let _slashGameInstance = null;

// Override the function defined in game.js
function launchSlashGame() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('slashScreen').classList.add('active');

  // Request landscape lock (mobile) — ignore if unsupported
  try { screen.orientation?.lock('landscape').catch(() => {}); } catch (_) {}

  if (!_slashGameInstance) {
    _slashGameInstance = new SlashGame('slashCanvas', 'battleOverlay');
  } else {
    // Show menu again if returning
    _slashGameInstance.state = 'stage-select';
    _slashGameInstance.overlay.classList.add('hidden');
  }
}

function exitSlash() {
  if (_slashGameInstance) {
    _slashGameInstance.exit();
    _slashGameInstance = null;
  }
  // Release orientation lock
  try { screen.orientation?.unlock?.(); } catch (_) {}
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('modeChooser').classList.add('active');
}

// Escape key → back to mode chooser from slash menus
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const slashActive = document.getElementById('slashScreen')?.classList.contains('active');
    if (slashActive && _slashGameInstance) {
      const s = _slashGameInstance.state;
      if (s === 'menu' || s === 'stage-select') exitSlash();
      else if (s === 'runner' || s === 'battle') _slashGameInstance.state = 'stage-select';
    }
  }
});
