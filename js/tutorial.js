'use strict';
// PHASE 6: NEW FILE — js/tutorial.js
// 5-step canvas-drawn onboarding tutorial.
// Shown once before Stage 1 on first play; fully skippable.
// Integrates with SlashGame 'onboarding' state machine.
// Why: replaces the minimal 4-hint runner strip with a proper
//      pre-game walkthrough that teaches all core mechanics.

class Tutorial {
  constructor(W, H, onComplete, audio = null) {
    this.W          = W;
    this.H          = H;
    this.onComplete = onComplete;
    this.audio      = audio;   // shared AudioManager — narrates each step
    this.step       = 0;
    this.stepAge    = 0;   // frames since current step started
    this._age       = 0;   // total frames alive
    this._nextBtnRect = null;
    this._skipBtnRect = null;
    this._prevBtnRect = null;
    // Interactive steps: the child must DO the thing before Next unlocks
    this._actionDone   = false;
    this._actionFlash  = 0;    // celebration frames after completing the action
    this._narratedStep = -1;   // last step read aloud (so we narrate once)
    this._jumpBtnRect  = null; // hit target for the try-it JUMP button
    this._tileRects    = [];   // hit targets for the try-it phoneme tiles

    // Short, kid-sized copy (the audience is pre-readers — every step
    // is narrated aloud via `say`; text is for the grown-up beside them).
    this.steps = [
      {
        icon: '🦖', iconB: '⚔️',
        accent: '#FFD700',
        title: 'Welcome to\nSamurice Dino Slash!',
        lines: ['Riku beats dinos with the', 'power of SOUNDS! 🗡️'],
        say: 'Welcome to Samurice Dino Slash! Riku beats the dinos with the power of sounds!',
        hint: null,
        special: null,
      },
      {
        icon: '🕹️', iconB: null,
        accent: '#4FC3F7',
        title: 'Jump!',
        lines: ['Tap the JUMP button', 'to try it now! 👇'],
        say: 'Tap the big jump button to try it now!',
        saidDone: 'Great jump!',
        hint: null,
        special: 'dpad',
        interactive: 'jump',
      },
      {
        icon: '🍚', iconB: null,
        accent: '#FFD700',
        title: 'Collect Letter Coins',
        lines: ['Grab the golden coins —', 'they hold word sounds!'],
        say: 'Grab the golden coins while you run. They hold the sounds of words!',
        hint: null,
        special: null,
      },
      {
        icon: '⛩️', iconB: '⚔️',
        accent: '#00E676',
        title: 'Dino Battle!',
        lines: ['At the end, a dino challenges', 'you to build a word!'],
        say: 'At the end of the run, a dino will challenge you to build a word!',
        hint: null,
        special: null,
      },
      {
        icon: '🔤', iconB: null,
        accent: '#FF8A65',
        title: 'Tap the Sounds!',
        lines: ['Tap the SH tile', 'to hear its sound! 👇'],
        say: 'Tap the tiles in order to build the word. Try it — tap the tile that says shhh!',
        saidDone: 'Shhh… ship! You did it!',
        hint: null,
        special: 'tiles',
        interactive: 'tile',
      },
    ];
  }

  // Read the current step aloud (once per step entry)
  _narrate() {
    if (this._narratedStep === this.step) return;
    this._narratedStep = this.step;
    const s = this.steps[this.step];
    if (s?.say && this.audio?.speak) this.audio.speak(s.say, 0.9, 1.1);
  }

  // The child performed the step's required action
  _completeAction() {
    if (this._actionDone) return;
    this._actionDone  = true;
    this._actionFlash = 40;
    const s = this.steps[this.step];
    this.audio?.sfxPerfectBlend?.();
    if (s?.saidDone && this.audio?.speak) {
      setTimeout(() => this.audio.speak(s.saidDone, 0.9, 1.15), 350);
    }
  }

  get totalSteps() { return this.steps.length; }
  get isDone()     { return this.step >= this.totalSteps; }

  // Next is locked on interactive steps until the action is done
  get _nextLocked() {
    const s = this.steps[this.step];
    return !!(s?.interactive && !this._actionDone);
  }

