const $ = s => document.querySelector(s);
let historyAbsentOnly = false;
let state = null, werewolfState = null, werewolfPollBusy = false, werewolfActionBusy = false, werewolfForceLobby = false, werewolfRequestSeq = 0, bingoState = null, bingoWinnerSignature = null, bingoPollCounter = 0, impostorState = null, impostorPollBusy = false, page = 'dashboard', selectedSession = 's1630', selectedDate = new Date().toLocaleDateString('en-CA'), auditData = null, auditRange = { from: '', to: '', q: '' }, wheelRotation = 0, wheelBusy = false, savedWheelTeams = null;
const pageNames = { dashboard:'ภาพรวม', bingo:'BINGO', impostor:'IMPOSTOR', werewolf:'WEREWOLF', wheel:'วงล้อชื่อ', audit:'ประวัติการทำงาน', attendance:'ระบบเช็กชื่อ', members:'สมาชิก', inventory:'คลังไอเทม', deliveries:'ระบบส่งของ', history:'ประวัติ' };
const statusNames = { present:'มา', late:'มาสาย', absent:'ขาด', leave:'ลา', business:'ติดธุระ', unmarked:'ยังไม่เช็ก' };
const statusClass = { present:'green', late:'yellow', absent:'red', leave:'blue', business:'yellow', unmarked:'red' };
const money = n => '฿' + Number(n || 0).toLocaleString('th-TH');
const fmt = s => s ? new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}) : '-';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* GANG CONTROL REAL AUDIO ENGINE — CC0 MP3 assets (no synthesized Web Audio tones) */
const GCSound = (()=>{
 const defaults={enabled:true,volume:0.72};
 let settings={...defaults};
 try{settings={...defaults,...JSON.parse(localStorage.getItem('gcSoundSettings')||'{}')}}catch{}
 let unlocked=false;
 const assets={
  // Realistic creature sounds
  wolf:'https://sfxmint.com/dl/werewolf-howl-05.mp3',
  night:'https://sfxmint.com/dl/werewolf-howl-04.mp3',
  wolfAttack:'https://sfxmint.com/dl/wolf-growl-03.mp3',
  kill:'https://sfxmint.com/dl/wolf-growl-03.mp3',
  death:'https://sfxmint.com/dl/wolf-growl-03.mp3',
  winWolf:'https://sfxmint.com/dl/werewolf-howl-05.mp3',
  // Fantasy role / action sounds
  protect:'https://spritepilot.com/free-assets/sound-effects/magic/magic-shield.mp3',
  seer:'https://spritepilot.com/free-assets/sound-effects/magic/curse.mp3',
  witch:'https://spritepilot.com/free-assets/sound-effects/magic/spell-cast.mp3',
  potion:'https://spritepilot.com/free-assets/sound-effects/magic/potion.mp3',
  poison:'https://spritepilot.com/free-assets/sound-effects/magic/poison.mp3',
  hunter:'https://spritepilot.com/free-assets/sound-effects/magic/spell-cast.mp3',
  draw:'https://spritepilot.com/free-assets/sound-effects/magic/spell-cast.mp3',
  jester:'https://sfxmint.com/dl/growth-bfe32e67e3de9719a78a5544-part-1-v2.mp3',
  // UI / round results use real magical chimes rather than synthesized tones
  start:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  success:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  finish:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  dawn:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  bell:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  winVillage:'https://spritepilot.com/free-assets/sound-effects/magic/heal.mp3',
  vote:'https://spritepilot.com/free-assets/sound-effects/magic/spell-cast.mp3',
  voteResult:'https://spritepilot.com/free-assets/sound-effects/magic/curse.mp3',
  lose:'https://spritepilot.com/free-assets/sound-effects/magic/curse.mp3',
  error:'https://spritepilot.com/free-assets/sound-effects/magic/poison.mp3',
  join:'https://spritepilot.com/free-assets/sound-effects/magic/spell-cast.mp3',
  tap:null
 };
 const save=()=>{try{localStorage.setItem('gcSoundSettings',JSON.stringify(settings))}catch{}};
 function unlock(){unlocked=true;return Promise.resolve(true)}
 function play(kind='tap'){
  if(!settings.enabled||settings.volume<=0)return Promise.resolve(false);
  const url=assets[kind]||null;if(!url)return Promise.resolve(false);
  const audio=new Audio(url);audio.preload='auto';audio.volume=Math.max(0,Math.min(1,settings.volume));
  // Each event gets its own Audio instance so overlapping game events do not cut one another off.
  return audio.play().then(()=>new Promise(resolve=>{audio.addEventListener('ended',()=>resolve(true),{once:true});audio.addEventListener('error',()=>resolve(false),{once:true});setTimeout(()=>resolve(true),12000)})).catch(()=>false);
 }
 async function testAll(){
  if(!settings.enabled)return;
  const sequence=['wolf','wolfAttack','protect','seer','potion','poison','hunter','jester','bell','death','winWolf','winVillage','lose'];
  for(const kind of sequence){await play(kind);await new Promise(resolve=>setTimeout(resolve,180));}
 }
 function update(patch){settings={...settings,...patch};save();}
 function get(){return {...settings,unlocked};}
 return {play,testAll,update,get,unlock};
})();

function installGCSoundUI(){
 if(document.getElementById('gcSoundDock'))return;
 const dock=document.createElement('div');dock.id='gcSoundDock';dock.innerHTML=`<style>#gcSoundDock{position:fixed;right:18px;bottom:18px;z-index:14000;font-family:inherit}#gcSoundDock button{cursor:pointer}#gcSoundToggle{width:46px;height:46px;border:1px solid #64748b;border-radius:50%;background:#172033;color:#fff;font-size:19px;box-shadow:0 5px 18px #0004}#gcSoundPanel{display:none;position:absolute;right:0;bottom:56px;width:260px;padding:15px;border:1px solid #64748b;border-radius:14px;background:#111c2b;color:#f4f7fb;box-shadow:0 12px 35px #0006}#gcSoundPanel.open{display:grid;gap:11px}#gcSoundPanel label{font-size:12px;color:#cbd5e1;display:flex;justify-content:space-between;gap:8px}#gcSoundPanel input[type=range]{width:100%}#gcSoundTest{padding:8px;border-radius:8px;background:#245b78;color:#fff;border:0;font-weight:800}</style><button id="gcSoundToggle" aria-label="ตั้งค่าเสียง" title="ตั้งค่าเสียง">🔊</button><div id="gcSoundPanel"><b>🔊 GANG CONTROL SOUND</b><label>เปิดใช้งานเสียง <input id="gcSoundEnabled" type="checkbox"></label><label>ระดับเสียง <span id="gcSoundValue">72%</span></label><input id="gcSoundVolume" type="range" min="0" max="100" step="5"><small style="color:#94a3b8">เสียงไฟล์จริง: หมาป่าสมจริง + เวทมนตร์แฟนตาซี</small><button id="gcSoundTest">▶ ทดสอบเสียงทุกบทบาท</button><small id="gcSoundHint" style="color:#fbbf24">หากยังไม่มีเสียง ให้แตะปุ่มทดสอบเสียงหนึ่งครั้ง</small><small style="color:#94a3b8">การตั้งค่าจะบันทึกไว้ในอุปกรณ์นี้</small></div>`;
 document.body.appendChild(dock);
 const $s=id=>dock.querySelector('#'+id),sync=()=>{const s=GCSound.get();$s('gcSoundEnabled').checked=s.enabled;$s('gcSoundVolume').value=Math.round(s.volume*100);$s('gcSoundValue').textContent=Math.round(s.volume*100)+'%';$s('gcSoundToggle').textContent=s.enabled?'🔊':'🔇';};
 $s('gcSoundToggle').onclick=async()=>{await GCSound.unlock();$s('gcSoundPanel').classList.toggle('open');GCSound.play('tap')};
 $s('gcSoundEnabled').onchange=async e=>{GCSound.update({enabled:e.target.checked});sync();if(e.target.checked){await GCSound.unlock();GCSound.play('start')}};
 $s('gcSoundVolume').oninput=e=>{const volume=Number(e.target.value)/100;GCSound.update({volume});$s('gcSoundValue').textContent=e.target.value+'%'};
 $s('gcSoundTest').onclick=async()=>{await GCSound.unlock();$s('gcSoundHint').textContent='กำลังเล่นตัวอย่างไฟล์เสียงจริงแต่ละบทบาท…';await GCSound.testAll();$s('gcSoundHint').textContent='ทดสอบครบแล้ว หากไม่ได้ยินให้ตรวจอินเทอร์เน็ต ระดับเสียง และแท็บเบราว์เซอร์';};
 // Browser audio policies require a user gesture. Unlock on the first real interaction.
 const unlockOnce=()=>{GCSound.unlock();document.removeEventListener('pointerdown',unlockOnce,true);document.removeEventListener('keydown',unlockOnce,true);};
 document.addEventListener('pointerdown',unlockOnce,true);document.addEventListener('keydown',unlockOnce,true);
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.closest('#gcSoundDock'))GCSound.play('tap')},true);
 sync();
}

function installImpostorStyles(){if($('#impostorStyles'))return;const st=document.createElement('style');st.id='impostorStyles';st.textContent=`
.im-shell{--im-bg:#0b1018;--im-panel:#121c29;--im-line:#25364a;background:radial-gradient(circle at 85% 0%,#233a55 0,#101a28 35%,#0a111b 75%);color:#eaf1f8;border:1px solid #29394c;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px #02081266}.im-hero{padding:27px 30px;background:linear-gradient(110deg,#101a28,#192b40 58%,#33243a);border-bottom:1px solid #34465b;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.im-kicker{font-size:10px;letter-spacing:3px;color:#8eb6d7;font-weight:900}.im-hero h2{font-size:clamp(34px,5vw,54px);letter-spacing:2px;margin:6px 0;color:#fff;font-weight:1000}.im-hero p{color:#b7c6d6;margin:0}.im-pill{padding:8px 12px;border:1px solid #52677e;background:#ffffff0d;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:1px}.im-body{padding:20px;display:grid;gap:16px}.im-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.im-panel{background:linear-gradient(145deg,#162333,#111b28);border:1px solid #2b3c50;border-radius:15px;padding:17px;box-shadow:0 8px 24px #02081233}.im-panel h3{margin:0 0 7px;color:#f1f6fb}.im-muted{font-size:12px;color:#9cafc1}.im-btn{border:1px solid #7193b2;background:linear-gradient(110deg,#477da7,#315c80);color:#fff;border-radius:10px;padding:11px 16px;font-weight:900;cursor:pointer}.im-btn:disabled{opacity:.4;cursor:not-allowed}.im-btn.ghost{background:#172638;border-color:#40556b}.im-btn.red{background:linear-gradient(110deg,#b94b55,#87313c);border-color:#d16a72}.im-field{display:grid;gap:6px}.im-field label{font-size:11px;color:#9fb4c9;font-weight:800}.im-field input,.im-field select,.im-field textarea{width:100%;border:1px solid #40546b;background:#0d1723;color:#f4f7fb;border-radius:9px;padding:11px;outline:none}.im-room{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.im-code{font:900 20px ui-monospace,monospace;letter-spacing:4px;color:#9ed1f5}.im-players{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}.im-player{padding:11px 12px;border:1px solid #31465b;border-radius:10px;background:#0e1926;font-size:13px}.im-player small{display:block;color:#8da4ba;margin-top:3px}.im-secret{padding:20px;border:1px solid #8a6c40;border-radius:14px;background:linear-gradient(130deg,#352c1c,#1e2530);text-align:center}.im-secret .word{font-size:clamp(26px,4vw,40px);font-weight:1000;color:#ffe2a6;letter-spacing:1px}.im-secret.im-bad{border-color:#9c4653;background:linear-gradient(130deg,#3a1e29,#1e2530)}.im-clues{display:grid;gap:8px}.im-clue{display:flex;gap:10px;padding:10px;border-radius:9px;background:#0d1824;border:1px solid #283b50}.im-clue b{color:#a9c9e4;min-width:100px}.im-vote{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px;border:1px solid #34485d;background:#0d1824;border-radius:10px}.im-rule{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start;margin:10px 0}.im-rule span{width:28px;height:28px;border-radius:8px;background:#29445e;display:grid;place-items:center;font-weight:900;color:#b9dcf5}.im-result{text-align:center;padding:24px;border:1px solid #526b83;border-radius:14px;background:linear-gradient(135deg,#1d3044,#172130)}.im-result h2{font-size:30px;margin:6px 0}.im-lobby-card{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px;border:1px solid #2b3e52;border-radius:12px;background:#0e1926}.im-toast-note{padding:10px 12px;border-radius:10px;background:#1b3044;color:#c5dff3;font-size:12px}
@media(max-width:680px){.im-grid{grid-template-columns:1fr}.im-body{padding:11px}.im-hero{padding:20px}.im-panel{padding:13px}.im-vote{align-items:flex-start}}
`;document.head.appendChild(st)}


function installWerewolfStyles(){if($('#werewolfStyles'))return;const st=document.createElement('style');st.id='werewolfStyles';st.textContent=`
.ww-shell{--ww-line:#344354;background:radial-gradient(ellipse at 50% -15%,#39445c 0,#171d2b 42%,#0a0e17 100%);color:#f3f0e8;border:1px solid #3c4657;border-radius:20px;overflow:hidden;box-shadow:0 24px 65px #02050b88}
.ww-hero{position:relative;overflow:hidden;padding:28px 30px;background:linear-gradient(115deg,#121a29,#263148 58%,#392b3a);border-bottom:1px solid #4c5362;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.ww-hero:after{content:'☾';position:absolute;right:7%;top:-58px;font-size:190px;color:#ffffff0a;pointer-events:none}
.ww-kicker{font-size:10px;letter-spacing:3px;color:#c6a879;font-weight:900}.ww-hero h2{font-size:clamp(34px,5vw,54px);letter-spacing:2px;margin:6px 0;color:#fff;font-weight:1000}.ww-hero p{color:#c3c6d0;margin:0}.ww-pill{padding:8px 12px;border:1px solid #796c63;background:#ffffff0d;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:1px;z-index:1}
.ww-body{padding:20px;display:grid;gap:15px}.ww-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ww-panel{background:linear-gradient(145deg,#202b3c,#151d2a);border:1px solid #3a485a;border-radius:15px;padding:17px;box-shadow:0 8px 24px #02081244}.ww-panel h3{margin:0 0 7px;color:#fff}.ww-muted{font-size:12px;color:#aab4c3;line-height:1.65}.ww-btn{border:1px solid #c7a878;background:linear-gradient(110deg,#a77b4d,#76533e);color:#fff;border-radius:10px;padding:11px 16px;font-weight:900;cursor:pointer}.ww-btn:disabled{opacity:.4;cursor:not-allowed}.ww-btn.ghost{background:#202d40;border-color:#526176}.ww-btn.red{background:linear-gradient(110deg,#a74750,#702c3a);border-color:#c46a72}.ww-field{display:grid;gap:6px}.ww-field label{font-size:11px;color:#c2b49e;font-weight:800}.ww-field input,.ww-field select{width:100%;border:1px solid #4a5a70;background:#101824;color:#f4f7fb;border-radius:9px;padding:11px;outline:none}.ww-room{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.ww-code{font:900 24px ui-monospace,monospace;letter-spacing:5px;color:#f2d4a5}.ww-players{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}.ww-player{padding:11px 12px;border:1px solid #3c4a5d;border-radius:10px;background:#111a27;font-size:13px}.ww-player small{display:block;color:#a2adbb;margin-top:3px}.ww-dead{opacity:.45;filter:grayscale(1)}.ww-secret{padding:22px;border:1px solid #b08a59;border-radius:14px;background:linear-gradient(130deg,#3a3024,#202838);text-align:center}.ww-secret.wolf{border-color:#a84e5b;background:linear-gradient(130deg,#3e202b,#202838)}.ww-secret .role{font-size:clamp(27px,4vw,40px);font-weight:1000;color:#f4d6a8}.ww-secret.wolf .role{color:#ffabb2}.ww-role-guide{margin-top:14px;padding:14px;border:1px solid #526176;border-radius:12px;background:#111b29;text-align:left;display:grid;gap:10px}.ww-role-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ww-role-guide-item{padding:10px;border:1px solid #34465b;border-radius:9px;background:#172335}.ww-role-guide-item b{display:block;color:#f2d4a5;font-size:11px;margin-bottom:4px}.ww-role-guide-item span{display:block;color:#c2ccd8;font-size:12px;line-height:1.6}.ww-role-guide-status{padding:8px 10px;border-radius:8px;background:#263b34;color:#b8efd0;font-size:11px;font-weight:800}.ww-role-guide-status.used{background:#422b32;color:#ffc2c9}@media(max-width:600px){.ww-role-guide-grid{grid-template-columns:1fr}}.ww-phase{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #4b5668;background:#111a27;border-radius:12px}.ww-phase strong{color:#f2d4a5}.ww-action-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px;margin-top:12px}.ww-action{padding:12px;border:1px solid #526176;background:#172335;color:#f7f2e9;border-radius:11px;text-align:left;cursor:pointer}.ww-action:hover{border-color:#d0ad7d;background:#293449}.ww-action b{display:block;margin-bottom:4px}.ww-action small{color:#aab4c3}.ww-result{text-align:center;padding:25px;border:1px solid #9e815d;border-radius:14px;background:linear-gradient(135deg,#302b29,#1b2635)}.ww-result h2{font-size:30px;margin:7px 0}.ww-lobby-card{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px;border:1px solid #3a485a;border-radius:12px;background:#111a27}.ww-rule{display:grid;grid-template-columns:28px 1fr;gap:10px;margin:10px 0}.ww-rule span{width:27px;height:27px;border-radius:8px;background:#4a3d36;display:grid;place-items:center;font-weight:900;color:#f0d5ae}.ww-notice{padding:12px;border-radius:11px;background:#2d3442;border:1px solid #4b586a;color:#e6d6bd}.ww-role-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin:14px 0}.ww-role-option{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #526176;background:linear-gradient(145deg,#182638,#111a27);border-radius:12px;cursor:pointer}.ww-role-option input{accent-color:#c6a879;width:17px;height:17px}.ww-role-option b{display:block;color:#f5e8d2}.ww-role-option small{display:block;color:#aab4c3;font-size:10px;margin-top:3px}
@media(max-width:680px){.ww-grid{grid-template-columns:1fr}.ww-body{padding:11px}.ww-hero{padding:20px}.ww-panel{padding:13px}}

.bingo-main>aside,.im-shell aside,.ww-body>aside,.game-right-sidebar,.right-game-sidebar{max-height:calc(100vh - 150px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#7a8798 #182333;padding-right:5px}
.bingo-main>aside::-webkit-scrollbar,.im-shell aside::-webkit-scrollbar,.ww-body>aside::-webkit-scrollbar,.game-right-sidebar::-webkit-scrollbar,.right-game-sidebar::-webkit-scrollbar{width:7px}
.bingo-main>aside::-webkit-scrollbar-thumb,.im-shell aside::-webkit-scrollbar-thumb,.ww-body>aside::-webkit-scrollbar-thumb,.game-right-sidebar::-webkit-scrollbar-thumb,.right-game-sidebar::-webkit-scrollbar-thumb{background:#7a8798;border-radius:20px}
@media(max-width:850px){.bingo-main>aside,.im-shell aside,.ww-body>aside,.game-right-sidebar,.right-game-sidebar{max-height:none;overflow:visible}}
`;document.head.appendChild(st)}


function installWerewolfDeathEffects(){
 if($('#wwDeathFxStyles'))return;
 const st=document.createElement('style');st.id='wwDeathFxStyles';st.textContent=`
 #wwDeathFx{--fx:#d52f45;position:fixed;inset:0;z-index:30000;overflow:hidden;background:transparent;color:#fff;font-family:inherit;pointer-events:none}
 #wwDeathFx *{box-sizing:border-box}
 #wwDeathFx .wwfx-actor{position:absolute;left:50%;top:43%;width:min(100vw,1200px);height:min(76vh,760px);transform:translate(-50%,-50%);display:grid;place-items:center;pointer-events:none}
 #wwDeathFx .wwfx-actor img{display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:screen;filter:drop-shadow(0 18px 22px #0009);will-change:transform,opacity}
 #wwDeathFx .wwfx-title{position:absolute;left:clamp(18px,6vw,80px);right:clamp(18px,6vw,80px);bottom:clamp(24px,7vh,70px);text-shadow:0 3px 18px #000,0 1px 3px #000;text-align:left;animation:wwfxTitle .65s .35s both}
 #wwDeathFx .wwfx-title small{display:block;color:var(--fx);font-size:10px;font-weight:1000;letter-spacing:4px;margin-bottom:8px}
 #wwDeathFx .wwfx-title h2{font-size:clamp(28px,5vw,58px);line-height:1;margin:0 0 9px;font-weight:1000}
 #wwDeathFx .wwfx-title p{font-size:clamp(12px,1.5vw,15px);color:#e5e7eb;max-width:540px;line-height:1.6;margin:0}
 #wwDeathFx .wwfx-skip{pointer-events:auto;position:absolute;right:18px;top:18px;border:1px solid #ffffff65;border-radius:999px;background:#080b10a8;color:white;padding:9px 14px;font-size:11px;font-weight:900;cursor:pointer;backdrop-filter:blur(8px)}
 #wwDeathFx .wwfx-flash{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,#fff8,transparent 60%)}
 #wwDeathFx.wolf{--fx:#ff5265}
 #wwDeathFx.poison{--fx:#63f5a0}
 #wwDeathFx.vote{--fx:#e7bd78}
 #wwDeathFx.wolf .wwfx-actor{width:min(110vw,1450px);height:min(88vh,900px);top:42%;animation:wwfxWolf .95s cubic-bezier(.12,.78,.18,1) both}
 #wwDeathFx.wolf .wwfx-actor img{mix-blend-mode:normal;filter:drop-shadow(0 0 26px #ff233d88);animation:wwfxBite 2.2s .9s ease-in-out both}
 #wwDeathFx.wolf .wwfx-slash{position:absolute;inset:0;opacity:0;pointer-events:none;background:linear-gradient(112deg,transparent 42%,#fff 49%,#ff4058 51%,transparent 58%);clip-path:polygon(0 0,100% 0,100% 100%,0 100%);animation:wwfxSlash .6s 1.25s ease-out both}
 #wwDeathFx.wolf .wwfx-flash{animation:wwfxImpact 3.2s 1.15s both}
 #wwDeathFx.poison .wwfx-actor{width:min(74vw,760px);height:min(75vh,700px);top:43%;animation:wwfxPotion .9s ease-out both}
 #wwDeathFx.poison .wwfx-actor img{filter:drop-shadow(0 0 38px #35ff8d99);animation:wwfxPoisonBurst 3.5s .9s ease-in-out both}
 #wwDeathFx.poison .wwfx-flash{background:radial-gradient(ellipse at 50% 45%,#42ff9a55,transparent 62%);animation:wwfxImpact 3.4s 1.2s both}
 #wwDeathFx.vote .wwfx-actor{width:min(88vw,1050px);height:min(80vh,760px);top:41%;animation:wwfxAxe .8s ease-out both}
 #wwDeathFx.vote .wwfx-actor img{filter:drop-shadow(0 0 28px #d9a95b77);animation:wwfxAxeStrike 2.6s .75s ease-in both}
 #wwDeathFx.vote .wwfx-flash{background:radial-gradient(ellipse at 50% 45%,#ffe3a766,transparent 60%);animation:wwfxImpact 3s 1.3s both}
 @keyframes wwfxTitle{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
 @keyframes wwfxWolf{0%{transform:translate(-50%,-50%) scale(.18) translateY(28vh);opacity:0}55%{opacity:1}100%{transform:translate(-50%,-50%) scale(1.04);opacity:1}}
 @keyframes wwfxBite{0%,100%{transform:scale(1) rotate(0)}20%{transform:scale(1.09) rotate(-2deg)}35%{transform:scale(1.04) rotate(2deg)}52%{transform:scale(1.13) rotate(-1deg)}70%{transform:scale(1.02) rotate(1deg)}}
 @keyframes wwfxSlash{0%{opacity:0;transform:translateX(-120%) skewX(-18deg)}20%{opacity:.95}100%{opacity:0;transform:translateX(120%) skewX(-18deg)}}
 @keyframes wwfxImpact{0%,28%,100%{opacity:0}32%{opacity:.7}37%{opacity:0}60%{opacity:0}63%{opacity:.25}67%{opacity:0}}
 @keyframes wwfxPotion{0%{transform:translate(-50%,-50%) scale(.35) rotate(-22deg);opacity:0}100%{transform:translate(-50%,-50%) scale(1) rotate(0);opacity:1}}
 @keyframes wwfxPoisonBurst{0%,100%{transform:scale(1) rotate(0)}28%{transform:scale(1.1) rotate(8deg)}55%{transform:scale(.96) rotate(-8deg)}78%{transform:scale(1.06) rotate(4deg)}}
 @keyframes wwfxAxe{0%{transform:translate(-50%,-50%) translateY(-55vh) rotate(-22deg);opacity:0}100%{transform:translate(-50%,-50%) translateY(0) rotate(0);opacity:1}}
 @keyframes wwfxAxeStrike{0%,35%{transform:rotate(0)}52%{transform:rotate(9deg) translateY(12px)}64%{transform:rotate(-4deg) translateY(-4px)}100%{transform:rotate(0)}}
 @media(max-width:600px){#wwDeathFx .wwfx-actor{width:112vw;height:62vh;top:40%}#wwDeathFx .wwfx-title{bottom:8vh}#wwDeathFx .wwfx-title h2{font-size:32px}}
 @media(prefers-reduced-motion:reduce){#wwDeathFx *,#wwDeathFx *:before{animation-duration:.01ms!important;animation-iteration-count:1!important}}
 `;document.head.appendChild(st);
}
function showWerewolfDeathEffect(event,roomId){
 if(!event?.id||!['wolf','poison','vote'].includes(event.cause))return;
 const key=`gcWWDeathShown:${roomId}:${event.id}`;
 try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1')}catch{}
 const copy={
  wolf:{kicker:'NIGHT HUNT · FATAL ATTACK',title:'คุณถูกหมาป่าล่า',desc:'นักล่าพุ่งเข้าประชิด ก่อนตะปบและกัดอย่างรวดเร็ว',sound:'wolfAttack',asset:'/assets/death-fx/wolf-attack.gif'},
  poison:{kicker:'TOXIC CURSE · FATAL DOSE',title:'พิษร้ายคร่าชีวิตคุณ',desc:'ขวดยาพิษเรืองแสงสั่นไหว ก่อนพลังพิษปะทุออกมา',sound:'poison',asset:'/assets/death-fx/poison.gif'}
 }[event.cause];
 if(!copy)return;
 document.getElementById('wwDeathFx')?.remove();
 const el=document.createElement('div');el.id='wwDeathFx';el.className=event.cause;el.setAttribute('role','alert');
 el.innerHTML=`<div class="wwfx-actor"><img src="${copy.asset}" alt="" draggable="false"></div>${event.cause==='wolf'?'<div class="wwfx-slash"></div>':''}<div class="wwfx-flash"></div><div class="wwfx-title"><small>${copy.kicker}</small><h2>${copy.title}</h2><p>${copy.desc}</p></div><button class="wwfx-skip" type="button">ข้ามฉาก ×</button>`;
 document.body.appendChild(el);GCSound.play(copy.sound);
 const close=()=>{el.remove()};const timer=setTimeout(close,6500);el.querySelector('.wwfx-skip').addEventListener('click',()=>{clearTimeout(timer);close()});
}

