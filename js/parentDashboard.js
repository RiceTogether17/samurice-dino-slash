'use strict';
// ============================================================
// PARENT DASHBOARD — js/parentDashboard.js
//
// "Every product needs a social layer. Parents are the real
//  power users — give them data, give them sharing, give them
//  reasons to bring their kids back every day."
//                                        — inspired by MZ
//
// Features:
//  • Stage-by-stage progress with star ratings & accuracy bars
//  • Phoneme mastery heatmap (green=strong, yellow=fair, red=weak)
//  • Key stats: words blended, combos, daily streak, rice grains
//  • Daily challenge badge on the home screen
//  • Shareable rich progress report (clipboard)
//  • Classroom Code — create/join a local class for group play
// ============================================================

class ParentDashboard {
  constructor(tracker) {
    this._tracker = tracker;
    this._el      = document.getElementById('progressScreen');
    this._bindEvents();
    this._renderHomeStreak();
  }

  // ── Public ────────────────────────────────────────────────
  show() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this._el.classList.add('active');
    this._render();
  }

  hide() {
    this._el.classList.remove('active');
    document.getElementById('modeChooser').classList.add('active');
  }

  // ── Home-screen engagement strip ─────────────────────────
  _renderHomeStreak() {
    const t = this._tracker;

    // Daily streak chip
    const chip = document.getElementById('mc-streak-chip');
    if (chip) {
      const streak     = t.getDailyStreak();
      const loginStreak = t.getLoginStreak();
      const daily      = PHONICS_DATA.getDailySet();
      const done       = t.getDailyCompleted();
      const flame      = streak >= 7 ? '🌟' : streak >= 3 ? '🔥' : '✨';
      chip.innerHTML   = `
        <span class="streak-flame">${flame}</span>
        <span class="streak-count">${streak}</span>
        <span class="streak-label">day streak</span>
        ${done ? '<span class="streak-done">✅ Done today!</span>' : `<span class="streak-theme">Today: ${daily.theme}</span>`}
        <span class="login-badge">🎮 ${loginStreak}d login</span>
      `;
      chip.style.display = 'flex';
    }

    // Rice grains counter on home
    const riceEl = document.getElementById('mc-rice-counter');
    if (riceEl) {
      riceEl.textContent = `🌾 ${t.getRiceGrains()} rice grains`;
    }
  }

  // ── Full render of the dashboard screen ──────────────────
  _render() {
    const t = this._tracker;

    // Global stats row
    document.getElementById('pd-words-blended').textContent = t.getTotalWordsBlended();
    document.getElementById('pd-best-combo').textContent    = t.getBestCombo();
    document.getElementById('pd-daily-streak').textContent  = t.getDailyStreak() + ' 🔥';
    document.getElementById('pd-rice-grains').textContent   = t.getRiceGrains();
    document.getElementById('pd-endless-dist').textContent  = t.getEndlessBestDist() + 'm';

    this._renderStages();
    this._renderHeatmap();
    this._renderClassroom();
  }

  // ── Stage progress cards ─────────────────────────────────
  _renderStages() {
    const container = document.getElementById('pd-stages');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= 6; i++) {
      const stage = PHONICS_DATA.stageList[i - 1];
      const data  = this._tracker.getStage(i);
      const { stars, unlocked, wordsMastered = [], totalBlends = 0, correctBlends = 0 } = data;
      const mastered = wordsMastered.length;
      const total    = stage.words.length;
      const acc      = totalBlends > 0 ? Math.round((correctBlends / totalBlends) * 100) : 0;
      const mastery  = this._tracker.getStageMastery(i);

      const card = document.createElement('div');
      card.className = 'pd-stage-card' + (unlocked ? '' : ' pd-locked');
      card.innerHTML = `
        <div class="pd-stage-header">
          <span class="pd-stage-num">Stage ${i}</span>
          <span class="pd-stage-stars">${this._stars(stars)}</span>
          <div class="pd-mastery-badges">
            ${mastery.noHit      ? '<span class="pd-badge pd-badge-nohit" title="No-hit clear!">🛡️</span>'    : ''}
            ${mastery.speedClear ? '<span class="pd-badge pd-badge-speed" title="Speed clear!">⚡</span>'     : ''}
          </div>
        </div>
        <div class="pd-stage-name">${stage.name}</div>
        <div class="pd-stage-pattern">${stage.pattern}</div>
        ${unlocked ? `
          <div class="pd-stage-bar-wrap">
            <div class="pd-stage-bar">
              <div class="pd-stage-fill" style="width:${acc}%"></div>
            </div>
            <span class="pd-stage-acc">${acc}%</span>
          </div>
          <div class="pd-stage-stats">${mastered}/${total} words mastered</div>
        ` : '<div class="pd-stage-stats pd-locked-label">🔒 Locked — complete previous stage</div>'}
      `;
      container.appendChild(card);
    }
  }

  // ── Phoneme mastery heatmap ───────────────────────────────
  _renderHeatmap() {
    const container = document.getElementById('pd-heatmap');
    if (!container) return;
    container.innerHTML = '';

    // Aggregate weak scores across all stages
    const scores = {};
    for (let i = 1; i <= 6; i++) {
      const weak = this._tracker.getWeakPhonemes(i);
      for (const [ph, s] of Object.entries(weak)) {
        scores[ph] = (scores[ph] || 0) + s;
      }
    }

    // Collect all unique phonemes from the word data
    const all = new Set();
    PHONICS_DATA.stageList.forEach(stage =>
      stage.words.forEach(w => w.phonemes.forEach(ph => all.add(ph)))
    );

    if (all.size === 0) {
      container.innerHTML = '<p class="pd-no-data">Play some stages to see your phonics map!</p>';
      return;
    }

    // Sort weakest first so trouble spots appear at the top
    const sorted = [...all].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));

    sorted.forEach(ph => {
      const s  = scores[ph] || 0;
      let cls  = 'pd-ph-green';  // mastered
      if (s >= 6)      cls = 'pd-ph-red';    // needs a lot of work
      else if (s >= 2) cls = 'pd-ph-yellow'; // some practice needed

      const cell = document.createElement('div');
      cell.className = `pd-phoneme-cell ${cls}`;
      cell.textContent = ph;
      cell.title = s === 0
        ? `"${ph}" — mastered!`
        : s >= 6
          ? `"${ph}" — needs practice`
          : `"${ph}" — almost there`;
      container.appendChild(cell);
    });
  }

  // ── Classroom Code panel ─────────────────────────────────
  _renderClassroom() {
    const t = this._tracker;
    const stored = localStorage.getItem('samurice_class') || null;
    const nameEl = document.getElementById('pd-class-name');
    const codeEl = document.getElementById('pd-class-code');
    if (!nameEl || !codeEl) return;

    if (stored) {
      try {
        const cls = JSON.parse(stored);
        nameEl.textContent = cls.name || 'My Class';
        codeEl.textContent = cls.code || '——';
      } catch { /* ignore */ }
    } else {
      nameEl.textContent = 'No class yet';
      codeEl.textContent = '——';
    }
  }

  // ── Share report ─────────────────────────────────────────
  _shareReport() {
    const t = this._tracker;
    const lines = [
      '📊 Samurice Dino Phonics Progress Report',
      '═══════════════════════════════════════',
      `Words Blended:  ${t.getTotalWordsBlended()}`,
      `Best Combo:     ${t.getBestCombo()}x`,
      `Daily Streak:   ${t.getDailyStreak()} days 🔥`,
      `Rice Grains:    ${t.getRiceGrains()} 🌾`,
      `Endless Record: ${t.getEndlessBestDist()}m`,
      '',
      '📚 Stage Scores:',
    ];

    for (let i = 1; i <= 6; i++) {
      const d = t.getStage(i);
      if (!d.unlocked) continue;
      const acc = d.totalBlends > 0
        ? Math.round((d.correctBlends / d.totalBlends) * 100) : 0;
      lines.push(`  Stage ${i}: ${this._starsText(d.stars)} — ${d.wordsMastered?.length || 0} words mastered, ${acc}% accuracy`);
    }

    lines.push('', '🎮 Play free: https://RiceTogether17.github.io/samurice-dino-slash/');
    const report = lines.join('\n');

    const btn = document.getElementById('shareReportBtn');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(report).then(() => {
        if (btn) { btn.textContent = '✅ Copied to clipboard!'; setTimeout(() => { btn.textContent = '📤 Share Progress Report'; }, 2800); }
      });
    } else {
      prompt('Copy your progress report:', report);
    }
  }

  // ── Classroom Code creation ───────────────────────────────
  _createClass() {
    const input = document.getElementById('pd-class-input');
    const name  = input?.value?.trim();
    if (!name) return;
    const code  = name.toUpperCase().replace(/\s+/g, '').slice(0, 6) + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('samurice_class', JSON.stringify({ name, code }));
    this._renderClassroom();
    if (input) input.value = '';

    // Show the code briefly highlighted
    const codeEl = document.getElementById('pd-class-code');
    if (codeEl) { codeEl.classList.add('pd-code-flash'); setTimeout(() => codeEl.classList.remove('pd-code-flash'), 1400); }
  }

  // ── Helpers ──────────────────────────────────────────────
  _stars(n)     { return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)); }
  _starsText(n) { return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)); }

  // ── Event binding ─────────────────────────────────────────
  _bindEvents() {
    document.getElementById('progressBackBtn')?.addEventListener('click', () => this.hide());
    document.getElementById('shareReportBtn')?.addEventListener('click', () => this._shareReport());
    document.getElementById('pd-create-class-btn')?.addEventListener('click', () => this._createClass());
    document.getElementById('launchProgressBtn')?.addEventListener('click', () => this.show());
    document.getElementById('pd-class-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._createClass();
    });
  }
}

// ── Module init (called from DOMContentLoaded in index.html) ──
function initParentDashboard() {
  // progressTracker is the global ProgressTracker instance (set by slashGame.js)
  // We defer creation slightly so _progressTracker is ready
  const tryInit = () => {
    const t = window._progressTracker;
    if (!t) { setTimeout(tryInit, 200); return; }
    window._parentDashboard = new ParentDashboard(t);
  };
  tryInit();
}
