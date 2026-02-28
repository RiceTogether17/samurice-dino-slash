'use strict';

// ============================================================
// DINO DASH — Flappy Bird Style Game
// js/game.js
// ============================================================
//
// ┌─ TUNING GUIDE ─────────────────────────────────────────────┐
// │  Constant          Default  Effect                         │
// │  GRAVITY           0.45     How fast the dino falls        │
// │  JUMP_FORCE       -7.0      Upward impulse on tap/space    │
// │  TERMINAL_VEL      11       Max fall speed (cap)           │
// │  PIPE_SPEED_INIT   2.8      Starting obstacle speed        │
// │  PIPE_SPEED_MAX    7.0      Cap on obstacle speed          │
// │  SPEED_INCREMENT   0.18     Speed added per 10 points      │
// │  GAP_INITIAL       175      Starting pipe gap (px)         │
// │  GAP_MIN           120      Minimum pipe gap (px)          │
// │  GAP_SHRINK        3        Gap reduction per 10 pts       │
// │  PIPE_INTERVAL     1800     Ms between pipe spawns         │
// │  SHAKE_DURATION    18       Frames of screen shake         │
// │  SHAKE_MAG         8        Screen shake intensity (px)    │
// │  PARTICLE_COUNT    22       Confetti pieces per score      │
// └────────────────────────────────────────────────────────────┘

// ── ROUNDRECT POLYFILL ───────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0);
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}

// ── CONSTANTS ────────────────────────────────────────────────
const GRAVITY         = 0.45;
const JUMP_FORCE      = -7.0;
const TERMINAL_VEL    = 11;
const PIPE_SPEED_INIT = 2.8;
const PIPE_SPEED_MAX  = 7.0;
const SPEED_INCREMENT = 0.18;
const GAP_INITIAL     = 175;
const GAP_MIN         = 120;
const GAP_SHRINK      = 3;
const PIPE_INTERVAL   = 1800;
const PIPE_WIDTH      = 68;
const DINO_W          = 56;
const DINO_H          = 56;
const DINO_X          = 90;
const GROUND_H        = 60;
const SHAKE_DURATION  = 18;
const SHAKE_MAG       = 8;
const PARTICLE_COUNT  = 22;

const SKINS = [
  { name: 'Raptor',       file: 'assets/dinosaurs/raptor.png'       },
  { name: 'Velociraptor', file: 'assets/dinosaurs/velociraptor.png' },
  { name: 'Stego',        file: 'assets/dinosaurs/stegosaurus.png'  },
  { name: 'Triceratops',  file: 'assets/dinosaurs/triceratops.png'  },
  { name: 'T-Rex Boss',   file: 'assets/dinosaurs/trex.png'         },
];

// ── SEEDED RANDOM (for Daily Challenge) ─────────────────────
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function getDailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ── AUDIO MANAGER ────────────────────────────────────────────
class FlappyAudioManager {
  constructor() {
    this.ctx   = null;
    this.muted = localStorage.getItem('dinoDashMuted') === 'true';
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* no audio */ }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, type, dur, vol = 0.35, delay = 0) {
    if (this.muted || !this.ctx) return;
    this._resume();
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  jump()      { this._tone(520, 'sine', 0.12, 0.35); this._tone(660, 'sine', 0.08, 0.2, 0.07); }
  score()     { [880, 1100, 1320].forEach((f, i) => this._tone(f, 'sine', 0.1, 0.3, i * 0.08)); }
  hit()       { this._tone(180, 'sawtooth', 0.3, 0.5); this._tone(110, 'square', 0.2, 0.4, 0.12); }
  highScore() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 'sine', 0.15, 0.4, i * 0.12)); }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('dinoDashMuted', this.muted);
    return this.muted;
  }
}

// ── PLAYER ───────────────────────────────────────────────────
class Player {
  constructor(y, sprite) {
    this.x      = DINO_X;
    this.y      = y;
    this.vy     = 0;
    this.angle  = 0;
    this.sprite = sprite;
    this.alive  = true;
  }

  jump() { this.vy = JUMP_FORCE; }