  next() {
    if (this._nextLocked) return;
    this.step++;
    this.stepAge = 0;
    this._actionDone = false;
    this._actionFlash = 0;
    if (this.isDone && this.onComplete) this.onComplete();
  }

  prev() {
    if (this.step > 0) { this.step--; this.stepAge = 0; this._actionDone = true; }
  }

  skip() {
    this.step = this.totalSteps;
    if (this.onComplete) this.onComplete();
  }

  handleClick(mx, my) {
    if (this.isDone) return false;
    // Interactive targets first — trying the action beats navigation
    const hit = (r) => r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    const s = this.steps[this.step];
    if (s?.interactive === 'jump' && !this._actionDone && hit(this._jumpBtnRect)) {
      this.audio?.sfxJump?.();
      this._completeAction();
      return true;
    }
    if (s?.interactive === 'tile' && !this._actionDone) {
      for (const tr of this._tileRects) {
        if (hit(tr)) {
          this.audio?.playPhoneme?.(tr.ph);
          if (tr.target) this._completeAction();
          return true;
        }
      }
    }
    for (const [rect, action] of [
      [this._nextBtnRect, () => this.next()],
      [this._skipBtnRect, () => this.skip()],
      [this._prevBtnRect, () => this.prev()],
    ]) {
      if (rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
        action();
        return true;
      }
    }
    return false;
  }

  handleKey(key) {
    if (this.isDone) return false;
    // Space performs the try-it jump on the interactive jump step
    if (key === ' ' && this.steps[this.step]?.interactive === 'jump' && !this._actionDone) {
      this.audio?.sfxJump?.();
      this._completeAction();
      return true;
    }
    if (key === 'ArrowRight' || key === 'Enter' || key === ' ') { this.next(); return true; }
    if (key === 'ArrowLeft')                                     { this.prev(); return true; }
    if (key === 'Escape')                                        { this.skip(); return true; }
    return false;
  }

  draw(ctx, sprites) {
    if (this.isDone) return;
    this._age++;
    this.stepAge++;
    const { W, H } = this;
    const step = this.steps[this.step];
    const t    = this._age;
    const sa   = this.stepAge;
    this._narrate();
    if (this._actionFlash > 0) this._actionFlash--;

    // Slide-in on step change
    const slideIn = Math.min(1, sa / 22);

    // ── Card dimensions ───────────────────────────────────────
    const cardW = Math.min(W * 0.90, 500);
    const cardH = Math.min(H * 0.82, 530);
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;

    ctx.save();
    ctx.translate(0, (1 - slideIn) * 45);

    // ── Card shadow ───────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur  = 32;
    ctx.fillStyle   = 'rgba(0,0,0,0.01)';
    ctx.beginPath(); ctx.roundRect(cardX + 8, cardY + 12, cardW, cardH, 26); ctx.fill();
    ctx.restore();

    // ── Card body ─────────────────────────────────────────────
    const cg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cg.addColorStop(0, '#0e2244');
    cg.addColorStop(1, '#092415');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 26); ctx.fill();

