'use strict';
// ============================================================
// AUDIO MANAGER — js/audioManager.js
//
// Consonant blends whose letters are spoken individually (b…l, s…t, etc.).
// Digraphs like "sh", "ch", "th" are NOT listed here — they stay as one sound.
const CONSONANT_BLENDS = new Set([
  'bl','br','cl','cr','dr','fl','fr','gl','gr','pl','pr',
  'sc','sk','sl','sm','sn','sp','st','sw','tr','tw',
  'scr','spl','spr','str','shr','thr',
]);

// Phonetic TTS text for individual letter sounds (not letter names).
// "c" → "kuh", "a" → "ah", not "see" / "ay".
const LETTER_SOUNDS_TTS = {
  'a': 'ah',  'b': 'buh', 'c': 'kuh', 'd': 'duh', 'e': 'eh',
  'f': 'fuh', 'g': 'guh', 'h': 'huh', 'i': 'ih',  'j': 'juh',
  'k': 'kuh', 'l': 'luh', 'm': 'muh', 'n': 'nuh', 'o': 'oh',
  'p': 'puh', 'q': 'kwuh','r': 'ruh', 's': 'suh', 't': 'tuh',
  'u': 'uh',  'v': 'vuh', 'w': 'wuh', 'x': 'ks',  'y': 'yuh', 'z': 'zuh',
};
// Priority order:
//   1. Loaded audio file (assets/audio/phonemes/<ph>.mp3 etc.)
//   2. Web Speech API (TTS) — always available in modern browsers
//   3. Web Audio API tones — for SFX fallbacks
//
// HOW TO ADD YOUR AUDIO FILES (see full guide at bottom):
//   assets/audio/phonemes/<phoneme>.mp3   e.g. "sh.mp3", "ai.mp3"
//   assets/audio/words/<word>.mp3         e.g. "ship.mp3"
//   assets/audio/sfx/coin.mp3
//   assets/audio/sfx/boost.mp3
//   assets/audio/sfx/slash.mp3
//   assets/audio/sfx/boss-hit.mp3
//   assets/audio/sfx/victory.mp3
//   assets/audio/sfx/riku-hurt.mp3
// ============================================================

class AudioManager {
  constructor() {
    this.muted   = localStorage.getItem('samurice_muted') === 'true';
    this.buffers = {};      // key → AudioBuffer (decoded audio files)
    this.loading = {};      // key → Promise (prevents duplicate fetches)
    this.ctx     = null;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { /* audio not supported */ }

    // Preload SFX immediately (correct extensions per actual files)
    const sfxFiles = {
      'coin':      'assets/audio/sfx/coin.wav',
      'boost':     'assets/audio/sfx/boost.wav',
      'slash':     'assets/audio/sfx/slash.mp3',
      'boss-hit':  'assets/audio/sfx/boss-hit.wav',
      'victory':   'assets/audio/sfx/victory.wav',
      'riku-hurt': 'assets/audio/sfx/riku-hurt.wav',
      'jump':      'assets/audio/sfx/jump.wav',
      'stomp':     'assets/audio/sfx/stomp.wav',
    };
    this._sfxKeys = Object.keys(sfxFiles);
    this._sfxKeys.forEach(k => this._preload(`sfx/${k}`, sfxFiles[k]));

    // Music player (created after ctx)
    this._music = this.ctx ? new MusicPlayer(this.ctx) : null;
  }

  // ── Mute toggle ─────────────────────────────────────────────
  get isMuted() { return this.muted; }

