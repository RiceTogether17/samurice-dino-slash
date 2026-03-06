// === CHANGE LOG ===
// Step 2 (Phonics & Battle System):
// - Added tile hover/click pronunciation with SpeechSynthesis.
// - Added phoneme tile colour groups + live right/wrong flash feedback.
// - Added streak multiplier and slash-type grading from speed + accuracy.
// - Added adaptive move selection using ProgressTracker weak phoneme data.
// ============================================================
// =============== BLENDING MINI-GAME (from PhonicsQuest style) ===============
const moves = [
    {word: "CUT",    phonemes: ["C","U","T"],    damage: 28},
    {word: "HIT",    phonemes: ["H","I","T"],    damage: 26},
    {word: "SLASH",  phonemes: ["SL","A","SH"],  damage: 48},
    {word: "CHOP",   phonemes: ["CH","O","P"],   damage: 42},
    {word: "STRIKE", phonemes: ["ST","RI","KE"], damage: 55},
    {word: "BLOCK",  phonemes: ["BL","O","CK"],  damage: 22},
    {word: "RICE",   phonemes: ["R","I","CE"],   damage: 38},
    {word: "KATANA", phonemes: ["KA","TA","NA"], damage: 65},
    {word: "SOYA",   phonemes: ["SO","YA"],        damage: 35}
];

let currentMove = null;
let playerSequence = [];
let timerInterval = null;
let blendStreak = 0;

function _phonemeGroup(ph) {
    const p = String(ph || '').toLowerCase();
    if (["a","e","i","o","u"].includes(p)) return 'vowel';
    if (/^(sh|ch|th|wh|ph|ck|ng)$/.test(p)) return 'digraph';
    if (p.length > 1) return 'blend';
    return 'cons';
}

function _tileColor(group) {
    if (group === 'vowel') return 'linear-gradient(160deg,#B3E5FC,#4FC3F7)';
    if (group === 'digraph') return 'linear-gradient(160deg,#D1C4E9,#9575CD)';
    if (group === 'blend') return 'linear-gradient(160deg,#C8E6C9,#66BB6A)';
    return 'linear-gradient(160deg,#FFE0B2,#FFB74D)';
}

function _speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 0.85;
    u.pitch = 1.08;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
}

function _pickAdaptiveMove() {
    try {
        if (!window.ProgressTracker) return moves[Math.floor(Math.random() * moves.length)];
        const tracker = new ProgressTracker();
        // Legacy blend modal is outside staged battle; use stage 1 weak profile.
        const weak = tracker.getWeakPhonemes?.(1) || {};
        const ranked = moves
            .map((m) => ({
                move: m,
                score: m.phonemes.reduce((sum, ph) => sum + (weak[String(ph).toLowerCase()] || 0), 0) + Math.random() * 0.4,
            }))
            .sort((a, b) => b.score - a.score);
        return ranked[0]?.move || moves[Math.floor(Math.random() * moves.length)];
    } catch {
        return moves[Math.floor(Math.random() * moves.length)];
    }
}

function startBlend() {
    currentMove = _pickAdaptiveMove();
    playerSequence = [];

    const modal = document.getElementById('blendModal');
    modal.style.display = 'flex';
    document.getElementById('blendTitle').textContent = `Blend to ${currentMove.word.toUpperCase()}! ⚔️`;

    const area = document.getElementById('phonemeArea');
    area.innerHTML = '';

    currentMove.phonemes.forEach((ph, idx) => {
        const btn = document.createElement('div');
        btn.className = 'phoneme';
        btn.textContent = ph;
        btn.style.background = _tileColor(_phonemeGroup(ph));

        const pronounce = () => _speak(ph);
        btn.onmouseenter = pronounce;
        btn.ontouchstart = pronounce;

        btn.onclick = () => {
            pronounce();
            const expected = currentMove.phonemes[playerSequence.length];
            if (ph !== expected) {
                btn.style.outline = '3px solid #ff5252';
                btn.style.boxShadow = '0 0 12px rgba(244,67,54,0.9)';
                setTimeout(() => { btn.style.outline = 'none'; btn.style.boxShadow = ''; }, 220);
                playerSequence = [];
                document.querySelectorAll('#phonemeArea .phoneme').forEach(el => {
                    el.style.filter = 'none';
                    el.style.opacity = '1';
                });
                return;
            }

            playerSequence.push(ph);
            btn.style.outline = '3px solid #69f0ae';
            btn.style.boxShadow = '0 0 12px rgba(105,240,174,0.95)';
            btn.style.filter = 'grayscale(0.4)';
            btn.style.opacity = '0.7';
            if (playerSequence.length === currentMove.phonemes.length) {
                setTimeout(checkBlend, 240);
            }
        };
        area.appendChild(btn);
    });

    // Timer (12 seconds)
    let timeLeft = 12;
    const bar = document.getElementById('timerBar');
    bar.style.width = '100%';
    bar.style.background = '#4caf50';

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        bar.style.width = (timeLeft / 12 * 100) + '%';
        if (timeLeft < 3) bar.style.background = '#f00';
        if (timeLeft <= 0) failBlend();
    }, 100);
}

function checkBlend() {
    clearInterval(timerInterval);
    const modal = document.getElementById('blendModal');
    const correct = playerSequence.join('') === currentMove.phonemes.join('');

    let result = { success: false, word: currentMove.word, damage: 0, multiplier: 1, grade: "Miss" };

    if (correct) {
        const timeLeft = parseFloat(document.getElementById('timerBar').style.width);
        const speedScore = Math.max(0, timeLeft / 100);
        blendStreak += 1;

        let slashType = 'Standard Slash';
        let slashMult = 1.0;
        if (speedScore > 0.72) { slashType = 'Speed Slash'; slashMult = 1.2; }
        if (speedScore > 0.86 && blendStreak >= 3) { slashType = 'Precision Slash'; slashMult = 1.4; }

        result.success = true;
        result.damage = currentMove.damage;
        result.multiplier = Number((slashMult + Math.min(0.55, blendStreak * 0.08)).toFixed(2));
        result.grade = `${slashType} • Streak x${blendStreak}`;
    } else {
        blendStreak = 0;
    }

    modal.style.display = 'none';
    processBlendResult(result);   // calls main.js function
}

function checkTypedWord() {
    const input = document.getElementById('typeInput').value.trim().toUpperCase();
    if (input === currentMove.word) {
        document.getElementById('blendModal').style.display = 'none';
        clearInterval(timerInterval);
        blendStreak += 1;
        processBlendResult({
            success: true,
            word: currentMove.word,
            damage: currentMove.damage,
            multiplier: Number((1.25 + Math.min(0.45, blendStreak * 0.07)).toFixed(2)),
            grade: `Typed Precision • Streak x${blendStreak}`
        });
    } else {
        failBlend();
    }
}

function speakAll() {
    if ('speechSynthesis' in window) {
        currentMove.phonemes.forEach((p, i) => {
            setTimeout(() => _speak(p), i * 320);
        });
        setTimeout(() => _speak(currentMove.word), 900);
    }
}

function failBlend() {
    clearInterval(timerInterval);
    blendStreak = 0;
    document.getElementById('blendModal').style.display = 'none';
    processBlendResult({ success: false });
}

function closeModal() {
    document.getElementById('blendModal').style.display = 'none';
    clearInterval(timerInterval);
}
