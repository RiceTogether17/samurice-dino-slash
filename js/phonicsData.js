'use strict';
// ============================================================
// PHONICS DATA — js/phonicsData.js
// ------------------------------------------------------------
// CAMPAIGN = the main game mode.
//   6 Worlds × 5 stages = 30 stages, sequenced by the
//   science-of-reading progression children master phonics with:
//
//     World 1 · Rice Paddy Valley  → Phonemic Awareness & Letter Sounds
//     World 2 · Bamboo Dojo Forest → CVC Blending & Segmenting
//     World 3 · Cherry Blossom Temple → Digraphs & Consonant Blends
//     World 4 · Ancient Rice Ruins → Long Vowels (Magic-e & Vowel Teams)
//     World 5 · Mountain Terraces  → Sight Words & Word Families
//     World 6 · Volcanic Peak      → Multisyllabic Words & Mastery
//
//   Each stage tags a `skill` (what it teaches) and `activities`
//   (which mini-game types the boss battle uses):
//     first | last | middle | missing  → phonemic awareness (isolate a sound)
//     letter-sound                      → grapheme→phoneme letter sounds
//     rhyme                             → rhyming (phonemic awareness)
//     segment-it                        → segmenting & blending
//     sight-word                        → whole-word sight recognition
//   `challengeEvery` controls how often a mini-game round appears
//   (1 = every round is a mini-game; great for sight-word stages).
// ============================================================

const PHONICS_DATA = {};

// ── World themes (reuse the 6 existing art sets) ──────────────
// dmg / blendTime / bossHp / bossAttack / runnerSpeed are the
// world's *base* values; stages ramp difficulty within the world.
const _WORLDS_META = [
  {
    id:1, name:"Rice Paddy Valley", icon:"🌾",
    skill:"Phonemic Awareness & Letter Sounds",
    desc:"Tune your ears! Hear first, last & rhyming sounds and learn the sound each letter makes.",
    bg:"stage-1-rice-paddy", bossFile:"stage-1-rex", minionFile:"stage-1-tri",
    bossName:"Rex the Rapscallion",
    skyColor:["#87CEEB","#c5e8f8"], groundColor:"#5a8a3c", accentColor:"#ff6b35",
    dmg:14, blendTime:30, bossHp:110, bossAttack:12, runnerSpeed:3.0,
  },
  {
    id:2, name:"Bamboo Dojo Forest", icon:"🎋",
    skill:"CVC Blending & Segmenting",
    desc:"Break words into sounds and blend them back together — the heart of reading!",
    bg:"stage-2-bamboo", bossFile:"stage-2-rapi", minionFile:"stage-2-stego",
    bossName:"Rapi the Ruthless",
    skyColor:["#4CAF50","#81C784"], groundColor:"#2E7D32", accentColor:"#8BC34A",
    dmg:16, blendTime:26, bossHp:130, bossAttack:14, runnerSpeed:3.4,
  },
  {
    id:3, name:"Cherry Blossom Temple", icon:"🌸",
    skill:"Digraphs & Consonant Blends",
    desc:"Two letters, one sound (sh, ch, th) and zippy blends (cl, fr, st)!",
    bg:"stage-3-cherry-temple", bossFile:"stage-3-brachio", minionFile:"stage-3-ptera",
    bossName:"Brachio the Bold",
    skyColor:["#FFB7C5","#FF69B4"], groundColor:"#C2185B", accentColor:"#FF80AB",
    dmg:18, blendTime:24, bossHp:150, bossAttack:16, runnerSpeed:3.8,
  },
  {
    id:4, name:"Ancient Rice Ruins", icon:"🏯",
    skill:"Long Vowels — Magic-e & Vowel Teams",
    desc:"Magic-e and vowel teams make vowels say their names: cake, bike, rain, boat!",
    bg:"stage-4-ruins", bossFile:"stage-4-anky", minionFile:"stage-4-anky",
    bossName:"Anky the Armored",
    skyColor:["#795548","#a1887f"], groundColor:"#4E342E", accentColor:"#FF9800",
    dmg:20, blendTime:22, bossHp:170, bossAttack:18, runnerSpeed:4.1,
  },
  {
    id:5, name:"Mountain Rice Terraces", icon:"⛰️",
    skill:"Sight Words & Word Families",
    desc:"Snap up tricky sight words on sight and master rhyming word families.",
    bg:"stage-5-mountain-terraces", bossFile:"stage-5-spino", minionFile:"stage-5-pachy",
    bossName:"Spino the Spinner",
    skyColor:["#1565C0","#42A5F5"], groundColor:"#1B5E20", accentColor:"#4CAF50",
    dmg:22, blendTime:20, bossHp:185, bossAttack:20, runnerSpeed:4.4,
  },
  {
    id:6, name:"Volcanic Samurai Peak", icon:"🌋",
    skill:"Multisyllabic Words & Mastery",
    desc:"Chunk big words syllable by syllable and prove your phonics mastery!",
    bg:"stage-6-volcanic", bossFile:"stage-6-dilo", minionFile:"stage-6-dilo",
    bossName:"Dilo the Destroyer",
    skyColor:["#212121","#B71C1C"], groundColor:"#880E4F", accentColor:"#FF6F00",
    dmg:24, blendTime:18, bossHp:200, bossAttack:22, runnerSpeed:4.8,
  },
];