    // Card border — colour matches step accent
    const bp = 0.5 + 0.5 * Math.sin(t * 0.05);
    ctx.strokeStyle = `rgba(${this._accentRgb(step.accent)},${0.38 + 0.22 * bp})`;
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 26); ctx.stroke();

    // Top gloss
    const gloss = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH * 0.32);
    gloss.addColorStop(0, 'rgba(255,255,255,0.07)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH * 0.32, [26, 26, 0, 0]); ctx.fill();

    // ── Step progress dots ────────────────────────────────────
    const dotY   = cardY + 26;
    const dotGap = 30;
    const dotsX0 = W / 2 - (this.totalSteps * dotGap) / 2 + dotGap / 2;
    for (let i = 0; i < this.totalSteps; i++) {
      const active = i === this.step;
      const done   = i < this.step;
      const dx = dotsX0 + i * dotGap;
      ctx.fillStyle = active ? step.accent : done ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(dx, dotY, active ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      if (done) {
        ctx.font = '8px sans-serif'; ctx.fillStyle = '#0e2244';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✓', dx, dotY);
      }
    }

    // ── Main icon(s) — animated bob ───────────────────────────
    const iconBob   = Math.sin(t * 0.09) * 9;
    const iconScale = 0.88 + 0.12 * Math.sin(t * 0.07);
    const iconSz    = Math.min(cardW * 0.16, 68);
    const iconOffset = step.iconB ? -cardW * 0.13 : 0;

    ctx.save();
    ctx.translate(W / 2 + iconOffset, cardY + 88 + iconBob);
    ctx.scale(iconScale, iconScale);
    ctx.font = `${iconSz}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(step.icon, 0, 0);
    ctx.restore();

    if (step.iconB) {
      const bob2 = Math.sin(t * 0.09 + 1.3) * 7;
      ctx.save();
      ctx.translate(W / 2 + cardW * 0.14, cardY + 88 + bob2);
      ctx.scale(iconScale * 0.78, iconScale * 0.78);
      ctx.font = `${iconSz * 0.82}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(step.iconB, 0, 0);
      ctx.restore();
    }

    // ── Title ─────────────────────────────────────────────────
    const titleSz = Math.min(cardW * 0.060, 25);
    ctx.font = `900 ${titleSz}px "Nunito", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = step.accent; ctx.shadowBlur = 12;
    ctx.fillStyle = step.accent;
    const titleLines = step.title.split('\n');
    const titleTopY  = cardY + 143;
    titleLines.forEach((ln, i) => ctx.fillText(ln, W / 2, titleTopY + i * titleSz * 1.4));
    ctx.shadowBlur = 0;

    // ── Special illustrations ─────────────────────────────────
    const bodyTopY = titleTopY + titleLines.length * titleSz * 1.4 + 10;

    if (step.special === 'dpad') {
      this._drawDpadIllustration(ctx, W / 2, bodyTopY + 4, Math.min(cardW * 0.22, 90), t);
    } else if (step.special === 'tiles') {
      this._drawSampleTiles(ctx, W / 2, bodyTopY + 62, cardW, t);
    }

    // ── Body text ─────────────────────────────────────────────
    const bodyOffX = step.special === 'dpad' ? Math.min(cardW * 0.26, 100) : 0;
    const bodySz   = Math.min(cardW * 0.044, 18);
    ctx.font = `${bodySz}px "Nunito", sans-serif`;
    ctx.fillStyle   = '#C8E6C9';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    step.lines.forEach((ln, i) => {
      if (!ln) return;
      ctx.fillText(ln, W / 2 + bodyOffX, bodyTopY + i * bodySz * 1.55);
    });

    // ── Hint badge ────────────────────────────────────────────
    if (step.hint) {
      const hintY = cardY + cardH - 104;
      const hintW = Math.min(cardW * 0.84, 390);
      const hintX = W / 2 - hintW / 2;
      ctx.fillStyle   = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.roundRect(hintX, hintY, hintW, 38, 10); ctx.fill(); ctx.stroke();
      ctx.font = `italic ${Math.min(bodySz * 0.84, 15)}px "Nunito", sans-serif`;
      ctx.fillStyle   = 'rgba(255,240,180,0.88)';
      ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(step.hint, W / 2, hintY + 19);
    }

    // ── Buttons ───────────────────────────────────────────────
    const btnH   = 46;
    const btnY   = cardY + cardH - btnH - 16;
    const btnGap = 12;
    const isLast = this.step >= this.totalSteps - 1;

    // ← Back (step > 0)
    if (this.step > 0) {
      const prevW = Math.min(cardW * 0.30, 116);
      const prevX = W / 2 - prevW - btnGap;
      ctx.fillStyle   = 'rgba(255,255,255,0.09)';
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(prevX, btnY, prevW, btnH, 12); ctx.fill(); ctx.stroke();
      ctx.font = `bold ${Math.min(cardW * 0.042, 17)}px "Nunito", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('← Back', prevX + prevW / 2, btnY + btnH / 2);
      this._prevBtnRect = { x: prevX, y: btnY, w: prevW, h: btnH };
    } else {
      this._prevBtnRect = null;
    }

    // Next / Let's Go! — locked (dim, "Try it!") on interactive steps
    const locked    = this._nextLocked;
    const nextLabel = locked ? 'Try it! 👆' : isLast ? "Let's Go! 🗡️" : 'Next →';
    const nextW     = Math.min(cardW * (this.step > 0 ? 0.48 : 0.58), 220);
    const nextX     = this.step > 0 ? W / 2 + btnGap : W / 2 - nextW / 2;
    const gp        = 0.3 + 0.2 * Math.sin(t * 0.14);
    ctx.shadowColor = locked ? 'transparent' : step.accent;
    ctx.shadowBlur  = locked ? 0 : 12 + gp * 10;
    const ng = ctx.createLinearGradient(nextX, btnY, nextX, btnY + btnH);
    if (locked) {
      ng.addColorStop(0, 'rgba(110,120,130,0.5)'); ng.addColorStop(1, 'rgba(70,80,90,0.5)');
    } else if (isLast) {
      ng.addColorStop(0, '#FF7043'); ng.addColorStop(1, '#C62828');
    } else {
      ng.addColorStop(0, '#1976D2'); ng.addColorStop(1, '#0D47A1');
    }
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.roundRect(nextX, btnY, nextW, btnH, 13); ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(nextX, btnY, nextW, btnH, 13); ctx.stroke();
    ctx.font = `900 ${Math.min(cardW * 0.048, 20)}px "Nunito", sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(nextLabel, nextX + nextW / 2, btnY + btnH / 2);
    this._nextBtnRect = { x: nextX, y: btnY, w: nextW, h: btnH };

    // Skip link (top-right of card)
    const skipSz = Math.min(cardW * 0.036, 13);
    ctx.font      = `${skipSz}px "Nunito", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    const skipTxt = 'Skip ›';
    const skipX   = cardX + cardW - 16;
    const skipY   = cardY + 12;
    ctx.fillText(skipTxt, skipX, skipY);
    const sm = ctx.measureText(skipTxt);
    this._skipBtnRect = { x: skipX - sm.width, y: skipY - 4, w: sm.width + 8, h: skipSz + 10 };

    ctx.restore(); // slide translate
  }

  // ── D-pad illustration (step 1) ──────────────────────────────
  _drawDpadIllustration(ctx, cx, topY, size, t) {
    const cy = topY + size;
    const s  = size;
    ctx.save();

    // Base circle
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath(); ctx.arc(cx, cy, s * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Cross arms
    ctx.fillStyle = 'rgba(80,200,255,0.6)';
    ctx.strokeStyle = 'rgba(150,230,255,0.8)'; ctx.lineWidth = 1.5;
    const armW = s * 0.35, armH = s * 0.7;
    // Horizontal
    ctx.beginPath(); ctx.roundRect(cx - armH / 2, cy - armW / 2, armH, armW, 6); ctx.fill(); ctx.stroke();
    // Vertical
    ctx.beginPath(); ctx.roundRect(cx - armW / 2, cy - armH / 2, armW, armH, 6); ctx.fill(); ctx.stroke();

    // Animated RIGHT arrow pulse
    const rPulse = 0.6 + 0.4 * Math.sin(t * 0.14);
    ctx.save();
    ctx.globalAlpha = rPulse;
    ctx.fillStyle   = '#FFD700';
    ctx.font        = `${s * 0.55}px serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶', cx + s * 0.52, cy);
    ctx.restore();

    // JUMP button — a real touch target on the interactive step.
    // Pulses invitingly until pressed, then pops with a checkmark.
    const done  = this._actionDone;
    const flash = this._actionFlash;
    const jBob  = done ? -Math.sin(Math.min(flash, 20) * 0.3) * 18 : Math.sin(t * 0.11) * 4;
    const jR    = s * (done ? 0.46 : 0.42 + 0.05 * Math.sin(t * 0.16));
    const jX    = cx + s * 1.55, jY = cy + jBob;
    if (!done) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14 + 8 * Math.sin(t * 0.16); }
    ctx.fillStyle   = done ? 'rgba(102,187,106,0.9)' : 'rgba(255,200,50,0.85)';
    ctx.strokeStyle = done ? 'rgba(180,255,190,0.95)' : 'rgba(255,220,100,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(jX, jY, jR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font      = `bold ${s * 0.28}px "Nunito", sans-serif`;
    ctx.fillStyle = done ? '#fff' : '#0a1e2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(done ? '✓' : 'JUMP', jX, jY);
    // Pointing finger cue while waiting
    if (!done) {
      ctx.font = `${s * 0.5}px serif`;
      ctx.fillText('👆', jX, jY + jR + s * 0.42 + Math.sin(t * 0.14) * 4);
    }
    this._jumpBtnRect = { x: jX - jR - 12, y: jY - jR - 12, w: (jR + 12) * 2, h: (jR + 12) * 2 };

    ctx.restore();
  }

  // ── Sample phoneme tiles illustration (step 4) ───────────────
  _drawSampleTiles(ctx, cx, topY, cardW, t) {
    const tiles   = [
      { text: 'SH', cls: 'blend', ph: 'sh', target: true },
      { text: 'I',  cls: 'vowel', ph: 'i' },
      { text: 'P',  cls: 'cons',  ph: 'p' },
    ];
    this._tileRects = [];
    const tileW   = Math.min(cardW * 0.19, 78);
    const tileH   = Math.min(tileW * 0.68, 52);
    const gap     = 10;
    const totalW  = tiles.length * tileW + (tiles.length - 1) * gap;
    const startX  = cx - totalW / 2;
    const tileY   = topY + 2;
    const colors  = { blend: '#1565C0', vowel: '#2E7D32', cons: '#BF360C' };

    tiles.forEach(({ text, cls, ph, target }, i) => {
      const delay  = i * 16;
      const age    = Math.max(0, t - delay - 8);
      const popIn  = Math.min(1, age / 14);
      if (popIn <= 0) return;
      let bounce = popIn < 0.6 ? (popIn / 0.6) * 1.18 : 1 + (1 - popIn) * 0.18;
      // Target tile invites a tap until pressed
      const waiting = target && !this._actionDone;
      if (waiting) bounce *= 1 + 0.06 * Math.sin(t * 0.15);
      const tx     = startX + i * (tileW + gap) + tileW / 2;
      const ty     = tileY + tileH / 2;
      this._tileRects.push({ x: tx - tileW / 2, y: ty - tileH / 2, w: tileW, h: tileH, ph, target });

      ctx.save();
      ctx.translate(tx, ty); ctx.scale(bounce, bounce);

      // Tile glow — the target tile glows gold while waiting
      ctx.shadowColor = waiting ? '#FFD700' : colors[cls];
      ctx.shadowBlur  = waiting ? 16 + 8 * Math.sin(t * 0.15) : 10;
      ctx.fillStyle   = colors[cls];
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, 9); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      // Tile label
      ctx.font = `900 ${Math.min(tileW * 0.42, 28)}px "Nunito", sans-serif`;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);

      ctx.restore();
    });

    // Pointing finger under the SH tile until it's been tapped
    if (!this._actionDone && this._tileRects.length) {
      const tr = this._tileRects[0];
      ctx.font = `${Math.min(cardW * 0.07, 30)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('👆', tr.x + tr.w / 2, tr.y + tr.h + 8 + Math.sin(t * 0.14) * 4);
    }

    // → SHIP 🚢 result label — the reward for tapping the tile
    if (this._actionDone) {
      const labelAlpha = Math.min(1, this._actionFlash > 0 ? 1 : 1);
      ctx.save();
      ctx.globalAlpha = labelAlpha;
      ctx.font      = `bold ${Math.min(cardW * 0.052, 21)}px "Nunito", sans-serif`;
      ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('→  SHIP  🚢', cx, tileY + tileH + 10);
      ctx.restore();
    }
  }

  // ── Accent colour → CSS rgb components ───────────────────────
  _accentRgb(hex) {
    const map = {
      '#FFD700': '255,200,50',
      '#4FC3F7': '80,195,247',
      '#00E676': '0,230,118',
      '#FF8A65': '255,138,101',
    };
    return map[hex] || '255,200,50';
  }
}
