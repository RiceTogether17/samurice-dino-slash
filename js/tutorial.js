'use strict';
// PHASE 6: NEW FILE — js/tutorial.js
// 5-step canvas-drawn onboarding tutorial.
// Shown once before Stage 1 on first play; fully skippable.
// Integrates with SlashGame 'onboarding' state machine.
// Why: replaces the minimal 4-hint runner strip with a proper
//      pre-game walkthrough that teaches all core mechanics.

class Tutorial {
  constructor(W, H, onComplete) {
    this.W          = W;
    this.H          = H;
    this.onComplete = onComplete;
    this.step       = 0;
    this.stepAge    = 0;   // frames since current step started
    this._age       = 0;   // total frames alive
    this._nextBtnRect = null;
    this._skipBtnRect = null;
    this._prevBtnRect = null;

    this.steps = [
      {
        icon: '🦖', iconB: '⚔️',
        accent: '#FFD700',
        title: 'Welcome to\nSamurice Dino Slash!',
        lines: [
          'Riku the Samurai Rice Boy battles dinosaurs',
          'using the power of PHONICS!',
          '',
          'Read words → Blend tiles → Slash dinos! 🗡️',
        ],
        hint: null,
        special: null,
      },
      {
        icon: '🕹️', iconB: null,
        accent: '#4FC3F7',
        title: 'Move & Jump',
        lines: [
          'Tap ▶ RIGHT on the D-pad to run faster.',
          'Tap JUMP or swipe UP to leap!',
          '',
          'Avoid spikes, gaps and pterodactyls.',
        ],
        hint: '📱 Swipe anywhere on the canvas to jump',
        special: 'dpad',
      },
      {
        icon: '🍚', iconB: null,
        accent: '#FFD700',
        title: 'Collect Rice Grains',
        lines: [
          'Grab glowing golden rice grains as you run.',
          "Each grain boosts Riku's battle HP!",
          '',
          'More grains collected = harder hits on the boss.',
        ],
        hint: '✨ Collect all phoneme pieces for a mega bonus',
        special: null,
      },
      {
        icon: '⛩️', iconB: '⚔️',
        accent: '#00E676',
        title: 'DinoGate = Word Battle!',
        lines: [
          'When you hit a green DinoGate, a dino',
          'blocks your path — a word challenge begins!',
          '',
          'Defeat the word to pass through.',
        ],
        hint: 'Look for the ⚔️ BLEND! sign glowing above gates',
        special: null,
      },
      {
        icon: '🔤', iconB: null,
        accent: '#FF8A65',
        title: 'Blend the Word!',
        lines: [
          'Tap phoneme tiles IN ORDER to build the word.',
          '',
          '',   // tiles drawn here
          '',
          'Correct blend = big slash damage on the dino!',
        ],
        hint: '⌨️ Keyboard players: just type the letters!',
        special: 'tiles',
      },
    ];
  }

  get totalSteps() { return this.steps.length; }
  get isDone()     { return this.step >= this.totalSteps; }

  next() {
    this.step++;
    this.stepAge = 0;
    if (this.isDone && this.onComplete) this.onComplete();
  }

  prev() {
    if (this.step > 0) { this.step--; this.stepAge = 0; }
  }

  skip() {
    this.step = this.totalSteps;
    if (this.onComplete) this.onComplete();
  }

  handleClick(mx, my) {
    if (this.isDone) return false;
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
      this._drawSampleTiles(ctx, W / 2, bodyTopY + 8, cardW, t);
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

    // Next / Let's Go!
    const nextLabel = isLast ? "Let's Go! 🗡️" : 'Next →';
    const nextW     = Math.min(cardW * (this.step > 0 ? 0.48 : 0.58), 220);
    const nextX     = this.step > 0 ? W / 2 + btnGap : W / 2 - nextW / 2;
    const gp        = 0.3 + 0.2 * Math.sin(t * 0.14);
    ctx.shadowColor = step.accent; ctx.shadowBlur = 12 + gp * 10;
    const ng = ctx.createLinearGradient(nextX, btnY, nextX, btnY + btnH);
    if (isLast) {
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

    // JUMP button
    const jBob = Math.sin(t * 0.11) * 4;
    ctx.fillStyle   = 'rgba(255,200,50,0.75)';
    ctx.strokeStyle = 'rgba(255,220,100,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx + s * 1.55, cy + jBob, s * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font      = `bold ${s * 0.28}px "Nunito", sans-serif`;
    ctx.fillStyle = '#0a1e2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('JUMP', cx + s * 1.55, cy + jBob);

    ctx.restore();
  }

  // ── Sample phoneme tiles illustration (step 4) ───────────────
  _drawSampleTiles(ctx, cx, topY, cardW, t) {
    const tiles   = [{ text: 'SH', cls: 'blend' }, { text: 'I', cls: 'vowel' }, { text: 'P', cls: 'cons' }];
    const tileW   = Math.min(cardW * 0.19, 78);
    const tileH   = Math.min(tileW * 0.68, 52);
    const gap     = 10;
    const totalW  = tiles.length * tileW + (tiles.length - 1) * gap;
    const startX  = cx - totalW / 2;
    const tileY   = topY + 2;
    const colors  = { blend: '#1565C0', vowel: '#2E7D32', cons: '#BF360C' };

    tiles.forEach(({ text, cls }, i) => {
      const delay  = i * 16;
      const age    = Math.max(0, t - delay - 8);
      const popIn  = Math.min(1, age / 14);
      if (popIn <= 0) return;
      const bounce = popIn < 0.6 ? (popIn / 0.6) * 1.18 : 1 + (1 - popIn) * 0.18;
      const tx     = startX + i * (tileW + gap) + tileW / 2;
      const ty     = tileY + tileH / 2;

      ctx.save();
      ctx.translate(tx, ty); ctx.scale(bounce, bounce);

      // Tile glow
      ctx.shadowColor = colors[cls]; ctx.shadowBlur = 10;
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

    // → SHIP 🚢 result label
    if (t > 55) {
      const labelAlpha = Math.min(1, (t - 55) / 18);
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
