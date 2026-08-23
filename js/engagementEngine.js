'use strict';
// ============================================================
// ENGAGEMENT ENGINE — js/engagementEngine.js
//
// This file used to open with a quote about making people come back every
// single day, and a numbered list that named its own methods honestly:
// a "variable-ratio reward (most addictive loop)", a "Live Countdown Timer
// — FOMO", and a "Streak Shield — spend rice to save a streak (loss
// aversion)". Those are the mechanics of a slot machine, a sale timer and
// an insurance policy, and they were pointed at five-year-olds.
//
// They are gone. What replaced each one, and why:
//
//   Lucky Jar → Daily Gift.  A random 8-60 rice payout on a fixed daily
//     schedule is a variable-ratio reward: the uncertainty is the point,
//     and uncertainty is what makes the schedule hard to stop. The gift is
//     now a known, fixed amount, stated before it is tapped. Coming back
//     is still rewarded; the reward is no longer a pull of the lever.
//
//   Countdown → next-review line.  A clock ticking down to midnight tells
//     a child something is about to be taken away. Nothing here expires at
//     midnight any more, so there is nothing to count down; the panel says
//     what is ready to practise instead.
//
//   Streak Shield → free grace.  Selling protection against a loss only
//     works if the child is afraid of the loss — the item had no value
//     except the anxiety it relieved. A missed day is now forgiven
//     automatically, for nothing, with no button to find and no currency
//     to spend. See `_checkLoginStreak` in progressTracker.
//
// What stayed, because it rewards returning without punishing absence:
// XP and levels, the 7-day calendar, and the welcome-back bonus.
//
// The actual reason to come back is in js/learn/review.js: the words the
// child nearly knew are due, and they are the ones worth doing. A return
// loop built on the material beats one built on a prize, and it is the
// only one that survives the child getting good at reading.
// ============================================================

// ── XP level thresholds (cumulative XP to REACH that level) ──
// Level 1 = 0 XP. Each level needs progressively more.
const XP_LEVELS = (function () {
  const t = [0]; // t[n] = total XP needed to be level n
  for (let n = 1; n <= 99; n++) t.push(t[n - 1] + Math.floor(80 * Math.pow(1.22, n - 1)));
  return t;
}());

// Day-of-streak reward amounts (index = streak day - 1, clamped at 6)
const DAY_REWARDS = [30, 55, 80, 120, 170, 230, 350];

// The daily gift. One number, known in advance, the same every day — the
// whole point is that there is nothing to find out by tapping it.
const DAILY_GIFT = 30;

// ─────────────────────────────────────────────────────────────
class EngagementEngine {
  constructor(tracker) {
    this._t   = tracker;
    this._key = 'samurice_engage_v2';
    this._load();
    this._checkWelcomeBack();
  }

  // ── Persistence ──────────────────────────────────────────
  _load() {
    try {
      const raw = localStorage.getItem(this._key);
      this._d = raw ? JSON.parse(raw) : this._fresh();
    } catch { this._d = this._fresh(); }
  }
  _save() {
    try { localStorage.setItem(this._key, JSON.stringify(this._d)); } catch {}
  }
  _fresh() {
    return {
      lastJarDate:      null,  // date-string the daily gift was last claimed
      welcomeBonusPaid: null,  // date-string when paid
    };
  }

  // ── Date helpers ─────────────────────────────────────────
  _today()     { return new Date().toISOString().slice(0, 10); }
  _yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
  _daysSince(dateStr) {
    if (!dateStr) return 999;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }

  // ── XP System ────────────────────────────────────────────
  computeXP() {
    const t = this._t;
    let xp = 0;
    xp += t.getTotalWordsBlended()      * 15;
    xp += t.getEndlessBestDist()         * 1;
    xp += (t.getBestCombo()              * 8);
    xp += (t.data?.achievements?.length || 0) * 75;
    const _stageTotal = (typeof PHONICS_DATA !== 'undefined' && PHONICS_DATA.stageCount) || 6;
    for (let i = 1; i <= _stageTotal; i++) {
      const s = t.getStage(i);
      if (s.completedAt)  xp += 200;
      xp += (s.stars || 0) * 60;
      if (s.mastery?.noHit)     xp += 100;
      if (s.mastery?.speedClear) xp += 100;
    }
    return Math.floor(xp);
  }

  getLevelInfo() {
    const totalXP = this.computeXP();
    let level = 1;
    for (let n = 1; n < XP_LEVELS.length; n++) {
      if (totalXP >= XP_LEVELS[n]) level = n + 1;
      else break;
    }
    level = Math.min(level, 99);
    const xpFloor = XP_LEVELS[level - 1] || 0;
    const xpCeil  = XP_LEVELS[level]     || XP_LEVELS[XP_LEVELS.length - 1];
    const xpInLevel = totalXP - xpFloor;
    const xpForLevel = xpCeil - xpFloor;
    const pct = xpForLevel > 0 ? Math.min(100, Math.round((xpInLevel / xpForLevel) * 100)) : 100;
    return { level, totalXP, xpInLevel, xpForLevel, pct };
  }

