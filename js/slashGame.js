'use strict';
// === CHANGE LOG ===
// Step 1 (Visuals & Polish):
// - Added sprite-sheet manifest support with safe placeholder fallbacks.
// - Added spriteSheet metadata registry so renderer classes can animate from sheets.
// Step 5 (Audio/UX/Mobile): first-play interactive tutorial + mobile touch improvements.
// Step 6 (Technical): 60 FPS pacing cap, full preload gate, and `~` debug overlay toggle.
// ============================================================
// SLASH GAME — js/slashGame.js
// Main orchestrator for Samurice Dino Slash.
// State machine: MENU → STAGE_SELECT → RUNNER → TRANSITION
// → BATTLE → STAGE_WIN/LOSE → STAGE_SELECT
//
// Keeps Dino Dash (game.js) 100% untouched.
// Overrides launchSlashGame() from game.js.
// ============================================================
// Canvas screens that hold more than one screenful. Each names the property
// its scroll offset lives on; `_bindMenuScroll` reads this to decide whether
// a drag or a wheel means anything on the current screen.
const SCROLLABLE = {
  achievements: '_achScroll',
  shop:         '_shopScroll',
};

// ── Sprite manifest ──────────────────────────────────────────
// All slash-game sprites live in assets/sprites/ and assets/dinosaurs/.
// Dino Dash originals remain at assets/*.png (game.js untouched).
const SLASH_SPRITES = {
  // ── Riku animation frames ─────────────────────────────────
  'riku-idle': 'assets/sprites/riku-idle.webp',
  'riku-walk-1': 'assets/sprites/riku-walk-1.webp',
  'riku-walk-2': 'assets/sprites/riku-walk-2.webp',
  'riku-walk-3': 'assets/sprites/riku-walk-3.webp',
  'riku-walk-4': 'assets/sprites/riku-walk-4.webp',
  'riku-run': 'assets/sprites/riku-run.webp', // attack/run pose
  'riku-jump': 'assets/sprites/riku-jump-1.webp', // alias
  'riku-jump-1': 'assets/sprites/riku-jump-1.webp',
  'riku-hurt': 'assets/sprites/riku-hurt.webp',
  'riku-victory': 'assets/sprites/riku-victory.webp',
  // ── Runner entities & tiles ──────────────────────────────
  'checkpoint-flag': 'assets/sprites/checkpoint-flag.webp',
  'flying-enemy': 'assets/sprites/flying-enemy.webp',
  'spring-pad': 'assets/sprites/spring-pad.webp',
  'tile-dojo': 'assets/sprites/tile-dojo.webp',
  'tile-rice': 'assets/sprites/tile-rice.webp',
  // ── Minion dino ───────────────────────────────────────────
  'minion-dino': 'assets/sprites/dino-minion.webp',
  'dino-minion': 'assets/sprites/dino-minion.webp',
  // ── Runner enemy variants ─────────────────────────────────
  'shell-dino': 'assets/sprites/shell-dino.webp',
  'shell-dino-shell': 'assets/sprites/shell-dino-shell.webp',
  'spiny-dino': 'assets/sprites/spiny-dino.webp',
  'bomb-minion': 'assets/sprites/bomb-minion.webp',
  // ── Mini-bosses: unique named characters (worlds 1–2) ─────
  'sound-sprout': 'assets/dinosaurs/sound-sprout.webp',
  'echo-imp': 'assets/dinosaurs/echo-imp.webp',
  'rhyme-sprite': 'assets/dinosaurs/rhyme-sprite.webp',
  'glyph-goblin': 'assets/dinosaurs/glyph-goblin.webp',
  'paddy-pup': 'assets/dinosaurs/paddy-pup.webp',
  'bamboo-bub': 'assets/dinosaurs/bamboo-bub.webp',
  'reed-raptor': 'assets/dinosaurs/reed-raptor.webp',
  'dojo-dino': 'assets/dinosaurs/dojo-dino.webp',
  // ── Mini-bosses: per-world dinos with attack/hurt variants ─
  'mini-w1': 'assets/dinosaurs/mini-w1.webp',
  'mini-w1-attack': 'assets/dinosaurs/mini-w1-attack.webp',
  'mini-w1-hurt': 'assets/dinosaurs/mini-w1-hurt.webp',
  'mini-w2': 'assets/dinosaurs/mini-w2.webp',
  'mini-w2-attack': 'assets/dinosaurs/mini-w2-attack.webp',
  'mini-w2-hurt': 'assets/dinosaurs/mini-w2-hurt.webp',
  'mini-w3': 'assets/dinosaurs/mini-w3.webp',
  'mini-w3-attack': 'assets/dinosaurs/mini-w3-attack.webp',
  'mini-w3-hurt': 'assets/dinosaurs/mini-w3-hurt.webp',
  'mini-w4': 'assets/dinosaurs/mini-w4.webp',
  'mini-w4-attack': 'assets/dinosaurs/mini-w4-attack.webp',
  'mini-w4-hurt': 'assets/dinosaurs/mini-w4-hurt.webp',
  'mini-w5': 'assets/dinosaurs/mini-w5.webp',
  'mini-w5-attack': 'assets/dinosaurs/mini-w5-attack.webp',
  'mini-w5-hurt': 'assets/dinosaurs/mini-w5-hurt.webp',
  'mini-w6': 'assets/dinosaurs/mini-w6.webp',
  'mini-w6-attack': 'assets/dinosaurs/mini-w6-attack.webp',
  'mini-w6-hurt': 'assets/dinosaurs/mini-w6-hurt.webp',
  // ── Shop equipment & reward icons ─────────────────────────
  'item-sword-basic': 'assets/items/sword-basic.webp',
  'item-sword-golden': 'assets/items/sword-golden.webp',
  'item-sword-fire': 'assets/items/sword-fire.webp',
  'item-sword-ice': 'assets/items/sword-ice.webp',
  'item-sword-thunder': 'assets/items/sword-thunder.webp',
  'item-sword-rainbow': 'assets/items/sword-rainbow.webp',
  'item-hat-ninja': 'assets/items/hat-ninja.webp',
  'item-hat-crown': 'assets/items/hat-crown.webp',
  'item-hat-mushroom': 'assets/items/hat-mushroom.webp',
  'item-hat-star': 'assets/items/hat-star.webp',
  'item-comp-baby-rex': 'assets/items/comp-baby-rex.webp',
  'item-comp-duck': 'assets/items/comp-duck.webp',
  'item-comp-koi': 'assets/items/comp-koi.webp',
  'item-comp-panda': 'assets/items/comp-panda.webp',
  'item-pu-magnet': 'assets/items/pu-magnet.webp',
  'item-pu-timeslow': 'assets/items/pu-timeslow.webp',
  'item-pu-autoblend': 'assets/items/pu-autoblend.webp',
  'item-pu-dbljump': 'assets/items/pu-dbljump.webp',
  'item-pu-shield': 'assets/items/pu-shield.webp',
  'power-echo-ears': 'assets/items/power-echo-ears.svg',
  'power-rice-rocket': 'assets/items/power-rice-rocket.svg',
  'power-rhyme-cape': 'assets/items/power-rhyme-cape.svg',
  'power-glyph-boots': 'assets/items/power-glyph-boots.svg',
  'power-boss-star': 'assets/items/power-boss-star.svg',
  'medal-unlocked': 'assets/items/medal-unlocked.webp',
  'medal-locked': 'assets/items/medal-locked.webp',
  // ── Battle arena backgrounds (per world) ──────────────────
  'arena-1': 'assets/backgrounds/arena-1.jpg',
  'arena-2': 'assets/backgrounds/arena-2.jpg',
  'arena-3': 'assets/backgrounds/arena-3.jpg',
  'arena-4': 'assets/backgrounds/arena-4.jpg',
  'arena-5': 'assets/backgrounds/arena-5.jpg',
  'arena-6': 'assets/backgrounds/arena-6.jpg',
  // ── Stage bosses ──────────────────────────────────────────
  'stage-1-rex': 'assets/dinosaurs/trex.webp',
  'stage-1-tri': 'assets/dinosaurs/triceratops.webp',
  'stage-2-rapi': 'assets/dinosaurs/velociraptor.webp',
  'stage-2-stego': 'assets/dinosaurs/stegosaurus.webp',
  'stage-3-brachio':'assets/dinosaurs/brachiosaurus.webp',
  'stage-3-ptera': 'assets/dinosaurs/pteranodon.webp',
  'stage-4-anky': 'assets/dinosaurs/ankylosaurus.webp',
  'stage-5-spino': 'assets/dinosaurs/spinosaurus.webp',
  'stage-5-pachy': 'assets/dinosaurs/pachycephalosaurus.webp',
  'stage-6-dilo': 'assets/dinosaurs/dilophosaurus.webp',
  // ── Boss variants ────────────────────────────────────────
  'trex-attack': 'assets/dinosaurs/trex-attack.webp',
  'trex-hurt': 'assets/dinosaurs/trex-hurt.webp',
  'triceratops-attack': 'assets/dinosaurs/triceratops-attack.webp',
  'triceratops-hurt': 'assets/dinosaurs/triceratops-hurt.webp',
  'velociraptor-attack': 'assets/dinosaurs/velociraptor-attack.webp',
  'velociraptor-hurt': 'assets/dinosaurs/velociraptor-hurt.webp',
  'stegosaurus-attack': 'assets/dinosaurs/stegosaurus-attack.webp',
  'stegosaurus-hurt': 'assets/dinosaurs/stegosaurus-hurt.webp',
  'brachiosaurus-attack': 'assets/dinosaurs/brachiosaurus-attack.webp',
  'brachiosaurus-hurt': 'assets/dinosaurs/brachiosaurus-hurt.webp',
  'pteranodon-attack': 'assets/dinosaurs/pteranodon-attack.webp',
  'pteranodon-hurt': 'assets/dinosaurs/pteranodon-hurt.webp',
  'ankylosaurus-attack': 'assets/dinosaurs/ankylosaurus-attack.webp',
  'ankylosaurus-hurt': 'assets/dinosaurs/ankylosaurus-hurt.webp',
  'spinosaurus-attack': 'assets/dinosaurs/spinosaurus-attack.webp',
  'spinosaurus-hurt': 'assets/dinosaurs/spinosaurus-hurt.webp',
  'pachycephalosaurus-attack': 'assets/dinosaurs/pachycephalosaurus-attack.webp',
  'pachycephalosaurus-hurt': 'assets/dinosaurs/pachycephalosaurus-hurt.webp',
  'dilophosaurus-attack': 'assets/dinosaurs/dilophosaurus-attack.webp',
  'dilophosaurus-hurt': 'assets/dinosaurs/dilophosaurus-hurt.webp',
  // ── Stage backgrounds (.jpg) ──────────────────────────────
  'stage-1-rice-paddy': 'assets/backgrounds/stage-1.jpg',
  'stage-2-bamboo': 'assets/backgrounds/stage-2.jpg',
  'stage-3-cherry-temple': 'assets/backgrounds/stage-3.jpg',
  'stage-4-ruins': 'assets/backgrounds/stage-4.jpg',
  'stage-5-mountain-terraces':'assets/backgrounds/stage-5.jpg',
  'stage-6-volcanic': 'assets/backgrounds/stage-6.jpg',
  'bonus-training': 'assets/backgrounds/bonus.jpg',
  'victory-golden-harvest': 'assets/backgrounds/victory.jpg',
};


// Preload only startup-critical sprites before leaving loading screen.
// Non-critical assets continue streaming in the background.
const CRITICAL_SPRITE_KEYS = new Set([
  // Keep startup gate intentionally small so players can begin quickly.
  // Non-critical stage content continues loading in the background.
  'riku-idle', 'riku-walk-1', 'riku-walk-2', 'riku-walk-3', 'riku-walk-4',
  'riku-run', 'riku-jump', 'riku-jump-1', 'riku-hurt',
  'dino-minion', 'flying-enemy', 'tile-dojo', 'tile-rice',
  // Stage 1 first-play assets
  'stage-1-rice-paddy', 'stage-1-rex', 'trex-attack', 'trex-hurt', 'stage-1-tri',
]);

// Sprite sheets for animated canvas entities. These are optional and gracefully
// fall back to existing per-frame sprites if files are missing.
const SLASH_SPRITE_SHEETS = {
  // Optional sheet assets were removed from the repo; keep this empty so we
  // don't issue 404s for non-existent files on startup.
};
// ─────────────────────────────────────────────────────────────
// PERFORMANCE
// ─────────────────────────────────────────────────────────────
// shadowBlur is the single most expensive canvas state on mobile GPUs.
// Patch the prototype once so the active quality tier caps glow radius for the
// whole app — shadowBlur is one of the most expensive things Canvas2D can do,
// and this avoids editing the ~120 call sites that set it.
(function () {
  if (window.__shadowPatched) return;
  window.__shadowPatched = true;
  try {
    const proto = CanvasRenderingContext2D.prototype;
    const desc  = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, 'shadowBlur', {
      configurable: true,
      get: desc.get,
      set(v) {
        const cap = window.Quality ? window.Quality.flags.shadowBlurMax
                                   : (window.LOW_FX ? 0 : 16);
        desc.set.call(this, Math.min(v, cap));
      },
    });
  } catch (_) { /* leave shadows untouched if the platform disallows this */ }
})();

