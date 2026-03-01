'use strict';
// ============================================================
// PROGRESS TRACKER — js/progressTracker.js
// All player progress, shop, achievements, daily challenges.
// ============================================================

// ── SHOP CATALOG ─────────────────────────────────────────────
const SHOP_ITEMS = {
  swords: [
    { id:'sword-basic',   name:'Rice Stalk',    price:0,    emoji:'🌾', desc:'Your trusty starter blade' },
    { id:'sword-golden',  name:'Golden Grain',  price:300,  emoji:'⚔️', desc:'Gleams with harvest power' },
    { id:'sword-fire',    name:'Flame Fang',    price:600,  emoji:'🔥', desc:'Burns foes to a crisp!' },
    { id:'sword-ice',     name:'Frost Slash',   price:600,  emoji:'❄️', desc:'Freezes dinos in place' },
    { id:'sword-thunder', name:'Thunder Claw',  price:1000, emoji:'⚡', desc:'Shock wave on every hit' },
    { id:'sword-rainbow', name:'Rainbow Blade', price:1500, emoji:'🌈', desc:'Legendary; every color!' },
  ],
  hats: [
    { id:'hat-none',      name:'No Hat',        price:0,    emoji:'😐', desc:'Classic samurai look' },
    { id:'hat-ninja',     name:'Ninja Wrap',    price:200,  emoji:'🥷', desc:'Stealthy rice ninja' },
    { id:'hat-crown',     name:'Rice Crown',    price:500,  emoji:'👑', desc:'Royally riced out' },
    { id:'hat-mushroom',  name:'Mush Hat',      price:400,  emoji:'🍄', desc:'Extra bounce power!' },
    { id:'hat-star',      name:'Star Hat',      price:800,  emoji:'⭐', desc:'Born to shine' },
  ],
  companions: [
    { id:'comp-none',     name:'Solo Run',      price:0,    emoji:'🏃', desc:'Just you and the blade' },
    { id:'comp-baby-rex', name:'Baby Rex',      price:400,  emoji:'🦖', desc:'Reformed dino pal!' },
    { id:'comp-duck',     name:'Ducky',         price:300,  emoji:'🦆', desc:'Quacks on perfect blends' },
    { id:'comp-koi',      name:'Koi Fish',      price:500,  emoji:'🐠', desc:'Swims through the air' },
    { id:'comp-panda',    name:'Rice Panda',    price:700,  emoji:'🐼', desc:'Eats your mistakes!' },
  ],
  powerups: [
    { id:'pu-magnet',     name:'Rice Magnet',   price:80,  emoji:'🧲', desc:'Attract grains for 10s', consumable:true },
    { id:'pu-timeslow',   name:'Sushi Slow',    price:100, emoji:'🍣', desc:'Slow-mo for easy blending', consumable:true },
    { id:'pu-autoblend',  name:'Onigiri Auto',  price:120, emoji:'🍙', desc:'Auto-complete next blend', consumable:true },
    { id:'pu-dbljump',    name:'Ninja Scroll',  price:90,  emoji:'📜', desc:'Double-jump for 15s', consumable:true },
    { id:'pu-shield',     name:'Rice Shield',   price:70,  emoji:'🛡️', desc:'Block the next hit free', consumable:true },
  ],
};

