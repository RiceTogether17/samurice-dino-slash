// paste the full upgraded logic here (I kept it short for now)
let currentRikuState = 'idle';
function setRikuState(state) {
  currentRikuState = state;
  const riku = document.getElementById('riku');
  riku.src = `assets/riku/${state}.png`;
  if (state === 'attack') setTimeout(() => setRikuState('idle'), 400);
}
