// ─────────────────────────────────────────────────────────────
// combat/patterns.js — one verb per phonics skill
//
// The problem this file exists to fix: the old battle had nine "mini-games"
// that all resolved to `{ answer, options }`. Segmenting a word, spotting a
// rhyme and counting sounds are three different things to think about, and
// the game asked for the same physical action for all of them — tap one of
// four. Content varied; play did not.
//
// So each pattern below is built around a different *verb*:
//
//   Blade Rush   slash the sounds in blend order, before they reach you
//   Sound Cleave cut a solid word apart at its sound boundaries
//   Sound Strike pick the sound in a named position out of a moving ring
//   Echo Duel    deflect the rhymes and deliberately let the others pass
//   Flash Guard  the word is shown then hidden; strike the shield that had it
//
// Echo Duel is the clearest example of why this matters: doing nothing is a
// required, correct response there. No amount of re-skinning a button grid
// produces that.
//
// Every pattern exposes the same small contract so the engine can drive it
// without knowing which one it has:
//
//   canBuild(word, ctx)          is this playable for this word?
//   build(word, ctx)             -> round state
//   skill(round)                 which phonics skill, for the coach
//   title / instruction(round)   what the child is told
//   targets(round)               live targets, for keyboard play
//   hitTest(round, x, y, L)      pointer -> target id
//   resolve(round, id)           -> { correct, complete, given, expected }
//   update(round, dt, env)       -> { breached?, complete?, expected? }
//   draw(round, ctx, env)
//   speak / hint / reveal        optional helpers
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  // ── Shared rune rendering ──────────────────────────────────
  // Every pattern draws the same physical object for "a sound", so a child
  // learns one visual vocabulary rather than five.
  function drawRune(ctx, x, y, r, text, opts = {}) {
    const { state = 'idle', glow = false, scale = 1 } = opts;
    const colors = {
      idle:   ['#2E4A8F', '#16224A'],
      next:   ['#FFB300', '#E65100'],
      done:   ['#43A047', '#1B5E20'],
      wrong:  ['#E53935', '#8E0000'],
      quiet:  ['#37474F', '#1C262B'],
    }[state] || ['#2E4A8F', '#16224A'];

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (glow && !root.LOW_FX) {
      ctx.shadowColor = colors[0];
      ctx.shadowBlur = 18;
    }
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.6, r * 0.42);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.round(r * 0.9)}px "Nunito", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 2);
    ctx.restore();
  }

  function hitRune(t, x, y, r) {
    return Math.abs(x - t.x) <= r * 1.15 && Math.abs(y - t.y) <= r;
  }

  // ═══════════════════════════════════════════════════════════
  // 1. BLADE RUSH — slash the sounds in blend order
  // ═══════════════════════════════════════════════════════════
  const bladeRush = {
    id: 'blade-rush',
    title: 'Blade Rush',
    howTo: 'The sounds of the word are scattered. Slash them in the order you say them — first sound first.',
    skills: ['oral-blend', 'blend', 'sight-word'],

    canBuild(word) { return (word.phonemes || []).length >= 2; },

    build(word, ctx) {
      const phonemes = word.phonemes.slice();
      // Positions are shuffled so the child has to find each sound by
      // reading it, not by sweeping left to right along the row.
      const slots = shuffle(phonemes.map((_, i) => i));
      const runes = phonemes.map((ph, i) => ({
        id: `r${i}`, ph, idx: i, slot: slots[i],
        alive: true, hitFx: 0, x: 0, y: 0, drift: 0,
      }));
      return { word, phonemes, runes, nextIdx: 0, cursor: 0, skill: 'oral-blend',
               speed: 0.10 + (ctx.phase - 1) * 0.05 };
    },

    skill(round) { return round.skill; },

    instruction(round) {
      return `Slash the sounds of "${round.word.word}" in order.`;
    },

    speak(round, audio) { audio.playWord(round.word.word); },

    hint(round) {
      const next = round.runes.find(r => r.idx === round.nextIdx && r.alive);
      if (next) next.hinted = 40;
    },

    reveal(round) { round.revealed = true; },

    _place(round, env) {
      const n = round.runes.length;
      const gap = env.field.w / (n + 1);
      for (const r of round.runes) {
        r.x = env.field.x + gap * (r.slot + 1) - r.drift;
        r.y = env.field.y + env.field.h * 0.5
            + Math.sin((env.age + r.slot * 30) * 0.05) * 10;
      }
    },

    targets(round) { return round.runes.filter(r => r.alive); },

    hitTest(round, x, y, L) {
      const r = Math.max(22, Math.round(L.H * 0.055));
      for (const t of round.runes) if (t.alive && hitRune(t, x, y, r)) return t.id;
      return null;
    },

    resolve(round, id) {
      const t = round.runes.find(r => r.id === id);
      if (!t || !t.alive) return null;
      if (t.idx === round.nextIdx) {
        t.alive = false; t.hitFx = 14;
        round.nextIdx++;
        return { correct: true, complete: round.nextIdx >= round.phonemes.length,
                 given: t.ph, expected: round.phonemes[round.nextIdx - 1] };
      }
      t.wrongFx = 16;
      return { correct: false, given: t.ph, expected: round.phonemes[round.nextIdx] };
    },

    update(round, dt, env) {
      this._place(round, env);
      for (const r of round.runes) {
        if (r.hinted > 0) r.hinted--;
        if (r.wrongFx > 0) r.wrongFx--;
        // Under time pressure the sounds close on the player. Relaxed mode
        // holds them still, so thinking time is never punished.
        if (!env.relaxed && r.alive) r.drift += round.speed * (env.phase * 0.6 + 0.7);
      }
      const next = round.runes.find(r => r.idx === round.nextIdx && r.alive);
      if (next && next.x < env.field.x - 30) {
        next.drift = 0;
        return { breached: true };
      }
      return {};
    },

    draw(round, ctx, env) {
      const r = Math.max(22, Math.round(env.H * 0.055));
      // Order track: shows what has been blended and what is still to come.
      ctx.save();
      ctx.font = `900 ${Math.round(r * 0.8)}px "Nunito", system-ui`;
      ctx.textAlign = 'center';
      // Show the word filling in, with a slot for every sound still to come,
      // so the child can see how far through the blend they are.
      const built = round.phonemes.slice(0, round.nextIdx).join('');
      const todo = round.phonemes.slice(round.nextIdx).map(() => '_').join(' ');
      const track = (built + (built && todo ? ' ' : '') + todo) || '_';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const bw = Math.max(120, ctx.measureText(track).width + 40);
      ctx.beginPath();
      ctx.roundRect(env.W / 2 - bw / 2, env.field.y - 44, bw, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#FFD54F';
      ctx.fillText(track, env.W / 2, env.field.y - 20);
      ctx.restore();

      for (const t of round.runes) {
        if (!t.alive) continue;
        const isNext = t.idx === round.nextIdx;
        drawRune(ctx, t.x, t.y, r, t.ph, {
          state: t.wrongFx > 0 ? 'wrong' : (round.revealed && isNext) || t.hinted > 0 ? 'next' : 'idle',
          glow: t.hinted > 0 || (round.revealed && isNext),
          scale: t.wrongFx > 0 ? 1 + t.wrongFx * 0.01 : 1,
        });
      }
    },
  };

  // ═══════════════════════════════════════════════════════════
  // 2. SOUND CLEAVE — cut the word apart at its sound boundaries
  // ═══════════════════════════════════════════════════════════
  const soundCleave = {
    id: 'sound-cleave',
    title: 'Sound Cleave',
    howTo: 'The word is one solid block. Swipe down where one sound ends and the next begins.',
    skills: ['segment-it', 'sound-count'],

    canBuild(word) {
      const ph = word.phonemes || [];
      // Only meaningful when the sounds actually spell the word: sight words
      // like "to" (/t/ /oo/) have no letter boundary to cut at.
      return ph.length >= 2 && ph.join('') === String(word.word).toLowerCase();
    },

    build(word) {
      const phonemes = word.phonemes.slice();
      const letters = String(word.word).toLowerCase().split('');
      const boundaries = [];
      let at = 0;
      for (let i = 0; i < phonemes.length - 1; i++) {
        at += phonemes[i].length;
        boundaries.push(at);
      }
      return { word, phonemes, letters, boundaries, cuts: [], cursor: 0,
               skill: 'segment-it', wrongAt: null, wrongFx: 0 };
    },

    skill(round) { return round.skill; },

    instruction(round) {
      return `Cut "${round.word.word}" between its sounds.`;
    },

    speak(round, audio) { audio.playWord(round.word.word); },

    hint(round) { round.hinted = 60; },
    reveal(round) { round.revealed = true; },

    _geom(round, env) {
      const n = round.letters.length;
      const cw = Math.min(Math.round(env.field.w / (n + 1)), Math.round(env.H * 0.14));
      const totalW = cw * n;
      const x0 = env.W / 2 - totalW / 2;
      const y = env.field.y + env.field.h * 0.45;
      return { cw, x0, y, h: Math.round(cw * 1.25) };
    },

    /** Gaps are the targets here — the spaces between letters, not letters. */
    targets(round) {
      return round.letters.slice(1).map((_, i) => ({
        id: `g${i + 1}`, gap: i + 1, x: round._gx ? round._gx[i + 1] : 0, y: round._gy || 0,
      }));
    },

    hitTest(round, x, y, L) {
      const g = this._geom(round, L);
      if (Math.abs(y - g.y) > g.h) return null;
      // Nearest gap to the swipe/tap, so a slightly-off cut still lands.
      let best = null, bestD = Infinity;
      for (let i = 1; i < round.letters.length; i++) {
        const gx = g.x0 + g.cw * i;
        const d = Math.abs(x - gx);
        if (d < bestD) { bestD = d; best = i; }
      }
      return bestD <= g.cw * 0.6 ? `g${best}` : null;
    },

    onSwipe(round, start, end, L) {
      // A cut is a swipe across the word; use its midpoint to choose the gap.
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const id = this.hitTest(round, mid.x, mid.y, L);
      return id ? this.resolve(round, id) : null;
    },

    resolve(round, id) {
      const gap = Number(String(id).slice(1));
      if (round.cuts.includes(gap)) return null;
      if (round.boundaries.includes(gap)) {
        round.cuts.push(gap);
        const complete = round.cuts.length === round.boundaries.length;
        return { correct: true, complete,
                 given: this._asKey(round, round.cuts),
                 expected: round.phonemes.join('|') };
      }
      round.wrongAt = gap; round.wrongFx = 20;
      return { correct: false,
               given: this._asKey(round, [...round.cuts, gap]),
               expected: round.phonemes.join('|') };
    },

    /** Render the current cuts as a phoneme-style key so the coach can read it. */
    _asKey(round, cuts) {
      const sorted = [...new Set(cuts)].sort((a, b) => a - b);
      const parts = [];
      let prev = 0;
      for (const c of sorted) { parts.push(round.letters.slice(prev, c).join('')); prev = c; }
      parts.push(round.letters.slice(prev).join(''));
      return parts.filter(Boolean).join('|');
    },

    update(round) {
      if (round.wrongFx > 0 && --round.wrongFx === 0) round.wrongAt = null;
      if (round.hinted > 0) round.hinted--;
      return {};
    },

    draw(round, ctx, env) {
      const g = this._geom(round, env);
      round._gx = round.letters.map((_, i) => g.x0 + g.cw * i);
      round._gy = g.y;

      // The word as one solid block, split visibly wherever it has been cut.
      for (let i = 0; i < round.letters.length; i++) {
        const cutBefore = round.cuts.includes(i);
        const x = g.x0 + g.cw * i + (round.cuts.filter(c => c <= i).length * 6);
        ctx.save();
        const grad = ctx.createLinearGradient(0, g.y - g.h / 2, 0, g.y + g.h / 2);
        grad.addColorStop(0, '#3E5AA8'); grad.addColorStop(1, '#1B2749');
        ctx.fillStyle = grad;
        ctx.strokeStyle = cutBefore ? '#FFD54F' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x + 2, g.y - g.h / 2, g.cw - 4, g.h, 8);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.round(g.cw * 0.62)}px "Nunito", system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(round.letters[i], x + g.cw / 2, g.y);
        ctx.restore();
      }

      // Guide marks for where a cut may go.
      for (let i = 1; i < round.letters.length; i++) {
        const shown = round.hinted > 0 || round.revealed;
        const isBoundary = round.boundaries.includes(i);
        if (round.cuts.includes(i)) continue;
        const x = g.x0 + g.cw * i + (round.cuts.filter(c => c <= i).length * 6);
        ctx.save();
        // These marks are the affordance for the whole mechanic — if a child
        // cannot see where a cut may go, the swipe has nothing to aim at.
        ctx.globalAlpha = round.wrongAt === i ? 1 : shown && isBoundary ? 0.95 : 0.6;
        ctx.strokeStyle = round.wrongAt === i ? '#E53935'
                        : shown && isBoundary ? '#FFD54F' : '#9FD2FF';
        ctx.lineWidth = round.wrongAt === i ? 4 : 3;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(x, g.y - g.h / 2 - 8);
        ctx.lineTo(x, g.y + g.h / 2 + 8);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Nunito", system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const left = round.boundaries.length - round.cuts.length;
      ctx.fillText(left > 0
        ? `${round.phonemes.length} sounds — ${left} cut${left === 1 ? '' : 's'} to go`
        : `${round.phonemes.length} sounds`,
        env.W / 2, g.y + g.h / 2 + 34);
      ctx.restore();
    },
  };

  // ═══════════════════════════════════════════════════════════
  // 3. SOUND STRIKE — the sound in a named position, out of a moving ring
  // ═══════════════════════════════════════════════════════════
  const soundStrike = {
    id: 'sound-strike',
    title: 'Sound Strike',
    howTo: 'The sounds circle the boss. Strike the one in the position you are asked for.',
    skills: ['first', 'last', 'middle', 'letter-sound'],

    canBuild(word, ctx) {
      const n = (word.phonemes || []).length;
      return ctx.which === 'middle' ? n >= 3 : n >= 2;
    },

    build(word, ctx) {
      const phonemes = word.phonemes.slice();
      const which = ctx.which || 'first';
      const answerIdx = which === 'first' ? 0
        : which === 'last' ? phonemes.length - 1
        : Math.floor(phonemes.length / 2);
      const runes = phonemes.map((ph, i) => ({
        id: `s${i}`, ph, idx: i,
        angle: (i / phonemes.length) * TAU, wrongFx: 0,
        x: 0, y: 0,
      }));
      return { word, phonemes, which, answerIdx, runes, cursor: 0, skill: which,
               spin: 0.006 + (ctx.phase - 1) * 0.004 };
    },

    skill(round) { return round.skill; },

    instruction(round) {
      const w = round.which;
      return `Strike the ${w} sound in "${round.word.word}".`;
    },

    speak(round, audio) { audio.playWord(round.word.word); },
    hint(round) { round.hinted = 50; },
    reveal(round) { round.revealed = true; },

    targets(round) { return round.runes; },

    hitTest(round, x, y, L) {
      const r = Math.max(22, Math.round(L.H * 0.055));
      for (const t of round.runes) if (hitRune(t, x, y, r)) return t.id;
      return null;
    },

    resolve(round, id) {
      const t = round.runes.find(r => r.id === id);
      if (!t) return null;
      if (t.idx === round.answerIdx) {
        return { correct: true, complete: true, given: t.ph,
                 expected: round.phonemes[round.answerIdx] };
      }
      t.wrongFx = 16;
      return { correct: false, given: t.ph, expected: round.phonemes[round.answerIdx] };
    },

    update(round, dt, env) {
      // The ring turns, so the answer is not a fixed slot on screen. In
      // relaxed mode it turns slowly rather than stopping, which keeps the
      // scene alive without ever taking the answer away from a slow reader.
      const speed = env.relaxed ? round.spin * 0.35 : round.spin;
      const cx = env.W * 0.52, cy = env.field.y + env.field.h * 0.5;
      const rad = Math.min(env.field.w * 0.24, env.field.h * 0.62);
      for (const t of round.runes) {
        t.angle += speed;
        t.x = cx + Math.cos(t.angle) * rad;
        t.y = cy + Math.sin(t.angle) * rad * 0.55;
        if (t.wrongFx > 0) t.wrongFx--;
      }
      if (round.hinted > 0) round.hinted--;
      return {};
    },

    draw(round, ctx, env) {
      const r = Math.max(22, Math.round(env.H * 0.055));
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      const cx = env.W * 0.52, cy = env.field.y + env.field.h * 0.5;
      const rad = Math.min(env.field.w * 0.24, env.field.h * 0.62);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // Runes further "back" on the ellipse draw smaller, so the ring reads
      // as a ring rather than a flat scatter of tiles.
      const sorted = [...round.runes].sort((a, b) => a.y - b.y);
      for (const t of sorted) {
        const depth = 0.86 + ((t.y - cy) / (rad * 0.55)) * 0.14;
        const show = round.revealed || round.hinted > 0;
        drawRune(ctx, t.x, t.y, r, t.ph, {
          state: t.wrongFx > 0 ? 'wrong'
               : show && t.idx === round.answerIdx ? 'next' : 'idle',
          glow: show && t.idx === round.answerIdx,
          scale: depth,
        });
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 17px "Nunito", system-ui';
      ctx.fillStyle = '#EAF2FF';
      ctx.fillText(round.which.toUpperCase() + ' SOUND', cx, env.field.y - 12);
      ctx.restore();
    },
  };

  // ═══════════════════════════════════════════════════════════
  // 4. ECHO DUEL — deflect the rhymes, let the rest pass
  // ═══════════════════════════════════════════════════════════
  const echoDuel = {
    id: 'echo-duel',
    title: 'Echo Duel',
    howTo: 'Words fly at you. Slash the ones that rhyme — and let the ones that do not fly straight past.',
    skills: ['rhyme'],

    _rime(w) {
      const s = String(w).toLowerCase();
      const i = s.search(/[aeiou]/);
      return i < 0 ? s : s.slice(i);
    },

    canBuild(word, ctx) {
      const rime = this._rime(word.word);
      const pool = (ctx.words || []).filter(w => w.word !== word.word);
      const rhymes = pool.filter(w => this._rime(w.word) === rime);
      const others = pool.filter(w => this._rime(w.word) !== rime);
      return rhymes.length >= 1 && others.length >= 1;
    },

    build(word, ctx) {
      const rime = this._rime(word.word);
      const pool = (ctx.words || []).filter(w => w.word !== word.word);
      const rhymes = shuffle(pool.filter(w => this._rime(w.word) === rime)).slice(0, 2);
      const others = shuffle(pool.filter(w => this._rime(w.word) !== rime)).slice(0, 3);
      const stones = shuffle([...rhymes, ...others]).map((w, i) => ({
        id: `e${i}`, word: w.word, rhymes: this._rime(w.word) === rime,
        lane: i, t: -i * 0.22, alive: true, judged: false, wrongFx: 0, x: 0, y: 0,
      }));
      return { word, stones, cursor: 0, skill: 'rhyme',
               needed: stones.filter(s => s.rhymes).length, got: 0,
               speed: (0.0035 + (ctx.phase - 1) * 0.0012) };
    },

    skill(round) { return round.skill; },

    instruction(round) {
      return `Slash the words that rhyme with "${round.word.word}". Let the others fly past.`;
    },

    speak(round, audio) { audio.playWord(round.word.word); },
    hint(round) { round.hinted = 70; },
    reveal(round) { round.revealed = true; },

    targets(round) { return round.stones.filter(s => s.alive && !s.judged); },

    hitTest(round, x, y, L) {
      const h = Math.max(20, Math.round(L.H * 0.05));
      for (const t of round.stones) {
        if (!t.alive || t.judged) continue;
        if (Math.abs(x - t.x) <= t.w / 2 + 6 && Math.abs(y - t.y) <= h) return t.id;
      }
      return null;
    },

    resolve(round, id) {
      const t = round.stones.find(s => s.id === id);
      if (!t || t.judged) return null;
      t.judged = true;
      if (t.rhymes) {
        t.alive = false;
        round.got++;
        return { correct: true, complete: this._settled(round),
                 given: t.word, expected: round.word.word };
      }
      // Slashing a non-rhyme is the mistake this pattern exists to surface.
      t.wrongFx = 20;
      return { correct: false, given: t.word, expected: round.word.word };
    },

    _settled(round) {
      return round.stones.every(s => s.judged || !s.alive) ||
             round.got >= round.needed && round.stones.every(s => !s.rhymes || !s.alive);
    },

    update(round, dt, env) {
      if (round.hinted > 0) round.hinted--;
      const speed = env.relaxed ? round.speed * 0.45 : round.speed * (0.8 + env.phase * 0.25);
      let breached = false;
      for (const t of round.stones) {
        if (t.wrongFx > 0) t.wrongFx--;
        if (!t.alive) continue;
        t.t += speed;
        t.x = env.field.x + env.field.w * (1 - Math.max(0, t.t));
        const lanes = round.stones.length;
        t.y = env.field.y + env.field.h * ((t.lane + 0.5) / lanes);
        if (t.t >= 1) {
          t.alive = false;
          // Letting a rhyme through is a miss; letting a non-rhyme through is
          // exactly right, and is the only way to "answer" by not acting.
          if (t.rhymes && !t.judged) breached = true;
          else if (!t.rhymes && !t.judged) t.judged = true;
        }
      }
      if (breached) return { breached: true };
      if (this._settled(round)) {
        return { complete: true, expected: round.word.word };
      }
      return {};
    },

    draw(round, ctx, env) {
      ctx.save();
      ctx.font = `900 ${Math.max(15, Math.round(env.H * 0.042))}px "Nunito", system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of round.stones) {
        if (!t.alive) continue;
        const w = ctx.measureText(t.word).width + 28;
        t.w = w;
        const show = round.revealed || round.hinted > 0;
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.wrongFx > 0) ctx.rotate(Math.sin(t.wrongFx) * 0.08);
        const g = ctx.createLinearGradient(0, -20, 0, 20);
        if (t.wrongFx > 0) { g.addColorStop(0, '#E53935'); g.addColorStop(1, '#8E0000'); }
        else if (show && t.rhymes) { g.addColorStop(0, '#FFB300'); g.addColorStop(1, '#E65100'); }
        else { g.addColorStop(0, '#37507F'); g.addColorStop(1, '#141E3C'); }
        ctx.fillStyle = g;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -20, w, 40, 14);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(t.word, 0, 1);
        ctx.restore();
      }
      // Target word anchor, so the thing being rhymed against stays visible.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const tw = ctx.measureText(round.word.word).width + 46;
      ctx.beginPath();
      ctx.roundRect(env.W / 2 - tw / 2, env.field.y - 46, tw, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#FFD54F';
      ctx.font = '900 19px "Nunito", system-ui';
      ctx.fillText(`rhymes with ${round.word.word}`, env.W / 2, env.field.y - 29);
      ctx.restore();
    },
  };

  // ═══════════════════════════════════════════════════════════
  // 5. FLASH GUARD — the word is shown, then hidden; strike where it was
  // ═══════════════════════════════════════════════════════════
  const flashGuard = {
    id: 'flash-guard',
    title: 'Flash Guard',
    howTo: 'Watch the word flash, then strike the shield carrying it.',
    skills: ['sight-word'],

    canBuild(word, ctx) { return (ctx.words || []).length >= 3; },

    build(word, ctx) {
      const others = shuffle((ctx.words || []).filter(w => w.word !== word.word)).slice(0, 2);
      const shields = shuffle([word, ...others]).map((w, i) => ({
        id: `f${i}`, word: w.word, correct: w.word === word.word, wrongFx: 0, x: 0, y: 0,
      }));
      return { word, shields, cursor: 0, skill: 'sight-word', flash: 90 };
    },

    skill(round) { return round.skill; },

    instruction(round) {
      return `Remember "${round.word.word}" — then strike the shield that carries it.`;
    },

    speak(round, audio) { audio.playWord(round.word.word); },
    hint(round) { round.hinted = 45; },
    reveal(round) { round.revealed = true; },

    targets(round) { return round.shields; },

    hitTest(round, x, y, L) {
      const h = Math.round(L.H * 0.12);
      for (const t of round.shields) {
        if (Math.abs(x - t.x) <= t.w / 2 && Math.abs(y - t.y) <= h / 2) return t.id;
      }
      return null;
    },

    resolve(round, id) {
      const t = round.shields.find(s => s.id === id);
      if (!t) return null;
      if (t.correct) return { correct: true, complete: true, given: t.word, expected: round.word.word };
      t.wrongFx = 16;
      return { correct: false, given: t.word, expected: round.word.word };
    },

    update(round) {
      if (round.flash > 0) round.flash--;
      if (round.hinted > 0) round.hinted--;
      for (const s of round.shields) if (s.wrongFx > 0) s.wrongFx--;
      return {};
    },

    draw(round, ctx, env) {
      const n = round.shields.length;
      const gap = env.field.w / n;
      const h = Math.round(env.H * 0.12);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      round.shields.forEach((s, i) => {
        s.x = env.field.x + gap * i + gap / 2;
        s.y = env.field.y + env.field.h * 0.55;
        s.w = Math.min(gap - 16, env.W * 0.24);
        const show = round.flash > 0 || round.revealed || round.hinted > 0;
        ctx.save();
        ctx.translate(s.x, s.y);
        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        if (s.wrongFx > 0) { g.addColorStop(0, '#E53935'); g.addColorStop(1, '#8E0000'); }
        else { g.addColorStop(0, '#3E5AA8'); g.addColorStop(1, '#1B2749'); }
        ctx.fillStyle = g;
        ctx.strokeStyle = show && s.correct ? '#FFD54F' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = show && s.correct ? 4 : 2;
        ctx.beginPath();
        ctx.roundRect(-s.w / 2, -h / 2, s.w, h, 14);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.round(h * 0.32)}px "Nunito", system-ui`;
        // The words stay readable; what the flash hides is which one to pick.
        ctx.fillText(s.word, 0, 0);
        ctx.restore();
      });
      if (round.flash > 0) {
        ctx.fillStyle = '#FFD54F';
        ctx.font = '900 22px "Nunito", system-ui';
        ctx.fillText(round.word.word, env.W / 2, env.field.y - 20);
      }
      ctx.restore();
    },
  };

  // ── Registry ───────────────────────────────────────────────
  const ALL = [bladeRush, soundCleave, soundStrike, echoDuel, flashGuard];

  // Which pattern plays a given curriculum activity. Several activities share
  // a pattern where the verb genuinely is the same thing.
  const BY_SKILL = {
    'oral-blend':  [bladeRush],
    'blend':       [bladeRush],
    'segment-it':  [soundCleave],
    'sound-count': [soundCleave],
    'first':       [soundStrike],
    'last':        [soundStrike],
    'middle':      [soundStrike],
    'letter-sound': [soundStrike],
    'rhyme':       [echoDuel],
    'sight-word':  [flashGuard, bladeRush],
  };

  /**
   * Choose a playable pattern for this word from the stage's activities.
   * Falls back through the stage's other skills, then to Blade Rush, so a
   * word that cannot support its nominated activity still gets a fight.
   */
  function build(skills, word, ctx = {}) {
    const order = shuffle(skills.slice());
    for (const skill of order) {
      for (const pattern of (BY_SKILL[skill] || [])) {
        const pctx = { ...ctx, which: skill };
        if (!pattern.canBuild(word, pctx)) continue;
        const round = pattern.build(word, { phase: 1, ...pctx });
        round.skill = round.skill || skill;
        return { pattern, round };
      }
    }
    if (bladeRush.canBuild(word, ctx)) {
      return { pattern: bladeRush, round: bladeRush.build(word, { phase: 1, ...ctx }) };
    }
    return null;
  }

  const api = { build, ALL, BY_SKILL, drawRune,
                bladeRush, soundCleave, soundStrike, echoDuel, flashGuard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CombatPatterns = api;
})(typeof window !== 'undefined' ? window : globalThis);
