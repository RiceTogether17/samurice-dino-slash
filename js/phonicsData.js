'use strict';
// ============================================================
// PHONICS DATA — js/phonicsData.js
// 6 Stages · 90 Words · Progressive short-vowel curriculum
//
// Stage 1: Short-a CVC   (a as in "cat")
// Stage 2: Short-e CVC   (e as in "bed")
// Stage 3: Short-i CVC   (i as in "sit")
// Stage 4: Short-o CVC   (o as in "dog")
// Stage 5: Short-u CVC   (u as in "cup")
// Stage 6: Consonant Blends (bl, cl, fl, sl, cr, dr, fr, gr, tr, sp, sn, st, sw)
// ============================================================
//
// Word object shape:
//   { word: "cat", phonemes: ["c","a","t"], damage: 14, hint: "🐱" }
//
// phonemes[] = grapheme chunks shown on tiles (one tile per entry).
// damage    = HP removed from boss per correct blend.
// hint      = emoji shown as the picture-word scaffold for the child.
// ============================================================

const PHONICS_DATA = {

  // ── STAGE 1 ── Short-a CVC ──────────────────────────────────
  // Introduce the short-a sound: /æ/ as in "cat".
  // All words follow consonant-vowel-consonant pattern.
  stage1: {
    id: 1,
    name: "Rice Paddy Valley",
    pattern: "Short-a Words",
    patternDesc: "short 'a' · cat · bat · fan · map",
    bg: "stage-1-rice-paddy",
    bossFile: "stage-1-rex",
    bossName: "Rex the Rapscallion",
    bossHp: 120,
    bossAttack: 14,
    minionFile: "stage-1-tri",
    skyColor: ["#87CEEB", "#c5e8f8"],
    groundColor: "#5a8a3c",
    accentColor: "#ff6b35",
    runnerSpeed: 3.2,
    words: [
      { word: "cat",  phonemes: ["c","a","t"],  damage: 14, hint: "🐱" },
      { word: "bat",  phonemes: ["b","a","t"],  damage: 14, hint: "🦇" },
      { word: "hat",  phonemes: ["h","a","t"],  damage: 14, hint: "🎩" },
      { word: "mat",  phonemes: ["m","a","t"],  damage: 14, hint: "🛏️" },
      { word: "rat",  phonemes: ["r","a","t"],  damage: 14, hint: "🐀" },
      { word: "fan",  phonemes: ["f","a","n"],  damage: 14, hint: "🌬️" },
      { word: "man",  phonemes: ["m","a","n"],  damage: 14, hint: "🧑" },
      { word: "can",  phonemes: ["c","a","n"],  damage: 14, hint: "🥫" },
      { word: "pan",  phonemes: ["p","a","n"],  damage: 14, hint: "🍳" },
      { word: "ran",  phonemes: ["r","a","n"],  damage: 14, hint: "🏃" },
      { word: "cap",  phonemes: ["c","a","p"],  damage: 14, hint: "🧢" },
      { word: "map",  phonemes: ["m","a","p"],  damage: 14, hint: "🗺️" },
      { word: "tap",  phonemes: ["t","a","p"],  damage: 14, hint: "🚰" },
      { word: "bag",  phonemes: ["b","a","g"],  damage: 14, hint: "👜" },
      { word: "sad",  phonemes: ["s","a","d"],  damage: 14, hint: "😢" },
    ],
  },

  // ── STAGE 2 ── Short-e CVC ──────────────────────────────────
  // Introduce the short-e sound: /ɛ/ as in "bed".
  stage2: {
    id: 2,
    name: "Bamboo Dojo Forest",
    pattern: "Short-e Words",
    patternDesc: "short 'e' · bed · pet · ten · leg",
    bg: "stage-2-bamboo",
    bossFile: "stage-2-rapi",
    bossName: "Rapi the Ruthless",
    bossHp: 130,
    bossAttack: 15,
    minionFile: "stage-2-stego",
    skyColor: ["#4CAF50", "#81C784"],
    groundColor: "#2E7D32",
    accentColor: "#8BC34A",
    runnerSpeed: 3.6,
    words: [
      { word: "bed",  phonemes: ["b","e","d"],  damage: 15, hint: "🛏️" },
      { word: "red",  phonemes: ["r","e","d"],  damage: 15, hint: "🔴" },
      { word: "pet",  phonemes: ["p","e","t"],  damage: 15, hint: "🐾" },
      { word: "wet",  phonemes: ["w","e","t"],  damage: 15, hint: "💧" },
      { word: "set",  phonemes: ["s","e","t"],  damage: 15, hint: "⚙️" },
      { word: "ten",  phonemes: ["t","e","n"],  damage: 15, hint: "🔟" },
      { word: "hen",  phonemes: ["h","e","n"],  damage: 15, hint: "🐔" },
      { word: "pen",  phonemes: ["p","e","n"],  damage: 15, hint: "🖊️" },
      { word: "den",  phonemes: ["d","e","n"],  damage: 15, hint: "🦁" },
      { word: "net",  phonemes: ["n","e","t"],  damage: 15, hint: "🥅" },
      { word: "leg",  phonemes: ["l","e","g"],  damage: 15, hint: "🦵" },
      { word: "beg",  phonemes: ["b","e","g"],  damage: 15, hint: "🙏" },
      { word: "peg",  phonemes: ["p","e","g"],  damage: 15, hint: "📌" },
      { word: "web",  phonemes: ["w","e","b"],  damage: 15, hint: "🕸️" },
      { word: "gem",  phonemes: ["g","e","m"],  damage: 15, hint: "💎" },
    ],
  },

  // ── STAGE 3 ── Short-i CVC ──────────────────────────────────
  // Introduce the short-i sound: /ɪ/ as in "sit".
  stage3: {
    id: 3,
    name: "Cherry Blossom Temple",
    pattern: "Short-i Words",
    patternDesc: "short 'i' · sit · bit · win · pig",
    bg: "stage-3-cherry-temple",
    bossFile: "stage-3-brachio",
    bossName: "Brachio the Bold",
    bossHp: 140,
    bossAttack: 16,
    minionFile: "stage-3-ptera",
    skyColor: ["#FFB7C5", "#FF69B4"],
    groundColor: "#C2185B",
    accentColor: "#FF80AB",
    runnerSpeed: 4.0,
    words: [
      { word: "sit",  phonemes: ["s","i","t"],  damage: 16, hint: "🪑" },
      { word: "bit",  phonemes: ["b","i","t"],  damage: 16, hint: "🦷" },
      { word: "hit",  phonemes: ["h","i","t"],  damage: 16, hint: "⚔️" },
      { word: "pit",  phonemes: ["p","i","t"],  damage: 16, hint: "🕳️" },
      { word: "win",  phonemes: ["w","i","n"],  damage: 16, hint: "🏆" },
      { word: "bin",  phonemes: ["b","i","n"],  damage: 16, hint: "🗑️" },
      { word: "tin",  phonemes: ["t","i","n"],  damage: 16, hint: "🥫" },
      { word: "lip",  phonemes: ["l","i","p"],  damage: 16, hint: "💋" },
      { word: "dip",  phonemes: ["d","i","p"],  damage: 16, hint: "🫁" },
      { word: "tip",  phonemes: ["t","i","p"],  damage: 16, hint: "💡" },
      { word: "dig",  phonemes: ["d","i","g"],  damage: 16, hint: "⛏️" },
      { word: "big",  phonemes: ["b","i","g"],  damage: 16, hint: "🐘" },
      { word: "pig",  phonemes: ["p","i","g"],  damage: 16, hint: "🐷" },
      { word: "mix",  phonemes: ["m","i","x"],  damage: 16, hint: "🥣" },
      { word: "fix",  phonemes: ["f","i","x"],  damage: 16, hint: "🔧" },
    ],
  },

  // ── STAGE 4 ── Short-o CVC ──────────────────────────────────
  // Introduce the short-o sound: /ɒ/ as in "dog".
  stage4: {
    id: 4,
    name: "Ancient Rice Ruins",
    pattern: "Short-o Words",
    patternDesc: "short 'o' · dog · hot · hop · log",
    bg: "stage-4-ruins",
    bossFile: "stage-4-anky",
    bossName: "Anky the Armored",
    bossHp: 150,
    bossAttack: 17,
    minionFile: "stage-4-anky",
    skyColor: ["#795548", "#a1887f"],
    groundColor: "#4E342E",
    accentColor: "#FF9800",
    runnerSpeed: 4.2,
    words: [
      { word: "hot",  phonemes: ["h","o","t"],  damage: 17, hint: "🔥" },
      { word: "dog",  phonemes: ["d","o","g"],  damage: 17, hint: "🐶" },
      { word: "hop",  phonemes: ["h","o","p"],  damage: 17, hint: "🐸" },
      { word: "top",  phonemes: ["t","o","p"],  damage: 17, hint: "🔝" },
      { word: "fog",  phonemes: ["f","o","g"],  damage: 17, hint: "🌫️" },
      { word: "log",  phonemes: ["l","o","g"],  damage: 17, hint: "🪵" },
      { word: "dot",  phonemes: ["d","o","t"],  damage: 17, hint: "⚫" },
      { word: "got",  phonemes: ["g","o","t"],  damage: 17, hint: "✅" },
      { word: "pot",  phonemes: ["p","o","t"],  damage: 17, hint: "🍯" },
      { word: "mop",  phonemes: ["m","o","p"],  damage: 17, hint: "🧹" },
      { word: "cop",  phonemes: ["c","o","p"],  damage: 17, hint: "👮" },
      { word: "sob",  phonemes: ["s","o","b"],  damage: 17, hint: "😭" },
      { word: "job",  phonemes: ["j","o","b"],  damage: 17, hint: "💼" },
      { word: "box",  phonemes: ["b","o","x"],  damage: 17, hint: "📦" },
      { word: "cob",  phonemes: ["c","o","b"],  damage: 17, hint: "🌽" },
    ],
  },

  // ── STAGE 5 ── Short-u CVC ──────────────────────────────────
  // Introduce the short-u sound: /ʌ/ as in "cup".
  stage5: {
    id: 5,
    name: "Mountain Rice Terraces",
    pattern: "Short-u Words",
    patternDesc: "short 'u' · cup · bug · fun · run",
    bg: "stage-5-mountain-terraces",
    bossFile: "stage-5-spino",
    bossName: "Spino the Spinner",
    bossHp: 160,
    bossAttack: 18,
    minionFile: "stage-5-pachy",
    skyColor: ["#1565C0", "#42A5F5"],
    groundColor: "#1B5E20",
    accentColor: "#4CAF50",
    runnerSpeed: 4.5,
    words: [
      { word: "cup",  phonemes: ["c","u","p"],  damage: 18, hint: "☕" },
      { word: "bug",  phonemes: ["b","u","g"],  damage: 18, hint: "🐛" },
      { word: "fun",  phonemes: ["f","u","n"],  damage: 18, hint: "🎉" },
      { word: "tug",  phonemes: ["t","u","g"],  damage: 18, hint: "💪" },
      { word: "run",  phonemes: ["r","u","n"],  damage: 18, hint: "🏃" },
      { word: "mud",  phonemes: ["m","u","d"],  damage: 18, hint: "🌧️" },
      { word: "sun",  phonemes: ["s","u","n"],  damage: 18, hint: "☀️" },
      { word: "bun",  phonemes: ["b","u","n"],  damage: 18, hint: "🍞" },
      { word: "cut",  phonemes: ["c","u","t"],  damage: 18, hint: "✂️" },
      { word: "hug",  phonemes: ["h","u","g"],  damage: 18, hint: "🤗" },
      { word: "gut",  phonemes: ["g","u","t"],  damage: 18, hint: "🫃" },
      { word: "hut",  phonemes: ["h","u","t"],  damage: 18, hint: "🛖" },
      { word: "nut",  phonemes: ["n","u","t"],  damage: 18, hint: "🥜" },
      { word: "dug",  phonemes: ["d","u","g"],  damage: 18, hint: "⛏️" },
      { word: "mug",  phonemes: ["m","u","g"],  damage: 18, hint: "🫖" },
    ],
  },

  // ── STAGE 6 ── Consonant Blends ─────────────────────────────
  // Two consonants blend together at the start of the word.
  // bl, cl, fl, pl, sl · cr, dr, fr, gr, tr · sn, sp, st, sw, bl
  stage6: {
    id: 6,
    name: "Volcanic Samurai Peak",
    pattern: "Consonant Blends",
    patternDesc: "bl · cl · fl · cr · dr · sn · st — two sounds together!",
    bg: "stage-6-volcanic",
    bossFile: "stage-6-dilo",
    bossName: "Dilo the Destroyer",
    bossHp: 180,
    bossAttack: 20,
    minionFile: "stage-6-dilo",
    skyColor: ["#212121", "#B71C1C"],
    groundColor: "#880E4F",
    accentColor: "#FF6F00",
    runnerSpeed: 5.0,
    words: [
      { word: "clap",  phonemes: ["cl","a","p"],  damage: 22, hint: "👏" },
      { word: "flag",  phonemes: ["fl","a","g"],  damage: 22, hint: "🚩" },
      { word: "glad",  phonemes: ["gl","a","d"],  damage: 22, hint: "😄" },
      { word: "plan",  phonemes: ["pl","a","n"],  damage: 22, hint: "📋" },
      { word: "crab",  phonemes: ["cr","a","b"],  damage: 24, hint: "🦀" },
      { word: "drip",  phonemes: ["dr","i","p"],  damage: 22, hint: "💧" },
      { word: "frog",  phonemes: ["fr","o","g"],  damage: 24, hint: "🐸" },
      { word: "grin",  phonemes: ["gr","i","n"],  damage: 22, hint: "😁" },
      { word: "trip",  phonemes: ["tr","i","p"],  damage: 24, hint: "🧳" },
      { word: "slip",  phonemes: ["sl","i","p"],  damage: 22, hint: "🫨" },
      { word: "snap",  phonemes: ["sn","a","p"],  damage: 24, hint: "🫰" },
      { word: "spin",  phonemes: ["sp","i","n"],  damage: 24, hint: "🌀" },
      { word: "step",  phonemes: ["st","e","p"],  damage: 24, hint: "👟" },
      { word: "swim",  phonemes: ["sw","i","m"],  damage: 24, hint: "🏊" },
      { word: "blob",  phonemes: ["bl","o","b"],  damage: 22, hint: "🫧" },
    ],
  },
};

// ── Ordered array for easy stage iteration ───────────────────
PHONICS_DATA.stageList = [
  PHONICS_DATA.stage1,
  PHONICS_DATA.stage2,
  PHONICS_DATA.stage3,
  PHONICS_DATA.stage4,
  PHONICS_DATA.stage5,
  PHONICS_DATA.stage6,
];

// ── Runner coin sets per stage (first 5 words used in runner) ─
// Each coin set is a flattened list: {phoneme, wordId, phIdx, hint}
PHONICS_DATA.getRunnerCoins = function(stageId) {
  const stage = PHONICS_DATA.stageList[stageId - 1];
  const selected = stage.words.slice(0, 5);   // first 5 words in runner
  const coins = [];
  selected.forEach((w, wIdx) => {
    w.phonemes.forEach((ph, pIdx) => {
      coins.push({ phoneme: ph, wordId: wIdx, phIdx: pIdx, hint: w.hint, word: w.word });
    });
  });
  return coins; // ordered list; runner spawns them in this order
};

// ── Battle word pool (all 15 words available in boss fight) ──
PHONICS_DATA.getBattleWords = function(stageId) {
  return PHONICS_DATA.stageList[stageId - 1].words;
};
