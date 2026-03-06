'use strict';
// === CHANGE LOG ===
// Step 4 (Progression & Content): expanded phonics content with
// long-vowel, sight-word, and multisyllabic category packs.
// ============================================================
// PHONICS DATA — js/phonicsData.js
// Campaign stages (6) + Endless mode tiers + Daily challenge sets
// ============================================================

const PHONICS_DATA = {

  // ── STAGE 1 ── Short-a CVC ──────────────────────────────────
  stage1: {
    id: 1, name: "Rice Paddy Valley",
    pattern: "Short-a Words", patternDesc: "short 'a' · cat · bat · fan · map",
    bg: "stage-1-rice-paddy", bossFile: "stage-1-rex", bossName: "Rex the Rapscallion",
    blendTime: 26, bossHp: 120, bossAttack: 14, minionFile: "stage-1-tri",
    skyColor: ["#87CEEB","#c5e8f8"], groundColor: "#5a8a3c", accentColor: "#ff6b35",
    runnerSpeed: 3.2,
    words: [
      { word:"cat",  phonemes:["c","a","t"],  damage:14, hint:"🐱" },
      { word:"bat",  phonemes:["b","a","t"],  damage:14, hint:"🦇" },
      { word:"hat",  phonemes:["h","a","t"],  damage:14, hint:"🎩" },
      { word:"mat",  phonemes:["m","a","t"],  damage:14, hint:"🛏️" },
      { word:"rat",  phonemes:["r","a","t"],  damage:14, hint:"🐀" },
      { word:"fan",  phonemes:["f","a","n"],  damage:14, hint:"🌬️" },
      { word:"man",  phonemes:["m","a","n"],  damage:14, hint:"🧑" },
      { word:"can",  phonemes:["c","a","n"],  damage:14, hint:"🥫" },
      { word:"pan",  phonemes:["p","a","n"],  damage:14, hint:"🍳" },
      { word:"ran",  phonemes:["r","a","n"],  damage:14, hint:"🏃" },
      { word:"cap",  phonemes:["c","a","p"],  damage:14, hint:"🧢" },
      { word:"map",  phonemes:["m","a","p"],  damage:14, hint:"🗺️" },
      { word:"tap",  phonemes:["t","a","p"],  damage:14, hint:"🚰" },
      { word:"bag",  phonemes:["b","a","g"],  damage:14, hint:"👜" },
      { word:"sad",  phonemes:["s","a","d"],  damage:14, hint:"😢" },
    ],
  },

  // ── STAGE 2 ── Short-e CVC ──────────────────────────────────
  stage2: {
    id: 2, name: "Bamboo Dojo Forest",
    pattern: "Short-e Words", patternDesc: "short 'e' · bed · pet · ten · leg",
    bg: "stage-2-bamboo", bossFile: "stage-2-rapi", bossName: "Rapi the Ruthless",
    blendTime: 24, bossHp: 130, bossAttack: 15, minionFile: "stage-2-stego",
    skyColor: ["#4CAF50","#81C784"], groundColor: "#2E7D32", accentColor: "#8BC34A",
    runnerSpeed: 3.6,
    words: [
      { word:"bed",  phonemes:["b","e","d"],  damage:15, hint:"🛏️" },
      { word:"red",  phonemes:["r","e","d"],  damage:15, hint:"🔴" },
      { word:"pet",  phonemes:["p","e","t"],  damage:15, hint:"🐾" },
      { word:"wet",  phonemes:["w","e","t"],  damage:15, hint:"💧" },
      { word:"set",  phonemes:["s","e","t"],  damage:15, hint:"⚙️" },
      { word:"ten",  phonemes:["t","e","n"],  damage:15, hint:"🔟" },
      { word:"hen",  phonemes:["h","e","n"],  damage:15, hint:"🐔" },
      { word:"pen",  phonemes:["p","e","n"],  damage:15, hint:"🖊️" },
      { word:"den",  phonemes:["d","e","n"],  damage:15, hint:"🦁" },
      { word:"net",  phonemes:["n","e","t"],  damage:15, hint:"🥅" },
      { word:"leg",  phonemes:["l","e","g"],  damage:15, hint:"🦵" },
      { word:"beg",  phonemes:["b","e","g"],  damage:15, hint:"🙏" },
      { word:"peg",  phonemes:["p","e","g"],  damage:15, hint:"📌" },
      { word:"web",  phonemes:["w","e","b"],  damage:15, hint:"🕸️" },
      { word:"gem",  phonemes:["g","e","m"],  damage:15, hint:"💎" },
    ],
  },

  // ── STAGE 3 ── Short-i CVC ──────────────────────────────────
  stage3: {
    id: 3, name: "Cherry Blossom Temple",
    pattern: "Short-i Words", patternDesc: "short 'i' · sit · bit · win · pig",
    bg: "stage-3-cherry-temple", bossFile: "stage-3-brachio", bossName: "Brachio the Bold",
    blendTime: 22, bossHp: 140, bossAttack: 16, minionFile: "stage-3-ptera",
    skyColor: ["#FFB7C5","#FF69B4"], groundColor: "#C2185B", accentColor: "#FF80AB",
    runnerSpeed: 4.0,
    words: [
      { word:"sit",  phonemes:["s","i","t"],  damage:16, hint:"🪑" },
      { word:"bit",  phonemes:["b","i","t"],  damage:16, hint:"🦷" },
      { word:"hit",  phonemes:["h","i","t"],  damage:16, hint:"⚔️" },
      { word:"pit",  phonemes:["p","i","t"],  damage:16, hint:"🕳️" },
      { word:"win",  phonemes:["w","i","n"],  damage:16, hint:"🏆" },
      { word:"bin",  phonemes:["b","i","n"],  damage:16, hint:"🗑️" },
      { word:"tin",  phonemes:["t","i","n"],  damage:16, hint:"🥫" },
      { word:"lip",  phonemes:["l","i","p"],  damage:16, hint:"💋" },
      { word:"dip",  phonemes:["d","i","p"],  damage:16, hint:"🌊" },
      { word:"tip",  phonemes:["t","i","p"],  damage:16, hint:"💡" },
      { word:"dig",  phonemes:["d","i","g"],  damage:16, hint:"⛏️" },
      { word:"big",  phonemes:["b","i","g"],  damage:16, hint:"🐘" },
      { word:"pig",  phonemes:["p","i","g"],  damage:16, hint:"🐷" },
      { word:"mix",  phonemes:["m","i","x"],  damage:16, hint:"🥣" },
      { word:"fix",  phonemes:["f","i","x"],  damage:16, hint:"🔧" },
    ],
  },

  // ── STAGE 4 ── Short-o CVC ──────────────────────────────────
  stage4: {
    id: 4, name: "Ancient Rice Ruins",
    pattern: "Short-o Words", patternDesc: "short 'o' · dog · hot · hop · log",
    bg: "stage-4-ruins", bossFile: "stage-4-anky", bossName: "Anky the Armored",
    blendTime: 21, bossHp: 150, bossAttack: 17, minionFile: "stage-4-anky",
    skyColor: ["#795548","#a1887f"], groundColor: "#4E342E", accentColor: "#FF9800",
    runnerSpeed: 4.2,
    words: [
      { word:"hot",  phonemes:["h","o","t"],  damage:17, hint:"🔥" },
      { word:"dog",  phonemes:["d","o","g"],  damage:17, hint:"🐶" },
      { word:"hop",  phonemes:["h","o","p"],  damage:17, hint:"🐸" },
      { word:"top",  phonemes:["t","o","p"],  damage:17, hint:"🔝" },
      { word:"fog",  phonemes:["f","o","g"],  damage:17, hint:"🌫️" },
      { word:"log",  phonemes:["l","o","g"],  damage:17, hint:"🪵" },
      { word:"dot",  phonemes:["d","o","t"],  damage:17, hint:"⚫" },
      { word:"got",  phonemes:["g","o","t"],  damage:17, hint:"✅" },
      { word:"pot",  phonemes:["p","o","t"],  damage:17, hint:"🍯" },
      { word:"mop",  phonemes:["m","o","p"],  damage:17, hint:"🧹" },
      { word:"cop",  phonemes:["c","o","p"],  damage:17, hint:"👮" },
      { word:"sob",  phonemes:["s","o","b"],  damage:17, hint:"😭" },
      { word:"job",  phonemes:["j","o","b"],  damage:17, hint:"💼" },
      { word:"box",  phonemes:["b","o","x"],  damage:17, hint:"📦" },
      { word:"cob",  phonemes:["c","o","b"],  damage:17, hint:"🌽" },
    ],
  },

  // ── STAGE 5 ── Short-u CVC ──────────────────────────────────
  stage5: {
    id: 5, name: "Mountain Rice Terraces",
    pattern: "Short-u Words", patternDesc: "short 'u' · cup · bug · fun · run",
    bg: "stage-5-mountain-terraces", bossFile: "stage-5-spino", bossName: "Spino the Spinner",
    blendTime: 20, bossHp: 160, bossAttack: 18, minionFile: "stage-5-pachy",
    skyColor: ["#1565C0","#42A5F5"], groundColor: "#1B5E20", accentColor: "#4CAF50",
    runnerSpeed: 4.5,
    words: [
      { word:"cup",  phonemes:["c","u","p"],  damage:18, hint:"☕" },
      { word:"bug",  phonemes:["b","u","g"],  damage:18, hint:"🐛" },
      { word:"fun",  phonemes:["f","u","n"],  damage:18, hint:"🎉" },
      { word:"tug",  phonemes:["t","u","g"],  damage:18, hint:"💪" },
      { word:"run",  phonemes:["r","u","n"],  damage:18, hint:"🏃" },
      { word:"mud",  phonemes:["m","u","d"],  damage:18, hint:"🌧️" },
      { word:"sun",  phonemes:["s","u","n"],  damage:18, hint:"☀️" },
      { word:"bun",  phonemes:["b","u","n"],  damage:18, hint:"🍞" },
      { word:"cut",  phonemes:["c","u","t"],  damage:18, hint:"✂️" },
      { word:"hug",  phonemes:["h","u","g"],  damage:18, hint:"🤗" },
      { word:"gut",  phonemes:["g","u","t"],  damage:18, hint:"💥" },
      { word:"hut",  phonemes:["h","u","t"],  damage:18, hint:"🛖" },
      { word:"nut",  phonemes:["n","u","t"],  damage:18, hint:"🥜" },
      { word:"dug",  phonemes:["d","u","g"],  damage:18, hint:"⛏️" },
      { word:"mug",  phonemes:["m","u","g"],  damage:18, hint:"🫖" },
    ],
  },

  // ── STAGE 6 ── Consonant Blends ─────────────────────────────
  stage6: {
    id: 6, name: "Volcanic Samurai Peak",
    pattern: "Consonant Blends",
    patternDesc: "bl · cl · fl · cr · dr · sn · st — two sounds together!",
    bg: "stage-6-volcanic", bossFile: "stage-6-dilo", bossName: "Dilo the Destroyer",
    blendTime: 18, bossHp: 180, bossAttack: 20, minionFile: "stage-6-dilo",
    skyColor: ["#212121","#B71C1C"], groundColor: "#880E4F", accentColor: "#FF6F00",
    runnerSpeed: 5.0,
    words: [
      { word:"clap",  phonemes:["cl","a","p"],  damage:22, hint:"👏" },
      { word:"flag",  phonemes:["fl","a","g"],  damage:22, hint:"🚩" },
      { word:"glad",  phonemes:["gl","a","d"],  damage:22, hint:"😄" },
      { word:"plan",  phonemes:["pl","a","n"],  damage:22, hint:"📋" },
      { word:"crab",  phonemes:["cr","a","b"],  damage:24, hint:"🦀" },
      { word:"drip",  phonemes:["dr","i","p"],  damage:22, hint:"💧" },
      { word:"frog",  phonemes:["fr","o","g"],  damage:24, hint:"🐸" },
      { word:"grin",  phonemes:["gr","i","n"],  damage:22, hint:"😁" },
      { word:"trip",  phonemes:["tr","i","p"],  damage:24, hint:"🧳" },
      { word:"slip",  phonemes:["sl","i","p"],  damage:22, hint:"🫨" },
      { word:"snap",  phonemes:["sn","a","p"],  damage:24, hint:"🫰" },
      { word:"spin",  phonemes:["sp","i","n"],  damage:24, hint:"🌀" },
      { word:"step",  phonemes:["st","e","p"],  damage:24, hint:"👟" },
      { word:"swim",  phonemes:["sw","i","m"],  damage:24, hint:"🏊" },
      { word:"blob",  phonemes:["bl","o","b"],  damage:22, hint:"🫧" },
    ],
  },
};