// ── ACHIEVEMENTS ─────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first-blend',   name:'First Blend!',      desc:'Complete your first word blend',             emoji:'⚔️' },
  { id:'combo-5',       name:'Combo Starter',      desc:'Hit a 5-combo streak',                       emoji:'🔥' },
  { id:'combo-10',      name:'Combo Warrior',      desc:'Hit a 10-combo streak',                      emoji:'💥' },
  { id:'combo-20',      name:'Combo Legend',       desc:'Hit a 20-combo streak',                      emoji:'🌟' },
  { id:'dist-100',      name:'First Sprint',       desc:'Run 100m in endless mode',                   emoji:'🏃' },
  { id:'dist-500',      name:'Long Runner',        desc:'Run 500m in endless mode',                   emoji:'🗺️' },
  { id:'dist-1000',     name:'Marathon Riku',      desc:'Run 1000m in endless mode',                  emoji:'🏅' },
  { id:'dist-2000',     name:'Endless Legend',     desc:'Run 2000m in endless mode',                  emoji:'🏆' },
  { id:'daily-done',    name:'Daily Warrior',      desc:'Complete a daily challenge',                 emoji:'📅' },
  { id:'daily-streak3', name:'3-Day Streak',       desc:'Complete daily challenges 3 days in a row',  emoji:'🔗' },
  { id:'daily-streak7', name:'Week Warrior',       desc:'7-day daily challenge streak',               emoji:'🌠' },
  { id:'shop-buy1',     name:'First Purchase',     desc:'Buy something from the shop',                emoji:'🏪' },
  { id:'words-50',      name:'Word Apprentice',    desc:'Blend 50 words total',                       emoji:'📚' },
  { id:'words-200',     name:'Word Master',        desc:'Blend 200 words total',                      emoji:'🧙' },
  { id:'perfect-10',    name:'Perfect 10',         desc:'Get 10 perfect blends in one run',           emoji:'💯' },
  { id:'all-stages',    name:'Dino Slayer',        desc:'Complete all 6 campaign stages',             emoji:'🦕' },
  { id:'ricegrain-500', name:'Rice Baron',         desc:'Collect 500 rice grains total',              emoji:'🌾' },
  { id:'slip-recover',  name:'Oof Recovery',       desc:'Miss a blend but keep running anyway',       emoji:'😅' },
];

// ── FAKE LEADERBOARD ─────────────────────────────────────────
const FAKE_LEADERS = [
  { name:'NinjaRice99',   dist:3420, score:58200 },
  { name:'DinoSlayer',    dist:2890, score:47100 },
  { name:'PhonicsKing',   dist:2550, score:41800 },
  { name:'RiceBall_Pro',  dist:2210, score:36500 },
  { name:'SamuraiStar',   dist:1980, score:32400 },
  { name:'BlendMaster',   dist:1740, score:28900 },
  { name:'KatanaKid',     dist:1530, score:25100 },
  { name:'WordWarrior',   dist:1290, score:21600 },
  { name:'RicePaddy123',  dist:1040, score:17200 },
  { name:'DinoBuster',    dist:820,  score:13800 },
];

// ─────────────────────────────────────────────────────────────
// PROGRESS TRACKER CLASS
// ─────────────────────────────────────────────────────────────
class ProgressTracker {
  constructor() {
    this._key = 'samurice_progress_v3';
    this._load();
    this._checkDailyReset();
    this._checkLoginStreak();
  }

  _load() {
    try {
      const raw = localStorage.getItem(this._key);
      this.data = raw ? JSON.parse(raw) : this._fresh();
    } catch { this.data = this._fresh(); }
    this._migrate();
  }

  _save() {
    try { localStorage.setItem(this._key, JSON.stringify(this.data)); } catch {}
  }

  _fresh() {
    return {
      version: 3,
      riceGrains: 0,
      totalRiceGrainsEver: 0,
      endlessHighScore: 0,
      endlessBestDist: 0,
      endlessTotalRuns: 0,
      stages: {
        1: this._freshStage(true),
        2: this._freshStage(false),
        3: this._freshStage(false),
        4: this._freshStage(false),
        5: this._freshStage(false),
        6: this._freshStage(false),
      },
      totalWordsBlended: 0,
      totalPerfectBlends: 0,
      ownedItems: ['sword-basic','hat-none','comp-none'],
      equippedSword: 'sword-basic',
      equippedHat: 'hat-none',
      equippedComp: 'comp-none',
      inventoryPowerups: {},
      achievements: [],
      newAchievements: [],
      lastDailyDate: null,
      dailyCompleted: false,
      dailyProgress: 0,
      dailyStreak: 0,
      lastLoginDate: null,
      loginStreak: 0,
      loginRewardClaimed: false,
      bestCombo: 0,
      totalRunDistance: 0,
    };
  }

