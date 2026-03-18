'use strict';
// ============================================================
// ENGAGEMENT ENGINE — js/engagementEngine.js
//
// "The most addictive products give people a reason to come
//  back EVERY SINGLE DAY — and they make them feel great
//  about it every time they do."  — inspired by MZ
//
// Systems:
//   1. XP + Level progression  — visible on home, always growing
//   2. Lucky Rice Jar           — daily variable-ratio reward (most addictive loop)
//   3. 7-Day Login Calendar     — escalating daily rewards, reset on miss
//   4. Live Countdown Timer     — FOMO: daily challenge resets in X:XX:XX
//   5. Streak Shield            — spend rice to save a streak (loss aversion)
//   6. Welcome-Back Bonus       — reward returning players, never shame them
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

// Jar spin reward range (random, exclusive)
const JAR_MIN = 8;
const JAR_MAX = 60;

// Shield cost in rice grains
const SHIELD_COST = 75;

// ─────────────────────────────────────────────────────────────
class EngagementEngine {
  constructor(tracker) {
    this._t   = tracker;
    this._key = 'samurice_engage_v2';
    this._load();
    this._checkWelcomeBack();
    this._startCountdown();
    this._countdownInterval = null;
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
      lastJarDate:      null,  // date-string of last jar spin
      jarSpunToday:     false,
      welcomeBonusPaid: null,  // date-string when paid
      shieldActive:     false, // true = streak is frozen today
      shieldUsedDate:   null,
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
    for (let i = 1; i <= 6; i++) {
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

  // ── Lucky Jar ────────────────────────────────────────────
  canSpinJar() {
    return this._d.lastJarDate !== this._today();
  }

  spinJar() {
    if (!this.canSpinJar()) return 0;
    const amount = JAR_MIN + Math.floor(Math.random() * (JAR_MAX - JAR_MIN + 1));
    this._t.addRiceGrains(amount);
    this._d.lastJarDate = this._today();
    this._save();
    return amount;
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

  // ── Streak Shield ────────────────────────────────────────
  canUseShield() {
    const streak = this._t.getLoginStreak();
    const notUsedToday = this._d.shieldUsedDate !== this._today();
    const hasRice = this._t.getRiceGrains() >= SHIELD_COST;
    return streak >= 3 && notUsedToday && hasRice;
  }

  useShield() {
    if (!this.canUseShield()) return false;
    const spent = this._t.spendRiceGrains(SHIELD_COST);
    if (!spent) return false;
    this._d.shieldUsedDate = this._today();
    this._d.shieldActive   = true;
    this._save();
    return true;
  }

  shieldActiveToday() {
    return this._d.shieldUsedDate === this._today();
  }

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

  // ── Countdown to daily reset ─────────────────────────────
  _msUntilMidnight() {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return next - now;
  }

  _formatCountdown(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  _startCountdown() {
    const tick = () => {
      const el = document.getElementById('mc-countdown');
      if (el) el.textContent = '⏱ ' + this._formatCountdown(this._msUntilMidnight()) + ' left';
    };
    tick();
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this._countdownInterval = setInterval(tick, 1000);
  }

  // ── Home screen render ────────────────────────────────────
  renderHomeUI() {
    this._renderXPBar();
    this._renderCalendar();
    this._renderJarBtn();
    this._renderShield();
    this._renderWelcomeBack();
    this._startCountdown();
  }

  _renderXPBar() {
    const { level, pct, xpInLevel, xpForLevel } = this.getLevelInfo();
    const levelEl = document.getElementById('mc-xp-level');
    const fillEl  = document.getElementById('mc-xp-fill');
    const nextEl  = document.getElementById('mc-xp-next');
    if (levelEl) levelEl.textContent = `Lv.${level}`;
    if (fillEl)  { fillEl.style.width = '0%'; setTimeout(() => { fillEl.style.width = pct + '%'; }, 80); }
    if (nextEl)  nextEl.textContent = `${xpInLevel}/${xpForLevel} XP`;
  }

  _renderCalendar() {
    const container = document.getElementById('mc-calendar');
    if (!container) return;
    const days = this.getCalendarDays();
    const streak = this._t.getLoginStreak();
    container.innerHTML = '';

    days.forEach((day, i) => {
      const tile = document.createElement('div');
      tile.className = 'cal-tile cal-' + day.status;
      tile.innerHTML = `
        <span class="cal-day">${['M','T','W','T','F','S','S'][i]}</span>
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

  _renderJarBtn() {
    const btn   = document.getElementById('mc-jar-btn');
    const label = document.getElementById('mc-jar-label');
    if (!btn) return;
    if (this.canSpinJar()) {
      btn.textContent = '🫙';
      btn.classList.add('jar-ready');
      btn.classList.remove('jar-spent');
      if (label) label.textContent = 'Lucky Jar!';
      btn.onclick = () => this._onSpinJar(btn, label);
    } else {
      btn.textContent = '🫙';
      btn.classList.remove('jar-ready');
      btn.classList.add('jar-spent');
      if (label) label.textContent = 'Come back tomorrow!';
      btn.onclick = null;
    }
  }

  _onSpinJar(btn, label) {
    if (!this.canSpinJar()) return;
    btn.classList.add('jar-spin');
    setTimeout(() => {
      const amount = this.spinJar();
      btn.classList.remove('jar-spin');
      btn.classList.remove('jar-ready');
      btn.classList.add('jar-spent');
      // Reward burst
      const burst = document.createElement('div');
      burst.className = 'jar-burst';
      burst.textContent = `+${amount} 🌾`;
      btn.parentElement.appendChild(burst);
      setTimeout(() => burst.remove(), 1400);
      if (label) label.textContent = `+${amount} rice! Come back tomorrow!`;
      // Refresh rice counter
      const riceEl = document.getElementById('mc-rice-counter');
      if (riceEl) riceEl.textContent = `🌾 ${this._t.getRiceGrains()} rice grains`;
      btn.onclick = null;
    }, 800);
  }

  _renderShield() {
    const shieldWrap = document.getElementById('mc-shield-wrap');
    if (!shieldWrap) return;
    const streak = this._t.getLoginStreak();
    if (streak < 3) { shieldWrap.style.display = 'none'; return; }
    shieldWrap.style.display = 'flex';

    const btn = document.getElementById('mc-shield-btn');
    if (!btn) return;
    if (this.shieldActiveToday()) {
      btn.textContent    = '🛡️ Streak Shielded!';
      btn.disabled       = true;
      btn.classList.add('shield-active');
    } else if (this.canUseShield()) {
      btn.textContent    = `🛡️ Shield Streak (🌾${SHIELD_COST})`;
      btn.disabled       = false;
      btn.classList.remove('shield-active');
      btn.onclick        = () => this._onShield(btn);
    } else {
      btn.textContent    = `🛡️ Need 🌾${SHIELD_COST} to shield`;
      btn.disabled       = true;
    }
  }

  _onShield(btn) {
    if (!this.useShield()) return;
    btn.textContent = '🛡️ Streak Shielded!';
    btn.disabled    = true;
    btn.classList.add('shield-active');
    // Particle burst
    const wrap = document.getElementById('mc-shield-wrap');
    if (wrap) {
      const burst = document.createElement('div');
      burst.className = 'shield-burst';
      burst.textContent = '🛡️ Protected!';
      wrap.appendChild(burst);
      setTimeout(() => burst.remove(), 1200);
    }
    const riceEl = document.getElementById('mc-rice-counter');
    if (riceEl) riceEl.textContent = `🌾 ${this._t.getRiceGrains()} rice grains`;
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