  // ── Daily gift ───────────────────────────────────────────
  giftAmount() { return DAILY_GIFT; }

  canClaimGift() {
    return this._d.lastJarDate !== this._today();
  }

  claimGift() {
    if (!this.canClaimGift()) return 0;
    this._t.addRiceGrains(DAILY_GIFT);
    this._d.lastJarDate = this._today();
    this._save();
    return DAILY_GIFT;
  }

  // ── 7-Day Login Calendar ─────────────────────────────────
  getCalendarDays() {
    const streak  = this._t.getLoginStreak();
    const claimed = !this._t.canClaimLoginReward();  // true = already claimed today
    const days    = [];
    for (let i = 0; i < 7; i++) {
      const dayNum  = i + 1;
      const reward  = DAY_REWARDS[i];
      let   status;
      if (i < streak - 1)        status = 'done';          // past streak days
      else if (i === streak - 1) status = claimed ? 'claimed' : 'available';
      else                       status = 'locked';
      days.push({ dayNum, reward, status });
    }
    return days;
  }

  claimDayReward() {
    if (!this._t.canClaimLoginReward()) return 0;
    return this._t.claimLoginReward();
  }

  // ── Streak grace ─────────────────────────────────────────
  // There is no shield to buy any more; a missed day is forgiven for free
  // in progressTracker._checkLoginStreak. This reports the rule so the
  // panel can state it plainly rather than leaving a child to discover it
  // by losing something.
  graceNote() { return 'Miss a day and your streak keeps going.'; }

  // ── Welcome-Back Bonus ───────────────────────────────────
  _checkWelcomeBack() {
    const lastLogin = this._t.data?.lastLoginDate;
    if (!lastLogin) return;
    const days = this._daysSince(lastLogin);
    // If away for 2-14 days, give a bonus (not if they just played yesterday)
    if (days >= 2 && days <= 14 && this._d.welcomeBonusPaid !== this._today()) {
      const bonus = Math.min(50 + days * 15, 200);
      this._t.addRiceGrains(bonus);
      this._d.welcomeBonusPaid = this._today();
      this._d.pendingWelcome   = { days, bonus };
      this._save();
    }
  }

  getPendingWelcome() {
    const w = this._d.pendingWelcome;
    if (!w) return null;
    delete this._d.pendingWelcome;
    this._save();
    return w;
  }

  // ── What is waiting ──────────────────────────────────────
  // Where the countdown used to be. It says what there is to do, not how
  // long until something is taken away — and it does not tick, so there is
  // no clock on screen for a child to watch.
  _renderNextUp() {
    const el = document.getElementById('mc-countdown');
    if (!el) return;
    const ladder = window.Review?.shared?.();
    if (!ladder) { el.textContent = ''; return; }
    const due = ladder.todaysQueue().length;
    el.textContent = due
      ? `📖 ${due} word${due === 1 ? '' : 's'} ready to practise`
      : '✅ All caught up — new words tomorrow';
  }

  // ── Home screen render ────────────────────────────────────
  renderHomeUI() {
    this._renderXPBar();
    this._renderCalendar();
    this._renderGiftBtn();
    this._renderGrace();
    this._renderWelcomeBack();
    this._renderNextUp();
  }

  _renderXPBar() {
    const { level, pct, xpInLevel, xpForLevel } = this.getLevelInfo();
    const levelEl = document.getElementById('mc-xp-level');
    const fillEl  = document.getElementById('mc-xp-fill');
    const nextEl  = document.getElementById('mc-xp-next');
    const badgeEl = document.getElementById('mc-level-badge');
    if (levelEl) levelEl.textContent = `Lv.${level}`;
    if (badgeEl) badgeEl.textContent = `Lv.${level}`;
    if (fillEl)  { fillEl.style.width = '0%'; setTimeout(() => { fillEl.style.width = pct + '%'; }, 80); }
    if (nextEl)  nextEl.textContent = `${xpInLevel}/${xpForLevel} XP`;
  }

  // Whether there are uncollected daily rewards (drives notification dot)
  hasUncollectedRewards() {
    return this.canClaimGift() || (this._t.canClaimLoginReward?.() ?? false);
  }