// Tiny word helper — keeps stage tables readable.
function _w(word, phonemes, hint, extra) {
  return Object.assign({ word, phonemes, hint }, extra || {});
}

const _QUEST_VERBS = [
  'Listen for', 'Catch', 'Bridge', 'Climb', 'Conquer',
];

const _POWER_UPS = [
  { name: 'Echo Ears', iconKey: 'power-echo-ears', runnerType: 'echo-ears' },
  { name: 'Rice Rocket', iconKey: 'power-rice-rocket', runnerType: 'rice-rocket' },
  { name: 'Rhyme Cape', iconKey: 'power-rhyme-cape', runnerType: 'rhyme-cape' },
  { name: 'Glyph Boots', iconKey: 'power-glyph-boots', runnerType: 'glyph-boots' },
  { name: 'Boss Star', iconKey: 'power-boss-star', runnerType: 'boss-star' },
];

PHONICS_DATA.buildStageQuest = function(stage) {
  const localIdx = Math.max(0, (stage.local || 1) - 1);
  const verb = _QUEST_VERBS[localIdx] || 'Master';
  const power = _POWER_UPS[localIdx] || { name: 'Mastery Star', iconKey: 'power-boss-star', runnerType: 'boss-star' };
  const target = stage.isBoss ? 'beat the boss gate' : 'open the next path tile';
  const samples = (stage.words || [])
    .slice(0, 3)
    .map((w) => w.word.toUpperCase())
    .join(' · ');

  return {
    title: `${verb} ${stage.pattern}`,
    objective: `${stage.patternDesc || stage.pattern} to ${target}.`,
    powerUp: power.name,
    iconKey: power.iconKey,
    runnerType: power.runnerType,
    samples,
  };
};

