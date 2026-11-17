require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSIONS = [
  { id: 's1630', label: 'รอบที่ 1', time: '16:30' },
  { id: 's2030', label: 'รอบที่ 2', time: '20:30' },
  { id: 's2350', label: 'รอบที่ 3', time: '23:50' }
];
fs.mkdirSync(DATA_DIR, { recursive: true });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isoNow = () => new Date().toISOString();
const seed = () => ({
  users: [
    { id: 1, username: process.env.ADMIN_USERNAME || 'admin', passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 10), name: 'ผู้ดูแลระบบ', role: 'admin', memberId: null, active: true },
    { id: 102, username: 'shadow', passwordHash: bcrypt.hashSync('Member123!', 10), name: 'Shadow', role: 'member', memberId: 101, active: true },
    { id: 103, username: 'raven', passwordHash: bcrypt.hashSync('Member123!', 10), name: 'Raven', role: 'member', memberId: 102, active: true },
    { id: 104, username: 'ghost', passwordHash: bcrypt.hashSync('Member123!', 10), name: 'Ghost', role: 'member', memberId: 103, active: true }
  ],
  members: [
    { id: 101, name: 'Shadow', gameId: 'license:shadow', rank: 'หัวหน้าแก๊ง', active: true, joinedAt: today() },
    { id: 102, name: 'Raven', gameId: 'license:raven', rank: 'รองหัวหน้า', active: true, joinedAt: today() },
    { id: 103, name: 'Ghost', gameId: 'license:ghost', rank: 'สมาชิก', active: true, joinedAt: today() }
  ],
  items: [
    { id: 201, name: 'เกราะ', category: 'อุปกรณ์', qty: 20, unit: 'ชิ้น', min: 5 },
    { id: 202, name: 'ผ้าพันแผล', category: 'เวชภัณฑ์', qty: 50, unit: 'ชิ้น', min: 10 },
    { id: 203, name: 'น้ำ', category: 'เสบียง', qty: 30, unit: 'ขวด', min: 5 }
  ],
  attendance: [], requests: [], deliveries: [], dailyTasks: [], contributions: [], withdrawals: [], logs: []
});
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2));
function readDB() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  for (const k of ['users', 'members', 'items', 'attendance', 'requests', 'deliveries', 'dailyTasks', 'contributions', 'withdrawals', 'logs']) if (!Array.isArray(db[k])) db[k] = [];
  return db;
}
function writeDB(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function log(db, actor, action, detail) {
  db.logs.unshift({ id: Date.now() + Math.random(), actor, action, detail, createdAt: isoNow() });
  db.logs = db.logs.slice(0, 1000);
}
function admin(req) { return req.session.user && ['admin', 'owner', 'leader'].includes(req.session.user.role); }
function auth(req, res, next) { if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' }); next(); }
function adminOnly(req, res, next) { if (!admin(req)) return res.status(403).json({ error: 'เฉพาะแอดมินเท่านั้น' }); next(); }
function getMember(db, user) { return db.members.find(m => m.id === user.memberId); }
function publicUser(u) { return { id: u.id, username: u.username, name: u.name, role: u.role, memberId: u.memberId || null }; }
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deploy', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const u = db.users.find(x => x.username === String(username || '').trim() && x.active);
  if (!u || !bcrypt.compareSync(String(password || ''), u.passwordHash)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  req.session.user = publicUser(u);
  res.json({ user: req.session.user, isAdmin: admin(req) });
});
app.post('/api/logout', auth, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null, isAdmin: !!admin(req) }));

