// ─────────────────────────────────────────────────────────────
// learn/review.js — the spaced-review ladder
//
// The game had every incentive to bring a child back tomorrow (a countdown,
// a random-prize jar, a streak you could pay to protect) and no reason for
// them to come back: yesterday's words were gone the moment the stage was
// cleared. Coming back met the same fresh content, not the words that had
// actually slipped.
//
// This is the other half. Every word a child answers is filed in one of six
// boxes; a box decides how many days pass before the word is asked again.
// Get it right, it moves up and goes quiet for longer. Miss it, it drops
// back and returns soon. That is a Leitner ladder, and it is the reason to
// return that does not depend on a prize: the words you nearly knew are
// waiting, and they are the ones worth doing.
//
// Two deliberate departures from the textbook version:
//
//   • A miss drops two boxes, not all the way to one. Resetting a word a
//     child has known for a fortnight because of one bad tap is punishing
//     and — worse — inaccurate.
//
//   • The day's queue is capped. A ladder with no ceiling turns into a
//     chore the first time somebody takes a week off, and a five-year-old
//     who opens the game to sixty due words closes it again. Past the cap
//     the game says so and stops asking. See `doneForToday`.
//
// Days, not timestamps: everything is scheduled in whole local days, so
// there is no midnight cliff to race and no clock to watch.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const STORAGE_KEY = 'samurice_review';
  const VERSION = 1;

  /** Days a word rests after a correct answer, by box (1-indexed). */
  const BOX_DAYS = [0, 1, 2, 4, 8, 16];
  const BOXES = BOX_DAYS.length;

  /** A word in the top box is treated as learned — for reporting only. */
  const MASTERED_BOX = BOXES;

  /** How many words the game will ask for in one day before saying stop. */
  const DAILY_TARGET = 12;

  /** How far a miss knocks a word down the ladder. */
  const MISS_DROP = 2;

  const MS_PER_DAY = 86400000;

  /** Whole local days since the epoch — the unit everything is scheduled in. */
  function dayNumber(now) {
    const d = now instanceof Date ? now : new Date(now || Date.now());
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / MS_PER_DAY);
  }

  function localStore() {
    return {
      read() {
        try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY) || 'null'); }
        catch { return null; }
      },
      write(data) {
        try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
        catch { /* private mode, quota — the ladder degrades to in-memory */ }
      },
    };
  }

  class ReviewLadder {
    /**
     * @param {{read:Function,write:Function}} [store] injectable for tests
     * @param {Function} [clock] returns ms since epoch
     */
    constructor(store, clock) {
      this._store = store || localStore();
      this._clock = clock || (() => Date.now());
      this._data = this._load();
    }

    _load() {
      const raw = this._store.read();
      if (!raw || raw.v !== VERSION || typeof raw.words !== 'object') {
        return { v: VERSION, words: {}, doneDay: -1, doneCount: 0 };
      }
      raw.words = raw.words || {};
      if (typeof raw.doneDay !== 'number') raw.doneDay = -1;
      if (typeof raw.doneCount !== 'number') raw.doneCount = 0;
      return raw;
    }

    _save() { this._store.write(this._data); }

    _today(now) { return dayNumber(now === undefined ? this._clock() : now); }

    /** Roll the day counter over if the calendar has moved on. */
    _syncDay(today) {
      if (this._data.doneDay !== today) {
        this._data.doneDay = today;
        this._data.doneCount = 0;
      }
    }

    // ── Reading state ──────────────────────────────────────────

    /** @returns {{box:number,dueDay:number,seen:number,missed:number,stage:number}|null} */
    entry(word) {
      const e = this._data.words[String(word || '').toLowerCase()];
      if (!e) return null;
      return { box: e.b, dueDay: e.d, seen: e.n, missed: e.m, stage: e.s };
    }

    /** Every word whose rest has elapsed, most overdue first, then weakest. */
    dueWords(now) {
      const today = this._today(now);
      const out = [];
      for (const word in this._data.words) {
        const e = this._data.words[word];
        if (e.d <= today) out.push({ word, over: today - e.d, box: e.b });
      }
      out.sort((a, b) => (b.over - a.over) || (a.box - b.box) || (a.word < b.word ? -1 : 1));
      return out.map(r => r.word);
    }

    dueCount(now) { return this.dueWords(now).length; }

    /** How many more words the game will ask for today. */
    remainingToday(now) {
      const today = this._today(now);
      const done = this._data.doneDay === today ? this._data.doneCount : 0;
      return Math.max(0, DAILY_TARGET - done);
    }

    /**
     * The words to actually practise now: the most-overdue slice of what is
     * due, no longer than the day has room for.
     */
    todaysQueue(now) {
      return this.dueWords(now).slice(0, this.remainingToday(now));
    }

    /**
     * True when the game should stop asking — either the ladder is clear or
     * the day's practice is done. The screen that reads this is expected to
     * say so and offer to stop, not to hide the button and hope.
     */
    doneForToday(now) { return this.todaysQueue(now).length === 0; }

    stats(now) {
      const today = this._today(now);
      let learning = 0, reviewing = 0, mastered = 0;
      for (const word in this._data.words) {
        const b = this._data.words[word].b;
        if (b >= MASTERED_BOX) mastered++;
        else if (b <= 2) learning++;
        else reviewing++;
      }
      return {
        total: learning + reviewing + mastered,
        learning, reviewing, mastered,
        due: this.dueCount(now),
        doneToday: this._data.doneDay === today ? this._data.doneCount : 0,
        target: DAILY_TARGET,
        remaining: this.remainingToday(now),
      };
    }

    // ── Writing state ──────────────────────────────────────────

    /** File a word at the bottom box, due immediately. No-op if already known. */
    introduce(word, stageId, now) {
      const key = String(word || '').toLowerCase();
      if (!key || this._data.words[key]) return false;
      this._data.words[key] = { b: 1, d: this._today(now), n: 0, m: 0, s: stageId | 0 };
      this._save();
      return true;
    }

    /**
     * Record an answer and reschedule the word.
     *
     * Every graded word counts toward the day's practice, whether it came up
     * in a review or in the campaign — a child who has just played thirty
     * words has practised, and the game should not then ask for twelve more.
     */
    grade(word, correct, opts = {}) {
      const key = String(word || '').toLowerCase();
      if (!key) return null;
      const today = this._today(opts.now);
      this._syncDay(today);

      let e = this._data.words[key];
      if (!e) e = this._data.words[key] = { b: 1, d: today, n: 0, m: 0, s: opts.stage | 0 };
      if (opts.stage) e.s = opts.stage | 0;

      e.n++;
      if (correct) {
        e.b = Math.min(BOXES, e.b + 1);
      } else {
        e.m++;
        e.b = Math.max(1, e.b - MISS_DROP);
      }
      // A missed word comes back the same day; box 1 rests for zero days.
      e.d = today + BOX_DAYS[e.b - 1];

      this._data.doneCount++;
      this._save();
      return this.entry(key);
    }

    /** Fresh start — used by the clean-slate reset alongside progress. */
    reset() {
      this._data = { v: VERSION, words: {}, doneDay: -1, doneCount: 0 };
      this._save();
    }
  }

  /**
   * One ladder per page. Everything that grades a word — the campaign, the
   * daily challenge, the review session — writes to the same one, because a
   * word is a word wherever the child met it.
   */
  let _shared = null;
  function shared() {
    if (!_shared) _shared = new ReviewLadder();
    return _shared;
  }

  const api = {
    ReviewLadder, shared, dayNumber,
    BOX_DAYS, BOXES, DAILY_TARGET, MISS_DROP, MASTERED_BOX, STORAGE_KEY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Review = api;
})(typeof window !== 'undefined' ? window : globalThis);