// ── Per-world stage tables ────────────────────────────────────
// Each entry: { name, pattern, patternDesc, skill, activities,
//               challengeEvery?, miniName?, words:[...] }
const _WORLD_STAGES = {

  // ════════ WORLD 1 — Phonemic Awareness & Letter Sounds ════════
  1: [
    { name:"First Sound Forest", pattern:"First Sounds",
      patternDesc:"Hear the sound a word STARTS with", skill:"Phonemic Awareness",
      activities:["first","letter-sound"], challengeEvery:2, miniName:"Sound Sprout", miniFile:"sound-sprout",
      words:[ _w("sun",["s","u","n"],"☀️"), _w("map",["m","a","p"],"🗺️"),
        _w("dog",["d","o","g"],"🐶"), _w("fan",["f","a","n"],"🌬️"),
        _w("leg",["l","e","g"],"🦵"), _w("bug",["b","u","g"],"🐛"),
        _w("pig",["p","i","g"],"🐷"), _w("top",["t","o","p"],"🔝"),
        _w("net",["n","e","t"],"🥅"), _w("web",["w","e","b"],"🕸️") ] },
    { name:"Last Sound Lagoon", pattern:"Last Sounds",
      patternDesc:"Hear the sound a word ENDS with", skill:"Phonemic Awareness",
      activities:["last","letter-sound"], challengeEvery:2, miniName:"Echo Imp", miniFile:"echo-imp",
      words:[ _w("cat",["c","a","t"],"🐱"), _w("bus",["b","u","s"],"🚌"),
        _w("hop",["h","o","p"],"🐸"), _w("bed",["b","e","d"],"🛏️"),
        _w("can",["c","a","n"],"🥫"), _w("mud",["m","u","d"],"🌧️"),
        _w("jet",["j","e","t"],"✈️"), _w("fox",["f","o","x"],"🦊"),
        _w("pen",["p","e","n"],"🖊️"), _w("bag",["b","a","g"],"👜") ] },
    { name:"Rhyme Rice Fields", pattern:"Rhyming Words",
      patternDesc:"Words that sound the same at the end", skill:"Phonemic Awareness · Rhyme",
      activities:["rhyme","last"], challengeEvery:2, miniName:"Rhyme Sprite", miniFile:"rhyme-sprite",
      words:[ _w("cat",["c","a","t"],"🐱",{rime:"at"}), _w("hat",["h","a","t"],"🎩",{rime:"at"}),
        _w("bat",["b","a","t"],"🦇",{rime:"at"}), _w("mat",["m","a","t"],"🟫",{rime:"at"}),
        _w("man",["m","a","n"],"🧑",{rime:"an"}), _w("pan",["p","a","n"],"🍳",{rime:"an"}),
        _w("fan",["f","a","n"],"🌬️",{rime:"an"}), _w("can",["c","a","n"],"🥫",{rime:"an"}),
        _w("pig",["p","i","g"],"🐷",{rime:"ig"}), _w("wig",["w","i","g"],"💇",{rime:"ig"}),
        _w("dig",["d","i","g"],"⛏️",{rime:"ig"}), _w("big",["b","i","g"],"🐘",{rime:"ig"}) ] },
    { name:"Letter Sound Trail", pattern:"Letter Sounds",
      patternDesc:"Which letter makes that sound?", skill:"Letter Sounds (Phonics)",
      activities:["letter-sound","first"], challengeEvery:2, miniName:"Glyph Goblin", miniFile:"glyph-goblin",
      words:[ _w("van",["v","a","n"],"🚐"), _w("kit",["k","i","t"],"🧰"),
        _w("yak",["y","a","k"],"🐃"), _w("jam",["j","a","m"],"🍓"),
        _w("wet",["w","e","t"],"💧"), _w("him",["h","i","m"],"🙋"),
        _w("log",["l","o","g"],"🪵"), _w("bud",["b","u","d"],"🌱"),
        _w("zip",["z","i","p"],"🤐"), _w("sun",["s","u","n"],"☀️") ] },
    { name:"Sound Smash Showdown", pattern:"Sound Detective Boss",
      patternDesc:"First, last, middle & rhyming sounds — all of it!", skill:"Phonemic Awareness Boss",
      activities:["first","last","middle","rhyme"], challengeEvery:2,
      words:[ _w("cat",["c","a","t"],"🐱",{rime:"at"}), _w("hat",["h","a","t"],"🎩",{rime:"at"}),
        _w("sun",["s","u","n"],"☀️",{rime:"un"}), _w("run",["r","u","n"],"🏃",{rime:"un"}),
        _w("dog",["d","o","g"],"🐶"), _w("pig",["p","i","g"],"🐷"),
        _w("man",["m","a","n"],"🧑",{rime:"an"}), _w("pan",["p","a","n"],"🍳",{rime:"an"}),
        _w("bed",["b","e","d"],"🛏️"), _w("top",["t","o","p"],"🔝") ] },
  ],

  // ════════ WORLD 2 — CVC Blending & Segmenting ════════
  2: [
    { name:"Short-A Arena", pattern:"Short-a CVC",
      patternDesc:"a · cat · bat · map", skill:"Blending & Segmenting",
      activities:["segment-it","middle"], miniName:"Paddy Pup", miniFile:"paddy-pup",
      words:[ _w("cat",["c","a","t"],"🐱"), _w("hat",["h","a","t"],"🎩"),
        _w("bat",["b","a","t"],"🦇"), _w("man",["m","a","n"],"🧑"),
        _w("fan",["f","a","n"],"🌬️"), _w("can",["c","a","n"],"🥫"),
        _w("map",["m","a","p"],"🗺️"), _w("bag",["b","a","g"],"👜"),
        _w("tap",["t","a","p"],"🚰"), _w("rat",["r","a","t"],"🐀") ] },
    { name:"Short-E Encampment", pattern:"Short-e CVC",
      patternDesc:"e · bed · pet · ten", skill:"Blending & Segmenting",
      activities:["segment-it","last"], miniName:"Bamboo Bub", miniFile:"bamboo-bub",
      words:[ _w("bed",["b","e","d"],"🛏️"), _w("red",["r","e","d"],"🔴"),
        _w("pet",["p","e","t"],"🐾"), _w("net",["n","e","t"],"🥅"),
        _w("ten",["t","e","n"],"🔟"), _w("hen",["h","e","n"],"🐔"),
        _w("pen",["p","e","n"],"🖊️"), _w("leg",["l","e","g"],"🦵"),
        _w("jet",["j","e","t"],"✈️"), _w("web",["w","e","b"],"🕸️") ] },
    { name:"Short-I Inlet", pattern:"Short-i CVC",
      patternDesc:"i · sit · pig · win", skill:"Blending & Segmenting",
      activities:["segment-it","middle"], miniName:"Reed Raptor", miniFile:"reed-raptor",
      words:[ _w("sit",["s","i","t"],"🪑"), _w("bit",["b","i","t"],"🦷"),
        _w("pig",["p","i","g"],"🐷"), _w("big",["b","i","g"],"🐘"),
        _w("win",["w","i","n"],"🏆"), _w("pin",["p","i","n"],"📌"),
        _w("lip",["l","i","p"],"💋"), _w("dig",["d","i","g"],"⛏️"),
        _w("fix",["f","i","x"],"🔧"), _w("zip",["z","i","p"],"🤐") ] },
    { name:"Short-O & U Outpost", pattern:"Short-o / Short-u CVC",
      patternDesc:"o & u · dog · cup · run", skill:"Blending & Segmenting",
      activities:["segment-it","first"], miniName:"Dojo Dino", miniFile:"dojo-dino",
      words:[ _w("hot",["h","o","t"],"🔥"), _w("dog",["d","o","g"],"🐶"),
        _w("pot",["p","o","t"],"🍯"), _w("mop",["m","o","p"],"🧹"),
        _w("box",["b","o","x"],"📦"), _w("cup",["c","u","p"],"☕"),
        _w("bug",["b","u","g"],"🐛"), _w("run",["r","u","n"],"🏃"),
        _w("sun",["s","u","n"],"☀️"), _w("nut",["n","u","t"],"🥜") ] },
    { name:"Blend Master Battle", pattern:"CVC Boss",
      patternDesc:"Blend & segment all five short vowels!", skill:"Blending Boss",
      activities:["segment-it","middle","last"],
      words:[ _w("cat",["c","a","t"],"🐱"), _w("bed",["b","e","d"],"🛏️"),
        _w("pig",["p","i","g"],"🐷"), _w("dog",["d","o","g"],"🐶"),
        _w("cup",["c","u","p"],"☕"), _w("man",["m","a","n"],"🧑"),
        _w("net",["n","e","t"],"🥅"), _w("win",["w","i","n"],"🏆"),
        _w("pot",["p","o","t"],"🍯"), _w("bug",["b","u","g"],"🐛") ] },
  ],

  // ════════ WORLD 3 — Digraphs & Consonant Blends ════════
  3: [
    { name:"SH & CH Shrine", pattern:"sh · ch Digraphs",
      patternDesc:"Two letters, one sound: ship · chip", skill:"Digraphs",
      activities:["first","segment-it"], miniName:"Petal Ptero",
      words:[ _w("ship",["sh","i","p"],"🚢"), _w("shop",["sh","o","p"],"🏪"),
        _w("shed",["sh","e","d"],"🛖"), _w("fish",["f","i","sh"],"🐟"),
        _w("chip",["ch","i","p"],"🍟"), _w("chat",["ch","a","t"],"💬"),
        _w("chin",["ch","i","n"],"😀"), _w("much",["m","u","ch"],"🔆") ] },
    { name:"TH & WH Wing", pattern:"th · wh Digraphs",
      patternDesc:"thin · that · when", skill:"Digraphs",
      activities:["first","last"], miniName:"Blossom Brachi",
      words:[ _w("thin",["th","i","n"],"📏"), _w("that",["th","a","t"],"👆"),
        _w("this",["th","i","s"],"👇"), _w("then",["th","e","n"],"➡️"),
        _w("bath",["b","a","th"],"🛁"), _w("with",["w","i","th"],"🤝"),
        _w("when",["wh","e","n"],"❓"), _w("whip",["wh","i","p"],"🎠") ] },
    { name:"L-Blends Lookout", pattern:"L-Blends",
      patternDesc:"bl · cl · fl · gl · pl · sl", skill:"Consonant Blends",
      activities:["segment-it","first"], miniName:"Temple Tri",
      words:[ _w("clap",["cl","a","p"],"👏"), _w("flag",["fl","a","g"],"🚩"),
        _w("glad",["gl","a","d"],"😄"), _w("plan",["pl","a","n"],"📋"),
        _w("slip",["sl","i","p"],"🫨"), _w("blob",["bl","o","b"],"🫧"),
        _w("club",["cl","u","b"],"🃏"), _w("flat",["fl","a","t"],"🛹") ] },
    { name:"R & S-Blends Ridge", pattern:"R-Blends · S-Blends",
      patternDesc:"cr · dr · fr · gr · tr · st · sn · sp", skill:"Consonant Blends",
      activities:["segment-it","first"], miniName:"Sakura Stego",
      words:[ _w("crab",["cr","a","b"],"🦀"), _w("drip",["dr","i","p"],"💧"),
        _w("frog",["fr","o","g"],"🐸"), _w("grin",["gr","i","n"],"😁"),
        _w("trip",["tr","i","p"],"🧳"), _w("stop",["st","o","p"],"🛑"),
        _w("snap",["sn","a","p"],"🫰"), _w("spin",["sp","i","n"],"🌀"),
        _w("swim",["sw","i","m"],"🏊"), _w("step",["st","e","p"],"👟") ] },
    { name:"Blend Storm Boss", pattern:"Digraph & Blend Boss",
      patternDesc:"Digraphs and blends collide!", skill:"Digraph & Blend Boss",
      activities:["segment-it","first","last"],
      words:[ _w("ship",["sh","i","p"],"🚢"), _w("chat",["ch","a","t"],"💬"),
        _w("that",["th","a","t"],"👆"), _w("clap",["cl","a","p"],"👏"),
        _w("frog",["fr","o","g"],"🐸"), _w("snap",["sn","a","p"],"🫰"),
        _w("step",["st","e","p"],"👟"), _w("thin",["th","i","n"],"📏"),
        _w("flag",["fl","a","g"],"🚩"), _w("grin",["gr","i","n"],"😁") ] },
  ],

  // ════════ WORLD 4 — Long Vowels ════════
  4: [
    { name:"Magic-E Manor · A", pattern:"a_e (Magic-e)",
      patternDesc:"Silent e makes a say its name: cake", skill:"Long Vowels · Magic-e",
      activities:["segment-it","middle"], miniName:"Ruin Raptor",
      words:[ _w("cake",["c","a","ke"],"🎂"), _w("lake",["l","a","ke"],"🏞️"),
        _w("make",["m","a","ke"],"🔨"), _w("bake",["b","a","ke"],"👨‍🍳"),
        _w("gate",["g","a","te"],"🚪"), _w("name",["n","a","me"],"🏷️"),
        _w("game",["g","a","me"],"🎮"), _w("tape",["t","a","pe"],"📼"),
        _w("cane",["c","a","ne"],"🦯"), _w("wave",["w","a","ve"],"🌊") ] },
    { name:"Magic-E Manor · I & O", pattern:"i_e · o_e (Magic-e)",
      patternDesc:"bike · hope", skill:"Long Vowels · Magic-e",
      activities:["segment-it","middle"], miniName:"Stone Stego",
      words:[ _w("bike",["b","i","ke"],"🚲"), _w("kite",["k","i","te"],"🪁"),
        _w("time",["t","i","me"],"⏰"), _w("ride",["r","i","de"],"🛷"),
        _w("hope",["h","o","pe"],"🕊️"), _w("rose",["r","o","se"],"🌹"),
        _w("note",["n","o","te"],"🎵"), _w("bone",["b","o","ne"],"🦴"),
        _w("hole",["h","o","le"],"🕳️"), _w("nose",["n","o","se"],"👃") ] },
    { name:"Vowel Team Vale · I", pattern:"ai · ay · ee · ea",
      patternDesc:"rain · play · feet · leaf", skill:"Long Vowels · Vowel Teams",
      activities:["segment-it","rhyme"], miniName:"Relic Ptero",
      words:[ _w("rain",["r","ai","n"],"🌧️",{rime:"ain"}), _w("pain",["p","ai","n"],"🤕",{rime:"ain"}),
        _w("play",["pl","ay"],"🛝",{rime:"ay"}), _w("day",["d","ay"],"📅",{rime:"ay"}),
        _w("feet",["f","ee","t"],"🦶",{rime:"eet"}), _w("seed",["s","ee","d"],"🌱",{rime:"eed"}),
        _w("leaf",["l","ea","f"],"🍃",{rime:"eaf"}), _w("read",["r","ea","d"],"📖",{rime:"ead"}) ] },
    { name:"Vowel Team Vale · O", pattern:"oa · igh · oo",
      patternDesc:"boat · light · moon", skill:"Long Vowels · Vowel Teams",
      activities:["segment-it","last"], miniName:"Ancient Anky",
      words:[ _w("boat",["b","oa","t"],"⛵",{rime:"oat"}), _w("coat",["c","oa","t"],"🧥",{rime:"oat"}),
        _w("goat",["g","oa","t"],"🐐",{rime:"oat"}), _w("road",["r","oa","d"],"🛣️"),
        _w("light",["l","igh","t"],"💡",{rime:"ight"}), _w("night",["n","igh","t"],"🌙",{rime:"ight"}),
        _w("moon",["m","oo","n"],"🌕",{rime:"oon"}), _w("soon",["s","oo","n"],"⏳",{rime:"oon"}),
        _w("food",["f","oo","d"],"🍔") ] },
    { name:"Long Vowel Boss", pattern:"Long Vowel Boss",
      patternDesc:"Magic-e and vowel teams unite!", skill:"Long Vowel Boss",
      activities:["segment-it","middle","rhyme"],
      words:[ _w("cake",["c","a","ke"],"🎂"), _w("bike",["b","i","ke"],"🚲"),
        _w("hope",["h","o","pe"],"🕊️"), _w("rain",["r","ai","n"],"🌧️",{rime:"ain"}),
        _w("boat",["b","oa","t"],"⛵",{rime:"oat"}), _w("feet",["f","ee","t"],"🦶"),
        _w("kite",["k","i","te"],"🪁"), _w("rose",["r","o","se"],"🌹"),
        _w("goat",["g","oa","t"],"🐐",{rime:"oat"}), _w("light",["l","igh","t"],"💡") ] },
  ],

  // ════════ WORLD 5 — Sight Words & Word Families ════════
  5: [
    { name:"Sight Word Summit I", pattern:"Sight Words",
      patternDesc:"Read tricky words on sight: the · was · said", skill:"Sight Words",
      activities:["sight-word"], challengeEvery:1, miniName:"Terrace Pachy",
      words:[ _w("the",["th","e"],"📘",{sight:true}), _w("was",["w","a","s"],"⏪",{sight:true}),
        _w("said",["s","ai","d"],"🗣️",{sight:true}), _w("you",["y","ou"],"🫵",{sight:true}),
        _w("are",["ar","e"],"〰️",{sight:true}), _w("for",["f","or"],"🎁",{sight:true}),
        _w("to",["t","oo"],"➡️",{sight:true}), _w("he",["h","e"],"👦",{sight:true}) ] },
    { name:"Sight Word Summit II", pattern:"Sight Words",
      patternDesc:"have · they · come · some", skill:"Sight Words",
      activities:["sight-word"], challengeEvery:1, miniName:"Crag Spino",
      words:[ _w("have",["h","a","ve"],"🤲",{sight:true}), _w("they",["th","ey"],"👥",{sight:true}),
        _w("come",["c","o","me"],"🙌",{sight:true}), _w("some",["s","o","me"],"🔢",{sight:true}),
        _w("were",["w","er","e"],"👣",{sight:true}), _w("what",["wh","a","t"],"❔",{sight:true}),
        _w("when",["wh","e","n"],"❓",{sight:true}), _w("from",["fr","o","m"],"📨",{sight:true}) ] },
    { name:"Word Family Falls I", pattern:"-all · -ing · -uck",
      patternDesc:"ball · ring · duck", skill:"Word Families · Rhyme",
      activities:["rhyme","last"], challengeEvery:2, miniName:"Peak Pachy",
      words:[ _w("ball",["b","all"],"⚽",{rime:"all"}), _w("call",["c","all"],"📞",{rime:"all"}),
        _w("fall",["f","all"],"🍂",{rime:"all"}), _w("wall",["w","all"],"🧱",{rime:"all"}),
        _w("ring",["r","ing"],"💍",{rime:"ing"}), _w("king",["k","ing"],"👑",{rime:"ing"}),
        _w("sing",["s","ing"],"🎤",{rime:"ing"}), _w("wing",["w","ing"],"🪽",{rime:"ing"}),
        _w("duck",["d","u","ck"],"🦆",{rime:"uck"}), _w("luck",["l","u","ck"],"🍀",{rime:"uck"}) ] },
    { name:"Word Family Falls II", pattern:"-ump · -and · -est",
      patternDesc:"jump · hand · nest", skill:"Word Families · Final Blends",
      activities:["segment-it","last"], challengeEvery:2, miniName:"Summit Spino",
      words:[ _w("jump",["j","u","mp"],"🤸",{rime:"ump"}), _w("bump",["b","u","mp"],"💥",{rime:"ump"}),
        _w("dump",["d","u","mp"],"🚮",{rime:"ump"}), _w("hand",["h","a","nd"],"✋",{rime:"and"}),
        _w("band",["b","a","nd"],"🎸",{rime:"and"}), _w("land",["l","a","nd"],"🏝️",{rime:"and"}),
        _w("nest",["n","e","st"],"🪺",{rime:"est"}), _w("best",["b","e","st"],"🏅",{rime:"est"}) ] },
    { name:"Power Word Boss", pattern:"Sight & Family Boss",
      patternDesc:"Sight words and rhyming families together!", skill:"Sight & Family Boss",
      activities:["sight-word","rhyme"], challengeEvery:1,
      words:[ _w("the",["th","e"],"📘",{sight:true}), _w("was",["w","a","s"],"⏪",{sight:true}),
        _w("said",["s","ai","d"],"🗣️",{sight:true}), _w("have",["h","a","ve"],"🤲",{sight:true}),
        _w("they",["th","ey"],"👥",{sight:true}), _w("ball",["b","all"],"⚽",{rime:"all"}),
        _w("call",["c","all"],"📞",{rime:"all"}), _w("ring",["r","ing"],"💍",{rime:"ing"}),
        _w("king",["k","ing"],"👑",{rime:"ing"}), _w("jump",["j","u","mp"],"🤸") ] },
  ],

  // ════════ WORLD 6 — Multisyllabic Words & Mastery ════════
  6: [
    { name:"Two-Syllable Trail", pattern:"2-Syllable Words",
      patternDesc:"Chunk it: ro·bot · ti·ger", skill:"Multisyllabic · Syllables",
      activities:["segment-it"], miniName:"Ash Dilo",
      words:[ _w("robot",["ro","bot"],"🤖"), _w("tiger",["ti","ger"],"🐯"),
        _w("sunset",["sun","set"],"🌇"), _w("muffin",["muf","fin"],"🧁"),
        _w("rabbit",["rab","bit"],"🐰"), _w("napkin",["nap","kin"],"🧻"),
        _w("basket",["bas","ket"],"🧺"), _w("picnic",["pic","nic"],"🧺") ] },
    { name:"Compound Crater", pattern:"Compound Words",
      patternDesc:"Two words, one word: cup·cake", skill:"Multisyllabic · Compounds",
      activities:["segment-it","first"], miniName:"Cinder Dilo",
      words:[ _w("cupcake",["cup","cake"],"🧁"), _w("cobweb",["cob","web"],"🕸️"),
        _w("laptop",["lap","top"],"💻"), _w("bathtub",["bath","tub"],"🛁"),
        _w("sandbox",["sand","box"],"🏖️"), _w("hotdog",["hot","dog"],"🌭"),
        _w("popcorn",["pop","corn"],"🍿"), _w("sunset",["sun","set"],"🌇") ] },
    { name:"Three-Syllable Summit", pattern:"3-Syllable Words",
      patternDesc:"vol·ca·no · ba·na·na", skill:"Multisyllabic · Syllables",
      activities:["segment-it"], miniName:"Magma Dilo",
      words:[ _w("volcano",["vol","ca","no"],"🌋"), _w("banana",["ba","na","na"],"🍌"),
        _w("samurai",["sa","mu","rai"],"⚔️"), _w("dinosaur",["di","no","saur"],"🦕"),
        _w("butterfly",["but","ter","fly"],"🦋"), _w("elephant",["el","e","phant"],"🐘"),
        _w("umbrella",["um","brel","la"],"☂️"), _w("computer",["com","pu","ter"],"💻") ] },
    { name:"Expert Blend Bluff", pattern:"Expert Blends",
      patternDesc:"crash · sprint · thrust", skill:"Advanced Blends",
      activities:["segment-it","last"], miniName:"Obsidian Dilo",
      words:[ _w("crash",["cr","a","sh"],"💥"), _w("blend",["bl","e","nd"],"🌀"),
        _w("stomp",["st","o","mp"],"🦶"), _w("chest",["ch","e","st"],"📦"),
        _w("sprint",["spr","i","nt"],"🏃"), _w("shrub",["shr","u","b"],"🌿"),
        _w("crisp",["cr","i","sp"],"🍪"), _w("thrust",["thr","u","st"],"🚀") ] },
    { name:"Grand Mastery Boss", pattern:"Mastery Boss",
      patternDesc:"Every phonics skill — one final battle!", skill:"Mastery Boss",
      activities:["segment-it","rhyme","sight-word","middle"], challengeEvery:2,
      words:[ _w("cake",["c","a","ke"],"🎂"), _w("frog",["fr","o","g"],"🐸"),
        _w("robot",["ro","bot"],"🤖"), _w("the",["th","e"],"📘",{sight:true}),
        _w("crash",["cr","a","sh"],"💥"), _w("ship",["sh","i","p"],"🚢"),
        _w("jump",["j","u","mp"],"🤸",{rime:"ump"}), _w("bump",["b","u","mp"],"💥",{rime:"ump"}),
        _w("volcano",["vol","ca","no"],"🌋"), _w("light",["l","igh","t"],"💡"),
        _w("blend",["bl","e","nd"],"🌀") ] },
  ],
};