function installReportsNav(){
 const first=document.querySelector('.nav-item[data-page="dashboard"]');if(!first)return;
 const nav=first.parentElement;
 document.querySelector('.nav-item[data-page="reports"]')?.remove();
 document.querySelector('.nav-item[data-page="requests"]')?.remove();
 let wheelBtn=document.querySelector('.nav-item[data-page="wheel"]');
 if(!wheelBtn){wheelBtn=document.createElement('button');wheelBtn.className='nav-item';wheelBtn.dataset.page='wheel';wheelBtn.innerHTML='<span>🎡</span><span>วงล้อชื่อ</span>';wheelBtn.addEventListener('click',()=>{if(!isAdmin())return;page='wheel';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===wheelBtn));render()});}
 let bingoBtn=document.querySelector('.nav-item[data-page="bingo"]');
 if(!bingoBtn){bingoBtn=document.createElement('button');bingoBtn.className='nav-item';bingoBtn.dataset.page='bingo';bingoBtn.innerHTML='<span>🎯</span><span>BINGO</span>';bingoBtn.addEventListener('click',()=>{page='bingo';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===bingoBtn));loadBingo().catch(e=>toast(e.message));render()});}
 let impostorBtn=document.querySelector('.nav-item[data-page="impostor"]');
 if(!impostorBtn){impostorBtn=document.createElement('button');impostorBtn.className='nav-item';impostorBtn.dataset.page='impostor';impostorBtn.innerHTML='<span>🕵️</span><span>IMPOSTOR</span>';impostorBtn.addEventListener('click',()=>{page='impostor';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===impostorBtn));loadImpostor().catch(e=>toast(e.message));render()});}
 let werewolfBtn=document.querySelector('.nav-item[data-page="werewolf"]');
 if(!werewolfBtn){werewolfBtn=document.createElement('button');werewolfBtn.className='nav-item';werewolfBtn.dataset.page='werewolf';werewolfBtn.innerHTML='<span>🐺</span><span>WEREWOLF</span>';werewolfBtn.addEventListener('click',()=>{page='werewolf';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===werewolfBtn));loadWerewolf().catch(e=>toast(e.message));render()});}
 const auditBtn=document.querySelector('.nav-item[data-page="audit"]');
 if(auditBtn)nav.append(wheelBtn,bingoBtn,impostorBtn,werewolfBtn,auditBtn);else nav.append(wheelBtn,bingoBtn,impostorBtn,werewolfBtn);
}
function installWheelStyles(){if($('#wheelStyles'))return;const st=document.createElement('style');st.id='wheelStyles';st.textContent=`
.report-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.report-toolbar .field{min-width:160px;flex:1}
.wheel-layout{display:grid;grid-template-columns:minmax(300px,1.08fr) minmax(280px,.92fr);gap:20px;align-items:start}
.wheel-layout>.panel{border-radius:22px;box-shadow:0 12px 34px rgba(15,23,42,.08);border:1px solid var(--line,#e2e8f0)}
.wheel-stage{position:relative;width:min(100%,480px);margin:12px auto 22px;aspect-ratio:1;padding:8px;border-radius:50%;background:conic-gradient(from 20deg,#fbbf24,#f97316,#ec4899,#8b5cf6,#3b82f6,#14b8a6,#fbbf24);box-shadow:0 16px 34px rgba(30,41,59,.18)}
.wheel-stage:before{content:'';position:absolute;inset:5px;border:3px solid rgba(255,255,255,.9);border-radius:50%;pointer-events:none;z-index:1}
#wheelCanvas{width:100%;height:100%;display:block;border-radius:50%;transition:transform 4.2s cubic-bezier(.12,.72,.12,1);background:#fff;will-change:transform;}
.wheel-pointer{position:absolute;z-index:3;top:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:19px solid transparent;border-right:19px solid transparent;border-top:42px solid #fbbf24;filter:drop-shadow(0 4px 5px #0005)}
.wheel-hub{position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:50%;background:linear-gradient(145deg,#fff,#e2e8f0);border:7px solid #fff;box-shadow:0 5px 18px #0004;display:grid;place-items:center;font-size:30px;color:#7c3aed}
.wheel-spin-btn{min-width:220px;padding:13px 25px!important;border-radius:999px!important;font-weight:800!important;font-size:16px!important;box-shadow:0 8px 20px rgba(99,102,241,.25)}
.wheel-controls{display:grid;gap:16px}.wheel-controls h3{margin-bottom:6px}.wheel-result{padding:16px 18px;border:1px solid var(--line,#ddd);border-radius:16px;background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(236,72,153,.07));min-height:78px;text-align:center}.wheel-result strong{font-size:24px;color:var(--text,#1e293b)}.wheel-names{width:100%;min-height:155px;resize:vertical;border-radius:14px;padding:12px;line-height:1.7}
.wheel-team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.wheel-team-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.wheel-team-actions .btn{font-size:12px}.wheel-pool-note{padding:10px 12px;border-radius:12px;background:rgba(59,130,246,.08);margin-top:10px}.wheel-team-status{font-size:12px;color:var(--muted,#64748b);margin-top:7px}.wheel-team{border:1px solid var(--line,#ddd);border-radius:16px;padding:14px;background:var(--panel,#fff);box-shadow:0 5px 16px rgba(15,23,42,.05)}.wheel-team h4{margin:0 0 10px;display:flex;align-items:center;justify-content:space-between}.wheel-team .team-leader{padding:8px 10px;border-radius:10px;background:linear-gradient(100deg,rgba(245,158,11,.17),rgba(251,191,36,.08));font-weight:800;margin:0 0 8px}.wheel-team .team-member{padding:5px 2px;margin:0;border-bottom:1px dashed var(--line,#e2e8f0)}.wheel-team .team-member:last-child{border:0}
.wheel-modal-back{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:16px}

.gc-toast-visible{position:fixed;top:18px;right:18px;z-index:15000;max-width:min(420px,calc(100vw - 36px));padding:12px 17px;border-radius:12px;background:#172033;color:#fff;box-shadow:0 8px 24px #0003;font-size:14px;font-weight:700;line-height:1.45;pointer-events:none;opacity:1;transition:opacity .15s ease}.gc-toast-visible:empty{display:none}
.wheel-modal-back{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:16px}.wheel-modal-back .wheel-leader-modal{position:relative;z-index:1}
.wheel-leader-modal{width:min(560px,100%);max-height:min(82vh,760px);overflow:auto;padding:24px;border-radius:24px;background:var(--panel,#fff);color:var(--text,#172033);box-shadow:0 25px 80px #0005}
.wheel-leader-modal h2{margin:0 0 6px}.wheel-leader-row{display:grid;grid-template-columns:95px 1fr;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line,#e2e8f0)}.wheel-leader-row label{font-weight:800}.wheel-leader-row select{width:100%;min-width:0;padding:10px;border:1px solid var(--line,#cbd5e1);border-radius:11px;background:var(--panel,#fff);color:var(--text,inherit)}.wheel-leader-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
@media(max-width:760px){.wheel-layout{grid-template-columns:1fr}.wheel-team-grid{grid-template-columns:1fr 1fr}.wheel-stage{width:min(100%,440px)}}@media(max-width:430px){.wheel-team-grid{grid-template-columns:1fr}.wheel-stage{padding:7px}}
/* Premium GANG BINGO theme */
.bingo-shell{background:#f3f7f5;color:#163d36;border:1px solid #d6e5df;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px #123b3018}
.bingo-banner{position:relative;padding:26px 30px;background:linear-gradient(115deg,#073f36,#0b6b59 60%,#13856d);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
.bingo-banner:after{content:'BINGO';position:absolute;right:24px;bottom:-28px;font-size:clamp(70px,12vw,150px);font-weight:1000;letter-spacing:-8px;color:#ffffff0b;pointer-events:none}
.bingo-eyebrow{font-size:11px;letter-spacing:3px;font-weight:900;color:#b8e7d8}.bingo-banner h2{font-size:clamp(30px,5vw,52px);line-height:1;margin:8px 0;font-weight:1000;letter-spacing:-1.5px}.bingo-banner p{margin:0;color:#d4eee5}.bingo-live{padding:8px 13px;border:1px solid #ffffff55;border-radius:999px;background:#ffffff17;font-size:12px;font-weight:900;white-space:nowrap}
.bingo-main{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:18px;padding:18px}.bingo-card-panel,.bingo-side-panel{background:#fff;border:1px solid #dce9e4;border-radius:18px;padding:18px;box-shadow:0 7px 22px #123b3009}.bingo-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}.bingo-panel-head h3{margin:0;color:#124d40}.bingo-muted{font-size:12px;color:#66847b}.bingo-card-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;max-width:600px;margin:0 auto}.bingo-letter{display:grid;place-items:center;background:#0b6655;color:#fff;border-radius:10px;padding:9px 2px;font-weight:1000;font-size:clamp(18px,3vw,26px)}.bingo-square{aspect-ratio:1;border:1px solid #d7e5df;border-radius:10px;background:#f8fbf9;color:#17483e;font-weight:900;font-size:clamp(16px,3vw,25px);cursor:pointer;transition:.15s}.bingo-square:disabled{cursor:default}.bingo-square.called{background:#d9f2e8;border-color:#54a98b;color:#08734f}.bingo-square.free{background:#f3c96a;color:#573b00;border-color:#e5b64d}.bingo-square.marked{background:#f8fbf9;color:#17483e;border:3px solid #d73535;border-radius:50%;box-shadow:none}.bingo-square.marked:after{content:'';display:none}
.bingo-call-box{background:linear-gradient(135deg,#073f36,#0b6b59);color:white;border-radius:16px;padding:18px;text-align:center}.bingo-call-box small{display:block;color:#bde3d7;font-weight:800;letter-spacing:1px}.bingo-current-ball{width:92px;height:92px;border-radius:50%;margin:10px auto;background:radial-gradient(circle at 32% 25%,#fff,#d6f1e8 58%,#8bc7b2);color:#075344;display:grid;place-items:center;font-size:36px;font-weight:1000;border:5px solid #ffffffa8;box-shadow:0 8px 22px #001e1744}.bingo-number-grid{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));gap:4px;margin-top:14px}.bingo-number{aspect-ratio:1;display:grid;place-items:center;border-radius:5px;background:#edf3f0;color:#799087;font-size:clamp(9px,1.3vw,12px);font-weight:800}.bingo-number.hit,.bingo-number.latest{background:#edf3f0;color:#799087;box-shadow:none}
.bingo-action{width:100%;border:0;border-radius:12px;padding:14px 16px;background:linear-gradient(110deg,#0b6b59,#13856d);color:white;font-weight:1000;font-size:16px;cursor:pointer;box-shadow:0 7px 16px #0b6b5933}.bingo-action:disabled{opacity:.45;cursor:not-allowed}.bingo-join{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;border-radius:14px;background:#eaf5f0;border:1px dashed #a7cdbd}.bingo-players{display:flex;flex-wrap:wrap;gap:7px}.bingo-player-chip{padding:7px 10px;border-radius:999px;background:#e8f3ef;color:#1a5b4c;font-size:12px;font-weight:800}.bingo-winner{padding:15px;border-radius:14px;background:#fff5d9;border:1px solid #e8c45e;color:#745000;font-weight:900;margin-top:14px}.bingo-empty{padding:35px 18px;text-align:center;color:#628077}.bingo-empty .emoji{font-size:42px}.bingo-create{background:#fff;color:#0b6655;border:1px solid #b9d6ca;border-radius:11px;padding:11px 16px;font-weight:900;cursor:pointer}
@media(max-width:800px){.bingo-main{grid-template-columns:1fr}.bingo-number-grid{grid-template-columns:repeat(15,minmax(0,1fr))}.bingo-banner{padding:22px}}
@media(max-width:480px){.bingo-main{padding:10px;gap:10px}.bingo-card-panel,.bingo-side-panel{padding:12px}.bingo-card-grid{gap:4px}.bingo-letter,.bingo-square{border-radius:7px}.bingo-number-grid{gap:2px}.bingo-number{font-size:8px}}

/* LOS SANTOS BINGO CLUB — ticket / live-room layout */
.bingo-shell{border-radius:4px;background:#f7f8f6;border:1px solid #d4ded9;box-shadow:0 16px 40px #071d1730;color:#153d35;font-family:inherit}
.bingo-banner{background:#f7f8f6;color:#0b5145;padding:20px 26px 14px;border-bottom:1px solid #b8c9c2;min-height:108px}
.bingo-banner:after{content:'◉ ⑦ ⑥';color:#0c66551b;right:28px;bottom:5px;font-size:72px;letter-spacing:-5px}
.bingo-eyebrow{color:#66867c;letter-spacing:2.2px;font-size:10px}.bingo-banner h2{font-size:clamp(34px,5vw,56px);color:#075b4c;margin:5px 0 3px;letter-spacing:-2px}.bingo-banner p{color:#59766e;font-size:13px}.bingo-live{border-radius:3px;background:#0b6857;color:#fff;border:0;padding:9px 13px}
.bingo-eventbar{margin:14px 18px 0;background:linear-gradient(100deg,#075448,#147565);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border:1px solid #0a5c4d;box-shadow:0 5px 12px #123b3018}.bingo-eventbar h3{margin:3px 0 4px;font-size:22px;letter-spacing:.2px;color:white}.bingo-eventbar p{margin:0;color:#cce4dc;font-size:12px}.bingo-event-kicker{font-size:10px;letter-spacing:1.4px;color:#b4d9ce;font-weight:900}.bingo-event-meta{font-size:12px;color:#e2f2ec;text-align:right}.bingo-eventbar .bingo-action{width:auto;min-width:160px;background:#dcece5;color:#075648;box-shadow:none;border:1px solid #a9cfc0;border-radius:3px;padding:12px 18px}
.bingo-main{grid-template-columns:minmax(0,1.08fr) minmax(290px,.92fr);gap:14px;padding:14px 18px 20px}.bingo-card-panel,.bingo-side-panel{border-radius:3px;border:1px solid #cbd8d2;box-shadow:none;background:#fff;padding:15px}.bingo-ticket{position:relative;background:#fff;border:1px solid #aebfb7;padding:14px;box-shadow:0 5px 14px #0a33251a}.bingo-ticket:before{content:'LOS SANTOS BINGO CLUB';display:block;font-size:9px;letter-spacing:2px;font-weight:900;color:#68857b;border-bottom:2px solid #0b6857;padding:0 0 8px;margin-bottom:10px}.bingo-ticket-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.bingo-ticket-head strong{font-size:clamp(30px,4vw,44px);line-height:1;color:#075c4d;letter-spacing:-2px}.bingo-ticket-head span{font-size:10px;color:#71877f;font-weight:800}.bingo-card-panel .bingo-panel-head{border-bottom:1px solid #d7e1dc;padding-bottom:9px}.bingo-card-grid{gap:3px;max-width:100%}.bingo-letter{border-radius:0;background:#0b6655;padding:8px 2px;font-size:clamp(16px,2.5vw,23px)}.bingo-square{border-radius:0;aspect-ratio:1.12;border:1px solid #d0dcd6;background:#fbfcfb;font-size:clamp(15px,2.2vw,23px);position:relative}.bingo-square.called{background:#e1f0ea;color:#0a6c56}.bingo-square.marked{background:#fff!important;color:#17483e!important;border:3px solid #d62929!important;border-radius:50%!important;box-shadow:inset 0 0 0 1px #fff}.bingo-square.marked:after{content:'';display:none}.bingo-square.free{background:#e7eee9;color:#0c6a56}.bingo-ticket-foot{display:flex;justify-content:space-between;align-items:center;border-top:2px solid #0b6857;margin-top:12px;padding-top:8px;color:#71877f;font-size:9px;letter-spacing:1px}
.bingo-live-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bingo-stat-card{border-top:2px solid #0b6857;padding:10px 4px 8px}.bingo-stat-label{font-size:11px;color:#6b837a;font-weight:800}.bingo-stat-value{font-size:clamp(24px,3vw,36px);font-weight:1000;color:#0a6554;line-height:1.2}.bingo-current-ball{width:78px;height:78px;border:4px solid #d8e8e0;background:radial-gradient(circle at 30% 25%,#fff,#e5f2ec 62%,#a9cbbb);color:#075344;font-size:30px;box-shadow:0 4px 12px #153e3020}.bingo-call-box{border-radius:3px;background:#f4f8f5;color:#16493e;border:1px solid #cbdcd3;padding:13px}.bingo-call-box small{color:#6b837a}.bingo-history-balls{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.bingo-history-ball{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#e8f0ec;color:#49685d;font-size:12px;font-weight:900;border:1px solid #cbdad2}.bingo-history-ball:first-child{background:#0b6857;color:#fff;border-color:#0b6857;box-shadow:0 0 0 2px #b7d5c8}.bingo-number-grid{grid-template-columns:repeat(15,minmax(0,1fr));gap:3px}.bingo-number{border-radius:2px}.bingo-action{border-radius:3px}.bingo-create{border-radius:3px}.bingo-players{gap:5px}.bingo-player-chip{border-radius:3px;background:#eef4f0;border:1px solid #d5e2db}.bingo-winner{border-radius:3px}.bingo-join{border-radius:3px}.bingo-empty{padding:28px 18px}
@media(max-width:800px){.bingo-main{grid-template-columns:1fr}.bingo-eventbar{margin:10px 10px 0}.bingo-event-meta{text-align:left}}
@media(max-width:480px){.bingo-banner{padding:16px}.bingo-main{padding:10px}.bingo-card-panel,.bingo-side-panel{padding:10px}.bingo-eventbar{padding:13px}.bingo-square{font-size:16px}.bingo-history-ball{width:30px;height:30px}}
/* BINGO V8: instant marking and lightweight rendering */
.bingo-square{transition:none!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none}
.bingo-square.marked{transition:none!important;will-change:auto;border:3px solid #d62929!important;border-radius:50%!important;background:#fff!important;color:#17483e!important;box-shadow:none!important}
.bingo-number,.bingo-number.hit,.bingo-number.latest{background:#edf3f0!important;color:#799087!important;box-shadow:none!important}
.bingo-number{transition:none!important}
.bingo-countdown-wrap{display:flex;align-items:center;justify-content:center;gap:12px;margin:12px auto 6px}
.bingo-countdown-ring{--progress:0deg;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#d4a52c var(--progress),#dce8e1 0);position:relative;flex:0 0 auto}
.bingo-countdown-ring:before{content:"";position:absolute;inset:5px;background:#f4f8f5;border-radius:50%}
.bingo-countdown-ring strong{position:relative;z-index:1;font-size:19px;color:#075344}
.bingo-countdown-label{font-size:11px;color:#668078;font-weight:800}
.bingo-winner-overlay{position:fixed;inset:0;background:#061c17cc;z-index:99999;display:grid;place-items:center;padding:18px;animation:bingoFade .2s ease}
.bingo-winner-modal{width:min(480px,100%);background:#f8fbf9;border:4px solid #d6b34d;box-shadow:0 25px 80px #0008;padding:28px;text-align:center;color:#124d40}
.bingo-winner-modal h2{font-size:36px;margin:5px 0 12px;color:#075b4c}.bingo-winner-name{padding:12px;margin:8px 0;background:#e8f3ed;border:1px solid #c8ded2;font-weight:1000;font-size:19px}
@keyframes bingoFade{from{opacity:0}to{opacity:1}}



`;document.head.appendChild(st)}

async function api(url, options={}) { const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'ดำเนินการไม่สำเร็จ'); return d; }
let toastTimer=null;
let bingoHasLoadedOnce=false, bingoServerOffset=0, bingoRedirectTimer=null;
function toast(msg){
 let node=$('#gcToast');
 if(!node){node=document.createElement('div');node.id='gcToast';node.setAttribute('role','status');document.body.appendChild(node)}
 node.textContent=String(msg||'');node.className='gc-toast-visible';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.className='';},2600);
}
function isAdmin(){return !!state?.isAdmin}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await boot()}catch(err){$('#loginError').textContent=err.message}});
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});state=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden')};

async function boot(){const me=await api('/api/me');if(!me.user){$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');return}$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');installGCSoundUI();installReportsNav();installWheelStyles();installImpostorStyles();installWerewolfStyles();installWerewolfDeathEffects();$('#userName').textContent=me.user.name;$('#userRole').textContent=me.isAdmin?'ผู้ดูแลระบบ':'สมาชิกแก๊ง';$('#userAvatar').textContent=(me.user.name||'G').slice(0,1).toUpperCase();document.querySelectorAll('.nav-item').forEach(b=>{const adminPages=['dashboard','wheel','audit','members','inventory','history'];b.classList.toggle('hidden',!me.isAdmin&&adminPages.includes(b.dataset.page))});if(!me.isAdmin){page='bingo';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page==='bingo'))}await refresh();await loadBingo().catch(e=>toast(e.message))}

async function refresh(){state=await api('/api/data?date='+encodeURIComponent(selectedDate));$('#todayChip').textContent=state.today;$('#requestBadge')?.closest('.nav-item')?.remove();$('#deliveryBadge').textContent=state.summary.pendingDeliveries;$('#attendanceBadge').textContent='3 รอบ';render()}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{if(b.classList.contains('hidden'))return;page=b.dataset.page;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));render();if(page==='audit')loadAudit().catch(e=>toast(e.message))});

function render(){if(!state)return;$('#crumb').textContent=pageNames[page];$('#pageTitle').textContent=pageNames[page];const c=$('#content');const views={dashboard,bingo,impostor,werewolf,wheel,audit,attendance,members,inventory,deliveries,history};c.innerHTML=views[page]();wire();}