app.get('/api/data', auth, (req, res) => {
  const db = readDB(); const isAdmin = admin(req); const member = getMember(db, req.session.user);
  const viewDate = String(req.query.date || today());
  res.json({
    user: req.session.user, isAdmin, today: today(), viewDate, sessions: SESSIONS,
    summary: { members: db.members.filter(m => m.active).length, items: db.items.length, pendingRequests: db.requests.filter(r => r.status === 'pending').length, pendingDeliveries: db.deliveries.filter(d => d.status === 'pending').length },
    members: isAdmin ? db.members : (member ? [member] : []),
    items: db.items,
    attendance: isAdmin ? db.attendance.filter(a => a.date === viewDate) : db.attendance.filter(a => a.date === viewDate && a.memberId === req.session.user.memberId),
    dailyTasks: db.dailyTasks.slice().sort((a,b) => b.date.localeCompare(a.date)),
    contributions: isAdmin ? db.contributions : db.contributions.filter(c => c.memberId === req.session.user.memberId),
    withdrawals: isAdmin ? db.withdrawals.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : [],
    attendanceHistory: isAdmin ? db.attendance.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 500) : db.attendance.filter(a => a.memberId === req.session.user.memberId).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 100),
    requests: isAdmin ? db.requests.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : db.requests.filter(r => r.memberId === req.session.user.memberId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
    deliveries: isAdmin ? db.deliveries.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : db.deliveries.filter(d => d.memberId === req.session.user.memberId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
    logs: isAdmin ? db.logs.slice(0, 100) : []
  });
});

// Admin records attendance for each member in one of the three daily sessions.
app.post('/api/attendance', auth, adminOnly, (req, res) => {
  const { memberId, sessionId, status, note } = req.body || {};
  const db = readDB(); const m = db.members.find(x => x.id === Number(memberId) && x.active);
  const slot = SESSIONS.find(x => x.id === sessionId);
  const allowed = ['present', 'late', 'absent', 'leave', 'business'];
  if (!m || !slot || !allowed.includes(status)) return res.status(400).json({ error: 'ข้อมูลเช็กชื่อไม่ถูกต้อง' });
  const date = String(req.body.date || today());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
  let row = db.attendance.find(x => x.date === date && x.memberId === m.id && x.sessionId === slot.id);
  if (row) { row.status = status; row.note = String(note || '').trim(); row.markedBy = req.session.user.name; row.updatedAt = isoNow(); }
  else { row = { id: Date.now() + Math.floor(Math.random()*1000), date, memberId: m.id, memberName: m.name, sessionId: slot.id, sessionLabel: slot.label, time: slot.time, status, note: String(note || '').trim(), markedBy: req.session.user.name, createdAt: isoNow(), updatedAt: isoNow() }; db.attendance.push(row); }
  log(db, req.session.user.name, 'เช็กชื่อสมาชิก', `${m.name} · ${slot.time} · ${status}${row.note ? ' · ' + row.note : ''}`);
  writeDB(db); res.json(row);
});
app.get('/api/attendance/summary', auth, adminOnly, (req, res) => {
  const db = readDB(); const date = String(req.query.date || today());
  const members = db.members.filter(m => m.active);
  const rows = db.attendance.filter(a => a.date === date);
  const result = SESSIONS.map(slot => ({ ...slot, rows: members.map(m => ({ memberId: m.id, memberName: m.name, ...(rows.find(a => a.memberId === m.id && a.sessionId === slot.id) || { status: 'unmarked', note: '' }) })) }));
  res.json({ date, members, sessions: result });
});


// Save all attendance rows in one request; existing rows are updated.
app.post('/api/attendance/bulk', auth, adminOnly, (req, res) => {
  const date = String(req.body?.date || today());
  const sessionId = String(req.body?.sessionId || '');
  const slot = SESSIONS.find(x => x.id === sessionId);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const db = readDB();
  if (!slot || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !rows.length) return res.status(400).json({error:'ข้อมูลเช็กชื่อไม่ถูกต้อง'});
  const allowed = ['present','late','absent','leave','business'];
  for (const x of rows) {
    const m = db.members.find(y => y.id === Number(x.memberId) && y.active);
    if (!m || !allowed.includes(x.status)) return res.status(400).json({error:'กรุณาเลือกสถานะสมาชิกให้ครบทุกคน'});
  }
  for (const x of rows) {
    const m = db.members.find(y => y.id === Number(x.memberId));
    let a = db.attendance.find(y => y.date === date && y.memberId === m.id && y.sessionId === slot.id);
    if (!a) { a = {id:Date.now()+Math.floor(Math.random()*100000),date,memberId:m.id,memberName:m.name,sessionId:slot.id,sessionLabel:slot.label,time:slot.time,createdAt:isoNow()}; db.attendance.push(a); }
    Object.assign(a,{status:x.status,note:String(x.note||'').trim(),markedBy:req.session.user.name,updatedAt:isoNow()});
  }
  log(db,req.session.user.name,'บันทึกเช็กชื่อทั้งหมด',`${date} · ${slot.label} · ${rows.length} คน`);
  writeDB(db); res.json({ok:true,count:rows.length});
});