  // ── Resume AudioContext (required after user gesture) ────────
  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Preload a single audio file into buffer cache ────────────
  _preload(key, url) {
    if (this.buffers[key] || this.loading[key]) return;
    this.loading[key] = fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => this.ctx ? this.ctx.decodeAudioData(ab) : null)
      .then(buf => { if (buf) this.buffers[key] = buf; })
      .catch(() => { /* file not uploaded yet — TTS fallback will handle */ });
  }

  // ── Preload all phonemes for a stage (call on stage start) ───
  preloadStage(stageId) {
    const stage = PHONICS_DATA.stageList[stageId - 1];
    const allPh = new Set();
    stage.words.forEach(w => w.phonemes.forEach(ph => allPh.add(ph)));
    allPh.forEach(ph => {
      const safe = ph.replace(/[^a-z]/gi, '').toLowerCase();
      this._preload(`ph_${safe}`, `assets/audio/phonemes/${safe}.mp3`);
    });
    stage.words.forEach(w => {
      this._preload(`word_${w.word}`, `assets/audio/words/${w.word}.mp3`);
    });
  }

  // ── Play a loaded buffer ─────────────────────────────────────
  _playBuffer(key, volume = 0.8) {
    if (this.muted || !this.ctx || !this.buffers[key]) return false;
    this._resume();
    const src  = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = this.buffers[key];
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
    return true;
  }

  // ── Web Audio API tone (SFX fallback) ───────────────────────
  _tone(freq, type = 'sine', dur = 0.15, vol = 0.3, delay = 0) {
    if (this.muted || !this.ctx) return;
    this._resume();
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // ── TTS speech fallback ──────────────────────────────────────
  _speak(text, rate = 0.85, pitch = 1.1) {
    if (this.muted || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate  = rate;
    u.pitch = pitch;
    // Prefer a child-friendly voice if available
    const voices = speechSynthesis.getVoices();
    const kid = voices.find(v => /Samantha|Karen|Moira|Tessa/i.test(v.name));
    if (kid) u.voice = kid;
    speechSynthesis.speak(u);
  }

  // ── PRIVATE: Play a single indivisible phoneme (no blend splitting) ─
  _playSinglePhoneme(phoneme) {
    const safe = phoneme.replace(/[^a-z]/gi, '').toLowerCase();
    const key  = `ph_${safe}`;
    if (!this._playBuffer(key)) {
      // Use phonetic sound ("kuh") not letter name ("see") for single letters
      const ttsText = (safe.length === 1 && LETTER_SOUNDS_TTS[safe])
                       ? LETTER_SOUNDS_TTS[safe]
                       : phoneme;
      this._speak(ttsText, 0.75, 1.2);
    }
  }

  // ── PUBLIC: Play a phoneme (hover / click on tile) ───────────
  // Consonant blends (bl, str, etc.) are played as consecutive letter
  // sounds 320 ms apart so learners hear each phoneme distinctly.
  playPhoneme(phoneme) {
    if (this.muted) return;
    const safe = phoneme.replace(/[^a-z]/gi, '').toLowerCase();
    if (CONSONANT_BLENDS.has(safe)) {
      // Split blend into individual letter sounds played in sequence
      safe.split('').forEach((letter, i) => {
        setTimeout(() => this._playSinglePhoneme(letter), i * 320);
      });
      return;
    }
    this._playSinglePhoneme(phoneme);
  }

  // ── PUBLIC: Play a full word ─────────────────────────────────
  playWord(word) {
    if (this.muted) return;
    const key = `word_${word}`;
    if (!this._playBuffer(key)) {
      this._speak(word, 0.8, 1.0);
    }
  }

  // ── PUBLIC: Segmented blend sequence then full word ──────────
  // Plays each phoneme 400ms apart, then the whole word 300ms after
  async playBlendSequence(phonemes, word) {
    if (this.muted) return;
    const PHONEME_GAP = 420;
    for (let i = 0; i < phonemes.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 0 : PHONEME_GAP));
      this.playPhoneme(phonemes[i]);
    }
    await new Promise(r => setTimeout(r, PHONEME_GAP + 200));
    this.playWord(word);
  }

  // ── SFX shortcuts ────────────────────────────────────────────
  sfxCoin()     { if (!this._playBuffer('sfx/coin'))     { this._tone(880, 'sine', 0.08, 0.25); this._tone(1100, 'sine', 0.06, 0.2, 0.07); } }
  sfxBoost()    { if (!this._playBuffer('sfx/boost'))    { [660,880,1100,1320].forEach((f,i) => this._tone(f,'sine',0.09,0.28,i*0.06)); } }
  sfxSlash()    { if (!this._playBuffer('sfx/slash'))    { this._tone(220,'sawtooth',0.12,0.5); this._tone(440,'sine',0.08,0.3,0.06); } }
  sfxBossHit()  { if (!this._playBuffer('sfx/boss-hit')) { this._tone(160,'sawtooth',0.18,0.55); this._tone(120,'square',0.1,0.4,0.1); } }
  sfxVictory()  { if (!this._playBuffer('sfx/victory'))  { [523,659,784,880,1047].forEach((f,i) => this._tone(f,'sine',0.18,0.4,i*0.13)); } }
  sfxHurt()     { if (!this._playBuffer('sfx/riku-hurt')){ this._tone(200,'square',0.14,0.45); } }
  sfxJump()     { if (!this._playBuffer('sfx/jump'))     { this._tone(520,'sine',0.1,0.3); this._tone(660,'sine',0.07,0.2,0.07); } }
  sfxStomp()    { if (!this._playBuffer('sfx/stomp'))    { this._tone(300,'square',0.1,0.4); this._tone(150,'sawtooth',0.08,0.3,0.06); } }
  sfxWrongBlend()  { this._tone(180,'sawtooth',0.2,0.4); }
  sfxGroundPound() { this._tone(70,'square',0.22,0.65); this._tone(170,'sawtooth',0.12,0.40,0.06); }
  sfxWallJump()    { this._tone(380,'triangle',0.10,0.30); this._tone(560,'sine',0.08,0.22,0.06); }
  sfxStarPower()   { [523,659,784,880,1047,1319].forEach((f,i) => this._tone(f,'sine',0.10,0.30,i*0.055)); }
  sfxSpring()      { this._tone(280,'sine',0.04,0.35); this._tone(540,'sine',0.07,0.30,0.05); this._tone(820,'sine',0.08,0.25,0.09); }
  sfxCheckpoint()  { [523,659,784].forEach((f,i) => this._tone(f,'sine',0.14,0.32,i*0.09)); }

  // ── NEW: Combo / power-up / achievement SFX ──────────────────
  sfxCombo(streak) {
    // Escalating rising arpeggio — higher streak = higher pitch
    const base = 400 + Math.min(streak, 20) * 30;
    [base, base*1.26, base*1.5, base*2].forEach((f,i) => this._tone(f,'sine',0.10,0.30,i*0.055));
  }
  sfxPerfectBlend() {
    // Epic perfect-hit fanfare: chord + shimmer
    [523,659,784,1047].forEach((f,i) => this._tone(f,'sine',0.22,0.38,i*0.04));
    setTimeout(() => [880,1100,1320].forEach((f,i) => this._tone(f,'sine',0.14,0.28,i*0.05)), 200);
  }
  sfxPowerupCollect() {
    [440,550,660,880].forEach((f,i) => this._tone(f,'triangle',0.14,0.32,i*0.06));
  }
  sfxAchievement() {
    [523,659,784,880,1047,1319,1568].forEach((f,i) => this._tone(f,'sine',0.16,0.35,i*0.07));
  }
  sfxGateWarning() {
    this._tone(220,'square',0.12,0.4); this._tone(220,'square',0.12,0.4,0.18);
  }
  sfxSlowMo() {
    // Whoosh-down effect
    if (!this.ctx) return; this._resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = 'sine';
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.6);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.start(t); osc.stop(t + 0.7);
  }
  sfxZoneChange() {
    [330,415,523,659].forEach((f,i) => this._tone(f,'triangle',0.18,0.30,i*0.09));
  }
  sfxGameOver() {
    // Descending defeated tones
    [400,320,250,180].forEach((f,i) => this._tone(f,'sawtooth',0.22,0.45,i*0.16));
  }
  sfxMagnet() {
    [440,480,520].forEach((f,i) => this._tone(f,'sine',0.08,0.18,i*0.04));
  }

  // ── Music control ─────────────────────────────────────────────
  startMusic(stageId) {
    if (this.muted || !this._music) return;
    this._resume();
    this._music.play(stageId);
  }
  startEndlessMusic() { this.startMusic(1); }
  stopMusic() { if (this._music) this._music.stop(); }

  speedUpMusic(factor) {
    // Increase BPM by adjusting the scheduler's internal tempo
    if (this._music) this._music.speedUp(factor);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('samurice_muted', this.muted);
    if (this.muted) {
      if (window.speechSynthesis) speechSynthesis.cancel();
      this.stopMusic();
    }
    return this.muted;
  }
}

