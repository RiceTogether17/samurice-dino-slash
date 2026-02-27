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
const R_GROUND_H   = 80;    // height of ground strip at canvas bottom
const R_PLAYER_X   = 120;   // fixed screen X of Riku
const R_GRAVITY    = 0.55;
const R_JUMP_VEL   = -13.5;
const R_BASE_SPD   = 3.5;   // camera scroll speed
const R_FAST_SPD   = 5.5;   // when holding right / long-tap
const R_BOOST_SPD  = 6.5;   // blend-boost active
const R_BOOST_DUR  = 300;   // frames of boost after collecting full word
const R_COIN_R     = 22;    // coin collision radius
const R_LEVEL_W    = 7800;  // world width per level (px)

// ─────────────────────────────────────────────────────────────
// RUNNER PLAYER
// ─────────────────────────────────────────────────────────────
class RunnerPlayer {
  constructor(groundY, sprites) {
    this.worldX  = 0;
    this.screenX = R_PLAYER_X;
    this.y       = groundY - 56;   // standing on ground
    this.vy      = 0;
    this.w       = 48;
    this.h       = 56;
    this.onGround = true;
    this.jumpHeld = false;
    this.hp      = 3;           // hearts
    this.invincible = 0;        // invincibility frames after hit
    this.boostFrames = 0;       // frames of blend boost remaining
    this.shieldActive = false;  // one-hit shield from boost
    this.sprites = sprites || {};
    this._frame  = 0;           // animation frame counter
    this._runCycle = 0;         // 0-3 running leg cycle
  }

  get alive() { return this.hp > 0; }

  // Called when a complete word is collected during runner
  activateBoost() {
    this.boostFrames  = R_BOOST_DUR;
    this.shieldActive = true;
  }

  // Horizontal speed of world scroll
  currentSpeed(fastHeld) {
    if (this.boostFrames > 0) return R_BOOST_SPD;
    if (fastHeld)             return R_FAST_SPD;
    return R_BASE_SPD;
  }

  jump(audio) {
    if (!this.onGround) return;
    this.vy        = R_JUMP_VEL;
    this.onGround  = false;
    this.jumpHeld  = true;
    if (audio) audio.sfxJump();
  }