function stat(label,value,icon,sub){return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${sub}</small></div>`}

function dashboard(){
 const active=state.members.filter(m=>m.active);
 const todayRows=state.attendance;
 const present=todayRows.filter(a=>a.status==='present'||a.status==='late').length;
 const absent=todayRows.filter(a=>a.status==='absent').length;
 const leave=todayRows.filter(a=>a.status==='leave'||a.status==='business').length;
 return `<div class="hero"><div><div class="eyebrow">DAILY OPERATIONS / COMMAND CENTER</div><h3>ยินดีต้อนรับสู่ GANG CONTROL</h3><p>จัดการสมาชิก การเช็กชื่อ และทรัพย์สินของแก๊งได้จากที่เดียว</p></div><div class="hero-tag">● ระบบออนไลน์ · ${esc(state.today)}</div></div><div class="stats">${stat('สมาชิกที่ใช้งาน',active.length,'♙','รายชื่อในแก๊ง')}${stat('ไอเทมในคลัง',state.items.length,'▤','ประเภทไอเทม')}${stat('ส่งของรอตรวจ',state.summary.pendingDeliveries,'⇧','รายการ')}</div><div class="quick-grid"><button class="quick" data-go="attendance"><span>◷</span><b>เช็กชื่อประจำวัน</b><small>16:30 · 20:30 · 23:50</small></button><button class="quick" data-go="bingo"><span>🎯</span><b>เข้าเล่น BINGO</b><small>กิจกรรมประจำแก๊ง</small></button><button class="quick" data-go="deliveries"><span>⇧</span><b>ตรวจรับของ</b><small>รับของเข้าคลังจากสมาชิก</small></button></div><div class="grid2"><div class="panel"><div class="panel-head"><div><h3>สรุปเช็กชื่อวันนี้</h3><div class="panel-sub">รวมสถานะจากทั้ง 3 รอบ</div></div><button class="btn small" data-go="attendance">เปิดระบบเช็กชื่อ</button></div><div class="count-cards"><span>มา/มาสาย ${present}</span><span>ขาด ${absent}</span><span>ลา/ติดธุระ ${leave}</span></div><div class="muted-note" style="margin-top:14px">รอบเช็กชื่อ: 16:30 น. · 20:30 น. · 23:50 น.</div></div><div class="panel"><div class="panel-head"><div><h3>ไอเทมใกล้หมด</h3><div class="panel-sub">จำนวนคงเหลือต่ำกว่าค่าขั้นต่ำ</div></div></div>${state.items.filter(i=>i.qty<=i.min).map(i=>`<div class="history-item"><b>${esc(i.name)}</b><span class="pill yellow">เหลือ ${i.qty} ${esc(i.unit)}</span></div>`).join('')||'<div class="empty">ไม่มีไอเทมใกล้หมด</div>'}</div></div>`
}


function wheelNames(){
 const input=$('#wheelNamesInput');
 const raw=input ? input.value : (localStorage.getItem('gangWheelNames') || state.members.filter(m=>m.active).map(m=>m.name).join('\n'));
 return [...new Set(raw.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean))];
}
function saveWheelNames(names){
 const clean=[...new Set(names.map(n=>String(n).trim()).filter(Boolean))];
 localStorage.setItem('gangWheelNames',clean.join('\n'));
 return clean;
}
let wheelDrawSignature='',wheelDrawCanvas=null;
function drawWheel(names, force=false){
 const canvas=$('#wheelCanvas');if(!canvas)return;
 const signature=names.join('\u0001');
 if(!force && canvas===wheelDrawCanvas && signature===wheelDrawSignature && canvas.width)return;
 wheelDrawSignature=signature;wheelDrawCanvas=canvas;
 // วาดขนาดพอดีกับพื้นที่แสดงผล ลดภาระ GPU/CPU บนอุปกรณ์ทั่วไป
 const cssSize=Math.max(260,Math.min(600,Math.floor(canvas.getBoundingClientRect().width||480)));
 const dpr=Math.min(window.devicePixelRatio||1,1.5),size=Math.round(cssSize*dpr);
 if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size}
 const ctx=canvas.getContext('2d',{alpha:false});ctx.setTransform(dpr,0,0,dpr,0,0);
 const s=cssSize,cx=s/2,cy=s/2,r=s/2-7,colors=['#4f46e5','#7c3aed','#db2777','#ea580c','#059669','#0891b2','#ca8a04','#2563eb','#9333ea','#0f766e'];
 ctx.clearRect(0,0,s,s);ctx.fillStyle='#fff';ctx.fillRect(0,0,s,s);
 if(!names.length){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#e2e8f0';ctx.fill();ctx.fillStyle='#475569';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText('เพิ่มรายชื่อก่อน',cx,cy);return}
 const arc=Math.PI*2/names.length;
 names.forEach((name,i)=>{
  const start=-Math.PI/2+i*arc,end=start+arc;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,end);ctx.closePath();ctx.fillStyle=colors[i%colors.length];ctx.fill();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2;ctx.stroke();
  // ไม่วาดข้อความเมื่อช่องเล็กเกินไป ช่วยลดอาการหน่วงเมื่อมีรายชื่อจำนวนมาก
  if(arc<0.075)return;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(start+arc/2);ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.font=`800 ${Math.max(9,Math.min(17,260/names.length))}px sans-serif`;
  let label=name;if(label.length>18)label=label.slice(0,17)+'…';ctx.fillText(label,r-22,0);ctx.restore();
 });
 ctx.beginPath();ctx.arc(cx,cy,27,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#fbbf24';ctx.lineWidth=5;ctx.stroke();
}
function showWheelWinner(name){
 const result=$('#wheelResult');
 if(result)result.innerHTML=`<span class="muted-note">🏆 ผู้โชคดีคือ</span><br><strong>${esc(name)}</strong>`;
}
function persistWheelTeams(){
 if(!savedWheelTeams)return;
 savedWheelTeams.updatedAt=new Date().toISOString();
 localStorage.setItem('gangWheelTeams',JSON.stringify(savedWheelTeams));
}
function syncWheelPool(){
 const assigned=new Set((savedWheelTeams?.teams||[]).flatMap(t=>[t.leader,...(t.members||[])]).filter(Boolean));
 const remaining=wheelNames().filter(n=>!assigned.has(n));
 const input=$('#wheelNamesInput');
 if(input)input.value=remaining.join('\n');
 saveWheelNames(remaining);
 drawWheel(remaining,true);
 return remaining;
}
function renderSavedTeams(){
 const target=$('#wheelTeamsResult');if(!target)return;
 if(!savedWheelTeams){target.innerHTML='';return}
 const teams=savedWheelTeams.teams||[],remaining=wheelNames();
 const complete=remaining.length===0;
 const manual=savedWheelTeams.pickMode==='manual';
 const nextIndex=Number(savedWheelTeams.nextTeamIndex||0)%Math.max(1,teams.length);
 target.innerHTML=`
  <div class="wheel-pool-note"><b>วงล้อคงเหลือ ${remaining.length} คน</b><div class="wheel-team-status">รายชื่อที่เป็นหัวหน้าทีมหรือถูกจัดเข้าทีมแล้ว จะถูกนำออกจากวงล้ออัตโนมัติ</div>
  ${manual&&!complete?`<div class="wheel-team-status"><b>โหมดสุ่มทีละคน:</b> คนถัดไปจะเข้า ทีม ${nextIndex+1} · กดปุ่มหมุนวงล้อด้านซ้ายเพื่อสุ่มและจัดเข้าทีม</div>`:''}</div>
  <div class="wheel-team-grid">${teams.map((team,i)=>`<div class="wheel-team">
   <h4><span>🛡️ ทีม ${i+1}</span><span class="muted-note">${team.members.length} คน</span></h4>
   <p class="team-leader">👑 หัวหน้าทีม: ${esc(team.leader)}</p>
   ${team.members.filter(n=>n!==team.leader).map(name=>`<p class="team-member">${esc(name)}</p>`).join('')||'<p class="muted-note">รอสุ่มสมาชิกเพิ่ม</p>'}
  </div>`).join('')}</div>
  <div class="toolbar" style="margin-top:12px">
   ${!manual?`<button type="button" class="btn primary" id="wheelRandomAll" ${remaining.length?'':'disabled'}>🎲 สุ่มสมาชิกที่เหลือเข้าทุกทีม</button>`:''}
   <button type="button" class="btn small" id="wheelEditLeaders">✎ เปลี่ยนหัวหน้าทีม</button>
  </div>
  ${complete?'<p class="muted-note">จัดสมาชิกครบทุกคนแล้ว</p>':manual?'<p class="muted-note">หมุนวงล้อทางด้านซ้ายเพื่อจัดสมาชิกเข้าทีมทีละคน โดยระบบจะเลื่อนไปทีมถัดไปให้อัตโนมัติ</p>':''}`;
 $('#wheelEditLeaders')?.addEventListener('click',()=>openLeaderPicker(teams.map(t=>({...t,members:[...t.members]})),[...new Set(teams.flatMap(t=>t.members||[]))]));
 $('#wheelRandomAll')?.addEventListener('click',randomizeAllTeams);
}
function chooseTeamMode(isNewSetup=true){
 const root=$('#modalRoot');if(!root)return;
 root.innerHTML=`<div class="wheel-modal-back"><div class="wheel-leader-modal"><div style="font-size:34px">🎲</div><h2>เลือกวิธีจัดสมาชิกเข้าทีม</h2><p class="muted-note">กำหนดหัวหน้าทีมเรียบร้อยแล้ว ต้องการจัดสมาชิกที่เหลือแบบไหน?</p><div class="panel" style="margin:12px 0"><h3>⚡ สุ่มอัตโนมัติ</h3><p class="muted-note">ระบบจะสุ่มรายชื่อที่เหลือและกระจายเข้าทุกทีมให้ครบในครั้งเดียว</p><button type="button" class="btn primary" id="chooseAutoTeams">สุ่มสมาชิกทั้งหมดอัตโนมัติ</button></div><div class="panel" style="margin:12px 0"><h3>🎡 สุ่มด้วยวงล้อทีละคน</h3><p class="muted-note">กดหมุนวงล้อ 1 ครั้ง จะสุ่มได้ 1 คนและจัดเข้าทีมถัดไปอัตโนมัติ วนไปเรื่อย ๆ จนรายชื่อหมด</p><button type="button" class="btn primary" id="chooseManualTeams">ใช้วงล้อสุ่มทีละคน</button></div></div></div>`;
 $('#chooseAutoTeams').onclick=()=>{savedWheelTeams.pickMode='auto';savedWheelTeams.nextTeamIndex=0;persistWheelTeams();root.innerHTML='';randomizeAllTeams()};
 $('#chooseManualTeams').onclick=()=>{savedWheelTeams.pickMode='manual';savedWheelTeams.nextTeamIndex=0;persistWheelTeams();root.innerHTML='';syncWheelPool();renderSavedTeams();const result=$('#wheelResult');if(result)result.textContent='เลือกโหมดวงล้อแล้ว กด “หมุนวงล้อสุ่ม 1 คน” เพื่อเริ่มจัดทีม';updateWheelSpinButton()};
}
function updateWheelSpinButton(){
 const btn=$('#spinWheel');if(!btn)return;
 const manual=savedWheelTeams?.pickMode==='manual'&&!!savedWheelTeams?.teams?.length;
 btn.textContent=manual?'🎡 หมุนวงล้อสุ่ม 1 คน → เข้าทีมถัดไป':'🎡 หมุนวงล้อสุ่ม 1 คน';
 btn.disabled=wheelBusy||wheelNames().length===0;
}
function openLeaderPicker(teams, allNames=wheelNames()){
 const root=$('#modalRoot');if(!root)return;
 const names=[...new Set(allNames.map(n=>String(n).trim()).filter(Boolean))];
 if(names.length<teams.length){toast('จำนวนรายชื่อที่เหลือไม่พอสำหรับหัวหน้าทีม');return}
 root.innerHTML=`<div class="wheel-modal-back"><form class="wheel-leader-modal"><div style="font-size:34px">👑</div><h2>กำหนดหัวหน้าทีม</h2><p class="muted-note">เลือกหัวหน้าทีมจากรายชื่อทั้งหมด แต่ละคนเป็นหัวหน้าได้เพียงทีมเดียว</p>${teams.map((team,i)=>`<div class="wheel-leader-row"><label>ทีม ${i+1}</label><select name="leader${i}" data-leader-index="${i}" required>${names.map(n=>`<option value="${esc(n)}" ${n===team.leader?'selected':''}>${esc(n)}</option>`).join('')}</select></div>`).join('')}<div class="wheel-leader-actions"><button type="button" class="btn" id="cancelLeaderPick">ยกเลิก</button><button type="submit" class="btn primary">ยืนยันหัวหน้าทีม</button></div></form></div>`;
 const form=root.querySelector('form');
 const syncOptions=()=>{
  const selects=[...form.querySelectorAll('select[data-leader-index]')],chosen=selects.map(x=>x.value);
  selects.forEach((sel,i)=>{const keep=sel.value;sel.innerHTML=names.filter(n=>!chosen.some((v,j)=>j!==i&&v===n)).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if(names.includes(keep)&&!chosen.some((v,j)=>j!==i&&v===keep))sel.value=keep;});
 };
 form.querySelectorAll('select').forEach(sel=>sel.addEventListener('change',syncOptions));syncOptions();
 $('#cancelLeaderPick').onclick=()=>root.innerHTML='';
 root.querySelector('.wheel-modal-back').onclick=e=>{if(e.target.classList.contains('wheel-modal-back'))root.innerHTML=''};
 form.onsubmit=e=>{
  e.preventDefault();
  const data=new FormData(form),leaders=teams.map((team,i)=>String(data.get(`leader${i}`)||''));
  if(leaders.some(x=>!x)||new Set(leaders).size!==leaders.length){toast('หัวหน้าทีมแต่ละทีมต้องไม่ซ้ำกัน');return}
  const oldTeams=savedWheelTeams?.teams||[],hadExisting=oldTeams.length===teams.length;
  let nextTeams=teams.map((team,i)=>({leader:leaders[i],members:[leaders[i]]}));
  let freed=[];
  if(hadExisting){
   nextTeams=teams.map((team,i)=>{const old=oldTeams[i]||{members:[]};return {leader:leaders[i],members:[...new Set([leaders[i],...(old.members||[]).filter(n=>n!==old.leader&&n!==leaders[i])])]};});
   freed=oldTeams.map(t=>t.leader).filter(n=>!leaders.includes(n)&&!nextTeams.some(t=>t.members.includes(n)));
  }
  savedWheelTeams={teams:nextTeams,createdAt:new Date().toISOString(),pickMode:hadExisting?(savedWheelTeams.pickMode||'auto'):null,nextTeamIndex:hadExisting?(savedWheelTeams.nextTeamIndex||0):0};
  if(freed.length)saveWheelNames([...wheelNames(),...freed]);
  persistWheelTeams();syncWheelPool();root.innerHTML='';renderSavedTeams();
  if(!hadExisting)chooseTeamMode(true);else{updateWheelSpinButton();toast('บันทึกหัวหน้าทีมแล้ว')}
 };
}
function randomizeAllTeams(){
 if(!savedWheelTeams?.teams?.length)return;
 const remaining=wheelNames();if(!remaining.length){toast('ไม่มีรายชื่อเหลือในวงล้อ');return}
 const shuffled=[...remaining];
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
 shuffled.forEach((name,i)=>savedWheelTeams.teams[i%savedWheelTeams.teams.length].members.push(name));
 savedWheelTeams.pickMode='auto';persistWheelTeams();syncWheelPool();renderSavedTeams();updateWheelSpinButton();toast(`สุ่มสมาชิก ${remaining.length} คนเข้าทีมเรียบร้อย`);
}
function randomizeOneToTeam(index){
 const teams=savedWheelTeams?.teams||[],remaining=wheelNames(),team=teams[index];
 if(!team||!remaining.length){toast('ไม่มีรายชื่อเหลือในวงล้อ');return}
 const pick=Math.floor(Math.random()*remaining.length),name=remaining[pick];
 team.members.push(name);persistWheelTeams();syncWheelPool();renderSavedTeams();toast(`เพิ่ม ${name} เข้า ${'ทีม '+(index+1)} แล้ว`);
}
function wheel(){
 if(!isAdmin())return '<div class="panel">ไม่มีสิทธิ์เข้าถึงวงล้อชื่อ</div>';
 const names=state.members.filter(m=>m.active).map(m=>m.name);
 const savedNames=localStorage.getItem('gangWheelNames');
 const initial=savedNames!==null?savedNames:names.join('\n');
 if(savedWheelTeams===null){try{savedWheelTeams=JSON.parse(localStorage.getItem('gangWheelTeams')||'null')}catch{savedWheelTeams=null}}
 return `<div class="hero"><div><div class="eyebrow">RANDOM PICKER / TEAM SHUFFLE</div><h3>วงล้อสุ่มชื่อ</h3><p>สุ่มผู้โชคดีและจัดทีมพร้อมหัวหน้าทีมในคลิกเดียว</p></div><div class="hero-tag">สมาชิกที่ใช้งาน ${names.length} คน</div></div>
 <div class="wheel-layout"><div class="panel"><div class="wheel-stage"><div class="wheel-pointer"></div><canvas id="wheelCanvas"></canvas><div class="wheel-hub">★</div></div><div class="toolbar" style="justify-content:center"><button class="btn primary wheel-spin-btn" id="spinWheel">🎡 หมุนวงล้อสุ่ม 1 คน</button></div><div class="wheel-result" id="wheelResult" style="margin-top:16px">พร้อมแล้ว! กดปุ่มเพื่อเริ่มหมุนวงล้อ</div></div>
 <div class="panel wheel-controls"><div><h3>👥 รายชื่อในวงล้อ</h3><p class="muted-note">รายชื่อที่ยังไม่ได้เป็นหัวหน้าทีมหรือถูกจัดเข้าทีมเท่านั้น</p><textarea id="wheelNamesInput" class="wheel-names">${esc(initial)}</textarea><div class="toolbar" style="margin-top:9px"><button class="btn small" id="wheelReloadNames">โหลดรายชื่อสมาชิกที่มีอยู่</button><button class="btn small" id="wheelShuffleNames">สลับลำดับชื่อ</button><button class="btn small danger" id="wheelClearAll">ล้างรายชื่อ/ทีม</button></div></div>
 <div class="field"><label>จำนวนทีมที่ต้องการแบ่ง (2–20 ทีม)</label><input id="wheelTeamCount" type="number" min="2" max="20" value="${savedWheelTeams?.teams?.length||2}"></div><button class="btn primary" id="wheelMakeTeams">⇄ สร้างทีม + เลือกหัวหน้าทีม</button><div id="wheelTeamsResult"></div><p class="muted-note">หลังเลือกหัวหน้าทีมแล้ว สามารถสุ่มสมาชิกทั้งหมดเข้าทีมพร้อมกัน หรือสุ่มเข้าทีมทีละคนได้</p></div></div>`;
}
function bindWheel(){
 if(savedWheelTeams?.teams?.length)syncWheelPool();
 const names=wheelNames();saveWheelNames(names);drawWheel(names,true);renderSavedTeams();updateWheelSpinButton();
 $('#wheelNamesInput')?.addEventListener('input',()=>{
  const a=wheelNames();saveWheelNames(a);drawWheel(a,true);
  $('#wheelResult').textContent='รายชื่อเปลี่ยนแล้ว พร้อมสุ่ม';
 });
 $('#wheelReloadNames')?.addEventListener('click',()=>{
  const assigned=new Set((savedWheelTeams?.teams||[]).flatMap(t=>[t.leader,...(t.members||[])]));
  const a=state.members.filter(m=>m.active&&!assigned.has(m.name)).map(m=>m.name);
  $('#wheelNamesInput').value=a.join('\n');saveWheelNames(a);drawWheel(a,true);renderSavedTeams();toast('โหลดรายชื่อที่ยังไม่ถูกจัดทีมแล้ว');
 });
 $('#wheelShuffleNames')?.addEventListener('click',()=>{
  const a=wheelNames();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  $('#wheelNamesInput').value=a.join('\n');saveWheelNames(a);drawWheel(a,true);
 });
 $('#wheelClearAll')?.addEventListener('click',()=>{
  if(!confirm('ต้องการล้างรายชื่อและผลการแบ่งทีมทั้งหมดใช่หรือไม่?'))return;
  localStorage.removeItem('gangWheelNames');localStorage.removeItem('gangWheelTeams');savedWheelTeams=null;
  $('#wheelNamesInput').value='';drawWheel([],true);$('#wheelTeamsResult').innerHTML='';$('#wheelResult').textContent='ล้างรายชื่อและผลการแบ่งทีมแล้ว';
 });
 $('#spinWheel')?.addEventListener('click',()=>{
  const list=wheelNames();if(!list.length){toast('ไม่มีรายชื่อเหลือให้สุ่ม');return}if(wheelBusy)return;
  const chosen=Math.floor(Math.random()*list.length),arc=360/list.length,center=chosen*arc+arc/2;
  const canvas=$('#wheelCanvas');wheelBusy=true;$('#spinWheel').disabled=true;$('#wheelResult').textContent='🎡 กำลังหมุน...';
  canvas.style.transition='none';canvas.style.transform='rotate(0deg)';void canvas.offsetWidth;
  const extra=360*6+(360-center);canvas.style.transition='transform 4.2s cubic-bezier(.12,.72,.12,1)';canvas.style.transform=`rotate(${extra}deg)`;wheelRotation=extra;
  setTimeout(()=>{
   const winner=list[chosen],manual=savedWheelTeams?.pickMode==='manual',teams=savedWheelTeams?.teams||[];
   wheelBusy=false;
   if(manual&&teams.length){
    if(!wheelNames().includes(winner)){if($('#spinWheel'))$('#spinWheel').disabled=false;return}
    const teamIndex=Number(savedWheelTeams.nextTeamIndex||0)%teams.length;
    teams[teamIndex].members.push(winner);
    savedWheelTeams.nextTeamIndex=(teamIndex+1)%teams.length;
    persistWheelTeams();syncWheelPool();showWheelWinner(`${winner} → ทีม ${teamIndex+1}`);renderSavedTeams();
    if(!wheelNames().length){const result=$('#wheelResult');if(result)result.innerHTML+=`<br><span class="muted-note">จัดสมาชิกครบทุกทีมแล้ว</span>`}
   }else{showWheelWinner(winner)}
   updateWheelSpinButton();if($('#spinWheel'))$('#spinWheel').disabled=!wheelNames().length;
  },4300);
 });
 $('#wheelMakeTeams')?.addEventListener('click',()=>{
  const list=wheelNames(),count=Number($('#wheelTeamCount').value);
  if(!list.length){toast('กรุณาเพิ่มรายชื่อก่อน');return}
  if(!Number.isInteger(count)||count<2||count>20){toast('จำนวนทีมต้องอยู่ระหว่าง 2–20 ทีม');return}
  if(count>list.length){toast('จำนวนทีมต้องไม่มากกว่าจำนวนรายชื่อที่เหลือ');return}
  const draftTeams=Array.from({length:count},(_,i)=>({leader:list[i],members:[]}));
  openLeaderPicker(draftTeams,list);
 });
}

async function loadAudit(from=auditRange.from,to=auditRange.to,q=auditRange.q){auditRange={from,to,q};auditData=await api(`/api/audit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}`);render()}
function audit(){
 if(!isAdmin())return '<div class="panel">ไม่มีสิทธิ์เข้าถึงประวัติการทำงาน</div>';
 if(!auditData)return '<div class="panel"><h3>ประวัติการทำงาน</h3><p class="muted-note">กำลังโหลดข้อมูล...</p></div>';
 const rows=auditData.logs||[];
 return `<div class="hero"><div><div class="eyebrow">SYSTEM AUDIT / ACTIVITY LOG</div><h3>ประวัติการทำงานของระบบ</h3><p>ตรวจสอบว่าใครทำอะไร และทำเมื่อไหร่</p></div><div class="hero-tag">บันทึกสูงสุด 1,000 รายการล่าสุด</div></div>
 <div class="panel report-toolbar"><div class="field"><label>ตั้งแต่วันที่</label><input id="auditFrom" type="date" value="${esc(auditRange.from)}"></div><div class="field"><label>ถึงวันที่</label><input id="auditTo" type="date" value="${esc(auditRange.to)}"></div><div class="field"><label>ค้นหาผู้กระทำ / การกระทำ / รายละเอียด</label><input id="auditQuery" value="${esc(auditRange.q)}" placeholder="เช่น Shadow, แก้ไขจำนวน, ลบสมาชิก"></div><button class="btn primary" id="applyAuditFilter">ค้นหา</button><button class="btn" id="resetAuditFilter">ทั้งหมด</button><button class="btn" id="exportAuditCsv">ส่งออก CSV</button></div>
 <div class="stats">${stat('รายการที่พบ',rows.length,'◷','ตามตัวกรอง')}${stat('ผู้กระทำไม่ซ้ำ',new Set(rows.map(x=>x.actor)).size,'♙','บัญชีผู้ใช้งาน')}${stat('ประเภทการกระทำ',new Set(rows.map(x=>x.action)).size,'▤','รายการที่แตกต่างกัน')}${stat('ขีดจำกัดข้อมูล',auditData.limit||1000,'⌕','รายการล่าสุด')}</div>
 <div class="panel"><div class="panel-head"><div><h3>รายการกิจกรรม</h3><div class="panel-sub">เรียงจากรายการล่าสุดไปเก่าสุด</div></div></div><div class="table-wrap"><table><thead><tr><th>วันและเวลา</th><th>ผู้กระทำ</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead><tbody>${rows.map(x=>`<tr><td style="white-space:nowrap">${esc(fmt(x.createdAt))}</td><td><b>${esc(x.actor||'-')}</b></td><td><span class="pill blue">${esc(x.action||'-')}</span></td><td>${esc(x.detail||'-')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">ไม่พบประวัติการทำงาน</td></tr>'}</tbody></table></div></div>`;
}
function exportAuditCsv(){if(!auditData)return;const rows=[['วันเวลา','ผู้กระทำ','การกระทำ','รายละเอียด'],...(auditData.logs||[]).map(x=>[x.createdAt,x.actor,x.action,x.detail])];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});downloadBlob(blob,'gang-control-activity-log.csv')}

