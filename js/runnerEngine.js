'use strict';
// ============================================================
// RUNNER ENGINE — js/runnerEngine.js
// Mario-style auto-scroller. Riku runs right automatically;
// player can hold RIGHT / tap-hold to speed up, SPACE / tap to jump.
//
// World coordinates: X grows right, Y grows down.
// Camera: player is pinned at PLAYER_SCREEN_X; world scrolls left.
// Screen X of any world object = obj.worldX - camera.offsetX
// ============================================================

// ── Constants ────────────────────────────────────────────────
const R_GROUND_H   = 90;    // height of ground strip at canvas bottom
const R_PLAYER_SCR = 0.28;  // fraction of canvas width where player is pinned
const R_GRAVITY    = 0.65;
const R_JUMP_VEL   = -17.0;
const R_JUMP_CUT   = 0.45;  // vy multiplier on early jump release (variable height)
const R_JUMP_HOLD  = 12;    // frames of grace window for variable jump
const R_ACCEL      = 0.55;  // px/frame² acceleration
const R_MAX_SPD    = 6.0;   // max run speed
const R_FRICTION   = 0.78;  // velocity multiplier when no key held
const R_BOOST_DUR  = 240;   // frames of speed boost after full-word collect
const R_COIN_R     = 28;    // coin collision radius
const R_LEVEL_W    = 7800;  // world width per level (px)
const R_WORDS_PER_STAGE = 8; // words shown in each runner level

// ── Scoring constants ─────────────────────────────────────────
const R_SCORE_COIN    = 50;
const R_SCORE_STOMP   = 100;
const R_SCORE_BLOCK   = 200;
const R_SCORE_POWERUP = 500;

// ── Advanced mechanics constants ──────────────────────────────
const R_COYOTE_FRAMES  = 6;    // frames after leaving edge where jump still works
const R_JUMP_BUFFER    = 10;   // frames to queue a jump before landing
const R_SPRING_VEL     = -22;  // spring pad launch velocity
const R_STAR_DUR       = 480;  // 8 seconds of star invincibility (60 fps)

// ─────────────────────────────────────────────────────────────
// RUNNER PLAYER
// ─────────────────────────────────────────────────────────────
class RunnerPlayer {
  constructor(groundY, canvasW, canvasH, sprites) {
    // Scale to canvas — looks good in both landscape and portrait
    this.h       = Math.round(canvasH * 0.32);
    this.w       = Math.round(this.h * 0.80);
    this.worldX  = Math.round(canvasW * 0.12);  // start near left
    this.vx      = 0;
    this.y       = groundY - this.h;
    this.vy      = 0;
    this.onGround = true;
    this.hp      = 3;
    this.invincible = 0;
    this.boostFrames = 0;
    this.shieldActive = false;
    this.sprites = sprites || {};
    this._frame  = 0;
    this._runCycle = 0;
    this._facing = 1;   // 1=right, -1=left
    // Variable jump
    this._holdingJump  = false;
    this._jumpFrames   = 0;
    // Power-up state
    this.powerUp = null;    // 'rice-bowl' | 'chili' | 'shield-item' | 'star' | null
    this._powerUpTimer = 0;
    // Advanced movement
    this._coyoteFrames      = 0;   // frames remaining where late jump is allowed
    this._jumpBuffer        = 0;   // frames remaining for buffered jump input
    this.groundPounding     = false;
    this._groundPoundLanded = false;
    this._starTimer         = 0;   // frames of star-power remaining
    this._landSquash        = 0;   // frames of landing squash animation
    // Score & lives tracked externally by RunnerEngine
  }

  get alive() { return this.hp > 0; }

  activateBoost() {
    this.boostFrames  = R_BOOST_DUR;
    this.shieldActive = true;
  }

  jump(audio) {
    const canJump = this.onGround || this._coyoteFrames > 0;
    if (!canJump) {
      // Buffer the jump — execute automatically the moment we land
      this._jumpBuffer = R_JUMP_BUFFER;
      return;
    }
    this.groundPounding  = false;
    this.vy              = R_JUMP_VEL;
    this.onGround        = false;
    this._coyoteFrames   = 0;
    this._holdingJump    = true;
    this._jumpFrames     = 0;
    if (audio) audio.sfxJump();
  }

  // Down key while airborne — slam to ground at maximum speed
  groundPound() {
    if (this.onGround || this.groundPounding) return;
    this.groundPounding = true;
    this.vy = 16;          // immediate downward burst
    this._holdingJump = false;
  }

  // Call when jump button is released — cuts the jump short (variable height)
  releaseJump() {
    if (this._holdingJump && this.vy < 0) {
      this.vy *= R_JUMP_CUT;
    }
    this._holdingJump = false;
  }

  // Move horizontally based on input keys; called before physics
  applyInput(keys, levelW) {
    const chiliBoost = this.powerUp === 'chili' ? 1.35 : 1;
    const boost = (this.boostFrames > 0 ? 1.5 : 1) * chiliBoost;
    if (keys.right) {
      this.vx = Math.min(this.vx + R_ACCEL * boost, R_MAX_SPD * boost);
      this._facing = 1;
    } else if (keys.left) {
      this.vx = Math.max(this.vx - R_ACCEL * boost, -R_MAX_SPD * boost);
      this._facing = -1;
    } else {
      // Friction
      this.vx *= R_FRICTION;
      if (Math.abs(this.vx) < 0.2) this.vx = 0;
    }
    this.worldX = Math.max(0, Math.min(this.worldX + this.vx, levelW - this.w));
  }

  // Vertical physics update
  update(groundY, platforms) {
    if (this.boostFrames > 0) this.boostFrames--;
    if (this.invincible > 0)  this.invincible--;
    if (this._landSquash > 0) this._landSquash--;
    if (this._powerUpTimer > 0) this._powerUpTimer--;
    if (this._powerUpTimer === 0 && this.powerUp === 'chili') { this.powerUp = null; }
    if (this._starTimer > 0)   { this._starTimer--;   if (this._starTimer === 0 && this.powerUp === 'star') this.powerUp = null; }
    if (this._jumpBuffer > 0)  this._jumpBuffer--;

    // Variable jump: track hold duration
    if (this._holdingJump) {
      this._jumpFrames++;
      if (this._jumpFrames > R_JUMP_HOLD) this._holdingJump = false;
    }

    const _wasOnGround = this.onGround;

    // Ground pound: slam downward at max speed
    const maxFall = this.groundPounding ? 26 : 20;
    if (this.groundPounding) this.vy = Math.max(this.vy, 16);
    this.vy = Math.min(this.vy + R_GRAVITY, maxFall);
    this.y += this.vy;

    // Ground landing
    const gnd = groundY - this.h;
    this.onGround = false;
    if (this.y >= gnd) {
      this.y = gnd; this.vy = 0; this.onGround = true;
    }

    // Platform landing
    if (this.vy >= 0) {
      for (const p of platforms) {
        if (this._overlapsPlatform(p)) {
          this.y = p.sy - this.h; this.vy = 0; this.onGround = true; break;
        }
      }
    }

    if (this.y > groundY + 200) this.hp = 0;

    // ── Coyote time: walked off edge without jumping ─────────
    if (_wasOnGround && !this.onGround && this.vy > 0) {
      this._coyoteFrames = R_COYOTE_FRAMES;
    } else if (this.onGround) {
      this._coyoteFrames = 0;
    } else if (this._coyoteFrames > 0) {
      this._coyoteFrames--;
    }

    // ── Landing events ───────────────────────────────────────
    if (this.onGround && !_wasOnGround) {
      this._landSquash = 10; // trigger squash-and-stretch on any landing
      if (this.groundPounding) {
        this.groundPounding      = false;
        this._groundPoundLanded  = true;
        this._jumpBuffer         = 0; // don't auto-jump after ground pound
      } else if (this._jumpBuffer > 0) {
        // Execute the buffered jump immediately on landing
        this._jumpBuffer   = 0;
        this.vy            = R_JUMP_VEL;
        this.onGround      = false;
        this._holdingJump  = true;
        this._jumpFrames   = 0;
      }
    }

    this._frame++;
    if (this._frame % 7 === 0 && this.onGround && Math.abs(this.vx) >= 0.5) {
      this._runCycle = (this._runCycle + 1) % 4;
    }
  }

  // screenX is set externally by RunnerEngine from camOffset
  get sy() { return this.y; }

  // Platform overlap — uses screenX set by engine
  _overlapsPlatform(p) {
    const prevBottom = this.y - this.vy + this.h;
    const curBottom  = this.y + this.h;
    const sx = this.screenX || 0;
    return prevBottom <= p.sy + 4 &&
           curBottom  >= p.sy &&
           sx + this.w - 6 > p.sx &&
           sx + 6          < p.sx + p.w;
  }

  takeDamage(audio) {
    if (this.invincible > 0) return false;
    if (this._starTimer > 0) return false;        // star power: total immunity
    if (this.shieldActive) { this.shieldActive = false; return false; }
    this.hp--;
    this.invincible = 80;
    if (audio) audio.sfxHurt();
    return true;
  }

  bounds() {
    const inset = 10;
    return {
      x: (this.screenX || 0) + inset,
      y: this.y + inset,
      w: this.w - inset * 2,
      h: this.h - inset * 2,
    };
  }

  // Draw Riku — idle when still, walk cycle when moving, jump sprite in air
  draw(ctx, sprites) {
    const x = this.screenX || 0;
    const y = this.y;

    // State-based sprite selection (no attack/run sprite in runner mode)
    let sp;
    if (!this.onGround) {
      sp = sprites && sprites['riku-jump-1'];
    } else if (Math.abs(this.vx) < 0.5) {
      sp = sprites && sprites['riku-idle'];
    } else {
      sp = sprites && sprites[`riku-walk-${this._runCycle + 1}`];
    }
    // Fallback chain: never show undefined
    if (!sp || !sp.complete || !sp.naturalWidth) {
      sp = (sprites && (sprites['riku-idle'] || sprites['riku-run'])) || null;
    }

    ctx.save();

    // Invincibility: red glow, Riku stays fully opaque
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) {
      ctx.shadowColor = '#FF4444';
      ctx.shadowBlur  = 22;
    }