  // Call each frame with the current ground level and platform list
  update(groundY, platforms) {
    // Boost countdown
    if (this.boostFrames > 0) this.boostFrames--;
    if (this.invincible > 0)  this.invincible--;

    // Gravity
    this.vy = Math.min(this.vy + R_GRAVITY, 18);
    this.y += this.vy;

    // Ground collision
    const gnd = groundY - this.h;
    if (this.y >= gnd) {
      this.y        = gnd;
      this.vy       = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Platform collision (top-only)
    if (this.vy >= 0) {
      for (const p of platforms) {
        if (this._overlapsPlatform(p)) {
          this.y        = p.sy - this.h;
          this.vy       = 0;
          this.onGround = true;
          break;
        }
      }
    }

    // Fell below canvas: die
    if (this.y > groundY + 100) this.hp = 0;

    // Animation tick
    this._frame++;
    if (this._frame % 8 === 0) this._runCycle = (this._runCycle + 1) % 4;
  }

  // Screen Y
  get sy() { return this.y; }

  // Check if player's bottom overlaps top of platform (from above)
  _overlapsPlatform(p) {
    const prevBottom = this.y - this.vy + this.h;
    const curBottom  = this.y + this.h;
    const playerL    = this.screenX + 6;
    const playerR    = this.screenX + this.w - 6;
    return prevBottom <= p.sy + 4 &&
           curBottom  >= p.sy &&
           playerR    >  p.sx &&
           playerL    <  p.sx + p.w;
  }

  takeDamage(audio) {
    if (this.invincible > 0) return false;
    if (this.shieldActive) { this.shieldActive = false; return false; }
    this.hp--;
    this.invincible = 90;  // 1.5 seconds
    if (audio) audio.sfxHurt();
    return true;
  }

  // Bounding box for collision checks
  bounds() {
    const inset = 8;
    return {
      x: this.screenX + inset,
      y: this.y + inset,
      w: this.w - inset * 2,
      h: this.h - inset * 2,
    };
  }

  // Draw Riku — cycles walk frames on ground, jump frame in air
  draw(ctx, sprites) {
    const x = this.screenX;
    const y = this.y;

    // Pick the correct sprite:
    //   In air            → riku-jump-1
    //   On ground, hurt   → riku-hurt (flash handled by flicker below)
    //   On ground, normal → cycle riku-walk-1 … riku-walk-4
    let sp;
    if (!this.onGround) {
      sp = sprites && (sprites['riku-jump-1'] || sprites['riku-jump'] || sprites['riku-run']);
    } else {
      const frame = (this._runCycle % 4) + 1;   // 1–4
      sp = sprites && (sprites[`riku-walk-${frame}`] || sprites['riku-run'] || sprites['riku-idle']);
    }

    // Flicker when invincible
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 0) return;

    ctx.save();

    if (sp && sp.complete && sp.naturalWidth > 0) {
      // Mild squash-stretch: wider/shorter on ground, taller/narrower in air
      const scaleX = this.onGround ? 1 + Math.sin(this._runCycle * Math.PI / 2) * 0.04 : 0.92;
      const scaleY = this.onGround ? 1 - Math.sin(this._runCycle * Math.PI / 2) * 0.04 : 1.08;
      const dw = this.w * scaleX;
      const dh = this.h * scaleY;
      ctx.drawImage(sp, x + (this.w - dw) / 2, y + (this.h - dh), dw, dh);
    } else {
      this._drawFallback(ctx, x, y);
    }

    // Boost glow
    if (this.boostFrames > 0) {
      const alpha = 0.4 + 0.2 * Math.sin(this._frame * 0.3);
      ctx.globalAlpha = alpha;
      ctx.shadowBlur  = 20;
      ctx.shadowColor = '#FFD700';
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.ellipse(x + this.w / 2, y + this.h / 2, this.w / 2 + 6, this.h / 2 + 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Canvas fallback: cute rice-ball samurai
  _drawFallback(ctx, x, y) {
    const cx = x + this.w / 2;
    // Bob on ground run cycle
    const bob = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 3 : 0;
    const ty  = y + bob;

    // Body (white rice ball)
    ctx.fillStyle = '#F5F5F0';
    ctx.beginPath();
    ctx.ellipse(cx, ty + 32, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Nori band (black seaweed strip)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 20, ty + 24, 40, 12);

    // Face
    ctx.fillStyle = '#fff9e0';
    ctx.beginPath();
    ctx.ellipse(cx, ty + 16, 17, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    const eyeY = ty + 13;
    ctx.beginPath(); ctx.ellipse(cx - 6, eyeY, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 6, eyeY, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Rosy cheeks
    ctx.fillStyle = 'rgba(255,150,150,0.5)';
    ctx.beginPath(); ctx.ellipse(cx - 11, eyeY + 4, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 11, eyeY + 4, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();

    // Headband (samurai hachimaki)
    ctx.fillStyle = '#ff3322';
    ctx.fillRect(cx - 17, ty + 4, 34, 5);
    ctx.fillStyle = '#ff6655';
    ctx.fillRect(cx - 17, ty + 4, 34, 2);

    // Sword (katana) — swings during run
    const swingAngle = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 0.3 : -0.5;
    ctx.save();
    ctx.translate(cx + 10, ty + 30);
    ctx.rotate(swingAngle);
    // Blade
    ctx.fillStyle = '#ccc';
    ctx.fillRect(0, -2, 28, 4);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(22, -1, 6, 2);
    // Guard
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-2, -5, 5, 10);
    ctx.restore();

    // Legs / feet (running animation)
    const legOffset = this.onGround ? Math.sin(this._runCycle * Math.PI / 2) * 8 : 0;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(cx - 8, ty + 56 + legOffset,  7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 8, ty + 56 - legOffset,  7, 5, 0, 0, Math.PI * 2); ctx.fill();
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

    // Phoneme text
    const text   = this.phoneme.toUpperCase();
    const fsize  = text.length > 2 ? 11 : text.length > 1 ? 13 : 15;
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
  constructor(worldX, groundY, platform = null, sprite = null) {
    this.worldX   = worldX;
    this.groundY  = platform ? platform.worldY - 36 : groundY - 36;
    this.w        = 44;
    this.h        = 44;
    this.vx       = -1.2;   // walks left (toward player)
    this.defeated = false;
    this.deathFrames = 0;
    this.sx       = 0;
    this._age     = 0;
    this._patrolMin = worldX - 120;
    this._patrolMax = worldX + 120;
    this._sprite  = sprite;   // Image | null
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

    // Body
    ctx.fillStyle = '#558B2F';
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
// LEVEL GENERATOR
// Produces platform, coin, minion, and flag positions for a stage.
// ─────────────────────────────────────────────────────────────
// sprites is passed through so MinionDino can use the 'minion-dino' image
function generateRunnerLevel(stageData, canvasH, sprites) {
  const groundY    = canvasH - R_GROUND_H;
  const words      = stageData.words.slice(0, 5);  // 5 words per runner
  const difficulty = stageData.id - 1;             // 0-5
  const minionSp   = sprites && sprites['minion-dino'];
  const items      = { platforms: [], coins: [], minions: [], flag: null };

  let wx = 800; // start X (safe spawn zone)

  words.forEach((word, wIdx) => {
    const elevated    = wIdx % 2 === 1;  // alternate ground / platform
    const platformH   = elevated ? groundY - 80 - (difficulty * 12) : groundY;
    const coinY       = platformH - 55;
    const platW       = word.phonemes.length * 82 + 60;

    // Dojo blocks every 3rd platform, rice bundles otherwise
    const style = (wIdx + difficulty) % 3 === 2 ? 'dojo' : 'rice';

    if (elevated) {
      items.platforms.push(new RunnerPlatform(wx - 30, platformH - 20, platW, style));
    }

    // Place a coin for each phoneme of this word
    word.phonemes.forEach((ph, pIdx) => {
      items.coins.push(new PhonemeCoin(
        wx + pIdx * 82,
        coinY,
        ph,
        wIdx, pIdx,
        word.hint,
        word.word,
      ));
    });

    // Minion on every 2nd word section
    if (wIdx % 2 === 0 && wIdx > 0) {
      const mx = wx + word.phonemes.length * 40;
      items.minions.push(new MinionDino(mx, groundY, elevated ? items.platforms[items.platforms.length - 1] : null, minionSp));
    }

    // In higher stages, add an extra platform mid-gap for challenge
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

    // Use logical dimensions passed from SlashGame (avoids DPR physical-pixel bug)
    const W = logicalW || canvas.clientWidth  || 480;
    const H = logicalH || canvas.clientHeight || 700;
    this.W  = W;
    this.H  = H;

    this.groundY   = H - R_GROUND_H;
    this.camOffset = 0;    // world X that maps to screen X=0

    // Generate level (pass sprites so MinionDino gets the sprite reference)
    const level    = generateRunnerLevel(stageData, H, sprites);
    this.platforms = level.platforms;
    this.coins     = level.coins;
    this.minions   = level.minions;
    this.flag      = level.flag;
    this.levelW    = level.totalWidth;

    // Player
    this.player    = new RunnerPlayer(this.groundY, sprites);

    // Input state
    this.keys      = { right: false, jump: false };
    this.touchHeld = false;
    this._bindInput();

    // State tracking
    this.collectedPhonemes = [];  // array of {phoneme, wordId, phIdx}
    this.collectedCoinIds  = new Set();
    this.wordProgress      = {};  // wordId → count of consecutive phonemes
    this.completedWords    = [];
    this.particles         = [];
    this.timeLeft          = 90; // seconds
    this._timeTick         = 0;

    // Parallax background layers
    this._bgOffset1 = 0;  // far hills
    this._bgOffset2 = 0;  // mid trees
    this._age       = 0;

    this.done    = false;
    this.outcome = null;   // 'flag' | 'death' | 'timeout'
  }

  // ── Input ────────────────────────────────────────────────────
  _bindInput() {
    this._kd = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp')    { e.preventDefault(); this.keys.jump  = true; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD')  { this.keys.right = true; }
    };
    this._ku = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp')    this.keys.jump  = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD')  this.keys.right = false;
    };
    this._ts = (e) => { e.preventDefault(); this.touchHeld = true; this._lastTapTime = performance.now(); };
    this._te = (e) => {
      if (performance.now() - (this._lastTapTime || 0) < 200) {
        // Short tap = jump
        this.player.jump(this.audio);
      }
      this.touchHeld = false;
    };
    document.addEventListener('keydown', this._kd);
    document.addEventListener('keyup',   this._ku);
    this.canvas.addEventListener('touchstart', this._ts, { passive: false });
    this.canvas.addEventListener('touchend',   this._te, { passive: false });
  }

  destroy() {
    document.removeEventListener('keydown', this._kd);
    document.removeEventListener('keyup',   this._ku);
    this.canvas.removeEventListener('touchstart', this._ts);
    this.canvas.removeEventListener('touchend',   this._te);
  }

  // ── Update ───────────────────────────────────────────────────
  update() {
    if (this.done) return;
    this._age++;

    // Jump on fresh keypress
    if (this.keys.jump) { this.player.jump(this.audio); this.keys.jump = false; }

    // Scroll speed
    const fastHeld = this.keys.right || (this.touchHeld);
    const speed    = this.player.currentSpeed(fastHeld);
    this.camOffset += speed;
    this.player.worldX = this.camOffset;

    // Background parallax offsets
    this._bgOffset1 = (this._bgOffset1 + speed * 0.2) % this.W;
    this._bgOffset2 = (this._bgOffset2 + speed * 0.5) % this.W;

    // Timer
    this._timeTick++;
    if (this._timeTick >= 60) { this._timeTick = 0; this.timeLeft--; }
    if (this.timeLeft <= 0) { this._end('timeout'); return; }

    // Update platform screen positions
    this.platforms.forEach(p => p.updateScreen(this.camOffset - R_PLAYER_X));

    // Player physics (pass visible platforms only)
    const visPlat = this.platforms.filter(p => p.isVisible(this.W));
    this.player.update(this.groundY, visPlat);

    if (!this.player.alive) { this._end('death'); return; }

    // Coins
    this.coins.forEach(c => {
      c.updateScreen(this.camOffset - R_PLAYER_X);
      c.update();
      if (!c.collected && c.checkCollect(this.player)) {
        c.collected = true;
        this._onCoinCollect(c);
      }
    });

    // Minions
    this.minions.forEach(m => {
      m.updateScreen(this.camOffset - R_PLAYER_X);
      m.update();
      if (!m.defeated) {
        const res = m.checkCollision(this.player);
        if (res === 'stomp') {
          m.defeat();
          this.player.vy = -8;   // bounce
          if (this.audio) this.audio.sfxStomp();
          this.particles.push(new RunnerParticle(m.sx, m.groundY, '💥', '#FF8F00'));
        } else if (res === 'hit') {
          const took = this.player.takeDamage(this.audio);
          if (took) {
            this.particles.push(new RunnerParticle(this.player.screenX, this.player.y, '-❤️', '#e53935', -4));
          }
        }
      }
    });
    this.minions = this.minions.filter(m => !m.isGone());

    // Flag
    this.flag.updateScreen(this.camOffset - R_PLAYER_X);
    if (this.flag.check(this.player)) { this._end('flag'); return; }

    // Particles
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.isDead());
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

    this._drawBackground(ctx);
    this._drawGround(ctx);

    // Platforms
    this.platforms.filter(p => p.isVisible(this.W)).forEach(p => p.draw(ctx, this.sprites.tiles));

    // Coins
    this.coins.filter(c => c.isVisible(this.W) && !c.collected).forEach(c => c.draw(ctx, this.audio));

    // Minions (sprites passed for fallback-free rendering)
    this.minions.forEach(m => m.draw(ctx));

    // Flag
    if (this.flag.sx < this.W + 100 && this.flag.sx > -100) {
      this.flag.draw(ctx, this.groundY);
    }

    // Player
    this.player.draw(ctx, this.sprites);

    // Particles
    this.particles.forEach(p => p.draw(ctx));

    // HUD
    this._drawHUD(ctx);
  }

  // ── Background ───────────────────────────────────────────────
  _drawBackground(ctx) {
    const bgKey = this.stage.bg;
    const bgSp  = bgKey && this.sprites[bgKey];
    if (bgSp && bgSp.complete && bgSp.naturalWidth > 0) {
      // Draw real background image, scrolling slowly (two copies tiled)
      const imgW = bgSp.naturalWidth;
      const imgH = bgSp.naturalHeight;
      const drawH = this.H;
      const drawW = drawH * (imgW / imgH);   // maintain aspect ratio
      // Parallax offset (slow scroll tied to cam)
      const off = (this._bgOffset1 * 0.4) % drawW;
      for (let x = -off; x < this.W + drawW; x += drawW) {
        ctx.drawImage(bgSp, x, 0, drawW, drawH);
      }
      return;
    }

    // ── Procedural fallback ───────────────────────────────────
    const colors = this.stage.skyColor || ['#87CEEB', '#c5e8f8'];
    const sky = ctx.createLinearGradient(0, 0, 0, this.H);
    sky.addColorStop(0, colors[0]);
    sky.addColorStop(0.7, colors[1]);
    sky.addColorStop(1, this.stage.groundColor || '#5a8a3c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    // Far hills
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 5; i++) {
      const hx = ((i * 220 - this._bgOffset1 * 0.3) % (this.W + 220)) - 110;
      const hr = 80 + (i * 37 % 60);
      ctx.beginPath();
      ctx.arc(hx, this.groundY - 5, hr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mid trees
    ctx.fillStyle = 'rgba(0,80,0,0.18)';
    for (let i = 0; i < 8; i++) {
      const tx = ((i * 130 - this._bgOffset2 * 0.5) % (this.W + 60)) - 30;
      const th = 50 + (i * 23 % 40);
      ctx.fillRect(tx, this.groundY - th, 14, th);
      ctx.beginPath();
      ctx.arc(tx + 7, this.groundY - th, 22, 0, Math.PI * 2);
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

    // ── HP hearts (top-left)
    ctx.font        = '24px serif';
    ctx.textBaseline = 'top';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < p.hp ? 1 : 0.25;
      ctx.fillText('❤️', 14 + i * 32, 12);
    }
    ctx.globalAlpha = 1;

    // ── Timer (top-center)
    const urgent = this.timeLeft < 15;
    ctx.font      = `bold ${urgent ? '26px' : '22px'} "Comic Sans MS", system-ui`;
    ctx.fillStyle = urgent ? '#FF1744' : '#fff';
    ctx.textAlign = 'center';
    ctx.shadowColor  = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur   = 4;
    ctx.fillText(`⏱ ${this.timeLeft}s`, this.W / 2, 14);
    ctx.shadowBlur   = 0;

    // ── Phoneme coins collected (top-right)
    const total   = this.coins.length;
    const collected = this.coins.filter(c => c.collected).length;
    ctx.font      = 'bold 15px "Comic Sans MS", system-ui';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.fillText(`🪙 ${collected}/${total}`, this.W - 14, 16);

    // ── Boost bar (center-bottom when active)
    if (p.boostFrames > 0) {
      const pct = p.boostFrames / R_BOOST_DUR;
      const bw  = 200;
      const bx  = (this.W - bw) / 2;
      const by  = this.H - R_GROUND_H - 38;

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, 18, 6); ctx.fill();

      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0,   '#FFD700');
      grad.addColorStop(0.5, '#FF6F00');
      grad.addColorStop(1,   '#FFD700');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(bx, by, bw * pct, 14, 4); ctx.fill();

      ctx.fillStyle   = '#fff';
      ctx.font        = 'bold 12px "Comic Sans MS", system-ui';
      ctx.textAlign   = 'center';
      ctx.fillText('⚡ BLEND BOOST!', this.W / 2, by - 6);
    }

    // Stage label (bottom-left)
    ctx.font      = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(`Stage ${this.stage.id}: ${this.stage.name}`, 12, this.H - R_GROUND_H - 10);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
  }

  // ── Public getters for battle phase ─────────────────────────
  getCollectedPhonemes() { return this.collectedPhonemes.slice(); }
  getCollectedCount()    { return this.coins.filter(c => c.collected).length; }
}
