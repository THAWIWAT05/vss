const $ = s => document.querySelector(s);
let state = null, page = 'dashboard', selectedSession = 's1630', selectedDate = new Date().toLocaleDateString('en-CA');
const pageNames = { dashboard:'ภาพรวม', attendance:'ระบบเช็กชื่อ', members:'สมาชิก', inventory:'คลังไอเทม', requests:'ระบบเบิกของ', deliveries:'ระบบส่งของ', history:'ประวัติ' };
const statusNames = { present:'มา', late:'มาสาย', absent:'ขาด', leave:'ลา', business:'ติดธุระ', unmarked:'ยังไม่เช็ก' };
const statusClass = { present:'green', late:'yellow', absent:'red', leave:'blue', business:'yellow', unmarked:'red' };
const money = n => '฿' + Number(n || 0).toLocaleString('th-TH');
const fmt = s => s ? new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}) : '-';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options={}) { const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'ดำเนินการไม่สำเร็จ'); return d; }
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function isAdmin(){return !!state?.isAdmin}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await boot()}catch(err){$('#loginError').textContent=err.message}});
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});state=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden')};

async function boot(){const me=await api('/api/me');if(!me.user){$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');return}$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#userName').textContent=me.user.name;$('#userRole').textContent=me.isAdmin?'ผู้ดูแลระบบ':'สมาชิกแก๊ง';$('#userAvatar').textContent=(me.user.name||'G').slice(0,1).toUpperCase();document.querySelectorAll('.nav-item').forEach(b=>{const adminPages=['dashboard','members','inventory','requests','history'];b.classList.toggle('hidden',!me.isAdmin&&adminPages.includes(b.dataset.page))});if(!me.isAdmin){page='attendance';document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page==='attendance'))}await refresh()}

async function refresh(){state=await api('/api/data?date='+encodeURIComponent(selectedDate));$('#todayChip').textContent=state.today;$('#requestBadge').textContent=state.summary.pendingRequests;$('#deliveryBadge').textContent=state.summary.pendingDeliveries;$('#attendanceBadge').textContent='3 รอบ';render()}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{if(b.classList.contains('hidden'))return;page=b.dataset.page;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));render()});

function render(){if(!state)return;$('#crumb').textContent=pageNames[page];$('#pageTitle').textContent=pageNames[page];const c=$('#content');const views={dashboard,attendance,members,inventory,requests,deliveries,history};c.innerHTML=views[page]();wire();}