// Admin creates a dated daily delivery obligation for every active member.
app.post('/api/daily-tasks', auth, adminOnly, (req,res) => {
  const date=String(req.body?.date||today()), itemId=Number(req.body?.itemId), qty=Number(req.body?.qty);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(qty)||qty<1)return res.status(400).json({error:'กรอกวันที่และจำนวนต่อคนให้ถูกต้อง'});
  const db=readDB(), item=db.items.find(i=>i.id===itemId);
  if(!item)return res.status(400).json({error:'กรุณาเลือกไอเทมจากคลัง'});
  const task={id:Date.now(),date,itemId:item.id,name:item.name,qty,unit:item.unit,closed:false,createdBy:req.session.user.name,createdAt:isoNow()};
  db.dailyTasks.push(task);log(db,req.session.user.name,'เพิ่มรายการส่งของประจำวัน',`${date} · ${item.name} ${qty} ${item.unit}/คน`);
  writeDB(db);res.json(task);
});
function saveContribution(db, task, member, qty, complete, actor) {
  let c=db.contributions.find(x=>x.taskId===task.id&&x.memberId===member.id);
  if(!c){c={id:Date.now()+Math.floor(Math.random()*10000),taskId:task.id,date:task.date,memberId:member.id,member:member.name,qty:0,complete:false,stockedQty:0,updatedAt:isoNow()};db.contributions.push(c);}
  const oldStocked=Number(c.stockedQty||0), finalQty=complete?task.qty:qty;
  c.qty=finalQty;c.complete=finalQty>=task.qty;c.updatedAt=isoNow();
  const item=task.itemId?db.items.find(i=>i.id===task.itemId):null;
  if(item){const delta=finalQty-oldStocked;item.qty=Math.max(0,item.qty+delta);c.stockedQty=oldStocked+delta;}
  log(db,actor,'บันทึกยอดส่งของ',`${task.date} · ${task.name} · ${finalQty}/${task.qty} · ${member.name}`);
  return c;
}
app.post('/api/contributions', auth, (req,res) => {
  const taskId=Number(req.body?.taskId), qty=Number(req.body?.qty), complete=!!req.body?.complete;
  const db=readDB(), task=db.dailyTasks.find(t=>t.id===taskId);
  if(!task||task.closed)return res.status(400).json({error:'ไม่พบรายการหรือรายการปิดวันแล้ว'});
  if(!Number.isInteger(qty)||qty<0||qty>100000)return res.status(400).json({error:'จำนวนไม่ถูกต้อง'});
  const member=db.members.find(m=>m.id===req.session.user.memberId&&m.active);
  if(!member)return res.status(403).json({error:'บัญชีนี้ไม่มีข้อมูลสมาชิก'});
  const c=saveContribution(db,task,member,qty,complete,req.session.user.name);writeDB(db);res.json(c);
});
app.post('/api/contributions/admin', auth, adminOnly, (req,res) => {
  const taskId=Number(req.body?.taskId), memberId=Number(req.body?.memberId), qty=Number(req.body?.qty), complete=!!req.body?.complete;
  const db=readDB(), task=db.dailyTasks.find(t=>t.id===taskId), member=db.members.find(m=>m.id===memberId&&m.active);
  if(!task||task.closed)return res.status(400).json({error:'ไม่พบรายการหรือรายการปิดวันแล้ว'});
  if(!member||!Number.isInteger(qty)||qty<0||qty>100000)return res.status(400).json({error:'เลือกสมาชิกและจำนวนให้ถูกต้อง'});
  const c=saveContribution(db,task,member,qty,complete,req.session.user.name);writeDB(db);res.json(c);
});
app.post('/api/daily-tasks/:id/close', auth, adminOnly, (req,res) => {
  const db=readDB(),task=db.dailyTasks.find(t=>t.id===Number(req.params.id));
  if(!task)return res.status(404).json({error:'ไม่พบรายการ'});
  task.closed=true;task.closedAt=isoNow();task.closedBy=req.session.user.name;
  const members=db.members.filter(m=>m.active);
  const outstanding=members.map(m=>{const c=db.contributions.find(x=>x.taskId===task.id&&x.memberId===m.id);return {member:m.name,memberId:m.id,qty:Math.max(0,task.qty-(c?.qty||0)),sent:c?.qty||0};}).filter(x=>x.qty>0);
  log(db,req.session.user.name,'ปิดวันส่งของ',`${task.date} · ${task.name} · ค้าง ${outstanding.length} คน`);
  writeDB(db);res.json({ok:true,outstanding});
});
app.post('/api/withdrawals', auth, adminOnly, (req,res) => {
  const itemId=Number(req.body?.itemId),qty=Number(req.body?.qty),reason=String(req.body?.reason||'').trim();
  const db=readDB(),item=db.items.find(i=>i.id===itemId);
  if(!item||!Number.isInteger(qty)||qty<1)return res.status(400).json({error:'เลือกไอเทมและจำนวนให้ถูกต้อง'});
  if(item.qty<qty)return res.status(400).json({error:'ของในคลังไม่เพียงพอ'});
  item.qty-=qty;const w={id:Date.now(),itemId,item:item.name,qty,reason,admin:req.session.user.name,createdAt:isoNow()};
  db.withdrawals.push(w);log(db,req.session.user.name,'แอดมินเบิกของ',`${item.name} × ${qty} · ${reason}`);
  writeDB(db);res.json(w);
});