// ── Ordered array for easy stage iteration ───────────────────
PHONICS_DATA.stageList = [
  PHONICS_DATA.stage1, PHONICS_DATA.stage2, PHONICS_DATA.stage3,
  PHONICS_DATA.stage4, PHONICS_DATA.stage5, PHONICS_DATA.stage6,
];

// ── ENDLESS MODE WORD TIERS ──────────────────────────────────
// Words unlocked progressively as runner distance increases.
PHONICS_DATA.endlessTiers = [
  {
    label: "Starter Words", minDist: 0,
    words: [
      { word:"cat",  phonemes:["c","a","t"],  hint:"🐱" },
      { word:"hat",  phonemes:["h","a","t"],  hint:"🎩" },
      { word:"bat",  phonemes:["b","a","t"],  hint:"🦇" },
      { word:"fan",  phonemes:["f","a","n"],  hint:"🌬️" },
      { word:"bed",  phonemes:["b","e","d"],  hint:"🛏️" },
      { word:"pet",  phonemes:["p","e","t"],  hint:"🐾" },
      { word:"ten",  phonemes:["t","e","n"],  hint:"🔟" },
      { word:"red",  phonemes:["r","e","d"],  hint:"🔴" },
      { word:"pan",  phonemes:["p","a","n"],  hint:"🍳" },
      { word:"map",  phonemes:["m","a","p"],  hint:"🗺️" },
    ],
  },
  {
    label: "Short Vowels", minDist: 200,
    words: [
      { word:"sit",  phonemes:["s","i","t"],  hint:"🪑" },
      { word:"big",  phonemes:["b","i","g"],  hint:"🐘" },
      { word:"dog",  phonemes:["d","o","g"],  hint:"🐶" },
      { word:"hop",  phonemes:["h","o","p"],  hint:"🐸" },
      { word:"cup",  phonemes:["c","u","p"],  hint:"☕" },
      { word:"run",  phonemes:["r","u","n"],  hint:"🏃" },
      { word:"bug",  phonemes:["b","u","g"],  hint:"🐛" },
      { word:"mix",  phonemes:["m","i","x"],  hint:"🥣" },
      { word:"sun",  phonemes:["s","u","n"],  hint:"☀️" },
      { word:"pig",  phonemes:["p","i","g"],  hint:"🐷" },
    ],
  },
  {
    label: "Blends", minDist: 500,
    words: [
      { word:"clap",  phonemes:["cl","a","p"],   hint:"👏" },
      { word:"flag",  phonemes:["fl","a","g"],   hint:"🚩" },
      { word:"frog",  phonemes:["fr","o","g"],   hint:"🐸" },
      { word:"snap",  phonemes:["sn","a","p"],   hint:"🫰" },
      { word:"step",  phonemes:["st","e","p"],   hint:"👟" },
      { word:"trip",  phonemes:["tr","i","p"],   hint:"🧳" },
      { word:"crab",  phonemes:["cr","a","b"],   hint:"🦀" },
      { word:"spin",  phonemes:["sp","i","n"],   hint:"🌀" },
      { word:"drip",  phonemes:["dr","i","p"],   hint:"💧" },
      { word:"grin",  phonemes:["gr","i","n"],   hint:"😁" },
    ],
  },
  {
    label: "Digraphs", minDist: 900,
    words: [
      { word:"ship",  phonemes:["sh","i","p"],   hint:"🚢" },
      { word:"shop",  phonemes:["sh","o","p"],   hint:"🏪" },
      { word:"shed",  phonemes:["sh","e","d"],   hint:"🛖" },
      { word:"chip",  phonemes:["ch","i","p"],   hint:"🍟" },
      { word:"chin",  phonemes:["ch","i","n"],   hint:"😀" },
      { word:"chat",  phonemes:["ch","a","t"],   hint:"💬" },
      { word:"thin",  phonemes:["th","i","n"],   hint:"📏" },
      { word:"that",  phonemes:["th","a","t"],   hint:"👆" },
      { word:"when",  phonemes:["wh","e","n"],   hint:"❓" },
      { word:"whip",  phonemes:["wh","i","p"],   hint:"🎠" },
    ],
  },
  {
    label: "Long Vowels", minDist: 1400,
    words: [
      { word:"cake",  phonemes:["c","a","ke"],   hint:"🎂" },
      { word:"lake",  phonemes:["l","a","ke"],   hint:"🏞️" },
      { word:"bike",  phonemes:["b","i","ke"],   hint:"🚲" },
      { word:"kite",  phonemes:["k","i","te"],   hint:"🪁" },
      { word:"hope",  phonemes:["h","o","pe"],   hint:"🕊️" },
      { word:"rose",  phonemes:["r","o","se"],   hint:"🌹" },
      { word:"cube",  phonemes:["c","u","be"],   hint:"🎲" },
      { word:"tune",  phonemes:["t","u","ne"],   hint:"🎵" },
    ],
  },
  {
    label: "Sight Words", minDist: 1700,
    words: [
      { word:"the",   phonemes:["th","e"],      hint:"📘" },
      { word:"said",  phonemes:["s","ai","d"], hint:"🗣️" },
      { word:"come",  phonemes:["c","o","me"], hint:"➡️" },
      { word:"were",  phonemes:["w","er","e"], hint:"👥" },
      { word:"have",  phonemes:["h","a","ve"], hint:"🤲" },
      { word:"some",  phonemes:["s","o","me"], hint:"🔢" },
      { word:"does",  phonemes:["d","oe","s"], hint:"❓" },
      { word:"once",  phonemes:["o","n","ce"], hint:"1️⃣" },
    ],
  },
  {
    label: "Multisyllabic", minDist: 2200,
    words: [
      { word:"robot",   phonemes:["ro","bot"],        hint:"🤖" },
      { word:"tiger",   phonemes:["ti","ger"],        hint:"🐯" },
      { word:"sunset",  phonemes:["sun","set"],       hint:"🌇" },
      { word:"music",   phonemes:["mu","sic"],        hint:"🎵" },
      { word:"dino",    phonemes:["di","no"],         hint:"🦖" },
      { word:"volcano", phonemes:["vol","ca","no"], hint:"🌋" },
      { word:"banana",  phonemes:["ba","na","na"],  hint:"🍌" },
      { word:"samurai", phonemes:["sa","mu","rai"], hint:"⚔️" },
    ],
  },
  {
    label: "Expert Mix", minDist: 2600,
    words: [
      { word:"crash",  phonemes:["cr","a","sh"],    hint:"💥" },
      { word:"blend",  phonemes:["bl","e","nd"],    hint:"🌀" },
      { word:"stomp",  phonemes:["st","o","mp"],    hint:"🦶" },
      { word:"chest",  phonemes:["ch","e","st"],    hint:"📦" },
      { word:"thrust", phonemes:["thr","u","st"],   hint:"🚀" },
      { word:"sprint", phonemes:["spr","i","nt"],   hint:"🏃" },
      { word:"crisp",  phonemes:["cr","i","sp"],    hint:"🍪" },
      { word:"shrub",  phonemes:["shr","u","b"],    hint:"🌿" },
    ],
  },
];