// ─────────────────────────────────────────────────────────────
// MUSIC PLAYER — procedural chiptune stage music
// Schedules Web Audio API oscillators ahead of time via AudioContext.currentTime
// so there are zero gaps or glitches even at high CPU load.
// ─────────────────────────────────────────────────────────────
class MusicPlayer {
  // 6 stage configs. melody/bass are indices into scale[]; drums is a hit pattern.
  // The 8th-note grid has 16 steps per loop (2 bars of 8 eighth notes each).
  static STAGES = [
    // Stage 1 — CVC words: bright & simple (C major, 128 BPM)
    { bpm: 128, rootHz: 261.63, scale: [0,2,4,5,7,9,11],
      melody: [0,4,7,4, 5,4,2,0, 0,4,7,9, 7,5,4,2],
      bass:   [0,0,7,7, 5,5,4,4],
      drums:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
    // Stage 2 — digraphs sh/ch/th: swing feel (D pentatonic, 136 BPM)
    { bpm: 136, rootHz: 293.66, scale: [0,2,4,7,9],
      melody: [0,2,4,2, 4,3,2,0, 0,2,4,4, 3,2,0,2],
      bass:   [0,0,4,4, 2,2,3,3, 0,0,4,4, 2,2,3,3],
      drums:  [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0] },
    // Stage 3 — blends bl/cl/fl: energetic (E natural minor, 144 BPM)
    { bpm: 144, rootHz: 164.81, scale: [0,2,3,5,7,8,10],
      melody: [0,3,5,7, 5,3,2,0, 7,5,3,2, 0,3,7,5],
      bass:   [0,0,5,5, 3,3,7,7, 0,0,5,5, 3,3,7,7],
      drums:  [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0] },
    // Stage 4 — vowel teams ai/ee/oa: smooth (F major, 140 BPM)
    { bpm: 140, rootHz: 174.61, scale: [0,2,4,5,7,9,11],
      melody: [4,7,9,7, 5,4,2,0, 4,5,7,5, 2,4,5,4],
      bass:   [0,0,7,7, 5,5,2,2, 0,0,7,7, 5,5,2,2],
      drums:  [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1] },
    // Stage 5 — r-controlled: adventurous (G minor, 150 BPM)
    { bpm: 150, rootHz: 196.00, scale: [0,2,3,5,7,8,10],
      melody: [0,2,3,5, 7,8,7,5, 3,2,0,3, 5,7,5,3],
      bass:   [0,0,3,3, 7,7,5,5, 0,0,3,3, 7,7,5,5],
      drums:  [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1] },
    // Stage 6 — complex patterns: epic (A aeolian, 160 BPM)
    { bpm: 160, rootHz: 220.00, scale: [0,2,3,5,7,8,10],
      melody: [0,3,5,7, 8,7,5,3, 0,3,5,8, 7,5,3,0],
      bass:   [0,0,3,3, 7,7,5,5, 0,0,3,3, 7,7,5,5],
      drums:  [1,0,1,1, 1,1,1,0, 1,0,1,1, 1,1,1,0] },
  ];

  constructor(ctx) {
    this._ctx     = ctx;
    this._gain    = null;
    this._playing = false;
    this._beatIdx = 0;
    this._nextBeat = 0;
    this._cfg     = null;
    this._timer   = null;
    if (ctx) {
      this._gain = ctx.createGain();
      this._gain.gain.value = 0.20;
      this._gain.connect(ctx.destination);
    }
  }

  play(stageId) {
    if (!this._ctx) return;
    this.stop();
    this._cfg      = MusicPlayer.STAGES[Math.min(stageId - 1, 5)];
    this._bpmMult  = 1;
    this._playing  = true;
    this._beatIdx  = 0;
    this._nextBeat = this._ctx.currentTime + 0.08;
    this._schedule();
  }

  speedUp(mult) { this._bpmMult = Math.min(mult, 2.0); }

  stop() {
    this._playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  setVolume(v) {
    if (this._gain && this._ctx) {
      this._gain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, v)), this._ctx.currentTime + 0.15);
    }
  }

  _schedule() {
    if (!this._playing) return;
    const LOOKAHEAD = 0.18; // seconds of audio to schedule ahead
    const INTERVAL  = 55;   // ms between scheduler wakeups
    while (this._nextBeat < this._ctx.currentTime + LOOKAHEAD) {
      this._scheduleBeat(this._nextBeat);
      // Advance by one 8th-note duration (speed up with bpmMult)
      this._nextBeat += (60 / (this._cfg.bpm * (this._bpmMult || 1))) / 2;
      this._beatIdx   = (this._beatIdx + 1) % 16;
    }
    this._timer = setTimeout(() => this._schedule(), INTERVAL);
  }

  _scheduleBeat(t) {
    const { scale, melody, bass, drums, rootHz, bpm } = this._cfg;
    const bi      = this._beatIdx;
    const beatSec = 60 / bpm;

    // ── Melody (square wave, one octave above root) ──────────
    const mNote = melody[bi] % scale.length;
    const mHz   = rootHz * 2 * Math.pow(2, scale[mNote] / 12);
    this._playNote(mHz, 'square', beatSec * 0.40, 0.08, t);

    // ── Bass (triangle, one octave below root, every quarter note) ──
    if (bi % 2 === 0) {
      const bIdx = Math.floor(bi / 2) % bass.length;
      const bHz  = rootHz * 0.5 * Math.pow(2, scale[bass[bIdx] % scale.length] / 12);
      this._playNote(bHz, 'triangle', beatSec * 0.85, 0.13, t);
    }

    // ── Drums ────────────────────────────────────────────────
    if (drums[bi]) {
      const type = (bi === 0 || bi === 8)  ? 'kick'  :
                   (bi === 4 || bi === 12) ? 'snare' : 'hihat';
      this._playDrum(type, t);
    }
  }

  _playNote(hz, type, dur, vol, t) {
    if (!this._gain) return;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._gain);
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, 0.04));
    osc.start(t);
    osc.stop(t + Math.max(dur, 0.04) + 0.01);
  }

  _playDrum(type, t) {
    if (!this._gain) return;
    const gain = this._ctx.createGain();
    gain.connect(this._gain);
    if (type === 'kick') {
      const osc = this._ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
      gain.gain.setValueAtTime(0.42, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.start(t); osc.stop(t + 0.15);
    } else {
      // White noise buffer for snare / hi-hat
      const bufSize = Math.ceil(this._ctx.sampleRate * 0.12);
      const buf  = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      if (type === 'snare') {
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        src.start(t); src.stop(t + 0.12);
      } else { // hihat
        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
        src.start(t); src.stop(t + 0.03);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// HOW TO ADD YOUR AUDIO FILES
// ─────────────────────────────────────────────────────────────
//
// 1. PHONEME FILES → assets/audio/phonemes/<phoneme>.mp3
//    Filename = the grapheme, lowercase, letters only.
//    Examples:
//      "c" phoneme  → assets/audio/phonemes/c.mp3
//      "sh" phoneme → assets/audio/phonemes/sh.mp3
//      "ai" team    → assets/audio/phonemes/ai.mp3
//      "igh" pattern→ assets/audio/phonemes/igh.mp3
//
// 2. WORD FILES → assets/audio/words/<word>.mp3
//    Full pronunciation of the complete word.
//    Examples:
//      assets/audio/words/cat.mp3
//      assets/audio/words/ship.mp3
//      assets/audio/words/light.mp3
//
// 3. SFX FILES → assets/audio/sfx/<name>.mp3
//    coin.mp3      — coin collect ding
//    boost.mp3     — blend boost power-up
//    slash.mp3     — sword slash attack
//    boss-hit.mp3  — boss takes damage
//    victory.mp3   — stage complete fanfare
//    riku-hurt.mp3 — riku takes a hit
//    jump.mp3      — jump sound
//    stomp.mp3     — stomping a minion
//
// The game automatically tries the file first,
// then falls back to browser TTS / synthesized tones.
// ─────────────────────────────────────────────────────────────