app.post('/api/members', auth, adminOnly, (req, res) => {
  const { name, gameId, rank, username, password } = req.body || {};
  const db = readDB();
  if (!String(name || '').trim() || !String(username || '').trim() || String(password || '').length < 6) return res.status(400).json({ error: 'กรอกชื่อสมาชิก ชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 6 ตัวให้ครบ' });
  if (db.users.some(u => u.username.toLowerCase() === String(username).trim().toLowerCase())) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  const id = Date.now(); const m = { id, name: String(name).trim(), gameId: String(gameId || '').trim(), rank: String(rank || 'สมาชิก'), active: true, joinedAt: today() };
  db.members.push(m); db.users.push({ id: id + 1, username: String(username).trim(), passwordHash: bcrypt.hashSync(password, 10), name: m.name, role: 'member', memberId: id, active: true });
  log(db, req.session.user.name, 'เพิ่มสมาชิก', m.name); writeDB(db); res.json(m);
});
app.delete('/api/members/:id', auth, adminOnly, (req, res) => {
  const db = readDB(); const m = db.members.find(x => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
  // Soft-delete to preserve attendance and transaction history.
  m.active = false; db.users.filter(u => u.memberId === m.id).forEach(u => { u.active = false; });
  log(db, req.session.user.name, 'นำสมาชิกออกจากแก๊ง', m.name); writeDB(db); res.json({ ok: true });
});

app.post('/api/items', auth, adminOnly, (req, res) => {
  const { name, category, qty, unit, min } = req.body || {}; const db = readDB();
  if (!String(name || '').trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อไอเทม' });
  const item = { id: Date.now(), name: String(name).trim(), category: String(category || 'ทั่วไป'), qty: Math.max(0, Number(qty) || 0), unit: String(unit || 'ชิ้น'), min: Math.max(0, Number(min) || 0) };
  db.items.push(item); log(db, req.session.user.name, 'เพิ่มไอเทมในคลัง', item.name); writeDB(db); res.json(item);
});
app.delete('/api/items/:id', auth, adminOnly, (req,res) => {
  const db=readDB(), idx=db.items.findIndex(i=>i.id===Number(req.params.id));
  if(idx<0)return res.status(404).json({error:'ไม่พบไอเทมในคลัง'});
  const [item]=db.items.splice(idx,1);
  log(db,req.session.user.name,'ลบไอเทมออกจากคลัง',`${item.name} · คงเหลือเดิม ${item.qty} ${item.unit}`);
  writeDB(db);res.json({ok:true});
});
app.post('/api/requests', auth, (req, res) => {
  const { itemId, qty, reason } = req.body || {}; const db = readDB(); const item = db.items.find(x => x.id === Number(itemId));
  if (!item || !Number.isInteger(Number(qty)) || Number(qty) < 1) return res.status(400).json({ error: 'เลือกไอเทมและจำนวนให้ถูกต้อง' });
  const r = { id: Date.now(), memberId: req.session.user.memberId, member: req.session.user.name, itemId: item.id, item: item.name, qty: Number(qty), reason: String(reason || '').trim(), status: 'pending', createdAt: isoNow() };
  db.requests.push(r); log(db, req.session.user.name, 'ส่งคำขอเบิก', `${item.name} × ${r.qty}`); writeDB(db); res.json(r);
});
app.post('/api/requests/:id/decision', auth, adminOnly, (req, res) => {
  const db = readDB(); const r = db.requests.find(x => x.id === Number(req.params.id)); const decision = req.body?.decision;
  if (!r || r.status !== 'pending') return res.status(404).json({ error: 'ไม่พบคำขอที่รอดำเนินการ' });
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
  if (decision === 'approved') { const item = db.items.find(x => x.id === r.itemId); if (!item || item.qty < r.qty) return res.status(400).json({ error: 'ไอเทมในคลังไม่เพียงพอ' }); item.qty -= r.qty; }
  r.status = decision; r.decidedBy = req.session.user.name; r.decidedAt = isoNow(); log(db, req.session.user.name, decision === 'approved' ? 'อนุมัติคำขอเบิก' : 'ปฏิเสธคำขอเบิก', `${r.member}: ${r.item} × ${r.qty}`); writeDB(db); res.json(r);
});

app.post('/api/deliveries', auth, (req, res) => {
  const lines = Array.isArray(req.body?.items) ? req.body.items : []; const db = readDB();
  const clean = lines.map(x => ({ itemId: x.itemId ? Number(x.itemId) : null, name: String(x.name || '').trim(), qty: Number(x.qty) })).filter(x => x.name && Number.isInteger(x.qty) && x.qty > 0);
  if (!clean.length || clean.length > 30) return res.status(400).json({ error: 'เพิ่มรายการของ 1–30 รายการ และระบุจำนวนเป็นจำนวนเต็ม' });
  const d = { id: Date.now(), date: today(), memberId: req.session.user.memberId, member: req.session.user.name, items: clean, note: String(req.body.note || '').trim(), status: 'pending', createdAt: isoNow() };
  db.deliveries.push(d); log(db, req.session.user.name, 'ส่งของเข้าคลัง', clean.map(x => `${x.name} × ${x.qty}`).join(', ')); writeDB(db); res.json(d);
});
app.post('/api/deliveries/:id/decision', auth, adminOnly, (req, res) => {
  const db = readDB(); const d = db.deliveries.find(x => x.id === Number(req.params.id)); const decision = req.body?.decision;
  if (!d || d.status !== 'pending') return res.status(404).json({ error: 'ไม่พบรายการส่งของที่รอตรวจรับ' });
  if (!['verified', 'rejected'].includes(decision)) return res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
  if (decision === 'verified') {
    for (const line of d.items) {
      let item = line.itemId ? db.items.find(x => x.id === line.itemId) : db.items.find(x => x.name.toLowerCase() === line.name.toLowerCase());
      if (!item) { item = { id: Date.now() + Math.floor(Math.random()*10000), name: line.name, category: 'รับเข้าจากสมาชิก', qty: 0, unit: 'ชิ้น', min: 0 }; db.items.push(item); line.itemId = item.id; }
      item.qty += line.qty;
    }
  }
  d.status = decision; d.decidedBy = req.session.user.name; d.decidedAt = isoNow(); d.reason = String(req.body.reason || '').trim();
  log(db, req.session.user.name, decision === 'verified' ? 'ยืนยันรับของเข้าคลัง' : 'ตีกลับรายการส่งของ', `${d.member}: ${d.items.map(x => `${x.name} × ${x.qty}`).join(', ')}`); writeDB(db); res.json(d);
});
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'ระบบขัดข้อง กรุณาลองใหม่' }); });
app.listen(PORT, () => console.log(`GANG CONTROL เปิดแล้ว: http://localhost:${PORT}`));
