const $ = s => document.querySelector(s);
let historyAbsentOnly = false;
let state = null, page = 'dashboard', selectedSession = 's1630', selectedDate = new Date().toLocaleDateString('en-CA'), auditData = null, auditRange = { from: '', to: '', q: '' }, wheelRotation = 0, wheelBusy = false, savedWheelTeams = null;
const pageNames = { dashboard:'ภาพรวม', wheel:'วงล้อชื่อ', audit:'ประวัติการทำงาน', attendance:'ระบบเช็กชื่อ', members:'สมาชิก', inventory:'คลังไอเทม', requests:'ระบบเบิกของ', deliveries:'ระบบส่งของ', history:'ประวัติ' };
const statusNames = { present:'มา', late:'มาสาย', absent:'ขาด', leave:'ลา', business:'ติดธุระ', unmarked:'ยังไม่เช็ก' };
const statusClass = { present:'green', late:'yellow', absent:'red', leave:'blue', business:'yellow', unmarked:'red' };
const money = n => '฿' + Number(n || 0).toLocaleString('th-TH');
const fmt = s => s ? new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}) : '-';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function installReportsNav(){
 const first=document.querySelector('.nav-item[data-page="dashboard"]');
 if(!first)return;
 const nav=first.parentElement;
 document.querySelector('.nav-item[data-page="reports"]')?.remove();
 let wheelBtn=document.querySelector('.nav-item[data-page="wheel"]');
 if(!wheelBtn){
  wheelBtn=document.createElement('button');wheelBtn.className='nav-item';wheelBtn.dataset.page='wheel';
  wheelBtn.innerHTML='<span>🎡</span><span>วงล้อชื่อ</span>';
  wheelBtn.addEventListener('click',()=>{if(!isAdmin())return;page='wheel';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===wheelBtn));render()});
 }
 const auditBtn=document.querySelector('.nav-item[data-page="audit"]');
 if(auditBtn)nav.append(wheelBtn,auditBtn);else nav.append(wheelBtn);
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
`;document.head.appendChild(st)}

async function api(url, options={}) { const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'ดำเนินการไม่สำเร็จ'); return d; }
let toastTimer=null;
function toast(msg){
 let node=$('#gcToast');
 if(!node){node=document.createElement('div');node.id='gcToast';node.setAttribute('role','status');document.body.appendChild(node)}
 node.textContent=String(msg||'');node.className='gc-toast-visible';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.className='';},2600);
}
function isAdmin(){return !!state?.isAdmin}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await boot()}catch(err){$('#loginError').textContent=err.message}});
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});state=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden')};

async function boot(){const me=await api('/api/me');if(!me.user){$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');return}$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');installReportsNav();installWheelStyles();$('#userName').textContent=me.user.name;$('#userRole').textContent=me.isAdmin?'ผู้ดูแลระบบ':'สมาชิกแก๊ง';$('#userAvatar').textContent=(me.user.name||'G').slice(0,1).toUpperCase();document.querySelectorAll('.nav-item').forEach(b=>{const adminPages=['dashboard','wheel','audit','members','inventory','requests','history'];b.classList.toggle('hidden',!me.isAdmin&&adminPages.includes(b.dataset.page))});if(!me.isAdmin){page='attendance';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page==='attendance'))}await refresh()}

async function refresh(){state=await api('/api/data?date='+encodeURIComponent(selectedDate));$('#todayChip').textContent=state.today;$('#requestBadge').textContent=state.summary.pendingRequests;$('#deliveryBadge').textContent=state.summary.pendingDeliveries;$('#attendanceBadge').textContent='3 รอบ';render()}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{if(b.classList.contains('hidden'))return;page=b.dataset.page;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));render();if(page==='audit')loadAudit().catch(e=>toast(e.message))});

function render(){if(!state)return;$('#crumb').textContent=pageNames[page];$('#pageTitle').textContent=pageNames[page];const c=$('#content');const views={dashboard,wheel,audit,attendance,members,inventory,requests,deliveries,history};c.innerHTML=views[page]();wire();}

function stat(label,value,icon,sub){return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${sub}</small></div>`}