// ─────────────────────────────────────────────────────────────
// SLASH GAME
// ─────────────────────────────────────────────────────────────
class SlashGame {
  constructor(canvasId, overlayId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.overlay = document.getElementById(overlayId);
    // DPR above 2 quadruples fill cost for no visible gain on phones, and
    // lower tiers render below native and let the browser upscale.
    this._dpr = Math.min(window.devicePixelRatio || 1,
                         window.Quality ? window.Quality.flags.maxDpr : 2);
    // Re-resolution when the tier changes, so a device that speeds up or slows
    // down mid-session gets the sharpness or the headroom straight away.
    if (window.Quality) {
      window.Quality.onChange(() => {
        this._dpr = Math.min(window.devicePixelRatio || 1, window.Quality.flags.maxDpr);
        if (this._resizeCanvas) this._resizeCanvas();
      });
    }
    this._setupCanvas();
    // Global modules
    // One AudioManager for the whole app (shared with Dino Dash):
    // a single AudioContext, mute state and volume settings everywhere.
    if (!window._sharedAudio) window._sharedAudio = new AudioManager();
    this.audio = window._sharedAudio;
    // Share one tracker with the home-screen engagement UI / dashboard
    if (!window._progressTracker) window._progressTracker = new ProgressTracker();
    this.progress = window._progressTracker;
    this.sprites = {};
    this.spriteSheets = {};
    this._spritesReady = false;
    this._sheetsReady = false;
    this._audioReady = false;
    // PHASE 6: preloader progress tracking
    this._loadProgress = { loaded: 0, total: 0 };
    this._loadMsgs = [
      "Sharpening Riku's sword…",
      'Waking up the dinos…',
      'Gathering rice grains…',
      'Polishing the DinoGates…',
      'Teaching Riku new phonics tricks…',
      'Preparing word battles…',
    ];
    this._loadMsgIdx = 0;
    this._loadMsgAge  = 0;
    this._targetFrameMs = 1000 / 60;
    this._fpsSamples = [];
    this._debugOverlay = false;
    // State
    // Opens straight on the mode picker: index.html's title screen is the
    // game's title screen, and a second canvas one behind it was a redundant
    // tap on the way in.
    this.state = 'mode-select'; // mode-select | menu | stage-select | world-map | runner | transition | battle | stage-win | stage-lose | endless-runner | endless-battle | endless-gameover | shop | daily | achievements | leaderboard
    this.stageId = 1;
    this._age = 0;
    this._transFrames = 0;
    this._transMsg = '';
    this._stateEntryFade = 1.0;  // start with fade-in from title
    this._stageStartedAt = 0;
    this._lastRunnerHp = null;
    this._stageWinMastery = null;
    this._battleResults   = null;  // Phase 8: summary captured before battle destroy
    this._brStars         = null;  // Phase 8: star-field particles for results card
    this._tutorial = null; // first-play interactive runner tutorial
    // World map animation
    this._mapPlayerPos = null; // { x, y } animated player dot on map
    this._mapAnim = 0; // age for map animations
    // Sub-engines (created/destroyed per phase)
    this.runner = null;
    this.battle = null;
    // Input for menus
    // One cache slot per screen: UI.scene keys its cache but hangs it on the
    // holder, so screens sharing a holder would evict each other every frame.
    this._sceneHolders = { modeSelect: {}, stageSelect: {}, shop: {},
                           achievements: {}, leaderboard: {}, win: {},
                           reviewDone: {}, endlessOver: {}, daily: {} };
    this._menuSel = 0;   // selected stage within the open world (stage-select)
    this._worldSel = 0;  // selected world (world-map)
    this._bindMenuInput();
    // Load sprites then kick off background audio preload.
    // Audio readiness is NOT a gate — the game uses tone-synthesis + TTS fallbacks
    // immediately, so buffers streaming in the background is sufficient. This removes
    // a multi-second loading-screen stall on slower mobile connections.
    this._audioReady = true;
    this._loadSprites();
    if (this.audio.preloadAllGameAudio) this.audio.preloadAllGameAudio(); // background only
    // RAF loop
    this._loop = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }
  // ── Canvas ───────────────────────────────────────────────────
  _setupCanvas() {
    const dpr = this._dpr;
    const wrap = this.canvas.parentElement;
    const resize = () => {
      const W = wrap.clientWidth || 480;
      const H = wrap.clientHeight || 700;
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = W;
      this.H = H;
      // Propagate new dimensions to all active sub-engines so draw calls
      // use the correct logical size after orientation change or resize.
      if (this.battle)        { this.battle.W = W;        this.battle.H = H;        }
      if (this.runner)        { this.runner.W = W;        this.runner.H = H;        }
      if (this.endlessRunner) { this.endlessRunner.W = W; this.endlessRunner.H = H; }
      if (this.endlessBattle) { this.endlessBattle.W = W; this.endlessBattle.H = H; }
    };
    resize();
    this._resizeCanvas = resize;
    window.addEventListener('resize', resize);
    // Fullscreen change: browser needs two frames to finish expanding.
    // Fire resize after both frames so canvas picks up the new viewport size.
    const onFsChange = () => {
      requestAnimationFrame(() => { requestAnimationFrame(resize); });
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }
  // ── Sprite loading ───────────────────────────────────────────
  _loadSprites() {
    const entries      = Object.entries(SLASH_SPRITES);
    const sheetEntries = Object.entries(SLASH_SPRITE_SHEETS);
    // PHASE 6: track total across sprites + sheets for progress bar
    this._loadProgress.total  = entries.length + sheetEntries.length;
    this._loadProgress.loaded = 0;
    const _tick = () => { this._loadProgress.loaded++; };

    let criticalLoaded = 0;
    const criticalTotal = entries.reduce((n, [key]) => n + (CRITICAL_SPRITE_KEYS.has(key) ? 1 : 0), 0);
    this._spritesReady = criticalTotal === 0;
    entries.forEach(([key, url]) => {
      const img = new Image();
      const done = () => {
        _tick();
        if (CRITICAL_SPRITE_KEYS.has(key)) {
          criticalLoaded++;
          if (criticalLoaded >= criticalTotal) this._spritesReady = true;
        }
      };

      // Retry failed image loads a couple of times (with cache-busting) so
      // transient CDN/network hiccups don't permanently lock gameplay actors
      // (bosses, minions, attack poses) into procedural fallback art.
      let attempts = 0;
      const maxAttempts = 3;
      const loadAttempt = () => {
        attempts++;
        img.src = attempts === 1 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}-${attempts}`;
      };

      img.onload = done;
      img.onerror = () => {
        if (attempts < maxAttempts) {
          loadAttempt();
          return;
        }
        // Keep engine resilient if a specific asset is truly unavailable.
        if (key === 'minion-dino' && this.sprites['dino-minion']) this.sprites[key] = this.sprites['dino-minion'];
        if (key === 'dino-minion' && this.sprites['minion-dino']) this.sprites[key] = this.sprites['minion-dino'];
        if (key === 'riku-run' && this.sprites['riku-idle']) this.sprites[key] = this.sprites['riku-idle'];
        done();
      };

      loadAttempt();
      this.sprites[key] = img;
    });

    // Load optional sprite sheets. Missing files are replaced by generated
    // placeholder sheets so animation code can run without runtime branching.
    let loadedSheets = 0;
    this._sheetsReady = sheetEntries.length === 0;
    const onSheetDone = () => {
      _tick();
      loadedSheets++;
      if (loadedSheets >= sheetEntries.length) this._sheetsReady = true;
    };
    sheetEntries.forEach(([id, meta]) => {
      const img = new Image();
      img.onload = () => { this.spriteSheets[id] = { ...meta, image: img, placeholder: false }; onSheetDone(); };
      img.onerror = () => {
        const ph = this._buildSheetPlaceholder(meta.frameW, meta.frameH, id);
        this.spriteSheets[id] = { ...meta, image: ph, placeholder: true };
        onSheetDone();
      };
      img.src = meta.url;
    });
  }

  // Procedural fallback sheet to keep game playable when sprite sheets are absent.
  _buildSheetPlaceholder(frameW, frameH, label) {
    const c = document.createElement('canvas');
    c.width = frameW * 4;
    c.height = frameH * 3;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1f29';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < c.height; y += frameH) {
      for (let x = 0; x < c.width; x += frameW) {
        g.strokeStyle = 'rgba(255,255,255,0.24)';
        g.strokeRect(x + 2, y + 2, frameW - 4, frameH - 4);
      }
    }
    g.fillStyle = '#ffd54f';
    g.font = `bold ${Math.max(14, Math.floor(frameH * 0.11))}px system-ui`;
    g.textAlign = 'center';
    g.fillText(`${label} missing`, c.width / 2, c.height / 2);
    return c;
  }
  // ── Loading screen — PHASE 6: rice-grain progress bar ────────
  _drawLoading() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const t = this._age;

    ctx.clearRect(0, 0, W, H);

    // ── Background: deep forest gradient ──────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040c18');
    bg.addColorStop(0.55, '#0a1e3a');
    bg.addColorStop(1, '#0a2010');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Floating rice grain particles (atmospheric) ────────────
    const grainSeeds = [0.08,0.22,0.38,0.54,0.68,0.82,0.14,0.46,0.76,0.92];
    grainSeeds.forEach((s, i) => {
      const speed = 0.35 + s * 0.25;
      const gx    = W * s;
      const gy    = ((H + 80) - ((t * speed * 0.7 + i * (H / grainSeeds.length) * 1.1) % (H + 100)));
      ctx.save();
      ctx.globalAlpha = 0.12 + s * 0.18;
      ctx.fillStyle   = '#FFD700';
      ctx.translate(gx, gy);
      ctx.rotate(-0.35 + s * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // ── Riku character (sprite or procedural fallback) ─────────
    const rikuSize = Math.min(W * 0.22, 108);
    const rikuX   = W / 2;
    const rikuY   = H * 0.30;
    const bob     = Math.sin(t * 0.09) * 9;
    const rikuSpr = this.sprites['riku-idle'] || this.sprites['riku-walk-1'] || this.sprites['riku-run'];
    if (rikuSpr && rikuSpr.complete && rikuSpr.naturalWidth > 0) {
      ctx.save();
      ctx.translate(rikuX, rikuY + bob);
      ctx.drawImage(rikuSpr, -rikuSize / 2, -rikuSize / 2, rikuSize, rikuSize);
      ctx.restore();
    } else {
      // Procedural fallback: simple chibi silhouette
      ctx.save();
      ctx.translate(rikuX, rikuY + bob);
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(0, -rikuSize * 0.27, rikuSize * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FF6F00';
      ctx.fillRect(-rikuSize * 0.11, -rikuSize * 0.1, rikuSize * 0.22, rikuSize * 0.34);
      ctx.restore();
    }

    // ── Title ─────────────────────────────────────────────────
    const titleSz = Math.min(W * 0.075, 34);
    ctx.font        = `900 ${titleSz}px "Nunito", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,180,0,0.6)';
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = '#FFD700';
    ctx.fillText('🍚 Loading…', W / 2, H * 0.51);
    ctx.shadowBlur  = 0;

    // ── Progress bar ──────────────────────────────────────────
    const pct  = this._loadProgress.total > 0
      ? Math.min(1, this._loadProgress.loaded / this._loadProgress.total)
      : (t % 120) / 120; // animated pulse fallback
    const barW = Math.min(W * 0.74, 380);
    const barH = 26;
    const barX = W / 2 - barW / 2;
    const barY = H * 0.60;

    // Track (outer shell)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(barX - 3, barY - 3, barW + 6, barH + 6, 17); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 14); ctx.fill();

    // Fill
    if (pct > 0.01) {
      const fillW = Math.max(barH, barW * pct);
      const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
      barGrad.addColorStop(0,   '#E65100');
      barGrad.addColorStop(0.45,'#FFD700');
      barGrad.addColorStop(1,   '#FFEE58');
      ctx.fillStyle = barGrad;
      ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH, 14); ctx.fill();

      // Shine overlay on fill
      const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
      shine.addColorStop(0,   'rgba(255,255,255,0.28)');
      shine.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH / 2, [14,14,0,0]); ctx.fill();

      // Rice grain texture inside fill
      const grainCount = Math.floor(fillW / 16);
      for (let i = 0; i < grainCount; i++) {
        const gx = barX + 9 + i * 16;
        const gy = barY + barH / 2;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle   = '#fff';
        ctx.translate(gx, gy); ctx.rotate(-0.35);
        ctx.beginPath(); ctx.ellipse(0, 0, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // Leading edge glow
    if (pct > 0.02 && pct < 0.99) {
      const ex = barX + barW * pct;
      const eglow = ctx.createRadialGradient(ex, barY + barH / 2, 0, ex, barY + barH / 2, 18);
      eglow.addColorStop(0,   'rgba(255,235,80,0.7)');
      eglow.addColorStop(1,   'rgba(255,200,0,0)');
      ctx.fillStyle = eglow;
      ctx.beginPath(); ctx.arc(ex, barY + barH / 2, 18, 0, Math.PI * 2); ctx.fill();
    }

    // ── Percentage label ──────────────────────────────────────
    const pctTxt = Math.round(pct * 100) + '%';
    ctx.font     = `bold ${Math.min(W * 0.042, 18)}px "Nunito", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(pctTxt, W / 2, barY + barH + 10);

    // ── Rotating fun messages ─────────────────────────────────
    this._loadMsgAge = (this._loadMsgAge || 0) + 1;
    if (this._loadMsgAge > 100) {
      this._loadMsgAge = 0;
      this._loadMsgIdx = (this._loadMsgIdx + 1) % this._loadMsgs.length;
    }
    const msgFade = this._loadMsgAge < 12
      ? this._loadMsgAge / 12
      : this._loadMsgAge > 88 ? (100 - this._loadMsgAge) / 12 : 1;
    ctx.save();
    ctx.globalAlpha = msgFade * 0.75;
    ctx.font = `italic ${Math.min(W * 0.036, 16)}px "Nunito", sans-serif`;
    ctx.fillStyle   = '#FFECB3';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this._loadMsgs[this._loadMsgIdx], W / 2, barY + barH + 34);
    ctx.restore();
  }
  // ── Menu input (keyboard) ─────────────────────────────────────
  _bindMenuInput() {
    this._menuKd = (e) => {
      // PHASE 6: forward arrow / enter / escape keys to onboarding tutorial
      if (this.state === 'onboarding' && this._onboardingTutorial) {
        if (this._onboardingTutorial.handleKey(e.key)) { e.preventDefault(); return; }
      }
      // Step 6 debug overlay toggle (` or ~)
      if (e.key === '`' || e.key === '~') { this._debugOverlay = !this._debugOverlay; return; }
      if (this.state === 'world-map') {
        const wc = PHONICS_DATA.worldCount;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this._worldSel = Math.min(wc - 1, this._worldSel + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this._worldSel = Math.max(0, this._worldSel - 1);
        if (e.key === 'Enter' || e.key === ' ') this._openWorld(this._worldSel);
      } else if (this.state === 'stage-select') {
        const ids = PHONICS_DATA.stagesInWorld(this._worldSel + 1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this._menuSel = Math.min(ids.length - 1, this._menuSel + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this._menuSel = Math.max(0, this._menuSel - 1);
        if (e.key === 'Enter' || e.key === ' ') {
          const gid = ids[this._menuSel];
          if (gid && this.progress.isUnlocked(gid)) this._launchStage(gid);
        }
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') this.state = 'world-map';
      }
      if (this.state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
        this.state = 'world-map';
      }
    };
    document.addEventListener('keydown', this._menuKd);
    // Canvas click → menu interaction
    this._canvasClick = (e) => {
      // A touch fires touchstart and then, ~300ms later, a synthetic click
      // at the same point. Both used to be handled, so every tap on a menu
      // acted twice: once on the screen you tapped, once on whatever
      // replaced it.
      if (performance.now() - (this._lastTouchAt || 0) < 700) return;
      if (this._swallowClick) { this._swallowClick = false; return; }
      const rect = this.canvas.getBoundingClientRect();
      this._handleCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
    };
    this._canvasTap = (e) => {
      if (e.touches.length === 0) return;
      this._lastTouchAt = performance.now();
      if (this._swallowClick) { this._swallowClick = false; return; }
      const rect = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this._handleCanvasClick(t.clientX - rect.left, t.clientY - rect.top);
    };
    this.canvas.addEventListener('click', this._canvasClick);
    this.canvas.addEventListener('touchstart', this._canvasTap, { passive: true });

    this._bindMenuScroll();

    // ── Page Visibility auto-pause ──────────────────────────
    this._visibilityHandler = () => {
      if (document.hidden) this._autoPauseOnHidden();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }
  /**
   * Drag- and wheel-scrolling for the long canvas screens.
   *
   * Achievements, the shop and the dashboard all read a scroll offset when
   * drawing, and nothing ever wrote to one — so with eighteen achievements
   * in a list that shows nine, half of them were simply unreachable. Same
   * for the lower shop tabs and everything past the fifth stage card.
   *
   * The offset lives on the game (one per screen) and the drawing code
   * publishes how far it may travel as `_scrollMax` each frame, which keeps
   * the clamp honest when the list length or the window size changes.
   */
  _bindMenuScroll() {
    const prop = () => SCROLLABLE[this.state] || null;

    this._menuWheel = (e) => {
      const k = prop();
      if (!k) return;
      e.preventDefault();
      this._scrollBy(k, e.deltaY);
    };
    this.canvas.addEventListener('wheel', this._menuWheel, { passive: false });

    let dragging = false, lastY = 0, moved = 0;
    const start = (y) => {
      if (!prop()) return;
      dragging = true; lastY = y; moved = 0;
    };
    const move = (y) => {
      const k = prop();
      if (!dragging || !k) return;
      const dy = lastY - y;
      lastY = y;
      moved += Math.abs(dy);
      this._scrollBy(k, dy);
      // Past a few pixels this is a scroll, not a tap, and the click that
      // ends it must not also press whatever is under the finger.
      if (moved > 6) this._swallowClick = true;
    };
    const end = () => { dragging = false; };

    this._menuDown = (e) => start(e.clientY);
    this._menuMove = (e) => move(e.clientY);
    this._menuUp = end;
    this._menuTouchStart = (e) => { if (e.touches[0]) start(e.touches[0].clientY); };
    this._menuTouchMove = (e) => {
      if (!e.touches[0] || !prop()) return;
      e.preventDefault();
      move(e.touches[0].clientY);
    };
    this.canvas.addEventListener('mousedown', this._menuDown);
    window.addEventListener('mousemove', this._menuMove);
    window.addEventListener('mouseup', this._menuUp);
    this.canvas.addEventListener('touchstart', this._menuTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this._menuTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._menuTouchEnd = end, { passive: true });
  }

  _scrollBy(key, dy) {
    const max = this._scrollMax || 0;
    this[key] = Math.max(0, Math.min(max, (this[key] || 0) + dy));
  }

  /**
   * Draw a list inside a window, clipped, with a hint at each end when
   * there is more to see. Returns the visible band so the caller can lay
   * rows out against it.
   */
  _scrollWindow(ctx, key, top, bottom, contentH, draw) {
    const viewH = Math.max(0, bottom - top);
    this._scrollMax = Math.max(0, contentH - viewH);
    this[key] = Math.max(0, Math.min(this._scrollMax, this[key] || 0));
    const scroll = this[key];

    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, this.W, viewH); ctx.clip();
    draw(scroll, top, viewH);
    ctx.restore();

    // Fades, so a cut-off row reads as "there is more" rather than as a
    // rendering glitch.
    const fade = (y0, y1, from) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, from); g.addColorStop(1, 'rgba(10,6,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(y0, y1), this.W, Math.abs(y1 - y0));
    };
    if (scroll > 2) fade(top, top + 22, 'rgba(10,6,12,0.85)');
    if (scroll < this._scrollMax - 2) fade(bottom, bottom - 26, 'rgba(10,6,12,0.9)');
    return { scroll, viewH };
  }

  _handleCanvasClick(mx, my) {
    // Soft UI tap sound on menu-style screens (gameplay has its own SFX)
    const MENU_STATES = new Set(['mode-select','menu','stage-select','world-map',
                                 'shop','daily','achievements','leaderboard','stage-win','stage-lose',
                                 'review-done']);
    if (MENU_STATES.has(this.state)) this.audio?.sfxClick?.();
    // PHASE 6: onboarding tutorial click routing
    if (this.state === 'onboarding' && this._onboardingTutorial) {
      this._onboardingTutorial.handleClick(mx, my);
      return;
    }
    // Phase 8: tap anywhere on battle-results screen to skip ahead
    if (this.state === 'battle-results') {
      this._advanceToStageWin();
      return;
    }
    // ── Paused overlay touch targets ───────────────────────────
    // Check runner pause overlay buttons before any state dispatch.
    if (this.state === 'runner' && this.runner?._paused) {
      const rr = this.runner._pauseResumeBtnRect;
      const rq = this.runner._pauseQuitBtnRect;
      if (rr && mx >= rr.x && mx <= rr.x+rr.w && my >= rr.y && my <= rr.y+rr.h) {
        this.runner._togglePause(); return;
      }
      if (rq && mx >= rq.x && mx <= rq.x+rq.w && my >= rq.y && my <= rq.y+rq.h) {
        this.runner._paused = false; this.runner = null;
        this._hidePauseBtn(); this._hideDpad();
        this.audio.stopMusic(); this.state = 'world-map'; return;
      }
      return; // swallow all other taps while paused
    }
    if (this.state === 'endless-runner' && this.endlessRunner?._paused) {
      const rr = this.endlessRunner._pauseResumeBtnRect;
      const rq = this.endlessRunner._pauseQuitBtnRect;
      if (rr && mx >= rr.x && mx <= rr.x+rr.w && my >= rr.y && my <= rr.y+rr.h) {
        this.endlessRunner._togglePause(); return;
      }
      if (rq && mx >= rq.x && mx <= rq.x+rq.w && my >= rq.y && my <= rq.y+rq.h) {
        this.endlessRunner._paused = false; this._stopEndlessRunner();
        this._hidePauseBtn(); this.audio.stopMusic(); this.state = 'mode-select'; return;
      }
      return;
    }
    if (this.state === 'review' && this.review?._paused) {
      const rr = this.review._pauseResumeBtnRect;
      const rq = this.review._pauseQuitBtnRect;
      if (rr && mx >= rr.x && mx <= rr.x+rr.w && my >= rr.y && my <= rr.y+rr.h) {
        this.review._togglePause(); return;
      }
      if (rq && mx >= rq.x && mx <= rq.x+rq.w && my >= rq.y && my <= rq.y+rq.h) {
        this.review._stopBlendTimer(); this.review._paused = false; this.review = null;
        this._hidePauseBtn(); this.overlay.classList.add('hidden'); this.overlay.innerHTML = '';
        this.audio.stopMusic(); this.state = 'mode-select'; return;
      }
      return;
    }
    if (this.state === 'battle' && this.battle?._paused) {
      const rr = this.battle._pauseResumeBtnRect;
      const rq = this.battle._pauseQuitBtnRect;
      if (rr && mx >= rr.x && mx <= rr.x+rr.w && my >= rr.y && my <= rr.y+rr.h) {
        this.battle._togglePause(); return;
      }
      if (rq && mx >= rq.x && mx <= rq.x+rq.w && my >= rq.y && my <= rq.y+rq.h) {
        this.battle._stopBlendTimer(); this.battle._paused = false; this.battle = null;
        this._hidePauseBtn(); this.overlay.classList.add('hidden'); this.overlay.innerHTML = '';
        this.audio.stopMusic(); this.state = 'world-map'; return;
      }
      return;
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
    if (this.state === 'review-done') { this._clickReviewDone(mx, my); return; }
    if (this.state === 'menu') {
      this.state = 'world-map';
      return;
    }
    if (this.state === 'stage-select') {
      // Back to world map
      const bb = this._stageBackRect;
      if (bb && mx >= bb.x && mx <= bb.x + bb.w && my >= bb.y && my <= bb.y + bb.h) {
        this.state = 'world-map';
        return;
      }
      // Relaxed mode toggle (top-right button)
      const rt = this._relaxedToggleRect;
      if (rt && mx >= rt.x && mx <= rt.x + rt.w && my >= rt.y && my <= rt.y + rt.h) {
        const next = localStorage.getItem('samurice_relaxed') === '1' ? '0' : '1';
        localStorage.setItem('samurice_relaxed', next);
        return;
      }
      const ids = PHONICS_DATA.stagesInWorld(this._worldSel + 1);
      const cards = this._stageCardRects || [];
      cards.forEach((r, i) => {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          const gid = ids[i];
          if (gid && this.progress.isUnlocked(gid)) {
            this._menuSel = i;
            this._launchStage(gid);
          }
        }
      });
      return;
    }
    if (this.state === 'world-map') {
      // ENTER WORLD button in info panel
      const pb = this._mapPlayBtnRect;
      if (pb && mx >= pb.x && mx <= pb.x + pb.w && my >= pb.y && my <= pb.y + pb.h) {
        this._openWorld(this._worldSel);
        return;
      }
      // World nodes on map
      const nodes = this._mapNodeRects || [];
      nodes.forEach((n, i) => {
        const dx = mx - n.cx;
        const dy = my - n.cy;
        if (dx * dx + dy * dy <= n.r * n.r) {
          this._worldSel = i;
          const world = PHONICS_DATA.WORLDS[i];
          if (world && this.progress.isUnlocked(world.startId)) {
            this._openWorld(i);
          } else {
            // Locked-node feedback: wobble + "locked" toot
            this._lockedShake = { i, frames: 22 };
            this.audio?.sfxWrongBlend?.();
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
  // Index of the furthest world the player has unlocked (for default selection).
  _furthestUnlockedWorldIdx() {
    let idx = 0;
    PHONICS_DATA.WORLDS.forEach((w, i) => {
      if (this.progress.isUnlocked(w.startId)) idx = i;
    });
    return idx;
  }

  // ── Open a world → its stage-select screen ───────────────────
  _openWorld(worldIdx) {
    const world = PHONICS_DATA.WORLDS[worldIdx];
    if (!world) return;
    if (!this.progress.isUnlocked(world.startId)) return;   // world still locked
    this._worldSel = worldIdx;
    // Default-select the first not-yet-cleared (but unlocked) stage in the world.
    const ids = world.stageIds;
    let sel = 0;
    for (let i = 0; i < ids.length; i++) {
      if (this.progress.isUnlocked(ids[i]) && !this.progress.getStage(ids[i])?.completedAt) { sel = i; break; }
      if (this.progress.isUnlocked(ids[i])) sel = i;
    }
    this._menuSel = sel;
    this._stateEntryFade = 1.0;
    this.state = 'stage-select';
    this.audio?.sfxSlash?.();
  }

  // ── Stage launch ─────────────────────────────────────────────
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.preview] Play a stage the player has not unlocked.
   *   Used only by shared links, so a link lands on the stage it names instead
   *   of dumping the recipient at the beginning. A preview awards nothing and
   *   unlocks nothing — see _onStageWin — so progression is untouched.
   */
  _launchStage(id, opts = {}) {
    this._previewStage = !!opts.preview;
    if (!this._previewStage && !this.progress.isUnlocked(id)) return;
    this.stageId = id;
    this._stateEntryFade = 1.0;
    this.overlay.classList.add('hidden');
    this.audio.preloadStage(id);
    this._stageStartedAt = Date.now();
    this._lastRunnerHp = null;
    this._stageWinMastery = null;
    this._battleResults   = null;
    this._brStars         = null;  // regenerate at current canvas size
    this._tutorial = null;
    // PHASE 6: show full onboarding before first-ever play of stage 1
    if (id === 1 && this.progress.shouldShowTutorial()) {
      this._startOnboarding(() => {
        this._startRunner();
        this._maybeStartTutorial();
      });
    } else {
      this._startRunner();
      this._maybeStartTutorial();
    }
  }

  // PHASE 6: full-screen onboarding tutorial (canvas-drawn)
  _startOnboarding(onComplete) {
    this._onboardingTutorial = new Tutorial(this.W, this.H, () => {
      this.progress.markTutorialComplete();
      this._onboardingTutorial = null;
      if (onComplete) onComplete();
    }, this.audio);
    this.state = 'onboarding';
  }

  _updateOnboarding() {
    if (!this._onboardingTutorial) { this.state = 'world-map'; return; }
    if (this._onboardingTutorial.isDone) { this.state = 'world-map'; return; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawOnboardingBg(ctx);
    this._onboardingTutorial.draw(ctx, this.sprites);
  }

  _drawOnboardingBg(ctx) {
    const W = this.W, H = this.H;
    const t = this._age;
    // Deep space-to-forest gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    '#03080f');
    sky.addColorStop(0.45, '#0a1c38');
    sky.addColorStop(0.72, '#0d2a12');
    sky.addColorStop(1,    '#081a09');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Twinkling stars
    const starSeeds = [0.10,0.28,0.52,0.71,0.86,0.18,0.63,0.80,0.39,0.95];
    starSeeds.forEach((s, i) => {
      const tw = 0.35 + 0.45 * Math.sin(t * 0.055 + i * 1.8);
      const sz = 1.2 + Math.sin(t * 0.04 + i * 2.3) * 0.6;
      ctx.save(); ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s * W, (0.04 + i * 0.026) * H, sz, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Silhouette bamboo stalks
    const bambooX = [0.04, 0.12, 0.82, 0.92];
    bambooX.forEach((bx, i) => {
      const sway = Math.sin(t * 0.025 + i * 0.8) * 4;
      ctx.strokeStyle = `rgba(20,60,20,${0.35 + i * 0.05})`;
      ctx.lineWidth   = 5 + i;
      ctx.beginPath(); ctx.moveTo(bx * W + sway, H); ctx.lineTo(bx * W - 8 + sway, H * 0.22); ctx.stroke();
      // Segments
      for (let seg = 0; seg < 5; seg++) {
        ctx.strokeStyle = `rgba(30,70,30,0.3)`;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(bx * W - 6 + sway, H - seg * H * 0.15); ctx.lineTo(bx * W + 6 + sway, H - seg * H * 0.15); ctx.stroke();
      }
    });

    // Dark semi-transparent overlay so tutorial card pops
    ctx.fillStyle = 'rgba(0,5,15,0.55)';
    ctx.fillRect(0, 0, W, H);
  }

  _maybeStartTutorial() {
    if (this.stageId !== 1 || !this.progress?.shouldShowTutorial?.() || !this.runner) return;
    this._tutorial = {
      active: true,
      leftSec: 30,
      step: 0,
      startedWorldX: this.runner.player.worldX,
      jumped: false,
      moved: false,
      collected: false,
    };
  }

  _updateTutorial(dt) {
    if (!this._tutorial?.active || !this.runner) return;
    const t = this._tutorial;
    t.leftSec = Math.max(0, t.leftSec - dt);
    if (!t.jumped && this.runner.player.vy < -1) { t.jumped = true; t.step = Math.max(t.step, 1); }
    if (!t.moved && (this.runner.player.worldX - t.startedWorldX) > 120) { t.moved = true; t.step = Math.max(t.step, 2); }
    if (!t.collected && this.runner.getCollectedCount() > 0) { t.collected = true; t.step = 3; }

    if ((t.jumped && t.moved && t.collected) || t.leftSec <= 0) {
      t.active = false;
      this.progress?.markTutorialComplete?.();
    }
  }

  _drawTutorialOverlay(ctx) {
    if (!this._tutorial?.active) return;
    const W = this.W;
    const t = this._tutorial;
    const hints = [
      'Tap JUMP (or swipe up) to leap!',
      'Great! Move right with ▶ to run.',
      'Collect a glowing phoneme coin.',
      'Nice! You are ready to slash dinos!'
    ];
    const panelW = Math.min(420, W - 28);
    const panelH = 78;
    const px = (W - panelW) / 2;
    const py = 66;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 14); ctx.fill();
    ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 14px "Nunito", "Comic Sans MS", system-ui';
    ctx.fillStyle = '#FFD54F';
    ctx.fillText(`📘 Tutorial (${Math.ceil(t.leftSec)}s)`, W / 2, py + 8);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#fff';
    ctx.fillText(hints[Math.min(t.step, 3)], W / 2, py + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Auto-skips when complete', W / 2, py + 50);
    ctx.restore();
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
  // ── Pause button helpers ───────────────────────────────────────
  _showPauseBtn() {
    document.getElementById('slashPauseBtn')?.classList.remove('hidden');
  }
  _hidePauseBtn() {
    document.getElementById('slashPauseBtn')?.classList.add('hidden');
  }
  // ── RUNNER PHASE ─────────────────────────────────────────────
  _startRunner() {
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.overlay.classList.remove('active');
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    this.runner = new RunnerEngine(this.canvas, stage, this.sprites, this.audio, this.W, this.H, this.spriteSheets, this.progress);
    // Wire D-pad buttons — also restore L/R visibility in case endless mode hid them
    const dL = document.getElementById('dpadLeft');
    const dR = document.getElementById('dpadRight');
    const dJ = document.getElementById('dpadJump');
    const dpadMove = document.getElementById('runnerControls')?.querySelector('.dpad-move');
    if (dpadMove) dpadMove.style.visibility = '';
    if (dL && dR && dJ) this.runner.bindDpad(dL, dR, dJ);
    this._showDpad();
    this._showPauseBtn();
    // Start stage music
    this.audio.startMusic(this.stageId);
    this.state = 'runner';
    // Nintendo 3-2-1 countdown — player needs a moment to orient
    this._runnerCountdownAge = 0;
  }
  // ── TRANSITION ───────────────────────────────────────────────
  _startTransition(msg, callback, duration = 120, showBoss = false) {
    this.state = 'transition';
    this._transMsg = msg;
    this._transFrames = duration;
    this._transDuration = duration;               // for normalized progress calc
    this._transBossStageId = showBoss ? (this.stageId || 0) : 0;  // boss cinematic only when flagged
    this._transCallback = callback;
  }
  // ── BATTLE PHASE ─────────────────────────────────────────────
  _startBattle(collectedPhonemes) {
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    this.audio.stopMusic();
    this._stateEntryFade = 0.8;
    this.overlay.classList.remove('hidden');
    this.overlay.classList.add('active');
    this.overlay.innerHTML = '';
    this._showPauseBtn();
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    this.battle = new CombatEngine(
      this.canvas, this.overlay, stage, collectedPhonemes,
      this.sprites, this.audio, this.progress, this.W, this.H,
    );
    if (this._runnerAllCoins) { this.battle.applyCoinBonus(); this._runnerAllCoins = false; }
    this.state = 'battle';
  }

  // ── DAILY REVIEW ─────────────────────────────────────────────
  // The campaign teaches a word once and moves on. This is where words come
  // back: the review ladder decides which ones are due, and they are fought
  // exactly the way they were first learned, so review is a boss fight and
  // not a worksheet.
  //
  // The session is deliberately finite. When the queue is done the game says
  // so and stops — see `_drawReviewDone`.

  /** word string -> { word, stage } for every word the campaign can teach. */
  _wordIndex() {
    if (this._wordIdx) return this._wordIdx;
    const idx = new Map();
    for (const stage of PHONICS_DATA.stageList) {
      for (const w of stage.words || []) {
        const key = String(w.word || '').toLowerCase();
        if (key && !idx.has(key)) idx.set(key, { word: w, stage });
      }
    }
    this._wordIdx = idx;
    return idx;
  }

  /** Today's due words, resolved back to playable word objects. */
  _reviewQueue() {
    const ladder = window.Review?.shared?.();
    if (!ladder) return [];
    const idx = this._wordIndex();
    const out = [];
    for (const key of ladder.todaysQueue()) {
      const hit = idx.get(key);
      if (hit) out.push(hit);
    }
    return out;
  }

  _startReview() {
    const queue = this._reviewQueue();
    if (!queue.length) { this._reviewSummary = null; this.state = 'review-done'; return; }

    if (this.runner) { this.runner.destroy(); this.runner = null; }
    this.audio.stopMusic();
    this._stateEntryFade = 0.8;
    this.overlay.classList.remove('hidden');
    this.overlay.classList.add('active');
    this.overlay.innerHTML = '';
    this._showPauseBtn();

    // The arena and the boss come from the furthest stage in the queue, so a
    // review looks like the hardest place the child has actually been.
    const home = queue.reduce((a, b) => (b.stage.id > a.stage.id ? b : a)).stage;
    // Every mechanic the queue's own stages use, so a word is reviewed with
    // the verb it was taught with.
    const activities = [...new Set(queue.flatMap(q => q.stage.activities || []))];

    const stage = {
      ...home,
      id: 0,                       // not a campaign stage: clears no progress
      name: 'Daily Review',
      bossName: `${home.bossName} (Echo)`,
      words: queue.map(q => q.word),
      activities: activities.length ? activities : ['oral-blend'],
      oneShotWords: true,          // each due word once, then the fight ends
      roundsToWin: queue.length,   // the bar is paced to land on the last word
      bossHp: 100 + queue.length * 10,
    };

    this._reviewCount = queue.length;
    this.review = new CombatEngine(
      this.canvas, this.overlay, stage, [],
      this.sprites, this.audio, this.progress, this.W, this.H,
    );
    this.state = 'review';
  }

  _updateReview() {
    if (!this.review) { this.state = 'mode-select'; return; }
    const STEP = 1 / 60;
    const dt = this._frameDtSec || STEP;
    this._reviewAccum = Math.min((this._reviewAccum || 0) + dt, STEP * 3);
    let steps = 0;
    while (this._reviewAccum >= STEP && steps < 2) {
      this.review.update(STEP);
      this._reviewAccum -= STEP;
      steps++;
    }
    if (steps === 0) { this.review.update(dt); this._reviewAccum = 0; }
    this.review.draw();
    if (!this.review.done) return;

    // A review has no lose condition worth the name — running out of health
    // still means the words were practised, and the ladder already recorded
    // every answer. Both outcomes land on the same screen.
    this._reviewSummary = {
      words: this._reviewCount || 0,
      correct: this.review._correctBlends || 0,
      ranOut: this.review.outcome !== 'victory',
    };
    const rice = 10 + (this.review._correctBlends || 0) * 5;
    this.progress.addRiceGrains(rice);
    this._reviewSummary.rice = rice;
    this.review = null;
    this._hidePauseBtn();
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    this.audio.stopMusic();
    this.state = 'review-done';
    this._reviewDoneAge = 0;
  }

  /**
   * The stopping cue.
   *
   * Every other end-of-session screen in the genre exists to start the next
   * one. This one exists to say the practice is finished, and it says so
   * plainly rather than hiding the buttons: a child who wants to keep
   * playing still can, they just are not being told they owe the game
   * anything more today.
   */
  _drawReviewDone() {
    const ctx = this.ctx, W = this.W, H = this.H;
    this._reviewDoneAge = (this._reviewDoneAge || 0) + 1;
    UI.scene(ctx, this.sprites['arena-1'], W, H, this._sceneHolders.reviewDone, 'reviewdone', 1.15);

    const s = this._reviewSummary;
    const ladder = window.Review?.shared?.();
    const stats = ladder ? ladder.stats() : null;

    const afterHeading = UI.heading(ctx, s ? 'PRACTICE DONE' : 'ALL CAUGHT UP', W, 26);
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.min(15, W * 0.036)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.textBaseline = 'top';
    const line = s
      ? `${s.correct} of ${s.words} words first try`
      : 'Nothing is due today. Your words are resting.';
    ctx.fillText(line, W / 2, afterHeading + 10);

    let y = afterHeading + 42;
    if (stats) {
      // Say what the ladder is holding, in words a parent reads over a
      // shoulder and understands without a legend.
      const rows = [
        ['Learning', stats.learning, '#F2C14E'],
        ['Getting there', stats.reviewing, '#7CC7FF'],
        ['Known', stats.mastered, '#7CFF9B'],
      ];
      const colW = Math.min(140, (W - 48) / 3);
      const x0 = (W - colW * 3) / 2;
      rows.forEach(([label, n, tone], i) => {
        const r = { x: x0 + i * colW, y, w: colW - 8, h: 56 };
        ctx.fillStyle = UI.THEME.panel;
        ctx.strokeStyle = UI.THEME.stroke;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = tone;
        ctx.font = `900 ${Math.min(24, W * 0.055)}px ${UI.THEME.font}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(n), r.x + r.w / 2, r.y + 32);
        ctx.fillStyle = UI.THEME.muted;
        ctx.font = `700 10.5px ${UI.THEME.font}`;
        ctx.fillText(label, r.x + r.w / 2, r.y + 47);
      });
      y += 70;
    }

    if (s && s.rice) {
      UI.chip(ctx, `+${s.rice} rice`, W / 2 - 46, y, { size: 13 });
      y += 38;
    }

    ctx.textBaseline = 'top';
    ctx.fillStyle = UI.THEME.rice;
    ctx.font = `800 ${Math.min(14, W * 0.033)}px ${UI.THEME.font}`;
    const next = stats && stats.due > 0
      ? 'More words are due — come back tomorrow for them.'
      : 'Come back tomorrow and the next words will be ready.';
    ctx.fillText(next, W / 2, y);
    y += 26;
    ctx.fillStyle = UI.THEME.muted;
    ctx.font = `700 ${Math.min(12, W * 0.029)}px ${UI.THEME.font}`;
    ctx.fillText('Practice is finished for today. Play on if you feel like it.', W / 2, y);

    this._reviewDoneRects = [];
    const bw = Math.min(220, W - 64);
    const play = { x: (W - bw) / 2, y: Math.min(H - 84, y + 34), w: bw, h: 44 };
    UI.card(ctx, play, { label: 'Keep playing', sub: 'Back to the adventure',
                         primary: true, labelSize: 15, subSize: 10.5 });
    this._reviewDoneRects.push({ ...play, action: 'modes' });
    const stop = UI.ghost(ctx, 'That\'s enough for today', W / 2, play.y + play.h + 10);
    this._reviewDoneRects.push({ ...stop, action: 'stop' });
  }

  _clickReviewDone(mx, my) {
    for (const r of this._reviewDoneRects || []) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        if (r.action === 'stop') { exitSlash(); return; }
        this.state = 'mode-select';
        this._stateEntryFade = 1.0;
        return;
      }
    }
  }
  // ── STAGE WIN ────────────────────────────────────────────────
  _onStageWin() {
    this._hidePauseBtn();
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    const battleScore = this.battle ? this.battle.score : 0;
    this._lastBattleAccuracy = this.battle?.getAccuracyPercent?.() ?? null;
    const runnerScore = this._lastRunnerScore || 0;
    const score = battleScore + runnerScore;
    // A previewed stage is someone else's link, not this player's progress.
    if (!this._previewStage) this.progress.completeStage(this.stageId, score);

    const clearSec = this._stageStartedAt ? (Date.now() - this._stageStartedAt) / 1000 : null;
    const runnerTookHit = typeof this._lastRunnerHp === 'number' ? this._lastRunnerHp < 3 : false;
    const battleTookHit = this.battle ? this.battle.rikuHp < this.battle.rikuMaxHp : false;
    const masteryResult = {
      noHit: !(runnerTookHit || battleTookHit),
      speedClear: typeof clearSec === 'number' && clearSec <= 95,
      clearSec,
    };
    const masteryReward = this.progress.recordStageMastery(this.stageId, masteryResult);
    this._stageWinMastery = { ...masteryReward.mastery, bonus: masteryReward.bonus, newly: masteryReward.newlyEarned, clearSec };

    // Phase 8: capture battle summary before destroying the engine
    const riceEarned = this.progress.getStars(this.stageId) * 50 + 20 + (masteryReward.bonus || 0);
    this._battleResults = {
      wordsBlended: this.battle?._correctBlends  ?? 0,
      bestStreak:   this.battle?._streak         ?? 0,
      accuracy:     this._lastBattleAccuracy     ?? 0,
      riceEarned,
      stageId: this.stageId,
      learnedWords: this.battle?.learnedWords    ?? [],   // words child successfully blended
    };

    this.overlay.classList.remove('active');
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.audio.sfxVictory();

    // Phase 8: show animated battle-results card for 2.5s before stage-win
    this.state = 'battle-results';
    this._battleResultsAge = 0;
    this._battleResultsDone = false;
    this._resultBtnRects = [];
    setTimeout(() => {
      if (this.state === 'battle-results') this._advanceToStageWin();
    }, 2800);
  }

  // Phase 8: called when battle-results card is tapped or times out
  _advanceToStageWin() {
    if (this._battleResultsDone) return;
    this._battleResultsDone = true;
    // Full Mario-style stage-clear fanfare; menu music waits for it
    this.audio.stopMusic();
    this.audio.sfxStageClear();
    this._jingleUntil = performance.now() + 2600;
    this.state = 'stage-win';
    this._stageWinAge = 0;
    this._resultBtnRects = [];
    this._confetti = Array.from({length: 55}, () => ({
      x: Math.random() * this.W,
      y: Math.random() * -this.H,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 1.6 + Math.random() * 2.2,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.18,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 5,
      color: ['#FFD700','#FF4081','#00E5FF','#76FF03','#FF9800','#E040FB','#fff'][Math.floor(Math.random()*7)],
      emoji: Math.random() < 0.18 ? ['🎉','⭐','🍚','✨','🏆'][Math.floor(Math.random()*5)] : null,
    }));
  }
  // ── STAGE LOSE ───────────────────────────────────────────────
  _onStageLose() {
    this._hidePauseBtn();
    this.overlay.classList.remove('active');
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.state = 'stage-lose';
    this._stageLoseAge = 0;
    this._resultBtnRects = [];
  }
  // ── EXIT ─────────────────────────────────────────────────────
  exit() {
    this._hidePauseBtn();
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.audio.stopMusic();
    this._hideDpad();
    this.overlay.classList.remove('active');
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    document.removeEventListener('keydown', this._menuKd);
    this.canvas.removeEventListener('click', this._canvasClick);
    this.canvas.removeEventListener('touchstart', this._canvasTap);
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    cancelAnimationFrame(this._rafId);
  }
  // ── Auto-pause when page becomes hidden ──────────────────────
  _autoPauseOnHidden() {
    const s = this.state;
    const isGameplay = s === 'runner' || s === 'battle' || s === 'endless-runner' || s === 'endless-battle';
    if (!isGameplay) return;
    if (s === 'runner' && this.runner && !this.runner._paused) {
      this.runner._paused = true;
      this.runner._stopBlendTimer?.();
    }
    if (s === 'battle' && this.battle && !this.battle._paused) {
      this.battle._paused = true;
      this.battle._stopBlendTimer?.();
    }
    if (s === 'endless-runner' && this.endlessRunner && !this.endlessRunner._paused) {
      this.endlessRunner._paused = true;
    }
    // endless-battle has no explicit pause but its timer is performance.now() based;
    // nothing more to do — user must manually resume via pause button.
  }

  // ── Shell music — the menus should never be silent ───────────
  // Plays the calm menu theme on every non-gameplay screen; gameplay
  // screens manage their own stage music (startMusic in _startRunner).
  _syncShellMusic() {
    if (!this.audio || this.audio.isMuted) return;
    const SHELL = new Set(['mode-select','menu','stage-select','world-map',
                           'shop','daily','achievements','leaderboard',
                           'stage-win','endless-gameover','review-done']);
    if (this._jingleUntil && performance.now() < this._jingleUntil) return;
    if (SHELL.has(this.state)) {
      if (this.audio.musicKey !== 'menu') this.audio.startMenuMusic();
    } else if (this.audio.musicKey === 'menu' &&
               (this.state === 'runner' || this.state === 'battle' ||
                this.state === 'review' ||
                this.state === 'endless-runner' || this.state === 'endless-battle')) {
      this.audio.stopMusic();
    }
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────
  _loop() {
    this._rafId = requestAnimationFrame(this._loop);
    const now = performance.now();
    if (!this._lastFrameTs) this._lastFrameTs = now;
    const elapsedMs = now - this._lastFrameTs;
    // Menus and result screens animate gently — 30 FPS there halves GPU
    // load and battery drain; gameplay states keep the full 60 FPS.
    const isGameplay = this.state === 'runner' || this.state === 'battle' ||
                       this.state === 'review' ||
                       this.state === 'boss-defeated' || this.state === 'transition' ||
                       this.state === 'endless-runner' || this.state === 'endless-battle';
    this._targetFrameMs = isGameplay ? 1000 / 60 : 1000 / 30;
    // Step 6: FPS pacing lock. Skip overly-fast RAF callbacks.
    if (elapsedMs + 0.2 < this._targetFrameMs) return;
    this._lastFrameTs = now;
    const frameDtSec = Math.min(0.05, Math.max(1 / 120, elapsedMs / 1000));
    this._frameDtSec = frameDtSec;
    this._fpsSamples.push(1 / frameDtSec);
    if (this._fpsSamples.length > 30) this._fpsSamples.shift();
    this._age++;
    // Adaptive quality is driven by how long this frame's own work takes,
    // measured around the state switch below. Wall-clock frame *interval* is
    // the wrong signal: it also moves with vsync, throttling and page
    // visibility, none of which the renderer can do anything about.
    // Block all states until sprites + sheets + audio preload are ready.
    if (!this._spritesReady || !this._sheetsReady || !this._audioReady) { this._drawLoading(); return; }
    // Tick achievement popup
    this._tickAchievementPopup();
    this._syncShellMusic();
    const workStart = isGameplay ? performance.now() : 0;
    switch (this.state) {
      case 'onboarding': this._updateOnboarding(); break; // PHASE 6
      case 'mode-select': this._updateModeSelect(); break;
      case 'menu': this._updateMenu(); break;
      case 'stage-select': this._updateStageSelect(); break;
      case 'world-map': this._updateWorldMap(); break;
      case 'runner': this._updateRunner(); break;
      case 'transition': this._updateTransition(); break;
      case 'battle': this._updateBattle(); break;
      case 'review': this._updateReview(); break;
      case 'review-done': this._drawReviewDone(); break;
      case 'battle-results': this._drawBattleResults(); break;  // Phase 8
      case 'stage-win': this._drawStageWin(); break;
      case 'stage-lose': this._drawStageLose(); break;
      case 'endless-runner': this._updateEndlessRunner(); break;
      case 'endless-battle': this._updateEndlessBattle(); break;
      case 'endless-gameover': this._drawEndlessGameover(); break;
      case 'shop': this._updateShop(); break;
      case 'daily': this._updateDaily(); break;
      case 'achievements': this._updateAchievements(); break;
      case 'leaderboard': this._updateLeaderboard(); break;
    }
    if (workStart && window.Quality) window.Quality.sample(performance.now() - workStart);
    // Achievement popup on top of everything
    this._drawAchievementPopup();
    if (this._debugOverlay) this._drawDebugOverlay();
    // Global state-entry fade-in (Nintendo screen polish)
    if (this._stateEntryFade > 0) {
      this._stateEntryFade = Math.max(0, this._stateEntryFade - 0.055);
      this.ctx.fillStyle = `rgba(0,0,0,${this._stateEntryFade})`;
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
  }
  _drawDebugOverlay() {
    const ctx = this.ctx;
    const fps = this._fpsSamples.length
      ? (this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length)
      : 0;
    const lines = [
      `DEBUG ~ ON`,
      `state: ${this.state}`,
      `fps: ${fps.toFixed(1)} | dt: ${(this._frameDtSec * 1000).toFixed(2)}ms`,
      `assets: sprites=${this._spritesReady ? 'ok' : '...'} sheets=${this._sheetsReady ? 'ok' : '...'} audio=${this._audioReady ? 'ok' : '...'}`,
    ];
    if (this.runner && this.state.includes('runner')) {
      lines.push(`runner hp=${this.runner.player?.hp ?? '-'} score=${this.runner.score ?? 0}`);
    }
    if (this.battle && this.state.includes('battle')) {
      lines.push(`battle hp=${this.battle.rikuHp}/${this.battle.rikuMaxHp} boss=${this.battle.bossHp}/${this.battle.bossMaxHp}`);
    }
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const pad = 8;
    const boxW = Math.min(this.W * 0.86, 390);
    const boxH = 20 + lines.length * 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(12, 12, boxW, boxH);
    ctx.strokeStyle = 'rgba(120,255,180,0.8)';
    ctx.strokeRect(12, 12, boxW, boxH);
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#7CFFB2' : '#E9FFF2';
      ctx.fillText(line, 12 + pad, 12 + pad + i * 18);
    });
    ctx.restore();
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
    sky.addColorStop(0, '#0a1e6e'); // deep midnight blue at top
    sky.addColorStop(0.38, '#1a6bb5'); // bright sky blue
    sky.addColorStop(0.62, '#4eb34e'); // bright grass green
    sky.addColorStop(1, '#27622a'); // rich dark green at bottom
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // ── Twinkling stars in sky half ─────────────────────────────
    const stars = [
      { x: 0.12, y: 0.06 }, { x: 0.28, y: 0.03 }, { x: 0.45, y: 0.09 },
      { x: 0.6, y: 0.04 }, { x: 0.75, y: 0.08 }, { x: 0.88, y: 0.02 },
      { x: 0.18, y: 0.15 }, { x: 0.52, y: 0.18 }, { x: 0.82, y: 0.13 },
      { x: 0.35, y: 0.22 }, { x: 0.7, y: 0.20 }, { x: 0.05, y: 0.24 },
    ];
    stars.forEach((s, i) => {
      const tw = 0.6 + 0.4 * Math.sin(t * 0.07 + i * 1.4);
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
    ctx.shadowBlur = 18 * borderPulse;
    ctx.strokeStyle = `rgba(255,215,0,${borderPulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 28); ctx.stroke();
    ctx.shadowBlur = 0;
    // ── Riku sprite — centered, natural aspect ratio ─────────────
    const riku = this.sprites['riku-idle'] || this.sprites['riku-run'];
    const rikuH = Math.round(cardH * 0.28);
    const rikuY = cardY + 16;
    const bounce = Math.sin(t * 0.06) * 5;
    ctx.textAlign = 'center';
    if (riku && riku.complete && riku.naturalWidth > 0) {
      const ratio = riku.naturalWidth / riku.naturalHeight;
      const rikuW = Math.round(rikuH * ratio);
      ctx.drawImage(riku, W / 2 - rikuW / 2, rikuY + bounce, rikuW, rikuH);
    } else {
      ctx.font = `${rikuH}px serif`;
      ctx.fillText('🍙', W / 2, rikuY + rikuH * 0.8 + bounce);
    }
    // ── Game title — big, bold, gold with outline ────────────────
    const titleY = rikuY + rikuH + 18 + bounce * 0.3;
    const titleSz = Math.round(Math.min(36, W * 0.08));
    ctx.font = `900 ${titleSz}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.textAlign = 'center';
    // Title shadow/outline for readability
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#5d2d00';
    ctx.lineWidth = 7;
    ctx.strokeText('⚔️ Samurice', W / 2, titleY);
    ctx.strokeText('Dino Slash! 🦕', W / 2, titleY + titleSz + 6);
    const titleGrad = ctx.createLinearGradient(0, titleY, 0, titleY + titleSz * 2);
    titleGrad.addColorStop(0, '#FFF176');
    titleGrad.addColorStop(0.5, '#FFD700');
    titleGrad.addColorStop(1, '#FF8F00');
    ctx.fillStyle = titleGrad;
    ctx.fillText('⚔️ Samurice', W / 2, titleY);
    ctx.fillText('Dino Slash! 🦕', W / 2, titleY + titleSz + 6);
    ctx.shadowBlur = 0;
    // ── Subtitle ─────────────────────────────────────────────────
    const subY = titleY + titleSz * 2 + 22;
    ctx.font = `bold ${Math.round(Math.min(13, W * 0.031))}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = 'rgba(200,240,200,0.82)';
    ctx.fillText('Phonics Adventure · 6 Stages · Short Vowels → Blends', W / 2, subY);
    // ── Animated dino emojis left/right of card ──────────────────
    const dinoY = subY + 22;
    const dinoA = Math.sin(t * 0.05) * 0.15;
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
    const tagY = dinoY + 36;
    const tagPul = 0.75 + 0.25 * Math.sin(t * 0.06);
    ctx.globalAlpha = tagPul;
    ctx.font = `bold ${Math.round(Math.min(15, W * 0.036))}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 8;
    ctx.fillText('🍚 Rice Power · Phonics Mastery! 🍚', W / 2, tagY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // ── Progress row ─────────────────────────────────────────────
    const completed = PHONICS_DATA.stageList.filter((_, i) => this.progress.getStars(i + 1) > 0).length;
    ctx.font = `${Math.round(Math.min(12, W * 0.028))}px system-ui`;
    ctx.fillStyle = 'rgba(180,255,180,0.7)';
    ctx.fillText(`${completed}/${PHONICS_DATA.stageCount} stages cleared · ${this.progress.getRicePoints()} 🍚 rice points`, W / 2, tagY + 28);
    // ── TAP TO PLAY button ───────────────────────────────────────
    const btnW = Math.min(cardW - 40, 260);
    const btnH = Math.round(H * 0.075);
    const btnX = W / 2 - btnW / 2;
    const btnY = cardY + cardH - btnH - 20;
    const tapPul = 0.72 + 0.28 * Math.sin(t * 0.08);
    // Button glow
    ctx.shadowColor = '#00FF88';
    ctx.shadowBlur = 16 * tapPul;
    const btnG = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnG.addColorStop(0, `rgba(0,220,100,${0.8 + 0.2 * tapPul})`);
    btnG.addColorStop(1, `rgba(0,150,60,${0.85 + 0.15 * tapPul})`);
    ctx.fillStyle = btnG;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, btnH / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Button text
    const tapSz = Math.round(Math.min(20, W * 0.046));
    ctx.font = `900 ${tapSz}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶ TAP TO PLAY!', W / 2, btnY + btnH / 2);
    ctx.textBaseline = 'top';
    // ── Corner sparkles around the card ─────────────────────────
    const sparkles = [
      { x: cardX - 2, y: cardY - 2 },
      { x: cardX + cardW + 2, y: cardY - 2 },
      { x: cardX - 2, y: cardY + cardH + 2 },
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
    const world = PHONICS_DATA.WORLDS[this._worldSel] || PHONICS_DATA.WORLDS[0];
    // Each world's stage list sits on that world's own painted scene, so the
    // screen tells you where you are before you have read a word of it.
    // The background key lives on the stage data, not a guessable pattern
    // ('stage-1-rice-paddy', not 'stage-1').
    const firstStage = PHONICS_DATA.stageList[world.startId - 1];
    UI.scene(ctx, this.sprites[firstStage && firstStage.bg],
             W, H, this._sceneHolders.stageSelect, `stageselect-${world.id}`);
    const ids   = world.stageIds;
    if (this._menuSel >= ids.length) this._menuSel = ids.length - 1;
    // Header — world name, the skill it teaches, and the rice count
    UI.heading(ctx, `World ${world.id} · ${world.name}`, W, 12,
               { size: Math.min(21, W * 0.05) });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `800 ${Math.min(12, W * 0.030)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.gold;
    ctx.fillText(world.skill, W / 2, 48);
    ctx.restore();
    // No rice chip here: the Worlds button already occupies this corner, and
    // the count is on the previous screen.
    // Stage cards (2 columns)
    const cols = W > 480 ? 2 : 1;
    const rows = Math.ceil(ids.length / cols);
    const margin = 14;
    const topPad = 78;
    const cw = (W - margin * (cols + 1)) / cols;
    const ch = (H - topPad - 16 - margin * (rows + 1)) / rows;
    this._stageCardRects = [];
    for (let i = 0; i < ids.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = margin + col * (cw + margin);
      const y = topPad + margin + row * (ch + margin);
      this._stageCardRects.push({ x, y, w: cw, h: ch });
      const stageId = ids[i];
      const stage = PHONICS_DATA.stageList[stageId - 1];
      const summary = this.progress.getStageSummary(stageId);
      const unlocked = summary.unlocked;
      const sel = this._menuSel === i;
      // Card background
      ctx.fillStyle = unlocked
        ? (sel ? UI.THEME.panelHot : UI.THEME.panel)
        : 'rgba(14,9,13,0.72)';
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 14); ctx.fill();
      ctx.strokeStyle = sel ? UI.THEME.gold
                      : (unlocked ? UI.THEME.stroke : 'rgba(255,255,255,0.10)');
      ctx.lineWidth = sel ? 2.5 : 1;
      ctx.stroke();
      if (!unlocked) {
        const prereqId = Math.max(1, stageId - 1);
        const prereq = PHONICS_DATA.getStagePrereq?.(stageId);
        ctx.font = `${Math.min(26, cw * 0.28)}px serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText('🔒', x + cw / 2, y + ch / 2 - 18);
        ctx.font = `800 11px ${UI.THEME.font}`;
        ctx.fillStyle = UI.THEME.locked;
        ctx.fillText(`Stage ${world.id}-${i + 1} — Locked`, x + cw / 2, y + ch / 2 + 10);
        ctx.font = `700 10px ${UI.THEME.font}`;
        ctx.fillStyle = 'rgba(247,241,228,0.42)';
        const gate = prereq ? `Clear ${prereq.world}-${prereq.local}: ${prereq.pattern}` : `Clear Stage ${prereqId}`;
        ctx.fillText(gate, x + cw / 2, y + ch / 2 + 28);
        continue;
      }
      // Accent strip
      ctx.fillStyle = stage.accentColor + '55';
      ctx.beginPath(); ctx.roundRect(x, y, cw, 6, [14, 14, 0, 0]); ctx.fill();
      // Stage label (e.g. "Stage 1-3" or "BOSS")
      ctx.font = `bold ${Math.min(14, cw * 0.11)}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = stage.isBoss ? '#FF5252' : '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText(stage.isBoss ? `👑 BOSS ${world.id}-${i + 1}` : `Stage ${world.id}-${i + 1}`, x + cw / 2, y + 20);
      ctx.font = `bold ${Math.min(13, cw * 0.095)}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#fff';
      ctx.fillText(stage.name, x + cw / 2, y + 38);
      // Skill / focus label
      ctx.font = `${Math.min(10, cw * 0.075)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(stage.pattern, x + cw / 2, y + 54);

      // Sequential quest ribbon: shows the phonics power this level teaches
      // and makes it clear that the next level unlocks only after this one.
      const trail = PHONICS_DATA.getLearningTrail?.(stageId);
      if (trail) {
        const ribbonY = y + 66;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.beginPath(); ctx.roundRect(x + 10, ribbonY, cw - 20, 36, 12); ctx.fill();
        const iconKey = trail.quest?.iconKey || 'power-boss-star';
        const iconSp = this.sprites[iconKey];
        if (iconSp && iconSp.complete && iconSp.naturalWidth > 0) {
          ctx.drawImage(iconSp, x + 14, ribbonY + 4, 28, 28);
        }
        ctx.font = `bold ${Math.min(9, cw * 0.066)}px "Nunito", system-ui`;
        ctx.fillStyle = '#B2FF59';
        ctx.textAlign = 'left';
        ctx.fillText(`🎯 ${trail.quest?.title || trail.focus}`, x + 48, ribbonY + 13);
        ctx.fillStyle = '#FFD54F';
        ctx.fillText(`Power-up: ${trail.quest?.powerUp || 'Reading Star'}`, x + 48, ribbonY + 28);
        ctx.textAlign = 'center';
      }
      // Stars
      const starY = y + ch - 26;
      const starX = x + cw / 2 - 22;
      ctx.font = '16px serif';
      for (let s = 0; s < 3; s++) {
        ctx.globalAlpha = s < summary.stars ? 1 : 0.2;
        ctx.fillText('⭐', starX + s * 22, starY);
      }
      ctx.globalAlpha = 1;
      // Example words
      const eg = stage.words.slice(0, 3).map(w => `${w.hint} ${w.word}`).join(' ');
      ctx.font = `${Math.min(9, cw * 0.068)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(eg, x + cw / 2, y + ch - 8);
    }
    // ── Relaxed Mode toggle (top-right corner of header) ───────
    // Lets parents/teachers turn off the timer penalty for early learners.
    const relaxed = localStorage.getItem('samurice_relaxed') === '1';
    const btnW = Math.min(130, W * 0.30);
    const btnH = 26;
    const btnX = W - btnW - 116;   // clear of the fullscreen + close buttons
    const btnY = 10;
    this._relaxedToggleRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    // Button background
    ctx.fillStyle = relaxed ? 'rgba(0,188,212,0.35)' : 'rgba(0,188,212,0.12)';
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 13); ctx.fill();
    ctx.strokeStyle = relaxed ? '#00BCD4' : 'rgba(0,188,212,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 13); ctx.stroke();
    // Switch track
    const trackX = btnX + btnW - 36;
    const trackY = btnY + 5;
    ctx.fillStyle = relaxed ? '#00BCD4' : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(trackX, trackY, 28, 16, 8); ctx.fill();
    // Knob
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(relaxed ? trackX + 20 : trackX + 8, trackY + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Label
    ctx.font = `bold ${Math.min(10, btnW * 0.09)}px "Nunito", system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = relaxed ? '#fff' : '#80DEEA';
    ctx.fillText('😊 Relaxed', btnX + 8, btnY + btnH / 2);

    // Back-to-world-map button (top-left)
    const backW = Math.min(96, W * 0.26);
    const backH = 26;
    const backX = 10;
    const backY = 10;
    this._stageBackRect = { x: backX, y: backY, w: backW, h: backH };
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 13); ctx.stroke();
    ctx.font = `bold ${Math.min(11, backW * 0.13)}px "Nunito", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🗺️ Worlds', backX + backW / 2, backY + backH / 2);
    ctx.textBaseline = 'alphabetic';
  }
  // ── WORLD MAP ────────────────────────────────────────────────
  _updateWorldMap() {
    this._mapAnim++;
    this._drawWorldMap();
  }
  _drawWorldMap() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const t = this._mapAnim;
    ctx.clearRect(0, 0, W, H);

    // ── Rich scenic overworld sky ─────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#0a1e8a');
    sky.addColorStop(0.35, '#1565C0');
    sky.addColorStop(0.70, '#42A5F5');
    sky.addColorStop(1, '#80DEEA');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.55);

    // Lush overworld ground
    const groundGrad = ctx.createLinearGradient(0, H * 0.50, 0, H);
    groundGrad.addColorStop(0, '#558B2F');
    groundGrad.addColorStop(0.3, '#388E3C');
    groundGrad.addColorStop(1, '#1B5E20');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H * 0.50, W, H * 0.50);

    // ── Far mountain silhouettes ──────────────────────────────
    ctx.fillStyle = 'rgba(25,50,100,0.32)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.52);
    [0.05,0.12,0.22,0.35,0.48,0.58,0.68,0.78,0.88,0.96,1.0].forEach((fx, i) => {
      ctx.lineTo(fx * W, H * 0.52 - H * (0.12 + (i % 3) * 0.055));
    });
    ctx.lineTo(W, H * 0.52);
    ctx.closePath(); ctx.fill();

    // ── Rolling hills ─────────────────────────────────────────
    ctx.fillStyle = 'rgba(76,130,40,0.62)';
    ctx.beginPath(); ctx.moveTo(0, H * 0.58);
    for (let x = 0; x <= W; x += 3) {
      const hy = H * 0.58 - Math.sin(x / W * Math.PI * 4 + t * 0.004) * H * 0.05
                           - Math.sin(x / W * Math.PI * 7 - t * 0.003) * H * 0.026;
      ctx.lineTo(x, hy);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    // ── Animated clouds ───────────────────────────────────────
    [{ cx:0.12, cy:0.10, r:0.055, spd:1.0 },
     { cx:0.46, cy:0.07, r:0.075, spd:0.7 },
     { cx:0.76, cy:0.12, r:0.060, spd:0.9 }].forEach((c, i) => {
      const ox  = ((t * 0.14 * c.spd + i * 200) % (W + c.r * W * 2 + 60)) - c.r * W - 30;
      const cx2 = ((c.cx * W + ox) % (W + c.r * W * 2 + 60)) - c.r * W;
      const cy2 = c.cy * H;
      const rw  = c.r * W; const rh = c.r * H * 0.45;
      ctx.fillStyle = 'rgba(255,255,255,0.84)';
      ctx.beginPath(); ctx.ellipse(cx2,       cy2,      rw,        rh,        0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx2 - rw * 0.44, cy2 + rh * 0.22, rw * 0.63, rh * 0.78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx2 + rw * 0.46, cy2 + rh * 0.18, rw * 0.60, rh * 0.74, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(180,210,255,0.28)';
      ctx.beginPath(); ctx.ellipse(cx2, cy2 + rh * 0.32, rw * 0.84, rh * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    });

    // ── World terrain features ────────────────────────────────
    // Rice paddy (bottom-left, stage 1 area)
    const rpY = H * 0.73;
    ctx.fillStyle = 'rgba(100,185,75,0.50)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.ellipse(W * (0.04 + i * 0.055), rpY - i * 4, W * 0.038, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,120,30,0.42)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(W * (0.04 + i * 0.055), rpY - i * 4 - 18); ctx.lineTo(W * (0.04 + i * 0.055), rpY - i * 4 - 6); ctx.stroke();
    }
    // Bamboo grove (stage 2 area, left-center)
    ctx.strokeStyle = 'rgba(56,142,60,0.52)'; ctx.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const bx = W * 0.24 + i * 15 + Math.sin(t * 0.016 + i) * 3;
      ctx.beginPath(); ctx.moveTo(bx, H * 0.82); ctx.lineTo(bx - 4, H * 0.52); ctx.stroke();
      ctx.strokeStyle = 'rgba(56,142,60,0.32)'; ctx.lineWidth = 1;
      [0.60, 0.70, 0.76].forEach(fy => {
        ctx.beginPath(); ctx.moveTo(bx - 3, H * fy); ctx.lineTo(bx + 3, H * fy); ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(56,142,60,0.52)'; ctx.lineWidth = 5;
    }
    // Cherry blossom tree (stage 3 area, right-center)
    const cbX = W * 0.76; const cbY = H * 0.42;
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cbX, H * 0.60); ctx.lineTo(cbX, cbY + 22); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cbX, cbY + 22); ctx.lineTo(cbX - 30, cbY + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cbX, cbY + 22); ctx.lineTo(cbX + 26, cbY + 8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,180,0.68)';
    ctx.beginPath(); ctx.arc(cbX, cbY + 6, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,182,193,0.48)';
    ctx.beginPath(); ctx.arc(cbX - 25, cbY + 16, 24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cbX + 23, cbY + 13, 22, 0, Math.PI * 2); ctx.fill();
    for (let p = 0; p < 7; p++) {
      const px = cbX - 38 + ((p * 68 + t * 0.42) % 84);
      const py = cbY + 32 + ((p * 41 + t * 0.62) % (H * 0.24));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#FFB7C5';
      ctx.beginPath(); ctx.ellipse(px, py, 3, 2, (t * 0.05 + p) % Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Ancient ruin pillars (stage 4 area, center)
    const ruinX = W * 0.52; const ruinY = H * 0.65;
    ctx.fillStyle = 'rgba(120,100,80,0.52)';
    ctx.fillRect(ruinX - 22, ruinY - 32, 44, 32);
    ctx.fillRect(ruinX - 18, ruinY - 44, 12, 14);
    ctx.fillRect(ruinX + 4,  ruinY - 44, 12, 14);
    ctx.fillStyle = 'rgba(100,78,58,0.35)';
    ctx.fillRect(ruinX - 10, ruinY - 26, 18, 18);
    // Mountain peak (stage 5 area, upper right)
    ctx.fillStyle = 'rgba(70,90,130,0.55)';
    ctx.beginPath();
    ctx.moveTo(W * 0.84, H * 0.28);
    ctx.lineTo(W * 0.96, H * 0.52);
    ctx.lineTo(W * 0.72, H * 0.52);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(240,248,255,0.82)';
    ctx.beginPath();
    ctx.moveTo(W * 0.84, H * 0.28);
    ctx.lineTo(W * 0.90, H * 0.38);
    ctx.lineTo(W * 0.78, H * 0.38);
    ctx.closePath(); ctx.fill();
    // Volcano (stage 6 area, far right)
    ctx.fillStyle = 'rgba(100,30,10,0.60)';
    ctx.beginPath();
    ctx.moveTo(Math.min(W * 0.97, W - 8), H * 0.38);
    ctx.lineTo(W + 8, H * 0.56);
    ctx.lineTo(W * 0.88, H * 0.56);
    ctx.closePath(); ctx.fill();
    const lavaR = 80 + Math.sin(t * 0.08) * 40;
    ctx.fillStyle = `rgba(255,${lavaR},0,0.60)`;
    ctx.beginPath(); ctx.ellipse(Math.min(W * 0.97, W - 8), H * 0.38, 14, 8, 0, 0, Math.PI * 2); ctx.fill();

    // ── Stage node positions ──────────────────────────────────
    const margin = 52;
    const mapTop = 66;
    const mapBot = H - 36;
    const mapH   = mapBot - mapTop;
    const nodes  = [
      { fx: 0.12, fy: 0.74 }, // Stage 1 — rice paddy (bottom-left)
      { fx: 0.35, fy: 0.60 }, // Stage 2 — bamboo (center-left)
      { fx: 0.58, fy: 0.48 }, // Stage 3 — temple (center)
      { fx: 0.44, fy: 0.30 }, // Stage 4 — ruins (upper-center)
      { fx: 0.68, fy: 0.18 }, // Stage 5 — mountain (upper-right)
      { fx: 0.88, fy: 0.36 }, // Stage 6 — volcano (right)
    ].map(n => ({
      cx: margin + n.fx * (W - margin * 2),
      cy: mapTop + n.fy * mapH,
    }));
    const nodeR = Math.max(26, Math.min(34, W * 0.060));
    this._mapNodeRects = nodes.map(n => ({ cx: n.cx, cy: n.cy, r: nodeR + 8 }));

    // ── Golden brick path ─────────────────────────────────────
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Shadow pass
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    nodes.forEach((n, i) => { if (i === 0) ctx.moveTo(n.cx + 3, n.cy + 4); else ctx.lineTo(n.cx + 3, n.cy + 4); });
    ctx.stroke();
    // Per-segment coloured path
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]; const b = nodes[i + 1];
      const nextWorld = PHONICS_DATA.WORLDS[i + 1];
      const unlocked = nextWorld ? this.progress.isUnlocked(nextWorld.startId) : false;
      ctx.strokeStyle = unlocked ? '#E65100' : '#546E7A';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      ctx.strokeStyle = unlocked ? '#FFD700' : '#78909C';
      ctx.lineWidth = 10;
      ctx.setLineDash(unlocked ? [] : [10, 8]);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      ctx.setLineDash([]);
      if (unlocked) {
        for (let d = 0; d < 2; d++) {
          const prog = ((t * 0.010 + d * 0.5) % 1);
          const dotX = a.cx + (b.cx - a.cx) * prog;
          const dotY = a.cy + (b.cy - a.cy) * prog;
          ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 6;
          ctx.fillStyle = 'rgba(255,255,220,0.92)';
          ctx.beginPath(); ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();

    // ── World nodes (6 worlds along the path) ─────────────────
    const worldAccents = ['#8BC34A','#4CAF50','#E91E63','#FF9800','#42A5F5','#FF5722'];
    PHONICS_DATA.WORLDS.forEach((world, i) => {
      const n       = nodes[i];
      if (!n) return;
      const unlocked = this.progress.isUnlocked(world.startId);
      const sel      = this._worldSel === i;
      const cleared  = world.stageIds.filter(id => this.progress.getStage(id)?.completedAt).length;
      const total    = world.stageCount;
      const allClear = cleared >= total;
      const accent   = worldAccents[i] || world.accentColor || '#FFD700';
      const bounce   = sel ? Math.sin(t * 0.12) * 5 : 0;
      const cy       = n.cy + bounce;
      // Locked-node wobble when tapped
      let lockedJx = 0;
      if (this._lockedShake && this._lockedShake.i === i && this._lockedShake.frames > 0) {
        this._lockedShake.frames--;
        lockedJx = Math.sin(this._lockedShake.frames * 0.9) * 5;
      }
      if (lockedJx) { ctx.save(); ctx.translate(lockedJx, 0); }

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(n.cx + 2, cy + nodeR + 3, nodeR * 0.72, 7, 0, 0, Math.PI * 2); ctx.fill();

      // Glow
      if (sel || unlocked) { ctx.shadowColor = accent; ctx.shadowBlur = sel ? 28 : 12; }

      // Radial gradient fill
      const ng = ctx.createRadialGradient(n.cx - nodeR * 0.3, cy - nodeR * 0.3, nodeR * 0.1, n.cx, cy, nodeR);
      if (unlocked) {
        ng.addColorStop(0, sel ? '#FFFDE7' : '#FFF9C4');
        ng.addColorStop(0.5, accent + 'BB');
        ng.addColorStop(1, accent + '88');
      } else {
        ng.addColorStop(0, '#546E7A');
        ng.addColorStop(1, '#263238');
      }
      ctx.fillStyle = ng;
      ctx.strokeStyle = sel ? '#FFD700' : (unlocked ? accent : '#546E7A');
      ctx.lineWidth = sel ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(n.cx, cy, nodeR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      // Shine highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(n.cx - nodeR * 0.25, cy - nodeR * 0.25, nodeR * 0.5, nodeR * 0.34, -0.5, 0, Math.PI * 2); ctx.fill();

      if (!unlocked) {
        ctx.font = `${Math.round(nodeR * 0.75)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillText('🔒', n.cx, cy);
      } else {
        ctx.font = `900 ${Math.round(nodeR * 0.50)}px "Nunito", "Comic Sans MS", system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
        ctx.fillStyle = sel ? '#FFD700' : '#fff';
        ctx.fillText(`${world.icon}`, n.cx, cy - nodeR * 0.18);
        ctx.font = `900 ${Math.round(nodeR * 0.30)}px "Nunito", "Comic Sans MS", system-ui`;
        ctx.fillText(`WORLD ${world.id}`, n.cx, cy + nodeR * 0.36);
        ctx.shadowBlur = 0;
        // Cleared progress pill (x/total) + star total for the world
        const starSum = world.stageIds.reduce((s, id) => s + (this.progress.getStars(id) || 0), 0);
        ctx.font = `bold ${Math.max(9, Math.round(nodeR * 0.30))}px "Nunito", system-ui`;
        ctx.fillStyle = allClear ? '#FFD700' : 'rgba(255,255,255,0.85)';
        const pill = (allClear ? `👑 ${cleared}/${total}` : `${cleared}/${total}`) +
                     (starSum > 0 ? `  ⭐${starSum}` : '');
        ctx.fillText(pill, n.cx, cy + nodeR + 12);
      }
      ctx.font = `bold ${Math.max(8, Math.round(W * 0.021))}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = unlocked ? '#fff' : 'rgba(255,255,255,0.28)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      // Nudge the label back inside the canvas. Centring it on the node alone
      // ran the outermost worlds — "Volcanic Samurai Peak" especially — off
      // the edge of the screen.
      const halfLabel = ctx.measureText(world.name).width / 2;
      const labelX = Math.min(Math.max(n.cx, halfLabel + 6), W - halfLabel - 6);
      ctx.fillText(world.name, labelX, cy + nodeR + (unlocked ? 26 : 16));
      ctx.shadowBlur = 0;
      if (lockedJx) ctx.restore();
    });

    // ── Animated Riku walking on the current world ────────────
    if (this.stageId >= 1 && this.stageId <= PHONICS_DATA.stageCount) {
      const curWorldIdx = (PHONICS_DATA.worldOf(this.stageId) || 1) - 1;
      const curNode = nodes[curWorldIdx];
      if (curNode) {
        const bob       = Math.sin(t * 0.10) * 4;
        const walkFrame = Math.floor(t / 8) % 4;
        const rikuKey   = `riku-walk-${walkFrame + 1}`;
        const rikuSp    = this.sprites[rikuKey] || this.sprites['riku-idle'] || this.sprites['riku-run'];
        const rH = nodeR * 1.2;
        if (rikuSp && rikuSp.complete && rikuSp.naturalWidth > 0) {
          const ar = rikuSp.naturalWidth / rikuSp.naturalHeight;
          const rW = rH * ar;
          ctx.save();
          ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 16;
          ctx.drawImage(rikuSp, curNode.cx - rW / 2, curNode.cy - nodeR * 2.0 + bob, rW, rH);
          ctx.restore();
        } else {
          ctx.font = `${Math.round(nodeR * 0.9)}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🍙', curNode.cx, curNode.cy - nodeR * 1.5 + bob);
        }
        // Pointer arrow
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 8;
        const ax = curNode.cx, ay = curNode.cy - nodeR * 0.92 + bob;
        ctx.beginPath();
        ctx.moveTo(ax - 7, ay); ctx.lineTo(ax + 7, ay); ctx.lineTo(ax, ay + 9);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // ── Title header ──────────────────────────────────────────
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const titleSz = Math.min(20, W * 0.046);
    // Drifting clouds pass behind this text and were washing it out — the
    // subtitle in particular became white-on-white. A soft scrim keeps the
    // header readable whatever happens to float past.
    // Hold the scrim at close to full strength until past the subtitle's
    // baseline before fading: a gradient that thins out over the header itself
    // leaves the second line unprotected, which is exactly the line a cloud
    // was drifting behind.
    const hdrH = 7 + titleSz + 3 + 16;
    const scrim = ctx.createLinearGradient(0, 0, 0, hdrH + 24);
    scrim.addColorStop(0,    'rgba(8,20,40,0.62)');
    scrim.addColorStop(0.62, 'rgba(8,20,40,0.52)');
    scrim.addColorStop(1,    'rgba(8,20,40,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, hdrH + 24);
    ctx.font = `900 ${titleSz}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.shadowColor = '#FF8F00'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFD700';
    ctx.fillText('🗺️  World Map  🗺️', W / 2, 7);
    ctx.shadowBlur = 0;
    ctx.font = `bold 12px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFF176';
    ctx.fillText(`🍚 ${this.progress.getRicePoints()} Rice  ·  Tap a world to enter`, W / 2, 7 + titleSz + 3);

    // ── Selected stage info + PLAY button ─────────────────────
    const selWorld = PHONICS_DATA.WORLDS[this._worldSel];
    this._mapPlayBtnRect = null;
    if (selWorld) {
      const wUnlocked = this.progress.isUnlocked(selWorld.startId);
      const playBtnW = Math.min(150, W * 0.34);
      const playBtnH = Math.round(H * 0.066);
      const panW = Math.min(W - 20, 420);
      const panH = 80 + playBtnH + 12;
      const panX = (W - panW) / 2;
      const panY = H - panH - 10;
      const panGrad = ctx.createLinearGradient(panX, panY, panX, panY + panH);
      panGrad.addColorStop(0, 'rgba(10,20,40,0.88)');
      panGrad.addColorStop(1, 'rgba(5,15,30,0.94)');
      ctx.fillStyle = panGrad;
      ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, 16); ctx.fill();
      const selAccent = selWorld.accentColor || '#FFD700';
      ctx.strokeStyle = selAccent; ctx.lineWidth = 2;
      ctx.shadowColor = selAccent; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, 16); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.min(14, W * 0.034)}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = selAccent;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${selWorld.icon}  World ${selWorld.id}: ${selWorld.name}`, W / 2, panY + 8);
      ctx.font = `${Math.min(11, W * 0.025)}px system-ui`;
      ctx.fillStyle = 'rgba(200,220,255,0.75)';
      const nextStageId = selWorld.stageIds.find(id => !this.progress.getStage(id)?.completedAt) || selWorld.stageIds[selWorld.stageIds.length - 1];
      const trail = PHONICS_DATA.getLearningTrail?.(nextStageId);
      const questText = trail ? `${trail.stage.world}-${trail.stage.local} ${trail.quest?.title || trail.focus}` : `${selWorld.stageCount} stages`;
      const rewardText = trail?.quest?.powerUp ? `Reward: ${trail.quest.powerUp}` : 'Reward: Reading Star';
      ctx.fillText(`📚 ${selWorld.skill}`, W / 2, panY + 30);
      const panelIconKey = trail?.quest?.iconKey || 'power-boss-star';
      const panelIcon = this.sprites[panelIconKey];
      if (panelIcon && panelIcon.complete && panelIcon.naturalWidth > 0) {
        ctx.drawImage(panelIcon, panX + 14, panY + 30, 34, 34);
      }
      ctx.fillStyle = wUnlocked ? '#B2FF59' : 'rgba(255,255,255,0.38)';
      ctx.fillText(`🧭 Next quest: ${questText}`, W / 2 + 16, panY + 43);
      ctx.fillStyle = wUnlocked ? '#FFD54F' : 'rgba(255,255,255,0.30)';
      ctx.fillText(`⭐ ${rewardText}`, W / 2 + 16, panY + 56);
      const btnX  = W / 2 - playBtnW / 2;
      const btnY  = panY + 70;
      const tapP  = 0.75 + 0.25 * Math.sin(t * 0.10);
      const btnGd = ctx.createLinearGradient(btnX, btnY, btnX, btnY + playBtnH);
      if (wUnlocked) {
        btnGd.addColorStop(0, `rgba(0,220,110,${0.88 + 0.12 * tapP})`);
        btnGd.addColorStop(1, `rgba(0,150,60,${0.92 + 0.08 * tapP})`);
        ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 14 * tapP;
      } else {
        btnGd.addColorStop(0, 'rgba(90,110,120,0.85)');
        btnGd.addColorStop(1, 'rgba(50,60,70,0.9)');
      }
      ctx.fillStyle = btnGd;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, playBtnW, playBtnH, playBtnH / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, playBtnW, playBtnH, playBtnH / 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.min(15, W * 0.036)}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(wUnlocked ? '▶  ENTER WORLD' : '🔒 LOCKED', W / 2, btnY + playBtnH / 2);
      if (wUnlocked) this._mapPlayBtnRect = { x: btnX, y: btnY, w: playBtnW, h: playBtnH };
    }
    ctx.textBaseline = 'alphabetic';
  }
  // ── RUNNER UPDATE ────────────────────────────────────────────
  _updateRunner() {
    if (!this.runner) return;
    const _dt = this._frameDtSec || (1 / 60);

    // ── Nintendo 3-2-1 GO! countdown before gameplay ─────────
    if (this._runnerCountdownAge >= 0) {
      this._runnerCountdownAge++;
      this.runner.draw();                            // static first frame
      this._drawRunnerCountdown(this._runnerCountdownAge);
      if (this._runnerCountdownAge >= 185) this._runnerCountdownAge = -1;
      return;
    }

    // Fixed-step physics. Entity motion is tuned in per-frame units, so
    // driving it straight from wall-clock dt makes the game literally run
    // slower whenever frames are dropped. Stepping a fixed 1/60 s and
    // carrying the remainder keeps play at real-time pace instead.
    //
    // Catch-up is capped at two steps: past that, a device that cannot keep
    // up would be asked to simulate ever more per frame, fall further behind,
    // and spiral. Better to let a genuinely slow device run slightly slow.
    const STEP = 1 / 60;
    this._runnerAccum = Math.min((this._runnerAccum || 0) + _dt, STEP * 3);
    let steps = 0;
    while (this._runnerAccum >= STEP && steps < 2) {
      this.runner.update(STEP);
      this._runnerAccum -= STEP;
      steps++;
    }
    // Never skip a frame entirely — a dt shorter than one step still needs
    // the world advanced once, or input would feel dropped.
    if (steps === 0) { this.runner.update(_dt); this._runnerAccum = 0; }
    this.runner.draw();
    this._updateTutorial(_dt);
    this._drawTutorialOverlay(this.ctx);
    if (this.audio) {
      const hpPct = (this.runner.player?.hp || 1) / 3;
      const urgency = Math.max(0, 1 - hpPct);
      const speedFeel = Math.min(1, Math.abs(this.runner.player?.vx || 0) / 7);
      this.audio.setMusicIntensity?.(Math.max(urgency, speedFeel * 0.8));
    }
    if (!this.runner.done) return;
    if (this.runner.outcome === 'flag') {
      const coins = this.runner.getCollectedPhonemes();
      // Collecting EVERY coin in the run earns bonus battle damage
      this._runnerAllCoins = (this.runner.coins?.length || 0) > 0 &&
                             this.runner.coins.every(c => c.collected);
      this._lastRunnerScore = this.runner.score || 0;
      this._lastRunnerHp = this.runner?.player?.hp ?? 0;
      this.progress.recordRunnerComplete(this.stageId, this.runner.getCollectedCount());
      const scoreMsg = this._lastRunnerScore > 0 ? `\n⭐ Runner Score: ${this._lastRunnerScore.toLocaleString()}` : '';
      this._startTransition(
        `🦖 ${PHONICS_DATA.stageList[this.stageId - 1].bossName} appears!\n⚔️ Time to BLEND!${scoreMsg}`,
        () => this._startBattle(coins),
        130,
        true,  // show boss cinematic
      );
    } else if (this.runner.outcome === 'death') {
      this._startTransition('💦 Riku fell! Try again!', () => this._startRunner(), 90, false);
    } else {
      // Timeout: still go to battle with what was collected
      const coins = this.runner.getCollectedPhonemes();
      this._lastRunnerScore = this.runner.score || 0;
      this._lastRunnerHp = this.runner?.player?.hp ?? 0;
      this.progress.recordRunnerComplete(this.stageId, this.runner.getCollectedCount());
      this._startTransition(
        `⏱ Time's up! Boss battle with ${coins.length} phonemes!`,
        () => this._startBattle(coins),
        100,
        true,  // show boss cinematic
      );
    }
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    this._hideDpad();
  }

  // ── Nintendo 3-2-1 GO! countdown overlay ─────────────────────
  _drawRunnerCountdown(age) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    // 4 phases × 46 frames each: 3 → 2 → 1 → GO!
    const phase    = Math.floor(age / 46); // 0=3, 1=2, 2=1, 3=GO!
    const progress = (age % 46) / 46;      // 0→1 within each phase
    if (phase > 3) return;
    const labels = ['3', '2', '1', 'GO!'];
    const colors = ['#FF5252', '#FF9800', '#FFD700', '#69F0AE'];
    const label = labels[phase];
    const color = colors[phase];
    // Scale: 1.8 → 1.0 (pop in then settle), with bounce at end
    const scaleBase = phase < 3 ? 1.8 - 0.8 * progress : 1.0 + 0.4 * Math.sin(progress * Math.PI);
    const alpha = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;
    const sz = Math.min(W * 0.22, 100);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.max(0, alpha);
    // Dark backdrop pill
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, sz * scaleBase * 0.7, sz * scaleBase * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Number / text
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scaleBase, scaleBase);
    ctx.font = `900 ${sz}px "Nunito", Arial Black, sans-serif`;
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = Math.max(4, sz * 0.09);
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.restore();
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
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    const dur  = this._transDuration || 130;
    const prog = 1 - this._transFrames / dur;   // 0→1 over the full duration
    ctx.clearRect(0, 0, W, H);

    // ── Background: deep cinematic black ──────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, W, H);

    // ── Boss cinematic: slide boss sprite in from right ────────
    const bossStageId = this._transBossStageId;
    const isBossTrans = bossStageId > 0 && bossStageId <= PHONICS_DATA.stageCount;
    if (isBossTrans) {
      const stage     = PHONICS_DATA.stageList[bossStageId - 1];
      const bossKey   = stage?.bossFile;
      const bossSpr   = bossKey && this.sprites[bossKey];
      // Red atmospheric glow that builds as boss approaches
      const glowAlpha = Math.max(0, (prog - 0.1) / 0.5);
      const accent     = stage?.accentColor || '#FF3300';
      const glow = ctx.createRadialGradient(W * 0.72, H * 0.42, 0, W * 0.72, H * 0.42, W * 0.55);
      glow.addColorStop(0,   `${accent}${Math.round(glowAlpha * 0.45 * 255).toString(16).padStart(2,'0')}`);
      glow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      if (bossSpr && bossSpr.complete && bossSpr.naturalWidth > 0) {
        // Slide from off-screen right → right-third of screen
        const slideStart  = 0.15;
        const slideEnd    = 0.55;
        const slideProg   = Math.max(0, Math.min(1, (prog - slideStart) / (slideEnd - slideStart)));
        const easeOut     = 1 - Math.pow(1 - slideProg, 3);
        const bossH       = Math.min(H * 0.52, 280);
        const ar          = bossSpr.naturalWidth / bossSpr.naturalHeight;
        const bossW       = bossH * ar;
        const targetX     = W * 0.58;
        const bossX       = targetX + (W - targetX + bossW) * (1 - easeOut);
        const bossY       = H * 0.18;
        ctx.save();
        ctx.globalAlpha = Math.min(1, slideProg * 2);
        // Red shadow aura
        ctx.shadowColor = accent; ctx.shadowBlur = 28 * easeOut;
        ctx.drawImage(bossSpr, bossX - bossW / 2, bossY, bossW, bossH);
        ctx.restore();
      }

      // Menacing eye glow before boss arrives (prog 0.05–0.2)
      if (prog > 0.05 && prog < 0.30) {
        const eyeAlpha = Math.min(1, (prog - 0.05) / 0.1) * (1 - Math.max(0, (prog - 0.20) / 0.10));
        ctx.save();
        ctx.globalAlpha = eyeAlpha * 0.9;
        ctx.font = `${Math.min(W * 0.12, 55)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👁️', W * 0.75, H * 0.38);
        ctx.fillText('👁️', W * 0.72 - Math.min(W * 0.055, 28), H * 0.38);
        ctx.restore();
      }
    }

    // ── Dramatic slash line sweeps across ─────────────────────
    if (prog > 0.18 && prog < 0.82) {
      const sx = -W * 0.1 + W * 1.2 * (prog - 0.18) / 0.64;
      ctx.strokeStyle = 'rgba(255,215,0,0.55)';
      ctx.lineWidth = 5 + Math.sin(prog * Math.PI * 4) * 3;
      ctx.beginPath();
      ctx.moveTo(sx - 55, 0); ctx.lineTo(sx + 55, H);
      ctx.stroke();
    }

    // ── Message text ──────────────────────────────────────────
    const alpha = Math.min(1, Math.min(prog * 4, (1 - prog) * 4));
    ctx.save();
    ctx.globalAlpha = alpha;
    const lines = this._transMsg.split('\n');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Shift text left when boss is on the right
    const textX = isBossTrans ? W * 0.38 : W / 2;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 18;
    lines.forEach((line, i) => {
      const size = i === 0 ? Math.min(28, W * 0.062) : Math.min(20, W * 0.044);
      ctx.font = `bold ${size}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = i === 0 ? '#FFD700' : '#fff';
      ctx.fillText(line, textX, H / 2 + (i - (lines.length - 1) / 2) * (size + 10));
    });
    ctx.restore();
  }
  // ── BATTLE UPDATE ────────────────────────────────────────────
  _updateBattle() {
    if (!this.battle) return;
    // Combat is real-time now, so it needs the same fixed-step treatment the
    // runner has: sounds close on the player at a rate that must not depend
    // on how many frames the device managed to draw.
    const STEP = 1 / 60;
    const dt = this._frameDtSec || STEP;
    this._battleAccum = Math.min((this._battleAccum || 0) + dt, STEP * 3);
    let steps = 0;
    while (this._battleAccum >= STEP && steps < 2) {
      this.battle.update(STEP);
      this._battleAccum -= STEP;
      steps++;
    }
    if (steps === 0) { this.battle.update(dt); this._battleAccum = 0; }
    this.battle.draw();
    if (this.audio && this.battle?.bossMaxHp) {
      const intensity = 1 - (this.battle.bossHp / this.battle.bossMaxHp);
      this.audio.setMusicIntensity?.(Math.min(1, intensity + 0.2));
    }
    if (!this.battle.done) return;
    if (this.battle.outcome === 'victory') this._onStageWin();
    else this._onStageLose();
  }
  // ── PHASE 8: POST-BATTLE REWARDS SCREEN ──────────────────────
  // Shown for 2.8s after a victory before the full stage-win panel appears.
  // Tap anywhere to skip ahead immediately.
  _drawBattleResults() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    this._battleResultsAge = (this._battleResultsAge || 0) + 1;
    const t = this._battleResultsAge;

    // Dark purple → black background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0024');
    bg.addColorStop(1, '#1a0038');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle star field
    if (!this._brStars) {
      this._brStars = Array.from({length: 40}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.8 + 0.4,
        p: Math.random() * Math.PI * 2,
      }));
    }
    this._brStars.forEach(s => {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 0.06 + s.p);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Card slide-in from below
    const slideIn = Math.min(1, t / 18);           // 0→1 in 18 frames
    const slideEase = 1 - Math.pow(1 - slideIn, 3); // ease-out cubic
    const stats = this._battleResults || {};
    const learnedWords = (stats.learnedWords || []).slice(0, 8); // cap at 8 for layout
    const wordsRowH = learnedWords.length > 0 ? 52 + Math.ceil(learnedWords.length / 4) * 28 : 0;
    const cardW = Math.min(340, W - 40);
    const cardH = 310 + wordsRowH;
    const cardX = (W - cardW) / 2;
    const cardY = H / 2 - cardH / 2 + (1 - slideEase) * 80;

    // Card shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(cardX + 4, cardY + 8, cardW, cardH, 22); ctx.fill();

    // Card body — gradient border glow
    const cardGrd = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardGrd.addColorStop(0, 'rgba(40,10,70,0.97)');
    cardGrd.addColorStop(1, 'rgba(20,5,40,0.97)');
    ctx.fillStyle = cardGrd;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 22); ctx.fill();
    const borderPulse = 0.7 + 0.3 * Math.sin(t * 0.15);
    ctx.strokeStyle = `rgba(180,80,255,${borderPulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 22); ctx.stroke();

    // Title
    const titleAlpha = Math.min(1, (t - 4) / 10);
    ctx.save();
    ctx.globalAlpha = Math.max(0, titleAlpha);
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.font        = `900 ${Math.min(26, W * 0.058)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle   = '#FFD700';
    ctx.shadowColor = '#FF8C00'; ctx.shadowBlur = 16;
    ctx.fillText('⚔️ Battle Results!', W / 2, cardY + 18);
    ctx.restore();

    // Stats — each row counts up from 0 to final value
    const rows = [
      // `unit` is a prefix, `suffix` a trailing one: "×5" reads correctly with
      // the symbol in front, "82%" does not.
      { emoji: '📖', label: 'Words Blended',  val: stats.wordsBlended ?? 0, color: '#76FF03', unit: '' },
      { emoji: '🔥', label: 'Best Streak',    val: stats.bestStreak   ?? 0, color: '#FF9800', unit: '×' },
      { emoji: '🎯', label: 'Accuracy',        val: stats.accuracy     ?? 0, color: '#00E5FF', unit: '', suffix: '%' },
      { emoji: '🍚', label: 'Rice Earned',     val: stats.riceEarned   ?? 0, color: '#FFD700', unit: '' },
    ];

    rows.forEach((row, i) => {
      const rowDelay = 10 + i * 12;
      const rowAlpha = Math.min(1, Math.max(0, (t - rowDelay) / 8));
      // Count-up: animate from 0 → val over 20 frames after rowDelay
      const countProg = Math.min(1, Math.max(0, (t - rowDelay) / 20));
      const displayVal = Math.round(row.val * countProg);

      const rowY = cardY + 72 + i * 52;
      ctx.save();
      ctx.globalAlpha = rowAlpha;

      // Row background pill
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.roundRect(cardX + 12, rowY - 8, cardW - 24, 42, 10); ctx.fill();

      // Emoji + label
      ctx.font = `bold 15px "Nunito", "Comic Sans MS", system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`${row.emoji}  ${row.label}`, cardX + 24, rowY + 13);

      // Value (counts up)
      const scale = 1 + 0.15 * Math.max(0, Math.sin((t - rowDelay - 20) * 0.4)) * (countProg < 1 ? 1 : 0);
      ctx.textAlign = 'right';
      ctx.save();
      ctx.translate(cardX + cardW - 24, rowY + 13);
      ctx.scale(scale, scale);
      ctx.font = `900 ${Math.min(22, W * 0.048)}px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = row.color;
      ctx.shadowColor = row.color; ctx.shadowBlur = 8;
      ctx.fillText(`${row.unit || ''}${displayVal}${row.suffix || ''}`, 0, 0);
      ctx.restore();

      ctx.restore();
    });

    // "Words You Learned!" — educational summary of successfully blended words
    if (learnedWords.length > 0) {
      const wordsY = cardY + 72 + rows.length * 52 + 8;
      const wordsAlpha = Math.min(1, Math.max(0, (t - 60) / 12));
      ctx.save();
      ctx.globalAlpha = wordsAlpha;

      // Section header
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(cardX + 12, wordsY, cardW - 24, wordsRowH - 8, 10); ctx.fill();
      ctx.font = `bold 13px "Nunito", "Comic Sans MS", system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#76FF03';
      ctx.shadowColor = '#76FF03'; ctx.shadowBlur = 6;
      ctx.fillText('📚 Words you learned today:', cardX + 20, wordsY + 8);
      ctx.shadowBlur = 0;

      // Word chips — up to 8 words in wrapping rows of 4
      learnedWords.forEach((w, wi) => {
        const col  = wi % 4;
        const row  = Math.floor(wi / 4);
        const chipW = (cardW - 28) / 4 - 4;
        const chipX = cardX + 14 + col * (chipW + 4);
        const chipY = wordsY + 28 + row * 28;
        // Chip bg
        ctx.fillStyle = 'rgba(118,255,3,0.18)';
        ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, 22, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(118,255,3,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, 22, 6); ctx.stroke();
        // Word text
        ctx.font = `bold 11px "Nunito", system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(w.toUpperCase(), chipX + chipW / 2, chipY + 11);
      });
      ctx.restore();
    }

    // "Tap to continue" hint fades in at t=55
    const tapAlpha = Math.min(1, Math.max(0, (t - 55) / 15)) * (0.6 + 0.4 * Math.sin(t * 0.14));
    ctx.save();
    ctx.globalAlpha = tapAlpha;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.font        = `bold 14px "Nunito", system-ui`;
    ctx.fillStyle   = 'rgba(255,255,255,0.75)';
    ctx.fillText('Tap to continue →', W / 2, cardY + cardH - 22);
    ctx.restore();

    ctx.textBaseline = 'alphabetic';
  }

  // ── STAGE WIN SCREEN ─────────────────────────────────────────
  _drawStageWin() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    this._stageWinAge = (this._stageWinAge || 0) + 1;
    const t = this._stageWinAge;
    ctx.clearRect(0, 0, W, H);
    UI.scene(ctx, this.sprites['victory-golden-harvest'], W, H,
             this._sceneHolders.win, 'stagewin', 0.85);
    // Confetti — colored rect particles + emoji sprinkles
    if (this._confetti) {
      for (const p of this._confetti) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.emoji) {
          ctx.font = '18px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.emoji, 0, 0);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
    }
    // Panel slides down from above (ease-out over 28 frames)
    const panelSlide = Math.min(1, t / 28);
    const panelEase  = 1 - Math.pow(1 - panelSlide, 3);
    const pw = Math.min(360, W - 40);
    const ph = (stage.isBoss && (stage.sentences || []).length > 0) ? 420 : 366;
    const px = (W - pw) / 2;
    const pyTarget = (H - ph) / 2;
    const py = pyTarget - (1 - panelEase) * (pyTarget + ph * 0.5);
    ctx.save();
    ctx.globalAlpha = panelEase;
    ctx.fillStyle = 'rgba(18,12,20,0.93)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = UI.THEME.goldDim; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = panelEase;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `900 ${Math.min(32, W * 0.068)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.rice;
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10;
    ctx.fillText('VICTORY', W / 2, py + 18);
    ctx.shadowBlur = 0;
    const rw = Math.min(190, pw * 0.55);
    const rule = ctx.createLinearGradient(W / 2 - rw / 2, 0, W / 2 + rw / 2, 0);
    rule.addColorStop(0, 'rgba(242,193,78,0)');
    rule.addColorStop(0.5, UI.THEME.gold);
    rule.addColorStop(1, 'rgba(242,193,78,0)');
    ctx.fillStyle = rule;
    ctx.fillRect(W / 2 - rw / 2, py + 56, rw, 2);
    ctx.font = `800 15px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.fillText(`Stage ${this.stageId} · ${stage.name}`, W / 2, py + 66);
    ctx.restore();

    // Stars fly in one-by-one (staggered, scale bounce)
    const stars = this.progress.getStars(this.stageId);
    const starDelay = [30, 44, 58]; // frame when each star arrives
    for (let s = 0; s < 3; s++) {
      const starAge = Math.max(0, t - starDelay[s]);
      const starProg = Math.min(1, starAge / 14);
      // Scale: 0 → 1.5 → 1.0 (pop then settle)
      const scl = starProg < 0.6 ? starProg / 0.6 * 1.5 : 1.5 - (starProg - 0.6) / 0.4 * 0.5;
      const earned = s < stars;
      const alpha = earned ? Math.min(1, starAge / 8) : 0.2;
      if (starAge === 0) continue; // not yet revealed
      ctx.save();
      ctx.globalAlpha = alpha;
      const sx = W / 2 - 52 + s * 52;
      const sy = py + 98;
      ctx.translate(sx, sy);
      ctx.scale(scl, scl);
      if (earned && scl > 1.2) {
        // Glow burst on pop
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        glow.addColorStop(0, 'rgba(255,220,0,0.7)');
        glow.addColorStop(1, 'rgba(255,220,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = '36px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⭐', 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // ── Kid-friendly summary — celebration, not statistics ──────
    // (accuracy / mastery jargon lives in the parent dashboard)
    ctx.font = `bold ${Math.min(17, W * 0.04)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFE082';
    ctx.fillText(`You defeated ${stage.bossName}! 🎊`, W / 2, py + 152);

    const masteredWords = this.progress.getMasteredWords(this.stageId);
    ctx.font = `bold 15px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    if (masteredWords.length > 0) {
      const preview = masteredWords.slice(0, 4).map(w => w.toUpperCase()).join(' · ');
      ctx.fillText(`📖 New words you can read: ${preview}`, W / 2, py + 180);
    } else {
      ctx.fillText(`📖 Great blending — keep it up!`, W / 2, py + 180);
    }
    ctx.fillStyle = '#FFD700';
    const bonus = this._stageWinMastery?.bonus > 0 ? this._stageWinMastery.bonus : 0;
    ctx.fillText(`🍚 +${stars * 50 + 20 + bonus} rice earned!`, W / 2, py + 206);

    // Boss stages earn the Read-with-Riku capstone: real decodable
    // sentences made only of taught patterns — reading independently.
    const hasStory = stage.isBoss && (stage.sentences || []).length > 0;
    if (hasStory) {
      ctx.font = `bold 14px "Nunito", "Comic Sans MS", system-ui`;
      ctx.fillStyle = '#80D8FF';
      ctx.fillText('🎁 A story scroll appeared!', W / 2, py + 224);
    }

    // Buttons — big and thumb-friendly
    this._resultBtnRects = [
      ...(hasStory ? [{
        label: '📖 Read with Riku  (+50 🍚)', primary: true,
        x: W/2 - 130, y: py + 240, w: 260, h: 46,
        action: () => this._openStoryScroll(stage),
      }] : []),
      { label: this._previewStage ? '▶ Start my adventure' : '▶ Next Stage',
        primary: !hasStory,
        x: W/2 - 110, y: py + (hasStory ? 294 : 240), w: 220, h: hasStory ? 44 : 54,
        action: () => {
          if (this._previewStage) {
            this._previewStage = false;
            this._launchStage(this.progress.nextStageId(PHONICS_DATA.stageList.length));
            return;
          }
          if (this.stageId < PHONICS_DATA.stageCount && this.progress.isUnlocked(this.stageId + 1)) {
            this.stageId++;
            // Keep the world selection in sync so returning to the map lands right.
            this._worldSel = (PHONICS_DATA.worldOf(this.stageId) || 1) - 1;
            this._launchStage(this.stageId);
          } else {
            this._worldSel = (PHONICS_DATA.worldOf(this.stageId) || 1) - 1;
            this.state = 'world-map'; this._stateEntryFade = 1.0;
          }
        }
      },
      { label: '🗺 Map', primary: false,
        x: W/2 - 168, y: py + (hasStory ? 348 : 306), w: 160, h: 40,
        action: () => { this.state = 'world-map'; this._stateEntryFade = 1.0; }
      },
      { label: '💬 Share', primary: false,
        x: W/2 + 8, y: py + (hasStory ? 348 : 306), w: 160, h: 40,
        action: () => this._shareStageWin(stage),
      },
    ];
    this._drawResultButtons(ctx);
    this._drawShareToast(ctx, W, H);
    ctx.textBaseline = 'alphabetic';
  }

  /** Brief confirmation after a share — silent success reads as a dead button. */
  _drawShareToast(ctx, W, H) {
    const t = this._shareToast;
    if (!t) return;
    if (++t.age > 150) { this._shareToast = null; return; }
    const fade = t.age > 110 ? 1 - (t.age - 110) / 40 : Math.min(1, t.age / 8);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.font = `800 14px ${UI.THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(t.text).width + 34;
    const y = H - 58;
    ctx.fillStyle = 'rgba(14,9,13,0.92)';
    ctx.strokeStyle = UI.THEME.goldDim;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y, w, 32, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = UI.THEME.gold;
    ctx.fillText(t.text, W / 2, y + 16.5);
    ctx.restore();
  }

  /**
   * Share what the child just did.
   *
   * The share unit for a phonics game is not a high score — a five-year-old
   * is not going to post one. What travels is a grown-up telling another
   * grown-up that their kid read some words, which is how this kind of game
   * actually spreads: parent to parent, teacher to teacher. So the message
   * names the words, and the link lands on the stage rather than a menu.
   *
   * Uses the native share sheet where there is one (which is where WhatsApp
   * and Messages live), and falls back to the clipboard everywhere else.
   */
  _shareStageWin(stage) {
    const words = (this._battleResults?.learnedWords || []).slice(0, 5);
    const stars = this.progress.getStars(this.stageId);
    const label = stage.world ? `${stage.world}-${stage.local}` : `${this.stageId}`;

    const read = words.length
      ? `They read ${words.slice(0, -1).join(', ')}${words.length > 1 ? ' and ' : ''}${words[words.length - 1]}.`
      : 'They cleared it without a single miss.';
    const text = `My reader just beat ${stage.bossName || 'the boss'} on stage ${label} `
               + `${'⭐'.repeat(Math.max(1, stars))}\n${read}\n\nSamurice Dino Slash — free, no app needed:`;

    let url = location.href;
    try {
      const u = new URL(location.href);
      u.search = `?s=${this.stageId}`;
      u.hash = '';
      url = u.toString();
    } catch (_) { /* keep the plain href */ }

    const done = msg => { this._shareToast = { text: msg, age: 0 }; };
    const payload = `${text}\n${url}`;

    const shareText = () => {
      if (navigator.share) {
        navigator.share({ title: 'Samurice Dino Slash', text, url })
          .then(() => done('Shared!'))
          .catch(() => { /* the user dismissed the sheet — not an error */ });
        return;
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(payload)
          .then(() => done('Copied — paste it anywhere'))
          .catch(() => done('Could not copy'));
      } else {
        done('Sharing is not available here');
      }
    };

    // Try the picture first. Text travels in a message; an image travels
    // everywhere else, and the words the child read are the whole point of
    // sending it. Every failure path falls through to the text share rather
    // than leaving the button doing nothing.
    done('Making your card…');
    this._composeEndCard(stage).then(blob => {
      if (!blob) { shareText(); return; }
      const file = new File([blob], 'samurice-win.jpg', { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        navigator.share({ title: 'Samurice Dino Slash', text, url, files: [file] })
          .then(() => done('Shared!'))
          .catch(() => { this._shareToast = null; });
        return;
      }
      // No file sharing here: hand over the image itself so it can be saved,
      // and put the text on the clipboard alongside it.
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'samurice-win.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(payload).catch(() => {});
      }
      done('Card saved — text copied too');
    }).catch(() => shareText());
  }

  /**
   * Compose the shareable end card.
   *
   * The share used to be text only, which is fine in a message and invisible
   * everywhere images travel. This paints an actual picture of the win —
   * the boss that was beaten, the words that were read — at 1200x630, the
   * proportion every link preview and social surface expects.
   *
   * Returns a Promise of a Blob, or null when the browser cannot produce
   * one; callers must fall back to the text share rather than failing.
   */
  _composeEndCard(stage) {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return Promise.resolve(null);

    const T = UI.THEME;
    const words = (this._battleResults?.learnedWords || []).slice(0, 5);
    const stars = Math.max(1, this.progress.getStars(this.stageId));
    const label = stage.world ? `${stage.world}-${stage.local}` : `${this.stageId}`;
    const who = this.progress.getPlayerName() || 'My reader';

    // Ground: the arena the fight happened in, or the ink field if it has
    // not loaded — a card that renders half-drawn is worse than a plain one.
    const bg = this.sprites[stage.arenaBg] || this.sprites[stage.bg];
    if (bg && bg.complete && bg.naturalWidth > 0) {
      const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
      g.drawImage(bg, (W - bg.naturalWidth * s) / 2, (H - bg.naturalHeight * s) / 2,
                  bg.naturalWidth * s, bg.naturalHeight * s);
    } else {
      g.fillStyle = T.ink; g.fillRect(0, 0, W, H);
    }
    const scrim = g.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(12,7,16,0.76)');
    scrim.addColorStop(0.55, 'rgba(12,7,16,0.62)');
    scrim.addColorStop(1, 'rgba(8,5,12,0.88)');
    g.fillStyle = scrim; g.fillRect(0, 0, W, H);

    // Gold rule top and bottom, so the card reads as a made thing.
    g.fillStyle = T.gold;
    g.fillRect(0, 0, W, 6);
    g.fillRect(0, H - 6, W, 6);

    const drawSprite = (sprite, cx, baseY, maxH, flip) => {
      if (!sprite || !sprite.complete || !sprite.naturalWidth) return;
      const ar = sprite.naturalWidth / sprite.naturalHeight;
      const h = maxH, w = h * ar;
      g.save();
      g.translate(cx, baseY - h);
      if (flip) { g.translate(w, 0); g.scale(-1, 1); }
      g.globalAlpha = 0.96;
      g.drawImage(sprite, -w / 2 + (flip ? w / 2 : 0), 0, w, h);
      g.restore();
    };
    // Riku on the left, boss on the right. Boss art all faces left after
    // tools/normalise-facing, so on the right it already faces Riku.
    drawSprite(this.sprites['riku-idle'] || this.sprites['riku-run'], 140, H - 58, 260, false);
    drawSprite(this.sprites[stage.bossFile], W - 235, H - 46, 300, false);

    g.textAlign = 'center';
    g.textBaseline = 'top';

    g.font = `800 26px ${T.font}`;
    g.fillStyle = T.gold;
    g.fillText(`STAGE ${label} CLEARED`, W / 2, 52);

    g.font = `900 ${words.length ? 54 : 62}px ${T.font}`;
    g.fillStyle = T.rice;
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 18;
    g.fillText(`${who} beat ${stage.bossName || 'the boss'}`, W / 2, 92);
    g.shadowBlur = 0;

    g.font = '34px serif';
    g.fillText('⭐'.repeat(stars), W / 2, 162);

    if (words.length) {
      g.font = `700 22px ${T.font}`;
      g.fillStyle = T.muted;
      g.fillText('READ WITHOUT HELP', W / 2, 232);

      // The words are the point of the card, so they get the largest type
      // and enough room to be legible in a thumbnail.
      const size = words.length > 4 ? 52 : 62;
      g.font = `900 ${size}px ${T.font}`;
      const widths = words.map(w => g.measureText(w).width + 40);
      const total = widths.reduce((a, b) => a + b, 0) + 16 * (words.length - 1);
      let x = (W - total) / 2;
      words.forEach((word, i) => {
        const w = widths[i], h = size + 30, y = 272;
        g.fillStyle = 'rgba(20,13,18,0.72)';
        g.strokeStyle = T.goldDim;
        g.lineWidth = 2;
        g.beginPath(); g.roundRect(x, y, w, h, 16); g.fill(); g.stroke();
        g.fillStyle = T.rice;
        g.textBaseline = 'middle';
        g.fillText(word, x + w / 2, y + h / 2 + 2);
        g.textBaseline = 'top';
        x += w + 16;
      });
    }

    g.font = `800 26px ${T.font}`;
    g.fillStyle = T.rice;
    g.fillText('SAMURICE DINO SLASH', W / 2, H - 92);
    g.font = `700 20px ${T.font}`;
    g.fillStyle = T.muted;
    g.fillText('Free phonics adventure — no app needed', W / 2, H - 58);

    // JPEG, not PNG: the card is full-bleed painted art with no
    // transparency, and the PNG of it was over a megabyte — big enough that
    // some share targets would refuse or recompress it anyway.
    return new Promise(resolve => {
      try { c.toBlob(b => resolve(b), 'image/jpeg', 0.9); }
      catch (_) { resolve(null); }
    });
  }

  // ── READ WITH RIKU — decodable-sentence capstone ──────────────
  // After each world boss, the child reads real sentences built only
  // from patterns they've been taught (PhonicsQuest journey step 5:
  // reading independently). Every word is tappable for TTS support.
  _openStoryScroll(stage) {
    if (this._storyEl) this._storyEl.remove();
    const sentences = stage.sentences || [];
    if (!sentences.length) return;
    let idx = 0;

    const el = document.createElement('div');
    el.className = 'story-scroll';
    el.innerHTML = `
      <div class="story-card">
        <button class="story-close" aria-label="Close">✕</button>
        <h3 class="story-title">📖 Read with Riku</h3>
        <p class="story-sub">Tap any word to hear it. Read the sentence out loud!</p>
        <div class="story-sentence"></div>
        <div class="story-progress"></div>
        <div class="story-btns">
          <button class="story-hear">🔊 Read to me</button>
          <button class="story-done">✅ I read it!</button>
        </div>
      </div>`;
    document.getElementById('slashWrapper')?.appendChild(el);
    this._storyEl = el;

    const sentEl = el.querySelector('.story-sentence');
    const progEl = el.querySelector('.story-progress');
    const render = () => {
      const words = sentences[idx].split(' ');
      sentEl.innerHTML = '';
      words.forEach(w => {
        const b = document.createElement('button');
        b.className = 'story-word';
        b.textContent = w;
        b.addEventListener('click', () => {
          const clean = w.replace(/[^a-zA-Z']/g, '').toLowerCase();
          if (clean) this.audio?.playWord(clean);
          b.classList.add('story-word-heard');
        });
        sentEl.appendChild(b);
      });
      progEl.textContent = `Sentence ${idx + 1} of ${sentences.length}`;
    };
    render();

    el.querySelector('.story-hear').addEventListener('click', () => {
      this.audio?.speak?.(sentences[idx], 0.72, 1.05);
    });
    el.querySelector('.story-done').addEventListener('click', () => {
      this.audio?.sfxPerfectBlend?.();
      idx++;
      if (idx >= sentences.length) {
        this.progress.addRiceGrains(50);
        this._queueAchievementPopup({ emoji: '📖', name: 'Story Read!', desc: '+50 Rice Grains — you read it yourself!' });
        this.audio?.speak?.('Amazing reading! You read the whole scroll!', 0.9, 1.15);
        el.remove();
        this._storyEl = null;
      } else {
        render();
      }
    });
    el.querySelector('.story-close').addEventListener('click', () => {
      el.remove();
      this._storyEl = null;
    });
  }

  // ── STAGE LOSE SCREEN ────────────────────────────────────────
  _drawStageLose() {
    const ctx = this.ctx;
    const W = this.W; const H = this.H;
    this._stageLoseAge = (this._stageLoseAge || 0) + 1;
    const t = this._stageLoseAge;
    ctx.clearRect(0, 0, W, H);
    // Warm amber background — NOT harsh red (Nintendo never shames players)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0e00');
    bg.addColorStop(1, '#2a1a00');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Gentle floating rice grains (you still earned some!)
    for (let i = 0; i < 6; i++) {
      const gx = ((i * 97 + t * 0.3) % (W + 20)) - 10;
      const gy = ((t * 0.2 + i * 60) % H);
      ctx.globalAlpha = 0.08 + 0.05 * Math.sin(t * 0.04 + i);
      ctx.font = '16px serif'; ctx.textAlign = 'center';
      ctx.fillText('🌾', gx, gy);
    }
    ctx.globalAlpha = 1;
    // Panel slides up from below
    const slideIn = Math.min(1, t / 26);
    const easeOut = 1 - Math.pow(1 - slideIn, 3);
    const pw = Math.min(360, W - 40);
    const ph = 320;
    const px = (W - pw) / 2;
    const pyTarget = (H - ph) / 2;
    const py = pyTarget + (1 - easeOut) * 60;
    ctx.save();
    ctx.globalAlpha = easeOut;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.fill();
    // Warm amber border (not scary red)
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    // Riku — still looking determined (not hurt!)
    const rikuSpr = this.sprites['riku-idle'] || this.sprites['riku-run'];
    const rikuH = Math.round(ph * 0.26);
    const bob = Math.sin(t * 0.07) * 4;
    if (rikuSpr && rikuSpr.complete && rikuSpr.naturalWidth > 0) {
      const ar = rikuSpr.naturalWidth / rikuSpr.naturalHeight;
      const rW = rikuH * ar;
      ctx.save(); ctx.globalAlpha = easeOut;
      ctx.drawImage(rikuSpr, W / 2 - rW / 2, py + 12 + bob, rW, rikuH);
      ctx.restore();
    }
    // Encouraging headline
    ctx.save();
    ctx.globalAlpha = easeOut;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.min(24, W * 0.055)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FF8C00'; ctx.shadowBlur = 10;
    ctx.fillText('💪 So Close!', W / 2, py + rikuH + 22);
    ctx.shadowBlur = 0;
    // Warm coaching message
    const stage = PHONICS_DATA.stageList[this.stageId - 1];
    ctx.font = `bold ${Math.min(15, W * 0.036)}px "Nunito", "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFE082';
    ctx.fillText("Riku is ready to try again!", W / 2, py + rikuH + 58);
    ctx.font = `${Math.min(13, W * 0.031)}px "Nunito", system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const pattern = stage?.pattern || 'phonics';
    ctx.fillText(`Tip: collect as many coins as you can`, W / 2, py + rikuH + 82);
    ctx.fillText(`to get more "${pattern}" tiles in the battle!`, W / 2, py + rikuH + 100);
    ctx.restore();
    this._resultBtnRects = [
      { label: '🔄 Try Again', primary: true, x: W/2 - 100, y: py + ph - 118, w: 200, h: 46,
        action: () => { this._stageLoseAge = 0; this._launchStage(this.stageId); } },
      { label: '🗺 World Map', primary: false, x: W/2 - 75, y: py + ph - 60, w: 150, h: 36,
        action: () => { this._stageLoseAge = 0; this.state = 'world-map'; } },
    ];
    this._drawResultButtons(ctx);
    ctx.textBaseline = 'alphabetic';
  }
  _drawResultButtons(ctx) {
    this._resultBtnRects.forEach((btn, idx) => {
      const isPrimary = btn.primary !== undefined ? btn.primary : idx === 0;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(btn.x + 2, btn.y + 3, btn.w, btn.h, 10); ctx.fill();
      // Primary = vivid green with glow; secondary = muted slate
      if (isPrimary) {
        const g = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
        g.addColorStop(0, '#D8433A');
        g.addColorStop(1, UI.THEME.lacquerDk);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 13); ctx.fill();
        ctx.strokeStyle = 'rgba(255,226,168,0.55)'; ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(28,18,26,0.88)';
        ctx.beginPath(); ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 13); ctx.fill();
        ctx.strokeStyle = UI.THEME.stroke; ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Label
      ctx.fillStyle = isPrimary ? '#FFF8E9' : UI.THEME.rice;
      ctx.font = `${isPrimary ? 900 : 800} ${Math.min(18, btn.w * 0.09)}px ${UI.THEME.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.textBaseline = 'top';
    });
  }
  // ══════════════════════════════════════════════════════════════
  // NEW STATE METHODS — Title, Mode Select, Endless, Shop, Daily,
  // Achievements, Leaderboard, Achievement Popups
  // ══════════════════════════════════════════════════════════════
  // ── TITLE SCREEN ─────────────────────────────────────────────
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
    // Same painted-and-scrimmed treatment as the title screen, so pressing
    // PLAY does not drop the player from a painted scene into a flat gradient.
    UI.scene(ctx, this.sprites['arena-3'], W, H, this._sceneHolders.modeSelect, 'modeselect');

    const afterHeading = UI.heading(ctx, 'CHOOSE YOUR ADVENTURE', W, 16);
    // Left, not right: the fullscreen and close buttons are DOM elements
    // floating over the top-right of the canvas and would cover it.
    UI.chip(ctx, `${this.progress.getRiceGrains()} rice`, 12, 14);

    // Campaign is what the game is; everything else is a side door. It gets
    // the one primary card, and the rest share a neutral treatment rather
    // than eight competing colours.
    const daily = this.progress.getDailyCompleted();
    const primary = {
      label: 'Campaign', sub: `${PHONICS_DATA.WORLDS.length} worlds · ${PHONICS_DATA.stageList.length} stages`,
      action: 'campaign', primary: true,
    };
    // Review sits second, right under Campaign: it is the reason to open the
    // game on a day when there is no new stage to play, and burying it in a
    // rewards drawer would have made it a chore nobody found.
    const ladder = window.Review?.shared?.();
    const due = ladder ? ladder.todaysQueue().length : 0;
    const rest = [
      { label: 'Daily Review',
        sub: due ? `${due} word${due === 1 ? '' : 's'} ready` : 'All caught up today',
        action: 'review', locked: due === 0 && !!ladder,
        pulse: due ? 0.5 + 0.5 * Math.sin(t * 0.09) : 0 },
      { label: 'Endless Run', sub: 'How far can you go?', action: 'endless' },
      { label: 'Daily Challenge', sub: daily ? 'Done today' : 'Fresh challenge',
        action: 'daily', pulse: daily ? 0 : 0.5 + 0.5 * Math.sin(t * 0.09) },
      { label: 'Shop', sub: 'Spend your rice', action: 'shop' },
      { label: 'Record Book', sub: 'Your best Dino Dash runs', action: 'leaderboard' },
      { label: 'Achievements', sub: `${this.progress.data.achievements.length} of ${ACHIEVEMENTS.length}`,
        action: 'achievements' },
      { label: 'Progress', sub: 'Parent / teacher view', action: 'dashboard' },
      { label: 'How to Play', sub: 'Watch the tutorial', action: 'tutorial' },
    ];

    this._modeSelectRects = [];
    const colW = Math.min((W - 48) / 2, 260);
    const gridW = colW * 2 + 12;
    const x0 = (W - gridW) / 2;

    const heroH = Math.min(64, H * 0.14);
    const heroRect = { x: x0, y: afterHeading + 6, w: gridW, h: heroH };
    UI.card(ctx, heroRect, { ...primary, labelSize: 20, subSize: 12 });
    this._modeSelectRects.push({ ...heroRect, action: primary.action });

    const rows = Math.ceil(rest.length / 2);
    const gridTop = heroRect.y + heroH + 10;
    const avail = H - gridTop - 44;
    const cellH = Math.max(38, Math.min(52, (avail - (rows - 1) * 8) / rows));

    rest.forEach((m, i) => {
      const r = {
        x: x0 + (i % 2) * (colW + 12),
        y: gridTop + Math.floor(i / 2) * (cellH + 8),
        w: colW, h: cellH,
      };
      UI.card(ctx, r, { ...m, labelSize: 14, subSize: 10.5 });
      this._modeSelectRects.push({ ...r, action: m.action });
    });

    const back = UI.ghost(ctx, 'Back', W / 2, H - 34);
    this._modeSelectRects.push({ ...back, action: 'back' });
  }
  _clickModeSelect(mx, my) {
    const rects = this._modeSelectRects || [];
    for (const r of rects) {
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        if (r.action === 'review') { this._startReview(); this._stateEntryFade = 1.0; }
        if (r.action === 'endless') { this._startEndlessRunner(); this._stateEntryFade = 1.0; }
        if (r.action === 'campaign') { this._worldSel = this._furthestUnlockedWorldIdx(); this.state = 'world-map'; this._stateEntryFade = 1.0; }
        if (r.action === 'daily') { this._startDaily(); this._stateEntryFade = 1.0; }
        if (r.action === 'shop') { this._startShop(); this._stateEntryFade = 1.0; }
        if (r.action === 'leaderboard') { this.state = 'leaderboard'; this._stateEntryFade = 1.0; }
        if (r.action === 'achievements') { this.state = 'achievements'; this._stateEntryFade = 1.0; }
        // There used to be two parent dashboards — this canvas one and the
        // DOM screen behind "Progress" on the title screen — showing
        // overlapping subsets of the same data. Only the DOM one is kept;
        // it is the richer of the two and the one a parent can read on a
        // phone without the game running underneath it.
        if (r.action === 'dashboard') { exitSlash(); window._parentDashboard?.show?.(); return; }
        if (r.action === 'tutorial')     { this._startOnboarding(() => { this.state = 'mode-select'; this._stateEntryFade = 1.0; }); }
        if (r.action === 'back') { exitSlash(); }
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
    this._showPauseBtn();
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
    runner.update(this._frameDtSec || (1 / 60));
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
      const intensity = Math.min(1, runner._distM / 2200);
      this.audio.setMusicIntensity?.(intensity);
    }
  }
  _startEndlessBattle() {
    // Guard: if a battle is already live (e.g. callback fired mid-frame), bail out.
    if (this.endlessBattle) return;
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
      gateData.autoBlend,
      gateData.slowMoBonus || 0
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
    // isDone() returns true only after the onDone callback has already fired from
    // within update(). The state should now be 'endless-runner'. If for any reason
    // the callback wasn't invoked (defensive), force cleanup here.
    if (battle.isDone() && this.state === 'endless-battle') {
      this._onEndlessBattleDone('miss', 0);
    }
  }
  _onEndlessBattleDone(result, timeUsed) {
    const runner = this.endlessRunner;
    const word = this.endlessBattle?.word;
    const isPerfect = result === 'perfect';
    const success = result === 'perfect' || result === 'good';
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
      runner.done = false;
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
    this._hidePauseBtn();
    this.audio?.stopMusic();
    if (this.audio) this.audio.sfxGameOver();
    const score = runner.getScore();
    const dist = runner.getDist();
    const grains= runner.getGrains();
    const combo = runner.getMaxCombo();
    const perfects = runner.getPerfects();
    // Rice grains are now banked live during collection in endless runner.
    this.progress.recordEndlessRun(score, dist, combo);
    this.progress.recordPerfectBlends(perfects);
    // Store for display
    this._lastEndlessResult = { score, dist, grains, combo, perfects };
    this._endlessGameoverAge = 0;
    this.state = 'endless-gameover';
  }
  _drawEndlessGameover() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const t = this._endlessGameoverAge = (this._endlessGameoverAge || 0) + 1;
    const r = this._lastEndlessResult || {};
    const hs = this.progress.getEndlessHighScore();
    const newBest = (r.score || 0) >= hs && (r.score || 0) > 0;

    ctx.clearRect(0, 0, W, H);
    UI.scene(ctx, this.sprites['arena-1'], W, H, this._sceneHolders.endlessOver,
             'endlessover', 1.5);

    // "GAME OVER" in red was the old headline. A five-year-old who just fell
    // in a hole does not need to be told they lost in the largest type on
    // screen; they need to be told how far they got and offered another go.
    const title = newBest ? 'NEW BEST!' : 'NICE RUN';
    const afterHeading = UI.heading(ctx, title, W, Math.max(10, H * 0.045));

    ctx.textAlign = 'center';

    // The distance is the hero stat — it is what the run was about.
    ctx.textBaseline = 'alphabetic';
    const distSize = Math.min(52, W * 0.115, H * 0.14);
    const pop = Math.min(1, t / 12);
    ctx.save();
    ctx.translate(W / 2, afterHeading + 14 + distSize);
    ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
    ctx.font = `900 ${distSize}px ${UI.THEME.font}`;
    ctx.fillStyle = newBest ? UI.THEME.gold : UI.THEME.rice;
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 12;
    ctx.fillText(`${r.dist || 0}m`, 0, 0);
    ctx.restore();

    let y = afterHeading + 26 + distSize;

    // Three quiet stat cards rather than four full-width bars with the
    // numbers stranded at the far edge.
    const stats = [
      ['Score', (r.score || 0).toLocaleString(), UI.THEME.rice],
      ['Rice', `+${r.grains || 0}`, UI.THEME.gold],
      ['Best combo', `${r.combo || 0}x`, '#FF9E7A'],
    ];
    const colW = Math.min(132, (W - 56) / 3);
    const x0 = (W - colW * 3 - 16) / 2;
    const cardH = Math.min(52, H * 0.11);
    stats.forEach(([label, value, tone], i) => {
      const rc = { x: x0 + i * (colW + 8), y, w: colW, h: cardH };
      ctx.fillStyle = UI.THEME.panel;
      ctx.strokeStyle = UI.THEME.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(rc.x, rc.y, rc.w, rc.h, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tone;
      ctx.font = `900 ${Math.min(19, W * 0.043)}px ${UI.THEME.font}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, rc.x + rc.w / 2, rc.y + cardH * 0.52);
      ctx.fillStyle = UI.THEME.muted;
      ctx.font = `700 10px ${UI.THEME.font}`;
      ctx.fillText(label, rc.x + rc.w / 2, rc.y + cardH - 9);
    });
    y += cardH + 10;

    // Where this run landed in the book — a real placing among this
    // device's own runs, not a rank against invented strangers.
    const book = this.progress.getRecordBook();
    const place = book.findIndex(b => b.score === (r.score || 0));
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.min(12.5, W * 0.03)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    const ord = ['1st', '2nd', '3rd'][place] || `${place + 1}th`;
    ctx.fillText(
      newBest ? 'Your best run yet on this device'
      : place >= 0 ? `${ord} best on this device · best is ${hs.toLocaleString()}`
      : `Best so far: ${hs.toLocaleString()}`,
      W / 2, y);
    y += 22;

    // ── Buttons ───────────────────────────────────────────────
    this._endlessGameoverRects = [];
    const bw = Math.min(240, W - 72);
    const again = { x: (W - bw) / 2, y: Math.min(y + 4, H - 92), w: bw, h: Math.min(46, H * 0.1) };
    UI.card(ctx, again, { label: 'Run again', sub: 'Straight back in',
                          primary: true, labelSize: 16, subSize: 10.5 });
    this._endlessGameoverRects.push({ ...again, label: 'AGAIN' });

    const ghosts = [['Shop', 'SHOP'], ['Record book', 'BOOK'], ['Menu', 'MENU']];
    const gy = again.y + again.h + 10;
    let gx = 0;
    const widths = ghosts.map(([label]) => {
      ctx.font = `800 12px ${UI.THEME.font}`;
      return ctx.measureText(label).width + 30;
    });
    const totalW = widths.reduce((a, b) => a + b, 0) + 8 * (ghosts.length - 1);
    gx = (W - totalW) / 2;
    ghosts.forEach(([label, action], i) => {
      const rect = UI.ghost(ctx, label, gx + widths[i] / 2, gy, { size: 12 });
      this._endlessGameoverRects.push({ ...rect, label: action });
      gx += widths[i] + 8;
    });
  }
  _clickEndlessGameover(mx, my) {
    const rects = this._endlessGameoverRects || [];
    for (const r of rects) {
      if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
        if (r.label === 'AGAIN') {
          this._stopEndlessRunner();
          this._startEndlessRunner();
        } else if (r.label === 'SHOP') {
          this._preShopState = 'endless-gameover';
          this._startShop();
        } else if (r.label === 'BOOK') {
          this._stopEndlessRunner();
          this.state = 'leaderboard';
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
    UI.scene(ctx, this.sprites['bonus-training'], W, H, this._sceneHolders.shop, 'shop', 1.5);
    UI.heading(ctx, 'RICE GRAIN SHOP', W, 12);
    UI.chip(ctx, `${this.progress.getRiceGrains()} rice`, 12, 12);
    // Tabs
    const tabs = ['swords','hats','companions','powerups'];
    const tabLabels = { swords:'⚔️ Swords', hats:'🎩 Hats', companions:'🐾 Pals', powerups:'💊 Power' };
    const tabW = W / tabs.length;
    this._shopTabRects = [];
    tabs.forEach((tab, i) => {
      const tx = i * tabW, ty = 50, tw = tabW - 2, th = 36;
      const isActive = this._shopTab === tab;
      ctx.fillStyle = isActive ? 'rgba(74,48,20,0.95)' : UI.THEME.panel;
      ctx.beginPath(); ctx.roundRect(tx+1, ty, tw, th, 10); ctx.fill();
      ctx.strokeStyle = isActive ? UI.THEME.gold : UI.THEME.stroke;
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.min(13,W*0.032)}px ${UI.THEME.font}`;
      ctx.fillStyle = isActive ? UI.THEME.gold : UI.THEME.muted;
      ctx.fillText(tabLabels[tab], tx + tw/2, ty + th/2);
      this._shopTabRects.push({ x:tx, y:ty, w:tw, h:th, tab });
    });
    // Items grid
    const items = SHOP_ITEMS[this._shopTab] || SHOP_ITEMS.swords || [];
    const cols = 2;
    const itemW = (W - 24) / cols;
    const itemH = Math.min(110, (H - 120) / 3);
    const startY = 96;
    this._shopItemRects = [];
    const shopBottom = H - 58;
    const shopRows = Math.ceil(items.length / cols);
    this._scrollWindow(ctx, '_shopScroll', startY, shopBottom,
                       shopRows * (itemH + 8), (shopScroll) => {
    items.forEach((item, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ix = 8 + col * (itemW + 8);
      const iy = startY + row * (itemH + 8) - shopScroll;
      if (iy + itemH < startY || iy > shopBottom) return;
      const owned = this.progress.ownsItem(item.id);
      const equipped = this.progress.getEquipped();
      const isEquip = Object.values(equipped).includes(item.id);
      const pcount = this.progress.getPowerupCount(item.id);
      // Background
      ctx.fillStyle = isEquip ? 'rgba(74,48,20,0.92)'
                    : owned ? UI.THEME.panelHot : UI.THEME.panel;
      ctx.strokeStyle = isEquip ? UI.THEME.gold : UI.THEME.stroke;
      ctx.lineWidth = isEquip ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(ix, iy, itemW, itemH, 12); ctx.fill(); ctx.stroke();
      // Icon image (painted item art), emoji fallback
      const iconSp = this.sprites[`item-${item.id}`];
      const iconSz = Math.min(44, itemH * 0.52);
      if (iconSp && iconSp.complete && iconSp.naturalWidth > 0) {
        ctx.drawImage(iconSp, ix + 8, iy + itemH*0.35 - iconSz/2, iconSz, iconSz);
      } else {
        ctx.font = `${Math.min(32, itemH*0.35)}px serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, ix + 10, iy + itemH*0.35);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
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
    });
    UI.ghost(ctx, 'Back', W / 2, H - 34);
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
                      SHOP_ITEMS.hats.find(i=>i.id===item.id) ? 'hat' : 'comp';
          this.progress.equip(cat, item.id);
          this._queueAchievementPopup({ emoji:item.emoji, name:'Equipped!', desc:item.name });
        } else {
          // Buy
          if (this.progress.buyItem(item.id)) {
            this._queueAchievementPopup({ emoji:'🌾', name:'Purchased!', desc:`${item.name} for 🌾${item.price}` });
            if (!item.consumable) {
              const cat = SHOP_ITEMS.swords.find(i=>i.id===item.id) ? 'sword' :
                          SHOP_ITEMS.hats.find(i=>i.id===item.id) ? 'hat' : 'comp';
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
    this._dailySet = set;
    this._dailyWords = set.wordObjs || [];
    this._dailyIdx = 0;
    this._dailyBlended= 0;
    this._dailyBattle = null;
    // Daily modifier: every other day is a Golden Day with double rice.
    // (Honest label — the doubling really happens on completion.)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    this._dailyGolden = dayOfYear % 2 === 1;
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
    const set = this._dailySet;
    ctx.clearRect(0, 0, W, H);
    UI.scene(ctx, this.sprites['arena-2'], W, H, this._sceneHolders.daily, 'daily', 1.5);
    if (!set) { this.state = 'mode-select'; return; }

    const afterHeading = UI.heading(ctx, 'DAILY CHALLENGE', W, 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `800 ${Math.min(14, W * 0.034)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.fillText(`${set.emoji || '📖'} Today: ${set.theme}`, W / 2, afterHeading + 4);

    let y = afterHeading + 26;
    if (this._dailyGolden) {
      const gp = 0.65 + 0.35 * Math.sin(t * 0.09);
      ctx.font = `800 ${Math.min(12.5, W * 0.03)}px ${UI.THEME.font}`;
      ctx.fillStyle = `rgba(242,193,78,${gp})`;
      ctx.fillText('✨ Golden day — double rice ✨', W / 2, y);
      y += 20;
    }

    // Progress
    const prog = this.progress.getDailyCompleted() ? this._dailyWords.length : this._dailyBlended;
    const pct = this._dailyWords.length ? prog / this._dailyWords.length : 0;
    const barW = Math.min(W * 0.7, 320), barH = 12, barX = (W - barW) / 2;
    ctx.fillStyle = 'rgba(10,6,12,0.62)';
    ctx.strokeStyle = UI.THEME.stroke; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barX, y, barW, barH, barH / 2); ctx.fill(); ctx.stroke();
    if (pct > 0) {
      const fill = ctx.createLinearGradient(barX, 0, barX + barW * pct, 0);
      fill.addColorStop(0, '#7CFF9B'); fill.addColorStop(1, UI.THEME.gold);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(barX, y, Math.max(barH, barW * pct), barH, barH / 2); ctx.fill();
    }
    ctx.font = `800 10px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${prog} / ${this._dailyWords.length}`, W / 2, y + barH / 2 + 0.5);
    y += barH + 12;

    // Word list. Two columns when the set is long, so a six-word day does
    // not push the action button off the bottom on a short screen.
    const cols = this._dailyWords.length > 4 ? 2 : 1;
    const rows = Math.ceil(this._dailyWords.length / cols);
    const listW = Math.min(W - 40, 440);
    const colW = (listW - (cols - 1) * 8) / cols;
    const x0 = (W - listW) / 2;
    const wordH = Math.max(28, Math.min(38, (H * 0.34) / rows));
    this._dailyWords.forEach((w, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const wx = x0 + col * (colW + 8);
      const wy = y + row * (wordH + 5);
      const done = i < this._dailyBlended || this.progress.getDailyCompleted();
      const current = i === this._dailyIdx && !done;
      ctx.fillStyle = done ? 'rgba(124,255,155,0.13)'
                    : current ? UI.THEME.panelHot : UI.THEME.panel;
      ctx.strokeStyle = done ? 'rgba(124,255,155,0.5)'
                      : current ? UI.THEME.gold : UI.THEME.stroke;
      ctx.lineWidth = current ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(wx, wy, colW, wordH, 10); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.min(15, W * 0.035)}px ${UI.THEME.font}`;
      ctx.fillStyle = done ? '#A9F5BE' : current ? UI.THEME.gold : UI.THEME.locked;
      ctx.fillText(`${done ? '✓' : current ? '▶' : '·'}  ${(w.word || '?').toUpperCase()}`,
                   wx + 12, wy + wordH / 2);
      ctx.textAlign = 'right';
      ctx.font = `${Math.min(15, W * 0.035)}px serif`;
      ctx.globalAlpha = done ? 1 : 0.75;
      ctx.fillText(w.hint || '', wx + colW - 12, wy + wordH / 2);
      ctx.globalAlpha = 1;
    });
    y += rows * (wordH + 5) + 8;

    // Reward line, then the action — in that order, so the button is not
    // sitting on top of its own caption the way it used to.
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.min(12, W * 0.029)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.fillText(
      `${this.progress.getDailyStreak()} day streak · reward ${150 + this.progress.getDailyStreak() * 25} rice`,
      W / 2, y);
    y += 20;

    const completed = this.progress.getDailyCompleted()
                   || this._dailyBlended >= this._dailyWords.length;
    const btnW = Math.min(W * 0.62, 250), btnH = Math.min(46, H * 0.1);
    const btnRect = { x: (W - btnW) / 2, y: Math.min(y, H - 64 - btnH - 8), w: btnW, h: btnH };
    UI.card(ctx, btnRect, {
      label: completed ? 'Claim your reward'
           : this._dailyIdx < this._dailyWords.length ? 'Blend the next word' : 'All done',
      primary: true, labelSize: 15, chevron: !completed,
    });
    this._dailyActionRect = { ...btnRect, completed };

    this._drawBigBack(ctx, W, H);
    this._dailyBackRect = { x: W / 2 - 80, y: H - 52, w: 160, h: 46 };
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
      let earned = this.progress.completeDaily();
      if (earned > 0 && this._dailyGolden) { this.progress.addRiceGrains(earned); earned *= 2; }
      if (earned > 0) this._queueAchievementPopup({ emoji: this._dailyGolden ? '✨' : '🏆', name: this._dailyGolden ? 'GOLDEN Daily!' : 'Daily Complete!', desc:`+${earned} Rice Grains!` });
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
          if (success) {
            this._dailyBlended++;
            this.progress.recordDailyWord();
            this._dailyIdx++;
          } else {
            // Failed word goes to the back of the queue instead of being
            // skipped forever — the day always stays completable.
            const missed = this._dailyWords.splice(this._dailyIdx, 1)[0];
            if (missed) this._dailyWords.push(missed);
          }
          this._dailyBattle = null;
          if (this._dailyBlended >= this._dailyWords.length) {
            let earned = this.progress.completeDaily();
            if (earned > 0 && this._dailyGolden) { this.progress.addRiceGrains(earned); earned *= 2; }
            if (earned > 0) this._queueAchievementPopup({ emoji: this._dailyGolden ? '✨' : '🏆', name: this._dailyGolden ? 'GOLDEN Daily!' : 'Daily Complete!', desc:`+${earned} Rice Grains!` });
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
    UI.scene(ctx, this.sprites['victory-golden-harvest'], W, H,
             this._sceneHolders.achievements, 'achievements', 1.55);
    UI.heading(ctx, 'ACHIEVEMENTS', W, 12);
    const unlocked = this.progress.data.achievements || [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `800 13px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.gold;
    ctx.fillText(`${unlocked.length} of ${ACHIEVEMENTS.length} unlocked`, W/2, 46);
    const cols = 2, rows = Math.ceil(ACHIEVEMENTS.length / cols);
    const cellW = (W - 24) / cols, cellH = Math.min(64, (H - 90) / 4.5);
    // The list stops above the Back button instead of running underneath it,
    // and it can now actually be scrolled — see _bindMenuScroll.
    const listTop = 62, listBottom = H - 64;
    const contentH = rows * (cellH + 6);
    this._scrollWindow(ctx, '_achScroll', listTop, listBottom, contentH, (scroll) => {
    ACHIEVEMENTS.forEach((ach, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ax = 8 + col * (cellW + 8), ay = listTop + row * (cellH + 6) - scroll;
      if (ay + cellH < listTop || ay > listBottom) return;
      const isUnlocked = unlocked.includes(ach.id);
      const isNew = this.progress.data.newAchievements?.includes(ach.id);
      ctx.fillStyle = isNew ? 'rgba(74,48,20,0.92)'
                    : isUnlocked ? UI.THEME.panel : 'rgba(14,9,13,0.80)';
      ctx.strokeStyle = isNew ? UI.THEME.gold
                      : isUnlocked ? UI.THEME.stroke : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = isNew ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(ax, ay, cellW - 4, cellH, 10); ctx.fill(); ctx.stroke();
      // Locked rows still have to be readable; 0.45 alpha over art was not.
      ctx.globalAlpha = isUnlocked ? 1 : 0.72;
      // Medal frame (gold w/ ribbon when unlocked, grey padlock when locked)
      const medalSp = this.sprites[isUnlocked ? 'medal-unlocked' : 'medal-locked'];
      const medalSz = Math.min(40, cellH * 0.78);
      if (medalSp && medalSp.complete && medalSp.naturalWidth > 0) {
        ctx.drawImage(medalSp, ax + 6, ay + cellH/2 - medalSz/2, medalSz, medalSz);
        if (isUnlocked) {
          // achievement emoji sits on the medal disc
          ctx.font = `${Math.round(medalSz * 0.36)}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ach.emoji, ax + 6 + medalSz/2, ay + cellH/2 + medalSz * 0.13);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.font = `${Math.min(22, cellH*0.38)}px serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(ach.emoji, ax + 8, ay + cellH/2);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(12,W*0.030)}px Arial, sans-serif`;
      ctx.fillStyle = isNew ? '#FFD700' : isUnlocked ? '#fff' : '#666';
      ctx.fillText(ach.name, ax + 52, ay + cellH*0.35);
      ctx.font = `${Math.min(10,W*0.025)}px Arial, sans-serif`;
      ctx.fillStyle = '#aaa';
      ctx.fillText(ach.desc, ax + 52, ay + cellH*0.65);
      ctx.globalAlpha = 1;
    });
    });
    this._drawBigBack(ctx, W, H);
    this._achBackRect = { x:W/2-80, y:H-52, w:160, h:46 };
  }
  // Big, thumb-friendly BACK button used by daily/achievements/scores
  _drawBigBack(ctx, W, H) {
    const bw = 160, bh = 44, bx = W / 2 - bw / 2, by = H - bh - 8;
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,12,0.72)';
    ctx.strokeStyle = UI.THEME.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
    ctx.font = `800 16px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.rice;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Back', W / 2, by + bh / 2 + 0.5);
    ctx.restore();
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
    UI.scene(ctx, this.sprites['arena-5'], W, H,
                 this._sceneHolders.leaderboard, 'leaderboard', 1.6);
    const afterHeading = UI.heading(ctx, 'RECORD BOOK', W, 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `700 12px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.fillText('Dino Dash runs on this device', W / 2, afterHeading + 4);

    const rows = this.progress.getRecordBook();

    // An empty book says so. It used to be padded with ten invented
    // strangers who all scored higher than the child — see getRecordBook.
    if (!rows.length) {
      const bw = Math.min(320, W - 64);
      const r = { x: (W - bw) / 2, y: afterHeading + 44, w: bw, h: 92 };
      ctx.fillStyle = UI.THEME.panel;
      ctx.strokeStyle = UI.THEME.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = UI.THEME.rice;
      ctx.font = `900 ${Math.min(17, W * 0.04)}px ${UI.THEME.font}`;
      ctx.fillText('No runs yet', W / 2, r.y + 22);
      ctx.fillStyle = UI.THEME.muted;
      ctx.font = `700 ${Math.min(12.5, W * 0.03)}px ${UI.THEME.font}`;
      ctx.fillText('Play Dino Dash and the first page', W / 2, r.y + 48);
      ctx.fillText('of the book is yours.', W / 2, r.y + 66);
      this._drawBigBack(ctx, W, H);
      return;
    }

    const top = afterHeading + 30;
    const rowH = Math.min(38, (H - top - 62) / rows.length - 4);
    const medals = ['🥇', '🥈', '🥉'];
    rows.forEach((l, i) => {
      const ry = top + i * (rowH + 4);
      ctx.fillStyle = l.isBest ? 'rgba(74,48,20,0.92)'
                    : i < 3 ? UI.THEME.panelHot : UI.THEME.panel;
      ctx.strokeStyle = l.isBest ? UI.THEME.gold : UI.THEME.stroke;
      ctx.lineWidth = l.isBest ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(10, ry, W - 20, rowH, 10); ctx.fill(); ctx.stroke();

      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(16, W * 0.038)}px serif`;
      ctx.fillText(i < 3 ? medals[i] : `${i + 1}.`, 16, ry + rowH / 2);
      ctx.font = `800 ${Math.min(14, W * 0.034)}px ${UI.THEME.font}`;
      ctx.fillStyle = l.isBest ? UI.THEME.gold : UI.THEME.rice;
      ctx.fillText(l.name, 46, ry + rowH / 2 - (l.at ? 6 : 0));
      if (l.at) {
        ctx.font = `700 10px ${UI.THEME.font}`;
        ctx.fillStyle = UI.THEME.muted;
        ctx.fillText(l.at, 46, ry + rowH / 2 + 8);
      }

      ctx.textAlign = 'right';
      ctx.font = `900 ${Math.min(14, W * 0.034)}px ${UI.THEME.font}`;
      ctx.fillStyle = l.isBest ? UI.THEME.gold : UI.THEME.rice;
      ctx.fillText(l.score.toLocaleString(), W - 14, ry + rowH / 2 - 7);
      ctx.font = `700 11px ${UI.THEME.font}`;
      ctx.fillStyle = UI.THEME.muted;
      ctx.fillText(`${l.dist}m`, W - 14, ry + rowH / 2 + 7);
    });
    this._drawBigBack(ctx, W, H);
  }
  // ── ACHIEVEMENT POPUP SYSTEM ──────────────────────────────────
  _tickAchievementPopup() {
    if (!this._achPopupQueue) this._achPopupQueue = [];

    // Poll progress tracker every frame so unlocks are never missed,
    // regardless of whether the queue already has items.
    const newIds = this.progress.getNewAchievements();
    if (newIds.length > 0) {
      this.progress.clearNewAchievements();
      for (const id of newIds) {
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if (ach) this._queueAchievementPopup(ach);
      }
    }

    if (this._achPopup) {
      this._achPopup.life -= 0.018;
      if (this._achPopup.life <= 0) {
        this._achPopup = null;
        if (this._achPopupQueue.length > 0) this._showNextPopup();
      }
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
    const H = this.H;
    const alpha = Math.min(1, p.life > 0.8 ? (1-p.life)*5 : p.life < 0.3 ? p.life/0.3 : 1);
    // Slides up from the foot of the screen, not down from the top. It used
    // to land at y=10 in the middle — exactly where every screen puts its
    // heading — so an unlock hid the title of whatever the player was
    // looking at. Nothing important lives along the bottom edge.
    const popW = Math.min(W * 0.85, 320), popH = 58;
    const rise = p.life > 0.8 ? (1 - (1-p.life)*5) * 70 : 0;
    // Clear of the big Back button that several screens park at H-52.
    const popX = (W - popW) / 2, popY = H - popH - 72 + rise;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = UI.THEME.panelHot;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14;
    ctx.strokeStyle = UI.THEME.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(popX, popY, popW, popH, 12); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = '25px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji || '🏆', popX + 12, popY + popH/2);
    ctx.font = `900 ${Math.min(13.5, W*0.032)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.gold;
    ctx.fillText(p.name || 'Achievement!', popX + 48, popY + popH*0.34);
    ctx.font = `700 ${Math.min(11,W*0.027)}px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.muted;
    ctx.fillText(p.desc || '', popX + 48, popY + popH*0.68);
    ctx.textAlign = 'right';
    ctx.font = `800 10px ${UI.THEME.font}`;
    ctx.fillStyle = UI.THEME.goldDim;
    ctx.fillText('★ UNLOCKED', popX + popW - 10, popY + 12);
    ctx.restore();
  }
}
// ─────────────────────────────────────────────────────────────
// GLOBAL INIT & NAVIGATION
// ─────────────────────────────────────────────────────────────
let _slashGameInstance = null;
// Override the function defined in game.js
/**
 * Enter the game.
 *
 * `opts.straightToPlay` drops the player into the stage they are up to
 * instead of the mode picker. That is what PLAY does, and it is the single
 * biggest lever on whether a shared link turns into a session: measured
 * before this, opening the game took 18.5 seconds and four taps across four
 * menus before anything was playable. The mode picker is still one tap away
 * for everything else.
 */
function launchSlashGame(opts = {}) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('slashScreen').classList.add('active');
  // Request landscape lock (mobile) — ignore if unsupported
  try { screen.orientation?.lock('landscape').catch(() => {}); } catch (_) {}
  if (!_slashGameInstance) {
    _slashGameInstance = new SlashGame('slashCanvas', 'battleOverlay');
  } else {
    _slashGameInstance.state = 'mode-select';
    _slashGameInstance.overlay.classList.add('hidden');
    _slashGameInstance.overlay.innerHTML = '';
  }
  const g = _slashGameInstance;
  if (!opts.straightToPlay && !opts.stage) return;

  // Assets stream in behind the loading screen; wait for the gate rather than
  // launching into a stage whose sprites have not arrived.
  const go = () => {
    if (!g._spritesReady || !g._sheetsReady) { setTimeout(go, 60); return; }
    const total = PHONICS_DATA.stageList.length;
    const wanted = Number(opts.stage) || g.progress.nextStageId(total);
    const valid = wanted >= 1 && wanted <= total;
    if (opts.stage && valid && !g.progress.isUnlocked(wanted)) {
      // Someone shared this stage. Let them play it without granting it.
      g._launchStage(wanted, { preview: true });
      return;
    }
    g._launchStage(valid ? wanted : g.progress.nextStageId(total));
  };
  go();
}

/**
 * Deep links: ?s=12 opens that stage directly. A share is only worth sending
 * if the person receiving it lands on the thing being shared.
 */
function _slashDeepLink() {
  try {
    const p = new URLSearchParams(location.search);
    const s = p.get('s') || p.get('stage');
    if (!s) return null;
    const id = Number(s);
    return Number.isFinite(id) && id >= 1 ? id : null;
  } catch (_) { return null; }
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
    if (s === 'stage-select') {
      _slashGameInstance.state = 'world-map';
    } else if (s === 'menu' || s === 'world-map') {
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
      _slashGameInstance.state = 'world-map';
    } else if (s === 'battle' && _slashGameInstance.battle?._paused) {
      _slashGameInstance.battle._stopBlendTimer();
      _slashGameInstance.battle._paused = false;
      _slashGameInstance.audio.stopMusic();
      _slashGameInstance.battle = null;
      _slashGameInstance.state = 'world-map';
    }
  }
});
