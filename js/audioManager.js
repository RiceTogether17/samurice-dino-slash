'use strict';
// ============================================================
// AUDIO MANAGER — js/audioManager.js
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
  }

  // ── Mute toggle ─────────────────────────────────────────────
  get isMuted() { return this.muted; }
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('samurice_muted', this.muted);
    if (this.muted && window.speechSynthesis) speechSynthesis.cancel();
    return this.muted;
  }

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

  // ── PUBLIC: Play a phoneme (hover / click on tile) ───────────
  playPhoneme(phoneme) {
    if (this.muted) return;
    const safe = phoneme.replace(/[^a-z]/gi, '').toLowerCase();
    const key  = `ph_${safe}`;
    if (!this._playBuffer(key)) {
      // TTS fallback: speak letter name for single chars, raw for clusters
      this._speak(phoneme, 0.75, 1.2);
    }
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
  sfxWrongBlend(){ this._tone(180,'sawtooth',0.2,0.4); }
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