// ── Build the flat stage list (global ids 1..30) ──────────────
PHONICS_DATA.WORLDS = [];
PHONICS_DATA.stageList = [];
(function _buildCampaign() {
  let gid = 0;
  _WORLDS_META.forEach((w) => {
    const stageTables = _WORLD_STAGES[w.id] || [];
    const worldStageIds = [];
    stageTables.forEach((st, sIdx) => {
      gid++;
      const isBoss = sIdx === stageTables.length - 1;
      const stage = {
        id: gid,
        world: w.id,
        worldName: w.name,
        worldIcon: w.icon,
        local: sIdx + 1,
        localCount: stageTables.length,
        isBoss,
        name: st.name,
        pattern: st.pattern,
        patternDesc: st.patternDesc,
        skill: st.skill || w.skill,
        activities: st.activities || [],
        challengeEvery: st.challengeEvery ?? (isBoss ? 3 : 4),
        // theme / art (reuse the world's existing art set)
        bg: w.bg,
        arenaBg: `arena-${w.id}`,
        // Boss stages fight the world boss; other stages fight the stage's
        // named mini-boss (unique art where it exists, else the world mini).
        bossFile: isBoss ? w.bossFile : (st.miniFile || `mini-w${w.id}`),
        minionFile: w.minionFile,
        bossName: isBoss ? w.bossName : (st.miniName || `${w.name} Guardian`),
        skyColor: w.skyColor,
        groundColor: w.groundColor,
        accentColor: w.accentColor,
        // difficulty ramp within the world
        runnerSpeed: +(w.runnerSpeed + sIdx * 0.15).toFixed(2),
        blendTime: Math.max(14, Math.round(w.blendTime - sIdx * 1.5)),
        bossHp: w.bossHp + sIdx * 12 + (isBoss ? 30 : 0),
        bossAttack: w.bossAttack + sIdx + (isBoss ? 3 : 0),
        words: st.words.map((x) => Object.assign({ damage: w.dmg + (isBoss ? 4 : 0) }, x)),
      };
      stage.quest = PHONICS_DATA.buildStageQuest(stage);
      PHONICS_DATA.stageList.push(stage);
      PHONICS_DATA[`stage${gid}`] = stage; // legacy lookup compatibility
      worldStageIds.push(gid);
    });
    PHONICS_DATA.WORLDS.push({
      id: w.id, name: w.name, icon: w.icon, skill: w.skill, desc: w.desc,
      accentColor: w.accentColor, bossName: w.bossName,
      stageIds: worldStageIds,
      startId: worldStageIds[0],
      stageCount: worldStageIds.length,
    });
  });
})();

