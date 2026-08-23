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
    // Refresh engagement strip so rice/level are up-to-date when returning home
    if (window._engagementEngine) window._engagementEngine.refresh();
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
    document.getElementById('pd-daily-streak').textContent  = t.getDailyStreak();
    document.getElementById('pd-rice-grains').textContent   = t.getRiceGrains();
    document.getElementById('pd-endless-dist').textContent  = t.getEndlessBestDist() + 'm';

    this._renderReview();
    this._renderStages();
    this._renderHeatmap();
    this._renderClassroom();
    this._renderPlayerName();
  }

  /** Who is playing — used to name rows in the Dino Dash record book. */
  _renderPlayerName() {
    const input = document.getElementById('pd-player-name');
    if (input) input.value = this._tracker.getPlayerName();
  }

  // ── Stage progress cards ─────────────────────────────────
  _renderStages() {
    const container = document.getElementById('pd-stages');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= (PHONICS_DATA.stageCount || 6); i++) {
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
  /**
   * The sound map.
   *
   * This used to colour a sound green — "mastered" — whenever its weak
   * score was zero, and the weak score only moves when something goes
   * wrong. So every sound the child had never once been asked about was
   * reported to their parent as mastered. It now reads attempt counts
   * (progressTracker.getPhonemeStats) and will not claim mastery without
   * evidence for it.
   */
  _renderHeatmap() {
    const container = document.getElementById('pd-heatmap');
    if (!container) return;
    container.innerHTML = '';

    const stats = this._tracker.getPhonemeStats();
    const all = new Set();
    PHONICS_DATA.stageList.forEach(stage =>
      stage.words.forEach(w => (w.phonemes || []).forEach(ph => all.add(String(ph).toLowerCase())))
    );
    if (all.size === 0) {
      container.innerHTML = '<p class="pd-no-data">Play some stages to see the sound map.</p>';
      return;
    }

    /** Four honest states, in the order a parent wants to see them. */
    const classify = (ph) => {
      const e = stats[ph];
      if (!e || e.n === 0) return { cls: 'pd-ph-new', rank: 2, note: 'not practised yet' };
      const wrongRate = e.wrong / e.n;
      if (wrongRate >= 0.35) return { cls: 'pd-ph-red', rank: 0,
        note: `missed ${e.wrong} of ${e.n}` };
      if (wrongRate > 0 || e.n < 3) return { cls: 'pd-ph-yellow', rank: 1,
        note: `${e.n - e.wrong} of ${e.n} right` };
      return { cls: 'pd-ph-green', rank: 3, note: `${e.n} for ${e.n}` };
    };

    // Trouble first, then in-progress, then solid — the order a parent
    // reads for "what should we do next".
    const classified = [...all].map(ph => ({ ph, ...classify(ph) }));
    const practised = classified
      .filter(c => c.rank !== 2)
      .sort((a, b) => a.rank - b.rank || (a.ph < b.ph ? -1 : 1));
    const untouched = classified.filter(c => c.rank === 2);

    // The campaign teaches several hundred units across six worlds, so
    // rendering every one of them buried the handful that need attention
    // under a wall of grey. Only what has actually been played is shown;
    // the rest is a count.
    if (!practised.length) {
      container.innerHTML = '<p class="pd-no-data">No sounds practised yet — ' +
                            'they appear here as they come up in play.</p>';
      return;
    }
    for (const item of practised) {
      const cell = document.createElement('div');
      cell.className = `pd-phoneme-cell ${item.cls}`;
      cell.textContent = item.ph;
      cell.title = `"${item.ph}" — ${item.note}`;
      container.appendChild(cell);
    }
    if (untouched.length) {
      const note = document.createElement('p');
      note.className = 'pd-no-data pd-map-rest';
      note.textContent =
        `${untouched.length} more sounds are still ahead in the campaign.`;
      container.appendChild(note);
    }
  }

  /**
   * What the review ladder knows.
   *
   * This is the most useful thing on the screen and it did not exist: how
   * many words the child is actively learning, how many have stuck, and
   * which ones keep slipping. Stars and rice tell a parent the child
   * played. This tells them whether they are reading.
   */
  _renderReview() {
    const wrap = document.getElementById('pd-review');
    if (!wrap) return;
    const ladder = window.Review?.shared?.();
    if (!ladder) { wrap.innerHTML = ''; return; }

    const stats = ladder.stats();
    if (stats.total === 0) {
      wrap.innerHTML = '<p class="pd-no-data">No words on the review ladder yet — ' +
                       'they are added as they are played.</p>';
      return;
    }

    const tiles = [
      ['Learning', stats.learning, 'pd-rv-learning', 'seen recently, not stuck yet'],
      ['Getting there', stats.reviewing, 'pd-rv-mid', 'coming back at longer gaps'],
      ['Known', stats.mastered, 'pd-rv-known', 'right every time for weeks'],
    ];

    // Words that keep slipping, worst first. Named, because "3 words need
    // work" is not something a parent can act on and "was, said, they" is.
    const shaky = ladder.allWords().filter(w => w.missed > 0);

    wrap.innerHTML = `
      <div class="pd-review-tiles">
        ${tiles.map(([label, n, cls, note]) => `
          <div class="pd-rv-tile ${cls}">
            <span class="pd-rv-num">${n}</span>
            <span class="pd-rv-label">${label}</span>
            <span class="pd-rv-note">${note}</span>
          </div>`).join('')}
      </div>
      <p class="pd-review-line">
        ${stats.due > 0
          ? `<strong>${stats.due}</strong> word${stats.due === 1 ? '' : 's'} due for review today.`
          : 'Nothing due today — everything is resting.'}
        ${stats.doneToday > 0 ? ` ${stats.doneToday} practised so far today.` : ''}
      </p>
      ${shaky.length ? `
        <p class="pd-review-sub">Words to read together:</p>
        <div class="pd-shaky">
          ${shaky.slice(0, 12).map(w =>
            `<span class="pd-shaky-word" title="missed ${w.missed} time${w.missed === 1 ? '' : 's'}">${w.word}</span>`
          ).join('')}
        </div>` : ''}
    `;
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
    ];

    // The review ladder is the part of this report that is actually about
    // reading, so it goes above the stage scores.
    const ladder = window.Review?.shared?.();
    if (ladder) {
      const rv = ladder.stats();
      lines.push('', '📖 Reading (spaced review):',
        `  Learning:      ${rv.learning}`,
        `  Getting there: ${rv.reviewing}`,
        `  Known:         ${rv.mastered}`,
        `  Due today:     ${rv.due}`);
      const shaky = ladder.allWords().filter(w => w.missed > 0).slice(0, 10);
      if (shaky.length) {
        lines.push(`  Worth reading together: ${shaky.map(w => w.word).join(', ')}`);
      }
    }

    lines.push('', '📚 Stage Scores:');

    for (let i = 1; i <= (PHONICS_DATA.stageCount || 6); i++) {
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
    document.getElementById('pd-player-name')?.addEventListener('change', e => {
      this._tracker.setPlayerName(e.target.value);
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