function attendance(){
 if(!isAdmin())return `<div class="panel"><h3>ประวัติการเช็กชื่อของฉัน</h3><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวลา</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>${state.attendanceHistory.map(a=>`<tr><td>${a.date}</td><td>${a.time}</td><td><span class="pill ${statusClass[a.status]}">${statusNames[a.status]}</span></td><td>${esc(a.note||'-')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">ยังไม่มีประวัติ</td></tr>'}</tbody></table></div></div>`;

 const sessions=state.sessions,active=state.members.filter(m=>m.active),rows=state.attendance;
 const selected=sessions.find(s=>s.id===selectedSession)||sessions[0];
 const sessionRows=active.map(m=>({m,a:rows.find(a=>a.memberId===m.id&&a.sessionId===selected.id)}));
 const count=key=>sessionRows.filter(x=>(x.a?.status||'unmarked')===key).length;

 return `<div class="hero"><div><div class="eyebrow">DAILY ROLL CALL</div><h3>เช็กชื่อสมาชิก</h3><p>เลือกเฉพาะคนที่ ขาดลา แล้วบันทึกทีเดียว</p></div><div class="hero-tag">บันทึกย้อนหลังได้</div></div>
 <div class="panel"><div class="toolbar"><div class="field"><label>เลือกวันที่เช็กชื่อ</label><input id="attendanceDate" type="date" value="${selectedDate}"></div><div class="field"><label>เลือกประวัติรอบ</label><span class="muted-note">ข้อมูลของวันที่เลือก</span></div></div>
 <div class="toolbar"><div class="field" style="flex:1;min-width:220px"><label>ค้นหาชื่อสมาชิก</label><input id="attendanceSearch" type="search" placeholder="พิมพ์ชื่อสมาชิกเพื่อค้นหา..."></div></div><div class="session-tabs">${sessions.map(s=>`<button class="session-tab ${s.id===selected.id?'active':''}" data-session="${s.id}">${s.label}<b>${s.time}</b></button>`).join('')}</div>
 <div class="count-cards"><span>มา ${count('present')}</span><span>มาสาย ${count('late')}</span><span>ขาด ${count('absent')}</span><span>ลา ${count('leave')}</span><span>ธุระ ${count('business')}</span><span>ยังไม่เช็ก ${count('unmarked')}</span></div>
 <div class="attendance-list">${sessionRows.map(({m,a})=>`<div class="attendance-row" data-member-row="${m.id}"><div class="member-name"><b>${esc(m.name)}</b><small>${esc(m.rank||'สมาชิก')}</small></div><select class="status-select" data-status><option value="unmarked" ${!a?'selected':''}>ยังไม่เช็กชื่อ</option><option value="present" ${a?.status==='present'?'selected':''}>มา</option><option value="late" ${a?.status==='late'?'selected':''}>มาสาย</option><option value="absent" ${a?.status==='absent'?'selected':''}>ขาด</option><option value="leave" ${a?.status==='leave'?'selected':''}>ลา</option><option value="business" ${a?.status==='business'?'selected':''}>ติดธุระ</option></select><input class="inline-note" data-note placeholder="หมายเหตุ" value="${esc(a?.note||'')}"></div>`).join('')||'<div class="empty">ยังไม่มีสมาชิก</div>'}
 <div class="panel-head" style="margin-top:18px"><span class="muted-note">เลือกเฉพาะคนที่ลา ขาด หรือมาสาย · คนที่ไม่เลือกจะถือว่ามา</span><button class="btn primary" id="saveAllAttendance">บันทึกทั้งหมด</button></div></div>
 <div class="panel"><h3>ประวัติเช็กชื่อของวันที่ ${selectedDate}</h3><p class="muted-note">เปลี่ยนวันที่ด้านบนเพื่อดูข้อมูลวันอื่น</p></div>`;
}

function members(){return `<div class="panel"><div class="panel-head"><div><h3>รายชื่อสมาชิกในแก๊ง</h3><div class="panel-sub">เพิ่มบัญชีให้สมาชิกเพื่อเข้าสู่ระบบของตัวเอง · การนำออกจะเก็บประวัติเดิมไว้</div></div><button class="btn primary" id="addMember">＋ เพิ่มสมาชิก</button></div><div class="table-wrap"><table><thead><tr><th>ชื่อในเกม</th><th>Game Identifier</th><th>ยศ</th><th>สถานะ</th><th>วันที่เข้าร่วม</th><th></th></tr></thead><tbody>${state.members.filter(m=>m.active).map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.gameId||'-')}</td><td>${esc(m.rank)}</td><td><span class="pill ${m.active?'green':'red'}">${m.active?'ใช้งาน':'นำออกแล้ว'}</span></td><td>${m.joinedAt}</td><td>${m.active?`<button class="btn danger small" data-remove-member="${m.id}">นำออก</button>`:'-'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">ยังไม่มีสมาชิก</td></tr>'}</tbody></table></div></div>`}

function inventory(){return `<div class="panel"><div class="panel-head"><div><h3>คลังไอเทม</h3><div class="panel-sub">รายการของกลาง · ไอเทมที่รับจากระบบส่งของจะเพิ่มเข้าคลังอัตโนมัติ</div></div>${isAdmin()?'<div class="toolbar"><button class="btn primary" id="addItem">＋ เพิ่มไอเทม</button></div>':''}</div><div class="table-wrap"><table><thead><tr><th>ชื่อไอเทม</th><th>หมวดหมู่</th><th>จำนวนคงเหลือ</th><th>หน่วย</th><th>สถานะ</th>${isAdmin()?'<th>จัดการ</th>':''}</tr></thead><tbody>${state.items.map(i=>`<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.category)}</td><td>${i.qty}</td><td>${esc(i.unit)}</td><td><span class="pill ${i.qty<=i.min?'yellow':'green'}">${i.qty<=i.min?'ใกล้หมด':'ปกติ'}</span></td>${isAdmin()?`<td><button class="btn small" data-edit-item-qty="${i.id}">แก้จำนวน</button> <button class="btn danger small" data-delete-item="${i.id}">ลบไอเทม</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${isAdmin()?6:5}" class="empty">ยังไม่มีไอเทม</td></tr>`}</tbody></table></div></div>`}

function requests(){return `<div class="panel"><div class="panel-head"><div><h3>${isAdmin()?'คำขอเบิกไอเทมจากสมาชิก':'ส่งคำขอเบิกไอเทม'}</h3><div class="panel-sub">เมื่อแอดมินอนุมัติ ระบบจะหักจำนวนออกจากคลังให้อัตโนมัติ</div></div>${!isAdmin()?'<button class="btn primary" id="newRequest">＋ ขอเบิกไอเทม</button>':''}</div><div class="table-wrap"><table><thead><tr><th>สมาชิก</th><th>ไอเทม</th><th>จำนวน</th><th>เหตุผล</th><th>สถานะ</th><th>วันเวลา</th>${isAdmin()?'<th>จัดการ</th>':''}</tr></thead><tbody>${state.requests.map(r=>`<tr><td>${esc(r.member)}</td><td>${esc(r.item)}</td><td>${r.qty}</td><td>${esc(r.reason||'-')}</td><td><span class="pill ${r.status==='pending'?'yellow':r.status==='approved'?'green':'red'}">${r.status==='pending'?'รออนุมัติ':r.status==='approved'?'อนุมัติแล้ว':'ปฏิเสธ'}</span></td><td>${fmt(r.createdAt)}</td>${isAdmin()?`<td>${r.status==='pending'?`<button class="btn success small" data-request-decision="approved" data-id="${r.id}">อนุมัติ</button> <button class="btn danger small" data-request-decision="rejected" data-id="${r.id}">ปฏิเสธ</button>`:'-'}</td>`:''}</tr>`).join('')||`<tr><td colspan="${isAdmin()?7:6}" class="empty">ยังไม่มีคำขอเบิก</td></tr>`}</tbody></table></div></div>`}

function deliveries(){
 const tasks=state.dailyTasks||[],contrib=state.contributions||[];

 if(isAdmin()) return `<div class="panel"><div class="panel-head"><div><h3>กำหนดรายการส่งของประจำวัน</h3><div class="panel-sub">เลือกไอเทมจากคลัง · ตรวจยอดส่งรายสมาชิก · ยอดที่บันทึกจะเพิ่มเข้าคลังทันที</div></div><button class="btn primary" id="addDailyTask">＋ เพิ่มส่งของ</button></div>
 <div class="toolbar"><div class="field" style="flex:1;min-width:220px"><label>ค้นหาชื่อสมาชิกในระบบส่งของ</label><input id="deliveryMemberSearch" type="search" placeholder="พิมพ์ชื่อสมาชิก..."></div></div>
 <div class="panel-sub">ภาพรวมยอดส่งสะสมของสมาชิกทุกคน</div>
 <div class="table-wrap"><table><thead><tr><th>สมาชิก</th><th>รายการที่ต้องส่ง</th><th>ส่งแล้ว</th><th>คงเหลือ</th><th>สถานะภาพรวม</th></tr></thead><tbody>${state.members.filter(m=>m.active).map(m=>{const mine=tasks.filter(t=>!t.closed || (contrib.some(c=>c.taskId===t.id&&c.memberId===m.id)));const due=mine.reduce((n,t)=>n+Math.max(0,t.qty-(contrib.find(c=>c.taskId===t.id&&c.memberId===m.id)?.qty||0)),0);const sent=mine.reduce((n,t)=>n+Math.min(t.qty,contrib.find(c=>c.taskId===t.id&&c.memberId===m.id)?.qty||0),0);return `<tr class="delivery-member-row" data-member-name="${esc(m.name.toLocaleLowerCase('th'))}"><td><b>${esc(m.name)}</b></td><td>${mine.length} รายการ</td><td>${sent}</td><td>${due}</td><td><span class="pill ${due?'yellow':'green'}">${due?'ยังมียอดค้าง':'ครบตามรายการ'}</span></td></tr>`}).join('')||'<tr><td colspan="5" class="empty">ไม่มีสมาชิก</td></tr>'}</tbody></table></div>
 <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>รายการ</th><th>กำหนด/คน</th><th>ส่งครบ</th><th>ค้างส่ง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${tasks.map(t=>{const cs=contrib.filter(c=>c.taskId===t.id);const active=state.members.filter(m=>m.active);const done=active.filter(m=>{const c=cs.find(x=>x.memberId===m.id);return c&&(c.complete||c.qty>=t.qty)}).length;const pending=active.length-done;return `<tr><td>${t.date}</td><td><b>${esc(t.name)}</b></td><td>${t.qty} ${esc(t.unit)}</td><td>${done}/${active.length} คน</td><td><span class="pill ${pending?'yellow':'green'}">${pending} คน</span></td><td><span class="pill ${t.closed?'blue':'green'}">${t.closed?'ปิดวันแล้ว':'กำลังดำเนินการ'}</span></td><td>${!t.closed?`<button class="btn success small" data-close-task="${t.id}">ปิดวัน</button> `:''}<button class="btn danger small" data-delete-task="${t.id}">ลบรายการ</button></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">ยังไม่มีรายการส่งของ</td></tr>'}</tbody></table></div></div>
 ${tasks.map(t=>`<div class="panel"><div class="panel-head"><div><h3>${esc(t.name)} · ${t.date}</h3><div class="panel-sub">กำหนด ${t.qty} ${esc(t.unit)} ต่อคน · เลือกบันทึกยอดที่ส่งจริง หรือกดส่งครบ</div></div><span class="pill ${t.closed?'blue':'green'}">${t.closed?'ปิดวันแล้ว':'เปิดรับส่ง'}</span></div><div class="table-wrap"><table><thead><tr><th>สมาชิก</th><th>ยอดที่ส่งแล้ว</th><th>คงเหลือ</th><th>สถานะ</th><th>จำนวนที่ส่ง</th><th>บันทึก</th></tr></thead><tbody>${state.members.filter(m=>m.active).map(m=>{const c=contrib.find(x=>x.taskId===t.id&&x.memberId===m.id),sent=c?.qty||0,left=Math.max(0,t.qty-sent),complete=left===0;return `<tr class="delivery-member-row" data-member-name="${esc(m.name.toLocaleLowerCase('th'))}"><td><b>${esc(m.name)}</b></td><td>${sent} ${esc(t.unit)}</td><td>${left} ${esc(t.unit)}</td><td><span class="pill ${complete?'green':'yellow'}">${complete?'ส่งครบ':'ยังไม่ครบ'}</span></td><td><input type="number" min="0" step="1" id="admin-qty-${t.id}-${m.id}" value="${sent}" style="max-width:110px" ${t.closed?'disabled':''}></td><td>${!t.closed?`<button class="btn small" data-admin-save-contribution="${t.id}" data-member="${m.id}">บันทึก</button> <button class="btn success small" data-admin-complete-contribution="${t.id}" data-member="${m.id}">ส่งครบ</button>`:'-'}</td></tr>`}).join('')}</tbody></table></div></div>`).join('')}
 <div class="panel"><h3>รายงานยอดค้างส่งแยกตามวัน</h3><div class="table-wrap"><table><thead><tr><th>วันที่ค้าง</th><th>สมาชิก</th><th>รายการ</th><th>กำหนด</th><th>ส่งแล้ว</th><th>คงค้าง</th></tr></thead><tbody>${tasks.flatMap(t=>state.members.filter(m=>m.active).map(m=>{const c=contrib.find(x=>x.taskId===t.id&&x.memberId===m.id);const due=Math.max(0,t.qty-(c?.qty||0));return due?`<tr><td>${t.date}</td><td>${esc(m.name)}</td><td>${esc(t.name)}</td><td>${t.qty}</td><td>${c?.qty||0}</td><td><span class="pill red">${due} ${esc(t.unit)}</span></td></tr>`:''})).join('')||'<tr><td colspan="6" class="empty">ไม่มีสมาชิกค้างส่ง</td></tr>'}</tbody></table></div></div>`;

 return `<div class="hero"><div><div class="eyebrow">DAILY DELIVERY</div><h3>รายการส่งของของฉัน</h3><p>ส่งตามจำนวนที่กำหนด บันทึกยอดที่ส่งจริงได้หลายครั้ง</p></div></div>${tasks.map(t=>{const c=contrib.find(x=>x.taskId===t.id&&x.memberId===state.user.memberId);const left=Math.max(0,t.qty-(c?.qty||0));return `<div class="panel"><div class="panel-head"><div><h3>${esc(t.name)} · ${t.date}</h3><div class="panel-sub">ต้องส่ง ${t.qty} ${esc(t.unit)} · ส่งแล้ว ${c?.qty||0} · คงเหลือ ${left}</div></div><span class="pill ${left===0?'green':'yellow'}">${left===0?'ครบแล้ว':'ยังไม่ครบ'}</span></div>${!t.closed?`<div class="toolbar"><div class="field"><label>จำนวนที่ส่งสะสม</label><input type="number" min="0" step="1" id="qty-${t.id}" value="${c?.qty||0}"></div><button class="btn primary" data-save-contribution="${t.id}">บันทึกยอด</button><button class="btn success" data-complete-contribution="${t.id}">ส่งครบ</button></div>`:'<span class="muted-note">ปิดรับยอดของวันนี้แล้ว</span>'}</div>`}).join('')||'<div class="panel empty">ยังไม่มีรายการส่งของจากแอดมิน</div>'}`;
}

/* =====================================
   ประวัติสมาชิก (โค้ดใหม่ที่เพิ่มเข้ามา)
===================================== */

function history(){
 if(!isAdmin()) return `
 <div class="panel">
   <h3>ประวัติของฉัน</h3>
   <p class="muted-note">ประวัติการส่งของและคำขอเบิกจะแสดงในแต่ละเมนู</p>
 </div>`;

 // ใช้รายชื่อทั้งหมดเพื่อเก็บประวัติเดิมไว้ แต่ซ่อนสมาชิกเริ่มต้น
 // ที่ไม่ต้องการให้แสดงในหน้าประวัติ
 const hiddenHistoryNames = new Set(['shadow', 'raven', 'ghost']);
 const members = (state.memberHistory || state.members).filter(m =>
   !hiddenHistoryNames.has(String(m.name || '').trim().toLocaleLowerCase('th'))
 );

 const summary = members.map(m => {
   const records = state.attendanceHistory.filter(
     x => Number(x.memberId) === Number(m.id)
   );

   const absent = records.filter(x => x.status === 'absent');
   const leave = records.filter(x => x.status === 'leave');
   const business = records.filter(x => x.status === 'business');

   const details = (items) => items
     .sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time))
     .map(x => `
       <div class="history-item">
         <b>${esc(x.date)}</b>
         <span>${esc(x.sessionLabel || '')} ${esc(x.time || '')}</span>
         <small>${esc(x.note || '-')}</small>
       </div>
     `).join('') || '<span class="muted-note">ไม่มีประวัติ</span>';

   return `
   <div class="panel history-member-card" data-member-name="${esc(m.name.toLocaleLowerCase('th'))}" data-absent-count="${absent.length}">
     <div class="panel-head">
       <div><h3>${esc(m.name)}</h3>
       <div class="panel-sub">${esc(m.rank || 'สมาชิก')}</div></div>
       <span class="pill">${records.length} รอบที่บันทึก</span>
     </div>

     <div class="count-cards">
       <span class="pill red">ขาด ${absent.length} ครั้ง</span>
       <span class="pill blue">ลา ${leave.length} ครั้ง</span>
       <span class="pill yellow">ติดธุระ ${business.length} ครั้ง</span>
     </div>

     <h4>ประวัติการขาด</h4>
     ${details(absent)}

     <h4>ประวัติการลา</h4>
     ${details(leave)}

     <h4>ประวัติติดธุระ</h4>
     ${details(business)}
   </div>`;
 }).join('');

 return `
 <div class="hero">
   <div>
     <div class="eyebrow">MEMBER ATTENDANCE REPORT</div>
     <h3>ภาพรวมการขาดและการลา</h3>
     <p>ตรวจสอบสถิติและประวัติแยกตามสมาชิก</p>
   </div>
 </div>
 <div class="panel">
   <div class="toolbar" style="align-items:end;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:1;min-width:220px">
       <label>ค้นหาชื่อสมาชิกในประวัติการขาด</label>
       <input id="historyMemberSearch" type="search" placeholder="พิมพ์ชื่อสมาชิกที่ต้องการค้นหา...">
     </div>
     <button type="button" class="btn danger" id="historyAbsentFilter" aria-pressed="${historyAbsentOnly}">ขาด</button>
   </div>
 </div>
 <div id="historyMemberList">${summary}</div>
 <div id="historyNoResults" class="panel muted-note" hidden>ไม่พบชื่อสมาชิกที่ตรงกับคำค้นหา</div>
 `;
}

/* =====================================
   ระบบ Modal
===================================== */

function openModal(title,html,onSubmit){const root=$('#modalRoot');root.innerHTML=`<div class="modal-back"><form class="modal"><h3>${title}</h3>${html}<div class="modal-actions"><button type="button" class="btn" data-close>ยกเลิก</button><button class="btn primary">บันทึก</button></div></form></div>`;root.querySelector('[data-close]').onclick=()=>root.innerHTML='';root.querySelector('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))root.innerHTML=''};root.querySelector('form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await onSubmit(data);root.innerHTML='';await refresh()}catch(err){toast(err.message)}}}

