// ─────────────────────────────────────────────────────────────
// core/ui.js — one look for every canvas menu
//
// The canvas menus were each styled by hand at the point of drawing, and it
// showed: the mode picker was eight saturated pills in eight different
// colours with no hierarchy, and stage select was dark green cards on a dark
// green field where the locked entries were barely readable. Neither matched
// the painted title screen the player had just come from.
//
// These helpers carry the same palette and the same shapes the DOM title
// screen uses — ink ground, lacquer for the one primary action, gold for
// accents, frosted panels over painted art — so a menu is described rather
// than drawn from scratch, and a new one cannot drift.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const THEME = {
    ink:       '#101B25',
    rice:      '#F7F1E4',
    gold:      '#F2C14E',
    goldDim:   'rgba(242,193,78,0.45)',
    lacquer:   '#C8342B',
    lacquerDk: '#8E1F19',
    panel:     'rgba(13,26,36,0.90)',
    panelHot:  'rgba(35,60,65,0.96)',
    stroke:    'rgba(255,232,198,0.22)',
    muted:     '#B7C9CC',
    locked:    '#99ADB4',
    font:      '"Nunito", "Comic Sans MS", system-ui, sans-serif',
  };

  /**
   * Paint a background image across the canvas with a scrim over it, cached
   * so the scale and the scrim are paid for once per size rather than per
   * frame.
   *
   * `holder` is any object to hang the cache on (usually the screen itself).
   */
  function scene(ctx, img, W, H, holder, key = 'default', strength = 1) {
    const cacheKey = `${key}@${W}x${H}@${strength}@${!!(img && img.complete && img.naturalWidth)}`;
    if (!holder._uiScene || holder._uiSceneKey !== cacheKey) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, W); c.height = Math.max(1, H);
      const g = c.getContext('2d');
      if (img && img.complete && img.naturalWidth > 0) {
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        g.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2,
                    img.naturalWidth * s, img.naturalHeight * s);
      } else {
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#241A2E'); grad.addColorStop(1, '#0E0A14');
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
      }
      // Sink the middle so type reads, and darken the foot so controls sit on
      // something solid.
      const k = strength;
      const scrim = g.createLinearGradient(0, 0, 0, H);
      scrim.addColorStop(0, `rgba(12,7,16,${0.58 * k})`);
      scrim.addColorStop(0.45, `rgba(12,7,16,${0.44 * k})`);
      scrim.addColorStop(1, `rgba(8,5,12,${0.78 * k})`);
      g.fillStyle = scrim;
      g.fillRect(0, 0, W, H);
      holder._uiScene = c;
      holder._uiSceneKey = cacheKey;
    }
    ctx.drawImage(holder._uiScene, 0, 0);
  }

  /** Screen title with a gold rule beneath it. */
  function heading(ctx, text, W, y, opts = {}) {
    const size = opts.size || Math.min(24, W * 0.052);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `900 ${size}px ${THEME.font}`;
    ctx.fillStyle = THEME.rice;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, W / 2, y);
    ctx.shadowBlur = 0;

    const tw = Math.min(W * 0.7, ctx.measureText(text).width + 60);
    const ry = y + size + 8;
    const grad = ctx.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0);
    grad.addColorStop(0, 'rgba(242,193,78,0)');
    grad.addColorStop(0.5, THEME.gold);
    grad.addColorStop(1, 'rgba(242,193,78,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(W / 2 - tw / 2, ry, tw, 2);
    ctx.restore();
    return ry + 10;
  }

  /** Small rounded chip — currency, counts, status. */
  function chip(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.font = `800 ${opts.size || 13}px ${THEME.font}`;
    const w = ctx.measureText(text).width + 24;
    const h = opts.h || 26;
    const left = opts.align === 'right' ? x - w : x;
    ctx.fillStyle = THEME.panel;
    ctx.strokeStyle = THEME.goldDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(left, y, w, h, h / 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = opts.color || THEME.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, y + h / 2 + 0.5);
    ctx.restore();
    return { x: left, y, w, h };
  }

  /**
   * A menu card.
   *
   * `primary` marks the one action the screen is really for — it gets the
   * lacquer fill. Everything else is a neutral frosted panel, which is what
   * stops a menu turning back into a row of competing colours.
   */
  function card(ctx, r, opts = {}) {
    const { label, sub, primary = false, locked = false, selected = false,
            accent = THEME.gold, badge = null, pulse = 0 } = opts;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, opts.radius || 14);

    if (primary) {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, '#D8433A');
      g.addColorStop(1, THEME.lacquerDk);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = locked ? 'rgba(16,11,15,0.55)'
                    : selected ? THEME.panelHot : THEME.panel;
    }
    ctx.fill();

    ctx.strokeStyle = selected ? THEME.gold
                    : primary ? 'rgba(255,226,168,0.55)'
                    : locked ? 'rgba(255,255,255,0.10)' : THEME.stroke;
    ctx.lineWidth = selected || primary ? 2.5 : 1;
    ctx.stroke();

    if (pulse > 0 && !locked) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.25 + 0.35 * pulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, (opts.radius || 14) + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const padX = 16;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const hasSub = !!sub;
    ctx.font = `900 ${opts.labelSize || 16}px ${THEME.font}`;
    ctx.fillStyle = locked ? THEME.locked : primary ? '#FFF8E9' : THEME.rice;
    ctx.fillText(label, r.x + padX, r.y + r.h / 2 - (hasSub ? 9 : 0));

    if (hasSub) {
      ctx.font = `700 ${opts.subSize || 11.5}px ${THEME.font}`;
      ctx.fillStyle = locked ? THEME.locked
                    : primary ? 'rgba(255,248,233,0.82)' : THEME.muted;
      ctx.fillText(sub, r.x + padX, r.y + r.h / 2 + 10);
    }

    if (badge) {
      ctx.textAlign = 'right';
      ctx.font = `800 12px ${THEME.font}`;
      ctx.fillStyle = locked ? THEME.locked : accent;
      ctx.fillText(badge, r.x + r.w - padX, r.y + r.h / 2);
    }

    // Chevron marks the card as something you can go into.
    if (!locked && opts.chevron !== false) {
      ctx.strokeStyle = primary ? 'rgba(255,248,233,0.8)' : THEME.goldDim;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      const cx = r.x + r.w - (badge ? 34 : 16), cy = r.y + r.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 5); ctx.lineTo(cx + 1, cy); ctx.lineTo(cx - 4, cy + 5);
      ctx.stroke();
    }
    ctx.restore();
    return r;
  }

  /** Quiet text button, for "back" and similar. */
  function ghost(ctx, text, cx, y, opts = {}) {
    ctx.save();
    ctx.font = `800 ${opts.size || 13}px ${THEME.font}`;
    const w = ctx.measureText(text).width + 34;
    const h = 28;
    const r = { x: cx - w / 2, y, w, h };
    ctx.fillStyle = 'rgba(10,6,12,0.5)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + h / 2 + 0.5);
    ctx.restore();
    return r;
  }

  /** Ellipsise canvas copy instead of shrinking letters into illegibility. */
  function text(ctx, value, x, y, width, size = 14, color = THEME.rice, align = 'left') {
    ctx.save(); ctx.font = `800 ${size}px ${THEME.font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    let label = String(value);
    if (ctx.measureText(label).width > width) {
      while (label.length && ctx.measureText(label + '…').width > width) label = label.slice(0, -1);
      label += '…';
    }
    ctx.fillText(label, x, y); ctx.restore();
  }

  function wrapText(ctx, value, x, y, width, size = 14, color = THEME.rice) {
    ctx.save(); ctx.font = `800 ${size}px ${THEME.font}`;
    const words = String(value).split(' '); let line = '', row = 0;
    while (words.length) {
      const next = words[0];
      if (line && ctx.measureText(line + ' ' + next).width > width) {
        text(ctx, line, x, y + row * (size + 4), width, size, color); row++;
        if (row === 1) { text(ctx, words.join(' '), x, y + row * (size + 4), width, size, color); break; }
        line = '';
      } else { line += (line ? ' ' : '') + words.shift(); }
    }
    if (!words.length && line) text(ctx, line, x, y + row * (size + 4), width, size, color);
    ctx.restore();
  }

  function panel(ctx, r, fill = THEME.panel, stroke = THEME.stroke) {
    ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function portrait(ctx, img, x, y, w, h) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    ctx.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  }

  const motionQuery = root.matchMedia?.('(prefers-reduced-motion: reduce)');

  /** Sparse, world-specific atmosphere; quality and reduced-motion aware. */
  function atmosphere(ctx, stage, W, H, age) {
    if (root.LOW_FX || motionQuery?.matches) return;
    const colors = ['#FFE5A0', '#BFE7A7', '#FFC6DC', '#F4D297', '#D2EFFF', '#FFBC72'];
    const world = stage.world || 1;
    ctx.save(); ctx.fillStyle = colors[world - 1] || colors[0];
    for (let i = 0; i < 12; i++) {
      const x = ((i * 137 + age * (world === 5 ? 0.35 : 0.16)) % (W + 20)) - 10;
      const y = ((i * 71 + age * (world === 6 ? -0.24 : 0.19)) % (H * 0.74) + H * 0.74) % (H * 0.74);
      ctx.globalAlpha = 0.22 + Math.sin(age * 0.016 + i) * 0.12;
      ctx.beginPath(); ctx.ellipse(x, y, world === 3 ? 4 : 2, world === 3 ? 2 : 1.5, i + age * 0.006, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const api = { THEME, scene, heading, chip, card, ghost, text, wrapText, panel, portrait, atmosphere };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UI = api;
})(typeof window !== 'undefined' ? window : globalThis);