  update(canvasH) {
    this.vy = Math.min(this.vy + GRAVITY, TERMINAL_VEL);
    this.y += this.vy;

    // Smooth rotation: tilt up when rising, nose-dive when falling
    const target = this.vy < 0 ? -25 : Math.min(55, this.vy * 4.5);
    this.angle  += (target - this.angle) * 0.18;

    if (this.y + DINO_H >= canvasH - GROUND_H) {
      this.y     = canvasH - GROUND_H - DINO_H;
      this.alive = false;
    }
    if (this.y < 0) { this.y = 0; this.vy = 0; }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + DINO_W / 2, this.y + DINO_H / 2);
    ctx.rotate(this.angle * Math.PI / 180);
    if (this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0) {
      ctx.drawImage(this.sprite, -DINO_W / 2, -DINO_H / 2, DINO_W, DINO_H);
    } else {
      // Pixel-art fallback dino
      ctx.fillStyle = '#5a8a3c';
      ctx.fillRect(-DINO_W / 2, -DINO_H / 2, DINO_W, DINO_H);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-DINO_W / 2 + 36, -DINO_H / 2 + 8, 10, 10);
      ctx.fillStyle = '#000';
      ctx.fillRect(-DINO_W / 2 + 39, -DINO_H / 2 + 11, 4, 4);
      ctx.fillStyle = '#3d6b28';
      ctx.fillRect(-DINO_W / 2 - 12, -DINO_H / 2 + 16, 14, 10);
    }
    ctx.restore();
  }

  // Slightly inset bounding box for forgiving collision
  getBounds() {
    const inset = 9;
    return { x: this.x + inset, y: this.y + inset, w: DINO_W - inset * 2, h: DINO_H - inset * 2 };
  }
}

// ── OBSTACLE (Pipe Pair) ─────────────────────────────────────
class Obstacle {
  constructor(x, canvasH, gapCenter, gap) {
    this.x         = x;
    this.gap       = gap;
    this.gapCenter = gapCenter;
    this.w         = PIPE_WIDTH;
    this.scored    = false;

    const topH = gapCenter - gap / 2;
    const botY = gapCenter + gap / 2;
    const botH = canvasH - GROUND_H - botY;

    this.top = { x, y: 0,    w: PIPE_WIDTH, h: topH };
    this.bot = { x, y: botY, w: PIPE_WIDTH, h: botH };

    // Visual variety
    this._variant = Math.floor(Math.random() * 3);
  }

  update(speed) {
    this.x    -= speed;
    this.top.x = this.x;
    this.bot.x = this.x;
  }

  draw(ctx, canvasH) {
    const palettes = [
      { body: '#7a4a1e', cap: '#9b5e25', hi: '#c07a3a', shadow: '#4a2800' },
      { body: '#6B7B6B', cap: '#888A88', hi: '#aaa',    shadow: '#444'    },
      { body: '#4a3580', cap: '#6244aa', hi: '#8866cc', shadow: '#2a1a50' },
    ];
    const p = palettes[this._variant];
    this._drawPipe(ctx, this.top, p, false);
    this._drawPipe(ctx, this.bot, p, true);
  }

  _drawPipe(ctx, rect, p, isBottom) {
    if (rect.h <= 0) return;
    const capH = 22;
    const capW = rect.w + 12;
    const capX = rect.x - 6;

    // Body gradient
    const grad = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
    grad.addColorStop(0,   p.shadow);
    grad.addColorStop(0.25, p.body);
    grad.addColorStop(0.65, p.body);
    grad.addColorStop(1,   p.shadow);
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    // Highlight strip
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(rect.x + 5, rect.y, 8, rect.h);

    // Cap
    const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    capGrad.addColorStop(0,   p.shadow);
    capGrad.addColorStop(0.3, p.cap);
    capGrad.addColorStop(0.7, p.cap);
    capGrad.addColorStop(1,   p.shadow);
    ctx.fillStyle = capGrad;
    const capY = isBottom ? rect.y : rect.y + rect.h - capH;
    ctx.fillRect(capX, capY, capW, capH);

    // Cap top edge
    ctx.fillStyle = p.hi;
    ctx.fillRect(capX, isBottom ? capY : capY + capH - 3, capW, 3);
  }