PHONICS_DATA.stageCount = PHONICS_DATA.stageList.length;
PHONICS_DATA.worldCount = PHONICS_DATA.WORLDS.length;

// ── World / stage navigation helpers ─────────────────────────
PHONICS_DATA.getStage      = (id) => PHONICS_DATA.stageList[id - 1] || null;
PHONICS_DATA.getWorld      = (worldId) => PHONICS_DATA.WORLDS[worldId - 1] || null;
PHONICS_DATA.worldOf       = (stageId) => PHONICS_DATA.stageList[stageId - 1]?.world || 1;
PHONICS_DATA.stagesInWorld = (worldId) => PHONICS_DATA.WORLDS[worldId - 1]?.stageIds || [];
PHONICS_DATA.worldStartId  = (worldId) => PHONICS_DATA.WORLDS[worldId - 1]?.startId || 1;

// ── Sequential learning trail helpers ─────────────────────────
// These helpers make the campaign feel like a Mario overworld while
// preserving a strict phonics scope-and-sequence: every stage teaches one
// new reading power, then the next stage reuses it before adding more.
PHONICS_DATA.getStagePrereq = function(stageId) {
  const id = Number(stageId) || 1;
  return id <= 1 ? null : PHONICS_DATA.getStage(id - 1);
};

PHONICS_DATA.getNextStage = function(stageId) {
  const id = Number(stageId) || 1;
  return id >= PHONICS_DATA.stageCount ? null : PHONICS_DATA.getStage(id + 1);
};