function dashboard(){
 const active=state.members.filter(m=>m.active);
 const todayRows=state.attendance;
 const present=todayRows.filter(a=>a.status==='present'||a.status==='late').length;
 const absent=todayRows.filter(a=>a.status==='absent').length;
 const leave=todayRows.filter(a=>a.status==='leave'||a.status==='business').length;
 return `<div class="hero"><div><div class="eyebrow">DAILY OPERATIONS / COMMAND CENTER</div><h3>ยินดีต้อนรับสู่ GANG CONTROL</h3><p>จัดการสมาชิก การเช็กชื่อ และทรัพย์สินของแก๊งได้จากที่เดียว</p></div><div class="hero-tag">● ระบบออนไลน์ · ${esc(state.today)}</div></div><div class="stats">${stat('สมาชิกที่ใช้งาน',active.length,'♙','รายชื่อในแก๊ง')}${stat('ไอเทมในคลัง',state.items.length,'▤','ประเภทไอเทม')}${stat('คำขอเบิกรอตรวจ',state.summary.pendingRequests,'⇄','รายการ')}${stat('ส่งของรอตรวจ',state.summary.pendingDeliveries,'⇧','รายการ')}</div><div class="quick-grid"><button class="quick" data-go="attendance"><span>◷</span><b>เช็กชื่อประจำวัน</b><small>16:30 · 20:30 · 23:50</small></button><button class="quick" data-go="requests"><span>⇄</span><b>จัดการคำขอเบิก</b><small>ตรวจสอบและอนุมัติไอเทม</small></button><button class="quick" data-go="deliveries"><span>⇧</span><b>ตรวจรับของ</b><small>รับของเข้าคลังจากสมาชิก</small></button></div><div class="grid2"><div class="panel"><div class="panel-head"><div><h3>สรุปเช็กชื่อวันนี้</h3><div class="panel-sub">รวมสถานะจากทั้ง 3 รอบ</div></div><button class="btn small" data-go="attendance">เปิดระบบเช็กชื่อ</button></div><div class="count-cards"><span>มา/มาสาย ${present}</span><span>ขาด ${absent}</span><span>ลา/ติดธุระ ${leave}</span></div><div class="muted-note" style="margin-top:14px">รอบเช็กชื่อ: 16:30 น. · 20:30 น. · 23:50 น.</div></div><div class="panel"><div class="panel-head"><div><h3>ไอเทมใกล้หมด</h3><div class="panel-sub">จำนวนคงเหลือต่ำกว่าค่าขั้นต่ำ</div></div></div>${state.items.filter(i=>i.qty<=i.min).map(i=>`<div class="history-item"><b>${esc(i.name)}</b><span class="pill yellow">เหลือ ${i.qty} ${esc(i.unit)}</span></div>`).join('')||'<div class="empty">ไม่มีไอเทมใกล้หมด</div>'}</div></div>`
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

function inventory(){return `<div class="panel"><div class="panel-head"><div><h3>คลังไอเทม</h3><div class="panel-sub">รายการของกลาง · ไอเทมที่รับจากระบบส่งของจะเพิ่มเข้าคลังอัตโนมัติ</div></div>${isAdmin()?'<div class="toolbar"><button class="btn" id="withdrawItem">เบิกของแอดมิน</button><button class="btn primary" id="addItem">＋ เพิ่มไอเทม</button></div>':''}</div><div class="table-wrap"><table><thead><tr><th>ชื่อไอเทม</th><th>หมวดหมู่</th><th>จำนวนคงเหลือ</th><th>หน่วย</th><th>สถานะ</th>${isAdmin()?'<th>จัดการ</th>':''}</tr></thead><tbody>${state.items.map(i=>`<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.category)}</td><td>${i.qty}</td><td>${esc(i.unit)}</td><td><span class="pill ${i.qty<=i.min?'yellow':'green'}">${i.qty<=i.min?'ใกล้หมด':'ปกติ'}</span></td>${isAdmin()?`<td><button class="btn small" data-edit-item-qty="${i.id}">แก้จำนวน</button> <button class="btn danger small" data-delete-item="${i.id}">ลบไอเทม</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${isAdmin()?6:5}" class="empty">ยังไม่มีไอเทม</td></tr>`}</tbody></table></div></div>`}

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

function wire(){
 if(page==='wheel')bindWheel();
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

 $('#withdrawItem')?.addEventListener('click',()=>openModal('เบิกของโดยแอดมิน',`<div class="form-grid"><div class="field wide"><label>เลือกไอเทม</label><select name="itemId" required>${state.items.map(i=>`<option value="${i.id}">${esc(i.name)} · คงเหลือ ${i.qty} ${esc(i.unit)}</option>`).join('')}</select></div><div class="field"><label>จำนวนที่เบิก</label><input name="qty" type="number" min="1" step="1" required></div><div class="field"><label>เหตุผล</label><input name="reason" placeholder="ระบุเหตุผล"></div></div>`,async d=>{await api('/api/withdrawals',{method:'POST',body:JSON.stringify(d)});toast('เบิกของออกจากคลังแล้ว')}));

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
boot().catch(()=>{});