  _renderCalendar() {
    const container = document.getElementById('mc-calendar');
    if (!container) return;
    const days = this.getCalendarDays();
    const streak = this._t.getLoginStreak();
    container.innerHTML = '';

    // Real weekday initials: slot (streakPos) is today, earlier slots
    // are the actual previous days — no more "day 1 is always Monday".
    const DOW = ['S','M','T','W','T','F','S'];
    const streakPos = Math.max(0, ((streak - 1) % 7));
    const todayDow = new Date().getDay();
    days.forEach((day, i) => {
      const tile = document.createElement('div');
      tile.className = 'cal-tile cal-' + day.status;
      const dowLabel = DOW[(todayDow - streakPos + i + 70) % 7];
      tile.innerHTML = `
        <span class="cal-day">${dowLabel}</span>
        <span class="cal-reward">${day.status === 'done' ? '✅' : day.status === 'claimed' ? '🌟' : day.status === 'available' ? `🌾${day.reward}` : `🔒`}</span>
      `;
      if (day.status === 'available') {
        tile.title = `Click to claim ${day.reward} rice grains!`;
        tile.style.cursor = 'pointer';
        tile.addEventListener('click', () => this._onClaimDay(tile, day));
      }
      container.appendChild(tile);
    });

    // Streak label
    const label = document.createElement('div');
    label.className = 'cal-streak-label';
    label.textContent = streak >= 7 ? '🏆 7-Day Legend!' : `${streak}/7 day streak`;
    container.appendChild(label);
  }

  _onClaimDay(tile, day) {
    const earned = this.claimDayReward();
    if (earned <= 0) return;
    tile.classList.remove('cal-available');
    tile.classList.add('cal-claimed');
    tile.querySelector('.cal-reward').textContent = '🌟';

    // Burst animation
    const burst = document.createElement('div');
    burst.className = 'cal-burst';
    burst.textContent = `+${earned} 🌾`;
    tile.appendChild(burst);
    setTimeout(() => burst.remove(), 1200);

    // Refresh rice counter
    const riceEl = document.getElementById('mc-rice-counter');
    if (riceEl) riceEl.textContent = `🌾 ${this._t.getRiceGrains()} rice grains`;
  }

  _renderGiftBtn() {
    const btn   = document.getElementById('mc-jar-btn');
    const label = document.getElementById('mc-jar-label');
    if (!btn) return;
    btn.textContent = '🎁';
    if (this.canClaimGift()) {
      btn.classList.add('jar-ready');
      btn.classList.remove('jar-spent');
      // The amount is on the label before the tap. A gift you already know
      // the size of cannot condition anybody.
      if (label) label.textContent = `Daily gift: 🌾${DAILY_GIFT}`;
      btn.onclick = () => this._onClaimGift(btn, label);
    } else {
      btn.classList.remove('jar-ready');
      btn.classList.add('jar-spent');
      if (label) label.textContent = 'Gift collected';
      btn.onclick = null;
    }
  }

  _onClaimGift(btn, label) {
    if (!this.canClaimGift()) return;
    const amount = this.claimGift();
    btn.classList.remove('jar-ready');
    btn.classList.add('jar-spent');
    const burst = document.createElement('div');
    burst.className = 'jar-burst';
    burst.textContent = `+${amount} 🌾`;
    btn.parentElement.appendChild(burst);
    setTimeout(() => burst.remove(), 1400);
    if (label) label.textContent = 'Gift collected';
    const riceEl = document.getElementById('mc-rice-counter');
    if (riceEl) riceEl.textContent = `🌾 ${this._t.getRiceGrains()} rice grains`;
    btn.onclick = null;
  }

  /**
   * States the grace rule instead of selling insurance against it. A child
   * should learn that missing a day is fine by reading it, not by missing a
   * day and finding out what it cost.
   */
  _renderGrace() {
    const wrap = document.getElementById('mc-shield-wrap');
    if (!wrap) return;
    const streak = this._t.getLoginStreak();
    if (streak < 2) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.textContent = `🛡️ ${this.graceNote()}`;
  }

  _renderWelcomeBack() {
    const w = this.getPendingWelcome();
    if (!w) return;
    const banner = document.getElementById('mc-welcome-back');
    if (!banner) return;
    banner.textContent = `🎉 Welcome back! ${w.days}d away → +${w.bonus} bonus rice!`;
    banner.style.display = 'block';
    banner.classList.add('welcome-pulse');
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
    // Refresh rice counter
    const riceEl = document.getElementById('mc-rice-counter');
    if (riceEl) riceEl.textContent = `🌾 ${this._t.getRiceGrains()} rice grains`;
  }

  // ── Called when returning to home screen ─────────────────
  refresh() {
    this.renderHomeUI();
    // Update parent dashboard streak chip too
    if (window._parentDashboard) window._parentDashboard._renderHomeStreak();
  }
}

// ── Module init ──────────────────────────────────────────────
function initEngagementEngine() {
  const tryInit = () => {
    const t = window._progressTracker;
    if (!t) { setTimeout(tryInit, 150); return; }
    window._engagementEngine = new EngagementEngine(t);
    window._engagementEngine.renderHomeUI();
  };
  tryInit();
}
