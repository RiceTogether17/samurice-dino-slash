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
  'stage-1-tri':    'assets/dinosaurs/triceratops.png',
  'stage-2-rapi':   'assets/dinosaurs/velociraptor.png',
  'stage-2-stego':  'assets/dinosaurs/stegosaurus.png',
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
    this.state     = 'title';  // title | mode-select | menu | stage-select | world-map | runner | transition | battle | stage-win | stage-lose | endless-runner | endless-battle | endless-gameover | shop | daily | achievements | leaderboard
    this.stageId   = 1;
    this._age      = 0;
    this._transFrames = 0;
    this._transMsg    = '';

    // World map animation
    this._mapPlayerPos = null;   // { x, y } animated player dot on map
    this._mapAnim      = 0;      // age for map animations

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
      if (this.state === 'stage-select' || this.state === 'world-map') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          this._menuSel = Math.min(5, this._menuSel + 1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          this._menuSel = Math.max(0, this._menuSel - 1);
        }
        if (e.key === 'Enter' || e.key === ' ') this._launchStage(this._menuSel + 1);
        if (e.key === 'm' || e.key === 'M') {
          // Toggle between map and list view
          this.state = this.state === 'world-map' ? 'stage-select' : 'world-map';
        }
      }
      if (this.state === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        this.state = 'mode-select';
      }
      if (this.state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
        this.state = 'world-map';
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
    // Title screen: any click advances
    if (this.state === 'title') {
      this.state = 'mode-select'; return;
    }
    // Mode select: handled by _clickModeSelect
    if (this.state === 'mode-select') {
      this._clickModeSelect(mx, my); return;
    }
    // Endless game over
    if (this.state === 'endless-gameover') {
      this._clickEndlessGameover(mx, my); return;
    }
    // Shop
    if (this.state === 'shop') {
      this._clickShop(mx, my); return;
    }
    // Daily
    if (this.state === 'daily') {
      this._clickDaily(mx, my); return;
    }
    // Achievements
    if (this.state === 'achievements') {
      this._clickAchievements(mx, my); return;
    }
    // Leaderboard
    if (this.state === 'leaderboard') {
      this.state = 'mode-select'; return;
    }
    if (this.state === 'menu') {
      this.state = 'world-map';
      return;
    }
    if (this.state === 'stage-select') {
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
    if (this.state === 'world-map') {
      const nodes = this._mapNodeRects || [];
      nodes.forEach((n, i) => {
        const dx = mx - n.cx;
        const dy = my - n.cy;
        if (dx * dx + dy * dy <= n.r * n.r) {
          if (this.progress.isUnlocked(i + 1)) {
            this._menuSel = i;
            this._launchStage(i + 1);
          }
        }
      });
      return;
    }
    if (this.state === 'stage-win' || this.state === 'stage-lose') {
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

    // Start stage music
    this.audio.startMusic(this.stageId);

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
    this.audio.stopMusic();

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
    const battleScore = this.battle ? this.battle.score : 0;
    const runnerScore = this._lastRunnerScore || 0;
    const score = battleScore + runnerScore;
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
    this.audio.stopMusic();
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

    // Tick achievement popup
    this._tickAchievementPopup();

    switch (this.state) {
      case 'title':            this._updateTitle();          break;
      case 'mode-select':      this._updateModeSelect();     break;
      case 'menu':             this._updateMenu();            break;
      case 'stage-select':     this._updateStageSelect();    break;
      case 'world-map':        this._updateWorldMap();       break;
      case 'runner':           this._updateRunner();         break;
      case 'transition':       this._updateTransition();     break;
      case 'battle':           this._updateBattle();         break;
      case 'stage-win':        this._drawStageWin();         break;
      case 'stage-lose':       this._drawStageLose();        break;
      case 'endless-runner':   this._updateEndlessRunner();  break;
      case 'endless-battle':   this._updateEndlessBattle();  break;
      case 'endless-gameover': this._drawEndlessGameover();  break;
      case 'shop':             this._updateShop();           break;
      case 'daily':            this._updateDaily();          break;
      case 'achievements':     this._updateAchievements();   break;
      case 'leaderboard':      this._updateLeaderboard();    break;
    }

    // Achievement popup on top of everything
    this._drawAchievementPopup();
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

  // ── WORLD MAP ────────────────────────────────────────────────
  _updateWorldMap() {
    this._mapAnim++;
    this._drawWorldMap();
  }

  _drawWorldMap() {
    const ctx = this.ctx;
    const W   = this.W;
    const H   = this.H;
    const t   = this._mapAnim;
    ctx.clearRect(0, 0, W, H);

    // ── Scenic world map background ──────────────────────────────
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    sky.addColorStop(0,   '#0a1e6e');
    sky.addColorStop(0.5, '#1a6bb5');
    sky.addColorStop(1,   '#4eb34e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Ground area
    const gnd = ctx.createLinearGradient(0, H * 0.60, 0, H);
    gnd.addColorStop(0, '#3d8c2a');
    gnd.addColorStop(1, '#1b5e20');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, H * 0.60, W, H * 0.40);

    // Animated clouds
    [{ cx: 0.15, cy: 0.12, r: 0.07 }, { cx: 0.50, cy: 0.08, r: 0.09 },
     { cx: 0.80, cy: 0.14, r: 0.06 }].forEach((c, i) => {
      const ox = ((t * 0.18 + i * 200) % (W + 120)) - 60;
      const cx = (c.cx * W + ox) % (W + 80) - 40;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.ellipse(cx, c.cy * H, c.r * W, c.r * H * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - c.r * W * 0.45, c.cy * H + c.r * H * 0.18, c.r * W * 0.68, c.r * H * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + c.r * W * 0.48, c.cy * H + c.r * H * 0.15, c.r * W * 0.62, c.r * H * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    });

    // ── Title ────────────────────────────────────────────────────
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.font        = `bold ${Math.min(22, W * 0.052)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#FFD700';
    ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 10;
    ctx.fillText('🗺 World Map', W / 2, 10);
    ctx.shadowBlur  = 0;

    // Rice points display
    ctx.font      = `bold 13px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFF176';
    ctx.fillText(`🍚 ${this.progress.getRicePoints()} Rice Points`, W / 2, 38);

    // Map/List view toggle hint
    ctx.font      = '11px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Press M for list view', W / 2, H - 14);

    // ── Compute stage node positions in a winding path ───────────
    // Arrange 6 nodes in a winding S-curve across the map
    const margin = 58;
    const mapTop = 68;
    const mapBot = H - 40;
    const mapH   = mapBot - mapTop;
    // S-curve path: zig-zag across canvas
    const nodes = [
      { fx: 0.15, fy: 0.18 },  // Stage 1 — bottom-left
      { fx: 0.50, fy: 0.30 },  // Stage 2 — center
      { fx: 0.82, fy: 0.20 },  // Stage 3 — right
      { fx: 0.65, fy: 0.52 },  // Stage 4 — center-right
      { fx: 0.30, fy: 0.65 },  // Stage 5 — center-left
      { fx: 0.72, fy: 0.80 },  // Stage 6 — right (final boss)
    ].map(n => ({
      cx: margin + n.fx * (W - margin * 2),
      cy: mapTop + n.fy * mapH,
    }));

    const nodeR = Math.max(28, Math.min(36, W * 0.065));
    this._mapNodeRects = nodes.map(n => ({ cx: n.cx, cy: n.cy, r: nodeR + 6 }));

    // ── Draw connecting path ─────────────────────────────────────
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const unlocked = this.progress.isUnlocked(i + 2); // next node unlocked?

      // Outer path (wide, dark)
      ctx.strokeStyle = unlocked ? 'rgba(255,215,0,0.35)' : 'rgba(80,80,80,0.4)';
      ctx.lineWidth   = 14;
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();

      // Inner path (bright)
      ctx.strokeStyle = unlocked ? '#FFD700' : '#555';
      ctx.lineWidth   = 6;
      ctx.setLineDash(unlocked ? [] : [10, 8]);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      ctx.setLineDash([]);

      // Animated dots travelling along unlocked paths
      if (unlocked) {
        const prog  = ((t * 0.012) % 1);
        const dotX  = a.cx + (b.cx - a.cx) * prog;
        const dotY  = a.cy + (b.cy - a.cy) * prog;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(dotX, dotY, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // ── Draw stage nodes ─────────────────────────────────────────
    PHONICS_DATA.stageList.forEach((stage, i) => {
      const n = nodes[i];
      if (!n) return;
      const stageId  = i + 1;
      const summary  = this.progress.getStageSummary(stageId);
      const unlocked = summary.unlocked;
      const sel      = this._menuSel === i;
      const stars    = summary.stars || 0;
      const bounce   = sel ? Math.sin(t * 0.12) * 5 : 0;
      const cy       = n.cy + bounce;

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(n.cx, cy + nodeR + 4, nodeR * 0.7, 6, 0, 0, Math.PI * 2); ctx.fill();

      // Node circle — glow for selected
      if (sel) {
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur  = 22;
      }
      // Ring
      ctx.strokeStyle = sel ? '#FFD700' : (unlocked ? 'rgba(255,255,255,0.7)' : 'rgba(80,80,80,0.6)');
      ctx.lineWidth   = sel ? 4 : 2.5;
      ctx.fillStyle   = unlocked
        ? (sel ? `rgba(255,215,0,0.25)` : 'rgba(255,255,255,0.15)')
        : 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(n.cx, cy, nodeR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      if (!unlocked) {
        ctx.font      = `${Math.round(nodeR * 0.7)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('🔒', n.cx, cy);
      } else {
        // Stage number
        ctx.font        = `bold ${Math.round(nodeR * 0.52)}px "Comic Sans MS", system-ui`;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle   = sel ? '#FFD700' : '#fff';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(`${stageId}`, n.cx, cy - nodeR * 0.18);

        // Stage emoji icon
        const icons = ['🌾','🎋','🌸','🏚️','⛰️','🌋'];
        ctx.font      = `${Math.round(nodeR * 0.4)}px serif`;
        ctx.fillText(icons[i] || '🗺️', n.cx, cy + nodeR * 0.28);
        ctx.shadowBlur = 0;

        // Stars below node
        const starSize = Math.max(10, Math.round(nodeR * 0.35));
        ctx.font = `${starSize}px serif`;
        for (let s = 0; s < 3; s++) {
          ctx.globalAlpha = s < stars ? 1 : 0.2;
          ctx.fillText('⭐', n.cx - starSize * 1.1 + s * starSize * 1.12, cy + nodeR + 14);
        }
        ctx.globalAlpha = 1;
      }

      // Stage name label below
      ctx.font      = `bold ${Math.max(9, Math.round(W * 0.022))}px "Comic Sans MS", system-ui`;
      ctx.fillStyle = unlocked ? '#fff' : 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      const labelY = cy + nodeR + (stars > 0 ? 28 : 18);
      ctx.fillText(stage.name, n.cx, labelY);
      ctx.shadowBlur = 0;
    });

    // ── Animated Riku dot on the map (shows current stage) ───────
    if (this.stageId <= 6) {
      const curNode = nodes[this.stageId - 1];
      if (curNode) {
        const bob  = Math.sin(t * 0.1) * 4;
        const rikuSp = this.sprites['riku-idle'] || this.sprites['riku-run'];
        const rH = nodeR * 1.1;
        if (rikuSp && rikuSp.complete && rikuSp.naturalWidth > 0) {
          const ar = rikuSp.naturalWidth / rikuSp.naturalHeight;
          const rW = rH * ar;
          ctx.save();
          ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
          ctx.drawImage(rikuSp, curNode.cx - rW / 2, curNode.cy - nodeR * 1.8 + bob, rW, rH);
          ctx.restore();
        } else {
          ctx.font = `${Math.round(nodeR * 0.8)}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🍙', curNode.cx, curNode.cy - nodeR * 1.4 + bob);
        }
      }
    }

    // ── Selected stage info panel (bottom) ──────────────────────
    const selStage = PHONICS_DATA.stageList[this._menuSel];
    if (selStage && this.progress.isUnlocked(this._menuSel + 1)) {
      const panW = Math.min(W - 24, 380);
      const panH = 56;
      const panX = (W - panW) / 2;
      const panY = H - panH - 22;

      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, 14); ctx.fill();
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.stroke();

      ctx.font      = `bold ${Math.min(14, W * 0.032)}px "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${selStage.name} — ${selStage.pattern}`, W / 2, panY + 8);

      ctx.font      = `${Math.min(11, W * 0.025)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`Boss: ${selStage.bossName}  ·  Tap node or press Enter to play`, W / 2, panY + 32);
    }

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
      this._lastRunnerScore = this.runner.score || 0;
      this.progress.recordRunnerComplete(this.stageId, this.runner.getCollectedCount());
      const scoreMsg = this._lastRunnerScore > 0 ? `\n⭐ Runner Score: ${this._lastRunnerScore.toLocaleString()}` : '';
      this._startTransition(
        `🦖 ${PHONICS_DATA.stageList[this.stageId - 1].bossName} appears!\n⚔️ Time to BLEND!${scoreMsg}`,
        () => this._startBattle(coins),
        130,
      );
    } else if (this.runner.outcome === 'death') {
      this._startTransition('💦 Riku fell! Try again!', () => this._startRunner(), 90);
    } else {
      // Timeout: still go to battle with what was collected
      const coins = this.runner.getCollectedPhonemes();
      this._lastRunnerScore = this.runner.score || 0;
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
            this.state = 'world-map';
          }
        }
      },
      { label: '🗺 World Map', x: W/2 - 80, y: py + 264, w: 160, h: 36,
        action: () => { this.state = 'world-map'; }
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
      { label: '🗺 World Map', x: W/2 - 70, y: py + 214, w: 140, h: 36,
        action: () => { this.state = 'world-map'; } },
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

  // ══════════════════════════════════════════════════════════════
  // NEW STATE METHODS — Title, Mode Select, Endless, Shop, Daily,
  //                     Achievements, Leaderboard, Achievement Popups
  // ══════════════════════════════════════════════════════════════

  // ── TITLE SCREEN ─────────────────────────────────────────────
  _updateTitle() { this._drawTitle(); }
  _drawTitle() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this._age;
    ctx.clearRect(0, 0, W, H);

    // Animated gradient background
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `hsl(${220 + Math.sin(t*0.01)*15},70%,${15 + Math.sin(t*0.008)*5}%)`);
    sky.addColorStop(0.6, `hsl(${200 + Math.sin(t*0.012)*10},60%,${35 + Math.sin(t*0.01)*5}%)`);
    sky.addColorStop(1, `hsl(${130 + Math.sin(t*0.015)*10},50%,${20 + Math.sin(t*0.009)*3}%)`);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 20; i++) {
      const sx = ((i * 137 + t * 0.05) % 1) * W;
      const sy = ((i * 89  + 0.1) % 0.5) * H;
      const sa = 0.5 + 0.5 * Math.sin(t * 0.08 + i * 1.3);
      ctx.globalAlpha = sa * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ground strip
    ctx.fillStyle = '#2a5a18';
    ctx.fillRect(0, H * 0.78, W, H * 0.22);
    ctx.fillStyle = '#3d7a2a';
    ctx.fillRect(0, H * 0.78, W, 8);

    // Animated dinos running in background
    const dinoEmojis = ['🦖','🦕','🦴'];
    for (let d = 0; d < 3; d++) {
      const dx = ((t * (1.2 + d*0.4) + d * W/3) % (W + 80)) - 80;
      ctx.font = `${H*0.06}px serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(dinoEmojis[d % dinoEmojis.length], dx, H * 0.83);
    }

    // ── Title logo ────────────────────────────────────────────
    const titleY = H * 0.12;
    const titleSize = Math.min(W * 0.09, 42);

    // Shimmer effect
    ctx.save();
    const shimmer = ctx.createLinearGradient(0, titleY, W, titleY + 80);
    shimmer.addColorStop(0,   '#FFD700');
    shimmer.addColorStop(0.4, '#FFF8DC');
    shimmer.addColorStop(((t * 0.015) % 1), '#ffffff');
    shimmer.addColorStop(Math.min(1, ((t * 0.015) % 1) + 0.15), '#FFD700');
    shimmer.addColorStop(1,   '#FF8C00');

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const bounce = Math.sin(t * 0.04) * 4;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;

    // ⚔️ SAMURICE
    ctx.font = `bold ${titleSize * 1.15}px Arial Black, 'Comic Sans MS', sans-serif`;
    ctx.fillStyle = shimmer;
    ctx.strokeStyle = '#7f3000'; ctx.lineWidth = Math.max(3, titleSize * 0.15);
    ctx.strokeText('⚔️ SAMURICE', W/2, titleY + bounce);
    ctx.fillText('⚔️ SAMURICE', W/2, titleY + bounce);

    // DINO SLASH
    ctx.font = `bold ${titleSize}px Arial Black, 'Comic Sans MS', sans-serif`;
    ctx.fillStyle = '#FF6B35';
    ctx.strokeStyle = '#7f1500';
    ctx.strokeText('DINO SLASH 🦖', W/2, titleY + titleSize * 1.4 + bounce);
    ctx.fillText('DINO SLASH 🦖', W/2, titleY + titleSize * 1.4 + bounce);
    ctx.restore();

    // Subtitle: Phonics Power!
    ctx.textAlign = 'center'; ctx.font = `bold ${Math.min(16, W*0.038)}px Arial, sans-serif`;
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText('PHONICS POWER · SLASH DINOS · SAVE THE RICE PADDY', W/2, titleY + titleSize * 2.6 + bounce);

    // ── Riku character (procedural) ─────────────────────────────
    const rikuX = W * 0.5, rikuY = H * 0.47;
    const rikuBounce = Math.sin(t * 0.06) * 6;
    const rikuSize  = Math.min(W * 0.25, 110);
    this._drawRikuIdle(ctx, rikuX, rikuY + rikuBounce, rikuSize, t);

    // ── "TAP TO PLAY" blinking prompt ─────────────────────────
    const blinkAlpha = 0.5 + 0.5 * Math.sin(t * 0.08);
    ctx.globalAlpha = blinkAlpha;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.min(20, W*0.05)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.strokeText('TAP TO PLAY!', W/2, H * 0.73);
    ctx.fillText('TAP TO PLAY!', W/2, H * 0.73);
    ctx.globalAlpha = 1;

    // ── Rice grains / login streak info bottom ────────────────
    const g = this.progress.getRiceGrains();
    const streak = this.progress.getLoginStreak();
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = `bold ${Math.min(15,W*0.036)}px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`🌾 ${g}`, 12, H - 10);
    if (streak > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FF8C00';
      ctx.fillText(`🔥 ${streak} day streak!`, W - 12, H - 10);
    }

    // ── New achievement badge ──────────────────────────────────
    const newAch = this.progress.getNewAchievements();
    if (newAch.length > 0) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#FF4444';
      ctx.beginPath(); ctx.arc(W - 20, 20, 10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial, sans-serif';
      ctx.fillText(newAch.length, W - 20, 14);
    }

    // Login reward prompt
    if (this.progress.canClaimLoginReward() && !this._loginRewardShown) {
      this._loginRewardShown = true;
      const reward = this.progress.claimLoginReward();
      this._queueAchievementPopup({ emoji:'🎁', name:`Day ${streak} Reward!`, desc:`+${reward} Rice Grains!` });
    }
  }

  _drawRikuIdle(ctx, cx, cy, size, t) {
    const W = size * 0.7, H = size;
    ctx.save();
    ctx.translate(cx - W/2, cy - H/2);
    // Body
    ctx.fillStyle = '#F5F5DC';
    ctx.beginPath(); ctx.ellipse(W/2, H*0.55, W*0.42, H*0.38, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.stroke();
    // Helmet
    ctx.fillStyle = '#CC0000';
    ctx.beginPath(); ctx.ellipse(W/2, H*0.22, W*0.36, H*0.18, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#AA0000'; ctx.fillRect(W*0.14, H*0.27, W*0.72, H*0.07);
    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(W*0.38, H*0.48, W*0.055, H*0.055, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W*0.62, H*0.48, W*0.055, H*0.055, 0, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(W/2, H*0.54, W*0.12, 0.1, Math.PI - 0.1); ctx.stroke();
    // Sword (swinging)
    const swingA = Math.sin(t * 0.08) * 0.4;
    ctx.save(); ctx.translate(W*0.85, H*0.55); ctx.rotate(swingA);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -H*0.55); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.fillRect(-W*0.12, -H*0.06, W*0.24, H*0.06);
    ctx.restore();
    // Sparkle effects
    const sparkA = (t * 0.1) % (Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const sa = sparkA + i * Math.PI * 2 / 3;
      const sr = W * 0.55;
      const salpha = 0.4 + 0.3 * Math.sin(t * 0.15 + i);
      ctx.globalAlpha = salpha;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(W/2 + Math.cos(sa) * sr, H*0.55 + Math.sin(sa) * sr * 0.6, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── MODE SELECT SCREEN ───────────────────────────────────────
  _updateModeSelect() { this._drawModeSelect(); }
  _drawModeSelect() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this._age;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a1e3e'); bg.addColorStop(1, '#1a3a1a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Header
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.min(28, W*0.065)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText('CHOOSE YOUR ADVENTURE', W/2, 20);
    ctx.fillText('CHOOSE YOUR ADVENTURE', W/2, 20);

    // Currency display
    ctx.textAlign = 'right'; ctx.font = `bold 16px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.fillText(`🌾 ${this.progress.getRiceGrains()}`, W - 12, 22);

    // Mode buttons
    const modes = [
      { label:'🏃 ENDLESS RUN', sub:'How far can you go?', col:'#FF6B35', action:'endless', hot:true },
      { label:'🗺️ CAMPAIGN',    sub:'6 stages to conquer', col:'#4ECDC4', action:'campaign' },
      { label:'📅 DAILY',       sub:this.progress.getDailyCompleted() ? '✅ Done today!' : 'Fresh challenge!', col:'#FFD700', action:'daily' },
      { label:'🏪 SHOP',        sub:'Spend your rice grains', col:'#FF80FF', action:'shop' },
      { label:'🏆 LEADERBOARD', sub:'Challenge the world', col:'#FF8C00', action:'leaderboard' },
      { label:'🥇 ACHIEVEMENTS', sub:`${this.progress.data.achievements.length}/${ACHIEVEMENTS.length} unlocked`, col:'#00CCFF', action:'achievements' },
    ];

    const btnH = Math.min(62, (H - 120) / (modes.length + 0.5));
    const btnW = Math.min(W - 40, 400);
    const startX = (W - btnW) / 2;
    let startY = 70;

    this._modeSelectRects = [];
    for (const m of modes) {
      const isHot = m.hot && !this.progress.getDailyCompleted();
      // Button background
      const grad = ctx.createLinearGradient(startX, startY, startX + btnW, startY + btnH);
      grad.addColorStop(0, m.col + 'aa');
      grad.addColorStop(1, m.col + '44');
      ctx.fillStyle = grad;
      ctx.strokeStyle = m.col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const r = 12;
      ctx.roundRect(startX, startY, btnW, btnH, r);
      ctx.fill(); ctx.stroke();

      // Pulse on hot item
      if (isHot) {
        ctx.strokeStyle = m.col;
        ctx.lineWidth = 2 + Math.sin(t * 0.1) * 1.5;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.1);
        ctx.beginPath(); ctx.roundRect(startX - 3, startY - 3, btnW + 6, btnH + 6, r + 3); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Label
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(18, W*0.044)}px Arial Black, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
      ctx.strokeText(m.label, startX + 16, startY + btnH * 0.38);
      ctx.fillText(m.label, startX + 16, startY + btnH * 0.38);

      ctx.font = `${Math.min(13, W*0.032)}px Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(m.sub, startX + 16, startY + btnH * 0.7);

      // Chevron
      ctx.textAlign = 'right'; ctx.font = `bold 18px Arial, sans-serif`;
      ctx.fillStyle = m.col; ctx.fillText('▶', startX + btnW - 14, startY + btnH * 0.5);

      this._modeSelectRects.push({ x:startX, y:startY, w:btnW, h:btnH, action:m.action });
      startY += btnH + 8;
    }

    // Back button
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `bold 14px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('← BACK', W/2, H - 8);
    this._modeSelectRects.push({ x:W/2-50, y:H-30, w:100, h:25, action:'back' });
  }

  _clickModeSelect(mx, my) {
    const rects = this._modeSelectRects || [];
    for (const r of rects) {
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        if (r.action === 'endless')      { this._startEndlessRunner(); }
        if (r.action === 'campaign')     { this.state = 'world-map'; }
        if (r.action === 'daily')        { this._startDaily(); }
        if (r.action === 'shop')         { this._startShop(); }
        if (r.action === 'leaderboard')  { this.state = 'leaderboard'; }
        if (r.action === 'achievements') { this.state = 'achievements'; }
        if (r.action === 'back')         { this.state = 'title'; }
        return;
      }
    }
  }

  // ── ENDLESS RUNNER ────────────────────────────────────────────
  _startEndlessRunner() {
    // Show controls; hide left/right for endless mode (auto-run)
    const rc = document.getElementById('runnerControls');
    if (rc) rc.classList.remove('hidden');
    const dpadMove = rc?.querySelector('.dpad-move');
    if (dpadMove) dpadMove.style.visibility = 'hidden'; // hide L/R, keep layout
    this.endlessRunner = new EndlessRunnerEngine(
      this.canvas, this.sprites, this.audio, this.progress,
      this.W, this.H
    );
    // Bind jump-only d-pad
    const l = document.getElementById('dpadLeft');
    const r = document.getElementById('dpadRight');
    const j = document.getElementById('dpadJump');
    if (l && r && j) this.endlessRunner.bindDpad(l, r, j);
    this.state = 'endless-runner';
    if (this.audio) this.audio.startEndlessMusic();
  }

  _stopEndlessRunner() {
    // Restore left/right visibility for campaign mode
    const rc = document.getElementById('runnerControls');
    if (rc) rc.classList.add('hidden');
    const dpadMove = rc?.querySelector('.dpad-move');
    if (dpadMove) dpadMove.style.visibility = '';
    this.endlessRunner?.destroy();
    this.endlessRunner = null;
  }

  _updateEndlessRunner() {
    const runner = this.endlessRunner;
    if (!runner) { this.state = 'mode-select'; return; }

    runner.update();

    if (runner.done) {
      if (runner.outcome === 'gate' && runner.hasPendingGate()) {
        this._startEndlessBattle();
      } else if (runner.outcome === 'dead') {
        this._endEndlessRun();
      }
    } else {
      runner.draw();
    }

    // Speed up music proportional to distance
    if (this.audio && runner._distM > 0) {
      const speedMult = 1 + Math.min(runner._distM / 3000, 0.8);
      this.audio.speedUpMusic(speedMult);
    }
  }

  _startEndlessBattle() {
    const runner = this.endlessRunner;
    const gateData = runner.getPendingGate();
    if (!gateData || !gateData.word) {
      runner.done = false; runner.outcome = null; runner._inBattle = false;
      this.state = 'endless-runner'; return;
    }
    document.getElementById('runnerControls')?.classList.add('hidden');
    this.endlessBattle = new EndlessBattleEngine(
      this.canvas, document.getElementById('battleOverlay'),
      gateData.word, this.sprites, this.audio, this.W, this.H,
      (result, timeUsed) => this._onEndlessBattleDone(result, timeUsed),
      gateData.autoBlend
    );
    this.state = 'endless-battle';
    // Draw a static frame of the runner in background
    if (runner) runner.draw();
  }

  _updateEndlessBattle() {
    const battle = this.endlessBattle;
    if (!battle) { this.state = 'mode-select'; return; }

    const dt = 1/60;
    battle.update(dt);
    // Draw runner background + battle FX on canvas
    if (this.endlessRunner) this.endlessRunner.draw();
    battle.drawFX();

    if (battle.isDone()) {
      // Will have called onDone callback already
    }
  }

  _onEndlessBattleDone(result, timeUsed) {
    const runner = this.endlessRunner;
    const word   = this.endlessBattle?.word;
    const isPerfect = result === 'perfect';
    const success   = result === 'perfect' || result === 'good';

    // Record blend in progress
    if (word) this.progress.recordBlend(null, word.word, success, isPerfect);

    // Update combo in runner
    if (runner && success) {
      runner.addCombo(isPerfect, word?.word);
    } else if (runner && !success) {
      runner.breakCombo();
    }

    // Check perfect run count for achievements
    if (runner) this.progress.recordPerfectBlends(runner._perfectBlends);

    // Resume runner
    this.endlessBattle = null;
    if (runner) {
      runner.done    = false;
      runner.outcome = null;
      runner._inBattle = false;
      runner.resumeAfterBattle(success);
    }
    document.getElementById('runnerControls')?.classList.remove('hidden');
    this.state = 'endless-runner';
  }

  _endEndlessRun() {
    const runner = this.endlessRunner;
    if (!runner) { this.state = 'mode-select'; return; }
    this.audio?.stopMusic();
    if (this.audio) this.audio.sfxGameOver();

    const score = runner.getScore();
    const dist  = runner.getDist();
    const grains= runner.getGrains();
    const combo  = runner.getMaxCombo();
    const perfects = runner.getPerfects();

    this.progress.addRiceGrains(grains);
    this.progress.recordEndlessRun(score, dist, combo);
    this.progress.recordPerfectBlends(perfects);

    // Store for display
    this._lastEndlessResult = { score, dist, grains, combo, perfects };
    this._endlessGameoverAge = 0;

    this.state = 'endless-gameover';
  }

  _drawEndlessGameover() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const t = this._endlessGameoverAge || 0;
    this._endlessGameoverAge = (this._endlessGameoverAge || 0) + 1;

    const r = this._lastEndlessResult || {};

    // Dark overlay
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0d1a'); bg.addColorStop(1, '#1a0d0d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Sad Riku (procedural)
    this._drawRikuIdle(ctx, W/2, H * 0.18, Math.min(W*0.18, 80), t);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    // GAME OVER
    const goSize = Math.min(W*0.1, 44);
    ctx.font = `bold ${goSize}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FF4444';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    const goY = H * 0.3;
    const slideIn = Math.min(1, t / 30);
    ctx.strokeText('GAME OVER', W/2, goY - (1-slideIn)*40);
    ctx.fillText('GAME OVER', W/2, goY - (1-slideIn)*40);

    const hs = this.progress.getEndlessHighScore();
    const newHS = r.score >= hs;

    // Score
    const statY = H * 0.42;
    const stats = [
      { label:'SCORE',    value: r.score?.toLocaleString() || '0', emoji:'⭐', hl: newHS },
      { label:'DISTANCE', value: `${r.dist || 0}m`,               emoji:'🏃' },
      { label:'🌾 GRAINS', value: `+${r.grains || 0}`,            emoji:'🌾' },
      { label:'MAX COMBO', value: `${r.combo || 0}x`,             emoji:'🔥' },
    ];

    const statH = Math.min(42, (H * 0.3) / stats.length);
    stats.forEach((s, i) => {
      const sy = statY + i * (statH + 4);
      ctx.fillStyle = s.hl ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(W*0.1, sy, W*0.8, statH, 8); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = `bold ${Math.min(14,W*0.034)}px Arial, sans-serif`;
      ctx.fillStyle = s.hl ? '#FFD700' : '#aaa';
      ctx.fillText(`${s.emoji} ${s.label}`, W*0.14, sy + statH/2);
      ctx.textAlign = 'right'; ctx.font = `bold ${Math.min(16,W*0.038)}px Arial Black, sans-serif`;
      ctx.fillStyle = s.hl ? '#FFD700' : '#fff';
      ctx.fillText(s.value + (s.hl ? ' ★NEW' : ''), W*0.9, sy + statH/2);
    });

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // High score line
    if (!newHS) {
      ctx.font = `${Math.min(13,W*0.032)}px Arial, sans-serif`;
      ctx.fillStyle = '#888';
      ctx.fillText(`Best: ${hs?.toLocaleString() || 0} · Streak: #${this.progress.getBestCombo()}x`, W/2, statY + stats.length * (statH+4) + 16);
    }

    // Buttons
    const btnY = H * 0.78;
    const btnW2 = Math.min(W * 0.38, 150);
    const btnH2 = Math.min(46, H * 0.07);
    const gap = 12;

    const btns = [
      { label:'▶ PLAY AGAIN', col:'#FF6B35', x: W/2 - btnW2 - gap/2 },
      { label:'🏪 SHOP',      col:'#FF80FF', x: W/2 + gap/2 },
    ];

    this._endlessGameoverRects = [];
    for (const b of btns) {
      const grad = ctx.createLinearGradient(b.x, btnY, b.x + btnW2, btnY + btnH2);
      grad.addColorStop(0, b.col); grad.addColorStop(1, b.col + 'aa');
      ctx.fillStyle = grad;
      ctx.strokeStyle = b.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(b.x, btnY, btnW2, btnH2, 10); ctx.fill(); ctx.stroke();
      ctx.font = `bold ${Math.min(15,W*0.037)}px Arial Black, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(b.label, b.x + btnW2/2, btnY + btnH2/2);
      this._endlessGameoverRects.push({ x:b.x, y:btnY, w:btnW2, h:btnH2, label:b.label });
    }

    // Back to menu
    ctx.font = `${Math.min(13,W*0.032)}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('← MENU', W/2, H - 18);
    this._endlessGameoverRects.push({ x:W/2-40, y:H-30, w:80, h:24, label:'MENU' });
  }

  _clickEndlessGameover(mx, my) {
    const rects = this._endlessGameoverRects || [];
    for (const r of rects) {
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        if (r.label.includes('PLAY AGAIN')) {
          this._stopEndlessRunner();
          this._startEndlessRunner();
        } else if (r.label.includes('SHOP')) {
          this._preShopState = 'endless-gameover';
          this._startShop();
        } else {
          this._stopEndlessRunner();
          this.state = 'mode-select';
        }
        return;
      }
    }
    // Default: menu
    this._stopEndlessRunner();
    this.state = 'mode-select';
  }

  // ── SHOP ──────────────────────────────────────────────────────
  _startShop() {
    this._shopTab = 'swords';
    this._shopScroll = 0;
    this.state = 'shop';
  }

  _updateShop() { this._drawShop(); }
  _drawShop() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0d2e'); bg.addColorStop(1, '#0d1a1a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Header
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.min(26, W*0.06)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText('🏪 RICE GRAIN SHOP', W/2, 14);
    ctx.fillText('🏪 RICE GRAIN SHOP', W/2, 14);

    // Grain count
    ctx.textAlign = 'right'; ctx.font = `bold 16px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.fillText(`🌾 ${this.progress.getRiceGrains()}`, W-10, 16);

    // Tabs
    const tabs = ['swords','hats','companions','powerups'];
    const tabLabels = { swords:'⚔️ Swords', hats:'🎩 Hats', companions:'🐾 Pals', powerups:'💊 Power' };
    const tabW = W / tabs.length;
    this._shopTabRects = [];
    tabs.forEach((tab, i) => {
      const tx = i * tabW, ty = 50, tw = tabW - 2, th = 36;
      const isActive = this._shopTab === tab;
      ctx.fillStyle = isActive ? '#FFD700' : 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.roundRect(tx+1, ty, tw, th, 6); ctx.fill();
      ctx.strokeStyle = isActive ? '#FFD700' : 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(13,W*0.032)}px Arial, sans-serif`;
      ctx.fillStyle = isActive ? '#000' : '#fff';
      ctx.fillText(tabLabels[tab], tx + tw/2, ty + th/2);
      this._shopTabRects.push({ x:tx, y:ty, w:tw, h:th, tab });
    });

    // Items grid
    const items = SHOP_ITEMS[this._shopTab] || [];
    const cols = 2;
    const itemW = (W - 24) / cols;
    const itemH = Math.min(110, (H - 120) / 3);
    const startY = 96;
    this._shopItemRects = [];

    items.forEach((item, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ix = 8 + col * (itemW + 8);
      const iy = startY + row * (itemH + 8) - this._shopScroll;
      if (iy + itemH < 90 || iy > H - 20) return;

      const owned    = this.progress.ownsItem(item.id);
      const equipped = this.progress.getEquipped();
      const isEquip  = Object.values(equipped).includes(item.id);
      const pcount   = this.progress.getPowerupCount(item.id);

      // Background
      ctx.fillStyle = isEquip ? 'rgba(255,215,0,0.15)' : owned ? 'rgba(255,255,255,0.08)' : 'rgba(100,100,100,0.1)';
      ctx.strokeStyle = isEquip ? '#FFD700' : owned ? '#888' : '#444';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(ix, iy, itemW, itemH, 10); ctx.fill(); ctx.stroke();

      // Emoji
      ctx.font = `${Math.min(32, itemH*0.35)}px serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, ix + 10, iy + itemH*0.35);
      if (pcount > 0) {
        ctx.font = `bold 12px Arial, sans-serif`; ctx.fillStyle = '#FFD700';
        ctx.fillText(`×${pcount}`, ix + 44, iy + 10);
      }

      // Name
      ctx.font = `bold ${Math.min(13,W*0.032)}px Arial, sans-serif`;
      ctx.fillStyle = isEquip ? '#FFD700' : '#fff';
      ctx.fillText(item.name, ix + 52, iy + itemH*0.28);
      // Desc
      ctx.font = `${Math.min(11,W*0.027)}px Arial, sans-serif`;
      ctx.fillStyle = '#aaa';
      ctx.fillText(item.desc, ix + 52, iy + itemH*0.52);

      // Button
      const bx = ix + itemW - 70, by = iy + itemH - 30, bw = 62, bh = 24;
      let btnLabel = '', btnCol = '#aaa';
      if (isEquip) { btnLabel = '✓ ON'; btnCol = '#FFD700'; }
      else if (item.consumable && owned && pcount > 0) { btnLabel = 'BUY MORE'; btnCol = '#FF80FF'; }
      else if (owned) { btnLabel = 'EQUIP'; btnCol = '#00CCFF'; }
      else if (item.price === 0) { btnLabel = 'FREE'; btnCol = '#00FF88'; }
      else { btnLabel = `🌾 ${item.price}`; btnCol = this.progress.canAfford(item.price) ? '#FF6B35' : '#555'; }

      ctx.fillStyle = btnCol + '33'; ctx.strokeStyle = btnCol; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.font = `bold ${Math.min(12,W*0.029)}px Arial, sans-serif`;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(btnLabel, bx + bw/2, by + bh/2);

      this._shopItemRects.push({ x:ix, y:iy, w:itemW, h:itemH, item, bx, by, bw, bh });
    });

    // Back button
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `bold 14px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('← BACK', W/2, H - 6);
  }

  _clickShop(mx, my) {
    // Tab clicks
    for (const r of (this._shopTabRects || [])) {
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        this._shopTab = r.tab; this._shopScroll = 0; return;
      }
    }
    // Item button clicks
    for (const r of (this._shopItemRects || [])) {
      if (mx >= r.bx && mx <= r.bx+r.bw && my >= r.by && my <= r.by+r.bh) {
        const item = r.item;
        const owned = this.progress.ownsItem(item.id);
        const equipped = this.progress.getEquipped();
        const isEquip = Object.values(equipped).includes(item.id);
        if (isEquip) return; // already on
        if (owned && !item.consumable) {
          // Equip
          const cat = SHOP_ITEMS.swords.find(i=>i.id===item.id) ? 'sword' :
                      SHOP_ITEMS.hats.find(i=>i.id===item.id)   ? 'hat'   : 'comp';
          this.progress.equip(cat, item.id);
          this._queueAchievementPopup({ emoji:item.emoji, name:'Equipped!', desc:item.name });
        } else {
          // Buy
          if (this.progress.buyItem(item.id)) {
            this._queueAchievementPopup({ emoji:'🌾', name:'Purchased!', desc:`${item.name} for 🌾${item.price}` });
            if (!item.consumable) {
              const cat = SHOP_ITEMS.swords.find(i=>i.id===item.id) ? 'sword' :
                          SHOP_ITEMS.hats.find(i=>i.id===item.id)   ? 'hat'   : 'comp';
              this.progress.equip(cat, item.id);
            }
          } else {
            this._queueAchievementPopup({ emoji:'😅', name:'Not enough!', desc:`Need 🌾${item.price} grains` });
          }
        }
        return;
      }
    }
    // Back
    const prevState = this._preShopState || 'mode-select';
    this.state = prevState;
  }

  // ── DAILY CHALLENGE ───────────────────────────────────────────
  _startDaily() {
    const set = PHONICS_DATA.getDailySet();
    this._dailySet    = set;
    this._dailyWords  = set.wordObjs || [];
    this._dailyIdx    = 0;
    this._dailyBlended= 0;
    this._dailyBattle = null;
    this.state = 'daily';
  }

  _updateDaily() {
    if (this._dailyBattle) {
      const dt = 1/60;
      this._dailyBattle.update(dt);
      this._drawDailyBg();
      this._dailyBattle.drawFX();
      if (this._dailyBattle.isDone()) { /* handled by callback */ }
    } else {
      this._drawDaily();
    }
  }

  _drawDailyBg() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d2040'); bg.addColorStop(1, '#401010');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }

  _drawDaily() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this._age;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d2040'); bg.addColorStop(1, '#1a3a1a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // Header
    ctx.font = `bold ${Math.min(24,W*0.058)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText('📅 DAILY CHALLENGE', W/2, 12);
    ctx.fillText('📅 DAILY CHALLENGE', W/2, 12);

    const set = this._dailySet;
    if (!set) { this.state = 'mode-select'; return; }

    // Theme
    ctx.font = `bold ${Math.min(18,W*0.044)}px Arial, sans-serif`;
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText(`${set.emoji || '📖'} Today: ${set.theme}`, W/2, 46);

    // Progress bar
    const prog = this.progress.getDailyCompleted() ? this._dailyWords.length
                 : Math.min(this._dailyBlended, this._dailyWords.length);
    const pct = this._dailyWords.length > 0 ? prog / this._dailyWords.length : 0;
    const barW = W * 0.75, barH = 18, barX = (W - barW)/2, barY = 75;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH/2); ctx.fill();
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW * pct, 0);
    fillGrad.addColorStop(0, '#00FF88'); fillGrad.addColorStop(1, '#FFD700');
    ctx.fillStyle = fillGrad;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, barH, barH/2); ctx.fill();
    ctx.font = `bold 13px Arial, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${prog}/${this._dailyWords.length}`, W/2, barY + barH/2);

    // Words list
    const listY = 108;
    const wordH = Math.min(40, (H * 0.48) / this._dailyWords.length);
    this._dailyWords.forEach((w, i) => {
      const wy = listY + i * wordH;
      const done = i < this._dailyBlended || this.progress.getDailyCompleted();
      const current = i === this._dailyIdx && !done;
      ctx.fillStyle = done ? 'rgba(0,255,136,0.15)' : current ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = done ? '#00FF88' : current ? '#FFD700' : '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(W*0.08, wy, W*0.84, wordH - 3, 8); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(16,W*0.038)}px Arial Black, sans-serif`;
      ctx.fillStyle = done ? '#00FF88' : current ? '#FFD700' : '#888';
      ctx.fillText(`${done ? '✅' : current ? '▶' : '○'} ${w.word?.toUpperCase() || '?'}`, W*0.12, wy + wordH/2);
      ctx.textAlign = 'right';
      ctx.font = `${Math.min(14,W*0.034)}px serif`;
      ctx.fillText(w.hint || '?', W*0.9, wy + wordH/2);
    });

    // Action button
    const completed = this.progress.getDailyCompleted() || this._dailyBlended >= this._dailyWords.length;
    const btnY = H * 0.79, btnW = Math.min(W*0.6, 240), btnH = 48;
    const btnX = (W - btnW) / 2;

    if (completed) {
      ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#FF8C00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 12); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(18,W*0.044)}px Arial Black, sans-serif`;
      ctx.fillStyle = '#000'; ctx.fillText('🏆 COMPLETED! Claim Reward', btnX + btnW/2, btnY + btnH/2);
    } else {
      ctx.fillStyle = '#FF6B35'; ctx.strokeStyle = '#FF4400'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 12); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(18,W*0.044)}px Arial Black, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(this._dailyIdx < this._dailyWords.length ? '⚔️ BLEND NEXT WORD' : '✅ All Done!', btnX + btnW/2, btnY + btnH/2);
    }
    this._dailyActionRect = { x:btnX, y:btnY, w:btnW, h:btnH, completed };

    // Streak display
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `bold 14px Arial, sans-serif`;
    ctx.fillStyle = '#FF8C00';
    ctx.fillText(`🔥 ${this.progress.getDailyStreak()} day streak · 🌾 Reward: ${150 + this.progress.getDailyStreak()*25}`, W/2, btnY - 8);

    // Back
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('← BACK', W/2, H - 6);
    this._dailyBackRect = { x:W/2-50, y:H-28, w:100, h:22 };
  }

  _clickDaily(mx, my) {
    if (this._dailyBackRect) {
      const r = this._dailyBackRect;
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        this.state = 'mode-select'; return;
      }
    }
    if (!this._dailyActionRect) return;
    const r = this._dailyActionRect;
    if (mx < r.x || mx > r.x+r.w || my < r.y || my > r.y+r.h) return;

    if (r.completed) {
      const earned = this.progress.completeDaily();
      if (earned > 0) this._queueAchievementPopup({ emoji:'🏆', name:'Daily Complete!', desc:`+${earned} Rice Grains!` });
      this.state = 'mode-select';
    } else if (this._dailyIdx < (this._dailyWords || []).length) {
      const word = this._dailyWords[this._dailyIdx];
      if (!word) return;
      this._dailyBattle = new EndlessBattleEngine(
        this.canvas, document.getElementById('battleOverlay'),
        word, this.sprites, this.audio, this.W, this.H,
        (result) => {
          const success = result === 'perfect' || result === 'good';
          this.progress.recordBlend(null, word.word, success, result === 'perfect');
          if (success) { this._dailyBlended++; this.progress.recordDailyWord(); }
          this._dailyIdx++;
          this._dailyBattle = null;
          if (this._dailyBlended >= this._dailyWords.length) {
            this.progress.completeDaily();
          }
        }
      );
    }
  }

  // ── ACHIEVEMENTS ──────────────────────────────────────────────
  _updateAchievements() { this._drawAchievements(); }
  _drawAchievements() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1a2e'); bg.addColorStop(1, '#1a2e0d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.min(24,W*0.058)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText('🥇 ACHIEVEMENTS', W/2, 12); ctx.fillText('🥇 ACHIEVEMENTS', W/2, 12);

    const unlocked = this.progress.data.achievements || [];
    ctx.font = `13px Arial, sans-serif`; ctx.fillStyle = '#aaa';
    ctx.fillText(`${unlocked.length} / ${ACHIEVEMENTS.length} unlocked`, W/2, 44);

    const cols = 2, rows = Math.ceil(ACHIEVEMENTS.length / cols);
    const cellW = (W - 24) / cols, cellH = Math.min(64, (H - 90) / 4.5);
    const startY = 62;
    const scroll = this._achScroll || 0;

    ACHIEVEMENTS.forEach((ach, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ax = 8 + col * (cellW + 8), ay = startY + row * (cellH + 6) - scroll;
      if (ay + cellH < 60 || ay > H) return;
      const isUnlocked = unlocked.includes(ach.id);
      const isNew = this.progress.data.newAchievements?.includes(ach.id);
      ctx.fillStyle = isNew ? 'rgba(255,215,0,0.18)' : isUnlocked ? 'rgba(255,255,255,0.1)' : 'rgba(50,50,50,0.5)';
      ctx.strokeStyle = isNew ? '#FFD700' : isUnlocked ? '#888' : '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(ax, ay, cellW - 4, cellH, 8); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = isUnlocked ? 1 : 0.3;
      ctx.font = `${Math.min(22, cellH*0.38)}px serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(ach.emoji, ax + 8, ay + cellH/2);
      ctx.font = `bold ${Math.min(12,W*0.030)}px Arial, sans-serif`;
      ctx.fillStyle = isNew ? '#FFD700' : isUnlocked ? '#fff' : '#666';
      ctx.fillText(ach.name, ax + 36, ay + cellH*0.35);
      ctx.font = `${Math.min(10,W*0.025)}px Arial, sans-serif`;
      ctx.fillStyle = '#aaa';
      ctx.fillText(ach.desc, ax + 36, ay + cellH*0.65);
      ctx.globalAlpha = 1;
    });

    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `bold 14px Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('← BACK', W/2, H - 6);
    this._achBackRect = { x:W/2-50, y:H-28, w:100, h:22 };
  }

  _clickAchievements(mx, my) {
    if (this._achBackRect) {
      const r = this._achBackRect;
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        this.progress.clearNewAchievements();
        this.state = 'mode-select';
      }
    }
  }

  // ── LEADERBOARD ──────────────────────────────────────────────
  _updateLeaderboard() { this._drawLeaderboard(); }
  _drawLeaderboard() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0d2e'); bg.addColorStop(1, '#2e0d0d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.min(24,W*0.058)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText('🏆 LEADERBOARD', W/2, 12); ctx.fillText('🏆 LEADERBOARD', W/2, 12);
    ctx.font = `13px Arial, sans-serif`; ctx.fillStyle = '#888';
    ctx.fillText('Endless Run · Best Score', W/2, 44);

    const leaders = this.progress.getLeaderboard();
    const rowH = Math.min(40, (H - 110) / 11);
    const medals = ['🥇','🥈','🥉'];

    leaders.forEach((l, i) => {
      const ry = 64 + i * (rowH + 4);
      const isMe = l.isMe;
      ctx.fillStyle = isMe ? 'rgba(255,215,0,0.18)' : i < 3 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = isMe ? '#FFD700' : '#333'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(10, ry, W-20, rowH, 8); ctx.fill(); ctx.stroke();

      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(16,W*0.038)}px serif`;
      ctx.fillText(i < 3 ? medals[i] : `${i+1}.`, 16, ry + rowH/2);

      ctx.font = `bold ${Math.min(14,W*0.034)}px Arial, sans-serif`;
      ctx.fillStyle = isMe ? '#FFD700' : '#fff';
      ctx.fillText(l.name, 46, ry + rowH/2);

      ctx.textAlign = 'right';
      ctx.font = `bold ${Math.min(14,W*0.034)}px Arial, sans-serif`;
      ctx.fillStyle = isMe ? '#FFD700' : '#aaa';
      ctx.fillText(l.score.toLocaleString(), W - 14, ry + rowH/2 - 8);
      ctx.font = `11px Arial, sans-serif`; ctx.fillStyle = '#666';
      ctx.fillText(`${l.dist}m`, W - 14, ry + rowH/2 + 7);
    });

    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `bold 14px Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('← BACK', W/2, H - 6);
  }

  // ── ACHIEVEMENT POPUP SYSTEM ──────────────────────────────────
  _tickAchievementPopup() {
    if (!this._achPopupQueue) this._achPopupQueue = [];
    if (this._achPopup) {
      this._achPopup.life -= 0.018;
      if (this._achPopup.life <= 0) {
        this._achPopup = null;
        // Show next in queue
        if (this._achPopupQueue.length > 0) this._showNextPopup();
      }
    } else if (this._achPopupQueue.length > 0) {
      // Check for new achievements from progress tracker
      const newIds = this.progress.getNewAchievements();
      if (newIds.length > 0) {
        this.progress.clearNewAchievements();
        for (const id of newIds) {
          const ach = ACHIEVEMENTS.find(a => a.id === id);
          if (ach) this._queueAchievementPopup(ach);
        }
      }
      this._showNextPopup();
    }
  }

  _queueAchievementPopup(ach) {
    if (!this._achPopupQueue) this._achPopupQueue = [];
    this._achPopupQueue.push({ ...ach, life: 1 });
    if (!this._achPopup) this._showNextPopup();
  }

  _showNextPopup() {
    if (!this._achPopupQueue || this._achPopupQueue.length === 0) return;
    this._achPopup = this._achPopupQueue.shift();
    this._achPopup.life = 1;
    if (this.audio) this.audio.sfxAchievement();
  }

  _drawAchievementPopup() {
    if (!this._achPopup) return;
    const p = this._achPopup;
    const ctx = this.ctx, W = this.W;
    const alpha = Math.min(1, p.life > 0.8 ? (1-p.life)*5 : p.life < 0.3 ? p.life/0.3 : 1);
    const slideY = p.life > 0.8 ? (1-p.life)*5*60 - 60 : 0;
    const popW = Math.min(W * 0.85, 320), popH = 60;
    const popX = (W - popW) / 2, popY = 10 + slideY;

    ctx.save();
    ctx.globalAlpha = alpha;
    // Card
    const grad = ctx.createLinearGradient(popX, popY, popX + popW, popY);
    grad.addColorStop(0, '#2a1a4a'); grad.addColorStop(1, '#1a2a4a');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(popX, popY, popW, popH, 10); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // Emoji
    ctx.font = '26px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji || '🏆', popX + 10, popY + popH/2);
    // Labels
    ctx.font = `bold ${Math.min(13,W*0.032)}px Arial Black, sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.textAlign = 'left';
    ctx.fillText(p.name || 'Achievement!', popX + 46, popY + popH*0.33);
    ctx.font = `${Math.min(11,W*0.027)}px Arial, sans-serif`;
    ctx.fillStyle = '#bbb';
    ctx.fillText(p.desc || '', popX + 46, popY + popH*0.65);
    // ★ ACHIEVEMENT badge
    ctx.textAlign = 'right'; ctx.font = `bold 11px Arial, sans-serif`;
    ctx.fillStyle = '#888';
    ctx.fillText('★ ACHIEVEMENT', popX + popW - 8, popY + 12);
    ctx.restore();
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
    // Return to title (mode-select)
    _slashGameInstance.state = 'mode-select';
    _slashGameInstance.overlay.classList.add('hidden');
    _slashGameInstance.overlay.innerHTML = '';
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

// Escape / P → pause/resume during gameplay; Q → quit-to-map while paused
document.addEventListener('keydown', (e) => {
  const slashActive = document.getElementById('slashScreen')?.classList.contains('active');
  if (!slashActive || !_slashGameInstance) return;

  const s = _slashGameInstance.state;

  if (e.key === 'Escape') {
    if (s === 'menu' || s === 'stage-select' || s === 'world-map') {
      exitSlash();
    } else if (s === 'runner' && _slashGameInstance.runner) {
      _slashGameInstance.runner._togglePause();
    } else if (s === 'battle' && _slashGameInstance.battle) {
      _slashGameInstance.battle._togglePause();
    }
  }

  // Q while paused → quit to world map
  if (e.key === 'q' || e.key === 'Q') {
    if (s === 'runner' && _slashGameInstance.runner?._paused) {
      _slashGameInstance.runner._paused = false;
      _slashGameInstance.audio.stopMusic();
      _slashGameInstance.runner = null;
      _slashGameInstance.state  = 'world-map';
    } else if (s === 'battle' && _slashGameInstance.battle?._paused) {
      _slashGameInstance.battle._stopBlendTimer();
      _slashGameInstance.battle._paused = false;
      _slashGameInstance.audio.stopMusic();
      _slashGameInstance.battle = null;
      _slashGameInstance.state  = 'world-map';
    }
  }
});