    // Flip sprite when facing left
    if (this._facing === -1) {
      ctx.translate(x + this.w, 0);
      ctx.scale(-1, 1);
    }
    const dx = this._facing === -1 ? 0 : x;

    // Always draw at full opacity
    ctx.globalAlpha = 1;

    if (sp && sp.complete && sp.naturalWidth > 0) {
      const walking = this.onGround && Math.abs(this.vx) >= 0.5;
      // Squash-and-stretch only while walking
      const sqX = walking ? 1 + Math.sin(this._runCycle * Math.PI / 2) * 0.04 : 1.0;
      const sqY = walking ? 1 - Math.sin(this._runCycle * Math.PI / 2) * 0.04 : 1.0;

      // Per-state normalisation so all three sprites render the character at the
      // same visual size.  Walk sprite (1024×1536) is the reference — character
      // fills ~80% w × ~89% h of its frame.  Idle and Jump sprites are square
      // (1024×1024) with different fill ratios, so we scale the draw rect to
      // compensate:
      //   Idle  (1024×1024): char ~87% w × ~91% h  → normW=0.920w, normH=0.978h
      //   Jump  (1024×1024): char ~87% w × ~82% h  → normW=0.920w, normH=1.085h
      //   Walk  (1024×1536): char ~80% w × ~89% h  → reference (this.w × this.h)
      let normW, normH;
      if (!this.onGround) {
        normW = this.w * 0.920;
        normH = this.h * 1.085;
      } else if (!walking) {
        normW = this.w * 0.920;
        normH = this.h * 0.978;
      } else {
        normW = this.w;
        normH = this.h;
      }
      // Landing squash-and-stretch: flattens on impact, bounces back
      const landAmt = this._landSquash > 0 ? Math.sin((this._landSquash / 10) * Math.PI) * 0.18 : 0;
      const dw = normW * sqX * (1 + landAmt);
      const dh = normH * sqY * (1 - landAmt * 0.85);
      // Centre horizontally; anchor at feet (sprite bottom = y + this.h)
      ctx.drawImage(sp, dx + (this.w - dw) / 2, y + (this.h - dh), dw, dh);
    } else {
      this._drawFallback(ctx, dx, y);
    }