function stat(label,value,icon,sub){return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${sub}</small></div>`}

function dashboard(){
 const active=state.members.filter(m=>m.active);
 const todayRows=state.attendance;
 const present=todayRows.filter(a=>a.status==='present'||a.status==='late').length;
 const absent=todayRows.filter(a=>a.status==='absent').length;
 const leave=todayRows.filter(a=>a.status==='leave'||a.status==='business').length;
 return `<div class="hero"><div><div class="eyebrow">DAILY OPERATIONS / COMMAND CENTER</div><h3>ยินดีต้อนรับสู่ GANG CONTROL</h3><p>จัดการสมาชิก การเช็กชื่อ และทรัพย์สินของแก๊งได้จากที่เดียว</p></div><div class="hero-tag">● ระบบออนไลน์ · ${esc(state.today)}</div></div><div class="stats">${stat('สมาชิกที่ใช้งาน',active.length,'♙','รายชื่อในแก๊ง')}${stat('ไอเทมในคลัง',state.items.length,'▤','ประเภทไอเทม')}${stat('คำขอเบิกรอตรวจ',state.summary.pendingRequests,'⇄','รายการ')}${stat('ส่งของรอตรวจ',state.summary.pendingDeliveries,'⇧','รายการ')}</div><div class="quick-grid"><button class="quick" data-go="attendance"><span>◷</span><b>เช็กชื่อประจำวัน</b><small>16:30 · 20:30 · 23:50</small></button><button class="quick" data-go="requests"><span>⇄</span><b>จัดการคำขอเบิก</b><small>ตรวจสอบและอนุมัติไอเทม</small></button><button class="quick" data-go="deliveries"><span>⇧</span><b>ตรวจรับของ</b><small>รับของเข้าคลังจากสมาชิก</small></button></div><div class="grid2"><div class="panel"><div class="panel-head"><div><h3>สรุปเช็กชื่อวันนี้</h3><div class="panel-sub">รวมสถานะจากทั้ง 3 รอบ</div></div><button class="btn small" data-go="attendance">เปิดระบบเช็กชื่อ</button></div><div class="count-cards"><span>มา/มาสาย ${present}</span><span>ขาด ${absent}</span><span>ลา/ติดธุระ ${leave}</span></div><div class="muted-note" style="margin-top:14px">รอบเช็กชื่อ: 16:30 น. · 20:30 น. · 23:50 น.</div></div><div class="panel"><div class="panel-head"><div><h3>ไอเทมใกล้หมด</h3><div class="panel-sub">จำนวนคงเหลือต่ำกว่าค่าขั้นต่ำ</div></div></div>${state.items.filter(i=>i.qty<=i.min).map(i=>`<div class="history-item"><b>${esc(i.name)}</b><span class="pill yellow">เหลือ ${i.qty} ${esc(i.unit)}</span></div>`).join('')||'<div class="empty">ไม่มีไอเทมใกล้หมด</div>'}</div></div>`
}

function attendance(){
 if(!isAdmin())return `<div class="panel"><h3>ประวัติการเช็กชื่อของฉัน</h3><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เวลา</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>${state.attendanceHistory.map(a=>`<tr><td>${a.date}</td><td>${a.time}</td><td><span class="pill ${statusClass[a.status]}">${statusNames[a.status]}</span></td><td>${esc(a.note||'-')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">ยังไม่มีประวัติ</td></tr>'}</tbody></table></div></div>`;

 const sessions=state.sessions,active=state.members.filter(m=>m.active),rows=state.attendance;
 const selected=sessions.find(s=>s.id===selectedSession)||sessions[0];
 const sessionRows=active.map(m=>({m,a:rows.find(a=>a.memberId===m.id&&a.sessionId===selected.id)}));
 const count=key=>sessionRows.filter(x=>(x.a?.status||'unmarked')===key).length;

 return `<div class="hero"><div><div class="eyebrow">DAILY ROLL CALL</div><h3>เช็กชื่อสมาชิก</h3><p>เลือกวันที่และรอบ แล้วบันทึกสมาชิกทั้งหมดได้ในครั้งเดียว</p></div><div class="hero-tag">บันทึกย้อนหลังได้</div></div>
 <div class="panel"><div class="toolbar"><div class="field"><label>เลือกวันที่เช็กชื่อ</label><input id="attendanceDate" type="date" value="${selectedDate}"></div><div class="field"><label>เลือกประวัติรอบ</label><span class="muted-note">ข้อมูลของวันที่เลือก</span></div></div>
 <div class="toolbar"><div class="field" style="flex:1;min-width:220px"><label>ค้นหาชื่อสมาชิก</label><input id="attendanceSearch" type="search" placeholder="พิมพ์ชื่อสมาชิกเพื่อค้นหา..."></div></div><div class="session-tabs">${sessions.map(s=>`<button class="session-tab ${s.id===selected.id?'active':''}" data-session="${s.id}">${s.label}<b>${s.time}</b></button>`).join('')}</div>
 <div class="count-cards"><span>มา ${count('present')}</span><span>มาสาย ${count('late')}</span><span>ขาด ${count('absent')}</span><span>ลา ${count('leave')}</span><span>ธุระ ${count('business')}</span><span>ยังไม่เช็ก ${count('unmarked')}</span></div>
 <div class="attendance-list">${sessionRows.map(({m,a})=>`<div class="attendance-row" data-member-row="${m.id}"><div class="member-name"><b>${esc(m.name)}</b><small>${esc(m.rank||'สมาชิก')}</small></div><select class="status-select" data-status><option value="unmarked" ${!a?'selected':''}>ยังไม่เช็กชื่อ</option><option value="present" ${a?.status==='present'?'selected':''}>มา</option><option value="late" ${a?.status==='late'?'selected':''}>มาสาย</option><option value="absent" ${a?.status==='absent'?'selected':''}>ขาด</option><option value="leave" ${a?.status==='leave'?'selected':''}>ลา</option><option value="business" ${a?.status==='business'?'selected':''}>ติดธุระ</option></select><input class="inline-note" data-note placeholder="หมายเหตุ" value="${esc(a?.note||'')}"></div>`).join('')||'<div class="empty">ยังไม่มีสมาชิก</div>'}
 <div class="panel-head" style="margin-top:18px"><span class="muted-note">ตรวจสอบสถานะทุกคนก่อนกดบันทึก</span><button class="btn primary" id="saveAllAttendance">บันทึกทั้งหมด</button></div></div>
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

 // ใช้รายชื่อทั้งหมด รวมสมาชิกที่ถูกนำออก เพื่อไม่ให้ประวัติเดิมหายไป
 const members = state.memberHistory || state.members;

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
   <div class="panel history-member-card" data-member-name="${esc(m.name.toLocaleLowerCase('th'))}">
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
   <div class="field">
     <label>ค้นหาชื่อสมาชิกในประวัติการขาด</label>
     <input id="historyMemberSearch" type="search" placeholder="พิมพ์ชื่อสมาชิกที่ต้องการค้นหา...">
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
 // ค้นหาชื่อสมาชิกในหน้าประวัติการขาด/ลา/ติดธุระ
 const historySearch = $('#historyMemberSearch');
 historySearch?.addEventListener('input', () => {
   const keyword = historySearch.value.trim().toLocaleLowerCase('th');
   const cards = [...document.querySelectorAll('#historyMemberList .history-member-card')];
   let visibleCount = 0;

   cards.forEach(card => {
     const memberName = (card.dataset.memberName || '').toLocaleLowerCase('th');
     const matched = !keyword || memberName.includes(keyword);
     card.hidden = !matched;
     if (matched) visibleCount++;
   });

   const noResults = $('#historyNoResults');
   if (noResults) noResults.hidden = visibleCount !== 0;
 });

 $('#attendanceDate')?.addEventListener('change',async e=>{selectedDate=e.target.value;await refresh()});

 $('#attendanceSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('th');document.querySelectorAll('.attendance-row').forEach(row=>{const name=row.querySelector('.member-name')?.textContent.toLocaleLowerCase('th')||'';row.style.display=name.includes(q)?'':'none'})});

 $('#deliveryMemberSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('th');document.querySelectorAll('.delivery-member-row').forEach(row=>{const name=row.dataset.memberName||'';row.style.display=name.includes(q)?'':'none'})});

 $('#saveAllAttendance')?.addEventListener('click',async()=>{const rows=[...document.querySelectorAll('.attendance-row')].map(el=>({memberId:Number(el.dataset.memberRow),status:el.querySelector('[data-status]').value,note:el.querySelector('[data-note]').value}));if(rows.some(x=>x.status==='unmarked')){toast('กรุณาเลือกสถานะให้ครบทุกคน');return}try{await api('/api/attendance/bulk',{method:'POST',body:JSON.stringify({date:selectedDate,sessionId:selectedSession,rows})});await refresh();toast('บันทึกเช็กชื่อทั้งหมดแล้ว')}catch(e){toast(e.message)}});

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

 document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));render()});

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
