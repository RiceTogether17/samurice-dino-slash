'use strict';
// ============================================================
// PHONICS DATA — js/phonicsData.js
// 6 Stages · 150 Words · Real phonics curriculum progression
// CVC → Blends → Digraphs → Magic-e → Vowel Teams → Advanced
// ============================================================
//
// Word object shape:
//   { word: "cat", phonemes: ["c","a","t"], damage: 30, hint: "🐱" }
//
// phonemes[] = grapheme chunks shown on tiles (one tile per entry).
// damage    = base HP removed from boss on successful blend.
// hint      = emoji clue shown near tiles to scaffold younger players.
// ============================================================

const PHONICS_DATA = {

  // ── STAGE 1 ── CVC Words ────────────────────────────────────
  // Each sound is a single letter. Perfect intro to phoneme
  // segmentation: consonant → vowel → consonant.
  stage1: {
    id: 1,
    name: "Rice Paddy Valley",
    pattern: "CVC Words",
    patternDesc: "consonant · vowel · consonant",
    bg: "stage-1-rice-paddy",
    bossFile: "stage-1-rex",
    bossName: "Rex the Rapscallion",
    bossHp: 120,
    bossAttack: 18,
    minionFile: "stage-1-tri",
    skyColor: ["#87CEEB", "#c5e8f8"],
    groundColor: "#5a8a3c",
    accentColor: "#ff6b35",
    runnerSpeed: 3.2,
    words: [
      { word: "cat",  phonemes: ["c","a","t"],  damage: 28, hint: "🐱" },
      { word: "dog",  phonemes: ["d","o","g"],  damage: 28, hint: "🐶" },
      { word: "hot",  phonemes: ["h","o","t"],  damage: 30, hint: "🔥" },
      { word: "bed",  phonemes: ["b","e","d"],  damage: 28, hint: "🛏️" },
      { word: "sit",  phonemes: ["s","i","t"],  damage: 28, hint: "🪑" },
      { word: "cup",  phonemes: ["c","u","p"],  damage: 30, hint: "☕" },
      { word: "big",  phonemes: ["b","i","g"],  damage: 30, hint: "🐘" },
      { word: "fun",  phonemes: ["f","u","n"],  damage: 28, hint: "🎉" },
      { word: "map",  phonemes: ["m","a","p"],  damage: 28, hint: "🗺️" },
      { word: "ran",  phonemes: ["r","a","n"],  damage: 28, hint: "🏃" },
      { word: "hit",  phonemes: ["h","i","t"],  damage: 30, hint: "⚔️" },
      { word: "hop",  phonemes: ["h","o","p"],  damage: 28, hint: "🐸" },
      { word: "wet",  phonemes: ["w","e","t"],  damage: 28, hint: "💧" },
      { word: "fog",  phonemes: ["f","o","g"],  damage: 28, hint: "🌫️" },
      { word: "dig",  phonemes: ["d","i","g"],  damage: 30, hint: "⛏️" },
      { word: "leg",  phonemes: ["l","e","g"],  damage: 28, hint: "🦵" },
      { word: "pet",  phonemes: ["p","e","t"],  damage: 28, hint: "🐾" },
      { word: "nap",  phonemes: ["n","a","p"],  damage: 28, hint: "😴" },
      { word: "sob",  phonemes: ["s","o","b"],  damage: 28, hint: "😢" },
      { word: "tug",  phonemes: ["t","u","g"],  damage: 30, hint: "💪" },
      { word: "van",  phonemes: ["v","a","n"],  damage: 28, hint: "🚐" },
      { word: "fix",  phonemes: ["f","i","x"],  damage: 32, hint: "🔧" },
      { word: "zip",  phonemes: ["z","i","p"],  damage: 30, hint: "🤐" },
      { word: "jot",  phonemes: ["j","o","t"],  damage: 28, hint: "📝" },
      { word: "yam",  phonemes: ["y","a","m"],  damage: 28, hint: "🍠" },
    ],
  },

  // ── STAGE 2 ── Consonant Blends ─────────────────────────────
  // Initial consonant clusters: bl, cl, fl, sl, br, cr, dr, fr,
  // gr, pr, tr, sp, sn, st, sw. Two letters make one blended sound.
  stage2: {
    id: 2,
    name: "Bamboo Dojo Forest",
    pattern: "Consonant Blends",
    patternDesc: "two consonants blend together at the start",
    bg: "stage-2-bamboo",
    bossFile: "stage-2-rapi",
    bossName: "Rapi the Ruthless",
    bossHp: 150,
    bossAttack: 22,
    minionFile: "stage-2-stego",
    skyColor: ["#4CAF50", "#81C784"],
    groundColor: "#2E7D32",
    accentColor: "#8BC34A",
    runnerSpeed: 3.6,
    words: [
      { word: "clap",  phonemes: ["cl","a","p"],   damage: 36, hint: "👏" },
      { word: "flag",  phonemes: ["fl","a","g"],   damage: 36, hint: "🚩" },
      { word: "glad",  phonemes: ["gl","a","d"],   damage: 36, hint: "😄" },
      { word: "plan",  phonemes: ["pl","a","n"],   damage: 36, hint: "📋" },
      { word: "slip",  phonemes: ["sl","i","p"],   damage: 36, hint: "🫨" },
      { word: "crab",  phonemes: ["cr","a","b"],   damage: 38, hint: "🦀" },
      { word: "drip",  phonemes: ["dr","i","p"],   damage: 36, hint: "💧" },
      { word: "frog",  phonemes: ["fr","o","g"],   damage: 38, hint: "🐸" },
      { word: "grin",  phonemes: ["gr","i","n"],   damage: 36, hint: "😁" },
      { word: "trip",  phonemes: ["tr","i","p"],   damage: 38, hint: "🧳" },
      { word: "blob",  phonemes: ["bl","o","b"],   damage: 36, hint: "🫧" },
      { word: "blur",  phonemes: ["bl","u","r"],   damage: 36, hint: "💨" },
      { word: "club",  phonemes: ["cl","u","b"],   damage: 38, hint: "🏌️" },
      { word: "plug",  phonemes: ["pl","u","g"],   damage: 36, hint: "🔌" },
      { word: "snap",  phonemes: ["sn","a","p"],   damage: 38, hint: "🫰" },
      { word: "crop",  phonemes: ["cr","o","p"],   damage: 36, hint: "🌾" },
      { word: "drop",  phonemes: ["dr","o","p"],   damage: 36, hint: "🫳" },
      { word: "grip",  phonemes: ["gr","i","p"],   damage: 38, hint: "✊" },
      { word: "slim",  phonemes: ["sl","i","m"],   damage: 36, hint: "📏" },
      { word: "spin",  phonemes: ["sp","i","n"],   damage: 38, hint: "🌀" },
      { word: "step",  phonemes: ["st","e","p"],   damage: 38, hint: "👟" },
      { word: "swim",  phonemes: ["sw","i","m"],   damage: 38, hint: "🏊" },
      { word: "brag",  phonemes: ["br","a","g"],   damage: 36, hint: "😤" },
      { word: "flop",  phonemes: ["fl","o","p"],   damage: 36, hint: "😩" },
      { word: "pram",  phonemes: ["pr","a","m"],   damage: 36, hint: "🛒" },
    ],
  },

  // ── STAGE 3 ── Digraphs ─────────────────────────────────────
  // Two letters that make ONE new sound: sh, ch, th, wh, ph.
  // Crucial pattern — "sh" is not "s"+"h", it's a brand-new sound.
  stage3: {
    id: 3,
    name: "Cherry Blossom Temple",
    pattern: "Digraphs",
    patternDesc: "sh · ch · th · wh — two letters, one sound",
    bg: "stage-3-cherry-temple",
    bossFile: "stage-3-brachio",
    bossName: "Brachio the Bold",
    bossHp: 180,
    bossAttack: 26,
    minionFile: "stage-3-ptera",
    skyColor: ["#FFB7C5", "#FF69B4"],
    groundColor: "#C2185B",
    accentColor: "#FF80AB",
    runnerSpeed: 4.0,
    words: [
      { word: "ship",  phonemes: ["sh","i","p"],   damage: 44, hint: "🚢" },
      { word: "chin",  phonemes: ["ch","i","n"],   damage: 42, hint: "🫲" },
      { word: "thin",  phonemes: ["th","i","n"],   damage: 42, hint: "📏" },
      { word: "when",  phonemes: ["wh","e","n"],   damage: 42, hint: "⏰" },
      { word: "shop",  phonemes: ["sh","o","p"],   damage: 44, hint: "🛍️" },
      { word: "chop",  phonemes: ["ch","o","p"],   damage: 44, hint: "🪓" },
      { word: "them",  phonemes: ["th","e","m"],   damage: 42, hint: "👥" },
      { word: "shed",  phonemes: ["sh","e","d"],   damage: 44, hint: "🏚️" },
      { word: "chat",  phonemes: ["ch","a","t"],   damage: 42, hint: "💬" },
      { word: "that",  phonemes: ["th","a","t"],   damage: 42, hint: "👆" },
      { word: "whip",  phonemes: ["wh","i","p"],   damage: 42, hint: "🥄" },
      { word: "shot",  phonemes: ["sh","o","t"],   damage: 44, hint: "🎯" },
      { word: "wish",  phonemes: ["w","i","sh"],   damage: 44, hint: "⭐" },
      { word: "fish",  phonemes: ["f","i","sh"],   damage: 44, hint: "🐟" },
      { word: "dish",  phonemes: ["d","i","sh"],   damage: 44, hint: "🍽️" },
      { word: "rush",  phonemes: ["r","u","sh"],   damage: 44, hint: "💨" },
      { word: "lash",  phonemes: ["l","a","sh"],   damage: 44, hint: "⚔️" },
      { word: "cash",  phonemes: ["c","a","sh"],   damage: 44, hint: "💰" },
      { word: "gush",  phonemes: ["g","u","sh"],   damage: 44, hint: "🌊" },
      { word: "bash",  phonemes: ["b","a","sh"],   damage: 44, hint: "💥" },
      { word: "rash",  phonemes: ["r","a","sh"],   damage: 42, hint: "⚡" },
      { word: "moth",  phonemes: ["m","o","th"],   damage: 44, hint: "🦋" },
      { word: "with",  phonemes: ["w","i","th"],   damage: 42, hint: "🤝" },
      { word: "both",  phonemes: ["b","o","th"],   damage: 42, hint: "✌️" },
      { word: "path",  phonemes: ["p","a","th"],   damage: 44, hint: "🛤️" },
    ],
  },

  // ── STAGE 4 ── Magic-e (Silent-e / VCe) ─────────────────────
  // The 'e' at the end changes the vowel to say its name.
  // "cap" → "cape" · "bit" → "bite" · "hop" → "hope"
  stage4: {
    id: 4,
    name: "Ancient Rice Ruins",
    pattern: "Magic-e Words",
    patternDesc: "the silent-e makes the vowel say its name",
    bg: "stage-4-ruins",
    bossFile: "stage-4-anky",
    bossName: "Anky the Armored",
    bossHp: 210,
    bossAttack: 30,
    minionFile: "stage-4-anky",
    skyColor: ["#795548", "#a1887f"],
    groundColor: "#4E342E",
    accentColor: "#FF9800",
    runnerSpeed: 4.2,
    words: [
      { word: "cake",  phonemes: ["c","a","k","e"],  damage: 50, hint: "🎂" },
      { word: "bike",  phonemes: ["b","i","k","e"],  damage: 50, hint: "🚲" },
      { word: "hope",  phonemes: ["h","o","p","e"],  damage: 50, hint: "⭐" },
      { word: "tube",  phonemes: ["t","u","b","e"],  damage: 50, hint: "🧪" },
      { word: "pine",  phonemes: ["p","i","n","e"],  damage: 50, hint: "🌲" },
      { word: "made",  phonemes: ["m","a","d","e"],  damage: 50, hint: "✨" },
      { word: "hike",  phonemes: ["h","i","k","e"],  damage: 52, hint: "🥾" },
      { word: "mole",  phonemes: ["m","o","l","e"],  damage: 50, hint: "🦔" },
      { word: "dune",  phonemes: ["d","u","n","e"],  damage: 50, hint: "🏜️" },
      { word: "wine",  phonemes: ["w","i","n","e"],  damage: 50, hint: "🍷" },
      { word: "cape",  phonemes: ["c","a","p","e"],  damage: 50, hint: "🦸" },
      { word: "hide",  phonemes: ["h","i","d","e"],  damage: 52, hint: "🫣" },
      { word: "bone",  phonemes: ["b","o","n","e"],  damage: 50, hint: "🦴" },
      { word: "cute",  phonemes: ["c","u","t","e"],  damage: 50, hint: "🥰" },
      { word: "dive",  phonemes: ["d","i","v","e"],  damage: 52, hint: "🏊" },
      { word: "fate",  phonemes: ["f","a","t","e"],  damage: 50, hint: "🎲" },
      { word: "hole",  phonemes: ["h","o","l","e"],  damage: 50, hint: "🕳️" },
      { word: "home",  phonemes: ["h","o","m","e"],  damage: 50, hint: "🏠" },
      { word: "late",  phonemes: ["l","a","t","e"],  damage: 50, hint: "⏰" },
      { word: "ride",  phonemes: ["r","i","d","e"],  damage: 52, hint: "🎠" },
      { word: "kite",  phonemes: ["k","i","t","e"],  damage: 50, hint: "🪁" },
      { word: "tone",  phonemes: ["t","o","n","e"],  damage: 50, hint: "🔔" },
      { word: "vine",  phonemes: ["v","i","n","e"],  damage: 50, hint: "🌿" },
      { word: "rose",  phonemes: ["r","o","s","e"],  damage: 50, hint: "🌹" },
      { word: "page",  phonemes: ["p","a","g","e"],  damage: 50, hint: "📄" },
    ],
  },

  // ── STAGE 5 ── Vowel Teams ───────────────────────────────────
  // Two vowels together make one long vowel sound.
  // ai, ea, oa, ee, oo, ay, ou — "when two vowels go walking,
  // the first one does the talking."
  stage5: {
    id: 5,
    name: "Mountain Rice Terraces",
    pattern: "Vowel Teams",
    patternDesc: "ai · ea · oa · ee · oo — two vowels, one long sound",
    bg: "stage-5-mountain-terraces",
    bossFile: "stage-5-spino",
    bossName: "Spino the Spinner",
    bossHp: 240,
    bossAttack: 34,
    minionFile: "stage-5-pachy",
    skyColor: ["#1565C0", "#42A5F5"],
    groundColor: "#1B5E20",
    accentColor: "#4CAF50",
    runnerSpeed: 4.5,
    words: [
      { word: "rain",  phonemes: ["r","ai","n"],    damage: 58, hint: "🌧️" },
      { word: "team",  phonemes: ["t","ea","m"],    damage: 58, hint: "👥" },
      { word: "load",  phonemes: ["l","oa","d"],    damage: 58, hint: "📦" },
      { word: "feet",  phonemes: ["f","ee","t"],    damage: 58, hint: "🦶" },
      { word: "moon",  phonemes: ["m","oo","n"],    damage: 60, hint: "🌙" },
      { word: "sail",  phonemes: ["s","ai","l"],    damage: 58, hint: "⛵" },
      { word: "meat",  phonemes: ["m","ea","t"],    damage: 58, hint: "🥩" },
      { word: "road",  phonemes: ["r","oa","d"],    damage: 58, hint: "🛣️" },
      { word: "seed",  phonemes: ["s","ee","d"],    damage: 58, hint: "🌱" },
      { word: "tool",  phonemes: ["t","oo","l"],    damage: 60, hint: "🔧" },
      { word: "tail",  phonemes: ["t","ai","l"],    damage: 58, hint: "🦊" },
      { word: "lean",  phonemes: ["l","ea","n"],    damage: 58, hint: "💪" },
      { word: "coat",  phonemes: ["c","oa","t"],    damage: 58, hint: "🧥" },
      { word: "need",  phonemes: ["n","ee","d"],    damage: 58, hint: "🙏" },
      { word: "cool",  phonemes: ["c","oo","l"],    damage: 60, hint: "😎" },
      { word: "main",  phonemes: ["m","ai","n"],    damage: 58, hint: "⭐" },
      { word: "heat",  phonemes: ["h","ea","t"],    damage: 58, hint: "🌡️" },
      { word: "foam",  phonemes: ["f","oa","m"],    damage: 58, hint: "🫧" },
      { word: "keep",  phonemes: ["k","ee","p"],    damage: 58, hint: "🔐" },
      { word: "pool",  phonemes: ["p","oo","l"],    damage: 60, hint: "🏊" },
      { word: "fail",  phonemes: ["f","ai","l"],    damage: 58, hint: "❌" },
      { word: "bead",  phonemes: ["b","ea","d"],    damage: 58, hint: "📿" },
      { word: "loan",  phonemes: ["l","oa","n"],    damage: 58, hint: "💸" },
      { word: "peek",  phonemes: ["p","ee","k"],    damage: 58, hint: "👀" },
      { word: "good",  phonemes: ["g","oo","d"],    damage: 60, hint: "✅" },
    ],
  },

  // ── STAGE 6 ── Advanced Patterns ────────────────────────────
  // Complex graphemes: igh, ough, dge, tch, wr, kn — patterns
  // that appear frequently but have irregular correspondences.
  stage6: {
    id: 6,
    name: "Volcanic Samurai Peak",
    pattern: "Advanced Patterns",
    patternDesc: "igh · ough · dge · tch · wr · kn — expert spellings",
    bg: "stage-6-volcanic",
    bossFile: "stage-6-dilo",
    bossName: "Dilo the Destroyer",
    bossHp: 280,
    bossAttack: 40,
    minionFile: "stage-6-dilo",
    skyColor: ["#212121", "#B71C1C"],
    groundColor: "#880E4F",
    accentColor: "#FF6F00",
    runnerSpeed: 5.0,
    words: [
      { word: "light",   phonemes: ["l","igh","t"],      damage: 68, hint: "💡" },
      { word: "night",   phonemes: ["n","igh","t"],      damage: 68, hint: "🌙" },
      { word: "right",   phonemes: ["r","igh","t"],      damage: 68, hint: "✅" },
      { word: "bright",  phonemes: ["br","igh","t"],     damage: 72, hint: "☀️" },
      { word: "fight",   phonemes: ["f","igh","t"],      damage: 68, hint: "⚔️" },
      { word: "might",   phonemes: ["m","igh","t"],      damage: 68, hint: "💪" },
      { word: "sight",   phonemes: ["s","igh","t"],      damage: 68, hint: "👁️" },
      { word: "tight",   phonemes: ["t","igh","t"],      damage: 68, hint: "🤐" },
      { word: "fright",  phonemes: ["fr","igh","t"],     damage: 72, hint: "😱" },
      { word: "caught",  phonemes: ["c","augh","t"],     damage: 70, hint: "🪤" },
      { word: "taught",  phonemes: ["t","augh","t"],     damage: 70, hint: "📚" },
      { word: "bought",  phonemes: ["b","ough","t"],     damage: 70, hint: "🛒" },
      { word: "though",  phonemes: ["th","ough"],        damage: 68, hint: "🤔" },
      { word: "fudge",   phonemes: ["f","u","dge"],      damage: 68, hint: "🍫" },
      { word: "bridge",  phonemes: ["br","i","dge"],     damage: 72, hint: "🌉" },
      { word: "badge",   phonemes: ["b","a","dge"],      damage: 68, hint: "🏅" },
      { word: "lodge",   phonemes: ["l","o","dge"],      damage: 68, hint: "🏕️" },
      { word: "witch",   phonemes: ["w","i","tch"],      damage: 68, hint: "🧙" },
      { word: "batch",   phonemes: ["b","a","tch"],      damage: 68, hint: "🧁" },
      { word: "fetch",   phonemes: ["f","e","tch"],      damage: 68, hint: "🐕" },
      { word: "match",   phonemes: ["m","a","tch"],      damage: 68, hint: "🔥" },
      { word: "notch",   phonemes: ["n","o","tch"],      damage: 68, hint: "✂️" },
      { word: "watch",   phonemes: ["w","a","tch"],      damage: 70, hint: "⌚" },
      { word: "wreck",   phonemes: ["wr","e","ck"],      damage: 70, hint: "💥" },
      { word: "kneel",   phonemes: ["kn","ee","l"],      damage: 72, hint: "🙏" },
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

// ── Runner coin sets per stage (5 words used in runner) ──────
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

// ── Battle word pool (all 25 words available in boss fight) ──
PHONICS_DATA.getBattleWords = function(stageId) {
  return PHONICS_DATA.stageList[stageId - 1].words;
};