  _freshStage(unlocked = true) {
    return {
      unlocked, stars: 0, bestScore: 0, attempts: 0,
      totalBlends: 0, correctBlends: 0,
      wordsMastered: [], wordsAttempted: {}, coinsCollected: 0, completedAt: null,
    };
  }

  _migrate() {
    if (!this.data.version || this.data.version < 3) {
      const fresh = this._fresh();
      if (this.data.stages) fresh.stages = this.data.stages;
      if (this.data.ricePoints) fresh.riceGrains = this.data.ricePoints;
      if (this.data.totalWordsBlended) fresh.totalWordsBlended = this.data.totalWordsBlended;
      this.data = fresh;
      this._save();
    }
    const d = this.data;
    if (!d.ownedItems) d.ownedItems = ['sword-basic','hat-none','comp-none'];
    if (!d.achievements) d.achievements = [];
    if (!d.newAchievements) d.newAchievements = [];
    if (!d.inventoryPowerups) d.inventoryPowerups = {};
    if (typeof d.dailyStreak !== 'number') d.dailyStreak = 0;
    if (typeof d.loginStreak !== 'number') d.loginStreak = 0;
    if (typeof d.bestCombo !== 'number') d.bestCombo = 0;
    if (typeof d.totalRunDistance !== 'number') d.totalRunDistance = 0;
    if (typeof d.totalPerfectBlends !== 'number') d.totalPerfectBlends = 0;
  }

  _checkDailyReset() {
    const today = this._dateStr();
    if (this.data.lastDailyDate !== today) {
      if (this.data.dailyCompleted && this.data.lastDailyDate) {
        this.data.dailyStreak++;
        if (this.data.dailyStreak >= 3) this.unlock('daily-streak3');
        if (this.data.dailyStreak >= 7) this.unlock('daily-streak7');
      } else if (this.data.lastDailyDate) {
        this.data.dailyStreak = 0;
      }
      this.data.lastDailyDate = today;
      this.data.dailyCompleted = false;
      this.data.dailyProgress = 0;
      this._save();
    }
  }

  _checkLoginStreak() {
    const today = this._dateStr();
    if (this.data.lastLoginDate !== today) {
      const yesterday = this._dateStr(-1);
      this.data.loginStreak = (this.data.lastLoginDate === yesterday)
        ? this.data.loginStreak + 1 : 1;
      this.data.lastLoginDate = today;
      this.data.loginRewardClaimed = false;
      this._save();
    }
  }

  _dateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  // ── Currency ─────────────────────────────────────────────────
  getRiceGrains()      { return this.data.riceGrains || 0; }
  getRicePoints()      { return this.getRiceGrains(); }
  addRiceGrains(n)     {
    this.data.riceGrains = (this.data.riceGrains || 0) + n;
    this.data.totalRiceGrainsEver = (this.data.totalRiceGrainsEver || 0) + n;
    if (this.data.totalRiceGrainsEver >= 500) this.unlock('ricegrain-500');
    this._save();
  }
  addRicePoints(n)     { this.addRiceGrains(n); }
  spendRiceGrains(n)   {
    if ((this.data.riceGrains || 0) < n) return false;
    this.data.riceGrains -= n; this._save(); return true;
  }

  // ── Shop ─────────────────────────────────────────────────────
  canAfford(price)  { return this.getRiceGrains() >= price; }
  ownsItem(itemId)  { return this.data.ownedItems.includes(itemId); }

  buyItem(itemId) {
    const allItems = [
      ...SHOP_ITEMS.swords, ...SHOP_ITEMS.hats,
      ...SHOP_ITEMS.companions, ...SHOP_ITEMS.powerups,
    ];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return false;
    if (item.consumable) {
      if (!this.spendRiceGrains(item.price)) return false;
      this.data.inventoryPowerups[itemId] = (this.data.inventoryPowerups[itemId] || 0) + 1;
      this._save(); this.unlock('shop-buy1'); return true;
    }
    if (this.ownsItem(itemId)) return false;
    if (!this.spendRiceGrains(item.price)) return false;
    this.data.ownedItems.push(itemId);
    this._save(); this.unlock('shop-buy1'); return true;
  }

