// =============== GAME STATE ===============
let level = 1;
let score = 0;
let rikuHp = 100;
let dinoHp = 100;
let currentDinoMaxHp = 100;
let dinoAttackInterval = null;
let comboMultiplier = 1;

const dinos = [
    { name: "Baby Raptor",   emoji: "🦕", file: "raptor1.png",       hp: 110, attack: 11 },
    { name: "Velociraptor",  emoji: "🦖", file: "velociraptor.png",  hp: 140, attack: 15 },
    { name: "Stegosaurus",   emoji: "🦕", file: "stegosaurus.png",   hp: 170, attack: 19 },
    { name: "Triceratops",   emoji: "🦖", file: "triceratops.png",   hp: 210, attack: 24 },
    { name: "T-Rex Boss",    emoji: "🦖", file: "trex.png",          hp: 270, attack: 32 }
];

const rikuStates = { idle: "idle.png", attack: "attack.png", hurt: "hurt.png", victory: "victory.png" };

// =============== INIT ===============
function startGame() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameScreen').classList.add('active');
    level = 1;
    score = 0;
    rikuHp = 100;
    loadLevel();
}

function loadLevel() {
    const d = dinos[level-1];
    document.getElementById('levelNum').textContent = level;
    document.getElementById('dinoName').textContent = d.name;
    document.getElementById('dinoSprite').src = `assets/${d.file}`;
    dinoHp = d.hp;
    currentDinoMaxHp = d.hp;
    updateHP();
    
    clearInterval(dinoAttackInterval);
    dinoAttackInterval = setInterval(dinoAutoAttack, 8500 - (level * 700));
}

function updateHP() {
    document.getElementById('rikuHpText').textContent = Math.max(0, rikuHp);
    document.getElementById('rikuHpFill').style.width = rikuHp + '%';
    
    const dinoPercent = Math.max(0, (dinoHp / currentDinoMaxHp) * 100);
    document.getElementById('dinoHpFill').style.width = dinoPercent + '%';
    document.getElementById('dinoHpText').textContent = Math.max(0, Math.floor(dinoHp));
}

// =============== SPRITE HELPERS ===============
function setRikuState(state) {
    const img = document.getElementById('rikuSprite');
    img.src = `assets/${rikuStates[state]}`;
    if (state === 'attack') setTimeout(() => setRikuState('idle'), 420);
    if (state === 'hurt') setTimeout(() => setRikuState('idle'), 520);
}

function createFloatingDamage(x, dmg, multiplier = 1) {
    const dmgEl = document.createElement('div');
    dmgEl.className = 'floating-dmg';
    dmgEl.textContent = multiplier > 1 ? `-${dmg}×${multiplier}` : `-${dmg}`;
    dmgEl.style.left = x + 'px';
    dmgEl.style.bottom = '180px';
    document.getElementById('arena').appendChild(dmgEl);
    setTimeout(() => dmgEl.remove(), 1400);
}

// =============== ATTACK & BLEND RESULT ===============
function processBlendResult(result) {
    if (!result.success) {
        document.getElementById('status').innerHTML = '❌ Blend failed!';
        rikuHp -= 15;
        setRikuState('hurt');
        updateHP();
        if (rikuHp <= 0) endGame(false);
        return;
    }

    // SUCCESS
    const finalDamage = Math.floor(result.damage * result.multiplier);
    dinoHp -= finalDamage;
    
    setRikuState('attack');
    createFloatingDamage(520, finalDamage, result.multiplier);
    
    document.getElementById('status').innerHTML = `⚔️ <strong>${result.word}!</strong> ${result.grade} hit!`;
    
    const dinoEl = document.getElementById('dinoSprite');
    dinoEl.style.transform = 'scaleX(-1) scale(1.25)';
    setTimeout(() => dinoEl.style.transform = 'scaleX(-1)', 180);
    
    updateHP();
    score += finalDamage * 2;
    document.getElementById('score').textContent = score;
    
    if (dinoHp <= 0) {
        clearInterval(dinoAttackInterval);
        setTimeout(() => {
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('winScreen').classList.add('active');
            document.getElementById('victoryRiku').src = 'assets/victory.png';
        }, 600);
    }
}

// =============== DINO AUTO ATTACK ===============
function dinoAutoAttack() {
    document.getElementById('status').textContent = '🦖 Dino charges!';
    rikuHp -= dinos[level-1].attack;
    setRikuState('hurt');
    updateHP();
    if (rikuHp <= 0) endGame(false);
}

// =============== GAME FLOW ===============
function nextLevel() {
    if (level < 5) {
        level++;
        document.getElementById('winScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('active');
        loadLevel();
    } else {
        alert("🏆 YOU DEFEATED ALL DINOSAURS! Riku is the ultimate Samurice! 🏆");
        goToMenu();
    }
}

function endGame(won) {
    clearInterval(dinoAttackInterval);
    document.getElementById('gameScreen').classList.remove('active');
    if (won) {
        document.getElementById('winScreen').classList.add('active');
    } else {
        document.getElementById('loseScreen').classList.add('active');
    }
}

function restartGame() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    startGame();
}

function goToMenu() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('modeChooser').classList.add('active');
}

function showTutorial() {
    alert(`HOW TO PLAY\n\n1. Click "BLEND ATTACK!"\n2. Click phoneme tiles in the CORRECT ORDER\n   OR type the full word\n3. Faster + perfect = bigger damage!\n\nDefeat all 5 dinosaurs to win!\n\nGood luck, Riku! 🍣⚔️`);
}

// Keyboard shortcut
document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'b' && document.getElementById('gameScreen').classList.contains('active')) {
        startBlend();
    }
});