function installGameScrollStyles(){
 if($('#gameScrollStyles'))return;
 const st=document.createElement('style');st.id='gameScrollStyles';st.textContent=`
 .bingo-main>aside,.game-right-sidebar,.right-game-sidebar,.right-sidebar,.sidebar-right{position:sticky;top:12px;align-self:start;max-height:calc(100vh - 130px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#7a8798 #182333;padding-right:5px}
 .bingo-main>aside::-webkit-scrollbar,.game-right-sidebar::-webkit-scrollbar,.right-game-sidebar::-webkit-scrollbar,.right-sidebar::-webkit-scrollbar,.sidebar-right::-webkit-scrollbar{width:7px}
 .bingo-main>aside::-webkit-scrollbar-thumb,.game-right-sidebar::-webkit-scrollbar-thumb,.right-game-sidebar::-webkit-scrollbar-thumb,.right-sidebar::-webkit-scrollbar-thumb,.sidebar-right::-webkit-scrollbar-thumb{background:#7a8798;border-radius:20px}
 @media(max-width:850px){.bingo-main>aside,.game-right-sidebar,.right-game-sidebar,.right-sidebar,.sidebar-right{position:static;max-height:none;overflow:visible}}
 `;document.head.appendChild(st);
}
function bingo(){
 installGameScrollStyles();
 const rooms=(bingoState?.rooms||[]).filter(x=>x.status==='waiting'||x.status==='playing'),r=bingoState?.room,me=r?.player,players=r?.players||[],drawn=r?.drawn||[],called=new Set(drawn),latest=drawn[drawn.length-1],numbers=Array.from({length:75},(_,i)=>i+1),active=r?.status==='playing';
 const winners=r?.winners?.length?r.winners:(r?.winner?[r.winner]:[]);
 const ballLabel=n=>n<=15?'B':n<=30?'I':n<=45?'N':n<=60?'G':'O';
 const roomCards=rooms.map(x=>`<article class="bingo-side-panel" style="margin:0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h3 style="margin:0 0 5px">${esc(x.title)}</h3><div class="bingo-muted">เจ้าของห้อง: ${esc(x.hostName)} · ${x.playerCount} คน</div><div class="bingo-muted">${x.status==='waiting'?'🟢 รอผู้เล่น':x.status==='playing'?'🔴 กำลังเล่น':'จบเกมแล้ว'}</div></div><div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><button class="bingo-action" style="width:auto;padding:10px 18px" data-room-join="${esc(x.id)}" ${x.status!=='waiting'?'disabled':''}>เข้าร่วมห้อง</button>${isAdmin()?`<button class="bingo-create" style="border-color:#d9a4a4;color:#a32626" data-room-delete="${esc(x.id)}">ลบห้อง</button>`:''}</div></div></article>`).join('');
 if(!r)return `<section class="bingo-shell"><div class="bingo-banner"><div><div class="bingo-eyebrow">✦ LOS SANTOS BINGO CLUB · MULTI ROOM</div><h2>BINGO</h2><p>สร้างห้อง เล่นกับสมาชิก และลุ้น BINGO ไปพร้อมกัน</p></div><div class="bingo-live">● ROOM LOBBY</div></div><div class="bingo-eventbar"><div><div class="bingo-event-kicker">✦ CREATE YOUR ROOM</div><h3>สร้างห้อง BINGO ของคุณ</h3><p>ทุกคนสามารถสร้างห้องและเป็นเจ้าของห้องได้</p></div><button class="bingo-action" id="bingoCreate">＋ สร้างห้อง</button></div><div style="padding:18px"><div class="bingo-panel-head"><div><h3>ห้อง BINGO ทั้งหมด</h3><div class="bingo-muted">เลือกห้องที่กำลังรอผู้เล่นเพื่อเข้าร่วม</div></div><button class="bingo-create" id="bingoRefresh">↻ รีเฟรชห้อง</button></div><div style="display:grid;gap:10px">${roomCards||'<div class="bingo-empty"><div class="emoji">🎱</div><h3>ยังไม่มีห้อง BINGO</h3><p>สร้างห้องแรกเพื่อเริ่มเล่นได้เลย</p></div>'}</div></div></section>`;
 const card=me?`<section class="bingo-card-panel"><div class="bingo-panel-head"><div><h3>บัตรผู้เล่น · PLAYER TICKET</h3><div class="bingo-muted">แตะเลขที่ถูกสุ่มแล้วเพื่อวงกลมสีแดง</div></div><b style="color:#0b6b59">${me.marked.filter(Boolean).length}/25</b></div><div class="bingo-ticket"><div class="bingo-ticket-head"><strong>BINGO</strong><span>ROOM ${String(r.id).slice(-5)}</span></div><div class="bingo-card-grid">${['B','I','N','G','O'].map(x=>`<div class="bingo-letter">${x}</div>`).join('')}${me.card.map((n,i)=>{const free=i===12,hit=called.has(n);return `<button class="bingo-square ${free?'free':''} ${me.marked[i]?'marked':''} " data-bingo-cell="${i}" ${free||me.marked[i]||!hit||(!active&&!(r.status==='finished'&&r.canStillWin))?'disabled':''}>${free?'✳':String(n).padStart(2,'0')}</button>`}).join('')}</div><div class="bingo-ticket-foot"><span>PLAYER TICKET · 75 BALL</span><span>${drawn.length}/75</span></div></div></section>`:'<section class="bingo-card-panel"><div class="bingo-empty">ไม่พบการ์ดผู้เล่นในห้องนี้</div></section>';
 const owner=r.isHost;
 const remaining=Math.max(0,Math.ceil(((r.nextDrawAt||Date.now()+7000)-(Date.now()+bingoServerOffset))/1000));
 const remainingLabel=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
 return `<section class="bingo-shell"><div class="bingo-banner"><div><div class="bingo-eyebrow">✦ LOS SANTOS BINGO CLUB · ROOM ${String(r.id).slice(-5)}</div><h2>BINGO</h2><p>${esc(r.title)} · เจ้าของห้อง ${esc(r.hostName)}</p></div><div class="bingo-live">● ${r.status==='waiting'?'WAITING':active?'LIVE':'FINISHED'} · ${players.length} PLAYERS</div></div><div class="bingo-eventbar"><div><div class="bingo-event-kicker">✦ ${r.status==='waiting'?'ROOM LOBBY':active?'LIVE GAME':'GAME FINISHED'}</div><h3>${esc(r.title)}</h3><p>${r.status==='waiting'?'รอเจ้าของห้องกดเริ่มเกม':active?'ระบบสุ่มเลขอัตโนมัติทุก 7 วินาที':'เกมจบแล้ว'}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">${owner&&r.status==='waiting'?'<button class="bingo-action" id="bingoStart">▶ เริ่มเกม</button>':''}<button class="bingo-create" id="bingoBack">← กลับหน้าห้อง</button>${me?'<button class="bingo-create" id="bingoLeave">ออกจากห้อง</button>':''}</div></div><div class="bingo-main"><div>${card}<section class="bingo-side-panel" style="margin-top:12px"><div class="bingo-panel-head"><div><h3>กระดานเลขที่ถูกเรียก</h3><div class="bingo-muted">NUMBER BOARD · 01–75</div></div><b>${drawn.length}/75</b></div><div class="bingo-number-grid">${numbers.map(n=>`<span class="bingo-number ">${String(n).padStart(2,'0')}</span>`).join('')}</div></section></div><aside><section class="bingo-side-panel"><div class="bingo-panel-head"><div><h3>สถานะห้อง</h3><div class="bingo-muted">ROOM STATUS</div></div><b>${r.status==='waiting'?'WAITING':active?'LIVE':'ENDED'}</b></div><div class="bingo-live-grid"><div class="bingo-stat-card"><div class="bingo-stat-label">เลขที่ออกแล้ว</div><div class="bingo-stat-value">${drawn.length}<small>/75</small></div></div><div class="bingo-stat-card"><div class="bingo-stat-label">ผู้เล่น</div><div class="bingo-stat-value">${players.length}</div></div></div><div class="bingo-call-box" style="margin-top:10px"><small>เลขล่าสุด · LAST CALL</small><div class="bingo-current-ball">${latest?String(latest).padStart(2,'0'):'—'}</div><b>${latest?ballLabel(latest)+' – '+String(latest).padStart(2,'0'):'รอเริ่มเกม'}</b><div class="bingo-countdown-wrap"><div class="bingo-countdown-ring" id="bingoCountdownRing" style="--progress:${active?((7-remaining)/7*360):0}deg"><strong id="bingoCountdown">${active?remainingLabel:'0:07'}</strong></div><span class="bingo-countdown-label">${active?'วินาที ก่อนสุ่มเลขถัดไป':'เริ่มนับเมื่อเริ่มเกม'}</span></div></div><p class="bingo-muted" style="text-align:center;margin:8px 0">${active?'สุ่มเลขอัตโนมัติทุก 7 วินาที':r.status==='waiting'?'รอเจ้าของห้องเริ่มเกม':'จบเกมแล้ว'}</p><div class="bingo-history-balls">${drawn.slice(-12).reverse().map(n=>`<span class="bingo-history-ball">${n}</span>`).join('')}</div>${winners.length?`<div class="bingo-winner">🏆 ผู้ชนะ${winners.length>1?'ทั้งหมด':''}:<br>${winners.map(w=>`${esc(w.name)} (${esc(w.line||'BINGO')})`).join('<br>')}</div>`:''}</section><section class="bingo-side-panel" style="margin-top:12px"><h3>สมาชิกในห้อง · ${players.length}</h3><div class="bingo-players">${players.map(p=>`<span class="bingo-player-chip">${esc(p.name)}${p.winner?' 🏆':''}</span>`).join('')}</div></section></aside></div></section>`;
}

