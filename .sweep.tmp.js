const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/samurice-dino-slash';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(d);});});
(async()=>{
  await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const port=srv.address().port;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--mute-audio','--no-sandbox']});
  const p=await b.newPage({viewport:{width:900,height:560}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});
  await p.waitForFunction(()=>!!window._progressTracker,null,{timeout:20000});
  // Give the player a realistic save so screens have content.
  await p.evaluate(()=>{
    const t=window._progressTracker;
    for(let i=1;i<=9;i++) t.unlockStage(i);
    // Give the stages real blend history so stars and accuracy are real.
    for(let i=1;i<=8;i++){
      const st=PHONICS_DATA.stageList[i-1];
      st.words.slice(0,6).forEach((w,k)=>t.recordBlend(i,w.word,k%5!==0,k%3===0,w.phonemes||[]));
      t.completeStage(i, 900+i*40);
    }
    t.data.loginStreak=4;
    ['first-blend','words-50','slip-recover','daily-streak3'].forEach(a=>{try{t.unlock(a);}catch(e){}});
    const L=window.Review.shared(); L.reset();
    PHONICS_DATA.stageList.slice(0,6).forEach(s=>s.words.slice(0,4).forEach(w=>L.introduce(w.word,s.id)));
    for(let i=0;i<10;i++){ const w=PHONICS_DATA.stageList[0].words[i%5]; if(w) L.grade(w.word, i%4!==0, {stage:1}); }
    ['was','said','they'].forEach(w=>{ L.grade(w,false,{stage:5}); L.grade(w,false,{stage:5}); });
  });
  await p.evaluate(()=>window.launchSlashGame());
  await p.waitForFunction(()=>typeof _slashGameInstance!=='undefined'&&_slashGameInstance&&_slashGameInstance._spritesReady&&_slashGameInstance._sheetsReady,null,{timeout:60000});
  const shot=async(name,setup)=>{
    await p.evaluate(setup);
    await p.waitForTimeout(900);
    await p.screenshot({path:`shots/sw-${name}.png`});
    console.log('shot', name);
  };
  await shot('achievements', ()=>{ _slashGameInstance.state='achievements'; _slashGameInstance._achScroll=0; });
  await shot('achievements-scrolled', ()=>{ _slashGameInstance._achScroll=140; });
  await shot('ach-scrolled2', ()=>{ _slashGameInstance.state='achievements'; _slashGameInstance._achScroll=9999; });
  await shot('shop', ()=>{ _slashGameInstance._startShop(); });
  await shot('shop-scrolled', ()=>{ _slashGameInstance._shopScroll=9999; });
  await shot('leaderboard', ()=>{ _slashGameInstance.state='leaderboard'; });
  await shot('worldmap', ()=>{ _slashGameInstance.state='world-map'; });
  await shot('stageselect', ()=>{ _slashGameInstance.state='stage-select'; _slashGameInstance._menuSel=1; });
  await shot('daily', ()=>{ _slashGameInstance._startDaily(); });
  await shot('endless', ()=>{ _slashGameInstance._startEndlessRunner(); });
  await p.waitForTimeout(2500); await p.screenshot({path:'shots/sw-endless-live.png'});
  await shot('endless-over', ()=>{ const g=_slashGameInstance;
    g.progress.data.runLog=[]; g.progress.setPlayerName('Mia');
    g.progress.recordEndlessRun(2400,910,7); g.progress.recordEndlessRun(1240,620,4);
    g._stopEndlessRunner&&g._stopEndlessRunner();
    g._lastEndlessResult={score:1240,dist:620,grains:48,combo:4};
    g._endlessGameoverAge=0; g.state='endless-gameover'; });
  await shot('recordbook', ()=>{ _slashGameInstance.state='leaderboard'; });
  await shot('recordbook-empty', ()=>{ _slashGameInstance.progress.data.runLog=[]; _slashGameInstance._sceneHolders.leaderboard={}; _slashGameInstance.state='leaderboard'; });
  // DOM parent dashboard
  await p.evaluate(()=>{ _slashGameInstance && (_slashGameInstance.state='mode-select'); });
  await p.evaluate(()=>{ window._parentDashboard.show(); });
  await p.waitForTimeout(1200);
  for (const [n,y] of [['top',0],['mid',560],['mid2',1120],['bottom',99999]]) {
    await p.evaluate(v=>document.querySelector('.pd-body').scrollTo(0,v), y);
    await p.waitForTimeout(350);
    await p.screenshot({path:`shots/sw-pd-${n}.png`});
  }
  console.log('errors', JSON.stringify(errs.slice(0,6)));
  await b.close(); srv.close();
})();
