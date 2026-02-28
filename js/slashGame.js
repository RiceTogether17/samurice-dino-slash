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
  'stage-1-rex':    'assets/dinosaurs/trex.png',
  'stage-1-tri':    'assets/dinosaurs/stage-1-tri.png',
  'stage-2-rapi':   'assets/dinosaurs/velociraptor.png',
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
      // Propagate new dimensions to active sub-engine
      if (this.battle) { this.battle.W = W; this.battle.H = H; }
    };
    resize();
    window.addEventListener('resize', resize);

    // Fullscreen change: browser needs two frames to finish expanding.
    // Fire resize after both frames so canvas picks up the new viewport size.
    const onFsChange = () => {
      requestAnimationFrame(() => { requestAnimationFrame(resize); });
    };
    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  // ── Sprite loading ───────────────────────────────────────────
  _loadSprites() {
    const entries = Object.entries(SLASH_SPRITES);
    let loaded = 0;
    this._spritesReady = false;
    entries.forEach(([key, url]) => {
      const img = new Image();
      const done = () => { if (++loaded >= entries.length) this._spritesReady = true; };
      img.onload  = done;
      img.onerror = done;
      img.src = url;
      this.sprites[key] = img;
    });
  }

  // ── Loading screen (shown while sprites stream in) ───────────
  _drawLoading() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    const dots = ['', '.', '..', '...'][Math.floor(this._age / 12) % 4];
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.min(32, W * 0.07)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#FFD700';
    ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 12;
    ctx.fillText(`🍚 Loading${dots}`, W / 2, H / 2 - 20);
    ctx.shadowBlur  = 0;
    ctx.font = `${Math.min(15, W * 0.034)}px system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText("Preparing Riku's moves!", W / 2, H / 2 + 22);
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

    // Block all states until sprites are ready; show loading screen instead
    if (!this._spritesReady) { this._drawLoading(); return; }

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
    const t = this._age;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'top';

    // ── Sky-to-ground gradient background ──────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    '#0a1e6e');   // deep midnight blue at top
    sky.addColorStop(0.38, '#1a6bb5');   // bright sky blue
    sky.addColorStop(0.62, '#4eb34e');   // bright grass green
    sky.addColorStop(1,    '#27622a');   // rich dark green at bottom
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ── Twinkling stars in sky half ─────────────────────────────
    const stars = [
      { x: 0.12, y: 0.06 }, { x: 0.28, y: 0.03 }, { x: 0.45, y: 0.09 },
      { x: 0.6,  y: 0.04 }, { x: 0.75, y: 0.08 }, { x: 0.88, y: 0.02 },
      { x: 0.18, y: 0.15 }, { x: 0.52, y: 0.18 }, { x: 0.82, y: 0.13 },
      { x: 0.35, y: 0.22 }, { x: 0.7,  y: 0.20 }, { x: 0.05, y: 0.24 },
    ];
    stars.forEach((s, i) => {
      const tw   = 0.6 + 0.4 * Math.sin(t * 0.07 + i * 1.4);
      const size = 2 + Math.sin(t * 0.05 + i) * 1;
      ctx.globalAlpha = tw * 0.85;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── Distant mountains / clouds ───────────────────────────────
    const cloudOffX = (t * 0.18) % W;
    const clouds = [
      { cx: 0.18, cy: 0.28, rx: 0.08, ry: 0.04 },
      { cx: 0.52, cy: 0.24, rx: 0.10, ry: 0.05 },
      { cx: 0.80, cy: 0.30, rx: 0.07, ry: 0.04 },
    ];
    clouds.forEach(c => {
      const cx = ((c.cx * W + cloudOffX) % (W + c.rx * W * 2)) - c.rx * W;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, c.cy * H, c.rx * W, c.ry * H, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - c.rx * W * 0.5, c.cy * H + c.ry * H * 0.3, c.rx * W * 0.7, c.ry * H * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + c.rx * W * 0.55, c.cy * H + c.ry * H * 0.2, c.rx * W * 0.65, c.ry * H * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Rolling green hills at horizon ──────────────────────────
    const hillY = H * 0.60;
    ctx.fillStyle = '#2e8b35';
    ctx.beginPath();
    ctx.moveTo(0, hillY);
    for (let x = 0; x <= W; x += 4) {
      const y = hillY - Math.sin((x / W) * Math.PI * 3 + t * 0.01) * H * 0.07
                       - Math.sin((x / W) * Math.PI * 5 - t * 0.008) * H * 0.04;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    // ── Ground strip with rice paddy lines ──────────────────────
    const groundY = H * 0.72;
    const groundG = ctx.createLinearGradient(0, groundY, 0, H);
    groundG.addColorStop(0, '#388e3c');
    groundG.addColorStop(1, '#1b5e20');
    ctx.fillStyle = groundG;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(0,100,0,0.3)';
    ctx.lineWidth = 2;
    for (let x = -(t * 0.6 % 40); x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, H); ctx.stroke();
    }

    // ── Floating rice emojis (background depth layer) ───────────
    for (let i = 0; i < 10; i++) {
      const xf = ((i * 173 + t * 0.4) % (W + 40)) - 20;
      const yf = ((t * 0.25 + i * 80) % H);
      ctx.globalAlpha = 0.12 + 0.07 * Math.sin(t * 0.04 + i);
      ctx.font = `${14 + i % 8}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🍚', xf, yf);
    }
    ctx.globalAlpha = 1;

    // ── Central hero card (semi-transparent, frosted glass look) ─
    const cardW = Math.min(360, W - 32);
    const cardX = (W - cardW) / 2;
    const cardY = H * 0.08;
    const cardH = H * 0.78;

    // Dark gradient card
    const cardG = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardG.addColorStop(0, 'rgba(5,15,5,0.82)');
    cardG.addColorStop(1, 'rgba(10,40,10,0.88)');
    ctx.fillStyle = cardG;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 28); ctx.fill();

    // Gold border with glow
    const borderPulse = 0.7 + 0.3 * Math.sin(t * 0.04);
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 18 * borderPulse;
    ctx.strokeStyle = `rgba(255,215,0,${borderPulse})`;
    ctx.lineWidth   = 3;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 28); ctx.stroke();
    ctx.shadowBlur  = 0;

    // ── Riku sprite — centered, natural aspect ratio ─────────────
    const riku     = this.sprites['riku-idle'] || this.sprites['riku-run'];
    const rikuH    = Math.round(cardH * 0.28);
    const rikuY    = cardY + 16;
    const bounce   = Math.sin(t * 0.06) * 5;
    ctx.textAlign  = 'center';
    if (riku && riku.complete && riku.naturalWidth > 0) {
      const ratio = riku.naturalWidth / riku.naturalHeight;
      const rikuW = Math.round(rikuH * ratio);
      ctx.drawImage(riku, W / 2 - rikuW / 2, rikuY + bounce, rikuW, rikuH);
    } else {
      ctx.font = `${rikuH}px serif`;
      ctx.fillText('🍙', W / 2, rikuY + rikuH * 0.8 + bounce);
    }

    // ── Game title — big, bold, gold with outline ────────────────
    const titleY  = rikuY + rikuH + 18 + bounce * 0.3;
    const titleSz = Math.round(Math.min(36, W * 0.08));
    ctx.font        = `900 ${titleSz}px "Comic Sans MS", system-ui`;
    ctx.textAlign   = 'center';

    // Title shadow/outline for readability
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 12;
    ctx.strokeStyle = '#5d2d00';
    ctx.lineWidth   = 7;
    ctx.strokeText('⚔️ Samurice', W / 2, titleY);
    ctx.strokeText('Dino Slash! 🦕', W / 2, titleY + titleSz + 6);

    const titleGrad = ctx.createLinearGradient(0, titleY, 0, titleY + titleSz * 2);
    titleGrad.addColorStop(0, '#FFF176');
    titleGrad.addColorStop(0.5, '#FFD700');
    titleGrad.addColorStop(1, '#FF8F00');
    ctx.fillStyle = titleGrad;
    ctx.fillText('⚔️ Samurice', W / 2, titleY);
    ctx.fillText('Dino Slash! 🦕', W / 2, titleY + titleSz + 6);
    ctx.shadowBlur  = 0;

    // ── Subtitle ─────────────────────────────────────────────────
    const subY = titleY + titleSz * 2 + 22;
    ctx.font      = `bold ${Math.round(Math.min(13, W * 0.031))}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = 'rgba(200,240,200,0.82)';
    ctx.fillText('Phonics Adventure · 6 Stages · Short Vowels → Blends', W / 2, subY);

    // ── Animated dino emojis left/right of card ──────────────────
    const dinoY  = subY + 22;
    const dinoA  = Math.sin(t * 0.05) * 0.15;
    ctx.save();
    ctx.translate(cardX + 22, dinoY + 14);
    ctx.rotate(-dinoA);
    ctx.font = '28px serif'; ctx.textAlign = 'center';
    ctx.fillText('🦖', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(cardX + cardW - 22, dinoY + 14);
    ctx.rotate(dinoA);
    ctx.font = '28px serif'; ctx.textAlign = 'center';
    ctx.fillText('🦕', 0, 0);
    ctx.restore();

    // ── Rice power tagline ───────────────────────────────────────
    const tagY   = dinoY + 36;
    const tagPul = 0.75 + 0.25 * Math.sin(t * 0.06);
    ctx.globalAlpha = tagPul;
    ctx.font      = `bold ${Math.round(Math.min(15, W * 0.036))}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 8;
    ctx.fillText('🍚 Rice Power · Phonics Mastery! 🍚', W / 2, tagY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ── Progress row ─────────────────────────────────────────────
    const completed = PHONICS_DATA.stageList.filter((_, i) => this.progress.getStars(i + 1) > 0).length;
    ctx.font      = `${Math.round(Math.min(12, W * 0.028))}px system-ui`;
    ctx.fillStyle = 'rgba(180,255,180,0.7)';
    ctx.fillText(`${completed}/6 stages cleared · ${this.progress.getRicePoints()} 🍚 rice points`, W / 2, tagY + 28);

    // ── TAP TO PLAY button ───────────────────────────────────────
    const btnW    = Math.min(cardW - 40, 260);
    const btnH    = Math.round(H * 0.075);
    const btnX    = W / 2 - btnW / 2;
    const btnY    = cardY + cardH - btnH - 20;
    const tapPul  = 0.72 + 0.28 * Math.sin(t * 0.08);

    // Button glow
    ctx.shadowColor = '#00FF88';
    ctx.shadowBlur  = 16 * tapPul;
    const btnG = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnG.addColorStop(0, `rgba(0,220,100,${0.8 + 0.2 * tapPul})`);
    btnG.addColorStop(1, `rgba(0,150,60,${0.85 + 0.15 * tapPul})`);
    ctx.fillStyle = btnG;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, btnH / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Button text
    const tapSz = Math.round(Math.min(20, W * 0.046));
    ctx.font        = `900 ${tapSz}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#fff';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶ TAP TO PLAY!', W / 2, btnY + btnH / 2);
    ctx.textBaseline = 'top';

    // ── Corner sparkles around the card ─────────────────────────
    const sparkles = [
      { x: cardX - 2,       y: cardY - 2 },
      { x: cardX + cardW + 2, y: cardY - 2 },
      { x: cardX - 2,       y: cardY + cardH + 2 },
      { x: cardX + cardW + 2, y: cardY + cardH + 2 },
    ];
    sparkles.forEach((sp, i) => {
      const sa = 0.5 + 0.5 * Math.sin(t * 0.1 + i * 1.57);
      ctx.globalAlpha = sa;
      ctx.font = '16px serif'; ctx.textAlign = 'center';
      ctx.fillText('✨', sp.x, sp.y);
    });
    ctx.globalAlpha = 1;
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