let impostorLastSignature='';
async function loadImpostor(roomId){roomId=roomId||localStorage.getItem('gcImpostorRoom')||'';const q=roomId?`?roomId=${encodeURIComponent(roomId)}`:'';const beforeState=impostorState;const before=beforeState?JSON.stringify(beforeState):'';const next=await api('/api/impostor'+q);const oldRoom=beforeState?.room, newRoom=next?.room;if(newRoom&&oldRoom&&String(newRoom.id)===String(oldRoom.id)){if(newRoom.phase!==oldRoom.phase){if(newRoom.phase==='finished'){GCSound.play('finish');}else if(newRoom.phase==='clue'||newRoom.phase==='vote'||newRoom.phase==='guess')GCSound.play('start');}else if((newRoom.clues?.length||0)>(oldRoom.clues?.length||0))GCSound.play('join');else if((newRoom.players||[]).filter(x=>x.voted).length>(oldRoom.players||[]).filter(x=>x.voted).length)GCSound.play('vote');}impostorState=next;if(page==='impostor'&&before!==JSON.stringify(next))render();}
async function impostorPost(path,body={}){await api(path,{method:'POST',body:JSON.stringify(body)});await loadImpostor(impostorState?.room?.id);}
function impostor(){
 installGameScrollStyles();
 const rooms=impostorState?.rooms||[],r=impostorState?.room,p=r?.me,players=r?.players||[],phase=r?.phase;
 const statusText={lobby:'WAITING ROOM',clue:'CLUE ROUND',vote:'VOTING',guess:'FINAL GUESS',finished:'GAME OVER'};
 const header=`<div class="im-hero"><div><div class="im-kicker">GANG CONTROL · SOCIAL DEDUCTION</div><h2>🕵️ IMPOSTOR</h2><p>หนึ่งคนไม่รู้คำลับ ใครจะเนียนได้ และใครจะจับผิดได้ก่อน?</p></div><div class="im-pill">● ${r?statusText[phase]||phase:'PUBLIC LOBBY'}</div></div>`;
 const rules=`<section class="im-panel"><h3>📜 วิธีเล่น</h3><div class="im-rule"><span>1</span><div><b>รับบทลับ</b><div class="im-muted">ทุกคนจะได้รับคำลับเดียวกัน ยกเว้น Impostor ที่จะไม่เห็นคำ</div></div></div><div class="im-rule"><span>2</span><div><b>ให้คำใบ้</b><div class="im-muted">ผลัดกันส่งคำใบ้สั้น ๆ ห้ามพูดคำลับตรง ๆ และห้ามบอกคำใบ้ซ้ำ</div></div></div><div class="im-rule"><span>3</span><div><b>โหวตผู้ต้องสงสัย</b><div class="im-muted">ทุกคนเลือกผู้เล่นที่คิดว่าเป็น Impostor โหวตได้คนละ 1 ครั้ง</div></div></div><div class="im-rule"><span>4</span><div><b>ตัดสินผล</b><div class="im-muted">ถ้าจับ Impostor ได้ เขาจะมีโอกาสทายคำลับ ถ้าทายถูกจะชนะทันที · ถ้าคะแนนเสมอ Impostor ชนะ</div></div></div><div class="im-rule"><span>5</span><div><b>เงื่อนไขชนะ</b><div class="im-muted">ฝ่ายผู้เล่นชนะเมื่อจับได้และ Impostor ทายผิด · Impostor ชนะเมื่อรอดจากการโหวตหรือทายคำถูก</div></div></div></section>`;
 if(!r)return `<section class="im-shell">${header}<div class="im-body"><div class="im-grid"><section class="im-panel"><div class="im-kicker">CREATE A ROOM</div><h3 style="font-size:22px">เปิดห้องลับของแก๊ง</h3><p class="im-muted">สร้างห้องได้ทุกคน รองรับ 3–12 คน · มี Impostor 1 คน</p><div class="im-field" style="margin:14px 0"><label>หมวดคำลับ</label><select id="imCategory"><option value="random">สุ่มหมวดหมู่</option><option value="food">อาหาร</option><option value="places">สถานที่</option><option value="objects">สิ่งของ</option><option value="animals">สัตว์</option><option value="jobs">อาชีพ</option><option value="games">เกมและบันเทิง</option></select></div><button class="im-btn" id="imCreate">＋ สร้างห้องใหม่</button></section><section class="im-panel"><div class="im-kicker">HOW TO WIN</div><h3 style="font-size:22px">อ่านกติกาก่อนเริ่ม</h3>${rules}</section></div><section class="im-panel"><h3>เข้าร่วมด้วยรหัสห้อง</h3><div class="im-muted">กรอกรหัส 6 หลักที่เจ้าของห้องส่งให้</div><div style="display:flex;gap:8px;margin-top:12px"><input id="imJoinCode" inputmode="numeric" maxlength="6" placeholder="รหัสห้อง 6 หลัก" style="min-width:0;flex:1;border:1px solid #40546b;background:#0d1723;color:#fff;border-radius:9px;padding:11px"><button class="im-btn" id="imJoinCodeBtn">เข้าร่วม</button></div></section><section class="im-panel"><div class="im-room"><div><h3>ห้องที่กำลังเปิดอยู่</h3><div class="im-muted">เข้าร่วมได้เฉพาะห้องที่ยังไม่เริ่มเกม</div></div><button class="im-btn ghost" id="imRefresh">↻ รีเฟรช</button></div><div style="display:grid;gap:9px;margin-top:13px">${rooms.map(x=>`<div class="im-lobby-card"><div><b>${esc(x.title)}</b><div class="im-muted">เจ้าของ ${esc(x.hostName)} · ${x.playerCount}/12 คน · ${x.phase==='lobby'?'รอเริ่ม':'กำลังเล่น'}</div><div class="im-code" style="font-size:13px;letter-spacing:2px">${esc(x.code)}</div></div><div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><button class="im-btn" data-im-join="${esc(x.id)}" ${x.phase!=='lobby'?'disabled':''}>เข้าร่วมห้อง</button>${impostorState?.isAdmin?`<button class="im-btn red" data-im-delete="${esc(x.id)}" title="ลบห้องนี้">ลบห้อง</button>`:''}</div></div>`).join('')||'<div class="im-muted" style="padding:20px;text-align:center">ยังไม่มีห้อง เปิดห้องแรกได้เลย</div>'}</div></section></div></section>`;
 const me=players.find(x=>String(x.userId)===String(r.meId))||{};
 const roleCard=p?.role==='impostor'?`<div class="im-secret im-bad"><div class="im-kicker" style="color:#ff9aa7">YOUR SECRET ROLE</div><div class="word">IMPOSTOR</div><p>คุณไม่ได้รับคำลับ พยายามเนียนจากคำใบ้ของคนอื่น</p></div>`:`<div class="im-secret"><div class="im-kicker">YOUR SECRET WORD · ${esc(r.categoryLabel||'')}</div><div class="word">${esc(p?.word||'กำลังโหลด')}</div><p class="im-muted">ห้ามเปิดเผยคำนี้ให้ผู้เล่นคนอื่นเห็น</p></div>`;
 const playerList=players.map(x=>`<div class="im-player">${esc(x.name)} ${String(x.userId)===String(r.hostId)?'👑':''}${x.alive===false?' · ออกจากเกม':''}<small>${x.submitted?'ส่งคำใบ้แล้ว':phase==='lobby'?'พร้อมเล่น':x.voted?'โหวตแล้ว':'รอการดำเนินการ'}</small></div>`).join('');
 const clues=(r.clues||[]).map(x=>`<div class="im-clue"><b>${esc(x.name)}</b><span>${esc(x.text)}</span></div>`).join('');
 let stage='';
 if(phase==='lobby')stage=`<div class="im-panel"><div class="im-kicker">ROOM CODE</div><div class="im-room"><div class="im-code">${esc(r.code)}</div><button class="im-btn ghost" id="imCopy">คัดลอกรหัส</button></div><p class="im-muted">แชร์รหัสนี้ให้สมาชิกเข้าห้อง · ต้องมีอย่างน้อย 3 คน</p><div class="im-players">${playerList}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${r.isHost?'<button class="im-btn" id="imStart" '+(players.length<3?'disabled':'')+'>▶ เริ่มเกม</button>':''}</div></div>`;
 if(phase==='clue')stage=`${roleCard}<div class="im-panel"><div class="im-room"><div><h3>รอบคำใบ้</h3><div class="im-muted">ทุกคนส่งคำใบ้ 1 คำหรือวลีสั้น ๆ ห้ามพูดคำลับโดยตรง</div></div><span class="im-pill">${(r.clues||[]).length}/${players.length} ส่งแล้ว</span></div>${p?.submitted?'<div class="im-toast-note" style="margin-top:12px">ส่งคำใบ้แล้ว รอผู้เล่นคนอื่น…</div>':`<div class="im-field" style="margin-top:14px"><label>คำใบ้ของคุณ</label><input id="imClueText" maxlength="45" placeholder="พิมพ์คำใบ้สั้น ๆ..."></div><button class="im-btn" id="imSendClue" style="margin-top:10px">ส่งคำใบ้</button>`}<div class="im-clues" style="margin-top:15px">${clues||'<div class="im-muted">ยังไม่มีคำใบ้</div>'}</div></div>`;
 if(phase==='vote')stage=`<div class="im-panel"><h3>🗳️ ลงคะแนนหาตัว Impostor</h3><p class="im-muted">อ่านคำใบ้ทั้งหมดแล้วเลือกผู้เล่นที่น่าสงสัยที่สุด · โหวตได้ครั้งเดียว</p><div class="im-clues">${clues}</div>${p?.voted?'<div class="im-toast-note" style="margin-top:12px">คุณลงคะแนนแล้ว รอผลโหวตจากทุกคน…</div>':`<div style="display:grid;gap:8px;margin-top:14px">${players.filter(x=>String(x.userId)!==String(r.meId)&&x.alive!==false).map(x=>`<button class="im-vote" data-im-vote="${esc(x.userId)}"><b>${esc(x.name)}</b><span>เลือกคนนี้ →</span></button>`).join('')}</div>`}</div>`;
 if(phase==='guess')stage=`<div class="im-panel"><div class="im-secret im-bad"><div class="im-kicker">IMPOSTOR CAUGHT</div><div class="word">จับตัวได้แล้ว!</div><p>แต่ยังมีโอกาสพลิกเกมด้วยการทายคำลับ</p></div>${p?.role==='impostor'?`<div class="im-field" style="margin-top:14px"><label>ทายคำลับ</label><input id="imGuessText" maxlength="60" placeholder="คำที่คิดว่าคนอื่นได้รับ..."></div><button class="im-btn red" id="imGuess" style="margin-top:10px">ส่งคำทายครั้งสุดท้าย</button>`:'<div class="im-toast-note" style="margin-top:12px">รอ Impostor ทายคำลับ…</div>'}</div>`;
 if(phase==='finished')stage=`<div class="im-result"><div style="font-size:42px">${r.winner==='crew'?'🏆':'🕵️'}</div><div class="im-kicker">MATCH RESULT</div><h2>${r.winner==='crew'?'CREW WIN':'IMPOSTOR WIN'}</h2><p>${esc(r.resultText||'จบเกม')}</p><p class="im-muted">คำลับคือ <b style="color:#ffe2a6">${esc(r.wordReveal||'')}</b> · Impostor: ${esc(r.impostorNames||'')}</p>${r.isHost?'<button class="im-btn" id="imRematch">เริ่มเกมใหม่</button>':''}</div>`;
 return `<section class="im-shell">${header}<div class="im-body"><div class="im-room"><div><div class="im-kicker">${esc(r.title)}</div><div class="im-muted">ห้อง ${esc(r.code)} · ${players.length} ผู้เล่น</div></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="im-pill">${esc(statusText[phase]||phase)}</span><button class="im-btn red" id="imExit">ออกจากเกม</button></div></div>${stage}<div class="im-panel"><div class="im-room"><h3>สมาชิกในห้อง</h3><span class="im-muted">${players.length} คน</span></div><div class="im-players">${playerList}</div></div></div></section>`;
}
function wireImpostor(){
 $('#imCreate')?.addEventListener('click',async()=>{try{const out=await api('/api/impostor/create',{method:'POST',body:JSON.stringify({category:$('#imCategory').value})});localStorage.setItem('gcImpostorRoom',out.roomId);await loadImpostor(out.roomId);toast('สร้างห้องแล้ว แชร์รหัสให้สมาชิกได้เลย')}catch(e){toast(e.message)}});
 $('#imRefresh')?.addEventListener('click',()=>loadImpostor('').catch(e=>toast(e.message)));
 $('#imJoinCodeBtn')?.addEventListener('click',async()=>{const code=$('#imJoinCode')?.value.trim();if(!/^\d{6}$/.test(code||''))return toast('กรุณากรอกรหัสห้อง 6 หลัก');try{const out=await api('/api/impostor/join-code',{method:'POST',body:JSON.stringify({code})});localStorage.setItem('gcImpostorRoom',out.roomId);await loadImpostor(out.roomId)}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-im-delete]').forEach(b=>b.onclick=async()=>{
  const room=impostorState?.rooms?.find(x=>String(x.id)===String(b.dataset.imDelete));
  if(!room)return;
  if(!confirm(`ยืนยันลบห้อง ${room.code} ของ ${room.hostName}? ผู้เล่นทุกคนจะถูกนำออกจากห้อง`))return;
  try{
    await api(`/api/impostor/${encodeURIComponent(b.dataset.imDelete)}`,{method:'DELETE'});
    if(String(localStorage.getItem('gcImpostorRoom'))===String(b.dataset.imDelete))localStorage.removeItem('gcImpostorRoom');
    await loadImpostor('');
    toast('ลบห้อง IMPOSTOR แล้ว');
  }catch(e){toast(e.message)}
});
document.querySelectorAll('[data-im-join]').forEach(b=>b.onclick=async()=>{try{await api(`/api/impostor/${encodeURIComponent(b.dataset.imJoin)}/join`,{method:'POST',body:'{}'});localStorage.setItem('gcImpostorRoom',b.dataset.imJoin);await loadImpostor(b.dataset.imJoin)}catch(e){toast(e.message)}});
 $('#imCopy')?.addEventListener('click',()=>{navigator.clipboard?.writeText(impostorState?.room?.code||'').then(()=>toast('คัดลอกรหัสห้องแล้ว')).catch(()=>toast('คัดลอกไม่สำเร็จ'))});
 $('#imStart')?.addEventListener('click',async()=>{try{await impostorPost(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/start`);toast('เริ่มเกมแล้ว')}catch(e){toast(e.message)}});
 $('#imExit')?.addEventListener('click',async()=>{try{if(!confirm('ต้องการออกจากเกมนี้ใช่หรือไม่?'))return;await api(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/leave`,{method:'POST',body:'{}'});localStorage.removeItem('gcImpostorRoom');await loadImpostor('');}catch(e){toast(e.message)}});
 $('#imSendClue')?.addEventListener('click',async()=>{const clue=$('#imClueText')?.value.trim();if(!clue)return toast('กรุณาพิมพ์คำใบ้');try{await impostorPost(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/clue`,{clue})}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-im-vote]').forEach(b=>b.onclick=async()=>{try{await impostorPost(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/vote`,{targetId:b.dataset.imVote})}catch(e){toast(e.message)}});
 $('#imGuess')?.addEventListener('click',async()=>{const guess=$('#imGuessText')?.value.trim();if(!guess)return toast('กรุณาพิมพ์คำทาย');try{await impostorPost(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/guess`,{guess})}catch(e){toast(e.message)}});
 $('#imRematch')?.addEventListener('click',async()=>{try{await impostorPost(`/api/impostor/${encodeURIComponent(impostorState.room.id)}/rematch`)}catch(e){toast(e.message)}});
}


async function loadWerewolf(roomId, forceLobby=false){
 if(forceLobby){werewolfForceLobby=true;localStorage.removeItem('gcWerewolfRoom');roomId='';}
 else if(werewolfForceLobby){roomId='';}
 else roomId=roomId||localStorage.getItem('gcWerewolfRoom')||'';
 const requestSeq=++werewolfRequestSeq;
 const showLobby=forceLobby||werewolfForceLobby;
 const q=roomId?`?roomId=${encodeURIComponent(roomId)}`:(showLobby?'?lobby=1':'');
 const before=werewolfState?JSON.stringify(werewolfState):'';
 const next=await api('/api/werewolf'+q);
 if(requestSeq!==werewolfRequestSeq)return;
 const old=werewolfState?.room,now=next?.room;
 if(old&&now&&String(old.id)===String(now.id)){
  if(old.phase!==now.phase){
   if(now.phase==='night'){GCSound.play('night');setTimeout(()=>GCSound.play('wolf'),700);}
   else if(now.phase==='day')GCSound.play('bell');
   else if(now.phase==='vote')GCSound.play('vote');
   else if(now.phase==='hunter_shot')GCSound.play('hunter');
   else if(now.phase==='finished'){
    const role=now.me?.role;
    const won=now.winner==='jester'?role==='jester':now.winner==='wolf'?role==='wolf':now.winner==='village'?role!=='wolf'&&role!=='jester':false;
    GCSound.play(now.winner==='jester'&&won?'jester':won?(now.winner==='village'?'winVillage':'winWolf'):'lose');
   }
  }
  const oldNight=JSON.stringify(old.lastNight||null),newNight=JSON.stringify(now.lastNight||null);
  if(newNight!==oldNight&&now.lastNight){
   if((now.lastNight.killed||[]).length)GCSound.play('kill');
   if(now.lastNight.saved||now.lastNight.bodyguardSacrifice)GCSound.play('protect');
  }
  const oldVote=JSON.stringify(old.lastVote||null),newVote=JSON.stringify(now.lastVote||null);
  if(newVote!==oldVote&&now.lastVote){
   if(now.lastVote.role==='ตัวตลก')GCSound.play('jester');
   else GCSound.play('voteResult');
  }
  if(old.me?.alive!==false&&now.me?.alive===false)GCSound.play('death');
  if(!old.me?.role&&now.me?.role){const roleSound={wolf:'wolf',alpha:'wolf',seer:'seer',detective:'seer',priest:'protect',medium:'seer',infected:'wolf',king:'bell',assassin:'hunter',witch:'witch',bodyguard:'protect',guardian:'protect',hunter:'hunter',jester:'jester',villager:'start'};GCSound.play(roleSound[now.me.role]||'start');}
  if(JSON.stringify(old.me?.seerResult||null)!==JSON.stringify(now.me?.seerResult||null)&&now.me?.seerResult)GCSound.play('seer');
 }
 if(now?.me?.deathEvent&&now.me.alive===false){
  const previousId=old?.me?.deathEvent?.id;
  if(previousId!==now.me.deathEvent.id)showWerewolfDeathEffect(now.me.deathEvent,now.id);
 }
 werewolfState=next;
 if(next?.room?.id&&!showLobby)localStorage.setItem('gcWerewolfRoom',next.room.id);
 if(!next?.room&&roomId)localStorage.removeItem('gcWerewolfRoom');
 if(page==='werewolf'&&before!==JSON.stringify(next))render();
}
async function werewolfPost(path,body={}){await api(path,{method:'POST',body:JSON.stringify(body)});await loadWerewolf(werewolfState?.room?.id);}
function werewolf(){
 installGameScrollStyles();
 const rooms=werewolfState?.rooms||[],r=werewolfState?.room,players=r?.players||[],p=r?.me,phase=r?.phase;
 const phases={lobby:'ห้องรอผู้เล่น',night:'กลางคืน',day:'กลางวัน · อภิปราย',vote:'ลงคะแนน',hunter_shot:'นายพรานลั่นไก',finished:'จบเกม'};
 const header=`<div class="ww-hero"><div><div class="ww-kicker">GANG CONTROL · SOCIAL DEDUCTION</div><h2>🐺 WEREWOLF</h2><p>หมู่บ้านที่เต็มไปด้วยความลับ ใครคือหมาป่าที่ซ่อนอยู่?</p></div><div class="ww-pill">● ${r?phases[phase]||phase:'PUBLIC LOBBY'}</div></div>`;
 const rules=`<section class="ww-panel"><h3>📜 วิธีเล่น</h3><div class="ww-rule"><span>1</span><div><b>รับบทบาทลับ</b><div class="ww-muted">หมาป่า ผู้หยั่งรู้ แม่มด และชาวบ้าน จะถูกสุ่มให้อัตโนมัติ</div></div></div><div class="ww-rule"><span>2</span><div><b>กลางคืน</b><div class="ww-muted">หมาป่าเลือกเหยื่อ ผู้หยั่งรู้ตรวจสอบหนึ่งคน แม่มดเลือกใช้ยาช่วยหรือยาพิษ</div></div></div><div class="ww-rule"><span>3</span><div><b>กลางวัน</b><div class="ww-muted">ทุกคนอภิปรายกันในเกม แล้วเจ้าของห้องกดเปิดโหวตเพื่อเลือกผู้ต้องสงสัย</div></div></div><div class="ww-rule"><span>4</span><div><b>เงื่อนไขชนะ</b><div class="ww-muted">ชาวบ้านชนะเมื่อกำจัดหมาป่าหมด · หมาป่าชนะเมื่อมีจำนวนเท่ากับหรือมากกว่าฝ่ายอื่น</div></div></div></section>`;
 if(!r)return `<section class="ww-shell">${header}<div class="ww-body"><div class="ww-grid"><section class="ww-panel"><div class="ww-kicker">CREATE YOUR VILLAGE</div><h3 style="font-size:22px">เปิดหมู่บ้านใหม่</h3><p class="ww-muted">รองรับ 4–16 คน · สุ่มบทบาทอัตโนมัติ · เล่นพร้อมกันแบบเรียลไทม์</p><div class="ww-field" style="margin:14px 0"><label>ชื่อห้อง</label><input id="wwTitle" maxlength="50" value="หมู่บ้านรัตติกาล"></div><button class="ww-btn" id="wwCreate">＋ สร้างห้องใหม่</button></section><section class="ww-panel"><div class="ww-kicker">HOW TO PLAY</div>${rules}</section></div><section class="ww-panel"><h3>เข้าร่วมด้วยรหัสห้อง</h3><div class="ww-muted">กรอกรหัส 6 หลักจากเจ้าของห้อง</div><div style="display:flex;gap:8px;margin-top:12px"><input id="wwJoinCode" inputmode="numeric" maxlength="6" placeholder="รหัสห้อง 6 หลัก" style="min-width:0;flex:1;border:1px solid #4a5a70;background:#101824;color:#fff;border-radius:9px;padding:11px"><button class="ww-btn" id="wwJoinCodeBtn">เข้าร่วม</button></div></section><section class="ww-panel"><div class="ww-room"><div><h3>หมู่บ้านที่เปิดอยู่</h3><div class="ww-muted">เลือกห้องที่ยังรอผู้เล่น</div></div><button class="ww-btn ghost" id="wwRefresh">↻ รีเฟรช</button></div><div style="display:grid;gap:9px;margin-top:13px">${rooms.map(x=>`<div class="ww-lobby-card"><div><b>${esc(x.title)}</b><div class="ww-muted">เจ้าของ ${esc(x.hostName)} · ${x.playerCount}/16 คน</div><div class="ww-code" style="font-size:14px">${esc(x.code)}</div></div><div style="display:flex;gap:7px;flex-wrap:wrap">${werewolfState?.isAdmin?`<button class="ww-btn red" data-ww-delete="${esc(x.id)}">ลบห้อง</button>`:''}<button class="ww-btn" data-ww-join="${esc(x.id)}">เข้าร่วมห้อง</button></div></div>`).join('')||'<div class="ww-muted" style="padding:20px;text-align:center">ยังไม่มีหมู่บ้านที่เปิดอยู่</div>'}</div></section></div></section>`;
 const playerCards=players.map(x=>`<div class="ww-player ${x.alive?'':'ww-dead'}"><b>${esc(x.name)} ${String(x.userId)===String(r.hostId)?'👑':''}</b><small>${x.left?'↗ ออกจากเกม':x.alive?'● ยังมีชีวิต':'✕ ถูกกำจัด'}${x.role?' · '+esc(x.role):x.isWolfMate?' · 🐺 หมาป่าทีมเดียวกัน':''}${phase==='night'&&x.nightSubmitted?' · ส่งคำสั่งแล้ว':''}${phase==='vote'&&x.voted?' · โหวตแล้ว':''}</small></div>`).join('');
 const alive=players.filter(x=>x.alive);
 const roleGuides={
   wolf:['🐺 หมาป่า','ฝ่ายหมาป่า','กำจัดชาวบ้านให้จำนวนหมาป่าเท่ากับหรือมากกว่าฝ่ายอื่น','ร่วมเลือกเหยื่อกับหมาป่าตัวอื่นทุกคืน','เลือกผู้เล่นที่ไม่ใช่หมาป่า 1 คน ระบบนับเสียงหมาป่าทั้งหมด','สังเกตคำพูดของคนอื่นและอย่าเปิดเผยตัว'],
   alpha:['🐺 หมาป่าอัลฟ่า','ฝ่ายหมาป่า','ชนะพร้อมทีมหมาป่า','เลือกเหยื่อกลางคืนร่วมกับหมาป่าทั่วไป','เลือกเป้าหมายที่ไม่ใช่หมาป่าเหมือนหมาป่าทั่วไป','เวอร์ชันนี้ไม่มีสกิลแยกจากหมาป่าทั่วไป แต่ถูกนับเป็นหมาป่า'],
   seer:['🔮 ผู้หยั่งรู้','ฝ่ายหมู่บ้าน','ช่วยค้นหาและกำจัดหมาป่า','ตรวจสอบผู้เล่นที่ยังมีชีวิตได้คืนละ 1 คน','เลือกผู้เล่นเพื่อดูเฉพาะคุณว่าเป็นคนดีหรือคนไม่ดี (อัลฟ่าถือเป็นคนไม่ดี)','เก็บผลตรวจไว้ใช้ประกอบการอภิปราย'],
   detective:['🔍 นักสืบ','ฝ่ายหมู่บ้าน','ค้นหาฝ่ายหมาป่าเพื่อช่วยหมู่บ้าน','ตรวจสอบฝ่ายของผู้เล่นที่ยังมีชีวิตได้คืนละ 1 คน','เลือกผู้เล่นเพื่อดูว่าเป็นหมาป่าหรือไม่ โดยแยกหมาป่าอัลฟ่าได้','ใช้ผลตรวจเป็นข้อมูลลับประกอบการตัดสินใจ'],
   witch:['🧙 แม่มด','ฝ่ายหมู่บ้าน','ช่วยชีวิตคนในหมู่บ้านและกำจัดผู้ต้องสงสัย','มียาช่วยชีวิต 1 ครั้ง และยาพิษ 1 ครั้งตลอดเกม','ยาช่วยชีวิตใช้กับเหยื่อหมาป่าที่ระบบระบุ ยาพิษเลือกผู้เล่นอื่นเพื่อกำจัด หรือกดข้าม','คิดให้รอบคอบ เพราะยาแต่ละขวดใช้ซ้ำไม่ได้'],
   priest:['✝️ นักบวช','ฝ่ายหมู่บ้าน','ปกป้องสมาชิกจากการโจมตีของหมาป่า','ปกป้องผู้เล่นอื่นจากหมาป่าได้ 1 ครั้งตลอดเกม','เลือกผู้เล่นหนึ่งคนในเวลากลางคืน ถ้าคนนั้นเป็นเหยื่อหมาป่าจะรอดและใช้สิทธิ์หมด','สิทธิ์จะถูกใช้เมื่อช่วยเหยื่อได้สำเร็จเท่านั้น'],
   medium:['🔮 คนทรง','ฝ่ายหมู่บ้าน','ใช้ข้อมูลจากคนตายช่วยเปิดโปงหมาป่า','ตรวจบทบาทจริงของผู้เล่นที่ตายแล้วได้ 1 ครั้งตลอดเกม','กลางคืนเลือกชื่อผู้เล่นที่เสียชีวิตเพื่อดูบทบาท หรือกดข้าม','รอให้มีคนเสียชีวิตก่อนใช้สกิล'],
   infected:['🧟 ผู้ติดเชื้อ','ฝ่ายหมู่บ้านในตอนเริ่ม','เอาตัวรอดจากการถูกหมาป่าล่า','ถ้าหมาป่าเลือกเป็นเหยื่อและไม่ได้รับการปกป้อง จะรอดแต่เปลี่ยนเป็นหมาป่าทันที','ไม่มีปุ่มกด ระบบเปลี่ยนฝ่ายให้อัตโนมัติเมื่อถูกโจมตีสำเร็จ','หลังเปลี่ยนฝ่าย การ์ดจะกลายเป็นหมาป่าและร่วมทีมหมาป่า'],
   king:['👑 กษัตริย์','ฝ่ายหมู่บ้าน','ช่วยกำจัดหมาป่าและเอาตัวรอด','ยกเลิกผลโหวตประหารตัวเองครั้งแรกได้ 1 ครั้ง','ไม่ต้องกดใช้ หากถูกโหวตประหารครั้งแรก ระบบยกเลิกให้เอง','เมื่อใช้สิทธิ์แล้ว ครั้งต่อไปจะถูกกำจัดตามปกติ'],
   assassin:['🗡️ นักฆ่า','ฝ่ายนักฆ่า · ชนะเดี่ยว','กำจัดเป้าหมายที่เลือกให้สำเร็จเพื่อชนะทันที','ลอบสังหารผู้เล่นอื่นได้ 1 ครั้งตลอดเกม','กลางคืนเลือกเป้าหมายหนึ่งคน หากเป้าหมายถูกกำจัดในคืนนั้น คุณชนะทันที','เลือกให้ดี เพราะใช้สกิลได้ครั้งเดียว'],
   villager:['🏡 ชาวบ้าน','ฝ่ายหมู่บ้าน','ร่วมกันค้นหาและโหวตกำจัดหมาป่าให้หมด','ไม่มีคำสั่งพิเศษในเวลากลางคืน','อภิปราย สังเกตพิรุธ แลกเปลี่ยนข้อมูล และลงคะแนนผู้ต้องสงสัย','ฟังเหตุผลของทุกคนก่อนตัดสินใจ'],
   bodyguard:['🛡️ บอดี้การ์ด','ฝ่ายหมู่บ้าน','ปกป้องสมาชิกสำคัญจากหมาป่า','เลือกคุ้มกันผู้เล่นอื่นได้ทุกคืน','เลือกผู้เล่นหนึ่งคน หากคนนั้นถูกหมาป่าโจมตี คุณจะสละชีวิตแทน','คาดเดาเป้าหมายของหมาป่าให้ดี'],
   guardian:['✨ ผู้พิทักษ์','ฝ่ายหมู่บ้าน','ป้องกันผู้เล่นจากการโจมตีของหมาป่า','ปกป้องผู้เล่นอื่นได้ทุกคืน แต่ห้ามเลือกคนเดิมสองคืนติดกัน','เลือกชื่อผู้เล่นที่ยังมีชีวิตหนึ่งคนเพื่อปกป้อง','สลับเป้าหมายในแต่ละคืน'],
   hunter:['🏹 นายพราน','ฝ่ายหมู่บ้าน','ช่วยหมู่บ้านกำจัดหมาป่า','เมื่อถูกกำจัด สามารถยิงผู้เล่นหนึ่งคนก่อนออกจากเกม','เมื่อระบบเข้าสู่ช่วงนายพรานลั่นไก ให้เลือกผู้เล่นหนึ่งคน','สังเกตข้อมูลของผู้เล่นไว้เผื่อใช้กระสุนนัดสุดท้าย'],
   jester:['🤡 ตัวตลก','ฝ่ายตัวตลก · ชนะเดี่ยว','ทำให้ชาวบ้านโหวตคุณออกจากเกม','ชนะทันทีเมื่อถูกโหวตประหาร','ไม่มีปุ่มใช้สกิล ต้องทำให้ผู้เล่นสงสัยจนโหวตคุณออก','อย่าให้คนอื่นรู้ว่าคุณตั้งใจจะชนะด้วยวิธีนี้']
 };
 let roleCard='';
 if(p?.role){
  const role=p.role;
  const g=roleGuides[role]||['🎭 '+role,'ไม่ระบุฝ่าย','ทำตามเป้าหมายของบทบาท','ดูคำสั่งที่ระบบแสดง','ทำตามคำแนะนำบนหน้าจอ','ร่วมเล่นตามกติกา'];
  let status='';
  if(role==='priest')status=p.priestSaveUsed?'ใช้พรปกป้องแล้ว':'พรปกป้องยังใช้ได้';
  if(role==='medium')status=p.mediumUsed?'ใช้การตรวจแล้ว':'การตรวจยังใช้ได้';
  if(role==='assassin')status=p.assassinUsed?'ใช้การลอบสังหารแล้ว':'การลอบสังหารยังใช้ได้';
  if(role==='witch')status=`ยาช่วยชีวิต ${p.witchSaveUsed?'ใช้แล้ว':'ยังใช้ได้'} · ยาพิษ ${p.witchPoisonUsed?'ใช้แล้ว':'ยังใช้ได้'}`;
  if(role==='king')status=p.kingSaved?'ใช้สิทธิ์ยกเลิกโหวตแล้ว':'สิทธิ์ยกเลิกโหวตยังอยู่';
  roleCard=`<div class="ww-secret ${['wolf','alpha'].includes(role)?'wolf':''}">
   <div class="ww-kicker">YOUR SECRET ROLE · คู่มือบทบาทส่วนตัว</div><div class="role">${g[0]}</div>
   <div class="ww-role-guide"><div class="ww-role-guide-grid">
    <div class="ww-role-guide-item"><b>⚑ ฝ่ายของคุณ</b><span>${esc(g[1])}</span></div>
    <div class="ww-role-guide-item"><b>🏆 เป้าหมาย</b><span>${esc(g[2])}</span></div>
    <div class="ww-role-guide-item"><b>✨ สกิล</b><span>${esc(g[3])}</span></div>
    <div class="ww-role-guide-item"><b>🎮 วิธีใช้ / วิธีเล่น</b><span>${esc(g[4])}</span></div>
   </div><div class="ww-role-guide-item"><b>💡 เคล็ดลับ</b><span>${esc(g[5])}</span></div>
   ${status?`<div class="ww-role-guide-status ${status.includes('ใช้แล้ว')&&!status.includes('ยังใช้ได้')?'used':''}">${esc(status)}</div>`:''}</div>
   ${role==='seer'&&p.seerResult?`<div class="ww-notice" style="margin-top:10px">🔎 ผลตรวจล่าสุด: <b>${p.seerResult.isWolf?'คนไม่ดี':'คนดี'}</b></div>`:''}
   ${role==='detective'&&p.detectiveResult?`<div class="ww-notice" style="margin-top:10px">🔍 ผลตรวจล่าสุด: <b>${p.detectiveResult.isAlpha?'เป็นหมาป่าอัลฟ่า':p.detectiveResult.isWolf?'เป็นฝ่ายหมาป่า':'ไม่ใช่ฝ่ายหมาป่า'}</b></div>`:''}
   ${role==='medium'&&p.mediumResult?`<div class="ww-notice" style="margin-top:10px">🔮 ผลตรวจล่าสุด: <b>${esc(p.mediumResult.role)}</b></div>`:''}
  </div>`;
 }
 const roleCounts=r?.roleCounts||{};
 const roleOrder=['wolf','alpha','seer','detective','witch','priest','medium','infected','king','assassin','villager','bodyguard','guardian','hunter','jester'];
 const roleList=roleOrder.filter(key=>Number(roleCounts[key]||0)>0).map(key=>{const g=roleGuides[key];if(!g)return '';return `<article class="ww-info-role"><div class="ww-info-role-head"><b>${g[0]}</b><span>${Number(roleCounts[key])} คน</span></div><div class="ww-info-role-meta">${esc(g[1])}</div><p><b>เป้าหมาย</b> · ${esc(g[2])}</p><p><b>สกิล</b> · ${esc(g[3])}</p><p><b>วิธีเล่น</b> · ${esc(g[4])}</p><p><b>เคล็ดลับ</b> · ${esc(g[5])}</p></article>`}).join('');
 const infoModal=`<div class="ww-info-modal" id="wwInfoModal" hidden><div class="ww-info-backdrop" data-ww-info-close></div><section class="ww-info-dialog" role="dialog" aria-modal="true" aria-labelledby="wwInfoTitle"><header class="ww-info-top"><div><div class="ww-kicker">VILLAGE KNOWLEDGE</div><h3 id="wwInfoTitle">คู่มือบทบาทในเกม</h3></div><button class="ww-info-close" type="button" data-ww-info-close aria-label="ปิด">✕</button></header><nav class="ww-info-tabs"><button type="button" class="active" data-ww-info-tab="all">📚 บทบาทในเกมนี้</button><button type="button" data-ww-info-tab="mine">🪪 บทบาทของฉัน</button></nav><div class="ww-info-content"><div data-ww-info-panel="all" class="ww-info-pane active"><p class="ww-muted">ข้อมูลบทบาทที่อยู่ในรอบนี้ · ไม่เปิดเผยว่าใครถือบทบาทใด</p><div class="ww-info-role-list">${roleList||'<div class="ww-notice">ยังไม่มีข้อมูลบทบาท หรือเกมยังไม่เริ่ม</div>'}</div></div><div data-ww-info-panel="mine" class="ww-info-pane">${p?.role?roleCard:'<div class="ww-notice">บทบาทส่วนตัวจะแสดงเมื่อเกมเริ่มและสุ่มบทบาทแล้ว</div>'}</div></div></section></div>`;
 let stage='';
 if(phase==='lobby')stage=`<div class="ww-panel"><div class="ww-kicker">VILLAGE INVITATION</div><div class="ww-room"><div class="ww-code">${esc(r.code)}</div><button class="ww-btn ghost" id="wwCopy">คัดลอกรหัส</button></div><p class="ww-muted">แชร์รหัสนี้ให้สมาชิก · ต้องมีอย่างน้อย 4 คนจึงเริ่มได้</p>${r.isHost?`<div style="border-top:1px solid #3a485a;margin-top:14px;padding-top:14px"><div class="ww-kicker">CUSTOM ROLE SETUP</div><h3>🎭 เลือกบทบาทที่จะสุ่ม</h3><div class="ww-muted">ติ๊กเลือกบทบาทพิเศษที่ต้องการให้มีในเกม ระบบจะใช้ตัวเลือกปัจจุบันทันทีเมื่อกดเริ่มเกม (ไม่จำเป็นต้องบันทึกก่อน)</div><div class="ww-role-settings"><label class="ww-role-option"><input type="checkbox" id="wwRoleWolf" checked disabled><span><b>🐺 หมาป่า</b><small>มีอัตโนมัติ · จำนวนตามผู้เล่น</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleSeer" ${(r.roleConfig?.seer??true)?'checked':''}><span><b>🔮 ผู้หยั่งรู้</b><small>ตรวจสอบว่าใครเป็นหมาป่า</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleWitch" ${(r.roleConfig?.witch??true)?'checked':''}><span><b>🧙 แม่มด</b><small>ยาช่วยชีวิต 1 ครั้ง · ยาพิษ 1 ครั้ง</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleBodyguard" ${(r.roleConfig?.bodyguard??false)?'checked':''}><span><b>🛡️ บอดี้การ์ด</b><small>คุ้มกันเป้าหมาย โดยรับเคราะห์แทนหากถูกโจมตี</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleGuardian" ${(r.roleConfig?.guardian??false)?'checked':''}><span><b>✨ ผู้พิทักษ์</b><small>ป้องกันผู้เล่นจากหมาป่า ห้ามซ้ำคนเดิมติดกัน</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleHunter" ${(r.roleConfig?.hunter??false)?'checked':''}><span><b>🏹 นายพราน</b><small>หากถูกกำจัด สามารถยิงผู้เล่น 1 คน</small></span></label><label class="ww-role-option"><input type="checkbox" id="wwRoleJester" ${(r.roleConfig?.jester??false)?'checked':''}><span><b>🤡 ตัวตลก</b><small>ชนะทันทีหากถูกโหวตประหาร</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleDetective" ${(r.roleConfig?.detective??false)?'checked':''}><span><b>🔍 นักสืบ</b><small>ตรวจสอบฝ่ายของผู้เล่นทุกคืน</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRolePriest" ${(r.roleConfig?.priest??false)?'checked':''}><span><b>✝️ นักบวช</b><small>ป้องกันเหยื่อหมาป่าได้ 1 ครั้ง</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleMedium" ${(r.roleConfig?.medium??false)?'checked':''}><span><b>🔮 คนทรง</b><small>ตรวจสอบบทบาทคนตายได้ 1 ครั้ง</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleInfected" ${(r.roleConfig?.infected??false)?'checked':''}><span><b>🧟 ผู้ติดเชื้อ</b><small>ถูกหมาป่ากัดแล้วเปลี่ยนเป็นหมาป่า</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleKing" ${(r.roleConfig?.king??false)?'checked':''}><span><b>👑 กษัตริย์</b><small>ยกเลิกผลโหวตประหารตัวเองได้ 1 ครั้ง</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleAssassin" ${(r.roleConfig?.assassin??false)?'checked':''}><span><b>🗡️ นักฆ่า</b><small>กำจัดเป้าหมาย 1 คนและชนะทันที</small></span></label>
<label class="ww-role-option"><input type="checkbox" id="wwRoleAlpha" ${(r.roleConfig?.alpha??false)?'checked':''}><span><b>🐺 หมาป่าอัลฟ่า</b><small>หมาป่าพิเศษ อยู่ทีมเดียวกับหมาป่า</small></span></label>
<label class="ww-role-option" style="opacity:.8"><input type="checkbox" checked disabled><span><b>🏡 ชาวบ้าน</b><small>เติมจำนวนผู้เล่นที่เหลืออัตโนมัติ</small></span></label></div><div class="ww-muted" id="wwRolePreview">ผู้เล่น ${players.length} คน · หมาป่า ${Math.max(1,Math.floor(players.length/4))} ตัว · บทบาทพิเศษตามที่เลือก · ชาวบ้านจะเติมจำนวนที่เหลือ (ต้องเหลือชาวบ้านอย่างน้อย 1 คน)</div><button class="ww-btn ghost" id="wwSaveRoles" style="margin-top:10px">บันทึกการตั้งค่าบทบาท</button></div>`:''}<div style="border-top:1px solid #3a485a;margin-top:14px;padding-top:14px"><h3>ผู้เล่นในหมู่บ้าน · ${players.length}/16</h3><div class="ww-players">${playerCards}</div></div><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${r.isHost?`<button class="ww-btn" id="wwStart" ${players.length<4?'disabled':''}>🌕 เริ่มเกมและสุ่มบทบาท</button>`:''}</div></div>`;
 if(phase==='night'){
  let action='';
  if(!p?.alive)action='<div class="ww-notice">คุณถูกกำจัดแล้ว สามารถเฝ้าดูเกมต่อได้</div>';
  else if(p.nightSubmitted)action='<div class="ww-notice">ส่งคำสั่งกลางคืนแล้ว 🌙 รอผู้เล่นที่มีบทบาทอื่นดำเนินการ</div>';
  else if(['wolf','alpha'].includes(p.role))action=`<div class="ww-muted">เลือกเหยื่อหนึ่งคน หมาป่าทุกตัวต้องเลือก ระบบจะใช้เสียงข้างมาก</div><div class="ww-action-grid">${alive.filter(x=>!x.isWolfMate).map(x=>`<button class="ww-action" data-ww-night="kill" data-target="${esc(x.userId)}"><b>🐺 ${esc(x.name)}</b><small>เลือกเป็นเหยื่อคืนนี้</small></button>`).join('')}</div>`;
  else if(['seer','detective'].includes(p.role))action=`<div class="ww-muted">เลือกผู้เล่นหนึ่งคนเพื่อตรวจสอบผลจะเห็นเฉพาะคุณ</div><div class="ww-action-grid">${alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-night="inspect" data-target="${esc(x.userId)}"><b>🔮 ${esc(x.name)}</b><small>ตรวจสอบฝ่าย</small></button>`).join('')}</div>`;
  else if(p.role==='bodyguard'||p.role==='guardian')action=`<div class="ww-muted">เลือกผู้เล่นหนึ่งคนเพื่อปกป้องคืนนี้</div><div class="ww-action-grid">${alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-night="protect" data-target="${esc(x.userId)}"><b>${p.role==='bodyguard'?'🛡️':'✨'} ${esc(x.name)}</b><small>ปกป้องผู้เล่นคนนี้</small></button>`).join('')}</div>`;
  else if(p.role==='priest')action=`<div class="ww-muted">นักบวชปกป้องผู้เล่นจากหมาป่าได้ 1 ครั้งตลอดเกม</div><div class="ww-action-grid">${p.priestSaveUsed?'<div class="ww-notice">ใช้พรปกป้องไปแล้ว</div>':alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-night="priest_save" data-target="${esc(x.userId)}"><b>✝️ ${esc(x.name)}</b><small>ปกป้องจากหมาป่า</small></button>`).join('')}<button class="ww-action" data-ww-night="skip"><b>🌙 ข้ามคืนนี้</b></button></div>`;
  else if(p.role==='medium')action=`<div class="ww-muted">คนทรงตรวจสอบบทบาทจริงของผู้เล่นที่ตายแล้วได้ 1 ครั้ง</div>${p.mediumResult?`<div class="ww-notice">ผลตรวจ: <b>${esc(p.mediumResult.role)}</b></div>`:p.mediumUsed?'<div class="ww-notice">ใช้ความสามารถไปแล้ว</div>':`<div class="ww-action-grid">${players.filter(x=>!x.alive).map(x=>`<button class="ww-action" data-ww-night="medium_inspect" data-target="${esc(x.userId)}"><b>🔮 ${esc(x.name)}</b><small>ตรวจสอบบทบาท</small></button>`).join('')||'<div class="ww-notice">ยังไม่มีผู้เล่นที่เสียชีวิต</div>'}<button class="ww-action" data-ww-night="skip"><b>🌙 ข้ามคืนนี้</b></button></div>`}`;
  else if(p.role==='assassin')action=`<div class="ww-muted">นักฆ่ากำจัดผู้เล่นหนึ่งคนได้ 1 ครั้ง หากเป้าหมายถูกกำจัด คุณชนะทันที</div><div class="ww-action-grid">${p.assassinUsed?'<div class="ww-notice">ใช้ความสามารถไปแล้ว</div>':alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-night="assassin_kill" data-target="${esc(x.userId)}"><b>🗡️ ${esc(x.name)}</b><small>ลอบสังหาร</small></button>`).join('')}<button class="ww-action" data-ww-night="skip"><b>🌙 ข้ามคืนนี้</b></button></div>`;
  else if(p.role==='witch')action=`<div class="ww-muted">เลือกใช้ยาอย่างใดอย่างหนึ่ง หรือข้ามคืนนี้ · ยาแต่ละชนิดใช้ได้ครั้งเดียว</div><div class="ww-action-grid">${p.witchSaveUsed?'':`<button class="ww-action" data-ww-night="save" data-target="${esc(r.witchAttackTarget||'')}"><b>💚 ใช้ยาช่วยชีวิต</b><small>${r.witchAttackTarget?'ช่วยเหยื่อที่หมาป่าเลือก':'รอหมาป่าเลือกเหยื่อก่อน'}</small></button>`}${p.witchPoisonUsed?'':alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-night="poison" data-target="${esc(x.userId)}"><b>☠️ วางยาพิษ · ${esc(x.name)}</b><small>กำจัดผู้เล่นคนนี้</small></button>`).join('')}<button class="ww-action" data-ww-night="skip"><b>🌙 ไม่ใช้ยา</b><small>ผ่านคืนนี้</small></button></div>`;
  else action='<div class="ww-notice">ชาวบ้านไม่มีคำสั่งในเวลากลางคืน รอให้รุ่งเช้า</div>';
  stage=`<div class="ww-panel"><div class="ww-phase"><span style="font-size:30px">🌙</span><div><strong>กลางคืน · ทุกคนหลับตา</strong><div class="ww-muted">บทบาทพิเศษกำลังทำภารกิจอย่างลับ ๆ</div></div></div><div style="margin-top:14px"><h3>คำสั่งของคุณ</h3>${action}</div><div class="ww-muted" style="margin-top:12px">ผู้เล่นที่ส่งคำสั่ง: ${players.filter(x=>x.alive&&x.nightSubmitted).length}/${players.filter(x=>x.alive&&['wolf','alpha','seer','detective','witch','bodyguard','guardian','priest','medium','assassin'].includes(x.role)).length} บทบาท</div></div>`;
 }
 if(phase==='day')stage=`<div class="ww-panel"><div class="ww-phase"><span style="font-size:30px">🌅</span><div><strong>รุ่งเช้า · วันที่ ${r.dayNumber}</strong><div class="ww-muted">ทุกคนตื่นขึ้นมาและอภิปรายว่าใครน่าสงสัย</div></div></div>${r.lastNight?.killed?.length?`<div class="ww-notice" style="margin-top:12px">เมื่อคืนมีผู้เสียชีวิต: <b>${r.lastNight.killed.map(esc).join(', ')}</b>${r.lastNight.saved?' · มีคนได้รับการช่วยชีวิต':''}</div>`:`<div class="ww-notice" style="margin-top:12px">เมื่อคืนไม่มีผู้เสียชีวิต</div>`}${r.lastVote?`<div class="ww-notice" style="margin-top:8px">${r.lastVote.name?`ผลโหวต: <b>${esc(r.lastVote.name)}</b> ถูกกำจัด · บทบาท ${esc(r.lastVote.role)}`:'ผลโหวตเสมอหรือไม่มีคะแนน · ไม่มีผู้ถูกกำจัด'}</div>`:''}${r.isHost?'<button class="ww-btn" id="wwOpenVote" style="margin-top:14px">🗳️ เปิดช่วงลงคะแนน</button>':'<div class="ww-muted" style="margin-top:14px">รอเจ้าของห้องเปิดช่วงลงคะแนน</div>'}</div>`;
 if(phase==='vote')stage=`<div class="ww-panel"><div class="ww-phase"><span style="font-size:30px">⚖️</span><div><strong>ลงคะแนนประหาร · วันที่ ${r.dayNumber}</strong><div class="ww-muted">เลือกผู้เล่นที่คิดว่าเป็นหมาป่า โหวตได้หนึ่งครั้ง</div></div></div>${!p?.alive?'<div class="ww-notice" style="margin-top:12px">คุณถูกกำจัดแล้ว ไม่สามารถลงคะแนนได้</div>':p?.voted?'<div class="ww-notice" style="margin-top:12px">คุณลงคะแนนแล้ว รอผู้เล่นคนอื่น…</div>':`<div class="ww-action-grid">${alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-vote="${esc(x.userId)}"><b>⚖️ ${esc(x.name)}</b><small>โหวตประหาร</small></button>`).join('')}<button class="ww-action" data-ww-vote="skip"><b>ข้ามการโหวต</b><small>งดออกเสียง</small></button></div>`}<div class="ww-muted" style="margin-top:12px">ลงคะแนนแล้ว ${r.voteCount}/${r.aliveCount} คน</div></div>`;
 if(phase==='hunter_shot')stage=`<div class="ww-panel"><div class="ww-phase"><span style="font-size:30px">🏹</span><div><strong>นายพรานลั่นไกครั้งสุดท้าย</strong><div class="ww-muted">${esc(r.pendingHunterName||'นายพราน')} เลือกผู้เล่นหนึ่งคนเพื่อยิงก่อนออกจากเกม</div></div></div>${String(r.meId)===String(r.pendingHunterId||'')?`<div class="ww-action-grid">${alive.filter(x=>String(x.userId)!==String(r.meId)).map(x=>`<button class="ww-action" data-ww-hunter="${esc(x.userId)}"><b>🏹 ${esc(x.name)}</b><small>ยิงผู้เล่นคนนี้</small></button>`).join('')}</div>`:'<div class="ww-notice">รอนายพรานเลือกเป้าหมาย…</div>'}</div>`;
 if(phase==='finished')stage=`<div class="ww-result"><div style="font-size:46px">${r.winner==='jester'?'🤡':r.winner==='assassin'?'🗡️':r.winner==='village'?'🏆':'🐺'}</div><div class="ww-kicker">THE VILLAGE HAS FALLEN</div><h2>${r.winner==='jester'?'JESTER WINS':r.winner==='assassin'?'ASSASSIN WINS':r.winner==='village'?'VILLAGE WINS':'WEREWOLVES WIN'}</h2><p>${esc(r.resultText||'จบเกม')}</p><div class="ww-players" style="text-align:left;margin:16px 0">${(r.roleReveal||[]).map(x=>`<div class="ww-player"><b>${esc(x.name)}</b><small>${esc(x.role)} · ${x.alive?'รอดชีวิต':'ถูกกำจัด'}</small></div>`).join('')}</div>${r.isHost?'<button class="ww-btn" id="wwRematch">เริ่มเกมใหม่</button>':''}</div>`;
 return `<style>.ww-info-trigger{display:inline-flex;align-items:center;gap:7px;border:1px solid #b99a70;background:linear-gradient(135deg,#38465d,#202b3c);color:#ffe5bd;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer;box-shadow:0 5px 18px #02081255}.ww-info-modal[hidden]{display:none!important}.ww-info-modal{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:16px}.ww-info-backdrop{position:absolute;inset:0;background:#030711d9;backdrop-filter:blur(7px)}.ww-info-dialog{position:relative;width:min(760px,100%);max-height:min(88vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #927653;border-radius:20px;background:linear-gradient(145deg,#202b3c,#101722);box-shadow:0 30px 100px #000b;color:#f4f0e8}.ww-info-top{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 12px;border-bottom:1px solid #465367}.ww-info-top h3{margin:4px 0 0;font-size:21px;color:#ffe2b7}.ww-info-close{width:36px;height:36px;border:1px solid #59677a;border-radius:50%;background:#29364a;color:white;font-size:17px;cursor:pointer}.ww-info-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 18px;border-bottom:1px solid #39485c}.ww-info-tabs button{padding:11px;border:1px solid #526176;border-radius:11px;background:#172335;color:#cbd5e1;font-weight:800;cursor:pointer}.ww-info-tabs button.active{background:linear-gradient(120deg,#98704b,#654b3c);border-color:#d5b17e;color:#fff}.ww-info-content{padding:16px 18px 20px;overflow:auto;overscroll-behavior:contain}.ww-info-pane{display:none}.ww-info-pane.active{display:block}.ww-info-role-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.ww-info-role{padding:13px;border:1px solid #40516a;border-radius:13px;background:linear-gradient(145deg,#182638,#111a27)}.ww-info-role-head{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#ffe0b1}.ww-info-role-head b{font-size:15px}.ww-info-role-head span{white-space:nowrap;padding:4px 8px;border-radius:99px;background:#3a4659;color:#dbe5f1;font-size:11px}.ww-info-role-meta{margin:6px 0 9px;color:#d7b88f;font-size:11px;font-weight:800}.ww-info-role p{margin:6px 0;color:#c7d0dc;font-size:12px;line-height:1.55}.ww-info-role p b{color:#f0d3aa}.ww-info-dialog .ww-secret{margin-top:10px}@media(max-width:620px){.ww-info-modal{padding:8px}.ww-info-dialog{max-height:94vh;border-radius:15px}.ww-info-top{padding:14px}.ww-info-content{padding:12px}.ww-info-role-list{grid-template-columns:1fr}.ww-info-dialog .ww-role-guide-grid{grid-template-columns:1fr}.ww-info-trigger span{display:none}}</style><section class="ww-shell">${header}<div class="ww-body"><div class="ww-room"><div><div class="ww-kicker">${esc(r.title)}</div><div class="ww-muted">รหัส ${esc(r.code)} · ${players.length} ผู้เล่น · เหลือ ${r.aliveCount} คน</div></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="ww-pill">${esc(phases[phase]||phase)}</span><button class="ww-info-trigger" id="wwInfoOpen" type="button" aria-label="ข้อมูลบทบาท">ⓘ <span>ข้อมูลบทบาท</span></button><button class="ww-btn red" id="wwExit">ออกจากเกม</button></div></div>${stage}<div class="ww-panel"><div class="ww-room"><h3>สมาชิกในหมู่บ้าน</h3><span class="ww-muted">${players.length} คน</span></div><div class="ww-players">${playerCards}</div></div></div>${infoModal}</section>`;
}
function wireWerewolf(){
 $('#wwInfoOpen')?.addEventListener('click',()=>{const modal=$('#wwInfoModal');if(modal){modal.hidden=false;document.body.style.overflow='hidden';}});
 const closeInfo=()=>{const modal=$('#wwInfoModal');if(modal)modal.hidden=true;document.body.style.overflow='';};
 document.querySelectorAll('[data-ww-info-close]').forEach(el=>el.addEventListener('click',closeInfo));
 document.querySelectorAll('[data-ww-info-tab]').forEach(btn=>btn.addEventListener('click',()=>{const tab=btn.dataset.wwInfoTab;document.querySelectorAll('[data-ww-info-tab]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('[data-ww-info-panel]').forEach(x=>x.classList.toggle('active',x.dataset.wwInfoPanel===tab));}));
 $('#wwCreate')?.addEventListener('click',async()=>{try{const title=$('#wwTitle')?.value.trim()||'หมู่บ้านรัตติกาล';const out=await api('/api/werewolf/create',{method:'POST',body:JSON.stringify({title})});werewolfForceLobby=false;localStorage.setItem('gcWerewolfRoom',out.roomId);await loadWerewolf(out.roomId);toast('สร้างหมู่บ้านแล้ว แชร์รหัสให้เพื่อนได้เลย')}catch(e){toast(e.message)}});
 $('#wwRefresh')?.addEventListener('click',()=>loadWerewolf('').catch(e=>toast(e.message)));
 $('#wwJoinCodeBtn')?.addEventListener('click',async()=>{const code=$('#wwJoinCode')?.value.trim();if(!/^\d{6}$/.test(code||''))return toast('กรุณากรอกรหัสห้อง 6 หลัก');try{const out=await api('/api/werewolf/join-code',{method:'POST',body:JSON.stringify({code})});werewolfForceLobby=false;localStorage.setItem('gcWerewolfRoom',out.roomId);await loadWerewolf(out.roomId)}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-ww-join]').forEach(b=>b.onclick=async()=>{try{await api(`/api/werewolf/${encodeURIComponent(b.dataset.wwJoin)}/join`,{method:'POST',body:'{}'});werewolfForceLobby=false;localStorage.setItem('gcWerewolfRoom',b.dataset.wwJoin);await loadWerewolf(b.dataset.wwJoin)}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-ww-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันลบห้องนี้และนำผู้เล่นออกทั้งหมด?'))return;try{await api(`/api/werewolf/${encodeURIComponent(b.dataset.wwDelete)}`,{method:'DELETE'});await loadWerewolf('');toast('ลบห้องแล้ว')}catch(e){toast(e.message)}});
 $('#wwCopy')?.addEventListener('click',()=>navigator.clipboard?.writeText(werewolfState?.room?.code||'').then(()=>toast('คัดลอกรหัสแล้ว')).catch(()=>toast('คัดลอกไม่สำเร็จ')));
 const updateRolePreview=()=>{const n=werewolfState?.room?.players?.length||0,w=Math.max(1,Math.floor(n/4)),ids=['Seer','Witch','Bodyguard','Guardian','Hunter','Jester','Detective','Priest','Medium','Infected','King','Assassin','Alpha'],labels=['ผู้หยั่งรู้','แม่มด','บอดี้การ์ด','ผู้พิทักษ์','นายพราน','ตัวตลก','นักสืบ','นักบวช','คนทรง','ผู้ติดเชื้อ','กษัตริย์','นักฆ่า','หมาป่าอัลฟ่า'];const selected=ids.map((id,i)=>$('#wwRole'+id)?.checked?labels[i]:null).filter(Boolean);const villagers=n-w-selected.length;const el=$('#wwRolePreview');if(el)el.textContent=`${n} คน · หมาป่าพื้นฐาน ${w} ตัว · ${selected.length?selected.join(' / '):'ไม่มีบทบาทพิเศษ'} · ชาวบ้าน ${villagers} คน${villagers<1?' · เลือกบทบาทมากเกินไป':''}`;};
 ['wwRoleSeer','wwRoleWitch','wwRoleBodyguard','wwRoleGuardian','wwRoleHunter','wwRoleJester','wwRoleDetective','wwRolePriest','wwRoleMedium','wwRoleInfected','wwRoleKing','wwRoleAssassin','wwRoleAlpha'].forEach(id=>$('#'+id)?.addEventListener('change',updateRolePreview));
 updateRolePreview();
 $('#wwSaveRoles')?.addEventListener('click',async()=>{try{await api(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/configure`,{method:'POST',body:JSON.stringify({seer:!!$('#wwRoleSeer')?.checked,witch:!!$('#wwRoleWitch')?.checked,bodyguard:!!$('#wwRoleBodyguard')?.checked,guardian:!!$('#wwRoleGuardian')?.checked,hunter:!!$('#wwRoleHunter')?.checked,jester:!!$('#wwRoleJester')?.checked,detective:!!$('#wwRoleDetective')?.checked,priest:!!$('#wwRolePriest')?.checked,medium:!!$('#wwRoleMedium')?.checked,infected:!!$('#wwRoleInfected')?.checked,king:!!$('#wwRoleKing')?.checked,assassin:!!$('#wwRoleAssassin')?.checked,alpha:!!$('#wwRoleAlpha')?.checked})});await loadWerewolf(werewolfState.room.id);toast('บันทึกชุดบทบาทแล้ว')}catch(e){toast(e.message)}});
 $('#wwStart')?.addEventListener('click',async()=>{try{
  const roleConfig={seer:!!$('#wwRoleSeer')?.checked,witch:!!$('#wwRoleWitch')?.checked,bodyguard:!!$('#wwRoleBodyguard')?.checked,guardian:!!$('#wwRoleGuardian')?.checked,hunter:!!$('#wwRoleHunter')?.checked,jester:!!$('#wwRoleJester')?.checked,detective:!!$('#wwRoleDetective')?.checked,priest:!!$('#wwRolePriest')?.checked,medium:!!$('#wwRoleMedium')?.checked,infected:!!$('#wwRoleInfected')?.checked,king:!!$('#wwRoleKing')?.checked,assassin:!!$('#wwRoleAssassin')?.checked,alpha:!!$('#wwRoleAlpha')?.checked};
  const n=werewolfState?.room?.players?.length||0,w=Math.max(1,Math.floor(n/4)),special=Object.values(roleConfig).filter(Boolean).length,villagers=n-w-special;
  if(villagers<1)return toast('บทบาทที่เลือกมากเกินไป ต้องเหลือชาวบ้านอย่างน้อย 1 คน');
  if(!confirm(`ยืนยันเริ่มเกมด้วยบทบาทที่เลือกไว้?\nหมาป่า ${w} ตัว\nบทบาทพิเศษ ${special} บท\nชาวบ้าน ${villagers} คน`))return;
  await api(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/start`,{method:'POST',body:JSON.stringify({roleConfig})});
  await loadWerewolf(werewolfState.room.id);
 }catch(e){toast(e.message)}});
 $('#wwExit')?.addEventListener('click',async()=>{try{if(!confirm('ต้องการออกจากเกมนี้ใช่หรือไม่?'))return;const roomId=werewolfState?.room?.id;werewolfForceLobby=true;localStorage.removeItem('gcWerewolfRoom');if(roomId)await api(`/api/werewolf/${encodeURIComponent(roomId)}/leave`,{method:'POST',body:'{}'});await loadWerewolf('',true);render();toast('ออกจากห้องแล้ว')}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-ww-night]').forEach(b=>b.onclick=async()=>{
  if(werewolfActionBusy||b.disabled)return;
  const type=b.dataset.wwNight,targetId=b.dataset.target||'',role=werewolfState?.room?.me?.role,roomId=werewolfState?.room?.id;
  if(!roomId)return;
  if(type==='save'&&!targetId)return toast('รอให้หมาป่าเลือกเหยื่อก่อน');
  if(!confirm('ยืนยันคำสั่งกลางคืนนี้?'))return;
  werewolfActionBusy=true;
  let actionAccepted=false;
  document.querySelectorAll('[data-ww-night]').forEach(x=>{x.disabled=true;x.setAttribute('aria-busy','true');});
  try{
   const response=await api(`/api/werewolf/${encodeURIComponent(roomId)}/night-action`,{method:'POST',body:JSON.stringify({type,targetId})});
   actionAccepted=true;
   const sound=['wolf','alpha'].includes(role)?'wolfAttack':['seer','detective'].includes(role)?'seer':role==='witch'?(type==='save'?'potion':type==='poison'?'poison':'witch'):['bodyguard','guardian'].includes(role)?'protect':'tap';
   GCSound.play(sound);
   if(werewolfState?.room?.me){werewolfState.room.me.nightSubmitted=true;}
   if(role==='seer'&&type==='inspect'&&response.seerResult&&werewolfState?.room?.me){
    werewolfState.room.me.seerResult={isWolf:!!response.seerResult.isWolf,checkedAt:new Date().toISOString()};
   }
   if(role==='detective'&&type==='inspect'&&response.detectiveResult&&werewolfState?.room?.me){
    werewolfState.room.me.detectiveResult={isWolf:!!response.detectiveResult.isWolf,checkedAt:new Date().toISOString()};
   }
   // Refresh authoritative room state, but retain the immediate result if a poll races the response.
   try{await loadWerewolf(roomId);}catch(refreshError){/* keep the accepted action/result visible */}
   if(werewolfState?.room?.me)werewolfState.room.me.nightSubmitted=true;
   if(role==='seer'&&type==='inspect'&&response.seerResult&&werewolfState?.room?.me&&!werewolfState.room.me.seerResult){
    werewolfState.room.me.seerResult={isWolf:!!response.seerResult.isWolf,checkedAt:new Date().toISOString()};
   }
   if(role==='detective'&&type==='inspect'&&response.detectiveResult&&werewolfState?.room?.me&&!werewolfState.room.me.detectiveResult){
    werewolfState.room.me.detectiveResult={isWolf:!!response.detectiveResult.isWolf,checkedAt:new Date().toISOString()};
   }
   render();
   if(role==='seer'&&type==='inspect'&&response.seerResult)toast(`ผลตรวจ: ${response.seerResult.isWolf?'คนไม่ดี':'คนดี'}`);
   if(role==='detective'&&type==='inspect'&&response.detectiveResult)toast(`ผลตรวจ: ${response.detectiveResult.isAlpha?'เป็นหมาป่าอัลฟ่า':response.detectiveResult.isWolf?'เป็นฝ่ายหมาป่า':'ไม่ใช่ฝ่ายหมาป่า'}`);
  }catch(e){
   toast(e.message||'ส่งคำสั่งไม่สำเร็จ กรุณาลองอีกครั้ง');
   try{await loadWerewolf(roomId);}catch(_){ }
  }finally{
   werewolfActionBusy=false;
   document.querySelectorAll('[data-ww-night]').forEach(x=>{x.removeAttribute('aria-busy');if(!actionAccepted)x.disabled=false;});
  }
 });

 document.querySelectorAll('[data-ww-hunter]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันยิงผู้เล่นคนนี้?'))return;try{await api(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/hunter-shot`,{method:'POST',body:JSON.stringify({targetId:b.dataset.wwHunter})});GCSound.play('hunter');await loadWerewolf(werewolfState.room.id)}catch(e){toast(e.message)}});
 $('#wwOpenVote')?.addEventListener('click',async()=>{try{await werewolfPost(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/open-vote`)}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-ww-vote]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันคะแนนโหวตนี้? เปลี่ยนคะแนนไม่ได้'))return;try{await werewolfPost(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/vote`,{targetId:b.dataset.wwVote})}catch(e){toast(e.message)}});
 $('#wwRematch')?.addEventListener('click',async()=>{try{await werewolfPost(`/api/werewolf/${encodeURIComponent(werewolfState.room.id)}/rematch`)}catch(e){toast(e.message)}});
}


