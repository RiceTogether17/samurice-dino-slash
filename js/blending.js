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
    {word: "SOYA",   phonemes: ["SO","YA"],      damage: 35}
];

let currentMove = null;
let playerSequence = [];
let timerInterval = null;

function startBlend() {
    currentMove = moves[Math.floor(Math.random() * moves.length)];
    playerSequence = [];
    
    const modal = document.getElementById('blendModal');
    modal.style.display = 'flex';
    document.getElementById('blendTitle').textContent = `Blend to ${currentMove.word.toUpperCase()}! ⚔️`;
    
    const area = document.getElementById('phonemeArea');
    area.innerHTML = '';
    
    currentMove.phonemes.forEach(ph => {
        const btn = document.createElement('div');
        btn.className = 'phoneme';
        btn.textContent = ph;
        btn.onclick = () => {
            playerSequence.push(ph);
            btn.style.background = '#32cd32';
            if (playerSequence.length === currentMove.phonemes.length) {
                setTimeout(checkBlend, 280);
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
        result.success = true;
        result.damage = currentMove.damage;
        
        if (timeLeft > 85) { result.multiplier = 1.6; result.grade = "PERFECT"; }
        else if (timeLeft > 55) { result.multiplier = 1.3; result.grade = "Great"; }
        else { result.multiplier = 1; result.grade = "Good"; }
    }
    
    modal.style.display = 'none';
    processBlendResult(result);   // calls main.js function
}

function checkTypedWord() {
    const input = document.getElementById('typeInput').value.trim().toUpperCase();
    if (input === currentMove.word) {
        document.getElementById('blendModal').style.display = 'none';
        clearInterval(timerInterval);
        processBlendResult({
            success: true,
            word: currentMove.word,
            damage: currentMove.damage,
            multiplier: 1.4,
            grade: "Typed!"
        });
    } else {
        failBlend();
    }
}

function speakAll() {
    if ('speechSynthesis' in window) {
        currentMove.phonemes.forEach(p => {
            const u = new SpeechSynthesisUtterance(p);
            speechSynthesis.speak(u);
        });
        setTimeout(() => {
            const full = new SpeechSynthesisUtterance(currentMove.word);
            speechSynthesis.speak(full);
        }, 900);
    }
}

function failBlend() {
    clearInterval(timerInterval);
    document.getElementById('blendModal').style.display = 'none';
    processBlendResult({ success: false });
}

function closeModal() {
    document.getElementById('blendModal').style.display = 'none';
    clearInterval(timerInterval);
}
