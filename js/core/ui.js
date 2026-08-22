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
    ink:       '#17110D',
    rice:      '#F7F1E4',
    gold:      '#F2C14E',
    goldDim:   'rgba(242,193,78,0.45)',
    lacquer:   '#C8342B',
    lacquerDk: '#8E1F19',
    panel:     'rgba(20,13,18,0.76)',
    panelHot:  'rgba(48,26,34,0.86)',
    stroke:    'rgba(255,232,198,0.22)',
    muted:     'rgba(247,241,228,0.62)',
    locked:    'rgba(247,241,228,0.34)',
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
    const cacheKey = `${key}@${W}x${H}@${strength}`;
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

  const api = { THEME, scene, heading, chip, card, ghost };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UI = api;
})(typeof window !== 'undefined' ? window : globalThis);