function showBingoWinnerPopup(winners){if(!winners?.length)return;let el=document.getElementById('bingoWinnerOverlay');if(el)el.remove();el=document.createElement('div');el.id='bingoWinnerOverlay';el.className='bingo-winner-overlay';el.innerHTML=`<div class="bingo-winner-modal"><div style="font-size:48px">🏆</div><div class="bingo-eyebrow">LOS SANTOS BINGO CLUB</div><h2>BINGO!</h2><p>ขอแสดงความยินดีกับผู้ชนะ${winners.length>1?'ทุกคน':''}</p>${winners.map(w=>`<div class="bingo-winner-name">${esc(w.name)}<small style="display:block;font-size:12px">${esc(w.line||'BINGO')}</small></div>`).join('')}<button class="bingo-action" id="bingoWinnerClose" style="margin-top:14px">ปิด</button></div>`;document.body.appendChild(el);el.querySelector('#bingoWinnerClose').onclick=async()=>{el.remove();if(bingoState?.room?.id){try{await loadBingo();}catch(e){}}};}

function updateBingoCountdown(){
 const r=bingoState?.room;if(!r||r.status!=='playing')return;
 const left=Math.max(0,Math.ceil(((r.nextDrawAt||Date.now()+7000)-(Date.now()+bingoServerOffset))/1000));
 const label=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
 const value=document.getElementById('bingoCountdown'),ring=document.getElementById('bingoCountdownRing');
 if(value)value.textContent=label;
 if(ring)ring.style.setProperty('--progress',`${((7-left)/7*360)}deg`);
}
async function loadBingo(roomId){
 const showLobby=forceLobby||werewolfForceLobby;
 const q=roomId?`?roomId=${encodeURIComponent(roomId)}`:(showLobby?'?lobby=1':'');
 const before=bingoState?JSON.stringify(bingoState):'';
 const oldRoom=bingoState?.room||null;
 const previous=bingoState?.room?.winners|| (bingoState?.room?.winner?[bingoState.room.winner]:[]);
 const next=await api('/api/bingo'+q);if(Number.isFinite(next.serverNow))bingoServerOffset=next.serverNow-Date.now();if(Number.isFinite(next.room?.serverNow))bingoServerOffset=next.room.serverNow-Date.now();bingoState=next;
 if(next.room?.status==='playing'&&oldRoom?.status!=='playing')GCSound.play('start');
 if((next.room?.drawn?.length||0)>(oldRoom?.drawn?.length||0))GCSound.play('draw');
 const current=bingoState?.room?.winners|| (bingoState?.room?.winner?[bingoState.room.winner]:[]);
 const sig=current.map(w=>String(w.userId)).sort().join('|');
 const prevSig=previous.map(w=>String(w.userId)).sort().join('|');
 if(sig&&sig!==prevSig&&bingoState?.room?.status==='finished'){GCSound.play('finish');showBingoWinnerPopup(current);}
 bingoHasLoadedOnce=true;
 if(next.room?.status==='finished'&&!next.room?.canStillWin&&!current.some(w=>String(w.userId)===String(state?.user?.id))){bingoState={...next,room:null};}
 if(page==='bingo'&&before!==JSON.stringify(next))render();
}
async function bingoAction(url,body={}){await api(url,{method:'POST',body:JSON.stringify(body)});await loadBingo(bingoState?.room?.id)}