// ── CONTENT CATEGORY PACKS (Step 4 expansion) ─────────────────
PHONICS_DATA.categoryPacks = {
  longVowels: [
    { word:"cake", phonemes:["c","a","ke"], hint:"🎂" },
    { word:"bike", phonemes:["b","i","ke"], hint:"🚲" },
    { word:"rope", phonemes:["r","o","pe"], hint:"🪢" },
    { word:"cube", phonemes:["c","u","be"], hint:"🎲" },
  ],
  sightWords: [
    { word:"the", phonemes:["th","e"], hint:"📘" },
    { word:"said", phonemes:["s","ai","d"], hint:"🗣️" },
    { word:"have", phonemes:["h","a","ve"], hint:"🤲" },
    { word:"does", phonemes:["d","oe","s"], hint:"❓" },
  ],
  multisyllabic: [
    { word:"robot", phonemes:["ro","bot"], hint:"🤖" },
    { word:"volcano", phonemes:["vol","ca","no"], hint:"🌋" },
    { word:"banana", phonemes:["ba","na","na"], hint:"🍌" },
    { word:"samurai", phonemes:["sa","mu","rai"], hint:"⚔️" },
  ],
};

// ── DAILY CHALLENGE WORD SETS (seeded by day-of-year) ────────
// Inline wordObjs with phoneme data — no lookup needed.
PHONICS_DATA.dailySets = [
  { theme:"SH Words", emoji:"🚢", wordObjs:[
    { word:"ship",  phonemes:["sh","i","p"],  hint:"🚢" },
    { word:"shop",  phonemes:["sh","o","p"],  hint:"🏪" },
    { word:"shed",  phonemes:["sh","e","d"],  hint:"🛖" },
    { word:"shin",  phonemes:["sh","i","n"],  hint:"🦵" },
    { word:"shot",  phonemes:["sh","o","t"],  hint:"🎯" },
    { word:"shout", phonemes:["sh","ou","t"], hint:"📣" },
  ]},
  { theme:"CH Words", emoji:"💬", wordObjs:[
    { word:"chip",  phonemes:["ch","i","p"],  hint:"🍟" },
    { word:"chat",  phonemes:["ch","a","t"],  hint:"💬" },
    { word:"chin",  phonemes:["ch","i","n"],  hint:"😀" },
    { word:"chop",  phonemes:["ch","o","p"],  hint:"🪓" },
    { word:"chess", phonemes:["ch","e","ss"], hint:"♟️" },
    { word:"chest", phonemes:["ch","e","st"], hint:"📦" },
  ]},
  { theme:"TH Words", emoji:"👆", wordObjs:[
    { word:"thin",  phonemes:["th","i","n"],  hint:"📏" },
    { word:"that",  phonemes:["th","a","t"],  hint:"👆" },
    { word:"them",  phonemes:["th","e","m"],  hint:"👥" },
    { word:"than",  phonemes:["th","a","n"],  hint:"⚖️" },
    { word:"this",  phonemes:["th","i","s"],  hint:"👇" },
    { word:"thud",  phonemes:["th","u","d"],  hint:"💥" },
  ]},
  { theme:"Blends!", emoji:"💥", wordObjs:[
    { word:"clap",  phonemes:["cl","a","p"],  hint:"👏" },
    { word:"frog",  phonemes:["fr","o","g"],  hint:"🐸" },
    { word:"snap",  phonemes:["sn","a","p"],  hint:"🫰" },
    { word:"step",  phonemes:["st","e","p"],  hint:"👟" },
    { word:"crab",  phonemes:["cr","a","b"],  hint:"🦀" },
    { word:"spin",  phonemes:["sp","i","n"],  hint:"🌀" },
  ]},
  { theme:"Short-A", emoji:"🐱", wordObjs:[
    { word:"cat",   phonemes:["c","a","t"],   hint:"🐱" },
    { word:"bat",   phonemes:["b","a","t"],   hint:"🦇" },
    { word:"hat",   phonemes:["h","a","t"],   hint:"🎩" },
    { word:"fan",   phonemes:["f","a","n"],   hint:"🌬️" },
    { word:"man",   phonemes:["m","a","n"],   hint:"🧑" },
    { word:"cap",   phonemes:["c","a","p"],   hint:"🧢" },
  ]},
  { theme:"Short-E", emoji:"🛏️", wordObjs:[
    { word:"bed",   phonemes:["b","e","d"],   hint:"🛏️" },
    { word:"red",   phonemes:["r","e","d"],   hint:"🔴" },
    { word:"pet",   phonemes:["p","e","t"],   hint:"🐾" },
    { word:"ten",   phonemes:["t","e","n"],   hint:"🔟" },
    { word:"hen",   phonemes:["h","e","n"],   hint:"🐔" },
    { word:"pen",   phonemes:["p","e","n"],   hint:"🖊️" },
  ]},
  { theme:"Short-I", emoji:"🪑", wordObjs:[
    { word:"sit",   phonemes:["s","i","t"],   hint:"🪑" },
    { word:"bit",   phonemes:["b","i","t"],   hint:"🦷" },
    { word:"win",   phonemes:["w","i","n"],   hint:"🏆" },
    { word:"dig",   phonemes:["d","i","g"],   hint:"⛏️" },
    { word:"pig",   phonemes:["p","i","g"],   hint:"🐷" },
    { word:"mix",   phonemes:["m","i","x"],   hint:"🥣" },
  ]},
  { theme:"Short-O", emoji:"🔥", wordObjs:[
    { word:"hot",   phonemes:["h","o","t"],   hint:"🔥" },
    { word:"dog",   phonemes:["d","o","g"],   hint:"🐶" },
    { word:"hop",   phonemes:["h","o","p"],   hint:"🐸" },
    { word:"log",   phonemes:["l","o","g"],   hint:"🪵" },
    { word:"dot",   phonemes:["d","o","t"],   hint:"⚫" },
    { word:"pot",   phonemes:["p","o","t"],   hint:"🍯" },
  ]},
  { theme:"Short-U", emoji:"☕", wordObjs:[
    { word:"cup",   phonemes:["c","u","p"],   hint:"☕" },
    { word:"bug",   phonemes:["b","u","g"],   hint:"🐛" },
    { word:"fun",   phonemes:["f","u","n"],   hint:"🎉" },
    { word:"run",   phonemes:["r","u","n"],   hint:"🏃" },
    { word:"sun",   phonemes:["s","u","n"],   hint:"☀️" },
    { word:"mud",   phonemes:["m","u","d"],   hint:"🌧️" },
  ]},
  { theme:"Long-A", emoji:"🎂", wordObjs:[
    { word:"cake",  phonemes:["c","a","ke"],  hint:"🎂" },
    { word:"lake",  phonemes:["l","a","ke"],  hint:"🏞️" },
    { word:"bake",  phonemes:["b","a","ke"],  hint:"👨‍🍳" },
    { word:"rake",  phonemes:["r","a","ke"],  hint:"🍂" },
    { word:"wake",  phonemes:["w","a","ke"],  hint:"⏰" },
    { word:"make",  phonemes:["m","a","ke"],  hint:"🔨" },
  ]},
  { theme:"Long-I", emoji:"🚲", wordObjs:[
    { word:"bike",  phonemes:["b","i","ke"],  hint:"🚲" },
    { word:"kite",  phonemes:["k","i","te"],  hint:"🪁" },
    { word:"rice",  phonemes:["r","i","ce"],  hint:"🍚" },
    { word:"nice",  phonemes:["n","i","ce"],  hint:"😊" },
    { word:"dice",  phonemes:["d","i","ce"],  hint:"🎲" },
    { word:"mice",  phonemes:["m","i","ce"],  hint:"🐭" },
  ]},
  { theme:"Long-O", emoji:"🕊️", wordObjs:[
    { word:"hope",  phonemes:["h","o","pe"],  hint:"🕊️" },
    { word:"rose",  phonemes:["r","o","se"],  hint:"🌹" },
    { word:"home",  phonemes:["h","o","me"],  hint:"🏠" },
    { word:"rope",  phonemes:["r","o","pe"],  hint:"🪢" },
    { word:"nose",  phonemes:["n","o","se"],  hint:"👃" },
    { word:"bone",  phonemes:["b","o","ne"],  hint:"🦴" },
  ]},
  { theme:"WH Words", emoji:"❓", wordObjs:[
    { word:"when",  phonemes:["wh","e","n"],  hint:"❓" },
    { word:"whip",  phonemes:["wh","i","p"],  hint:"🎠" },
    { word:"what",  phonemes:["wh","a","t"],  hint:"❔" },
    { word:"whim",  phonemes:["wh","i","m"],  hint:"🌀" },
    { word:"ship",  phonemes:["sh","i","p"],  hint:"🚢" },
    { word:"chat",  phonemes:["ch","a","t"],  hint:"💬" },
  ]},
  { theme:"Expert Mix", emoji:"🌋", wordObjs:[
    { word:"crash",  phonemes:["cr","a","sh"],   hint:"💥" },
    { word:"blend",  phonemes:["bl","e","nd"],   hint:"🌀" },
    { word:"stomp",  phonemes:["st","o","mp"],   hint:"🦶" },
    { word:"chest",  phonemes:["ch","e","st"],   hint:"📦" },
    { word:"snap",   phonemes:["sn","a","p"],    hint:"🫰" },
    { word:"shrimp", phonemes:["shr","i","mp"],  hint:"🦐" },
  ]},
];

// ── HELPERS ──────────────────────────────────────────────────
PHONICS_DATA.getDailySet = function() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const set = PHONICS_DATA.dailySets[dayOfYear % PHONICS_DATA.dailySets.length];
  // wordObjs are inline — return directly with 'words' alias for display
  return { ...set, words: (set.wordObjs || []).map(w => w.word) };
};

PHONICS_DATA.getEndlessWords = function(distMeters) {
  const pool = [];
  for (const t of PHONICS_DATA.endlessTiers) {
    if (t.minDist <= distMeters) pool.push(...t.words);
  }
  return pool;
};

// Campaign helpers (unchanged)
PHONICS_DATA.getRunnerCoins = function(stageId) {
  const stage = PHONICS_DATA.stageList[stageId - 1];
  const selected = stage.words.slice(0, 5);
  const coins = [];
  selected.forEach((w, wIdx) => {
    w.phonemes.forEach((ph, pIdx) => {
      coins.push({ phoneme: ph, wordId: wIdx, phIdx: pIdx, hint: w.hint, word: w.word });
    });
  });
  return coins;
};

PHONICS_DATA.getBattleWords = function(stageId) {
  return PHONICS_DATA.stageList[stageId - 1].words;
};
