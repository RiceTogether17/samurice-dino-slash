'use strict';
// ============================================================
// PROGRESS TRACKER — js/progressTracker.js
// Manages all player progress via localStorage.
// Keys: samurice_progress  (JSON blob, versioned)
// ============================================================

class ProgressTracker {
  constructor() {
    this._key = 'samurice_progress_v1';
    this._load();
  }

  // ── Private: load / save ─────────────────────────────────────
  _load() {
    try {
      this.data = JSON.parse(localStorage.getItem(this._key)) || this._fresh();
    } catch {
      this.data = this._fresh();
    }
    // Ensure schema is complete (handles upgrades)
    if (!this.data.stages) this.data = this._fresh();
  }

  _save() {
    try { localStorage.setItem(this._key, JSON.stringify(this.data)); } catch { /* quota */ }
  }

  _fresh() {
    return {
      version: 1,
      ricePoints: 0,
      totalWordsBlended: 0,
      stages: {
        1: this._freshStage(),
        2: this._freshStage(false),
        3: this._freshStage(false),
        4: this._freshStage(false),
        5: this._freshStage(false),
        6: this._freshStage(false),
      },
    };
  }

  _freshStage(unlocked = true) {
    return {
      unlocked,
      stars: 0,            // 0-3
      bestScore: 0,        // coins collected × blend accuracy
      attempts: 0,
      totalBlends: 0,
      correctBlends: 0,
      wordsMastered: [],   // words with ≥ 2 correct blends
      wordsAttempted: {},  // word → {correct, wrong}
      coinsCollected: 0,
      completedAt: null,
    };
  }

  // ── Stage unlock / progress ──────────────────────────────────
  getStage(id) {
    return this.data.stages[id] || this._freshStage(false);
  }

  isUnlocked(id) {
    return this.getStage(id).unlocked;
  }

  unlockStage(id) {
    if (!this.data.stages[id]) this.data.stages[id] = this._freshStage(false);
    this.data.stages[id].unlocked = true;
    this._save();
  }

  // ── After runner phase ───────────────────────────────────────
  recordRunnerComplete(stageId, coinsCollected) {
    const s = this.getStage(stageId);
    s.coinsCollected = Math.max(s.coinsCollected, coinsCollected);
    this.data.stages[stageId] = s;
    this._save();
  }

  // ── After each blend attempt ─────────────────────────────────
  recordBlend(stageId, word, success) {
    const s = this.getStage(stageId);
    s.totalBlends++;
    if (!s.wordsAttempted[word]) s.wordsAttempted[word] = { correct: 0, wrong: 0 };
    if (success) {
      s.correctBlends++;
      s.wordsAttempted[word].correct++;
      this.data.totalWordsBlended++;
      // Mastery: 2 correct blends of the same word
      if (s.wordsAttempted[word].correct >= 2 && !s.wordsMastered.includes(word)) {
        s.wordsMastered.push(word);
      }
    } else {
      s.wordsAttempted[word].wrong++;
    }
    this.data.stages[stageId] = s;
    this._save();
  }

  // ── After boss defeat (stage complete) ──────────────────────
  completeStage(stageId, score) {
    const s = this.getStage(stageId);
    s.attempts++;
    s.bestScore = Math.max(s.bestScore, score);
    s.completedAt = Date.now();

    // Stars: based on blend accuracy
    const acc = s.totalBlends > 0 ? s.correctBlends / s.totalBlends : 0;
    if      (acc >= 0.9) s.stars = 3;
    else if (acc >= 0.7) s.stars = Math.max(s.stars, 2);
    else if (acc >= 0.5) s.stars = Math.max(s.stars, 1);

    this.data.stages[stageId] = s;

    // Unlock next stage
    if (stageId < 6) this.unlockStage(stageId + 1);

    // Rice points: 50 per star earned
    this.addRicePoints(s.stars * 50 + Math.floor(score / 10));
    this._save();
  }

  // ── Rice points (in-game currency for unlockables) ───────────
  getRicePoints()    { return this.data.ricePoints || 0; }
  addRicePoints(n)   { this.data.ricePoints = (this.data.ricePoints || 0) + n; this._save(); }

  // ── Adaptive difficulty ──────────────────────────────────────
  // Returns 0 (easy) · 1 (medium) · 2 (hard)
  getDifficulty(stageId) {
    const s = this.getStage(stageId);
    if (s.totalBlends < 5) return 0;
    const acc = s.correctBlends / s.totalBlends;
    if (acc >= 0.85) return 2;
    if (acc >= 0.60) return 1;
    return 0;
  }

  // ── Mastery info ─────────────────────────────────────────────
  getMasteredWords(stageId) { return this.getStage(stageId).wordsMastered; }
  getStars(stageId)         { return this.getStage(stageId).stars; }

  // ── Summary stats for stage select display ───────────────────
  getStageSummary(stageId) {
    const s = this.getStage(stageId);
    return {
      unlocked:  s.unlocked,
      stars:     s.stars,
      bestScore: s.bestScore,
      mastered:  s.wordsMastered.length,
      attempts:  s.attempts,
    };
  }

  // ── Reset (debug / classroom reset) ─────────────────────────
  reset() {
    this.data = this._fresh();
    this._save();
  }
}