function wire(){
 if(page==='bingo'){
  $('#bingoCreate')?.addEventListener('click',async()=>{const title=prompt('ตั้งชื่อห้อง BINGO','GANG BINGO ROOM');if(!title?.trim())return;try{const out=await api('/api/bingo/create',{method:'POST',body:JSON.stringify({title:title.trim()})});await loadBingo(out.roomId);toast('สร้างห้องแล้ว คุณเป็นเจ้าของห้อง')}catch(e){toast(e.message)}});
  $('#bingoRefresh')?.addEventListener('click',async()=>{try{await loadBingo();toast('อัปเดตรายการห้องแล้ว')}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-room-delete]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.roomDelete;if(!confirm('ยืนยันลบห้อง BINGO นี้ใช่หรือไม่? ผู้เล่นทุกคนจะถูกนำออกจากห้อง'))return;try{await api(`/api/bingo/${encodeURIComponent(id)}`,{method:'DELETE'});await loadBingo();toast('ลบห้องเรียบร้อยแล้ว')}catch(e){toast(e.message)}}));
  document.querySelectorAll('[data-room-join]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/bingo/${encodeURIComponent(b.dataset.roomJoin)}/join`,{method:'POST',body:'{}'});await loadBingo(b.dataset.roomJoin);toast('เข้าร่วมห้องแล้ว')}catch(e){toast(e.message)}}));
  $('#bingoBack')?.addEventListener('click',async()=>{await loadBingo()});
  $('#bingoLeave')?.addEventListener('click',async()=>{if(!confirm('ต้องการออกจากห้องนี้ใช่หรือไม่?'))return;try{await api(`/api/bingo/${encodeURIComponent(bingoState.room.id)}/leave`,{method:'POST',body:'{}'});await loadBingo();toast('ออกจากห้องแล้ว')}catch(e){toast(e.message)}});
  $('#bingoStart')?.addEventListener('click',async()=>{if(!confirm('เริ่มเกมนี้เลยหรือไม่? ระบบจะสุ่มเลขทุก 7 วินาที'))return;try{await api(`/api/bingo/${encodeURIComponent(bingoState.room.id)}/start`,{method:'POST',body:'{}'});await loadBingo(bingoState.room.id);toast('เริ่มเกมแล้ว')}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-bingo-cell]').forEach(b=>b.addEventListener('click',async()=>{
   const index=Number(b.dataset.bingoCell),roomId=bingoState?.room?.id,player=bingoState?.room?.player;
   if(!roomId||b.disabled||!player||player.marked?.[index])return;
   // Paint the red ring synchronously before making the network request.
   b.classList.add('marked');b.disabled=true;
   if(player.marked)player.marked[index]=true;
   const count=b.closest('.bingo-card-panel')?.querySelector('.bingo-panel-head b');
   if(count){const n=Number((count.textContent||'0/25').split('/')[0])+1;count.textContent=`${n}/25`;}
   try{
    const out=await api(`/api/bingo/${encodeURIComponent(roomId)}/mark`,{method:'POST',body:JSON.stringify({index})});
    if(out.winners?.length){await loadBingo(roomId);}
   }catch(e){
    b.classList.remove('marked');b.disabled=false;if(player.marked)player.marked[index]=false;
    if(count){const n=Math.max(1,Number((count.textContent||'1/25').split('/')[0])-1);count.textContent=`${n}/25`;}
    toast(e.message);
   }
  }));
 }
 if(page==='wheel')bindWheel();
 if(page==='impostor')wireImpostor();
 if(page==='werewolf')wireWerewolf();
 $('#applyAuditFilter')?.addEventListener('click',()=>{const from=$('#auditFrom').value,to=$('#auditTo').value,q=$('#auditQuery').value.trim();if(from&&to&&from>to){toast('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');return}loadAudit(from,to,q).catch(e=>toast(e.message))});
 $('#resetAuditFilter')?.addEventListener('click',()=>loadAudit('','','').catch(e=>toast(e.message)));
 $('#exportAuditCsv')?.addEventListener('click',exportAuditCsv);
 // ค้นหาชื่อสมาชิก และกรองเฉพาะสมาชิกที่เคยขาด
 const historySearch = $('#historyMemberSearch');
 const absentFilterButton = $('#historyAbsentFilter');
 const applyHistoryFilters = () => {
   const keyword = (historySearch?.value || '').trim().toLocaleLowerCase('th');
   const cards = [...document.querySelectorAll('#historyMemberList .history-member-card')];
   let visibleCount = 0;
   cards.forEach(card => {
     const memberName = (card.dataset.memberName || '').toLocaleLowerCase('th');
     const hasAbsent = Number(card.dataset.absentCount || 0) > 0;
     const matched = (!keyword || memberName.includes(keyword)) && (!historyAbsentOnly || hasAbsent);
     card.hidden = !matched;
     if (matched) visibleCount++;
   });
   const noResults = $('#historyNoResults');
   if (noResults) {
     noResults.hidden = visibleCount !== 0;
     noResults.textContent = historyAbsentOnly ? 'ไม่พบสมาชิกที่เคยมีประวัติขาด' : 'ไม่พบชื่อสมาชิกที่ตรงกับคำค้นหา';
   }
 };
 historySearch?.addEventListener('input', applyHistoryFilters);
 absentFilterButton?.addEventListener('click', () => {
   historyAbsentOnly = !historyAbsentOnly;
   absentFilterButton.classList.toggle('active', historyAbsentOnly);
   absentFilterButton.setAttribute('aria-pressed', String(historyAbsentOnly));
   applyHistoryFilters();
 });
 if (absentFilterButton) absentFilterButton.classList.toggle('active', historyAbsentOnly);
 applyHistoryFilters();

 $('#attendanceDate')?.addEventListener('change',async e=>{selectedDate=e.target.value;await refresh()});

 $('#attendanceSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('th');document.querySelectorAll('.attendance-row').forEach(row=>{const name=row.querySelector('.member-name')?.textContent.toLocaleLowerCase('th')||'';row.style.display=name.includes(q)?'':'none'})});

 $('#deliveryMemberSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('th');document.querySelectorAll('.delivery-member-row').forEach(row=>{const name=row.dataset.memberName||'';row.style.display=name.includes(q)?'':'none'})});

 $('#saveAllAttendance')?.addEventListener('click',async()=>{const rows=[...document.querySelectorAll('.attendance-row')].map(el=>({memberId:Number(el.dataset.memberRow),status:el.querySelector('[data-status]').value==='unmarked'?'present':el.querySelector('[data-status]').value,note:el.querySelector('[data-note]').value}));if(!rows.length){toast('ไม่มีรายชื่อสมาชิกให้บันทึก');return}try{await api('/api/attendance/bulk',{method:'POST',body:JSON.stringify({date:selectedDate,sessionId:selectedSession,rows})});await refresh();toast('บันทึกเช็กชื่อทั้งหมดแล้ว · คนที่ไม่เลือกสถานะถือว่ามา')}catch(e){toast(e.message)}});

 $('#addDailyTask')?.addEventListener('click',()=>openModal('เพิ่มรายการส่งของประจำวัน',`<div class="form-grid"><div class="field"><label>วันที่</label><input type="date" name="date" value="${selectedDate}" required></div><div class="field wide"><label>เลือกไอเทมจากคลัง</label><select name="itemId" required>${state.items.map(i=>`<option value="${i.id}">${esc(i.name)} · คงเหลือ ${i.qty} ${esc(i.unit)}</option>`).join('')}</select></div><div class="field"><label>จำนวนที่สมาชิกแต่ละคนต้องส่ง</label><input type="number" name="qty" min="1" step="1" required></div></div>`,async d=>{await api('/api/daily-tasks',{method:'POST',body:JSON.stringify(d)});toast('เพิ่มรายการส่งของแล้ว')}));

 document.querySelectorAll('[data-close-task]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันปิดวัน? ระบบจะสรุปคนที่ยังส่งไม่ครบ'))return;try{const r=await api(`/api/daily-tasks/${b.dataset.closeTask}/close`,{method:'POST',body:'{}'});await refresh();alert(r.outstanding.length?'สมาชิกที่ยังส่งไม่ครบ:\n'+r.outstanding.map(x=>`${x.member}: ค้าง ${x.qty}`).join('\n'):'สมาชิกส่งครบทุกคนแล้ว')}catch(e){toast(e.message)}});

 document.querySelectorAll('[data-delete-task]').forEach(b=>b.onclick=async()=>{
   const task=state.dailyTasks.find(t=>t.id===Number(b.dataset.deleteTask));
   if(!task)return;
   if(!confirm(`ยืนยันลบรายการส่งของ "${task.name}" วันที่ ${task.date}?\n\nลบได้เฉพาะรายการที่ยังไม่มีสมาชิกบันทึกยอดส่ง`))return;
   try{
     await api(`/api/daily-tasks/${task.id}`,{method:'DELETE'});
     await refresh();
     toast('ลบรายการส่งของแล้ว');
   }catch(e){toast(e.message)}
 });

 document.querySelectorAll('[data-save-contribution],[data-complete-contribution]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.saveContribution||b.dataset.completeContribution),input=$(`#qty-${id}`);const complete=b.hasAttribute('data-complete-contribution');const qty=complete?Number((state.dailyTasks.find(t=>t.id===id)||{}).qty):Number(input.value);try{await api('/api/contributions',{method:'POST',body:JSON.stringify({taskId:id,qty,complete})});await refresh();toast(complete?'บันทึกว่าส่งครบแล้ว':'บันทึกยอดส่งของแล้ว')}catch(e){toast(e.message)}});

 document.querySelectorAll('[data-admin-save-contribution],[data-admin-complete-contribution]').forEach(b=>b.onclick=async()=>{const taskId=Number(b.dataset.adminSaveContribution||b.dataset.adminCompleteContribution),memberId=Number(b.dataset.member),task=state.dailyTasks.find(t=>t.id===taskId),complete=b.hasAttribute('data-admin-complete-contribution'),input=$(`#admin-qty-${taskId}-${memberId}`),qty=complete?Number(task.qty):Number(input?.value);if(!Number.isInteger(qty)||qty<0){toast('กรุณากรอกจำนวนให้ถูกต้อง');return}try{await api('/api/contributions/admin',{method:'POST',body:JSON.stringify({taskId,memberId,qty,complete})});await refresh();toast(complete?'บันทึกว่าสมาชิกส่งครบแล้ว':'บันทึกยอดส่งของสมาชิกแล้ว')}catch(e){toast(e.message)}});



 document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));render();if(page==='audit')loadAudit().catch(e=>toast(e.message))});

 document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{selectedSession=b.dataset.session;render()});

 document.querySelectorAll('[data-save-attendance]').forEach(b=>b.onclick=async()=>{const row=b.closest('.attendance-row');const status=row.querySelector('[data-status]').value;const note=row.querySelector('[data-note]').value;if(status==='unmarked'){toast('กรุณาเลือกสถานะก่อนบันทึก');return}try{await api('/api/attendance',{method:'POST',body:JSON.stringify({memberId:Number(b.dataset.saveAttendance),sessionId:selectedSession,status,note})});await refresh();toast('บันทึกเช็กชื่อแล้ว')}catch(e){toast(e.message)}});

 $('#addMember')?.addEventListener('click',()=>openModal('เพิ่มสมาชิกใหม่',`<div class="form-grid"><div class="field"><label>ชื่อในเกม</label><input name="name" required></div><div class="field"><label>ยศ</label><input name="rank" value="สมาชิก"></div><div class="field wide"><label>Game Identifier (ไม่บังคับ)</label><input name="gameId"></div><div class="field"><label>Username</label><input name="username" required></div><div class="field"><label>Password (อย่างน้อย 6 ตัว)</label><input name="password" type="password" minlength="6" required></div></div>`,async d=>{await api('/api/members',{method:'POST',body:JSON.stringify(d)});toast('เพิ่มสมาชิกเรียบร้อย')}));

 document.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันนำสมาชิกคนนี้ออก? ประวัติเดิมจะยังเก็บไว้'))return;try{await api('/api/members/'+b.dataset.removeMember,{method:'DELETE'});await refresh();toast('นำสมาชิกออกแล้ว')}catch(e){toast(e.message)}});

 $('#addItem')?.addEventListener('click',()=>openModal('เพิ่มไอเทมเข้าคลัง',`<div class="form-grid"><div class="field"><label>ชื่อไอเทม</label><input name="name" required></div><div class="field"><label>หมวดหมู่</label><input name="category" value="ทั่วไป"></div><div class="field"><label>จำนวนที่มีอยู่</label><input name="qty" type="number" min="0" value="0"></div><div class="field"><label>หน่วย</label><input name="unit" value="ชิ้น"></div><div class="field"><label>จำนวนของขั้นตํ่าเพื่อแจ้งของไกล้หมด</label><input name="min" type="number" min="0" value="0"></div></div>`,async d=>{await api('/api/items',{method:'POST',body:JSON.stringify(d)});toast('เพิ่มไอเทมแล้ว')}));

 document.querySelectorAll('[data-edit-item-qty]').forEach(b=>b.onclick=()=>{
    const item=state.items.find(i=>i.id===Number(b.dataset.editItemQty));
    if(!item)return;
    openModal('แก้ไขจำนวนไอเทมในคลัง',`<div class="form-grid"><div class="field wide"><label>ไอเทม</label><input value="${esc(item.name)}" disabled></div><div class="field wide"><label>จำนวนคงเหลือใหม่ (${esc(item.unit)})</label><input name="qty" type="number" min="0" step="1" value="${item.qty}" required></div></div>`,async d=>{
      const qty=Number(d.qty);
      if(!Number.isSafeInteger(qty)||qty<0)throw new Error('กรุณากรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      await api(`/api/items/${item.id}/quantity`,{method:'PATCH',body:JSON.stringify({qty})});
      toast('แก้ไขจำนวนไอเทมแล้ว');
    });
  });

  document.querySelectorAll('[data-delete-item]').forEach(b=>b.onclick=async()=>{const item=state.items.find(i=>i.id===Number(b.dataset.deleteItem));if(!item||!confirm(`ยืนยันลบไอเทม "${item.name}" ออกจากคลัง? จำนวนคงเหลือ ${item.qty} ${item.unit} จะถูกนำออกด้วย`))return;try{await api('/api/items/'+b.dataset.deleteItem,{method:'DELETE'});await refresh();toast('ลบไอเทมออกจากคลังแล้ว')}catch(e){toast(e.message)}});

 $('#newRequest')?.addEventListener('click',()=>openModal('ส่งคำขอเบิกไอเทม',`<div class="form-grid"><div class="field wide"><label>เลือกไอเทม</label><select name="itemId" required>${state.items.map(i=>`<option value="${i.id}">${esc(i.name)} (คงเหลือ ${i.qty} ${esc(i.unit)})</option>`).join('')}</select></div><div class="field"><label>จำนวน</label><input name="qty" type="number" min="1" step="1" required></div><div class="field"><label>เหตุผล</label><input name="reason" placeholder="ระบุเหตุผล"></div></div>`,async d=>{await api('/api/requests',{method:'POST',body:JSON.stringify(d)});toast('ส่งคำขอเบิกแล้ว')}));

 document.querySelectorAll('[data-request-decision]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.requestDecision==='approved'?'ยืนยันอนุมัติและหักของออกจากคลัง?':'ยืนยันปฏิเสธคำขอ?'))return;try{await api(`/api/requests/${b.dataset.id}/decision`,{method:'POST',body:JSON.stringify({decision:b.dataset.requestDecision})});await refresh();toast('อัปเดตคำขอแล้ว')}catch(e){toast(e.message)}});

 $('#newDelivery')?.addEventListener('click',()=>{
  const line=()=>`<div class="item-line"><select class="delivery-select"><option value="">เลือกไอเทมในคลัง</option>${state.items.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('')}<option value="custom">เพิ่มชื่อเอง</option></select><input class="delivery-qty" type="number" min="1" step="1" placeholder="จำนวน" required><button type="button" class="btn small remove-line">ลบ</button><input class="delivery-custom hidden" placeholder="ชื่อไอเทมใหม่" style="grid-column:1/-1"></div>`;

  openModal('ส่งของเข้าคลังประจำวัน',`<div id="deliveryLines">${line()}</div><button type="button" class="btn small" id="addDeliveryLine">＋ เพิ่มรายการ</button><div class="field" style="margin-top:13px"><label>หมายเหตุ</label><textarea name="note" placeholder="รายละเอียดเพิ่มเติม"></textarea></div>`,async d=>{
   const items=[...document.querySelectorAll('.item-line')].map(el=>{const sel=el.querySelector('.delivery-select');const custom=sel.value==='custom';const id=sel.value&&!custom?Number(sel.value):null;const name=custom?el.querySelector('.delivery-custom').value.trim():state.items.find(i=>i.id===id)?.name;return {itemId:id,name,qty:Number(el.querySelector('.delivery-qty').value)}}).filter(x=>x.name&&x.qty>0);

   if(!items.length)throw new Error('เพิ่มไอเทมอย่างน้อย 1 รายการ');

   await api('/api/deliveries',{method:'POST',body:JSON.stringify({items,note:d.note})});toast('ส่งรายการให้แอดมินตรวจรับแล้ว');
  });

  const root=$('#modalRoot');
  const bindLine=el=>{el.querySelector('.delivery-select').onchange=()=>el.querySelector('.delivery-custom').classList.toggle('hidden',el.querySelector('.delivery-select').value!=='custom');el.querySelector('.remove-line').onclick=()=>{if(root.querySelectorAll('.item-line').length>1)el.remove()}};

  root.querySelectorAll('.item-line').forEach(bindLine);
  root.querySelector('#addDeliveryLine')?.addEventListener('click',()=>{root.querySelector('#deliveryLines').insertAdjacentHTML('beforeend',line());bindLine(root.querySelector('#deliveryLines').lastElementChild)});
 });

 document.querySelectorAll('[data-delivery-decision]').forEach(b=>b.onclick=async()=>{let reason='';if(b.dataset.deliveryDecision==='rejected'){reason=prompt('ระบุเหตุผลที่ตีกลับรายการส่งของ')||'';if(!reason)return}if(!confirm(b.dataset.deliveryDecision==='verified'?'ยืนยันรับของและเพิ่มเข้าคลัง?':'ยืนยันตีกลับรายการ?'))return;try{await api(`/api/deliveries/${b.dataset.id}/decision`,{method:'POST',body:JSON.stringify({decision:b.dataset.deliveryDecision,reason})});await refresh();toast('อัปเดตรายการส่งของแล้ว')}catch(e){toast(e.message)}});
}

setInterval(()=>{if(state)refresh().catch(()=>{})},45000);
setInterval(()=>{if(state&&page==='impostor'&&!impostorPollBusy){impostorPollBusy=true;loadImpostor(impostorState?.room?.id).catch(()=>{}).finally(()=>impostorPollBusy=false)}},1800);
setInterval(()=>{if(state&&page==='werewolf'&&!werewolfPollBusy){werewolfPollBusy=true;loadWerewolf(werewolfForceLobby?'':werewolfState?.room?.id,werewolfForceLobby).catch(()=>{}).finally(()=>werewolfPollBusy=false)}},1800);
let bingoTickInFlight=false,bingoLastSync=0;
setInterval(async()=>{
 if(!state||page!=='bingo')return;
 const roomId=bingoState?.room?.id,room=bingoState?.room;
 updateBingoCountdown();
 const now=Date.now()+bingoServerOffset;
 if(roomId&&room?.status==='playing'&&now>=(room.nextDrawAt||0)&&!bingoTickInFlight){
  bingoTickInFlight=true;
  try{const out=await api(`/api/bingo/${encodeURIComponent(roomId)}/tick`,{method:'POST',body:'{}'});if(out.drawn||out.finished)await loadBingo(roomId);}
  catch(e){}finally{bingoTickInFlight=false;}
 }
 // Sync ทุก 1 วินาที; render เฉพาะเมื่อข้อมูลเปลี่ยนจริง
 if(now-bingoLastSync>=1000){bingoLastSync=now;try{await loadBingo(roomId)}catch(e){}}
},200);
boot().catch(()=>{});
