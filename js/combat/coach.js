// ─────────────────────────────────────────────────────────────
// combat/coach.js — what to say when a child gets it wrong
//
// Modelled on the teaching ladder in the PhonicsQuest feedback system: the
// thing a teacher never does is hand over the answer on the first mistake
// with nothing in between. The old battle did exactly that — a wrong tap
// produced "Blend failed!" and moved on, which tells a child they failed
// without telling them anything they can use.
//
//   1st miss  -> coach    a cue, and what to listen for. No answer.
//   2nd miss  -> reteach  name the actual slip, give the rule, then the answer.
//   correct   -> praise   one line of *why* it worked.
//
// Diagnosis works off the phoneme data itself rather than hand-authored
// strings, so every word in the curriculum is covered, not the handful
// somebody remembered to write notes for.
// ─────────────────────────────────────────────────────────────
(function (root) {
  'use strict';

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  const DIGRAPHS = new Set(['sh', 'ch', 'th', 'wh', 'ph', 'ck', 'ng', 'qu']);

  const say = ph => `/${ph}/`;

  // ── Misconceptions ─────────────────────────────────────────
  // Each carries the pieces the ladder needs at different moments. `cue` is
  // the one that makes this teaching rather than an answer key: it has to be
  // useful while the answer is still hidden.
  const MISCONCEPTIONS = {
    'order': {
      label: 'Blend order',
      child: 'putting the sounds in a different order',
      cue: 'You found the right sounds. Now say them left to right.',
      rule: 'Sounds go in the same order as the letters, first to last.',
    },
    'vowel-swap': {
      label: 'Short vowel confusion',
      child: 'picking a near-neighbour vowel sound',
      cue: 'Listen to the middle again. The mouth shape is different.',
      rule: 'Short vowels sit in the middle of the word and change its meaning.',
    },
    'digraph-split': {
      label: 'Digraph split',
      child: 'splitting two letters that make one sound',
      cue: 'Those two letters are working together as one sound.',
      rule: 'sh, ch, th and wh each make a single sound, not two.',
    },
    'position': {
      label: 'Sound position',
      child: 'grabbing a sound from the wrong end of the word',
      cue: 'Say the whole word slowly and stop at the part being asked for.',
      rule: 'First is where you start, last is where you stop, middle is between.',
    },
    'counted-letters': {
      label: 'Letters counted as sounds',
      child: 'counting letters instead of sounds',
      cue: 'Some letters team up. Count the sounds you say, not the letters you see.',
      rule: 'A word can have more letters than sounds.',
    },
    'rhyme-onset': {
      label: 'Rhyme vs first sound',
      child: 'matching the start of the word instead of the end',
      cue: 'Rhyming words end the same. Listen to the ending, not the beginning.',
      rule: 'Words rhyme when their endings match.',
    },
    'near-miss': {
      label: 'Close attempt',
      child: 'being one sound away',
      cue: 'Very close. One sound is not quite right, so say it slowly again.',
      rule: 'Check each sound in turn, left to right.',
    },
    'general': {
      label: 'Needs another look',
      child: 'not matching this one yet',
      cue: 'Have another listen, then try again.',
      rule: 'Take the word one sound at a time.',
    },
  };

  // ── Diagnosis ──────────────────────────────────────────────
  /**
   * Work out which misconception fits, from the data rather than a lookup
   * table of authored notes.
   *
   * @param {object} a
   * @param {string} a.skill        the activity being played
   * @param {*}      a.given        what the child chose
   * @param {*}      a.correct      what was wanted
   * @param {string[]} [a.phonemes] the target word's sounds
   * @param {string} [a.word]       the target word
   */
  function diagnose({ skill, given, correct, phonemes = [], word = '' } = {}) {
    const g = given == null ? '' : String(given).toLowerCase();
    const c = correct == null ? '' : String(correct).toLowerCase();

    if (skill === 'sound-count') {
      const letters = String(word).length;
      // Choosing the letter count is the classic slip here, and it is a
      // different mistake from simply miscounting.
      if (Number(g) === letters && letters !== Number(c)) return key('counted-letters');
      return key('near-miss');
    }

    if (skill === 'segment-it') {
      const gParts = g.split('|').filter(Boolean);
      const cParts = c.split('|').filter(Boolean);
      if (gParts.length > cParts.length &&
          cParts.some(p => DIGRAPHS.has(p))) return key('digraph-split');
      if (sameMultiset(gParts, cParts)) return key('order');
      return key('near-miss');
    }

    if (skill === 'rhyme') {
      // Sharing an opening sound but not an ending is the trap distractor.
      if (g && c && word && g[0] === String(word)[0]) return key('rhyme-onset');
      return key('near-miss');
    }

    if (skill === 'first' || skill === 'last' || skill === 'middle') {
      if (phonemes.includes(g) && g !== c) return key('position');
      return key('near-miss');
    }

    if (VOWELS.has(g) && VOWELS.has(c)) return key('vowel-swap');
    if (g && c && sameMultiset(g.split(''), c.split(''))) return key('order');
    if (g && c && editDistance(g, c) === 1) return key('near-miss');
    return key('general');
  }

  function key(k) { return { key: k, ...MISCONCEPTIONS[k] }; }

  function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    return [...a].sort().join(' ') === [...b].sort().join(' ');
  }

  function editDistance(a, b) {
    // Only ever called on short words; a full row-pair walk is fine and
    // clearer than a banded implementation.
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      }
      prev = cur;
    }
    return prev[n];
  }

  // ── The ladder ─────────────────────────────────────────────
  /**
   * @param {number} attempt how many times this round has already been missed
   * @returns {{stage:string, text:string, reveal:boolean, misconception:object}}
   */
  function respond({ attempt = 1, skill, given, correct, phonemes = [], word = '' } = {}) {
    const m = diagnose({ skill, given, correct, phonemes, word });

    if (attempt <= 1) {
      return { stage: 'coach', reveal: false, misconception: m, text: m.cue };
    }
    const answer = Array.isArray(correct) ? correct.join('') : String(correct);
    return {
      stage: 'reteach',
      reveal: true,
      misconception: m,
      text: `${m.rule} ${word ? `${word} is ` : ''}${answerText(answer, phonemes, skill)}`,
    };
  }

  function answerText(answer, phonemes, skill) {
    if (skill === 'sound-count') return `${answer} sounds.`;
    if (skill === 'segment-it' && phonemes.length) return `${phonemes.map(say).join(' + ')}.`;
    return `${answer}.`;
  }

  /** One line of why a correct answer works, rather than only a tick. */
  function praise({ skill, word = '', phonemes = [], correct = '' } = {}) {
    switch (skill) {
      case 'segment-it':
        return `${word} = ${phonemes.map(say).join(' + ')}`;
      case 'sound-count':
        return `${word} has ${phonemes.length} sounds, even with ${String(word).length} letters.`;
      case 'rhyme':
        return `${word} and ${correct} end the same way.`;
      case 'first':  return `${word} starts with ${say(correct)}.`;
      case 'last':   return `${word} ends with ${say(correct)}.`;
      case 'middle': return `${say(correct)} is right in the middle of ${word}.`;
      case 'letter-sound': return `${correct} makes the ${say(correct)} sound.`;
      default:
        return phonemes.length
          ? `${phonemes.map(say).join(' + ')} = ${word}`
          : `${word} — got it.`;
    }
  }

  const api = { respond, praise, diagnose, MISCONCEPTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Coach = api;
})(typeof window !== 'undefined' ? window : globalThis);