  getPowerupCount(id) { return this.data.inventoryPowerups[id] || 0; }
  usePowerup(id) {
    if (!this.data.inventoryPowerups[id]) return false;
    this.data.inventoryPowerups[id]--;
    if (this.data.inventoryPowerups[id] <= 0) delete this.data.inventoryPowerups[id];
    this._save(); return true;
  }

  equip(type, itemId) {
    if (!this.ownsItem(itemId)) return;
    if (type === 'sword') this.data.equippedSword = itemId;
    if (type === 'hat')   this.data.equippedHat   = itemId;
    if (type === 'comp')  this.data.equippedComp  = itemId;
    this._save();
  }

  getEquipped() {
    return {
      sword: this.data.equippedSword || 'sword-basic',
      hat:   this.data.equippedHat   || 'hat-none',
      comp:  this.data.equippedComp  || 'comp-none',
    };
  }

  // ── Endless mode ─────────────────────────────────────────────
  getEndlessHighScore() { return this.data.endlessHighScore || 0; }
  getEndlessBestDist()  { return this.data.endlessBestDist  || 0; }

  recordEndlessRun(score, dist, combo) {
    this.data.endlessTotalRuns = (this.data.endlessTotalRuns || 0) + 1;
    if (score > (this.data.endlessHighScore || 0)) this.data.endlessHighScore = score;
    if (dist  > (this.data.endlessBestDist  || 0)) this.data.endlessBestDist  = dist;
    if (combo > (this.data.bestCombo        || 0)) this.data.bestCombo        = combo;
    this.data.totalRunDistance = (this.data.totalRunDistance || 0) + dist;
    if (dist >= 100)  this.unlock('dist-100');
    if (dist >= 500)  this.unlock('dist-500');
    if (dist >= 1000) this.unlock('dist-1000');
    if (dist >= 2000) this.unlock('dist-2000');
    if (combo >= 5)   this.unlock('combo-5');
    if (combo >= 10)  this.unlock('combo-10');
    if (combo >= 20)  this.unlock('combo-20');
    this._save();
  }

  // ── Blend stats ───────────────────────────────────────────────
  recordBlend(stageId, word, success, isPerfect = false) {
    if (stageId && this.data.stages[stageId]) {
      const s = this.data.stages[stageId];
      s.totalBlends++;
      if (!s.wordsAttempted[word]) s.wordsAttempted[word] = { correct:0, wrong:0 };
      if (success) {
        s.correctBlends++;
        s.wordsAttempted[word].correct++;
        if (s.wordsAttempted[word].correct >= 2 && !s.wordsMastered.includes(word)) {
          s.wordsMastered.push(word);
        }
      } else {
        s.wordsAttempted[word].wrong++;
        this.unlock('slip-recover');
      }
      this.data.stages[stageId] = s;
    }
    if (success) {
      this.data.totalWordsBlended = (this.data.totalWordsBlended || 0) + 1;
      if (isPerfect) this.data.totalPerfectBlends = (this.data.totalPerfectBlends || 0) + 1;
      if (this.data.totalWordsBlended >= 1)   this.unlock('first-blend');
      if (this.data.totalWordsBlended >= 50)  this.unlock('words-50');
      if (this.data.totalWordsBlended >= 200) this.unlock('words-200');
    }
    this._save();
  }

  recordPerfectBlends(count) { if (count >= 10) this.unlock('perfect-10'); }

  // ── Daily ─────────────────────────────────────────────────────
  getDailyProgress()  { return this.data.dailyProgress || 0; }
  getDailyCompleted() { return !!this.data.dailyCompleted; }
  getDailyStreak()    { return this.data.dailyStreak    || 0; }

  recordDailyWord() {
    this.data.dailyProgress = (this.data.dailyProgress || 0) + 1;
    this._save();
  }