  isOffscreen()       { return this.x + this.w < 0; }
  passedBy(player)    { return !this.scored && player.x > this.x + this.w; }

  collidesWith(player) {
    const b = player.getBounds();
    return this._overlap(b, this.top) || this._overlap(b, this.bot);
  }

  _overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
}

// ── PARTICLE (score confetti) ─────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x     = x;
    this.y     = y;
    this.vx    = (Math.random() - 0.5) * 7;
    this.vy    = Math.random() * -5 - 1;
    this.size  = Math.random() * 7 + 3;
    this.color = `hsl(${Math.random() * 360}, 90%, 60%)`;
    this.life  = 1;
    this.decay = Math.random() * 0.025 + 0.018;
    this.rot   = Math.random() * Math.PI * 2;
    this.rotV  = (Math.random() - 0.5) * 0.2;
  }

  update() {
    this.x   += this.vx;
    this.y   += this.vy;
    this.vy  += 0.18;
    this.life -= this.decay;
    this.rot  += this.rotV;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle   = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  isDead() { return this.life <= 0; }
}

// ── POP ANIMATION ("+1" text) ─────────────────────────────────
class PopAnim {
  constructor(x, y, text) {
    this.x     = x;
    this.y     = y;
    this.text  = text;
    this.life  = 1;
    this.scale = 0.4;
  }

  update() {
    this.life  -= 0.022;
    this.scale  = Math.min(1.2, this.scale + 0.08);
    this.y     -= 1.2;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.font        = 'bold 30px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign   = 'center';
    ctx.lineWidth   = 4;
    ctx.strokeStyle = '#222';
    ctx.strokeText(this.text, 0, 0);
    ctx.fillStyle   = '#FFD700';
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }

  isDead() { return this.life <= 0; }
}

// ── CLOUD (parallax layer 1) ──────────────────────────────────
class Cloud {
  constructor(W, H, randomX = true) {
    this.W  = W;
    this.H  = H;
    this.x  = randomX ? Math.random() * W : W + 60;
    this.y  = Math.random() * (H * 0.45);
    this.rx = Math.random() * 50 + 40;
    this.ry = Math.random() * 18 + 14;
    this.sp = Math.random() * 0.5 + 0.25;
    this.op = Math.random() * 0.35 + 0.3;
  }