PHONICS_DATA.getLearningTrail = function(stageId) {
  const stage = PHONICS_DATA.getStage(stageId);
  if (!stage) return null;
  const prereq = PHONICS_DATA.getStagePrereq(stageId);
  const next = PHONICS_DATA.getNextStage(stageId);
  return {
    stage,
    prereq,
    next,
    focus: stage.patternDesc || stage.pattern || stage.skill,
    quest: stage.quest || null,
    learnedBefore: prereq ? `${prereq.pattern} from Stage ${prereq.world}-${prereq.local}` : 'Start here: listening for sounds',
    unlocksNext: next ? `${next.pattern} in Stage ${next.world}-${next.local}` : 'Full phonics mastery review',
  };
};

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

// ── CONTENT CATEGORY PACKS ────────────────────────────────────
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
  { theme:"CK Endings", emoji:"🦆", wordObjs:[
    { word:"duck",  phonemes:["d","u","ck"],  hint:"🦆" },
    { word:"kick",  phonemes:["k","i","ck"],  hint:"🦵" },
    { word:"lock",  phonemes:["l","o","ck"],  hint:"🔒" },
    { word:"rock",  phonemes:["r","o","ck"],  hint:"🪨" },
    { word:"sock",  phonemes:["s","o","ck"],  hint:"🧦" },
    { word:"sick",  phonemes:["s","i","ck"],  hint:"🤒" },
  ]},
  { theme:"NG Endings", emoji:"🔔", wordObjs:[
    { word:"ring",  phonemes:["r","i","ng"],  hint:"💍" },
    { word:"king",  phonemes:["k","i","ng"],  hint:"👑" },
    { word:"song",  phonemes:["s","o","ng"],  hint:"🎵" },
    { word:"long",  phonemes:["l","o","ng"],  hint:"📏" },
    { word:"wing",  phonemes:["w","i","ng"],  hint:"🪽" },
    { word:"sing",  phonemes:["s","i","ng"],  hint:"🎤" },
  ]},
  { theme:"Final Blends", emoji:"🐜", wordObjs:[
    { word:"ant",   phonemes:["a","n","t"],   hint:"🐜" },
    { word:"jump",  phonemes:["j","u","mp"],  hint:"🤸" },
    { word:"hand",  phonemes:["h","a","nd"],  hint:"✋" },
    { word:"milk",  phonemes:["m","i","lk"],  hint:"🥛" },
    { word:"belt",  phonemes:["b","e","lt"],  hint:"🥋" },
    { word:"lamp",  phonemes:["l","a","mp"],  hint:"💡" },
  ]},
  { theme:"Long-U", emoji:"🎲", wordObjs:[
    { word:"cube",  phonemes:["c","u","be"],  hint:"🎲" },
    { word:"tube",  phonemes:["t","u","be"],  hint:"🧴" },
    { word:"mule",  phonemes:["m","u","le"],  hint:"🐴" },
    { word:"cute",  phonemes:["c","u","te"],  hint:"🥰" },
    { word:"fuse",  phonemes:["f","u","se"],  hint:"🧨" },
    { word:"dune",  phonemes:["d","u","ne"],  hint:"🏜️" },
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

// Campaign helpers (stageId is the global 1..30 id)
PHONICS_DATA.getRunnerCoins = function(stageId) {
  const stage = PHONICS_DATA.stageList[stageId - 1];
  const selected = stage.words.slice(0, 5);
  const coins = [];
  selected.forEach((w, wIdx) => {
    // Sight words are collected as one whole-word coin (recognise on sight),
    // every other word is broken into its phoneme coins.
    if (w.sight) {
      coins.push({ phoneme: w.word, wordId: wIdx, phIdx: 0, hint: w.hint, word: w.word, sight: true });
    } else {
      w.phonemes.forEach((ph, pIdx) => {
        coins.push({ phoneme: ph, wordId: wIdx, phIdx: pIdx, hint: w.hint, word: w.word });
      });
    }
  });
  return coins;
};

PHONICS_DATA.getBattleWords = function(stageId) {
  return PHONICS_DATA.stageList[stageId - 1].words;
};