    // Star power: rainbow cycling glow (drawn before boost ring)
    if (this._starTimer > 0) {
      const hue   = (this._frame * 10) % 360;
      const pulse = 0.45 + 0.30 * Math.sin(this._frame * 0.5);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = `hsl(${hue},100%,65%)`;
      ctx.shadowColor = `hsl(${hue},100%,65%)`;
      ctx.shadowBlur  = 28;
      ctx.lineWidth   = 5;
      ctx.beginPath();
      ctx.ellipse(dx + this.w / 2, y + this.h / 2, this.w / 2 + 14, this.h / 2 + 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Second ring offset
      ctx.globalAlpha = pulse * 0.5;
      ctx.strokeStyle = `hsl(${(hue + 120) % 360},100%,65%)`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.ellipse(dx + this.w / 2, y + this.h / 2, this.w / 2 + 22, this.h / 2 + 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Boost glow ring
    if (this.boostFrames > 0) {
      const pulse = 0.35 + 0.2 * Math.sin(this._frame * 0.3);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur  = 18;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.ellipse(dx + this.w / 2, y + this.h / 2, this.w / 2 + 8, this.h / 2 + 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Canvas fallback — scales proportionally to this.w / this.h
  _drawFallback(ctx, x, y) {
    const s  = this.h / 96;   // scale factor relative to original 96px design
    const cx = x + this.w / 2;
    const bob = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 3 * s : 0;
    const ty  = y + bob;
    const r   = 22 * s;  // body radius

    ctx.save();
    // Body
    ctx.fillStyle = '#F5F5F0';
    ctx.beginPath(); ctx.ellipse(cx, ty + 32*s, r, r*1.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.stroke();
    // Nori
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 20*s, ty + 24*s, 40*s, 12*s);
    // Face
    ctx.fillStyle = '#fff9e0';
    ctx.beginPath(); ctx.ellipse(cx, ty + 16*s, 17*s, 16*s, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(cx - 6*s, ty + 13*s, 3*s, 3.5*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 6*s, ty + 13*s, 3*s, 3.5*s, 0, 0, Math.PI * 2); ctx.fill();
    // Cheeks
    ctx.fillStyle = 'rgba(255,150,150,0.5)';
    ctx.beginPath(); ctx.ellipse(cx - 11*s, ty + 17*s, 4*s, 2.5*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 11*s, ty + 17*s, 4*s, 2.5*s, 0, 0, Math.PI * 2); ctx.fill();
    // Headband
    ctx.fillStyle = '#ff3322';
    ctx.fillRect(cx - 17*s, ty + 4*s, 34*s, 5*s);
    // Katana
    const swing = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 0.3 : -0.5;
    ctx.translate(cx + 10*s, ty + 30*s); ctx.rotate(swing);
    ctx.fillStyle = '#ccc'; ctx.fillRect(0, -2*s, 28*s, 4*s);
    ctx.fillStyle = '#8B4513'; ctx.fillRect(-2*s, -5*s, 5*s, 10*s);
    ctx.restore();
    // Legs
    const leg = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 8 * s : 0;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(cx - 8*s, ty + 56*s + leg,  7*s, 5*s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 8*s, ty + 56*s - leg,  7*s, 5*s, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────
// PLATFORM
// ─────────────────────────────────────────────────────────────
class RunnerPlatform {
  constructor(worldX, worldY, w, style = 'rice') {
    this.worldX = worldX;
    this.worldY = worldY;
    this.w      = w;
    this.h      = 20;
    this.style  = style; // 'rice' | 'dojo'
    this.sx     = 0;     // screen X (set by camera)
    this.sy     = worldY; // for non-scrolling Y
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }

  isVisible(canvasW) { return this.sx + this.w > -10 && this.sx < canvasW + 10; }

  draw(ctx, tileSprites) {
    const sp = tileSprites && tileSprites[this.style];
    if (sp && sp.complete && sp.naturalWidth > 0) {
      // Tile the sprite across the platform width
      const tileW = sp.naturalWidth || 40;
      for (let tx = 0; tx < this.w; tx += tileW) {
        ctx.drawImage(sp, this.sx + tx, this.sy, Math.min(tileW, this.w - tx), this.h);
      }
    } else {
      this._drawFallback(ctx);
    }
  }

  _drawFallback(ctx) {
    if (this.style === 'rice') {
      // Rice bundle: warm yellow-green, rounded
      ctx.fillStyle = '#8BC34A';
      ctx.beginPath();
      ctx.roundRect(this.sx, this.sy, this.w, this.h, 6);
      ctx.fill();
      // Rice grain texture
      ctx.fillStyle = '#F9FBE7';
      for (let x = this.sx + 8; x < this.sx + this.w - 8; x += 18) {
        ctx.beginPath(); ctx.ellipse(x, this.sy + 7, 6, 3, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 9, this.sy + 13, 5, 3, -0.2, 0, Math.PI * 2); ctx.fill();
      }
      // Top edge highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(this.sx + 2, this.sy + 1, this.w - 4, 3);
    } else {
      // Dojo block: brown wood planks
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(this.sx, this.sy, this.w, this.h);
      // Plank lines
      ctx.fillStyle = '#5D4037';
      for (let x = this.sx; x < this.sx + this.w; x += 24) {
        ctx.fillRect(x, this.sy, 1, this.h);
      }
      // Top groove
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(this.sx, this.sy, this.w, 4);
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(this.sx, this.sy + this.h - 3, this.w, 3);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PHONEME COIN
// ─────────────────────────────────────────────────────────────
class PhonemeCoin {
  constructor(worldX, worldY, phoneme, wordId, phIdx, hint, word) {
    this.worldX   = worldX;
    this.worldY   = worldY;
    this.phoneme  = phoneme;
    this.wordId   = wordId;
    this.phIdx    = phIdx;
    this.hint     = hint;
    this.word     = word;
    this.collected = false;
    this.sx       = 0;
    this._bob     = Math.random() * Math.PI * 2; // phase offset for bobbing
    this._age     = 0;
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }

  isVisible(canvasW) { return this.sx + 30 > 0 && this.sx - 30 < canvasW; }

  update() { this._age++; }

  // Returns true if player overlaps this coin
  checkCollect(player) {
    if (this.collected) return false;
    const cx  = this.sx;
    const cy  = this.worldY + Math.sin(this._age * 0.07 + this._bob) * 5;
    const px  = player.screenX + player.w / 2;
    const py  = player.y + player.h / 2;
    const dx  = cx - px;
    const dy  = cy - py;
    return Math.sqrt(dx * dx + dy * dy) < R_COIN_R + 20;
  }

  draw(ctx, audio) {
    if (this.collected) return;
    const bob = Math.sin(this._age * 0.07 + this._bob) * 5;
    const cy  = this.worldY + bob;
    const cx  = this.sx;
    const r   = R_COIN_R;

    ctx.save();
    // Glow ring
    const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
    glow.addColorStop(0,   'rgba(255,215,0,0.45)');
    glow.addColorStop(1,   'rgba(255,215,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Coin body
    const gold = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    gold.addColorStop(0,   '#FFF176');
    gold.addColorStop(0.5, '#FFD700');
    gold.addColorStop(1,   '#F57F17');
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F9A825';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Phoneme text — scaled to coin radius
    const text   = this.phoneme.toUpperCase();
    const fsize  = text.length > 2 ? Math.round(r * 0.5) : text.length > 1 ? Math.round(r * 0.62) : Math.round(r * 0.72);
    ctx.font        = `bold ${fsize}px "Comic Sans MS", system-ui, sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle   = '#5D4037';
    ctx.fillText(text, cx, cy + 1);

    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// MINION DINO
// ─────────────────────────────────────────────────────────────
class MinionDino {
  // sprite: the 'minion-dino' Image object (or null → canvas fallback)
  constructor(worldX, groundY, platform = null, sprite = null, size = 72) {
    this.worldX   = worldX;
    this.w        = size;
    this.h        = size;
    // Plant minion so its feet are on the ground (or platform top)
    const baseY = platform ? platform.worldY : groundY;
    this.groundY  = baseY - this.h;
    this.vx       = -1.2;   // walks left (toward player)
    this.defeated = false;
    this.deathFrames = 0;
    this.sx       = 0;
    this._age     = 0;
    this._patrolMin = worldX - 120;
    this._patrolMax = worldX + 120;
    this._sprite  = sprite;   // Image | null
    this.armor    = 0;        // 0=none, 1=armored (needs 2 stomps)
    this._armorBroken = false;
  }

  // Returns 'stomp', 'armor-break', or calls nothing for already-defeated.
  // Engine must NOT call defeat() separately when using this method.
  takeStompHit() {
    if (this.armor > 0 && !this._armorBroken) {
      this._armorBroken = true;
      this.armor = 0;
      return 'armor-break';
    }
    this.defeat();
    return 'stomp';
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }

  update() {
    if (this.defeated) { this.deathFrames++; return; }
    this._age++;
    this.worldX += this.vx;
    if (this.worldX < this._patrolMin) { this.vx =  1.2; }
    if (this.worldX > this._patrolMax) { this.vx = -1.2; }
  }

  // AABB hit vs player — returns 'stomp' | 'hit' | null
  checkCollision(player) {
    if (this.defeated) return null;
    const pb = player.bounds();
    const mb = { x: this.sx + 4, y: this.groundY + 4, w: this.w - 8, h: this.h - 8 };
    const overlapX = pb.x < mb.x + mb.w && pb.x + pb.w > mb.x;
    const overlapY = pb.y < mb.y + mb.h && pb.y + pb.h > mb.y;
    if (!overlapX || !overlapY) return null;
    // Stomp: player is falling and above minion center
    if (player.vy >= 0 && pb.y + pb.h < mb.y + mb.h / 2 + 10) return 'stomp';
    return 'hit';
  }

  defeat() {
    this.defeated    = true;
    this.deathFrames = 0;
  }

  isGone() { return this.defeated && this.deathFrames > 45; }

  draw(ctx) {
    if (this.isGone()) return;
    const x = this.sx;
    const y = this.groundY;

    ctx.save();
    if (this.defeated) {
      ctx.globalAlpha = Math.max(0, 1 - this.deathFrames / 45);
      ctx.translate(x + this.w / 2, y + this.h / 2);
      ctx.rotate(this.deathFrames * 0.15);

      // Sprite path on defeat
      if (this._sprite && this._sprite.complete && this._sprite.naturalWidth > 0) {
        ctx.scale(this.vx < 0 ? 1 : -1, 1);
        ctx.drawImage(this._sprite, -this.w / 2, -this.h / 2, this.w, this.h);
        this._drawDeathStars(ctx);
        ctx.restore();
        return;
      }
    }

    // Sprite path — flip horizontally to face walking direction
    if (this._sprite && this._sprite.complete && this._sprite.naturalWidth > 0) {
      if (!this.defeated) ctx.translate(x + this.w / 2, y + this.h / 2);
      // Walk wobble
      const wobble = Math.sin(this._age * 0.25) * 0.08;
      ctx.rotate(wobble);
      ctx.scale(this.vx < 0 ? 1 : -1, 1);
      ctx.drawImage(this._sprite, -this.w / 2, -this.h / 2, this.w, this.h);
      if (this.defeated) this._drawDeathStars(ctx);
      ctx.restore();
      return;
    }

    // Canvas fallback — original drawn relative to origin (translate below)
    if (!this.defeated) ctx.translate(x + this.w / 2, y + this.h / 2);
    const faceDir = this.vx < 0 ? 1 : -1;
    ctx.scale(faceDir, 1);

    // Armored shell overlay (silver ring before drawing body)
    if (this.armor > 0 && !this._armorBroken) {
      ctx.strokeStyle = '#B0BEC5';
      ctx.lineWidth   = 5;
      ctx.shadowColor = '#78909C';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.ellipse(0, 4, 20, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // Body
    ctx.fillStyle = this.armor > 0 && !this._armorBroken ? '#607D8B' : '#558B2F';
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#689F38';
    ctx.beginPath();
    ctx.ellipse(14, -4, 12, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(19, -6, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(20, -6, 2, 2, 0, 0, Math.PI * 2); ctx.fill();

    // Tiny arms
    ctx.fillStyle = '#558B2F';
    ctx.fillRect(4, 2, 8, 5);
    ctx.fillRect(4, 8, 6, 5);

    // Tail
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.quadraticCurveTo(-22, -6, -20, -14);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#558B2F';
    ctx.stroke();

    if (this.defeated) { this._drawDeathStars(ctx); }

    ctx.restore();
  }

  _drawDeathStars(ctx) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.deathFrames * 0.2;
      const r = 20 + this.deathFrames * 0.4;
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.fillText('⭐', Math.cos(a) * r, Math.sin(a) * r - 10);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// END FLAG
// ─────────────────────────────────────────────────────────────
class EndFlag {
  constructor(worldX, groundY) {
    this.worldX  = worldX;
    this.groundY = groundY;
    this.sx      = 0;
    this.reached = false;
    this._age    = 0;
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }

  check(player) {
    if (this.reached) return false;
    const dist = Math.abs(this.sx - (player.screenX + player.w / 2));
    if (dist < 60) { this.reached = true; return true; }
    return false;
  }

  draw(ctx, groundY) {
    this._age++;
    const x  = this.sx;
    const flagWave = Math.sin(this._age * 0.12) * 8;

    // Pole
    ctx.strokeStyle = '#888';
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.moveTo(x, groundY - 10);
    ctx.lineTo(x, groundY - 110);
    ctx.stroke();

    // Flag body (rice flag — red with white rice grain)
    ctx.fillStyle = '#e53935';
    ctx.save();
    ctx.translate(x, groundY - 110);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(35 + flagWave, 15, 40, 30);
    ctx.quadraticCurveTo(35 + flagWave, 44, 0, 30);
    ctx.closePath();
    ctx.fill();

    // Rice grain on flag
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font      = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍚', 20, 18);
    ctx.restore();

    // Glow ring near flag when close
    const glow = ctx.createRadialGradient(x, groundY - 70, 5, x, groundY - 70, 45);
    glow.addColorStop(0, 'rgba(255,215,0,0.3)');
    glow.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, groundY - 70, 45, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────
// MOVING PLATFORM
// Oscillates horizontally or vertically — classic Mario challenge.
// ─────────────────────────────────────────────────────────────
class MovingPlatform extends RunnerPlatform {
  constructor(worldX, worldY, w, style, moveType, amplitude, speed = 0.022) {
    super(worldX, worldY, w, style);
    this._moveType  = moveType;   // 'h' | 'v'
    this._amplitude = amplitude;
    this._speed     = speed;
    this._originX   = worldX;
    this._originY   = worldY;
    this._phase     = Math.random() * Math.PI * 2;
    this._age       = 0;
  }

  update() {
    this._age++;
    const t = this._age * this._speed + this._phase;
    if (this._moveType === 'h') {
      this.worldX = this._originX + Math.sin(t) * this._amplitude;
    } else {
      this.worldY = this._originY + Math.sin(t) * this._amplitude;
      this.sy     = this.worldY;
    }
  }

  // Override to also update screen X with latest worldX
  updateScreen(camOffsetX) {
    this.sx = this.worldX - camOffsetX;
  }

  draw(ctx) {
    super.draw(ctx, null); // use fallback (no tile sprites for moving)
    // Pulsing outline to hint movement
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,0,0.55)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(this.sx, this.sy, this.w, this.h, 6);
    ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// QUESTION BLOCK — hit from below to reveal bonus
// ─────────────────────────────────────────────────────────────
class QuestionBlock {
  constructor(worldX, worldY, rewardType = 'coin') {
    this.worldX     = worldX;
    this.worldY     = worldY;
    this.w          = 44;
    this.h          = 44;
    this.sx         = 0;
    this.sy         = worldY;
    this.rewardType = rewardType; // 'coin' | 'powerup'
    this.hit        = false;
    this._age       = 0;
    this._bounce    = 0;  // upward bounce animation frames
  }

  updateScreen(camOffsetX) {
    this.sx = this.worldX - camOffsetX;
    this.sy = this.worldY - (this._bounce > 0 ? Math.sin(this._bounce / 8 * Math.PI) * 10 : 0);
  }

  update() {
    this._age++;
    if (this._bounce > 0) this._bounce--;
  }

  isVisible(canvasW) { return this.sx + this.w > -20 && this.sx < canvasW + 20; }

  // Returns true if player hits block from below (head-butt)
  checkHit(player) {
    if (this.hit) return false;
    const pb = player.bounds();
    // Player must be moving upward and head must touch block bottom
    const headY = pb.y;
    const headX = pb.x;
    return player.vy < 0 &&
      headX + pb.w > this.sx + 4 &&
      headX < this.sx + this.w - 4 &&
      Math.abs(headY - (this.sy + this.h)) < 12;
  }

  activate() {
    if (this.hit) return null;
    this.hit     = true;
    this._bounce = 8;
    return this.rewardType;
  }

  draw(ctx) {
    const x = this.sx;
    const y = this.sy;
    const w = this.w;
    const h = this.h;
    const pulse = this.hit ? 0 : 0.08 * Math.sin(this._age * 0.15);

    ctx.save();
    // Block body
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (this.hit) {
      grad.addColorStop(0, '#8D6E63');
      grad.addColorStop(1, '#5D4037');
    } else {
      grad.addColorStop(0, '#FFD54F');
      grad.addColorStop(0.5, '#FFA000');
      grad.addColorStop(1, '#E65100');
    }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();

    // Dark border with 3D shadow
    ctx.strokeStyle = this.hit ? '#3E2723' : '#7f5700';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    // Inner highlight
    ctx.fillStyle = this.hit ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 4, y + 3, w - 8, 5);
    // Bottom dark shadow
    ctx.fillStyle = this.hit ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 3, y + h - 6, w - 6, 4);

    // Question mark or empty
    if (!this.hit) {
      ctx.font        = `bold ${Math.round(h * 0.58 + pulse * h)}px "Comic Sans MS", system-ui`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle   = '#fff';
      ctx.shadowColor = '#FF6F00'; ctx.shadowBlur = 6;
      ctx.fillText('?', x + w / 2, y + h / 2 + 1);
      ctx.shadowBlur  = 0;
    } else {
      // Spent block shows empty circle
      ctx.fillStyle   = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// POWER-UP ITEM — emerges from question block and bounces
// Types: 'rice-bowl' (+1 HP), 'chili' (speed boost 8s), 'shield-item' (one-hit shield)
// ─────────────────────────────────────────────────────────────
class PowerUpItem {
  constructor(worldX, worldY, type) {
    this.worldX    = worldX;
    this.worldY    = worldY;
    this.w         = 36;
    this.h         = 36;
    this.type      = type;
    this.vx        = 1.8;
    this.vy        = -5;
    this.sx        = 0;
    this.collected = false;
    this._age      = 0;
    this._gravity  = 0.45;
    this._groundY  = worldY;   // set by engine after creation
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }

  update(groundY, platforms) {
    if (this.collected) return;
    this._age++;
    this.vy = Math.min(this.vy + this._gravity, 14);
    this.worldY += this.vy;
    this.worldX += this.vx;

    // Ground bounce
    const gnd = groundY - this.h;
    if (this.worldY >= gnd) {
      this.worldY = gnd;
      this.vy     = -4.5;  // bounce
    }

    // Platform bounce
    for (const p of platforms) {
      if (this.vy >= 0) {
        const prevBottom = this.worldY - this.vy + this.h;
        const curBottom  = this.worldY + this.h;
        const sx = this.sx;
        if (prevBottom <= p.sy + 4 && curBottom >= p.sy &&
            sx + this.w > p.sx && sx < p.sx + p.w) {
          this.worldY = p.sy - this.h;
          this.vy = -4.5;
        }
      }
    }

    // Reverse on world edges
    if (this.worldX < 0) this.vx = Math.abs(this.vx);
  }

  isVisible(canvasW) { return this.sx + this.w > -10 && this.sx < canvasW + 10; }

  checkCollect(player) {
    if (this.collected) return false;
    const pb = player.bounds();
    return pb.x < this.sx + this.w && pb.x + pb.w > this.sx &&
           pb.y < this.worldY + this.h && pb.y + pb.h > this.worldY;
  }

  draw(ctx) {
    if (this.collected) return;
    const x = this.sx;
    const y = this.worldY;
    const w = this.w;
    const h = this.h;
    const bob = Math.sin(this._age * 0.14) * 2;

    ctx.save();
    // Glow (star power gets rainbow pulse)
    if (this.type === 'star') {
      const hue = (this._age * 8) % 360;
      ctx.shadowColor = `hsl(${hue},100%,65%)`;
    } else {
      ctx.shadowColor = this.type === 'rice-bowl' ? '#FF4081' :
                        this.type === 'chili'      ? '#FF6D00' : '#00B0FF';
    }
    ctx.shadowBlur  = 14;

    // Icon based on type
    ctx.font         = `${Math.round(h * 0.85)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const icon = this.type === 'rice-bowl' ? '🍚' :
                 this.type === 'chili'      ? '🌶️' :
                 this.type === 'star'       ? '⭐' : '🛡️';
    ctx.fillText(icon, x + w / 2, y + h / 2 + bob);

    // Highlight ring
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2 + bob, w / 2 + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// FLYING ENEMY — Pterodactyl that patrols at height
// Can be defeated by jumping on top; can't be stomped from front.
// ─────────────────────────────────────────────────────────────
class FlyingEnemy {
  constructor(worldX, worldY, sprite = null) {
    this.worldX   = worldX;
    this.w        = 68;
    this.h        = 52;
    this._baseY   = worldY;
    this.worldY   = worldY;
    this.vx       = -1.4;
    this.defeated = false;
    this.deathFrames = 0;
    this.sx       = 0;
    this._age     = 0;
    this._bobPhase = Math.random() * Math.PI * 2;
    this._sprite  = sprite;
    this._patrolMin = worldX - 160;
    this._patrolMax = worldX + 160;
  }

  updateScreen(camOffsetX) {
    this.sx = this.worldX - camOffsetX;
  }

  update() {
    if (this.defeated) { this.deathFrames++; return; }
    this._age++;
    this.worldX += this.vx;
    this.worldY = this._baseY + Math.sin(this._age * 0.055 + this._bobPhase) * 28;
    if (this.worldX < this._patrolMin) this.vx =  Math.abs(this.vx);
    if (this.worldX > this._patrolMax) this.vx = -Math.abs(this.vx);
  }

  checkCollision(player) {
    if (this.defeated) return null;
    const pb = player.bounds();
    const mb = { x: this.sx + 6, y: this.worldY + 6, w: this.w - 12, h: this.h - 12 };
    if (pb.x >= mb.x + mb.w || pb.x + pb.w <= mb.x ||
        pb.y >= mb.y + mb.h || pb.y + pb.h <= mb.y) return null;
    // Stomp: player falling, feet above enemy center
    if (player.vy >= 0 && pb.y + pb.h < mb.y + mb.h / 2 + 8) return 'stomp';
    return 'hit';
  }

  defeat() { this.defeated = true; this.deathFrames = 0; }
  isGone()  { return this.defeated && this.deathFrames > 50; }

  draw(ctx) {
    if (this.isGone()) return;
    const x = this.sx;
    const y = this.worldY;
    const wingFlap = Math.sin(this._age * 0.22) * 0.4;

    ctx.save();
    if (this.defeated) {
      ctx.globalAlpha = Math.max(0, 1 - this.deathFrames / 50);
      ctx.translate(x + this.w / 2, y + this.h / 2);
      ctx.rotate(this.deathFrames * 0.18);
    } else {
      ctx.translate(x + this.w / 2, y + this.h / 2);
      ctx.scale(this.vx < 0 ? 1 : -1, 1);
    }

    // Body (pterodactyl silhouette in canvas)
    const c = this.defeated ? '#444' : '#7B1FA2';
    // Wings
    ctx.fillStyle = this.defeated ? '#333' : '#9C27B0';
    ctx.save();
    ctx.rotate(-wingFlap);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.bezierCurveTo(-32, -22, -40, -8, -36, 8);
    ctx.bezierCurveTo(-24, 12, -10, 6, -8, 0);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(wingFlap);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.bezierCurveTo(32, -22, 40, -8, 36, 8);
    ctx.bezierCurveTo(24, 12, 10, 6, 8, 0);
    ctx.fill();
    ctx.restore();
    // Body
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 2, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.beginPath(); ctx.ellipse(16, -4, 10, 8, 0.3, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#FF8F00';
    ctx.beginPath();
    ctx.moveTo(22, -4); ctx.lineTo(34, -2); ctx.lineTo(22, 2);
    ctx.closePath(); ctx.fill();
    // Eye
    if (!this.defeated) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(19, -5, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#212121';
      ctx.beginPath(); ctx.arc(20, -5, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Crest on head
    ctx.fillStyle = this.defeated ? '#333' : '#CE93D8';
    ctx.beginPath(); ctx.moveTo(12, -10); ctx.lineTo(20, -16); ctx.lineTo(22, -10); ctx.fill();

    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// SPRING PAD — launches player into the air on contact
// ─────────────────────────────────────────────────────────────
class SpringPad {
  constructor(worldX, groundY) {
    this.worldX  = worldX;
    this.groundY = groundY;
    this.w       = 42;
    this.h       = 30;
    this.sx      = 0;
    this._age    = 0;
    this._bounce = 0; // animation frames
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }
  isVisible(canvasW) { return this.sx + this.w > -20 && this.sx < canvasW + 20; }

  update() {
    this._age++;
    if (this._bounce > 0) this._bounce--;
  }

  // Returns true if player lands on the spring pad from above
  checkLand(player) {
    if (this._bounce > 0) return false; // cooldown after activation
    const pb       = player.bounds();
    const springTop = this.groundY - this.h;
    return player.vy >= 0 &&
      pb.y + pb.h >= springTop - 4 && pb.y + pb.h <= springTop + 16 &&
      pb.x + pb.w > this.sx + 4 && pb.x < this.sx + this.w - 4;
  }

  activate() { this._bounce = 16; }

  draw(ctx) {
    const x        = this.sx;
    const compress = this._bounce > 0 ? Math.sin(this._bounce / 16 * Math.PI) * 0.45 : 0;
    const h        = Math.round(this.h * (1 - compress * 0.5));
    const baseY    = this.groundY;

    ctx.save();
    // Coil (zigzag spring)
    ctx.strokeStyle = '#FF6F00';
    ctx.lineWidth   = 3.5;
    ctx.lineCap     = 'round';
    const coils = 4;
    const coilH = h / (coils * 2);
    ctx.beginPath();
    ctx.moveTo(x + 4, baseY);
    for (let i = 0; i < coils * 2; i++) {
      const cy = baseY - (i + 1) * coilH;
      const cx = (i % 2 === 0) ? x + this.w - 4 : x + 4;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // Base
    ctx.fillStyle = '#E65100';
    ctx.beginPath(); ctx.roundRect(x, baseY - 5, this.w, 5, 2); ctx.fill();
    // Top pad (bounces with spring)
    ctx.fillStyle = '#FFB300';
    ctx.shadowColor = '#FF6F00'; ctx.shadowBlur = this._bounce > 0 ? 12 : 0;
    ctx.beginPath(); ctx.roundRect(x + 3, baseY - h, this.w - 6, 8, 3); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// CHECKPOINT FLAG — mid-level save point
// ─────────────────────────────────────────────────────────────
class CheckpointFlag {
  constructor(worldX, groundY) {
    this.worldX    = worldX;
    this.groundY   = groundY;
    this.sx        = 0;
    this.activated = false;
    this._age      = 0;
  }

  updateScreen(camOffsetX) { this.sx = this.worldX - camOffsetX; }
  isVisible(canvasW) { return this.sx + 55 > 0 && this.sx - 10 < canvasW; }

  check(player) {
    if (this.activated) return false;
    const dist = Math.abs(this.sx - (player.screenX + player.w / 2));
    if (dist < 55) { this.activated = true; return true; }
    return false;
  }

  draw(ctx, groundY) {
    this._age++;
    const x        = this.sx;
    const waveAmt  = Math.sin(this._age * 0.14) * 7;
    const color    = this.activated ? '#00E676' : '#FFD600';

    ctx.save();
    // Pole
    ctx.strokeStyle = '#9E9E9E'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, groundY - 8); ctx.lineTo(x, groundY - 82); ctx.stroke();
    // Flag body
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x, groundY - 82);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(24 + waveAmt, 12, 28, 22);
    ctx.quadraticCurveTo(24 + waveAmt, 32, 0, 24);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Icon on flag
    ctx.font = 'bold 13px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.activated ? '#004D40' : '#5D4037';
    ctx.fillText(this.activated ? '✓' : '★', x + 13, groundY - 62);
    // Active glow
    if (this.activated) {
      const pulse = 0.25 + 0.18 * Math.sin(this._age * 0.3);
      const glow  = ctx.createRadialGradient(x, groundY - 45, 2, x, groundY - 45, 32);
      glow.addColorStop(0, `rgba(0,230,118,${pulse})`);
      glow.addColorStop(1, 'rgba(0,230,118,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, groundY - 45, 32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// PARTICLE SYSTEM (coins, stomps, boost)
// ─────────────────────────────────────────────────────────────
class RunnerParticle {
  constructor(x, y, text, color = '#FFD700', vy = -3, vx = 0) {
    this.x     = x;
    this.y     = y;
    this.text  = text;
    this.color = color;
    this.vy    = vy + (Math.random() - 0.5) * 2;
    this.vx    = vx + (Math.random() - 0.5) * 3;
    this.life  = 1;
    this.scale = 0.5;
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += 0.12;
    this.life -= 0.025;
    this.scale = Math.min(1.3, this.scale + 0.08);
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.font        = 'bold 18px "Comic Sans MS", system-ui';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 3;
    ctx.strokeText(this.text, 0, 0);
    ctx.fillStyle   = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
  isDead() { return this.life <= 0; }
}

// ─────────────────────────────────────────────────────────────
// DUST PARTICLE — running puffs and landing cloud
// ─────────────────────────────────────────────────────────────
class DustParticle {
  constructor(x, y) {
    this.x    = x + (Math.random() - 0.5) * 16;
    this.y    = y;
    this.vx   = (Math.random() - 0.5) * 2.2;
    this.vy   = -Math.random() * 1.4 - 0.4;
    this.r    = Math.random() * 4 + 2;
    this.life = 0.65 + Math.random() * 0.35;
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += 0.1;
    this.life -= 0.055;
    this.r    *= 0.93;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life) * 0.5;
    ctx.fillStyle   = '#d4b483';
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.5, this.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  isDead() { return this.life <= 0; }
}

// ─────────────────────────────────────────────────────────────
// LEVEL GENERATOR
// Produces platform, coin, minion, flag, moving platforms,
// question blocks, power-ups, and flying enemies for a stage.
// ─────────────────────────────────────────────────────────────
function generateRunnerLevel(stageData, canvasH, sprites) {
  const groundY    = canvasH - R_GROUND_H;
  const words      = stageData.words.slice(0, R_WORDS_PER_STAGE);
  const difficulty = stageData.id - 1;             // 0-5
  const minionSp   = sprites && sprites['minion-dino'];
  const minionSize = Math.max(96, Math.round(canvasH * 0.22));
  const items      = {
    platforms: [], coins: [], minions: [], flag: null,
    movingPlatforms: [], questionBlocks: [], powerUps: [], flyingEnemies: [],
    springs: [], checkpoint: null,
  };

  let wx = 800; // start X (safe spawn zone)

  words.forEach((word, wIdx) => {
    const elevated    = wIdx % 2 === 1;
    const movingPlat  = difficulty >= 2 && wIdx % 3 === 2; // use moving platform
    const platformH   = elevated ? groundY - 100 - (difficulty * 14) : groundY;
    const coinY       = platformH - Math.round(canvasH * 0.22);
    const platW       = word.phonemes.length * 82 + 60;
    const style       = (wIdx + difficulty) % 3 === 2 ? 'dojo' : 'rice';

    if (elevated) {
      if (movingPlat) {
        // Moving platform: horizontal on even, vertical on odd within moving
        const moveType = wIdx % 2 === 0 ? 'h' : 'v';
        items.movingPlatforms.push(new MovingPlatform(wx - 30, platformH - 20, platW, style, moveType, 55));
      } else {
        items.platforms.push(new RunnerPlatform(wx - 30, platformH - 20, platW, style));
      }
    }

    // Question blocks — placed above some ground sections
    if (wIdx % 3 === 1) {
      const blockX = wx + Math.floor(word.phonemes.length / 2) * 82;
      const blockY = elevated ? platformH - 100 : groundY - Math.round(canvasH * 0.42);
      const rewardType = wIdx % 6 === 1 ? 'powerup' : 'coin';
      items.questionBlocks.push(new QuestionBlock(blockX, blockY, rewardType));
    }

    // Phoneme coins
    word.phonemes.forEach((ph, pIdx) => {
      items.coins.push(new PhonemeCoin(
        wx + pIdx * 82, coinY, ph, wIdx, pIdx, word.hint, word.word,
      ));
    });

    // Ground minions on even sections (skip first)
    if (wIdx % 2 === 0 && wIdx > 0) {
      const mx     = wx + word.phonemes.length * 40;
      const minion = new MinionDino(
        mx, groundY,
        elevated ? (items.platforms[items.platforms.length - 1] ||
                    items.movingPlatforms[items.movingPlatforms.length - 1]) : null,
        minionSp, minionSize,
      );
      if (difficulty >= 3 && wIdx % 4 === 2) minion.armor = 1; // armored in stage 4+
      items.minions.push(minion);
    }

    // Flying enemies in stage 2+, every 3 word sections
    if (difficulty >= 1 && wIdx % 3 === 2) {
      const flyX = wx + platW / 2;
      const flyY = elevated ? platformH - 80 : groundY - Math.round(canvasH * 0.38);
      items.flyingEnemies.push(new FlyingEnemy(flyX, flyY, null));
    }

    // Spring pads in stage 3+ (before elevated word clusters)
    if (difficulty >= 2 && wIdx % 3 === 1 && wIdx > 0) {
      items.springs.push(new SpringPad(wx - 70, groundY));
    }

    // Checkpoint at mid-level (after the 3rd word)
    if (wIdx === 3) {
      items.checkpoint = new CheckpointFlag(wx - 80, groundY);
    }

    // Extra bridge platform in higher stages
    if (difficulty >= 2 && elevated) {
      const bridgeX = wx + platW + 60;
      items.platforms.push(new RunnerPlatform(bridgeX, platformH, 70, 'dojo'));
    }

    wx += platW + 200 + difficulty * 20;
  });

  // End flag
  items.flag = new EndFlag(wx + 200, groundY);
  items.totalWidth = wx + 600;

  return items;
}

// ─────────────────────────────────────────────────────────────
// RUNNER ENGINE — main class
// ─────────────────────────────────────────────────────────────
class RunnerEngine {
  constructor(canvas, stageData, sprites, audio, logicalW, logicalH) {
    this.canvas     = canvas;
    this.ctx        = canvas.getContext('2d');
    this.stage      = stageData;
    this.sprites    = sprites || {};
    this.audio      = audio;

    const W = logicalW || canvas.clientWidth  || 480;
    const H = logicalH || canvas.clientHeight || 700;
    this.W  = W;
    this.H  = H;

    this.groundY   = H - R_GROUND_H;
    this.camOffset = 0;

    const level           = generateRunnerLevel(stageData, H, sprites);
    this.platforms        = level.platforms;
    this.movingPlatforms  = level.movingPlatforms;
    this.questionBlocks   = level.questionBlocks;
    this.powerUps         = level.powerUps;     // items spawned at runtime
    this.flyingEnemies    = level.flyingEnemies;
    this.springs          = level.springs;
    this.checkpoint       = level.checkpoint;
    this._checkpointWorldX = null;  // set when checkpoint is activated
    this.coins            = level.coins;
    this.minions          = level.minions;
    this.flag             = level.flag;
    this.levelW           = level.totalWidth;

    this.player    = new RunnerPlayer(this.groundY, W, H, sprites);

    this.keys = { right: false, left: false, jump: false };
    this._bindInput();

    this.collectedPhonemes = [];
    this.collectedCoinIds  = new Set();
    this.completedWords    = [];
    this.particles         = [];
    this.timeLeft          = 120;
    this._timeTick         = 0;

    // Score, lives, combo stomp
    this.score      = 0;
    this.lives      = 3;
    this._stompCombo = 0;
    this._stompComboTimer = 0;
    this._screenShake = 0;   // frames of screen shake remaining

    // Parallax layers
    this._bgOffset1 = 0;
    this._bgOffset2 = 0;
    this._bgOffset3 = 0;
    this._age       = 0;

    this.done    = false;
    this.outcome = null;
    this._paused = false;
    this.dustParticles = [];
  }

  // ── Bind D-pad button elements (called by SlashGame after creating runner) ──
  bindDpad(leftBtn, rightBtn, jumpBtn) {
    const hold = (btn, key) => {
      const start = () => { this.keys[key] = true;  btn.classList.add('held'); };
      const end   = () => { this.keys[key] = false; btn.classList.remove('held'); };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
      btn.addEventListener('touchend',   (e) => { e.preventDefault(); end(); });
      btn.addEventListener('touchcancel',end);
      btn.addEventListener('mousedown',  start);
      btn.addEventListener('mouseup',    end);
      btn.addEventListener('mouseleave', end);
    };
    hold(leftBtn,  'left');
    hold(rightBtn, 'right');
    // Jump: variable height — press to jump, release to cut
    const doJump  = (e) => { e.preventDefault(); this.player.jump(this.audio); jumpBtn.classList.add('held'); };
    const endJump = (e) => { e.preventDefault(); this.player.releaseJump(); jumpBtn.classList.remove('held'); };
    jumpBtn.addEventListener('touchstart', doJump,  { passive: false });
    jumpBtn.addEventListener('touchend',   endJump, { passive: false });
    jumpBtn.addEventListener('touchcancel',endJump);
    jumpBtn.addEventListener('mousedown',  doJump);
    jumpBtn.addEventListener('mouseup',    endJump);
  }

  // ── Keyboard input ────────────────────────────────────────────
  _bindInput() {
    const isJump = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    this._kd = (e) => {
      if (e.code === 'KeyP') { e.preventDefault(); this._togglePause(); return; }
      if (this._paused) return; // swallow all other input while paused
      if (isJump(e)) { e.preventDefault(); this.player.jump(this.audio); }
      if (e.code === 'ArrowDown'  || e.code === 'KeyS') { e.preventDefault(); this.player.groundPound(); }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.keys.right = true; }
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this.keys.left  = true; }
    };
    this._ku = (e) => {
      if (isJump(e)) { this.player.releaseJump(); }  // variable jump
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') this.keys.left  = false;
    };
    document.addEventListener('keydown', this._kd);
    document.addEventListener('keyup',   this._ku);
  }

  destroy() {
    document.removeEventListener('keydown', this._kd);
    document.removeEventListener('keyup',   this._ku);
  }

  // ── Update ───────────────────────────────────────────────────
  update() {
    if (this.done) return;
    if (this._paused) return;
    this._age++;

    // Screen shake decay
    if (this._screenShake > 0) this._screenShake--;
    // Stomp combo timer
    if (this._stompComboTimer > 0) this._stompComboTimer--;
    else if (this._stompComboTimer === 0) this._stompCombo = 0;

    this.player.applyInput(this.keys, this.levelW);

    const pinX = Math.round(this.W * R_PLAYER_SCR);
    this.camOffset = Math.max(0, Math.min(this.player.worldX - pinX, this.levelW - this.W));
    this.player.screenX = this.player.worldX - this.camOffset;

    const spd = Math.abs(this.player.vx);
    this._bgOffset1 = (this._bgOffset1 + spd * 0.08) % this.W;
    this._bgOffset2 = (this._bgOffset2 + spd * 0.22) % this.W;
    this._bgOffset3 = (this._bgOffset3 + spd * 0.50) % this.W;

    // Timer
    this._timeTick++;
    if (this._timeTick >= 60) { this._timeTick = 0; this.timeLeft--; }
    if (this.timeLeft <= 0) { this._end('timeout'); return; }

    // Update static + moving platforms
    this.platforms.forEach(p => p.updateScreen(this.camOffset));
    this.movingPlatforms.forEach(mp => { mp.update(); mp.updateScreen(this.camOffset); });

    // All platforms for physics
    const allPlat = [...this.platforms, ...this.movingPlatforms];
    const visPlat = allPlat.filter(p => p.isVisible(this.W));
    this.player.update(this.groundY, visPlat);

    // ── Dust particles ────────────────────────────────────────
    const pFeet = this.player.y + this.player.h;
    // Landing cloud puff (landSquash set to 10 exactly this frame)
    if (this.player._landSquash === 10) {
      for (let i = 0; i < 6; i++) {
        this.dustParticles.push(new DustParticle(
          this.player.screenX + this.player.w / 2, pFeet));
      }
    }
    // Running trail every 5 frames when moving fast enough
    if (this.player.onGround && Math.abs(this.player.vx) > 1.8 && this._age % 5 === 0) {
      this.dustParticles.push(new DustParticle(
        this.player.screenX + this.player.w / 2, pFeet));
    }

    if (!this.player.alive) {
      this._screenShake = 20;
      // Checkpoint respawn: use it if activated and player has extra lives
      if (this._checkpointWorldX !== null && this.lives > 1) {
        this.lives--;
        this.player.hp          = 2;
        this.player.worldX      = this._checkpointWorldX;
        this.player.vy          = 0;
        this.player.vx          = 0;
        this.player.onGround    = true;
        this.player.invincible  = 120;
        this.player.groundPounding = false;
        this.player._groundPoundLanded = false;
        this.particles.push(new RunnerParticle(
          this.W / 2, this.H * 0.4, '💔 Respawn!', '#FF4081', -4));
        return;
      }
      this._end('death');
      return;
    }

    // Ground pound landing: screen shake + defeat nearby enemies
    if (this.player._groundPoundLanded) {
      this.player._groundPoundLanded = false;
      this._screenShake = 18;
      if (this.audio) this.audio.sfxGroundPound();
      // Defeat ground minions within radius
      const poundX = this.player.screenX + this.player.w / 2;
      const POUND_RADIUS = 90;
      this.minions.forEach(m => {
        if (!m.defeated && Math.abs(m.sx - poundX) < POUND_RADIUS) {
          m.takeStompHit();
          m.defeat(); // ensure defeated even if armored (ground pound breaks armor)
          this._doStomp(m.sx, m.groundY);
        }
      });
      this.particles.push(new RunnerParticle(
        this.player.screenX + this.player.w / 2,
        this.player.y + this.player.h, '💥 POUND!', '#FF6F00', -3));
    }

    // Question blocks — head-butt detection
    this.questionBlocks.forEach(qb => {
      qb.update();
      qb.updateScreen(this.camOffset);
      if (qb.checkHit(this.player)) {
        const reward = qb.activate();
        this.player.vy = Math.abs(this.player.vy) * 0.5; // small push down
        this.score += R_SCORE_BLOCK;
        if (reward === 'coin') {
          this.particles.push(new RunnerParticle(qb.sx + qb.w / 2, qb.sy - 16, '🪙', '#FFD700', -5));
          this.particles.push(new RunnerParticle(qb.sx + qb.w / 2, qb.sy - 10, `+${R_SCORE_BLOCK}`, '#FFF176', -3));
        } else if (reward === 'powerup') {
          const types = ['rice-bowl', 'chili', 'shield-item', 'star'];
          const t = types[this.stage.id % types.length];
          const pu = new PowerUpItem(qb.worldX + qb.w / 2, qb.worldY - 36, t);
          pu._groundY = this.groundY;
          this.powerUps.push(pu);
        }
      }
    });

    // Coins
    this.coins.forEach(c => {
      c.updateScreen(this.camOffset);
      c.update();
      if (!c.collected && c.checkCollect(this.player)) {
        c.collected = true;
        this._onCoinCollect(c);
        this.score += R_SCORE_COIN;
      }
    });

    // Power-up items
    this.powerUps.forEach(pu => {
      pu.updateScreen(this.camOffset);
      pu.update(this.groundY, visPlat);
      if (!pu.collected && pu.checkCollect(this.player)) {
        pu.collected = true;
        this._onPowerUpCollect(pu);
      }
    });
    this.powerUps = this.powerUps.filter(pu => !pu.collected || pu._age < 5);

    // Ground minions
    this.minions.forEach(m => {
      m.updateScreen(this.camOffset);
      m.update();
      if (!m.defeated) {
        const res = m.checkCollision(this.player);
        if (res === 'stomp') {
          const stompResult = m.takeStompHit();
          if (stompResult === 'armor-break') {
            this.player.vy = -8;  // small bounce, not full stomp height
            this._screenShake = 6;
            this._stompCombo  = 0; // armor-break resets combo
            if (this.audio) this.audio.sfxBossHit();
            this.particles.push(new RunnerParticle(m.sx, m.groundY - 10, '🛡️ ARMOR BREAK!', '#FF6D00', -5));
          } else {
            this._doStomp(m.sx, m.groundY);
          }
        } else if (res === 'hit') {
          if (this.player._starTimer > 0) {
            // Star power: contact defeats enemies
            m.defeat();
            this._doStomp(m.sx, m.groundY);
          } else {
            this._doPlayerHit();
          }
        }
      }
    });
    this.minions = this.minions.filter(m => !m.isGone());

    // Flying enemies
    this.flyingEnemies.forEach(fe => {
      fe.updateScreen(this.camOffset);
      fe.update();
      if (!fe.defeated) {
        const res = fe.checkCollision(this.player);
        if (res === 'stomp') {
          fe.defeat();
          this._doStomp(fe.sx + fe.w / 2, fe.worldY);
        } else if (res === 'hit') {
          if (this.player._starTimer > 0) {
            fe.defeat();
            this._doStomp(fe.sx + fe.w / 2, fe.worldY);
          } else {
            this._doPlayerHit();
          }
        }
      }
    });
    this.flyingEnemies = this.flyingEnemies.filter(fe => !fe.isGone());

    // Spring pads
    this.springs.forEach(sp => {
      sp.updateScreen(this.camOffset);
      sp.update();
      if (sp.checkLand(this.player)) {
        sp.activate();
        this.player.vy        = R_SPRING_VEL;
        this.player.onGround  = false;
        this.player.groundPounding = false;
        if (this.audio) this.audio.sfxSpring();
        this.particles.push(new RunnerParticle(
          sp.sx + sp.w / 2, sp.groundY - sp.h, '🌀 BOING!', '#FF6F00', -6));
      }
    });

    // Checkpoint
    if (this.checkpoint) {
      this.checkpoint.updateScreen(this.camOffset);
      if (!this.checkpoint.activated && this.checkpoint.check(this.player)) {
        this._checkpointWorldX = this.player.worldX;
        if (this.audio) this.audio.sfxCheckpoint();
        this.particles.push(new RunnerParticle(
          this.checkpoint.sx, this.groundY - 70, '✓ CHECKPOINT!', '#00E676', -5));
      }
    }

    // Flag
    this.flag.updateScreen(this.camOffset);
    if (this.flag.check(this.player)) { this._end('flag'); return; }

    // Particles
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.isDead());

    // Dust particles
    this.dustParticles.forEach(p => p.update());
    this.dustParticles = this.dustParticles.filter(p => !p.isDead());
  }

  // ── Stomp an enemy (shared for ground + flying) ──────────────
  _doStomp(ex, ey) {
    this._stompCombo++;
    this._stompComboTimer = 90; // frames to chain next stomp
    const bounceVy = this._stompCombo >= 3 ? -14 : -8;
    this.player.vy = bounceVy;
    const bonus = this._stompCombo * R_SCORE_STOMP;
    this.score += bonus;
    if (this.audio) this.audio.sfxStomp();
    this.particles.push(new RunnerParticle(ex, ey, '💥', '#FF8F00'));
    if (this._stompCombo >= 2) {
      this.particles.push(new RunnerParticle(ex, ey - 30,
        `COMBO ×${this._stompCombo}!`, '#FFD700', -5));
    }
    this.particles.push(new RunnerParticle(ex, ey - 10,
      `+${bonus}`, '#FFF176', -3, 1));
  }

  // ── Player takes a hit ────────────────────────────────────────
  _doPlayerHit() {
    if (this.player._starTimer > 0) return; // star power: immune
    const took = this.player.takeDamage(this.audio);
    if (took) {
      this._screenShake = 12;
      this._stompCombo  = 0;
      this.particles.push(new RunnerParticle(
        this.player.screenX, this.player.y, '-❤️', '#e53935', -4));
    }
  }

  // ── Power-up collection ───────────────────────────────────────
  _onPowerUpCollect(pu) {
    this.score += R_SCORE_POWERUP;
    if (pu.type === 'rice-bowl') {
      this.player.hp = Math.min(this.player.hp + 1, 5); // +1 HP up to 5
      this.particles.push(new RunnerParticle(pu.sx, pu.worldY, '❤️ +1 HP!', '#FF4081', -5));
      if (this.audio) this.audio.sfxBoost();
    } else if (pu.type === 'chili') {
      this.player.powerUp = 'chili';
      this.player._powerUpTimer = 480; // 8 seconds
      this.player.activateBoost();
      this.particles.push(new RunnerParticle(pu.sx, pu.worldY, '🌶️ SPEED UP!', '#FF6D00', -5));
      if (this.audio) this.audio.sfxBoost();
    } else if (pu.type === 'shield-item') {
      this.player.shieldActive = true;
      this.particles.push(new RunnerParticle(pu.sx, pu.worldY, '🛡️ SHIELD!', '#00B0FF', -5));
      if (this.audio) this.audio.sfxBoost();
    } else if (pu.type === 'star') {
      this.player.powerUp    = 'star';
      this.player._starTimer = R_STAR_DUR;
      this.player.invincible = R_STAR_DUR;
      this.particles.push(new RunnerParticle(pu.sx, pu.worldY, '⭐ STAR POWER!', '#FFD700', -6));
      for (let i = 0; i < 5; i++) {
        this.particles.push(new RunnerParticle(
          pu.sx + (Math.random() - 0.5) * 60,
          pu.worldY + (Math.random() - 0.5) * 30,
          ['✨','🌟','💫'][i % 3], '#FFD700', -4 - Math.random() * 3));
      }
      if (this.audio) this.audio.sfxStarPower();
    }
  }

  // ── Coin collection logic ────────────────────────────────────
  _onCoinCollect(coin) {
    if (this.audio) this.audio.sfxCoin();
    if (this.audio) this.audio.playPhoneme(coin.phoneme);
    this.collectedPhonemes.push({ phoneme: coin.phoneme, wordId: coin.wordId, phIdx: coin.phIdx });
    this.collectedCoinIds.add(`${coin.wordId}-${coin.phIdx}`);

    // Particle pop
    this.particles.push(new RunnerParticle(coin.sx, coin.worldY, coin.phoneme.toUpperCase(), '#FFF176', -4));

    // Check if this completes a word in order
    this._checkWordCompletion(coin.wordId, coin.phIdx);
  }

  _checkWordCompletion(wordId, latestPhIdx) {
    const word    = this.stage.words[wordId];
    if (!word) return;
    const needed  = word.phonemes.length;
    let   seqLen  = 0;
    for (let i = 0; i < needed; i++) {
      if (this.collectedCoinIds.has(`${wordId}-${i}`)) seqLen++;
      else break;
    }
    if (seqLen === needed && !this.completedWords.includes(wordId)) {
      this.completedWords.push(wordId);
      this.player.activateBoost();
      if (this.audio) this.audio.sfxBoost();
      if (this.audio) this.audio.playWord(word.word);
      // Big particle burst
      for (let i = 0; i < 6; i++) {
        this.particles.push(new RunnerParticle(
          this.player.screenX + this.player.w / 2,
          this.player.y,
          ['✨','⭐','💫','🌟'][i % 4], '#FFD700', -5 - Math.random() * 3,
        ));
      }
      this.particles.push(new RunnerParticle(
        this.player.screenX + this.player.w / 2,
        this.player.y - 30,
        'BLEND BOOST! 🔥', '#FF6F00', -4,
      ));
    }
  }

  _end(outcome) {
    this.done    = true;
    this.outcome = outcome;
  }

  // ── Draw ─────────────────────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Screen shake transform
    let shakeX = 0, shakeY = 0;
    if (this._screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this._screenShake * 1.2;
      shakeY = (Math.random() - 0.5) * this._screenShake * 0.7;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this._drawBackground(ctx);
    this._drawGround(ctx);

    // Spring pads (drawn behind platforms)
    this.springs.filter(sp => sp.isVisible(this.W)).forEach(sp => sp.draw(ctx));

    // Checkpoint flag
    if (this.checkpoint && this.checkpoint.isVisible(this.W)) {
      this.checkpoint.draw(ctx, this.groundY);
    }

    // Moving platforms
    this.movingPlatforms.filter(mp => mp.isVisible(this.W)).forEach(mp => mp.draw(ctx));

    // Static platforms
    this.platforms.filter(p => p.isVisible(this.W)).forEach(p => p.draw(ctx, this.sprites.tiles));

    // Question blocks
    this.questionBlocks.filter(qb => qb.isVisible(this.W)).forEach(qb => qb.draw(ctx));

    // Coins
    this.coins.filter(c => c.isVisible(this.W) && !c.collected).forEach(c => c.draw(ctx, this.audio));

    // Power-up items
    this.powerUps.filter(pu => pu.isVisible(this.W) && !pu.collected).forEach(pu => pu.draw(ctx));

    // Ground minions
    this.minions.forEach(m => m.draw(ctx));

    // Flying enemies
    this.flyingEnemies.forEach(fe => fe.draw(ctx));

    // Flag
    if (this.flag.sx < this.W + 100 && this.flag.sx > -100) {
      this.flag.draw(ctx, this.groundY);
    }

    // Dust particles (at player feet, behind player)
    this.dustParticles.forEach(p => p.draw(ctx));

    // Player (on top of everything)
    this.player.draw(ctx, this.sprites);

    // Particles
    this.particles.forEach(p => p.draw(ctx));

    ctx.restore(); // end screen-shake transform

    // HUD always drawn without shake
    this._drawHUD(ctx);
  }

  // ── Background ── 3-layer parallax ───────────────────────────
  _drawBackground(ctx) {
    const bgKey = this.stage.bg;
    const bgSp  = bgKey && this.sprites[bgKey];
    if (bgSp && bgSp.complete && bgSp.naturalWidth > 0) {
      const imgW  = bgSp.naturalWidth;
      const imgH  = bgSp.naturalHeight;
      const drawH = this.H;
      const drawW = drawH * (imgW / imgH);
      // Layer 1: far background scrolls very slowly
      const off1 = (this._bgOffset1 * 0.2) % drawW;
      for (let x = -off1; x < this.W + drawW; x += drawW) {
        ctx.drawImage(bgSp, x, 0, drawW, drawH);
      }

      // Layer 2: mid-ground tinted overlay for depth
      ctx.save();
      ctx.globalAlpha = 0.0;  // bg image is clear; add procedural mid layer below
      ctx.restore();

      // Procedural mid layer: semi-transparent hills scrolling at mid speed
      this._drawParallaxLayer(ctx, this._bgOffset2, 0.45, 5, 90, 'rgba(0,0,0,0.07)', 0.35);
      // Procedural near layer: darker, faster
      this._drawParallaxLayer(ctx, this._bgOffset3, 0.80, 7, 55, 'rgba(0,0,0,0.13)', 0.50);
      return;
    }

    // ── Procedural fallback ───────────────────────────────────
    const colors = this.stage.skyColor || ['#87CEEB', '#c5e8f8'];
    const sky = ctx.createLinearGradient(0, 0, 0, this.H);
    sky.addColorStop(0,   colors[0]);
    sky.addColorStop(0.7, colors[1]);
    sky.addColorStop(1,   this.stage.groundColor || '#5a8a3c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    // Layer 1: far clouds / snow peaks
    this._drawMountainLayer(ctx, this._bgOffset1, 0.28, 7, 110, 'rgba(255,255,255,0.10)');
    // Layer 2: mid hills
    this._drawMountainLayer(ctx, this._bgOffset2, 0.45, 5,  80, 'rgba(0,100,0,0.18)');
    // Layer 3: near trees
    this._drawTreeLayer(ctx, this._bgOffset3);
  }

  _drawParallaxLayer(ctx, offset, scroll, count, radius, color, yFrac) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const hx = ((i * (this.W / count * 1.6) - offset * scroll) % (this.W + radius * 2)) - radius;
      const hy = this.groundY * yFrac + (i * 37 % 30);
      ctx.beginPath();
      ctx.arc(hx, hy, radius + (i * 23 % 35), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMountainLayer(ctx, offset, scroll, count, radius, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const gap = (this.W + radius * 2) / count;
      const hx  = ((i * gap - offset * scroll) % (this.W + radius * 2)) - radius;
      ctx.beginPath();
      ctx.arc(hx, this.groundY - 5, radius + (i * 37 % 50), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawTreeLayer(ctx, offset) {
    ctx.fillStyle = 'rgba(0,80,0,0.20)';
    for (let i = 0; i < 9; i++) {
      const tx = ((i * 138 - offset * 0.8) % (this.W + 60)) - 30;
      const th = 52 + (i * 23 % 42);
      ctx.fillRect(tx, this.groundY - th, 14, th);
      ctx.beginPath();
      ctx.arc(tx + 7, this.groundY - th, 24, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawGround(ctx) {
    const gy = this.groundY;
    const W  = this.W;
    const gc = this.stage.groundColor || '#5a8a3c';

    // Dirt
    ctx.fillStyle = '#8B6040';
    ctx.fillRect(0, gy, W, R_GROUND_H);

    // Grass strip
    ctx.fillStyle = gc;
    ctx.fillRect(0, gy, W, 16);

    // Scrolling grass tufts
    const tileW  = 38;
    const offset = this.camOffset % tileW;
    ctx.fillStyle = '#3d7a2c';
    for (let x = -tileW + offset; x < W + tileW; x += tileW) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 16);
      ctx.lineTo(x + 6, gy + 4);
      ctx.lineTo(x + 12, gy + 16);
      ctx.fill();
    }
  }

  // ── HUD ──────────────────────────────────────────────────────
  _drawHUD(ctx) {
    const p = this.player;
    ctx.save();
    ctx.textBaseline = 'top';

    // ── Top HUD bar ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.beginPath(); ctx.roundRect(6, 6, this.W - 12, 52, 14); ctx.fill();

    // ── HP hearts (top-left) — up to 5 hearts
    const maxHp = Math.max(3, p.hp);
    ctx.font = '24px serif';
    for (let i = 0; i < Math.max(3, maxHp); i++) {
      ctx.globalAlpha = i < p.hp ? 1 : 0.18;
      ctx.fillText('❤️', 12 + i * 28, 13);
    }
    ctx.globalAlpha = 1;

    // Active power-up icon next to HP
    if (p.powerUp) {
      const puIcon = p.powerUp === 'chili'      ? '🌶️' :
                     p.powerUp === 'shield-item' ? '🛡️' :
                     p.powerUp === 'star'        ? '⭐' : '';
      if (puIcon) {
        if (p.powerUp === 'star') {
          // Rainbow flash for star
          const hue = (this._age * 10) % 360;
          ctx.shadowColor = `hsl(${hue},100%,65%)`; ctx.shadowBlur = 10;
        }
        ctx.font = '20px serif';
        ctx.fillText(puIcon, 12 + Math.max(3, maxHp) * 28 + 4, 16);
        ctx.shadowBlur = 0;
      }
    }
    if (p.shieldActive) {
      ctx.font = '20px serif';
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this._age * 0.2);
      ctx.fillText('🛡️', 12 + Math.max(3, maxHp) * 28 + 4, 16);
      ctx.globalAlpha = 1;
    }

    // ── Timer (top-center)
    const urgent = this.timeLeft < 15;
    ctx.font        = `bold ${urgent ? '26px' : '22px'} "Comic Sans MS", system-ui`;
    ctx.fillStyle   = urgent ? '#FF5252' : '#FFFFFF';
    ctx.textAlign   = 'center';
    ctx.shadowColor = urgent ? '#FF000088' : 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 5;
    if (urgent && this._age % 20 < 10) ctx.fillStyle = '#FF8A80'; // blink
    ctx.fillText(`⏱ ${this.timeLeft}s`, this.W / 2, 14);
    ctx.shadowBlur  = 0;

    // ── Score (top-center, below timer)
    ctx.font      = `bold 13px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 2;
    ctx.fillText(`⭐ ${this.score.toLocaleString()}`, this.W / 2, 38);
    ctx.shadowBlur  = 0;

    // ── Coins collected (top-right)
    const total     = this.coins.length;
    const collected = this.coins.filter(c => c.collected).length;
    ctx.font      = 'bold 16px "Comic Sans MS", system-ui';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
    ctx.fillText(`🪙 ${collected}/${total}`, this.W - 12, 14);
    // Lives remaining
    ctx.font      = '14px "Comic Sans MS", system-ui';
    ctx.fillStyle = '#fff';
    ctx.fillText(`✕${this.lives} 🍙`, this.W - 12, 34);
    ctx.shadowBlur  = 0;
    ctx.restore();

    // ── Pause overlay (drawn after HUD so it covers everything)
    if (this._paused) { this._drawPauseOverlay(ctx); }

    // ── Boost bar (center-bottom when active)
    if (p.boostFrames > 0) {
      const pct = p.boostFrames / R_BOOST_DUR;
      const bw  = Math.min(220, this.W * 0.45);
      const bx  = (this.W - bw) / 2;
      const by  = this.H - R_GROUND_H - 40;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, 18, 6); ctx.fill();

      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0,   p.powerUp === 'chili' ? '#FF6D00' : '#FFD700');
      grad.addColorStop(0.5, p.powerUp === 'chili' ? '#FF8F00' : '#FF6F00');
      grad.addColorStop(1,   p.powerUp === 'chili' ? '#FF6D00' : '#FFD700');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(bx, by, bw * pct, 14, 4); ctx.fill();

      ctx.fillStyle   = '#fff';
      ctx.font        = 'bold 12px "Comic Sans MS", system-ui';
      ctx.textAlign   = 'center';
      ctx.fillText(p.powerUp === 'chili' ? '🌶️ CHILI RUSH!' : '⚡ BLEND BOOST!',
        this.W / 2, by - 7);
    }

    // ── Stomp combo badge (right side)
    if (this._stompCombo >= 2 && this._stompComboTimer > 0) {
      const pulse = 0.8 + 0.2 * Math.sin(this._age * 0.25);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font        = `bold ${14 + this._stompCombo * 3}px "Comic Sans MS", system-ui`;
      ctx.fillStyle   = '#FFD700';
      ctx.textAlign   = 'right';
      ctx.shadowColor = '#FF6F00'; ctx.shadowBlur = 8;
      ctx.fillText(`👟 STOMP ×${this._stompCombo}`, this.W - 12, this.H - R_GROUND_H - 48);
      ctx.restore();
    }

    // ── Stage label (bottom-left)
    ctx.font      = '12px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`Stage ${this.stage.id}: ${this.stage.name}`, 10, this.H - R_GROUND_H - 10);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
  }

  // ── Pause ─────────────────────────────────────────────────────
  _togglePause() {
    this._paused = !this._paused;
  }

  _drawPauseOverlay(ctx) {
    const cx = this.W / 2;
    const cy = this.H / 2;
    ctx.save();
    // Dim the entire screen
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.W, this.H);
    // Panel
    const pw = Math.min(300, this.W * 0.7);
    const ph = 150;
    ctx.fillStyle   = 'rgba(10,10,30,0.88)';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 18); ctx.fill(); ctx.stroke();
    // Title
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(this.W * 0.068)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle    = '#FFD700';
    ctx.shadowColor  = '#FF6F00';
    ctx.shadowBlur   = 14;
    ctx.fillText('⏸ PAUSED', cx, cy - 34);
    ctx.shadowBlur   = 0;
    // Hints
    ctx.font      = `${Math.round(this.W * 0.034)}px "Comic Sans MS", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.fillText('P or ESC to resume', cx, cy + 6);
    ctx.fillStyle = '#FF9800';
    ctx.font      = `${Math.round(this.W * 0.031)}px "Comic Sans MS", system-ui`;
    ctx.fillText('Q — quit to map', cx, cy + 42);
    ctx.restore();
  }

  // ── Public getters for battle phase ─────────────────────────
  getCollectedPhonemes() { return this.collectedPhonemes.slice(); }
  getCollectedCount()    { return this.coins.filter(c => c.collected).length; }
}