  update() {
    this.x -= this.sp;
    if (this.x + this.rx < 0) {
      this.x = this.W + this.rx;
      this.y = Math.random() * (this.H * 0.45);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.op;
    ctx.fillStyle   = '#fff';
    [[0, 0, 1, 1], [-0.3, 0.3, 0.7, 0.8], [0.3, 0.3, 0.7, 0.8]].forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(this.x + dx * this.rx, this.y + dy * this.ry, this.rx * rx, this.ry * ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

// ── HILL (parallax layer 0 — far) ─────────────────────────────
class Hill {
  constructor(W, H) {
    this.W  = W;
    this.H  = H;
    this.x  = Math.random() * W;
    this.r  = Math.random() * 90 + 55;
    this.sp = 0.4;
    this.c  = `hsl(${105 + Math.random() * 30}, 38%, ${30 + Math.random() * 15}%)`;
  }

  update() {
    this.x -= this.sp;
    if (this.x + this.r < 0) this.x = this.W + this.r;
  }

  draw(ctx) {
    ctx.fillStyle = this.c;
    ctx.beginPath();
    ctx.arc(this.x, this.H - GROUND_H, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── SCORE POP (score ring animation on gap) ──────────────────
class ScoreRing {
  constructor(x, y) {
    this.x    = x;
    this.y    = y;
    this.r    = 10;
    this.life = 1;
  }

  update() {
    this.r    += 5;
    this.life -= 0.06;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha  = Math.max(0, this.life);
    ctx.strokeStyle  = '#FFD700';
    ctx.lineWidth    = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  isDead() { return this.life <= 0; }
}

// ── GROUND TILE SCROLLER ──────────────────────────────────────
class Ground {
  constructor(W) {
    this.W      = W;
    this.offset = 0;
    this.tileW  = 40;
  }

  update(speed) {
    this.offset = (this.offset + speed) % this.tileW;
  }

  draw(ctx, H) {
    // Dirt base
    ctx.fillStyle = '#8B6040';
    ctx.fillRect(0, H - GROUND_H, this.W, GROUND_H);

    // Grass strip
    ctx.fillStyle = '#5a8a3c';
    ctx.fillRect(0, H - GROUND_H, this.W, 14);

    // Grass tufts scrolling
    ctx.fillStyle = '#4a7a2c';
    for (let x = -this.tileW + this.offset; x < this.W + this.tileW; x += this.tileW) {
      ctx.beginPath();
      ctx.moveTo(x, H - GROUND_H + 14);
      ctx.lineTo(x + 6, H - GROUND_H + 4);
      ctx.lineTo(x + 12, H - GROUND_H + 14);
      ctx.fill();
    }

    // Ground stones
    ctx.fillStyle = '#6e4e2e';
    for (let x = -this.tileW + this.offset * 0.6; x < this.W + this.tileW; x += this.tileW * 1.5) {
      ctx.beginPath();
      ctx.ellipse(x + 20, H - GROUND_H + 30, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── MAIN GAME CLASS ───────────────────────────────────────────
class FlappyGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.audio  = new FlappyAudioManager();

    this._dpr   = window.devicePixelRatio || 1;
    this._setupCanvas();

    // Game state
    this.state     = 'start';   // start | playing | paused | gameover
    this.mode      = 'classic'; // classic | daily
    this.score     = 0;
    this.bestScore = parseInt(localStorage.getItem('dinoDashBest') || '0');
    this.isNewBest = false;

    // Collections
    this.obstacles  = [];
    this.particles  = [];
    this.popAnims   = [];
    this.rings      = [];
    this.clouds     = [];
    this.hills      = [];

    this.shakeFrames    = 0;
    this.speed          = PIPE_SPEED_INIT;
    this.currentSkin    = 0;
    this.sprites        = {};
    this._lastPipeTime  = 0;
    this.rng            = Math.random.bind(Math);

    this.ground = new Ground(this.W);

    this._loadSprites();
    this._initBackground();
    this._bindEvents();
    this._updateSkinDisplay();
    this._updateModeButtons();

    this._loop = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }

  // ── CANVAS SETUP ─────────────────────────────────────────
  _setupCanvas() {
    const dpr  = this._dpr;
    const wrap = this.canvas.parentElement;
    const W    = wrap.clientWidth  || 480;
    const H    = wrap.clientHeight || 700;
    this.canvas.width  = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;

    window.addEventListener('resize', () => {
      const W2 = wrap.clientWidth  || 480;
      const H2 = wrap.clientHeight || 700;
      this.canvas.width  = W2 * dpr;
      this.canvas.height = H2 * dpr;
      this.canvas.style.width  = W2 + 'px';
      this.canvas.style.height = H2 + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = W2;
      this.H = H2;
      this.ground = new Ground(this.W);
      this._initBackground();
    });
  }

  // ── BACKGROUND ───────────────────────────────────────────
  _initBackground() {
    this.clouds = Array.from({ length: 7 }, () => new Cloud(this.W, this.H, true));
    this.hills  = Array.from({ length: 5 }, () => new Hill(this.W, this.H));
  }

  // ── SPRITE LOADING ────────────────────────────────────────
  _loadSprites() {
    SKINS.forEach(skin => {
      if (this.sprites[skin.file]) return;
      const img = new Image();
      img.src = skin.file;
      this.sprites[skin.file] = img;
    });
  }

  _sprite() { return this.sprites[SKINS[this.currentSkin].file]; }

  // ── EVENTS ───────────────────────────────────────────────
  _bindEvents() {
    const act = (e) => {
      if (e.type === 'touchstart') e.preventDefault();
      if (e.target.closest && e.target.closest('.flappy-overlay-btn')) return;
      if (e.target.id === 'prevSkin' || e.target.id === 'nextSkin') return;
      this._handleAction();
    };

    this.canvas.addEventListener('click',      act);
    this.canvas.addEventListener('touchstart', act, { passive: false });

    document.addEventListener('keydown', (e) => {
      if (!this._isVisible()) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this._handleAction(); }
      if (e.code === 'KeyP'  && this.state === 'playing') this.state = 'paused';
      if (e.code === 'Enter' && this.state === 'gameover') this._startGame();
    });

    document.getElementById('muteBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = this.audio.toggleMute();
      const btn = document.getElementById('muteBtn');
      if (btn) btn.textContent = m ? '🔇' : '🔊';
    });

    document.getElementById('prevSkin')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentSkin = (this.currentSkin - 1 + SKINS.length) % SKINS.length;
      this._updateSkinDisplay();
    });

    document.getElementById('nextSkin')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentSkin = (this.currentSkin + 1) % SKINS.length;
      this._updateSkinDisplay();
    });

    document.getElementById('modeBtnClassic')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setMode('classic');
    });

    document.getElementById('modeBtnDaily')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setMode('daily');
    });

    document.getElementById('shareBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const txt = `I scored ${this.score} in Dino Dash 🦖🔥 Can you beat me?`;
      const btn = document.getElementById('shareBtn');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(() => {
          btn.textContent = '✅ Copied!';
          setTimeout(() => { btn.textContent = '📤 Share Score'; }, 2200);
        });
      } else {
        prompt('Copy this:', txt);
      }
    });
  }

  _isVisible() {
    const scr = document.getElementById('flappyScreen');
    return scr && scr.classList.contains('active');
  }

  _handleAction() {
    switch (this.state) {
      case 'start':    this._startGame();   break;
      case 'playing':  this._jump();        break;
      case 'paused':   this.state = 'playing'; this._lastPipeTime = performance.now(); break;
      case 'gameover': this._startGame();   break;
    }
  }

  // ── MODE ─────────────────────────────────────────────────
  _setMode(mode) {
    this.mode = mode;
    this.rng  = mode === 'daily'
      ? seededRandom(getDailySeed())
      : Math.random.bind(Math);
    this._updateModeButtons();
  }

  _updateModeButtons() {
    document.getElementById('modeBtnClassic')?.classList.toggle('fd-active', this.mode === 'classic');
    document.getElementById('modeBtnDaily')?.classList.toggle('fd-active',   this.mode === 'daily');
  }

  _updateSkinDisplay() {
    const el = document.getElementById('skinName');
    if (el) el.textContent = SKINS[this.currentSkin].name;
  }

  // ── GAME FLOW ─────────────────────────────────────────────
  _startGame() {
    this.score         = 0;
    this.isNewBest     = false;
    this.obstacles     = [];
    this.particles     = [];
    this.popAnims      = [];
    this.rings         = [];
    this.speed         = PIPE_SPEED_INIT;
    this.shakeFrames   = 0;
    this._lastPipeTime = performance.now();

    if (this.mode === 'daily') this.rng = seededRandom(getDailySeed());

    this.player = new Player(this.H / 2 - DINO_H / 2, this._sprite());
    this.state  = 'playing';
    this._setShareVisible(false);
  }

  _jump() {
    this.player.jump();
    this.audio.jump();
  }

  _gameOver() {
    this.state       = 'gameover';
    this.shakeFrames = SHAKE_DURATION;
    this.audio.hit();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.isNewBest = true;
      localStorage.setItem('dinoDashBest', this.bestScore);
      setTimeout(() => this.audio.highScore(), 350);
    }
    this._setShareVisible(true);
  }

  _setShareVisible(v) {
    const btn = document.getElementById('shareBtn');
    if (btn) btn.style.display = v ? 'block' : 'none';
  }

  // ── SPAWNING ─────────────────────────────────────────────
  _spawnObstacle(now) {
    if (now - this._lastPipeTime < PIPE_INTERVAL) return;
    this._lastPipeTime = now;

    const gap    = Math.max(GAP_MIN, GAP_INITIAL - Math.floor(this.score / 10) * GAP_SHRINK);
    const margin = 80;
    const center = margin + gap / 2 + this.rng() * (this.H - GROUND_H - margin * 2 - gap);
    this.obstacles.push(new Obstacle(this.W + 20, this.H, center, gap));
  }

  // ── SCORING ──────────────────────────────────────────────
  _checkScoring() {
    for (const obs of this.obstacles) {
      if (!obs.passedBy(this.player)) continue;
      obs.scored = true;
      this.score++;
      this.audio.score();

      // Speed ramp every 10 points
      this.speed = Math.min(PIPE_SPEED_MAX, PIPE_SPEED_INIT + Math.floor(this.score / 10) * SPEED_INCREMENT);

      // Confetti
      const px = obs.x + obs.w / 2;
      const py = obs.gapCenter;
      for (let i = 0; i < PARTICLE_COUNT; i++) this.particles.push(new Particle(px, py));

      // Pop text
      this.popAnims.push(new PopAnim(this.W / 2, this.H * 0.3, '+1'));
      this.rings.push(new ScoreRing(px, py));
    }
  }

  // ── MAIN LOOP ─────────────────────────────────────────────
  _loop(now) {
    this._rafId = requestAnimationFrame(this._loop);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Screen shake
    let sx = 0, sy = 0;
    if (this.shakeFrames > 0) {
      const mag = SHAKE_MAG * (this.shakeFrames / SHAKE_DURATION);
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
      this.shakeFrames--;
    }
    ctx.save();
    ctx.translate(sx, sy);

    if      (this.state === 'start')    { this._drawBg(); this._drawStartScreen(); }
    else if (this.state === 'playing')  { this._update(now); this._drawFrame(); }
    else if (this.state === 'paused')   { this._drawFrame(); this._drawPauseOverlay(); }
    else if (this.state === 'gameover') { this._drawFrame(); this._drawGameOverlay(); }

    ctx.restore();
  }

  _update(now) {
    // Background
    this.clouds.forEach(c => c.update());
    this.hills.forEach(h => h.update());
    this.ground.update(this.speed);

    // Player
    this.player.update(this.H);
    if (!this.player.alive) { this._gameOver(); return; }

    // Obstacles
    this._spawnObstacle(now);
    this.obstacles.forEach(o => o.update(this.speed));
    this.obstacles = this.obstacles.filter(o => !o.isOffscreen());

    // Collision
    for (const obs of this.obstacles) {
      if (obs.collidesWith(this.player)) {
        this.player.alive = false;
        this._gameOver();
        return;
      }
    }

    this._checkScoring();

    // Particles / anims
    this.particles.forEach(p => p.update());  this.particles = this.particles.filter(p => !p.isDead());
    this.popAnims.forEach(a => a.update());   this.popAnims  = this.popAnims.filter(a => !a.isDead());
    this.rings.forEach(r => r.update());      this.rings     = this.rings.filter(r => !r.isDead());
  }

  // ── DRAWING ───────────────────────────────────────────────
  _drawBg() {
    const ctx  = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0,   '#5baee8');
    grad.addColorStop(0.6, '#c5e8f8');
    grad.addColorStop(1,   '#8BC34A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    this.hills.forEach(h => h.draw(ctx));
    this.clouds.forEach(c => c.draw(ctx));
    this.ground.draw(ctx, this.H);
  }

  _drawFrame() {
    this._drawBg();
    this.rings.forEach(r => r.draw(this.ctx));
    this.obstacles.forEach(o => o.draw(this.ctx, this.H));
    this.particles.forEach(p => p.draw(this.ctx));
    this.player.draw(this.ctx);
    this.popAnims.forEach(a => a.draw(this.ctx));
    this._drawHUD();
  }

  _drawHUD() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';

    // Score shadow
    ctx.font      = 'bold 46px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillText(this.score, this.W / 2 + 2, 62);

    // Score
    ctx.fillStyle = '#fff';
    ctx.fillText(this.score, this.W / 2, 60);

    // Mode badge
    ctx.font      = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.mode === 'daily' ? '#FFD700' : 'rgba(255,255,255,0.85)';
    ctx.fillText(this.mode === 'daily' ? '📅 DAILY' : '🎲 CLASSIC', 10, 26);

    // Best score (small)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`Best: ${this.bestScore}`, this.W - 10, 26);
  }

  _drawStartScreen() {
    const ctx = this.ctx;
    const cx  = this.W / 2;
    const cy  = this.H / 2;

    // Panel
    ctx.fillStyle = 'rgba(10,10,30,0.55)';
    ctx.roundRect(cx - 165, cy - 175, 330, 360, 22);
    ctx.fill();

    ctx.textAlign = 'center';

    // Title
    ctx.font        = 'bold 34px "Comic Sans MS", system-ui, sans-serif';
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 4;
    ctx.strokeText('🦖 DINO DASH 🦖', cx, cy - 135);
    ctx.fillStyle   = '#FFD700';
    ctx.fillText('🦖 DINO DASH 🦖', cx, cy - 135);

    // Dino preview
    const sp = this._sprite();
    if (sp && sp.complete && sp.naturalWidth > 0) {
      ctx.drawImage(sp, cx - 48, cy - 115, 96, 96);
    }

    // Best
    ctx.font      = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Best: ${this.bestScore}`, cx, cy + 15);

    // Tap prompt (pulsing opacity)
    const pulse = 0.65 + 0.35 * Math.sin(Date.now() / 450);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font        = 'bold 22px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle   = '#fff';
    ctx.fillText('Tap / Space to Start!', cx, cy + 60);
    ctx.restore();

    // Controls hint
    ctx.font      = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('P = pause  |  Space / Tap = flap', cx, cy + 110);
  }

  _drawPauseOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.textAlign = 'center';
    ctx.font      = 'bold 48px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', this.W / 2, this.H / 2 - 10);

    ctx.font      = '20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Tap / Space to continue', this.W / 2, this.H / 2 + 38);
  }

  _drawGameOverlay() {
    const ctx = this.ctx;
    const cx  = this.W / 2;
    const cy  = this.H / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, this.W, this.H);

    // Panel
    ctx.fillStyle   = 'rgba(18,12,8,0.92)';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 3;
    ctx.roundRect(cx - 175, cy - 175, 350, 350, 22);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';

    // Game Over title
    ctx.font        = 'bold 40px "Comic Sans MS", system-ui, sans-serif';
    ctx.strokeStyle = '#800';
    ctx.lineWidth   = 4;
    ctx.strokeText('GAME OVER', cx, cy - 128);
    ctx.fillStyle   = '#FF4444';
    ctx.fillText('GAME OVER', cx, cy - 128);

    // Score
    ctx.lineWidth   = 0;
    ctx.font        = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle   = '#fff';
    ctx.fillText(`Score: ${this.score}`, cx, cy - 74);

    // Best
    ctx.font      = '22px system-ui, sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Best: ${this.bestScore}`, cx, cy - 36);

    // New High Score
    if (this.isNewBest) {
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 200);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font        = 'bold 22px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillStyle   = '#FFD700';
      ctx.fillText('🏆 NEW HIGH SCORE! 🏆', cx, cy + 4);
      ctx.restore();
    }

    // Mode info
    ctx.font      = '15px system-ui, sans-serif';
    ctx.fillStyle = this.mode === 'daily' ? '#FFD700' : 'rgba(180,180,180,0.9)';
    ctx.fillText(this.mode === 'daily' ? '📅 Daily Challenge' : '🎲 Classic Mode', cx, cy + 40);

    // Tap to retry (pulsing)
    const p2 = 0.65 + 0.35 * Math.sin(Date.now() / 500);
    ctx.save();
    ctx.globalAlpha = p2;
    ctx.font        = 'bold 20px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle   = '#fff';
    ctx.fillText('Tap to try again', cx, cy + 80);
    ctx.restore();
  }

  // Called when the screen becomes visible
  onShow() {
    if (this.state !== 'playing') {
      this.state = 'start';
      this._setShareVisible(false);
    }
  }

  // Called when navigating away
  onHide() {
    if (this.state === 'playing') this.state = 'paused';
  }
}

// ── GLOBAL INIT ──────────────────────────────────────────────
function launchFlappyGame() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('flappyScreen').classList.add('active');

  if (!window._flappyGame) {
    window._flappyGame = new FlappyGame('flappyCanvas');
  } else {
    window._flappyGame.onShow();
  }
}

function exitFlappy() {
  if (window._flappyGame) window._flappyGame.onHide();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('modeChooser').classList.add('active');
}

function launchSlashGame() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('menu').classList.add('active');
}