  completeDaily() {
    if (!this.data.dailyCompleted) {
      this.data.dailyCompleted = true;
      const grains = 150 + this.data.dailyStreak * 25;
      this.addRiceGrains(grains);
      this.unlock('daily-done');
      this._save();
      return grains;
    }
    return 0;
  }

  // ── Achievements ─────────────────────────────────────────────
  unlock(id) {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this.data.newAchievements.push(id);
    this._save(); return true;
  }

  hasAchievement(id)     { return this.data.achievements.includes(id); }
  getNewAchievements()   { return [...(this.data.newAchievements || [])]; }
  clearNewAchievements() { this.data.newAchievements = []; this._save(); }

  // ── Campaign stages ───────────────────────────────────────────
  getStage(id)     { return this.data.stages[id] || this._freshStage(false); }
  isUnlocked(id)   { return this.getStage(id).unlocked; }
  unlockStage(id)  {
    if (!this.data.stages[id]) this.data.stages[id] = this._freshStage(false);
    this.data.stages[id].unlocked = true;
    this._save();
  }

  completeStage(stageId, score) {
    const s = this.getStage(stageId);
    s.attempts++; s.bestScore = Math.max(s.bestScore, score); s.completedAt = Date.now();
    const acc = s.totalBlends > 0 ? s.correctBlends / s.totalBlends : 0;
    if      (acc >= 0.9) s.stars = 3;
    else if (acc >= 0.7) s.stars = Math.max(s.stars, 2);
    else if (acc >= 0.5) s.stars = Math.max(s.stars, 1);
    this.data.stages[stageId] = s;
    if (stageId < 6) this.unlockStage(stageId + 1);
    this.addRiceGrains(s.stars * 50 + Math.floor(score / 10));
    const allDone = [1,2,3,4,5,6].every(id => this.data.stages[id]?.completedAt);
    if (allDone) this.unlock('all-stages');
    this._save();
  }

  recordRunnerComplete(stageId, coinsCollected) {
    const s = this.getStage(stageId);
    s.coinsCollected = Math.max(s.coinsCollected, coinsCollected);
    this.data.stages[stageId] = s; this._save();
  }

  // ── Login reward ──────────────────────────────────────────────
  getLoginStreak()      { return this.data.loginStreak || 0; }
  canClaimLoginReward() { return !this.data.loginRewardClaimed; }
  claimLoginReward()    {
    if (this.data.loginRewardClaimed) return 0;
    const reward = 50 + Math.min(this.getLoginStreak() - 1, 6) * 25;
    this.addRiceGrains(reward); this.data.loginRewardClaimed = true; this._save();
    return reward;
  }

  // ── Leaderboard ───────────────────────────────────────────────
  getLeaderboard() {
    const myDist  = this.getEndlessBestDist();
    const myScore = this.getEndlessHighScore();
    const leaders = [...FAKE_LEADERS];
    if (myDist > 0) leaders.push({ name:'YOU ⭐', dist:myDist, score:myScore, isMe:true });
    leaders.sort((a, b) => b.score - a.score);
    return leaders.slice(0, 12);
  }

  // ── Misc ──────────────────────────────────────────────────────
  getDifficulty(stageId) {
    const s = this.getStage(stageId);
    if (s.totalBlends < 5) return 0;
    const acc = s.correctBlends / s.totalBlends;
    return acc >= 0.85 ? 2 : acc >= 0.60 ? 1 : 0;
  }
  getStars(stageId)       { return this.getStage(stageId).stars; }
  getStageSummary(id)     {
    const s = this.getStage(id);
    return { unlocked:s.unlocked, stars:s.stars, bestScore:s.bestScore,
             mastered:s.wordsMastered.length, attempts:s.attempts };
  }
  getTotalWordsBlended()  { return this.data.totalWordsBlended || 0; }
  getBestCombo()          { return this.data.bestCombo || 0; }
  reset()                 { this.data = this._fresh(); this._save(); }
}
