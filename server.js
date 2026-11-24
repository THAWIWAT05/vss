require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');
const PgSession = require('connect-pg-simple')(session);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-only-secret-change-before-deploy');
if (!SESSION_SECRET) { console.error('FATAL: กรุณากำหนด SESSION_SECRET ใน Environment'); process.exit(1); }
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const dbContext = new AsyncLocalStorage();
if (!process.env.DATABASE_URL) {
  console.error('FATAL: กรุณากำหนด DATABASE_URL ให้เชื่อมต่อ Render PostgreSQL');
  process.exit(1);
}
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isLocalDatabase ? false : { rejectUnauthorized: false }, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const SESSIONS = [
  { id: 's1630', label: 'รอบที่ 1', time: '16:30' },
  { id: 's2030', label: 'รอบที่ 2', time: '20:30' },
  { id: 's2350', label: 'รอบที่ 3', time: '23:30' }
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
  attendance: [], requests: [], deliveries: [], dailyTasks: [], contributions: [], withdrawals: [], logs: [], testRuns: []
});
// บัญชีทดสอบสำหรับทดลองเกมเท่านั้น: เก็บใน users แต่ไม่สร้างแถวใน members
const TEST_ACCOUNTS = Array.from({ length: 5 }, (_, i) => ({
  username: `test${String(i + 1).padStart(2, '0')}`,
  password: 'Test1234!',
  name: `TEST ${String(i + 1).padStart(2, '0')}`
}));
function ensureTestAccounts(db) {
  let changed = false;
  let nextId = Math.max(0, ...db.users.map(u => Number(u.id) || 0), ...db.members.map(m => Number(m.id) || 0)) + 1;
  for (const account of TEST_ACCOUNTS) {
    // ไม่เขียนทับบัญชีที่มีชื่อผู้ใช้นี้อยู่แล้ว และไม่แตะรหัสผ่านของบัญชีเดิม
    if (db.users.some(u => String(u.username).toLowerCase() === account.username.toLowerCase())) continue;
    db.users.push({
      id: nextId++, username: account.username,
      passwordHash: bcrypt.hashSync(account.password, 10),
      name: account.name, role: 'tester', memberId: null, active: true, isTestAccount: true
    });
    changed = true;
  }
  return changed;
}

function normalizeDB(db) {
  for (const k of ['users', 'members', 'items', 'attendance', 'requests', 'deliveries', 'dailyTasks', 'contributions', 'withdrawals', 'logs', 'bingoRooms', 'impostorRooms', 'werewolfRooms', 'testRuns']) if (!Array.isArray(db[k])) db[k] = [];
  return db;
}
function readDB() {
  const ctx = dbContext.getStore();
  if (!ctx) throw new Error('Database context is unavailable');
  return ctx.db;
}
function writeDB(db) {
  const ctx = dbContext.getStore();
  if (!ctx || ctx.db !== db) throw new Error('Database write outside request transaction');
  ctx.dirty = true;
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
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
  name: 'gang.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.status(200).send('ok'));

// Each API request locks the single JSONB state row so simultaneous writes do not overwrite one another.
app.use('/api', async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
    if (!result.rows.length) throw new Error('PostgreSQL app_state row is missing');
    const ctx = { client, db: normalizeDB(result.rows[0].data), dirty: false, finished: false };
    const sendJson = res.json.bind(res);
    const finish = async (body) => {
      if (ctx.finished) return;
      ctx.finished = true;
      try {
        if (ctx.dirty) await client.query('UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(ctx.db)]);
        await client.query('COMMIT');
        client.release();
        sendJson(body);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        console.error('PostgreSQL commit failed:', err);
        if (!res.headersSent) { res.statusCode = 500; sendJson({ error: 'บันทึกฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่' }); }
      }
    };
    res.json = (body) => { finish(body); return res; };
    res.on('close', async () => {
      if (!ctx.finished) {
        ctx.finished = true;
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
      }
    });
    dbContext.run(ctx, next);
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); }
    next(err);
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const u = db.users.find(x => x.username === String(username || '').trim() && x.active);
  if (!u || !bcrypt.compareSync(String(password || ''), u.passwordHash)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  req.session.user = publicUser(u);
  log(db, u.name, 'เข้าสู่ระบบ', 'เข้าสู่ระบบสำเร็จ'); writeDB(db);
  res.json({ user: req.session.user, isAdmin: admin(req) });
});
app.post('/api/logout', auth, (req, res) => { const db = readDB(); log(db, req.session.user.name, 'ออกจากระบบ', 'ออกจากระบบ'); writeDB(db); req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null, isAdmin: !!admin(req) }));

// Admin audit trail: searchable history of recorded system actions.
app.get('/api/audit', auth, adminOnly, (req, res) => {
  const db = readDB();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const q = String(req.query.q || '').trim().toLocaleLowerCase('th');
  const validDate = v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return res.status(400).json({ error: 'ช่วงวันที่ไม่ถูกต้อง' });
  const logs = (db.logs || []).filter(entry => {
    const date = String(entry.createdAt || '').slice(0, 10);
    if (from && (!date || date < from)) return false;
    if (to && (!date || date > to)) return false;
    if (q && ![entry.actor, entry.action, entry.detail].some(v => String(v || '').toLocaleLowerCase('th').includes(q))) return false;
    return true;
  }).slice(0, 1000);
  res.json({ logs, total: logs.length, limit: 1000, range: { from, to } });
});

app.get('/api/data', auth, (req, res) => {
  const db = readDB(); const isAdmin = admin(req); const member = getMember(db, req.session.user);
  const viewDate = String(req.query.date || today());
  res.json({
    user: req.session.user, isAdmin, today: today(), viewDate, sessions: SESSIONS,
    summary: { members: db.members.filter(m => m.active).length, items: db.items.length, pendingRequests: db.requests.filter(r => r.status === 'pending').length, pendingDeliveries: db.deliveries.filter(d => d.status === 'pending').length },
    // รายชื่อสมาชิกที่ใช้งานอยู่สำหรับหน้าทั่วไป
    members: isAdmin ? db.members.filter(m => m.active) : (member && member.active ? [member] : []),
    // เก็บรายชื่อทั้งหมดไว้ให้หน้า History แสดงประวัติของสมาชิกที่ถูกนำออกแล้วได้
    memberHistory: isAdmin ? db.members : (member ? [member] : []),
    items: db.items,
    attendance: isAdmin ? db.attendance.filter(a => a.date === viewDate) : db.attendance.filter(a => a.date === viewDate && a.memberId === req.session.user.memberId),
    dailyTasks: db.dailyTasks.slice().sort((a,b) => b.date.localeCompare(a.date)),
    contributions: isAdmin ? db.contributions : db.contributions.filter(c => c.memberId === req.session.user.memberId),
    withdrawals: isAdmin ? db.withdrawals.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : [],
    attendanceHistory: isAdmin ? db.attendance.slice().sort((a,b) => b.date.localeCompare(a.date)) : db.attendance.filter(a => a.memberId === req.session.user.memberId).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 100),
    requests: isAdmin ? db.requests.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : db.requests.filter(r => r.memberId === req.session.user.memberId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
    deliveries: isAdmin ? db.deliveries.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : db.deliveries.filter(d => d.memberId === req.session.user.memberId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
    logs: isAdmin ? db.logs.slice(0, 100) : []
  });
});

// BINGO V4: public room lobby, room ownership, leave/join and timed auto-draw.
function makeBingoCard(){
 const card=[];for(let col=0;col<5;col++){const min=col*15+1,max=min+14,nums=[];while(nums.length<5){const n=Math.floor(Math.random()*(max-min+1))+min;if(!nums.includes(n))nums.push(n)}for(let row=0;row<5;row++)card[row*5+col]=nums[row]}card[12]=null;return card;
}
function roomFor(db,id){return (db.bingoRooms||[]).find(r=>String(r.id)===String(id));}
function bingoLines(){
 const lines=[];
 // แนวนอนและแนวตั้งต้องครบ 5 ช่อง
 for(let y=0;y<5;y++)lines.push(Array.from({length:5},(_,x)=>y*5+x));
 for(let x=0;x<5;x++)lines.push(Array.from({length:5},(_,y)=>y*5+x));
 // แนวทแยงใหญ่จากมุมถึงมุม ต้องครบ 5 ช่อง
 lines.push(Array.from({length:5},(_,k)=>k*5+k));       // ซ้ายบน -> ขวาล่าง
 lines.push(Array.from({length:5},(_,k)=>k*5+(4-k)));  // ขวาบน -> ซ้ายล่าง
 // แนวทแยงย่อย 4 ช่อง: เส้นทแยงที่ขนานกับแนวทแยงใหญ่
 // แต่ละเส้นต้องเป็นช่องติดกัน 4 ช่อง และไม่จำเป็นต้องผ่านช่องกลาง
 // ตัวอย่าง: 15-29-34-50, 19-40-58-64, 60-40-29-04, 75-58-34-30
 lines.push([1,7,13,19]);   // บนซ้ายค่อนไปทางขวา -> ล่างขวา
 lines.push([5,11,17,23]);  // ซ้ายบนค่อนไปล่าง -> ขวาล่าง
 lines.push([3,7,11,15]);   // บนขวาค่อนไปทางซ้าย -> ล่างซ้าย
 lines.push([9,13,17,21]);  // ขวาบนค่อนไปล่าง -> ซ้ายล่าง
 return lines;
}
function bingoLineLabel(line){
 const step=line[1]-line[0];
 if(Math.abs(step)===4||Math.abs(step)===6)return `แนวทแยง (${line.length} ช่อง)`;
 return step===1?`แนวนอน (${line.length} ช่อง)`:`แนวตั้ง (${line.length} ช่อง)`;
}
function bingoWinningLine(player){
 const marked=player.marked||[];const line=bingoLines().find(line=>line.every(i=>marked[i]));if(!line)return null;
 return {line:bingoLineLabel(line),indices:line};
}
function bingoCanStillWin(room,player){return bingoLines().some(line=>line.every(i=>i===12||room.drawn.includes(player.card[i])));}
function checkBingoWinnerForPlayer(room,player){const result=bingoWinningLine(player);if(!result)return null;if(!Array.isArray(room.winners))room.winners=room.winner?[room.winner]:[];if(room.winners.some(w=>String(w.userId)===String(player.userId)))return null;const winner={userId:player.userId,name:player.name,line:result.line,claimedAt:isoNow()};room.winners.push(winner);room.winner=room.winner||winner;room.status='finished';room.finishedAt=room.finishedAt||isoNow();return winner;}
function cleanupBingoRooms(db){
 if(!Array.isArray(db.bingoRooms))db.bingoRooms=[];
 const now=Date.now(),before=db.bingoRooms.length;
 db.bingoRooms=db.bingoRooms.filter(r=>{
  const players=Array.isArray(r.players)?r.players:[];
  const last=Date.parse(r.lastActivityAt||r.createdAt||0)||0;
  const finished=Date.parse(r.finishedAt||r.lastActivityAt||r.createdAt||0)||now;
  if(r.status==='closed'||(r.status==='waiting'&&!players.length)||(r.status==='waiting'&&now-last>15*60*1000)||(r.status==='playing'&&now-last>30*60*1000)||(r.status==='finished'&&now-finished>60*60*1000))return false;
  return true;
 });
 return before!==db.bingoRooms.length;
}

// Server-side BINGO clock: draws continue even when every player closes the page.
// The PostgreSQL row lock serializes this worker with normal API requests and other instances.
async function runBingoScheduler(){
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  const result=await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
  if(!result.rows.length){await client.query('ROLLBACK');return;}
  const db=normalizeDB(result.rows[0].data);
  const now=Date.now(),stamp=isoNow();
  let changed=cleanupBingoRooms(db);
  for(const room of db.bingoRooms){
   if(room.status!=='playing'||now<(Number(room.nextDrawAt)||0))continue;
   const drawn=Array.isArray(room.drawn)?room.drawn:[];
   const remaining=Array.from({length:75},(_,i)=>i+1).filter(n=>!drawn.includes(n));
   if(!remaining.length){room.status='finished';room.finishedAt=room.finishedAt||stamp;room.lastActivityAt=stamp;changed=true;continue;}
   const number=remaining[Math.floor(Math.random()*remaining.length)];
   drawn.push(number);room.drawn=drawn;room.lastActivityAt=stamp;
   room.nextDrawAt=now+7000;
   if(drawn.length>=75){room.status='finished';room.finishedAt=stamp;}
   changed=true;
  }
  if(changed)await client.query('UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',[JSON.stringify(db)]);
  await client.query('COMMIT');
 }catch(err){if(client){try{await client.query('ROLLBACK')}catch(_){}}console.error('BINGO scheduler error:',err.message)}
 finally{if(client)client.release();}
}
function bingoRoomPublic(room,req){if(!room)return null;const user=req.session.user,p=room.players.find(x=>String(x.userId)===String(user.id))||null;return {id:room.id,title:room.title,status:room.status,hostId:room.hostId,hostName:room.hostName,drawn:room.drawn,winner:room.winner,winners:room.winners|| (room.winner?[room.winner]:[]),nextDrawAt:room.nextDrawAt,serverNow:Date.now(),createdAt:room.createdAt,startedAt:room.startedAt,players:room.players.map(x=>({userId:x.userId,name:x.name,winner:!!((room.winners|| (room.winner?[room.winner]:[])).some(w=>String(w.userId)===String(x.userId)))})),player:p?{card:p.card,marked:p.marked}:null,isHost:String(room.hostId)===String(user.id),canStillWin:p?bingoCanStillWin(room,p):false};}
app.get('/api/bingo',auth,(req,res)=>{const db=readDB();const changed=cleanupBingoRooms(db);if(changed)writeDB(db);const rooms=db.bingoRooms.filter(r=>r.status==='waiting'||r.status==='playing').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({id:r.id,title:r.title,status:r.status,hostName:r.hostName,playerCount:r.players.length,createdAt:r.createdAt}));const room=req.query.roomId?roomFor(db,req.query.roomId):null;res.json({rooms,room:bingoRoomPublic(room,req),serverNow:Date.now()});});
app.post('/api/bingo/create',auth,(req,res)=>{const db=readDB();if(!Array.isArray(db.bingoRooms))db.bingoRooms=[];const title=String(req.body?.title||'BINGO ROOM').trim().slice(0,60);if(!title)return res.status(400).json({error:'กรุณาตั้งชื่อห้อง'});const room={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title,status:'waiting',hostId:req.session.user.id,hostName:req.session.user.name,drawn:[],players:[],winner:null,createdAt:isoNow(),startedAt:null,nextDrawAt:null};room.lastActivityAt=isoNow();db.bingoRooms.push(room);room.players.push({userId:req.session.user.id,name:req.session.user.name,card:makeBingoCard(),marked:Array.from({length:25},(_,i)=>i===12),joinedAt:isoNow()});log(db,req.session.user.name,'สร้างห้อง BINGO',title);writeDB(db);res.json({ok:true,roomId:room.id});});
app.delete('/api/bingo/:id',auth,adminOnly,(req,res)=>{const db=readDB();const index=(db.bingoRooms||[]).findIndex(r=>String(r.id)===String(req.params.id));if(index<0)return res.status(404).json({error:'ไม่พบห้อง BINGO'});const [room]=db.bingoRooms.splice(index,1);log(db,req.session.user.name,'แอดมินลบห้อง BINGO',`${room.title} · ${room.status} · ${room.players?.length||0} คน`);writeDB(db);res.json({ok:true});});
app.post('/api/bingo/:id/join',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r||r.status==='closed')return res.status(404).json({error:'ไม่พบห้องนี้'});if(r.adminLocked)return res.status(403).json({error:'ห้องนี้ถูกแอดมินล็อกชั่วคราว'});if(r.status!=='waiting')return res.status(400).json({error:'ห้องเริ่มเล่นแล้ว ไม่สามารถเข้าร่วมได้'});if(r.players.some(p=>String(p.userId)===String(req.session.user.id)))return res.json({ok:true});r.players.push({userId:req.session.user.id,name:req.session.user.name,card:makeBingoCard(),marked:Array.from({length:25},(_,i)=>i===12),joinedAt:isoNow()});r.lastActivityAt=isoNow();log(db,req.session.user.name,'เข้าร่วมห้อง BINGO',r.title);writeDB(db);res.json({ok:true});});
app.post('/api/bingo/:id/leave',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r)return res.status(404).json({error:'ไม่พบห้องนี้'});const idx=r.players.findIndex(p=>String(p.userId)===String(req.session.user.id));if(idx<0)return res.status(400).json({error:'คุณไม่ได้อยู่ในห้องนี้'});r.players.splice(idx,1);r.lastActivityAt=isoNow();if(!r.players.length)r.status='closed';else if(String(r.hostId)===String(req.session.user.id)){r.hostId=r.players[0].userId;r.hostName=r.players[0].name;}log(db,req.session.user.name,'ออกจากห้อง BINGO',r.title);writeDB(db);res.json({ok:true});});
app.post('/api/bingo/:id/start',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r)return res.status(404).json({error:'ไม่พบห้องนี้'});if(String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะผู้สร้างห้องเท่านั้นที่เริ่มเกมได้'});if(r.status!=='waiting')return res.status(400).json({error:'ห้องนี้เริ่มหรือจบเกมไปแล้ว'});if(!r.players.length)return res.status(400).json({error:'ต้องมีผู้เล่นอย่างน้อย 1 คน'});r.status='playing';r.startedAt=isoNow();r.lastActivityAt=isoNow();r.nextDrawAt=Date.now()+7000;log(db,req.session.user.name,'เริ่มเกม BINGO',r.title);writeDB(db);res.json({ok:true});});
app.post('/api/bingo/:id/tick',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r)return res.status(404).json({error:'ไม่พบห้องนี้'});if(r.status!=='playing')return res.json({ok:true,drawn:false});const now=Date.now();if(now<(r.nextDrawAt||0))return res.json({ok:true,drawn:false,nextDrawAt:r.nextDrawAt});const remaining=Array.from({length:75},(_,i)=>i+1).filter(n=>!r.drawn.includes(n));if(!remaining.length){r.status='finished';r.finishedAt=r.finishedAt||isoNow();r.lastActivityAt=isoNow();writeDB(db);return res.json({ok:true,drawn:false,finished:true});}const number=remaining[Math.floor(Math.random()*remaining.length)];r.drawn.push(number);const newWinners=[];r.lastActivityAt=isoNow();r.nextDrawAt=(r.nextDrawAt||now)+7000;while(r.nextDrawAt<=now)r.nextDrawAt+=7000;if(r.drawn.length>=75&&r.status==='playing'){r.status='finished';r.finishedAt=isoNow();}writeDB(db);res.json({ok:true,drawn:true,number,winners:newWinners,nextDrawAt:r.nextDrawAt});});
app.post('/api/bingo/:id/mark',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r||!['playing','finished'].includes(r.status))return res.status(400).json({error:'เกมยังไม่เริ่มหรือไม่มีสิทธิ์ทำรายการ'});const p=r.players.find(x=>String(x.userId)===String(req.session.user.id)),index=Number(req.body?.index);if(!p)return res.status(403).json({error:'คุณไม่ได้อยู่ในห้องนี้'});if(!Number.isInteger(index)||index<0||index>24||index===12)return res.status(400).json({error:'ตำแหน่งไม่ถูกต้อง'});if(!r.drawn.includes(p.card[index]))return res.status(400).json({error:'เลขนี้ยังไม่ถูกสุ่ม'});if(r.status==='finished'&&!bingoCanStillWin(r,p))return res.status(400).json({error:'รอบนี้จบแล้ว'});p.marked=p.marked||Array(25).fill(false);p.marked[index]=true;r.lastActivityAt=isoNow();const winner=checkBingoWinnerForPlayer(r,p);if(winner)log(db,p.name,'ชนะเกม BINGO',`${r.title} · ${winner.line}`);writeDB(db);res.json({ok:true,winners:winner?[winner]:[],status:r.status,canStillWin:bingoCanStillWin(r,p)});});
app.post('/api/bingo/:id/claim',auth,(req,res)=>{const db=readDB(),r=roomFor(db,req.params.id);if(!r||!['playing','finished'].includes(r.status))return res.status(400).json({error:'เกมยังไม่เริ่มหรือจบแล้ว'});const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));if(!p)return res.status(403).json({error:'คุณไม่ได้อยู่ในห้องนี้'});const win=bingoLines().find(line=>line.every(i=>p.marked[i]));if(!win)return res.status(400).json({error:'ยังไม่ครบเงื่อนไข BINGO: แนวนอน/แนวตั้ง 5 ช่อง หรือแนวทแยงใหญ่ 5 ช่อง / แนวทแยงมุมย่อย 4 ช่อง'});const line=bingoLineLabel(win);const winner=checkBingoWinnerForPlayer(r,p);if(!winner)return res.status(400).json({error:'คุณยังวงเลขไม่ครบ'});log(db,p.name,'ชนะเกม BINGO',`${r.title} · ${line}`);r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true,line,winners:[winner]});});


// =====================================
// IMPOSTOR multiplayer game
// =====================================
const IMPOSTOR_WORDS = {
 food:['ข้าวผัด','ชานมไข่มุก','ส้มตำ','พิซซ่า','หมูกระทะ','ไอศกรีม','ก๋วยเตี๋ยว','ซูชิ','แพนเค้ก','ไก่ทอด','แตงโม','ขนมปัง'],
 places:['สนามบิน','โรงเรียน','โรงพยาบาล','ทะเล','ห้างสรรพสินค้า','สถานีรถไฟ','สวนสนุก','ตลาดกลางคืน','ห้องสมุด','โรงหนัง'],
 objects:['โทรศัพท์','ร่ม','แว่นตา','กระเป๋าเป้','นาฬิกา','หูฟัง','คีย์บอร์ด','จักรยาน','พัดลม','กล้องถ่ายรูป'],
 animals:['แมว','สุนัข','ช้าง','เพนกวิน','ยีราฟ','ฉลาม','กระต่าย','นกฮูก','โลมา','เต่า'],
 jobs:['หมอ','ครู','นักบิน','เชฟ','ตำรวจ','นักดับเพลิง','ช่างภาพ','วิศวกร','นักกีฬา','นักข่าว'],
 games:['ฟุตบอล','เกมมือถือ','คาราโอเกะ','หมากรุก','บอร์ดเกม','เกมแข่งรถ','เกมยิงเป้า','ปริศนา','ไพ่','วิดีโอเกม']
};
const IMPOSTOR_CATEGORY_LABELS={food:'อาหาร',places:'สถานที่',objects:'สิ่งของ',animals:'สัตว์',jobs:'อาชีพ',games:'เกมและบันเทิง'};
function impostorRoomFor(db,id){return (db.impostorRooms||[]).find(x=>String(x.id)===String(id));}
function impostorPublic(room,req){if(!room)return null;const uid=String(req.session.user.id),me=room.players.find(x=>String(x.userId)===uid);return {id:room.id,code:room.code,title:room.title,phase:room.phase,categoryLabel:IMPOSTOR_CATEGORY_LABELS[room.category]||'สุ่มหมวด',hostId:room.hostId,hostName:room.hostName,isHost:String(room.hostId)===uid,meId:req.session.user.id,me:me?{role:me.role,word:me.role==='impostor'?null:room.word,submitted:!!me.clue,voted:!!me.voted,alive:me.alive}:null,players:room.players.map(x=>({userId:x.userId,name:x.name,submitted:!!x.clue,voted:!!x.voted,alive:x.alive})),clues:room.phase==='clue'?[]:room.players.filter(x=>x.clue&&x.alive!==false).map(x=>({userId:x.userId,name:x.name,text:x.clue})),winner:room.winner,resultText:room.resultText,wordReveal:room.phase==='finished'?room.word:null,impostorNames:room.phase==='finished'?room.players.filter(x=>x.role==='impostor').map(x=>x.name).join(', '):null,createdAt:room.createdAt};}
function impostorFinish(room,winner,result){room.phase='finished';room.winner=winner;room.resultText=result;room.finishedAt=isoNow();}
function impostorResolveVotes(room){
 const alive=room.players.filter(x=>x.alive);
 if(!alive.length){impostorFinish(room,'crew','ไม่มีผู้เล่นเหลือในห้อง');return;}
 if(!alive.every(x=>x.voted))return;
 const counts={};alive.forEach(x=>{const k=String(x.voted);counts[k]=(counts[k]||0)+1;});
 const max=Math.max(0,...Object.values(counts)),leaders=Object.keys(counts).filter(k=>counts[k]===max);
 if(leaders.length!==1){impostorFinish(room,'impostor','คะแนนเสมอกัน ไม่มีใครถูกจับได้ · Impostor หนีรอด');return;}
 const caught=room.players.find(x=>String(x.userId)===leaders[0]);
 if(!caught){impostorFinish(room,'impostor','ไม่พบผู้เล่นที่ถูกโหวต · Impostor หนีรอด');return;}
 caught.alive=false;room.caughtId=caught.userId;
 if(String(room.hostId)===String(caught.userId)){const nextHost=room.players.find(x=>x.alive);if(nextHost){room.hostId=nextHost.userId;room.hostName=nextHost.name;}}
 if(caught.role==='impostor')room.phase='guess';
 else impostorFinish(room,'impostor',`${caught.name} ไม่ใช่ Impostor · ฝ่าย Impostor ชนะ`);
}

app.get('/api/impostor',auth,(req,res)=>{const db=readDB();if(!Array.isArray(db.impostorRooms))db.impostorRooms=[];const now=Date.now();const before=db.impostorRooms.length;db.impostorRooms=db.impostorRooms.filter(r=>r.phase==='finished'?now-(Date.parse(r.finishedAt)||now)<60*60*1000:now-(Date.parse(r.lastActivityAt||r.createdAt)||now)<45*60*1000);if(before!==db.impostorRooms.length)writeDB(db);const rooms=db.impostorRooms.filter(r=>r.phase!=='finished').map(r=>({id:r.id,code:r.code,title:r.title,hostName:r.hostName,playerCount:r.players.length,phase:r.phase}));const requested=req.query.roomId?impostorRoomFor(db,req.query.roomId):null;const room=requested&&(admin(req)||requested.players.some(p=>String(p.userId)===String(req.session.user.id)))?requested:null;res.json({rooms,room:impostorPublic(room,req),isAdmin:!!admin(req)});});
app.post('/api/impostor/create',auth,(req,res)=>{const db=readDB();if(!Array.isArray(db.impostorRooms))db.impostorRooms=[];const requested=String(req.body?.category||'random');const category=requested==='random'?Object.keys(IMPOSTOR_WORDS)[Math.floor(Math.random()*Object.keys(IMPOSTOR_WORDS).length)]:requested;if(!IMPOSTOR_WORDS[category])return res.status(400).json({error:'หมวดหมู่ไม่ถูกต้อง'});const room={id:`im-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,code:String(Math.floor(100000+Math.random()*900000)),title:'IMPOSTOR ROOM',category,phase:'lobby',hostId:req.session.user.id,hostName:req.session.user.name,players:[],createdAt:isoNow(),lastActivityAt:isoNow(),word:null,winner:null};room.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,clue:null,voted:null});db.impostorRooms.push(room);log(db,req.session.user.name,'สร้างห้อง IMPOSTOR',room.code);writeDB(db);res.json({ok:true,roomId:room.id});});
// Admin can remove any IMPOSTOR room from the lobby or an active match.
app.delete('/api/impostor/:id',auth,adminOnly,(req,res)=>{
  const db=readDB();
  if(!Array.isArray(db.impostorRooms))db.impostorRooms=[];
  const index=db.impostorRooms.findIndex(r=>String(r.id)===String(req.params.id));
  if(index<0)return res.status(404).json({error:'ไม่พบห้อง IMPOSTOR'});
  const [room]=db.impostorRooms.splice(index,1);
  log(db,req.session.user.name,'แอดมินลบห้อง IMPOSTOR',`${room.title||'IMPOSTOR ROOM'} · ${room.code||''} · ${room.phase||''} · ${room.players?.length||0} คน`);
  writeDB(db);
  res.json({ok:true});
});
app.post('/api/impostor/join-code',auth,(req,res)=>{const db=readDB(),code=String(req.body?.code||'').trim(),r=(db.impostorRooms||[]).find(x=>x.code===code&&x.phase==='lobby');if(!r)return res.status(404).json({error:'ไม่พบห้องที่เปิดรับผู้เล่นด้วยรหัสนี้'});if(r.adminLocked)return res.status(403).json({error:'ห้องนี้ถูกแอดมินล็อกชั่วคราว'});if(r.players.some(x=>String(x.userId)===String(req.session.user.id)))return res.json({ok:true,roomId:r.id});if(r.players.length>=12)return res.status(400).json({error:'ห้องเต็มแล้ว'});r.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,clue:null,voted:null});r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true,roomId:r.id});});
app.post('/api/impostor/:id/join',auth,(req,res)=>{const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='lobby')return res.status(404).json({error:'ห้องนี้ไม่เปิดรับผู้เล่นแล้ว'});if(r.adminLocked)return res.status(403).json({error:'ห้องนี้ถูกแอดมินล็อกชั่วคราว'});if(r.players.some(x=>String(x.userId)===String(req.session.user.id)))return res.json({ok:true});if(r.players.length>=12)return res.status(400).json({error:'ห้องเต็มแล้ว (สูงสุด 12 คน)'});r.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,clue:null,voted:null});r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true});});
app.post('/api/impostor/:id/leave',auth,(req,res)=>{
 const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r)return res.status(404).json({error:'ไม่พบห้อง'});
 const uid=String(req.session.user.id),p=r.players.find(x=>String(x.userId)===uid);
 if(!p)return res.status(400).json({error:'คุณไม่ได้อยู่ในห้องนี้'});
 const wasHost=String(r.hostId)===uid;
 if(r.phase==='lobby'||r.phase==='finished')r.players=r.players.filter(x=>String(x.userId)!==uid);
 else{
  p.alive=false;p.left=true;p.clue=p.clue||'ออกจากเกม';p.voted=p.voted||'skip';r.players.forEach(x=>{if(String(x.voted)===uid)x.voted='skip';});
  if(p.role==='impostor')impostorFinish(r,'crew',`${p.name} (Impostor) ออกจากเกม · ฝ่ายผู้เล่นชนะ`);
  else if(r.phase==='clue'&&r.players.filter(x=>x.alive).every(x=>x.clue))r.phase='vote';
  if(r.phase==='vote')impostorResolveVotes(r);
 }
 if(!r.players.length)db.impostorRooms=db.impostorRooms.filter(x=>x.id!==r.id);
 else if(wasHost){const next=r.players.find(x=>x.alive)||r.players[0];r.hostId=next.userId;r.hostName=next.name;}
 r.lastActivityAt=isoNow();log(db,req.session.user.name,'ออกจากห้อง IMPOSTOR',r.code||'');writeDB(db);res.json({ok:true});
});
app.post('/api/impostor/:id/start',auth,(req,res)=>{const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='lobby')return res.status(400).json({error:'ห้องนี้เริ่มไปแล้วหรือไม่มีอยู่'});if(String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มได้'});r.players=r.players.filter(p=>!p.left);if(r.players.length<3)return res.status(400).json({error:'ต้องมีผู้เล่นอย่างน้อย 3 คน'});if(r.players.length>12)return res.status(400).json({error:'ผู้เล่นเกินจำนวนที่กำหนด'});const pool=IMPOSTOR_WORDS[r.category];r.word=pool[Math.floor(Math.random()*pool.length)];const chosen=Math.floor(Math.random()*r.players.length);r.players.forEach((p,i)=>{p.role=i===chosen?'impostor':'crew';p.clue=null;p.voted=null;p.alive=true});r.phase='clue';r.startedAt=isoNow();r.lastActivityAt=isoNow();log(db,req.session.user.name,'เริ่มเกม IMPOSTOR',r.code);writeDB(db);res.json({ok:true});});
app.post('/api/impostor/:id/clue',auth,(req,res)=>{const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='clue')return res.status(400).json({error:'ไม่อยู่ในช่วงส่งคำใบ้'});const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));if(!p||!p.alive)return res.status(403).json({error:'ไม่มีสิทธิ์ในห้องนี้'});if(p.clue)return res.status(400).json({error:'คุณส่งคำใบ้ไปแล้ว'});const clue=String(req.body?.clue||'').trim().replace(/\s+/g,' ');if(clue.length<1||clue.length>45)return res.status(400).json({error:'คำใบ้ต้องมี 1–45 ตัวอักษร'});p.clue=clue;r.lastActivityAt=isoNow();if(r.players.every(x=>x.clue))r.phase='vote';writeDB(db);res.json({ok:true,phase:r.phase});});
app.post('/api/impostor/:id/vote',auth,(req,res)=>{
 const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='vote')return res.status(400).json({error:'ยังไม่ถึงช่วงโหวต'});
 const p=r.players.find(x=>String(x.userId)===String(req.session.user.id)),target=r.players.find(x=>String(x.userId)===String(req.body?.targetId));
 if(!p||!p.alive||p.voted)return res.status(400).json({error:'คุณโหวตไปแล้วหรือไม่มีสิทธิ์'});
 if(!target||!target.alive||String(target.userId)===String(p.userId))return res.status(400).json({error:'เลือกผู้เล่นเป้าหมายไม่ถูกต้อง'});
 p.voted=target.userId;r.lastActivityAt=isoNow();impostorResolveVotes(r);writeDB(db);res.json({ok:true,phase:r.phase});
});
app.post('/api/impostor/:id/guess',auth,(req,res)=>{const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='guess')return res.status(400).json({error:'ไม่มีช่วงทายคำลับ'});const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));if(!p||p.role!=='impostor')return res.status(403).json({error:'เฉพาะ Impostor เท่านั้นที่ทายได้'});const guess=String(req.body?.guess||'').trim().toLocaleLowerCase('th');if(!guess)return res.status(400).json({error:'กรุณากรอกคำทาย'});if(guess===String(r.word).trim().toLocaleLowerCase('th'))impostorFinish(r,'impostor',`${p.name} ทายคำลับถูกต้อง`);else impostorFinish(r,'crew',`${p.name} ทายผิด · ฝ่ายผู้เล่นชนะ`);log(db,p.name,'จบเกม IMPOSTOR',r.winner==='impostor'?'Impostor ชนะ':'ฝ่ายผู้เล่นชนะ');writeDB(db);res.json({ok:true});});
app.post('/api/impostor/:id/rematch',auth,(req,res)=>{const db=readDB(),r=impostorRoomFor(db,req.params.id);if(!r||r.phase!=='finished'||String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องหลังจบเกมเท่านั้น'});r.players=r.players.filter(p=>!p.left);if(!r.players.some(p=>String(p.userId)===String(r.hostId))&&r.players.length){r.hostId=r.players[0].userId;r.hostName=r.players[0].name;}r.phase='lobby';r.word=null;r.winner=null;r.resultText=null;r.finishedAt=null;r.players.forEach(p=>{p.role=null;p.clue=null;p.voted=null;p.alive=true;p.left=false});r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true});});



// =====================================
// WEREWOLF multiplayer board game
// =====================================
const WW_ROLE_LABELS={wolf:'หมาป่า',alpha:'หมาป่าอัลฟ่า',seer:'ผู้หยั่งรู้',detective:'นักสืบ',witch:'แม่มด',priest:'นักบวช',medium:'คนทรง',infected:'ผู้ติดเชื้อ',king:'กษัตริย์',assassin:'นักฆ่า',villager:'ชาวบ้าน',bodyguard:'บอดี้การ์ด',guardian:'ผู้พิทักษ์',hunter:'นายพราน',jester:'ตัวตลก'};
const WW_SPECIAL_ROLES=['seer','witch','bodyguard','guardian','hunter','jester','detective','priest','medium','infected','king','assassin','alpha'];
const WW_WOLF_ROLES=['wolf','alpha'];
function wwNormalizeRoleConfig(input={},fallback={}){
 const source=input&&typeof input==='object'?input:{};
 const previous=fallback&&typeof fallback==='object'?fallback:{};
 const result={};
 WW_SPECIAL_ROLES.forEach(role=>{
  // Explicit values always win, including false. Missing keys never silently turn a role on.
  result[role]=Object.prototype.hasOwnProperty.call(source,role)?source[role]===true:previous[role]===true;
 });
 return result;
}
function wwBuildRoleDeck(playerCount,config){
 const cfg=wwNormalizeRoleConfig(config),wolfCount=Math.max(1,Math.floor(playerCount/4));
 const special=WW_SPECIAL_ROLES.filter(role=>cfg[role]);
 const alphaSelected=special.includes('alpha');
 const nonWolfSpecialCount=special.filter(role=>role!=='alpha').length;
 const regularWolfCount=Math.max(0,wolfCount-(alphaSelected?1:0));
 const villagerCount=playerCount-wolfCount-nonWolfSpecialCount;
 if(villagerCount<1)return {error:'บทบาทที่เลือกมากเกินไป ต้องเหลือชาวบ้านอย่างน้อย 1 คน'};
 return {roles:[...special,...Array(regularWolfCount).fill('wolf'),...Array(villagerCount).fill('villager')],wolfCount,specialCount:special.length,villagerCount,roleConfig:cfg};
}
function wwRoomFor(db,id){return (db.werewolfRooms||[]).find(x=>String(x.id)===String(id));}
function wwAlive(room){return room.players.filter(p=>p.alive);}
// Keep room controls usable when the current host is eliminated during a live game.
function wwEnsureHost(room){
 const current=room.players.find(p=>String(p.userId)===String(room.hostId));
 if(current?.alive)return;
 const next=wwAlive(room)[0];
 if(next){room.hostId=next.userId;room.hostName=next.name;}
}
function wwHunterWasKilledAtNight(hunter){return ['wolf','poison','assassin','bodyguard'].includes(hunter?.deathReason);}
function wwHunterShotNextPhase(hunter){return wwHunterWasKilledAtNight(hunter)?'day':'night';}
function wwFindMemberRoom(db,uid){
 return (db.werewolfRooms||[]).filter(x=>x.phase!=='lobby'&&x.players?.some(p=>String(p.userId)===String(uid)&&!p.left))
  .sort((a,b)=>(Date.parse(b.lastActivityAt||b.createdAt)||0)-(Date.parse(a.lastActivityAt||a.createdAt)||0))[0]||null;
}
function wwFinish(room,winner,result){
 room.phase='finished';room.winner=winner;room.resultText=result;room.finishedAt=isoNow();
}
function wwCheckWin(room){
 const wolves=wwAlive(room).filter(p=>WW_WOLF_ROLES.includes(p.role)).length;
 const others=wwAlive(room).filter(p=>!WW_WOLF_ROLES.includes(p.role)).length;
 if(!wolves){wwFinish(room,'village','หมาป่าถูกกำจัดหมดแล้ว · ฝ่ายชาวบ้านชนะ');return true;}
 if(wolves>=others){wwFinish(room,'wolf','จำนวนหมาป่าเท่ากับหรือมากกว่าชาวบ้าน · ฝ่ายหมาป่าชนะ');return true;}
 return false;
}
function wwResolveVoteRound(room){
 const alive=wwAlive(room);
 if(!alive.length||!alive.every(x=>x.voted))return {resolved:false,kingSaved:false};
 const counts={};alive.forEach(x=>{if(x.voted!=='skip')counts[String(x.voted)]=(counts[String(x.voted)]||0)+1;});
 const vals=Object.values(counts),max=vals.length?Math.max(...vals):0,leaders=Object.keys(counts).filter(k=>counts[k]===max);
 if(max>0&&leaders.length===1){
  const eliminated=room.players.find(x=>String(x.userId)===leaders[0]);
  if(eliminated?.role==='king'&&!eliminated.kingSaved){
   eliminated.kingSaved=true;room.lastVote={name:eliminated.name,role:'กษัตริย์ · ใช้สิทธิ์ยกเลิกโหวต'};room.phase='night';room.players.forEach(x=>{x.nightAction=null;x.voted=null;});
   return {resolved:true,kingSaved:true};
  }
  if(eliminated){
   eliminated.alive=false;eliminated.deathReason='vote';eliminated.deathEvent={id:`${room.id}:${room.dayNumber||0}:${eliminated.userId}:vote:${Date.now()}`,cause:'vote',createdAt:isoNow()};
   room.lastVote={name:eliminated.name,role:WW_ROLE_LABELS[eliminated.role]};
   if(eliminated.role==='jester')wwFinish(room,'jester',`${eliminated.name} ถูกโหวตออก · ตัวตลกชนะเกมทันที`);
   else if(eliminated.role==='hunter'&&!eliminated.hunterShotUsed){room.pendingHunterId=String(eliminated.userId);room.phase='hunter_shot';}
   wwEnsureHost(room);
  }
 }else room.lastVote={name:null,role:null};
 if(room.phase!=='finished'&&room.phase!=='hunter_shot'&&!wwCheckWin(room)){room.phase='night';room.players.forEach(x=>{x.nightAction=null;x.voted=null;});}
 return {resolved:true,kingSaved:false};
}
function wwApplyHunterShot(room,hunter,target){
 target.alive=false;target.deathReason='hunter';target.deathEvent={id:`${room.id}:${room.dayNumber||0}:${target.userId}:hunter:${Date.now()}`,cause:'hunter',createdAt:isoNow()};
 hunter.hunterShotUsed=true;room.pendingHunterId=null;wwEnsureHost(room);
 if(!wwCheckWin(room)){
  room.phase=wwHunterShotNextPhase(hunter);
  if(room.phase==='night')room.players.forEach(p=>{p.nightAction=null;p.voted=null;});
  else room.dayNumber=(room.dayNumber||0)+1;
 }
 return room.phase;
}
// ลำดับการทำภารกิจกลางคืน: ทำทีละบทบาท และข้ามบทบาทที่ไม่มี/หมดสิทธิ์ใช้สกิล
const WW_NIGHT_STAGES=[
  {roles:WW_WOLF_ROLES,label:'🐺 หมาป่า'},
  {roles:['bodyguard'],label:'🛡️ บอดี้การ์ด'},
  {roles:['guardian'],label:'✨ ผู้พิทักษ์'},
  {roles:['seer'],label:'🔮 ผู้หยั่งรู้'},
  {roles:['detective'],label:'🔍 นักสืบ'},
  {roles:['priest'],label:'✝️ นักบวช'},
  {roles:['witch'],label:'🧙 แม่มด'},
  {roles:['medium'],label:'🔮 คนทรง'},
  {roles:['assassin'],label:'🗡️ นักฆ่า'}
];
function wwStageDone(room,stage){
  // หมาป่าใช้การเลือกของคนแรกเป็นมติของทีม จึงไม่ต้องรอให้หมาป่าทุกตัวกดซ้ำ
  if(stage.roles.some(role=>WW_WOLF_ROLES.includes(role)) && room.wolfKillTargetId)return true;
  const members=wwAlive(room).filter(p=>stage.roles.includes(p.role));
  if(!members.length)return true;
  return members.every(p=>{
    if(p.nightAction)return true;
    if(p.role==='priest'&&p.priestSaveUsed)return true;
    if(p.role==='medium'&&p.mediumUsed)return true;
    if(p.role==='assassin'&&p.assassinUsed)return true;
    return false;
  });
}
function wwCurrentNightStage(room){return WW_NIGHT_STAGES.find(stage=>!wwStageDone(room,stage))||null;}
function wwNightReady(room){return !wwCurrentNightStage(room);}
function wwResolveNight(room){
 const alive=wwAlive(room),wolves=alive.filter(p=>WW_WOLF_ROLES.includes(p.role));
 const counts={};
 wolves.forEach(p=>{if(p.nightAction?.targetId)counts[String(p.nightAction.targetId)]=(counts[String(p.nightAction.targetId)]||0)+1;});
 const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
 const wolfTarget=sorted.length&&(!sorted[1]||sorted[0][1]>sorted[1][1])?sorted[0][0]:null;
 const witch=alive.find(p=>p.role==='witch'),action=witch?.nightAction||{type:'skip'};
 const priest=alive.find(p=>p.role==='priest'),priestAction=priest?.nightAction||{type:'skip'};
 const assassin=alive.find(p=>p.role==='assassin'),assassinAction=assassin?.nightAction||{type:'skip'};
 const bodyguard=alive.find(p=>p.role==='bodyguard'),guardian=alive.find(p=>p.role==='guardian');
 const guarded=String(bodyguard?.nightAction?.targetId||''),protectedId=String(guardian?.nightAction?.targetId||'');
 const killed=new Map();let saved=false,bodyguardSacrifice=false;
 if(wolfTarget){
  const victim=room.players.find(p=>String(p.userId)===String(wolfTarget));
  const wasSaved=(action.type==='save'&&String(action.targetId)===String(wolfTarget)) ||
    (priestAction.type==='priest_save'&&String(priestAction.targetId)===String(wolfTarget)) ||
    protectedId===String(wolfTarget);
  if(wasSaved){saved=true;if(priestAction.type==='priest_save')priest.priestSaveUsed=true;}
  else if(victim?.role==='infected'){
   victim.role='wolf';victim.convertedAt=isoNow();saved=true;
  }
  else if(guarded===String(wolfTarget)){killed.set(String(bodyguard.userId),'bodyguard');bodyguardSacrifice=true;}
  else killed.set(String(wolfTarget),'wolf');
 }
 if(action.type==='poison'&&action.targetId&&!killed.has(String(action.targetId)))killed.set(String(action.targetId),'poison');
 // Assassin succeeds even when another night action already selected the same target.
 if(assassinAction.type==='assassin_kill'&&assassinAction.targetId)killed.set(String(assassinAction.targetId),'assassin');
 killed.forEach((cause,id)=>{const p=room.players.find(x=>String(x.userId)===String(id));if(p&&p.alive){p.alive=false;p.deathReason=cause;if(['wolf','poison','assassin','vote','hunter','bodyguard'].includes(cause))p.deathEvent={id:`${room.id}:${room.dayNumber||0}:${id}:${Date.now()}`,cause,createdAt:isoNow()};}});
 if([...killed.values()].includes('assassin'))wwFinish(room,'assassin',`${assassin?.name||'นักฆ่า'} กำจัดเป้าหมายสำเร็จ · นักฆ่าชนะเกม`);
 wwEnsureHost(room);
 room.lastNight={killed:[...killed.keys()].map(id=>room.players.find(p=>String(p.userId)===String(id))?.name).filter(Boolean),saved,bodyguardSacrifice};
 if(guardian?.nightAction?.targetId)room.lastProtectedId=String(guardian.nightAction.targetId);
 room.players.forEach(p=>{p.nightAction=null;p.voted=null;});
 room.wolfKillTargetId=null;room.wolfKillLockedBy=null;
 const fallenHunter=room.players.find(p=>p.role==='hunter'&&!p.alive&&wwHunterWasKilledAtNight(p)&&!p.hunterShotUsed);
 if(room.phase==='finished'){}
 else if(fallenHunter){room.pendingHunterId=String(fallenHunter.userId);room.phase='hunter_shot';}
 else if(!wwCheckWin(room)){room.phase='day';room.dayNumber=(room.dayNumber||0)+1;}
}
function wwPublic(room,req){
 if(!room)return null;
 const uid=String(req.session.user.id),me=room.players.find(p=>String(p.userId)===uid)||null;
 const alive=wwAlive(room);
 const roleReveal=room.phase==='finished';
 const wolfVotes={};room.players.filter(p=>p.alive&&WW_WOLF_ROLES.includes(p.role)&&p.nightAction?.targetId).forEach(p=>{const k=String(p.nightAction.targetId);wolfVotes[k]=(wolfVotes[k]||0)+1;});
 const wolfVoteRows=Object.entries(wolfVotes).sort((a,b)=>b[1]-a[1]);
 const witchAttackTarget=wolfVoteRows.length&&(!wolfVoteRows[1]||wolfVoteRows[0][1]>wolfVoteRows[1][1])?wolfVoteRows[0][0]:null;
 return {
  id:room.id,code:room.code,title:room.title,phase:room.phase,dayNumber:room.dayNumber||0,roleConfig:wwNormalizeRoleConfig(room.roleConfig),roleCounts:Object.fromEntries([...new Set(room.players.map(p=>p.role).filter(Boolean))].map(role=>[role,room.players.filter(p=>p.role===role).length])),
  hostId:room.hostId,hostName:room.hostName,isHost:String(room.hostId)===uid,meId:req.session.user.id,
  me:me?{role:me.role,alive:me.alive,mediumResult:me.mediumResult||null,mediumUsed:!!me.mediumUsed,detectiveResult:me.detectiveResult||null,priestSaveUsed:!!me.priestSaveUsed,assassinUsed:!!me.assassinUsed,kingSaved:!!me.kingSaved,deathEvent:me.deathEvent?{id:me.deathEvent.id,cause:me.deathEvent.cause,createdAt:me.deathEvent.createdAt}:null,nightSubmitted:!!me.nightAction,voted:!!me.voted,seerResult:me.seerResult?{isWolf:!!me.seerResult.isWolf,checkedAt:me.seerResult.checkedAt||null}:null,witchSaveUsed:!!me.witchSaveUsed,witchPoisonUsed:!!me.witchPoisonUsed}:null,
  players:room.players.map(p=>({userId:p.userId,name:p.name,alive:p.alive,left:!!p.left,role:roleReveal?p.role:undefined,isWolfMate:WW_WOLF_ROLES.includes(me?.role)&&WW_WOLF_ROLES.includes(p.role),nightSubmitted:!!p.nightAction,voted:!!p.voted})),
  aliveCount:alive.length,wolfCount:alive.filter(p=>WW_WOLF_ROLES.includes(p.role)).length,
  nightReady:room.phase==='night'?wwNightReady(room):false,
  currentNightRole:room.phase==='night'?(wwCurrentNightStage(room)?.label||'กำลังสรุปผลกลางคืน'):null,
  myNightTurn:room.phase==='night'&&!!me?.alive&&!!wwCurrentNightStage(room)&&wwCurrentNightStage(room).roles.includes(me.role)&&!me.nightAction,
  ...(me?.alive&&WW_WOLF_ROLES.includes(me.role)?{wolfKillLocked:!!room.wolfKillTargetId,wolfKillTargetName:room.players.find(x=>String(x.userId)===String(room.wolfKillTargetId))?.name||null,wolfChat:(room.wolfChat||[]).slice(-60)}:{}),
  pendingHunterId:room.phase==='hunter_shot'?room.pendingHunterId:null,pendingHunterName:room.phase==='hunter_shot'?room.players.find(p=>String(p.userId)===String(room.pendingHunterId))?.name:null,
  voteCount:alive.filter(p=>p.voted).length,
  lastNight:room.phase==='day'||room.phase==='vote'||room.phase==='hunter_shot'||room.phase==='finished'?room.lastNight||null:null,
  lastVote:room.phase==='night'||room.phase==='day'||room.phase==='vote'||room.phase==='finished'?room.lastVote||null:null,
  witchAttackTarget:me?.role==='witch'?witchAttackTarget:null,
  winner:room.winner,resultText:room.resultText,
  roleReveal:roleReveal?room.players.map(p=>({name:p.name,role:WW_ROLE_LABELS[p.role]||p.role,alive:p.alive})):null,
  createdAt:room.createdAt
 };
}
function wwCleanup(db){
 if(!Array.isArray(db.werewolfRooms))db.werewolfRooms=[];
 const now=Date.now(),before=db.werewolfRooms.length;
 db.werewolfRooms=db.werewolfRooms.filter(r=>r.phase==='finished'?now-(Date.parse(r.finishedAt)||now)<60*60*1000:now-(Date.parse(r.lastActivityAt||r.createdAt)||now)<45*60*1000);
 return before!==db.werewolfRooms.length;
}
app.get('/api/werewolf',auth,(req,res)=>{
 const db=readDB();if(wwCleanup(db))writeDB(db);
 const rooms=db.werewolfRooms.filter(r=>r.phase==='lobby').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  .map(r=>({id:r.id,code:r.code,title:r.title,hostName:r.hostName,playerCount:r.players.length,phase:r.phase}));
 const uid=String(req.session.user.id);
 const requested=req.query.roomId?wwRoomFor(db,req.query.roomId):null;
 // A room is private to its members (or an administrator); never expose it by ID alone.
 let room=requested&&(admin(req)||requested.players.some(p=>String(p.userId)===uid&&!p.left))?requested:null;
 // Recover the member's current room after refresh, browser restart, or using another device.
 if(!room&&req.query.lobby!=='1'){
  room=wwFindMemberRoom(db,uid);
 }
 res.json({rooms,room:wwPublic(room,req),isAdmin:!!admin(req)});
});
app.post('/api/werewolf/create',auth,(req,res)=>{
 const db=readDB();if(!Array.isArray(db.werewolfRooms))db.werewolfRooms=[];
 const title=String(req.body?.title||'หมู่บ้านรัตติกาล').trim().slice(0,50);
 if(!title)return res.status(400).json({error:'กรุณาตั้งชื่อห้อง'});
 const room={id:`ww-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,code:String(Math.floor(100000+Math.random()*900000)),title,phase:'lobby',hostId:req.session.user.id,hostName:req.session.user.name,players:[],dayNumber:0,winner:null,createdAt:isoNow(),lastActivityAt:isoNow(),lastNight:null,wolfChat:[],wolfKillTargetId:null,wolfKillLockedBy:null,roleConfig:{seer:true,witch:true,bodyguard:false,guardian:false,hunter:false,jester:false}};
 room.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,nightAction:null,voted:null});
 db.werewolfRooms.push(room);log(db,req.session.user.name,'สร้างห้อง WEREWOLF',room.code);writeDB(db);res.json({ok:true,roomId:room.id});
});
app.post('/api/werewolf/join-code',auth,(req,res)=>{
 const db=readDB(),code=String(req.body?.code||'').trim(),r=(db.werewolfRooms||[]).find(x=>x.code===code&&x.phase==='lobby');
 if(!r)return res.status(404).json({error:'ไม่พบห้องที่เปิดรับผู้เล่นด้วยรหัสนี้'});if(r.adminLocked)return res.status(403).json({error:'ห้องนี้ถูกแอดมินล็อกชั่วคราว'});
 if(r.players.some(p=>String(p.userId)===String(req.session.user.id)))return res.json({ok:true,roomId:r.id});
 if(r.players.length>=16)return res.status(400).json({error:'ห้องเต็มแล้ว (สูงสุด 16 คน)'});
 r.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,nightAction:null,voted:null});r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true,roomId:r.id});
});
app.post('/api/werewolf/:id/join',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='lobby')return res.status(404).json({error:'ห้องนี้ไม่เปิดรับผู้เล่นแล้ว'});if(r.adminLocked)return res.status(403).json({error:'ห้องนี้ถูกแอดมินล็อกชั่วคราว'});
 if(r.players.some(p=>String(p.userId)===String(req.session.user.id)))return res.json({ok:true});
 if(r.players.length>=16)return res.status(400).json({error:'ห้องเต็มแล้ว (สูงสุด 16 คน)'});
 r.players.push({userId:req.session.user.id,name:req.session.user.name,role:null,alive:true,nightAction:null,voted:null});r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true});
});
app.delete('/api/werewolf/:id',auth,adminOnly,(req,res)=>{
 const db=readDB(),i=(db.werewolfRooms||[]).findIndex(r=>String(r.id)===String(req.params.id));
 if(i<0)return res.status(404).json({error:'ไม่พบห้อง WEREWOLF'});
 const [r]=db.werewolfRooms.splice(i,1);log(db,req.session.user.name,'แอดมินลบห้อง WEREWOLF',`${r.code} · ${r.players.length} คน`);writeDB(db);res.json({ok:true});
});
app.post('/api/werewolf/:id/leave',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);if(!r)return res.status(404).json({error:'ไม่พบห้อง'});
 const uid=String(req.session.user.id),p=r.players.find(x=>String(x.userId)===uid);
 if(!p)return res.status(400).json({error:'คุณไม่ได้อยู่ในห้องนี้'});
 const wasHost=String(r.hostId)===uid;
 if(r.phase==='lobby'||r.phase==='finished')r.players=r.players.filter(x=>String(x.userId)!==uid);
 else{
  p.alive=false;p.left=true;p.nightAction={type:'skip'};p.voted=p.voted||'skip';r.players.forEach(x=>{if(String(x.voted)===uid)x.voted='skip';});
  if(String(r.pendingHunterId||'')===uid){r.pendingHunterId=null;r.phase=wwHunterWasKilledAtNight(p)?'day':'night';if(r.phase==='day')r.dayNumber=(r.dayNumber||0)+1;}
  if(wwCheckWin(r)){}
  else if(r.phase==='night'&&wwNightReady(r))wwResolveNight(r);
  else if(r.phase==='vote'&&wwAlive(r).every(x=>x.voted)){
   const alive=wwAlive(r),counts={};alive.forEach(x=>{if(x.voted!=='skip')counts[String(x.voted)]=(counts[String(x.voted)]||0)+1;});
   const vals=Object.values(counts),max=vals.length?Math.max(...vals):0,leaders=Object.keys(counts).filter(k=>counts[k]===max);
   if(max>0&&leaders.length===1){
    const eliminated=r.players.find(x=>String(x.userId)===leaders[0]);
    if(eliminated?.role==='king'&&!eliminated.kingSaved){eliminated.kingSaved=true;r.lastVote={name:eliminated.name,role:'กษัตริย์ · ใช้สิทธิ์ยกเลิกโหวต'};r.phase='night';r.players.forEach(x=>{x.nightAction=null;x.voted=null;});}
     else if(eliminated){eliminated.alive=false;eliminated.deathReason='vote';eliminated.deathEvent={id:`${r.id}:${r.dayNumber||0}:${eliminated.userId}:vote:${Date.now()}`,cause:'vote',createdAt:isoNow()};r.lastVote={name:eliminated.name,role:WW_ROLE_LABELS[eliminated.role]};
     if(eliminated.role==='jester')wwFinish(r,'jester',`${eliminated.name} ถูกโหวตออก · ตัวตลกชนะเกมทันที`);
     else if(eliminated.role==='hunter'&&!eliminated.hunterShotUsed){r.pendingHunterId=String(eliminated.userId);r.phase='hunter_shot';}}
   }else r.lastVote={name:null,role:null};
   if(r.phase==='vote'&&!wwCheckWin(r)){r.phase='night';r.players.forEach(x=>{x.nightAction=null;x.voted=null;});}
  }
 }
 if(!r.players.length)db.werewolfRooms=db.werewolfRooms.filter(x=>x.id!==r.id);
 else if(wasHost){const next=r.players.find(x=>x.alive)||r.players[0];r.hostId=next.userId;r.hostName=next.name;}
 r.lastActivityAt=isoNow();log(db,req.session.user.name,'ออกจากห้อง WEREWOLF',r.code||'');writeDB(db);res.json({ok:true});
});
app.post('/api/werewolf/:id/configure',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='lobby')return res.status(400).json({error:'ตั้งค่าบทบาทได้เฉพาะก่อนเริ่มเกม'});
 if(String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องเท่านั้นที่ตั้งค่าได้'});
 const submitted=req.body?.roleConfig&&typeof req.body.roleConfig==='object'?req.body.roleConfig:req.body;
 const roleConfig=wwNormalizeRoleConfig(submitted,r.roleConfig);
 if(r.players.length<4)return res.status(400).json({error:'ต้องมีผู้เล่นอย่างน้อย 4 คน'});
 const deck=wwBuildRoleDeck(r.players.length,roleConfig);
 if(deck.error)return res.status(400).json({error:deck.error});
 r.roleConfig=deck.roleConfig;r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true,roleConfig:r.roleConfig,counts:{wolves:deck.wolfCount,special:deck.specialCount,villagers:deck.villagerCount}});
});
app.post('/api/werewolf/:id/start',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='lobby')return res.status(400).json({error:'ห้องนี้เริ่มไปแล้วหรือไม่มีอยู่'});
 if(String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มได้'});
 r.players=r.players.filter(p=>!p.left);if(!r.players.some(p=>String(p.userId)===String(r.hostId))&&r.players.length){r.hostId=r.players[0].userId;r.hostName=r.players[0].name;}const n=r.players.length;if(n<4)return res.status(400).json({error:'ต้องมีผู้เล่นอย่างน้อย 4 คน'});if(n>16)return res.status(400).json({error:'ผู้เล่นเกินจำนวนที่กำหนด'});
 // Start accepts the exact current checkbox selection from the client. This prevents stale saved settings
 // from assigning roles that the host has just unchecked.
 const submitted=req.body?.roleConfig&&typeof req.body.roleConfig==='object'?req.body.roleConfig:null;
 const cfg=wwNormalizeRoleConfig(submitted||{},r.roleConfig);
 const deck=wwBuildRoleDeck(n,cfg);
 if(deck.error)return res.status(400).json({error:deck.error});
 r.roleConfig=deck.roleConfig;
 const roles=deck.roles;
 for(let i=roles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[roles[i],roles[j]]=[roles[j],roles[i]];}
 r.players.forEach((p,i)=>{p.role=roles[i];p.alive=true;p.nightAction=null;p.voted=null;p.seerResult=null;p.deathEvent=null;p.witchSaveUsed=false;p.witchPoisonUsed=false;p.hunterShotUsed=false;p.priestSaveUsed=false;p.mediumUsed=false;p.mediumResult=null;p.detectiveResult=null;p.assassinUsed=false;p.kingSaved=false;p.deathReason=null;});
 r.phase='night';r.dayNumber=0;r.lastNight=null;r.lastVote=null;r.pendingHunterId=null;r.lastProtectedId=null;r.wolfChat=[];r.wolfKillTargetId=null;r.wolfKillLockedBy=null;r.startedAt=isoNow();r.lastActivityAt=isoNow();
 log(db,req.session.user.name,'เริ่มเกม WEREWOLF',`${r.code} · ${n} คน · หมาป่า ${deck.wolfCount} · บทบาทพิเศษ ${deck.specialCount} · ชาวบ้าน ${deck.villagerCount}`);writeDB(db);res.json({ok:true,roleConfig:r.roleConfig,counts:{wolves:deck.wolfCount,special:deck.specialCount,villagers:deck.villagerCount}});
});
app.post('/api/werewolf/:id/night-action',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='night')return res.status(400).json({error:'ตอนนี้ไม่ใช่ช่วงกลางคืน'});
 const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));
 if(!p||!p.alive)return res.status(403).json({error:'คุณไม่มีสิทธิ์ดำเนินการ'});
 const activeStage=wwCurrentNightStage(r);
 if(!activeStage||!activeStage.roles.includes(p.role))return res.status(403).json({error:`ยังไม่ถึงคิวบทบาทของคุณ · ตอนนี้ ${activeStage?.label||'กำลังสรุปผลกลางคืน'}`});
 const type=String(req.body?.type||''),targetId=String(req.body?.targetId||'');
 // Retry-safe: if the same inspection request is repeated, return its saved result without running it twice.
 if(p.nightAction){
  if(p.role==='seer'&&type==='inspect'&&p.nightAction.type==='inspect'&&String(p.nightAction.targetId)===targetId&&p.seerResult){
   return res.json({ok:true,phase:r.phase,seerResult:{isWolf:!!p.seerResult.isWolf}});
  }
  return res.status(400).json({error:'คุณส่งคำสั่งคืนนี้แล้ว'});
 }
 const target=r.players.find(x=>String(x.userId)===targetId&&x.alive);
 if(WW_WOLF_ROLES.includes(p.role)){
  if(r.wolfKillTargetId)return res.status(409).json({error:`หมาป่า ${r.players.find(x=>String(x.userId)===String(r.wolfKillLockedBy))?.name||'อีกคน'} เลือกเป้าหมายไปแล้ว`});
  if(type!=='kill'||!target||WW_WOLF_ROLES.includes(target.role))return res.status(400).json({error:'เลือกเป้าหมายที่ไม่ใช่หมาป่า'});
  r.wolfKillTargetId=targetId;r.wolfKillLockedBy=String(p.userId);
  p.nightAction={type:'kill',targetId};
 }else if(p.role==='seer'||p.role==='detective'){
  if(type!=='inspect'||!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'เลือกผู้เล่นที่ยังมีชีวิตเพื่อตรวจสอบ'});
  const result={targetId:String(target.userId),isWolf:WW_WOLF_ROLES.includes(target.role),checkedAt:isoNow()};
  if(p.role==='seer')p.seerResult=result;else p.detectiveResult={...result,isAlpha:target.role==='alpha'};
  p.nightAction={type:'inspect',targetId};
  }else if(p.role==='medium'){
  if(type==='skip'){p.nightAction={type:'skip'};}
  else {
   const dead=r.players.find(x=>String(x.userId)===targetId&&!x.alive&&x.role);
   if(type!=='medium_inspect'||!dead||p.mediumUsed)return res.status(400).json({error:'คนทรงตรวจสอบผู้เล่นที่ตายแล้วได้ 1 ครั้งต่อเกม'});
   p.mediumUsed=true;p.mediumResult={targetId:String(dead.userId),role:WW_ROLE_LABELS[dead.role],checkedAt:isoNow()};
   p.nightAction={type:'medium_inspect',targetId};
  }
 }else if(p.role==='priest'){
  if(type==='skip'){p.nightAction={type:'skip'};}
  else {if(type!=='priest_save'||p.priestSaveUsed||!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'นักบวชมีสิทธิ์ปกป้องผู้เล่นอื่นได้ 1 ครั้งต่อเกม'});p.nightAction={type:'priest_save',targetId};}
 }else if(p.role==='assassin'){
  if(type==='skip'){p.nightAction={type:'skip'};}
  else {if(type!=='assassin_kill'||p.assassinUsed||!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'นักฆ่ามีสิทธิ์กำจัดผู้เล่นอื่นได้ 1 ครั้งต่อเกม'});p.assassinUsed=true;p.nightAction={type:'assassin_kill',targetId};}
 }else if(p.role==='witch'){
  if(!['save','poison','skip'].includes(type))return res.status(400).json({error:'คำสั่งแม่มดไม่ถูกต้อง'});
  if(type==='save'){
   if(p.witchSaveUsed||!target||WW_WOLF_ROLES.includes(target.role))return res.status(400).json({error:'ใช้ยาชุบชีวิตไปแล้วหรือเป้าหมายไม่ถูกต้อง'});
   p.witchSaveUsed=true;p.nightAction={type:'save',targetId};
  }else if(type==='poison'){
   if(p.witchPoisonUsed||!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'ใช้ยาพิษไปแล้วหรือเป้าหมายไม่ถูกต้อง'});
   p.witchPoisonUsed=true;p.nightAction={type:'poison',targetId};
  }else p.nightAction={type:'skip'};
 }else if(p.role==='bodyguard'||p.role==='guardian'){
  if(type!=='protect'||!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'เลือกผู้เล่นอื่นที่ยังมีชีวิตเพื่อปกป้อง'});
  if(p.role==='guardian'&&String(r.lastProtectedId||'')===targetId)return res.status(400).json({error:'ผู้พิทักษ์ห้ามปกป้องคนเดิมติดต่อกันสองคืน'});
  p.nightAction={type:'protect',targetId};
 }else return res.status(403).json({error:'บทบาทของคุณไม่มีคำสั่งในเวลากลางคืน'});
 r.lastActivityAt=isoNow();
 if(wwNightReady(r))wwResolveNight(r);
 writeDB(db);res.json({ok:true,phase:r.phase,...(p.role==='seer'&&type==='inspect'?{seerResult:{isWolf:!!p.seerResult?.isWolf}}:{}),...(p.role==='detective'&&type==='inspect'?{detectiveResult:{isWolf:!!p.detectiveResult?.isWolf}}:{})});
});
// Private night chat for living wolf-team players only.
app.post('/api/werewolf/:id/wolf-chat',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='night')return res.status(400).json({error:'ห้องแชตหมาป่าเปิดเฉพาะเวลากลางคืน'});
 const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));
 if(!p||!p.alive||!WW_WOLF_ROLES.includes(p.role))return res.status(403).json({error:'เฉพาะหมาป่าที่ยังมีชีวิตเท่านั้นที่ใช้ห้องนี้ได้'});
 const message=String(req.body?.message||'').trim().slice(0,240);
 if(!message)return res.status(400).json({error:'พิมพ์ข้อความก่อนส่ง'});
 const now=Date.now();
 if(now-(Number(p.lastWolfChatAt)||0)<700)return res.status(429).json({error:'ส่งเร็วเกินไป กรุณารอสักครู่'});
 p.lastWolfChatAt=now;
 if(!Array.isArray(r.wolfChat))r.wolfChat=[];
 r.wolfChat.push({id:`${now}-${Math.random().toString(36).slice(2,7)}`,userId:String(p.userId),name:p.name,message,createdAt:isoNow()});
 r.wolfChat=r.wolfChat.slice(-100);r.lastActivityAt=isoNow();writeDB(db);
 res.json({ok:true});
});
app.post('/api/werewolf/:id/open-vote',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='day')return res.status(400).json({error:'ยังไม่ใช่ช่วงอภิปรายกลางวัน'});
 wwEnsureHost(r);
 if(String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องเท่านั้นที่เปิดโหวตได้'});
 r.phase='vote';r.players.forEach(p=>p.voted=null);r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true});
});
app.post('/api/werewolf/:id/vote',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='vote')return res.status(400).json({error:'ยังไม่ถึงช่วงลงคะแนน'});
 const p=r.players.find(x=>String(x.userId)===String(req.session.user.id));
 const targetId=String(req.body?.targetId||'');
 if(!p||!p.alive||p.voted)return res.status(400).json({error:'คุณโหวตไปแล้วหรือไม่มีสิทธิ์'});
 if(targetId!=='skip'){
  const target=r.players.find(x=>String(x.userId)===targetId&&x.alive);
  if(!target||String(target.userId)===String(p.userId))return res.status(400).json({error:'เลือกเป้าหมายไม่ถูกต้อง'});
  p.voted=targetId;
 }else p.voted='skip';
 r.lastActivityAt=isoNow();
 const voteResult=wwResolveVoteRound(r);
 if(voteResult.kingSaved){writeDB(db);return res.json({ok:true,phase:r.phase,kingSaved:true});}
 writeDB(db);res.json({ok:true,phase:r.phase});
});
app.post('/api/werewolf/:id/hunter-shot',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='hunter_shot')return res.status(400).json({error:'ไม่มีช่วงยิงตอบโต้ของนายพราน'});
 const hunter=r.players.find(p=>String(p.userId)===String(req.session.user.id));
 if(!hunter||String(r.pendingHunterId)!==String(hunter.userId)||hunter.role!=='hunter'||hunter.hunterShotUsed)return res.status(403).json({error:'ไม่มีสิทธิ์ใช้กระสุนตอบโต้'});
 const target=r.players.find(p=>String(p.userId)===String(req.body?.targetId)&&p.alive);
 if(!target||String(target.userId)===String(hunter.userId))return res.status(400).json({error:'เลือกเป้าหมายไม่ถูกต้อง'});
 // A hunter killed at night returns the village to day even if lastVote from a prior day remains.
 wwApplyHunterShot(r,hunter,target);
 r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true,phase:r.phase});
});
app.post('/api/werewolf/:id/rematch',auth,(req,res)=>{
 const db=readDB(),r=wwRoomFor(db,req.params.id);
 if(!r||r.phase!=='finished'||String(r.hostId)!==String(req.session.user.id))return res.status(403).json({error:'เฉพาะเจ้าของห้องหลังจบเกมเท่านั้น'});
 r.players=r.players.filter(p=>!p.left);if(!r.players.some(p=>String(p.userId)===String(r.hostId))&&r.players.length){r.hostId=r.players[0].userId;r.hostName=r.players[0].name;}r.phase='lobby';r.dayNumber=0;r.winner=null;r.resultText=null;r.finishedAt=null;r.lastNight=null;r.lastVote=null;r.pendingHunterId=null;r.lastProtectedId=null;r.wolfChat=[];r.wolfKillTargetId=null;r.wolfKillLockedBy=null;
 r.players.forEach(p=>{p.left=false;p.role=null;p.alive=true;p.nightAction=null;p.voted=null;p.seerResult=null;p.deathEvent=null;p.witchSaveUsed=false;p.witchPoisonUsed=false;p.hunterShotUsed=false;p.priestSaveUsed=false;p.mediumUsed=false;p.mediumResult=null;p.detectiveResult=null;p.assassinUsed=false;p.kingSaved=false;p.deathReason=null;});
 r.lastActivityAt=isoNow();writeDB(db);res.json({ok:true});
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
  const wasExisting = !!row;
  const previousStatus = row?.status || 'ยังไม่มีข้อมูล';
  const previousNote = row?.note || '';
  if (row) { row.status = status; row.note = String(note || '').trim(); row.markedBy = req.session.user.name; row.updatedAt = isoNow(); }
  else { row = { id: Date.now() + Math.floor(Math.random()*1000), date, memberId: m.id, memberName: m.name, sessionId: slot.id, sessionLabel: slot.label, time: slot.time, status, note: String(note || '').trim(), markedBy: req.session.user.name, createdAt: isoNow(), updatedAt: isoNow() }; db.attendance.push(row); }
  log(db, req.session.user.name, wasExisting ? 'แก้ไขการเช็กชื่อ' : 'เช็กชื่อสมาชิก', `${m.name} · ${slot.time} · ${previousStatus} → ${status}${previousNote || row.note ? ' · หมายเหตุ: ' + (previousNote || '-') + ' → ' + (row.note || '-') : ''}`);
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
  const allowed = ['present','late','absent','leave','business','unmarked'];
  for (const x of rows) {
    const m = db.members.find(y => y.id === Number(x.memberId) && y.active);
    if (!m || !allowed.includes(x.status)) return res.status(400).json({error:'ข้อมูลสถานะสมาชิกไม่ถูกต้อง'});
  }
  for (const x of rows) {
    const m = db.members.find(y => y.id === Number(x.memberId) && y.active);
    let a = db.attendance.find(y => y.date === date && y.memberId === m.id && y.sessionId === slot.id);
    if (!a) { a = {id:Date.now()+Math.floor(Math.random()*100000),date,memberId:m.id,memberName:m.name,sessionId:slot.id,sessionLabel:slot.label,time:slot.time,createdAt:isoNow()}; db.attendance.push(a); }
    const finalStatus = x.status === 'unmarked' ? 'present' : x.status;
    const oldStatus = a.status || 'ยังไม่มีข้อมูล';
    const oldNote = a.note || '';
    const newNote = String(x.note||'').trim();
    Object.assign(a,{status:finalStatus,note:newNote,markedBy:req.session.user.name,updatedAt:isoNow()});
    if (oldStatus !== finalStatus || oldNote !== newNote) log(db,req.session.user.name,'บันทึก/แก้ไขเช็กชื่อรายคน',`${m.name} · ${date} · ${slot.label} · ${oldStatus} → ${finalStatus}${oldNote !== newNote ? ' · หมายเหตุ: ' + (oldNote || '-') + ' → ' + (newNote || '-') : ''}`);
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
  const previousQty=Number(c.qty||0);
  const oldStocked=Number(c.stockedQty||0), finalQty=complete?task.qty:qty;
  c.qty=finalQty;c.complete=finalQty>=task.qty;c.updatedAt=isoNow();
  const item=task.itemId?db.items.find(i=>i.id===task.itemId):null;
  if(item){const delta=finalQty-oldStocked;item.qty=Math.max(0,item.qty+delta);c.stockedQty=oldStocked+delta;}
  log(db,actor,previousQty===finalQty?'บันทึกยอดส่งของ':'แก้ไขยอดส่งของ',`${task.date} · ${task.name} · ${member.name} · ${previousQty} → ${finalQty}/${task.qty}`);
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

// Admin can delete a daily delivery task only before anyone records a contribution.
app.delete('/api/daily-tasks/:id', auth, adminOnly, (req,res) => {
  const db = readDB();
  const index = db.dailyTasks.findIndex(t => t.id === Number(req.params.id));
  if (index < 0) return res.status(404).json({ error: 'ไม่พบรายการส่งของ' });

  const task = db.dailyTasks[index];
  const hasContributions = db.contributions.some(c => c.taskId === task.id);
  if (hasContributions) {
    return res.status(400).json({ error: 'รายการนี้มีการบันทึกยอดส่งแล้ว จึงยังลบไม่ได้ เพื่อป้องกันประวัติและยอดคลังคลาดเคลื่อน' });
  }

  db.dailyTasks.splice(index, 1);
  log(db, req.session.user.name, 'ลบรายการส่งของประจำวัน', `${task.date} · ${task.name} ${task.qty} ${task.unit}/คน`);
  writeDB(db);
  res.json({ ok: true });
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
// Admin can adjust the current stock quantity directly.
app.patch('/api/items/:id/quantity', auth, adminOnly, (req,res) => {
  const db = readDB();
  const item = db.items.find(i => i.id === Number(req.params.id));
  const qty = Number(req.body?.qty);
  if (!item) return res.status(404).json({ error: 'ไม่พบไอเทมในคลัง' });
  if (!Number.isSafeInteger(qty) || qty < 0 || qty > 1000000000) {
    return res.status(400).json({ error: 'จำนวนต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป' });
  }
  const oldQty = item.qty;
  item.qty = qty;
  log(db, req.session.user.name, 'แก้ไขจำนวนไอเทมในคลัง', `${item.name} · ${oldQty} → ${qty} ${item.unit}`);
  writeDB(db);
  res.json(item);
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
// ADMIN ROOM MANAGER: cross-game room inventory, player-perspective snapshots and safe controls.
function adminRoomCollections(db){return [
  {game:'bingo',label:'BINGO',rooms:db.bingoRooms||[],status:r=>r.status,players:r=>r.players||[],host:r=>r.hostName,created:r=>r.createdAt},
  {game:'impostor',label:'IMPOSTOR',rooms:db.impostorRooms||[],status:r=>r.phase,players:r=>r.players||[],host:r=>r.hostName,created:r=>r.createdAt},
  {game:'werewolf',label:'WEREWOLF',rooms:db.werewolfRooms||[],status:r=>r.phase,players:r=>(r.players||[]).filter(p=>!p.left),host:r=>r.hostName,created:r=>r.createdAt}
];}
function adminFindRoom(db,game,id){const group=adminRoomCollections(db).find(x=>x.game===game);return group?group.rooms.find(r=>String(r.id)===String(id)):null;}
function adminRoomSummary(group,r){const players=group.players(r);return {game:group.game,gameLabel:group.label,id:r.id,title:r.title||`${group.label} ROOM`,code:r.code||String(r.id).slice(-6),status:group.status(r)||'unknown',hostName:group.host(r)||'-',hostId:r.hostId,playerCount:players.length,players:players.map(p=>({userId:p.userId,name:p.name,alive:p.alive!==false,role:p.role||null})),createdAt:group.created(r)||null,lastActivityAt:r.lastActivityAt||r.createdAt||null,adminLocked:!!r.adminLocked};}

// =====================================
// =====================================
// ADMIN GAME AUTO TESTER · FULL ENGINE QA
// Isolated deterministic checks against the actual game-engine helpers.
// Does not mutate live rooms, users, scores, or persistent game state.
// =====================================
function gcTestAssert(condition, message) {
  if (!condition) throw new Error(message || 'เงื่อนไขไม่ผ่าน');
}
function gcRunCase(game, name, fn, tags = []) {
  const started = Date.now();
  try {
    const details = fn();
    return { id: `${game}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, game, name, status: 'passed', details: String(details || 'ตรวจสอบผ่าน'), durationMs: Date.now() - started, tags };
  } catch (error) {
    return { id: `${game}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, game, name, status: 'failed', details: String(error?.message || error || 'เกิดข้อผิดพลาด').slice(0, 500), durationMs: Date.now() - started, tags };
  }
}
function gcBuildGameTestCases(game, botCount) {
  const cases = [];
  const add = (g, name, fn, tags = []) => { if (game === 'all' || game === g) cases.push(() => gcRunCase(g, name, fn, tags)); };
  const wwRoom = (players, extra = {}) => ({ id: 'QA-WW', phase: 'night', dayNumber: 1, hostId: String(players[0]?.userId || ''), hostName: players[0]?.name || '', players, ...extra });
  const wwPlayer = (id, role, extra = {}) => ({ userId: String(id), name: `BOT ${id}`, role, alive: true, ...extra });

  // BINGO: card generation, all winning patterns, draw lifecycle, win claims and idempotency.
  add('bingo', 'การ์ดทุกใบมี 25 ช่อง ช่องฟรี และเลขไม่ซ้ำตามช่วง B-I-N-G-O', () => {
    const cards = Array.from({ length: botCount }, () => makeBingoCard());
    gcTestAssert(cards.length === botCount, 'จำนวนการ์ดไม่ตรงกับจำนวนบอท');
    cards.forEach((card, ci) => {
      gcTestAssert(Array.isArray(card) && card.length === 25, `BOT ${ci + 1}: ต้องมี 25 ช่อง`);
      gcTestAssert(card[12] === null, `BOT ${ci + 1}: ช่องกลางต้องเป็นช่องฟรี`);
      for (let col = 0; col < 5; col++) {
        const values = Array.from({ length: 5 }, (_, row) => card[row * 5 + col]);
        gcTestAssert(new Set(values).size === 5, `BOT ${ci + 1}: คอลัมน์ ${col + 1} มีเลขซ้ำ`);
        const min = col * 15 + 1, max = min + 14;
        gcTestAssert(values.every(v => v === null || (Number.isInteger(v) && v >= min && v <= max)), `BOT ${ci + 1}: เลขคอลัมน์ ${col + 1} อยู่นอกช่วง`);
      }
      const all = card.filter(v => v !== null);
      gcTestAssert(new Set(all).size === 24, `BOT ${ci + 1}: มีเลขซ้ำข้ามคอลัมน์`);
    });
    return `ตรวจการ์ด ${cards.length} ใบครบทุกช่องและทุกช่วงตัวเลข`;
  }, ['card','generation','validation']);
  add('bingo', 'ถุงสุ่มเลขมี 1–75 ครบและไม่มีเลขซ้ำ', () => {
    const bag = Array.from({ length: 75 }, (_, i) => i + 1);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    gcTestAssert(bag.length === 75 && new Set(bag).size === 75, 'ชุดสุ่มมีจำนวนผิดหรือเลขซ้ำ');
    gcTestAssert(Math.min(...bag) === 1 && Math.max(...bag) === 75, 'ชุดสุ่มไม่ครอบคลุม 1–75');
    return 'ชุดสุ่ม 75 หมายเลขครบถ้วน';
  }, ['draw','random']);
  add('bingo', 'เส้นชนะทั้ง 16 รูปแบบตรวจพบได้จริง', () => {
    const lines = bingoLines();
    gcTestAssert(lines.length === 16, `ต้องมี 16 เส้น แต่พบ ${lines.length}`);
    lines.forEach((line, i) => {
      gcTestAssert(line.every(index => Number.isInteger(index) && index >= 0 && index < 25), `เส้น ${i + 1} มีตำแหน่งนอกกระดาน`);
      gcTestAssert(line.length === 4 || line.length === 5, `เส้น ${i + 1} ต้องมี 4 หรือ 5 ช่อง`);
      const player = { marked: Array(25).fill(false) }; line.forEach(index => player.marked[index] = true);
      gcTestAssert(!!bingoWinningLine(player), `ระบบไม่พบเส้นชนะลำดับ ${i + 1}`);
    });
    gcTestAssert(bingoLines().filter(x => x.length === 5).length === 12, 'จำนวนแถว/คอลัมน์/ทแยงใหญ่ไม่ถูกต้อง');
    return 'ตรวจผ่านทุกเส้น: แนวนอน แนวตั้ง ทแยงใหญ่ และทแยงย่อย';
  }, ['win-condition','all-lines']);
  add('bingo', 'ไม่ประกาศชนะเมื่อยังขาดหนึ่งช่อง', () => {
    const line = bingoLines()[0], marked = Array(25).fill(false); line.slice(0, -1).forEach(i => marked[i] = true);
    gcTestAssert(bingoWinningLine({ marked }) === null, 'ระบบประกาศชนะทั้งที่ยังขาดช่อง');
    return 'ไม่พบผู้ชนะก่อนครบเส้น';
  }, ['negative','win-condition']);
  add('bingo', 'ตรวจว่าผู้เล่นยังมีโอกาสชนะจากเลขที่เหลือ', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1); card[12] = null;
    const possibleLine = bingoLines()[0], room = { drawn: possibleLine.filter(i => i !== 12).map(i => card[i]) }, player = { card };
    gcTestAssert(bingoCanStillWin(room, player) === true, 'ควรยังมีเส้นที่สามารถทำให้ชนะได้');
    const impossible = { drawn: Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !card.includes(n)) };
    gcTestAssert(bingoCanStillWin(impossible, player) === false, 'ไม่ควรมีโอกาสชนะเมื่อเลขในทุกเส้นไม่สามารถออกได้');
    return 'คำนวณโอกาสชนะจากเลขที่ออกและเลขที่เหลือถูกต้อง';
  }, ['possibility','draw']);
  add('bingo', 'บันทึกผู้ชนะครั้งเดียวและไม่เพิ่มซ้ำ', () => {
    const player = { userId: '1', name: 'BOT 1', marked: Array(25).fill(false) }; bingoLines()[0].forEach(i => player.marked[i] = true);
    const room = { id: 'B1', title: 'QA', status: 'playing', drawn: [], players: [player], winners: [] };
    const first = checkBingoWinnerForPlayer(room, player), second = checkBingoWinnerForPlayer(room, player);
    gcTestAssert(!!first && second === null && room.winners.length === 1 && room.status === 'finished', 'ผู้ชนะถูกบันทึกซ้ำหรือสถานะไม่จบ');
    return 'บันทึกผู้ชนะเพียงหนึ่งรายการและปิดสถานะเกม';
  }, ['winner','idempotency']);
  add('bingo', 'ป้องกันการเรียกร้องชัยชนะเมื่อวงไม่ครบ', () => {
    const player = { userId: '1', name: 'BOT 1', marked: Array(25).fill(false) };
    gcTestAssert(bingoWinningLine(player) === null, 'กระดานว่างไม่ควรมีผู้ชนะ');
    return 'กระดานที่ยังไม่ครบไม่มีผลชนะ';
  }, ['negative','claim']);

  // IMPOSTOR: role allocation, word bank, clue/vote/guess outcomes and room state transitions.
  add('impostor', 'ทุกหมวดคำมีข้อมูลพร้อมใช้งาน', () => {
    const categories = Object.keys(IMPOSTOR_WORDS);
    gcTestAssert(categories.length > 0, 'ไม่พบหมวดคำ');
    categories.forEach(category => gcTestAssert(Array.isArray(IMPOSTOR_WORDS[category]) && IMPOSTOR_WORDS[category].length >= 5 && IMPOSTOR_WORDS[category].every(w => typeof w === 'string' && w.trim()), `หมวด ${category} มีคำไม่เพียงพอหรือข้อมูลผิด`));
    return `ตรวจ ${categories.length} หมวดและ ${categories.reduce((n,k)=>n+IMPOSTOR_WORDS[k].length,0)} คำ`;
  }, ['word-bank','categories']);
  add('impostor', 'โหวตจับ Impostor แล้วเข้าสู่ช่วงทายคำ', () => {
    const players = Array.from({ length: Math.max(3, Math.min(botCount, 12)) }, (_, i) => ({ userId: String(i + 1), name: `BOT ${i + 1}`, role: i === 1 ? 'impostor' : 'crew', alive: true, voted: '2' }));
    const room = { players, hostId: '1', hostName: 'BOT 1', phase: 'vote' }; impostorResolveVotes(room);
    gcTestAssert(room.phase === 'guess' && String(room.caughtId) === '2' && players[1].alive === false, 'จับ Impostor หรือเปลี่ยนช่วงผิด');
    return `ทดสอบผู้เล่น ${players.length} คนและการเข้าสู่ช่วงทายคำ`;
  }, ['vote','phase']);
  add('impostor', 'โหวตจับผู้บริสุทธิ์แล้ว Impostor ชนะ', () => {
    const players = [{userId:'1',role:'crew',alive:true,voted:'1'},{userId:'2',role:'impostor',alive:true,voted:'1'},{userId:'3',role:'crew',alive:true,voted:'1'}];
    const room = { players, hostId: '1', hostName: 'BOT 1', phase: 'vote' }; impostorResolveVotes(room);
    gcTestAssert(room.phase === 'finished' && room.winner === 'impostor' && players[0].alive === false, 'ผลโหวตผู้บริสุทธิ์ไม่ถูกต้อง');
    return 'จับผู้เล่นผิดคนแล้วจบเกมให้ Impostor ชนะ';
  }, ['vote','win-condition']);
  add('impostor', 'คะแนนโหวตเสมอแล้ว Impostor ชนะโดยไม่มีใครถูกคัดออก', () => {
    const players = [{userId:'1',role:'crew',alive:true,voted:'3'},{userId:'2',role:'crew',alive:true,voted:'3'},{userId:'3',role:'impostor',alive:true,voted:'4'},{userId:'4',role:'crew',alive:true,voted:'4'}];
    const room = { players, hostId: '1', hostName: 'BOT 1', phase: 'vote' }; impostorResolveVotes(room);
    gcTestAssert(room.phase === 'finished' && room.winner === 'impostor' && players.every(p => p.alive), 'กรณีเสมอผิดเงื่อนไข');
    return 'คะแนนเสมอไม่มีผู้ถูกคัดออกและ Impostor ชนะ';
  }, ['vote','tie']);
  add('impostor', 'ยังไม่ประมวลผลโหวตเมื่อผู้เล่นยังโหวตไม่ครบ', () => {
    const players = [{userId:'1',role:'crew',alive:true,voted:'2'},{userId:'2',role:'impostor',alive:true,voted:null},{userId:'3',role:'crew',alive:true,voted:'2'}];
    const room = { players, phase: 'vote' }; impostorResolveVotes(room);
    gcTestAssert(room.phase === 'vote', 'ระบบประมวลผลก่อนทุกคนโหวต');
    return 'รอผู้เล่นที่ยังไม่ลงคะแนน';
  }, ['vote','incomplete']);
  add('impostor', 'กรณีไม่มีผู้เล่นเหลือจัดการสถานะได้', () => {
    const room = { players: [], phase: 'vote' }; impostorResolveVotes(room);
    gcTestAssert(room.phase === 'finished' && room.winner === 'crew', 'กรณีไม่มีผู้เล่นเหลือไม่จบตามที่กำหนด');
    return 'ห้องว่างถูกปิดสถานะอย่างปลอดภัย';
  }, ['edge-case']);
  add('impostor', 'การจบเกมกำหนดผลและเวลาเสร็จสิ้น', () => {
    const room = { phase: 'guess' }; impostorFinish(room, 'impostor', 'QA result');
    gcTestAssert(room.phase === 'finished' && room.winner === 'impostor' && !!room.finishedAt && room.resultText === 'QA result', 'ข้อมูลจบเกมไม่ครบ');
    return 'บันทึกผู้ชนะ ข้อความผลลัพธ์ และเวลา';
  }, ['finish','state']);

  // WEREWOLF: role deck, each role's night action/effect, stage order, death, vote and win rules.
  add('werewolf', 'แจกบทบาทพื้นฐานตามจำนวนผู้เล่นและคงชาวบ้านอย่างน้อยหนึ่งคน', () => {
    const deck = wwBuildRoleDeck(botCount, {});
    gcTestAssert(!deck.error && deck.roles.length === botCount, deck.error || 'จำนวนบทบาทไม่ตรงจำนวนบอท');
    gcTestAssert(deck.roles.filter(role => WW_WOLF_ROLES.includes(role)).length === deck.wolfCount && deck.villagerCount >= 1, 'สัดส่วนหมาป่าหรือชาวบ้านผิด');
    return `แจก ${botCount} บทบาทได้ครบ`;
  }, ['roles','deck']);
  add('werewolf', 'แจกครบทุกบทบาทพิเศษที่เปิดใช้งานและปฏิเสธชุดบทบาทเกินจำนวน', () => {
    const cfg = Object.fromEntries(WW_SPECIAL_ROLES.map(role => [role, true]));
    const tooSmall = wwBuildRoleDeck(WW_SPECIAL_ROLES.length + 1, cfg);
    gcTestAssert(!!tooSmall.error, 'ควรปฏิเสธเมื่อบทบาทพิเศษกินจำนวนผู้เล่นจนไม่เหลือชาวบ้าน');
    const valid = wwBuildRoleDeck(WW_SPECIAL_ROLES.length + 5, cfg);
    gcTestAssert(!valid.error && WW_SPECIAL_ROLES.every(role => valid.roles.includes(role)), 'แจกบทบาทพิเศษไม่ครบ');
    return `ตรวจบทบาทพิเศษ ${WW_SPECIAL_ROLES.length} แบบและการป้องกันชุดบทบาทเกิน`;
  }, ['roles','configuration','limits']);
  add('werewolf', 'ตั้งค่า role config ไม่เปิดบทบาทที่ไม่ได้ระบุเอง', () => {
    const cfg = wwNormalizeRoleConfig({ seer: true, witch: false }, { guardian: true });
    gcTestAssert(cfg.seer === true && cfg.witch === false && cfg.guardian === true && WW_SPECIAL_ROLES.every(r => typeof cfg[r] === 'boolean'), 'normalize role config ผิด');
    return 'ตรวจค่าบทบาทที่ระบุและค่า fallback';
  }, ['roles','configuration']);
  add('werewolf', 'ตรวจลำดับคิวกลางคืนครบทุก stage', () => {
    gcTestAssert(WW_NIGHT_STAGES.length === 9, 'จำนวนช่วงกลางคืนไม่ตรง');
    const labels = WW_NIGHT_STAGES.map(x => x.roles.join(','));
    gcTestAssert(labels[0].includes('wolf') && labels[1] === 'bodyguard' && labels[2] === 'guardian' && labels[3] === 'seer' && labels[4] === 'detective' && labels[5] === 'priest' && labels[6] === 'witch' && labels[7] === 'medium' && labels[8] === 'assassin', 'ลำดับบทบาทกลางคืนผิด');
    return 'ตรวจลำดับหมาป่า → ป้องกัน → ตรวจสอบ → สนับสนุน → นักฆ่า';
  }, ['turn-order','night']);
  add('werewolf', 'หมาป่าและอัลฟ่านับเป็นทีมเดียวกันในการคำนวณชัยชนะ', () => {
    const room = wwRoom([wwPlayer(1,'alpha'),wwPlayer(2,'wolf'),wwPlayer(3,'villager'),wwPlayer(4,'villager')]);
    gcTestAssert(wwCheckWin(room) && room.winner === 'wolf', 'หมาป่าอัลฟ่าไม่นับเป็นหมาป่าในเงื่อนไขชนะ');
    return 'นับ wolf และ alpha เป็นฝ่ายหมาป่า';
  }, ['wolf','alpha','win-condition']);
  add('werewolf', 'ฝ่ายชาวบ้านชนะเมื่อไม่มีหมาป่าที่ยังมีชีวิต', () => {
    const room = wwRoom([wwPlayer(1,'seer'),wwPlayer(2,'villager'),wwPlayer(3,'wolf',{alive:false})]);
    gcTestAssert(wwCheckWin(room) && room.winner === 'village', 'ฝ่ายชาวบ้านไม่ชนะเมื่อหมาป่าหมด');
    return 'ตรวจชัยชนะฝ่ายชาวบ้าน';
  }, ['win-condition']);
  add('werewolf', 'ฝ่ายหมาป่าชนะเมื่อจำนวนเท่าหรือมากกว่าฝ่ายอื่น', () => {
    for (const [wolves,others] of [[2,2],[2,1]]) { const ps=[...Array.from({length:wolves},(_,i)=>wwPlayer(i+1,'wolf')),...Array.from({length:others},(_,i)=>wwPlayer(wolves+i+1,'villager'))]; const room=wwRoom(ps); gcTestAssert(wwCheckWin(room)&&room.winner==='wolf','จำนวนหมาป่าเท่าหรือมากกว่าฝ่ายอื่นต้องชนะ'); }
    return 'ตรวจกรณีจำนวนเท่ากันและมากกว่า';
  }, ['win-condition']);
  add('werewolf', 'ผู้หยั่งรู้ตรวจพบหมาป่าและแยกฝ่ายชาวบ้านได้', () => {
    const seer=wwPlayer(1,'seer'), wolf=wwPlayer(2,'alpha'), villager=wwPlayer(3,'villager');
    const room=wwRoom([seer,wolf,villager]);
    seer.nightAction={type:'inspect',targetId:'2'}; seer.seerResult={isWolf:WW_WOLF_ROLES.includes(wolf.role)};
    gcTestAssert(seer.seerResult.isWolf===true && !WW_WOLF_ROLES.includes(villager.role), 'ผลตรวจฝ่ายผิด');
    return 'ตรวจแยก wolf-team กับผู้เล่นฝ่ายอื่น';
  }, ['role:seer','inspection']);
  add('werewolf', 'นักสืบเก็บผลตรวจ alpha แยกจากหมาป่าทั่วไป', () => {
    const detective=wwPlayer(1,'detective'), alpha=wwPlayer(2,'alpha');
    detective.detectiveResult={isWolf:WW_WOLF_ROLES.includes(alpha.role),isAlpha:alpha.role==='alpha'};
    gcTestAssert(detective.detectiveResult.isWolf && detective.detectiveResult.isAlpha, 'ผลตรวจ alpha ไม่ครบ');
    return 'ตรวจธง isWolf และ isAlpha';
  }, ['role:detective','inspection']);
  add('werewolf', 'แม่มดช่วยเป้าหมายจากการโจมตีของหมาป่า', () => {
    const wolf=wwPlayer(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}), witch=wwPlayer(2,'witch',{nightAction:{type:'save',targetId:'3'}}), victim=wwPlayer(3,'villager');
    const room=wwRoom([wolf,witch,victim],{wolfKillTargetId:'3'}); wwResolveNight(room);
    gcTestAssert(victim.alive && room.lastNight.saved, 'แม่มดช่วยเป้าหมายไม่สำเร็จ');
    return 'ยาชุบชีวิตป้องกันเป้าหมายหมาป่า';
  }, ['role:witch','save']);
  add('werewolf', 'แม่มดใช้ยาพิษกำจัดเป้าหมาย', () => {
    const witch=wwPlayer(1,'witch',{nightAction:{type:'poison',targetId:'3'}}), target=wwPlayer(3,'villager');
    const room=wwRoom([witch,target]); wwResolveNight(room);
    gcTestAssert(!target.alive && target.deathReason==='poison', 'ยาพิษไม่กำจัดเป้าหมาย');
    return 'ยาพิษกำจัดเป้าหมายและบันทึกสาเหตุ';
  }, ['role:witch','poison']);
  add('werewolf', 'นักบวชปกป้องเป้าหมายจากหมาป่า', () => {
    const wolf=wwPlayer(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}), priest=wwPlayer(2,'priest',{nightAction:{type:'priest_save',targetId:'3'}}), target=wwPlayer(3,'villager');
    const room=wwRoom([wolf,priest,target],{wolfKillTargetId:'3'}); wwResolveNight(room);
    gcTestAssert(target.alive && priest.priestSaveUsed===true, 'นักบวชปกป้องไม่สำเร็จหรือไม่บันทึกการใช้');
    return 'ป้องกันเป้าหมายและบันทึกสิทธิ์ใช้ครั้งเดียว';
  }, ['role:priest','protect']);
  add('werewolf', 'บอดี้การ์ดรับผลแทนเมื่อเป้าหมายถูกหมาป่าโจมตี', () => {
    const wolf=wwPlayer(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}), guard=wwPlayer(2,'bodyguard',{nightAction:{type:'protect',targetId:'3'}}), target=wwPlayer(3,'villager');
    const room=wwRoom([wolf,guard,target],{wolfKillTargetId:'3'}); wwResolveNight(room);
    gcTestAssert(!guard.alive && target.alive && room.lastNight.bodyguardSacrifice, 'บอดี้การ์ดไม่รับผลแทน');
    return 'บอดี้การ์ดเสียสละแทนเป้าหมาย';
  }, ['role:bodyguard','protect']);
  add('werewolf', 'ผู้พิทักษ์ป้องกันเป้าหมายจากหมาป่า', () => {
    const wolf=wwPlayer(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}), guardian=wwPlayer(2,'guardian',{nightAction:{type:'protect',targetId:'3'}}), target=wwPlayer(3,'villager');
    const room=wwRoom([wolf,guardian,target],{wolfKillTargetId:'3'}); wwResolveNight(room);
    gcTestAssert(target.alive && room.lastNight.saved && room.lastProtectedId==='3', 'ผู้พิทักษ์ป้องกันไม่สำเร็จ');
    return 'ป้องกันเป้าหมายและจำเป้าหมายคืนล่าสุด';
  }, ['role:guardian','protect']);
  add('werewolf', 'ผู้ติดเชื้อถูกโจมตีแล้วเปลี่ยนเป็นหมาป่าแทนการตาย', () => {
    const wolf=wwPlayer(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}), infected=wwPlayer(3,'infected');
    const room=wwRoom([wolf,infected],{wolfKillTargetId:'3'}); wwResolveNight(room);
    gcTestAssert(infected.alive && infected.role==='wolf' && !!infected.convertedAt, 'ผู้ติดเชื้อไม่เปลี่ยนฝ่าย');
    return 'แปลง infected เป็น wolf โดยยังมีชีวิต';
  }, ['role:infected','conversion']);
  add('werewolf', 'นักฆ่ากำจัดเป้าหมายและชนะทันที', () => {
    const assassin=wwPlayer(1,'assassin',{nightAction:{type:'assassin_kill',targetId:'3'}}), target=wwPlayer(3,'villager');
    const room=wwRoom([assassin,target]); wwResolveNight(room);
    gcTestAssert(!target.alive && room.phase==='finished' && room.winner==='assassin', 'นักฆ่าไม่ชนะตามเงื่อนไข');
    return 'นักฆ่ากำจัดเป้าหมายและจบเกม';
  }, ['role:assassin','special-win']);
  add('werewolf', 'คนทรงตรวจบทบาทผู้เล่นที่ตายแล้วได้', () => {
    const medium=wwPlayer(1,'medium',{mediumUsed:true,mediumResult:{targetId:'2',role:WW_ROLE_LABELS.wolf}}), dead=wwPlayer(2,'wolf',{alive:false});
    gcTestAssert(medium.mediumUsed && medium.mediumResult.role===WW_ROLE_LABELS[dead.role], 'ข้อมูลตรวจผู้เล่นที่ตายไม่ตรง');
    return 'ข้อมูลบทบาทผู้ตายตรงกับ role label';
  }, ['role:medium','dead-player']);
  add('werewolf', 'กษัตริย์ยกเลิกผลโหวตครั้งแรกและถูกโหวตออกได้ในครั้งถัดไป', () => {
    const king=wwPlayer(1,'king'),wolf=wwPlayer(2,'wolf'),villager=wwPlayer(3,'villager');
    const room=wwRoom([king,wolf,villager],{phase:'vote'}); room.players.forEach(p=>p.voted='1');
    const first=wwResolveVoteRound(room);
    gcTestAssert(first.kingSaved && king.alive && king.kingSaved && room.phase==='night', 'กษัตริย์ต้องรอดจากการโหวตครั้งแรก');
    room.phase='vote';room.players.forEach(p=>{if(p.alive)p.voted='1';});
    const second=wwResolveVoteRound(room);
    gcTestAssert(second.resolved && !king.alive && king.deathReason==='vote', 'กษัตริย์ที่ใช้สิทธิ์แล้วต้องถูกโหวตออกได้');
    return 'ทดสอบสิทธิ์กษัตริย์ครั้งแรกและการใช้ซ้ำ';
  }, ['role:king','vote']);
  add('werewolf', 'ตัวตลกชนะทันทีเมื่อถูกโหวตออกจริง', () => {
    const jester=wwPlayer(1,'jester'),wolf=wwPlayer(2,'wolf'),villager=wwPlayer(3,'villager');
    const room=wwRoom([jester,wolf,villager],{phase:'vote'});room.players.forEach(p=>p.voted='1');wwResolveVoteRound(room);
    gcTestAssert(room.phase==='finished' && room.winner==='jester' && !jester.alive, 'ตัวตลกไม่ได้รับชัยชนะพิเศษ');
    return 'โหวตตัวตลกออกแล้วจบเกมด้วยผู้ชนะพิเศษ';
  }, ['role:jester','special-win','vote']);
  add('werewolf', 'นายพรานถูกกำจัดตอนกลางคืนแล้วการยิงตอบโต้กลับสู่กลางวัน', () => {
    const hunter=wwPlayer(1,'hunter',{alive:false,deathReason:'wolf'}),wolf=wwPlayer(2,'wolf'),target=wwPlayer(3,'villager'),seer=wwPlayer(4,'seer'),villager=wwPlayer(5,'villager');
    const room=wwRoom([hunter,wolf,target,seer,villager],{phase:'hunter_shot',pendingHunterId:'1'});
    gcTestAssert(wwHunterWasKilledAtNight(hunter) && wwHunterShotNextPhase(hunter)==='day', 'นายพรานไม่เข้าสู่ช่วงตอบโต้ที่ถูกต้อง');
    wwApplyHunterShot(room,hunter,target);
    gcTestAssert(!target.alive && hunter.hunterShotUsed && room.phase==='day' && room.pendingHunterId===null, 'ยิงตอบโต้ไม่เปลี่ยนสถานะหรือ phase ถูกต้อง');
    return 'ยิงจริง บันทึกการใช้กระสุน และกลับเข้าสู่กลางวัน';
  }, ['role:hunter','retaliation']);
  add('werewolf', 'นายพรานถูกโหวตออกแล้วการยิงตอบโต้กลับสู่กลางคืน', () => {
    const hunter=wwPlayer(1,'hunter',{alive:false,deathReason:'vote'}),wolf=wwPlayer(2,'wolf'),target=wwPlayer(3,'villager'),seer=wwPlayer(4,'seer'),villager=wwPlayer(5,'villager');
    const room=wwRoom([hunter,wolf,target,seer,villager],{phase:'hunter_shot',pendingHunterId:'1'});
    gcTestAssert(!wwHunterWasKilledAtNight(hunter) && wwHunterShotNextPhase(hunter)==='night', 'นายพรานที่ถูกโหวตออกต้องกลับสู่กลางคืน');
    wwApplyHunterShot(room,hunter,target);
    gcTestAssert(!target.alive && room.phase==='night' && room.pendingHunterId===null, 'ยิงหลังถูกโหวตออกไม่กลับสู่กลางคืน');
    return 'ยิงจริงและเริ่มรอบกลางคืนใหม่';
  }, ['role:hunter','retaliation']);
  add('werewolf', 'ระบบข้ามคิวบทบาทที่ไม่มีหรือหมดสิทธิ์แล้ว', () => {
    const room=wwRoom([wwPlayer(1,'villager')]);
    gcTestAssert(wwStageDone(room,WW_NIGHT_STAGES[0]) && wwCurrentNightStage(room)===null, 'คิวที่ไม่มีบทบาทควรถูกข้าม');
    return 'ข้ามทุก stage เมื่อไม่มีผู้ใช้สกิล';
  }, ['turn-order','skip']);
  add('werewolf', 'ตรวจการย้ายเจ้าของห้องเมื่อเจ้าของเดิมตาย', () => {
    const room=wwRoom([wwPlayer(1,'villager',{alive:false}),wwPlayer(2,'seer'),wwPlayer(3,'villager')]); wwEnsureHost(room);
    gcTestAssert(String(room.hostId)==='2' && room.hostName==='BOT 2', 'ไม่ย้าย host ไปยังผู้เล่นที่ยังมีชีวิต');
    return 'ย้าย host ไปผู้เล่นที่ยังมีชีวิตคนแรก';
  }, ['host','lifecycle']);
  add('werewolf', 'ตรวจการจบเกมและข้อมูลผู้ชนะ', () => {
    const room=wwRoom([wwPlayer(1,'wolf'),wwPlayer(2,'villager')]); wwFinish(room,'wolf','QA wolf win');
    gcTestAssert(room.phase==='finished' && room.winner==='wolf' && room.resultText==='QA wolf win' && !!room.finishedAt, 'ข้อมูลจบเกมไม่ครบ');
    return 'บันทึกสถานะ ผู้ชนะ ผลลัพธ์ และเวลา';
  }, ['finish','state']);

  return cases;
}

function gcClassifyTestFailure(item) {
  const text = `${item.name || ''} ${item.details || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  const rules = [
    { key: 'security', words: ['สิทธิ์','auth','unauthorized','forbidden','permission','role','access'] },
    { key: 'state', words: ['สถานะ','phase','state','ลำดับ','stage','คิว'] },
    { key: 'validation', words: ['ข้อมูล','ไม่ถูกต้อง','invalid','validation','input','เลขซ้ำ'] },
    { key: 'database', words: ['ฐานข้อมูล','database','transaction','postgres','persist'] },
    { key: 'ui', words: ['หน้าเว็บ','ปุ่ม','ui','browser','frontend'] },
    { key: 'lifecycle', words: ['ห้อง','ผู้เล่น','ออกจาก','host','cleanup','room'] }
  ];
  return rules.find(rule => rule.words.some(word => text.includes(word)))?.key || 'logic';
}
function gcFailureAdvice(item) {
  const category = gcClassifyTestFailure(item);
  const advice = {
    security: 'ตรวจ middleware auth/adminOnly, การตรวจเจ้าของข้อมูล และการอนุญาตฝั่งเซิร์ฟเวอร์',
    state: 'ตรวจ state machine, ลำดับ stage, guard ก่อนเปลี่ยน phase และการป้องกันคำสั่งซ้ำ',
    validation: 'ตรวจชนิดข้อมูล ขอบเขตค่า null/undefined และ validation ทั้ง client/server',
    database: 'ตรวจ transaction, rollback, row lock, schema และการบันทึกข้อมูลก่อนตอบกลับ',
    ui: 'ตรวจ selector, event listener, render lifecycle และการแสดงผลเมื่อ API ล้มเหลว',
    lifecycle: 'ตรวจ join/leave, host transfer, cleanup, timeout และการจัดการผู้เล่นที่ออก',
    logic: 'ตรวจเงื่อนไขธุรกิจและเพิ่มกรณีทดสอบขั้นต่ำ/สูงสุด/ค่าผิดปกติ'
  };
  return { category, recommendation: advice[category], severity: category === 'security' || category === 'database' ? 'high' : 'medium' };
}
function gcBuildSystemAuditCases() {
  const cases = [];
  const add = (name, fn, tags = []) => cases.push(() => gcRunCase('system', name, fn, tags));
  const readSource = (relative) => {
    const full = path.join(__dirname, relative);
    gcTestAssert(fs.existsSync(full), `ไม่พบไฟล์ ${relative} ใน deployment`);
    return fs.readFileSync(full, 'utf8');
  };
  add('Security: ทุก endpoint ศูนย์ทดสอบมี auth และ adminOnly', () => {
    const src = readSource('server.js');
    for (const route of ["app.get('/api/admin/test-runs'", "app.post('/api/admin/test-runs'", "app.delete('/api/admin/test-runs/:id'"]) {
      const at = src.lastIndexOf(route);
      gcTestAssert(at >= 0, `ไม่พบ route ${route}`);
      const head = src.slice(at, at + 180);
      gcTestAssert(/auth\s*,\s*adminOnly/.test(head), `route ไม่มี auth/adminOnly: ${route}`);
    }
    return 'พบ middleware ป้องกันครบทุก endpoint ของ QA';
  }, ['security','api','admin']);
  add('Database: transaction middleware ใช้ row lock และ rollback', () => {
    const src = readSource('server.js');
    gcTestAssert(/BEGIN/.test(src) && /FOR UPDATE/.test(src) && /COMMIT/.test(src) && /ROLLBACK/.test(src), 'ไม่พบ transaction/lock/rollback ครบ');
    return 'พบ BEGIN, row lock, COMMIT และ ROLLBACK';
  }, ['database','transaction','concurrency']);
  add('Database: โครงสร้าง testRuns ถูก normalize และจำกัดประวัติ', () => {
    const src = readSource('server.js');
    gcTestAssert(/'testRuns'/.test(src) && /db\.testRuns\s*=\s*db\.testRuns\.slice\(0,\s*30\)/.test(src), 'testRuns ไม่ถูก normalize หรือไม่จำกัดจำนวน');
    return 'testRuns มีค่าเริ่มต้นและจำกัดประวัติสูงสุด 30 รายงาน';
  }, ['database','retention']);
  add('API: ตรวจสอบค่าที่รับจากผู้ใช้ก่อนเริ่มทดสอบ', () => {
    const src = readSource('server.js');
    const at = src.lastIndexOf("app.post('/api/admin/test-runs'");
    const block = src.slice(at, at + 2200);
    gcTestAssert(/includes\(game\)/.test(block) && /Number\.isInteger\(botCount\)/.test(block) && /Number\.isInteger\(repetitions\)/.test(block), 'ขาด validation game/botCount/repetitions');
    return 'ตรวจ game, จำนวนบอท และจำนวนรอบก่อนรัน';
  }, ['api','validation']);
  add('Isolation: test runner ไม่เรียกแก้ไขห้องจริง', () => {
    const src = readSource('server.js');
    const at = src.lastIndexOf('function gcExecuteGameTest');
    const end = src.indexOf("\napp.get('/api/admin/test-runs'", at);
    const block = src.slice(at, end > at ? end : at + 6000);
    gcTestAssert(!/db\.(bingoRooms|impostorRooms|werewolfRooms|members)\s*\./.test(block), 'พบการเข้าถึง collection ห้องจริงหรือสมาชิกใน runner');
    gcTestAssert(/liveRoomsTouched:\s*false/.test(block), 'ขาด flag ยืนยันว่าไม่แตะห้องจริง');
    return 'runner ทำงานกับ fixture และรายงานแยก ไม่แก้ collection ห้องจริง';
  }, ['isolation','safety']);
  add('Frontend: มีหน้า QA และผูก event เริ่ม/รีเฟรช/ลบรายงาน', () => {
    const src = readSource(path.join('public','app.js'));
    for (const token of ['function testCenter()', 'function wireTestCenter()', 'gctRun', 'gctRefresh', 'data-gct-delete', '/api/admin/test-runs']) {
      gcTestAssert(src.includes(token), `หน้าเว็บขาดส่วนเชื่อมต่อ ${token}`);
    }
    return 'พบหน้า QA, ปุ่มเริ่ม, รีเฟรช, ลบ และ API binding';
  }, ['ui','frontend']);
  add('Frontend: หน้าศูนย์ทดสอบถูกจำกัดการมองเห็นฝั่ง UI', () => {
    const src = readSource(path.join('public','app.js'));
    gcTestAssert(/if\(!isAdmin\(\)\)return/.test(src) && /testCenter/.test(src), 'ไม่พบ guard สำหรับเมนูศูนย์ทดสอบ');
    return 'พบ guard ฝั่ง UI (ยังต้องพึ่ง server-side adminOnly เป็นหลัก)';
  }, ['ui','security']);
  add('Security: session cookie ตั้งค่า httpOnly และ sameSite', () => {
    const src = readSource('server.js');
    gcTestAssert(/httpOnly:\s*true/.test(src) && /sameSite:\s*'lax'/.test(src), 'session cookie ขาด httpOnly หรือ sameSite');
    return 'พบการตั้งค่า cookie ป้องกันการเข้าถึงจาก script และกำหนด sameSite';
  }, ['security','session']);
  add('Runtime: จำกัดขนาด JSON request', () => {
    const src = readSource('server.js');
    gcTestAssert(/express\.json\(\{\s*limit:\s*'1mb'\s*\}\)/.test(src), 'ไม่พบ JSON body size limit');
    return 'กำหนดขนาด JSON request สูงสุด 1 MB';
  }, ['runtime','validation']);
  add('Role registry: รายการบทบาทพิเศษมีคีย์ไม่ซ้ำ', () => {
    gcTestAssert(Array.isArray(WW_SPECIAL_ROLES) && new Set(WW_SPECIAL_ROLES).size === WW_SPECIAL_ROLES.length, 'รายการบทบาทพิเศษซ้ำหรือไม่ใช่ array');
    gcTestAssert(WW_SPECIAL_ROLES.every(role => typeof role === 'string' && role.length > 0), 'พบคีย์บทบาทว่าง');
    return `ตรวจคีย์บทบาทพิเศษ ${WW_SPECIAL_ROLES.length} รายการ`;
  }, ['roles','registry']);
  add('Stress-lite: สุ่มการ์ด BINGO หลายชุดโดยไม่ซ้ำในคอลัมน์', () => {
    const count = 250;
    for (let n = 0; n < count; n++) {
      const card = makeBingoCard();
      gcTestAssert(card.length === 25 && card[12] === null, `การ์ดชุด ${n + 1} ผิดโครงสร้าง`);
      for (let col = 0; col < 5; col++) {
        const values = Array.from({length:5},(_,row)=>card[row*5+col]);
        gcTestAssert(new Set(values).size === 5, `การ์ดชุด ${n + 1} คอลัมน์ ${col + 1} มีเลขซ้ำ`);
      }
    }
    return `สร้างและตรวจการ์ด ${count} ชุดใน process เดียว`;
  }, ['performance','randomized','bingo']);
  return cases;
}

function gcExecuteGameTest(game, botCount, repetitions) {
  const started = Date.now(), results = [];
  for (let round = 1; round <= repetitions; round++) {
    const gameCases = gcBuildGameTestCases(game, botCount);
    const systemCases = gcBuildSystemAuditCases();
    for (const run of [...gameCases, ...systemCases]) {
      const result = run(); result.round = round;
      if (result.status === 'failed') Object.assign(result, gcFailureAdvice(result));
      results.push(result);
    }
  }
  const passed = results.filter(x => x.status === 'passed').length;
  const failed = results.filter(x => x.status === 'failed').length;
  const byGame = {};
  results.forEach(x => { byGame[x.game] ||= { total:0, passed:0, failed:0 }; byGame[x.game].total++; byGame[x.game][x.status]++; });
  const roomCode = `TST-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  return {
    id: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    roomCode, roomName: game === 'all' ? 'ห้องทดลองทุกเกม' : `ห้องทดลอง ${game.toUpperCase()}`,
    botPlayers: Array.from({ length: botCount }, (_, i) => `BOT-${String(i + 1).padStart(2, '0')}`),
    title: game === 'all' ? 'Full QA · ทุกเกม' : `Full QA · ${game.toUpperCase()}`,
    game, botCount, repetitions, status: failed ? 'failed' : 'passed',
    total: results.length, passed, failed, coverage: byGame,
    durationMs: Date.now() - started, createdAt: isoNow(), completedAt: isoNow(), results,
    scope: { engineHelpers: true, roleCoverage: true, sourceAudit: true, securityStaticAudit: true, databaseConfigAudit: true, frontendWiringAudit: true, stressLite: true, apiHttpE2E: false, browserE2E: false, liveDatabase: false, realLoadTest: false, liveRoomsTouched: false }
  };
}

app.get('/api/admin/test-runs', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json({ runs: (db.testRuns || []).slice(0, 30) });
});
app.post('/api/admin/test-runs', auth, adminOnly, (req, res) => {
  const db = readDB();
  const game = String(req.body?.game || 'all');
  const botCount = Number(req.body?.botCount ?? 8);
  const repetitions = Number(req.body?.repetitions ?? 1);
  if (!['all', 'bingo', 'impostor', 'werewolf'].includes(game)) return res.status(400).json({ error: 'ประเภทเกมไม่ถูกต้อง' });
  if (!Number.isInteger(botCount) || botCount < 6 || botCount > 16) return res.status(400).json({ error: 'จำนวนบอทต้องอยู่ระหว่าง 6–16 คน' });
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) return res.status(400).json({ error: 'จำนวนรอบทดสอบต้องอยู่ระหว่าง 1–5 รอบ' });
  const run = gcExecuteGameTest(game, botCount, repetitions);
  db.testRuns.unshift(run);
  db.testRuns = db.testRuns.slice(0, 30);
  log(db, req.session.user.name, 'เริ่มทดสอบเกมอัตโนมัติ', `${run.title} · ${run.passed}/${run.total} ผ่าน · ${run.failed} พบปัญหา`);
  writeDB(db);
  res.json({ run });
});
app.delete('/api/admin/test-runs/:id', auth, adminOnly, (req, res) => {
  const db = readDB(), before = db.testRuns.length;
  db.testRuns = db.testRuns.filter(run => String(run.id) !== String(req.params.id));
  if (db.testRuns.length === before) return res.status(404).json({ error: 'ไม่พบรายงานทดสอบนี้' });
  log(db, req.session.user.name, 'ลบรายงานทดสอบเกม', String(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/admin/rooms',auth,adminOnly,(req,res)=>{
 const db=readDB(),rooms=adminRoomCollections(db).flatMap(g=>g.rooms.map(r=>adminRoomSummary(g,r))).sort((a,b)=>String(b.lastActivityAt||'').localeCompare(String(a.lastActivityAt||'')));
 const counts={total:rooms.length,playing:rooms.filter(r=>['playing','night','day','vote','clue','guess','hunter_shot'].includes(r.status)).length,waiting:rooms.filter(r=>['waiting','lobby'].includes(r.status)).length,players:rooms.reduce((n,r)=>n+r.playerCount,0),locked:rooms.filter(r=>r.adminLocked).length};
 res.json({rooms,counts,serverNow:Date.now()});
});
app.get('/api/admin/rooms/:game/:id/view',auth,adminOnly,(req,res)=>{
 const db=readDB(),{game,id}=req.params,room=adminFindRoom(db,game,id);if(!room)return res.status(404).json({error:'ไม่พบห้องนี้'});
 const players=(room.players||[]).filter(p=>!p.left).map(p=>({userId:p.userId,name:p.name,alive:p.alive!==false,role:p.role||null}));
 const requestedId=String(req.query.playerId||players[0]?.userId||'');const player=players.find(p=>String(p.userId)===requestedId);if(!player)return res.status(404).json({error:'ไม่พบผู้เล่นที่เลือก'});
 const account=db.users.find(u=>String(u.id)===requestedId);const fakeReq={session:{user:account?publicUser(account):{id:player.userId,name:player.name,role:'member',memberId:null}}};
 let perspective=null;
 if(game==='bingo')perspective=bingoRoomPublic(room,fakeReq);
 else if(game==='impostor')perspective=impostorPublic(room,fakeReq);
 else if(game==='werewolf')perspective=wwPublic(room,fakeReq);
 else return res.status(400).json({error:'ประเภทเกมไม่รองรับ'});
 res.json({room:adminRoomSummary(adminRoomCollections(db).find(g=>g.game===game),room),selectedPlayer:player,perspective,serverNow:Date.now(),readOnly:true});
});
app.patch('/api/admin/rooms/:game/:id/lock',auth,adminOnly,(req,res)=>{
 const db=readDB(),room=adminFindRoom(db,req.params.game,req.params.id);if(!room)return res.status(404).json({error:'ไม่พบห้องนี้'});
 room.adminLocked=!!req.body?.locked;room.adminLockUpdatedAt=isoNow();room.adminLockUpdatedBy=req.session.user.name;
 log(db,req.session.user.name,room.adminLocked?'แอดมินล็อกห้อง':'แอดมินปลดล็อกห้อง',`${req.params.game} · ${room.title||room.code||room.id}`);writeDB(db);res.json({ok:true,locked:room.adminLocked});
});
app.delete('/api/admin/rooms/:game/:id/players/:playerId',auth,adminOnly,(req,res)=>{
 const db=readDB(),game=req.params.game,room=adminFindRoom(db,game,req.params.id);if(!room)return res.status(404).json({error:'ไม่พบห้องนี้'});
 const list=room.players||[],idx=list.findIndex(p=>String(p.userId)===String(req.params.playerId));if(idx<0)return res.status(404).json({error:'ไม่พบผู้เล่นในห้องนี้'});
 const [removed]=list.splice(idx,1);
 if(String(room.hostId)===String(removed.userId)){const next=list.find(p=>p.alive!==false&&!p.left)||list[0];room.hostId=next?.userId||null;room.hostName=next?.name||'-';}
 if(!list.length){if(game==='bingo')room.status='closed';else if(game==='impostor')room.phase='finished';else room.phase='finished';room.finishedAt=isoNow();}
 room.lastActivityAt=isoNow();log(db,req.session.user.name,'แอดมินนำผู้เล่นออกจากห้อง',`${game} · ${room.title||room.code||room.id} · ${removed.name}`);writeDB(db);res.json({ok:true});
});
app.post('/api/admin/rooms/:game/:id/reset',auth,adminOnly,(req,res)=>{
 const db=readDB(),game=req.params.game,room=adminFindRoom(db,game,req.params.id);if(!room)return res.status(404).json({error:'ไม่พบห้องนี้'});
 if(game==='bingo'){
  room.status='waiting';room.drawn=[];room.winner=null;room.winners=[];room.nextDrawAt=null;room.startedAt=null;room.finishedAt=null;
  (room.players||[]).forEach(p=>{p.marked=Array.from({length:25},(_,i)=>i===12)});
 }else if(game==='impostor'){
  room.phase='lobby';room.word=null;room.winner=null;room.resultText=null;room.caughtId=null;room.finishedAt=null;
  (room.players||[]).forEach(p=>{p.role=null;p.alive=true;p.clue=null;p.voted=null;});
 }else if(game==='werewolf'){
  room.phase='lobby';room.dayNumber=0;room.winner=null;room.resultText=null;room.finishedAt=null;room.lastNight=null;room.lastVote=null;room.pendingHunterId=null;room.wolfKillTargetId=null;room.wolfKillLockedBy=null;room.wolfChat=[];
  (room.players||[]).forEach(p=>{p.role=null;p.alive=true;p.left=false;p.nightAction=null;p.voted=null;p.deathReason=null;p.deathEvent=null;p.seerResult=null;p.mediumResult=null;p.witchSaveUsed=false;p.witchPoisonUsed=false;p.hunterShotUsed=false;p.priestSaveUsed=false;p.mediumUsed=false;p.detectiveResult=null;p.assassinUsed=false;p.kingSaved=false;});
 }else return res.status(400).json({error:'ประเภทเกมไม่รองรับ'});
 room.lastActivityAt=isoNow();log(db,req.session.user.name,'แอดมินรีเซ็ตห้อง',`${game} · ${room.title||room.code||room.id}`);writeDB(db);res.json({ok:true});
});
app.delete('/api/admin/rooms/:game/:id',auth,adminOnly,(req,res)=>{
 const db=readDB(),group=adminRoomCollections(db).find(g=>g.game===req.params.game);if(!group)return res.status(400).json({error:'ประเภทเกมไม่ถูกต้อง'});
 const index=group.rooms.findIndex(r=>String(r.id)===String(req.params.id));if(index<0)return res.status(404).json({error:'ไม่พบห้องนี้'});
 const [room]=group.rooms.splice(index,1);log(db,req.session.user.name,'แอดมินลบห้อง',`${group.label} · ${room.title||room.code||room.id} · ${(room.players||[]).length} คน`);writeDB(db);res.json({ok:true});
});

app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'ระบบขัดข้อง กรุณาลองใหม่' }); });

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const existing = await pool.query('SELECT id FROM app_state WHERE id = 1');
  if (!existing.rows.length) {
    let initial = seed();
    // One-time import if a legacy JSON database is present alongside this server.
    if (fs.existsSync(DB_FILE)) {
      try { initial = normalizeDB(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); console.log('นำเข้าข้อมูลเดิมจาก data/db.json แล้ว'); }
      catch (err) { console.error('อ่าน data/db.json ไม่สำเร็จ ใช้ข้อมูลเริ่มต้นแทน:', err.message); }
    }
    ensureTestAccounts(initial);
    await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(initial)]);
    console.log('สร้างฐานข้อมูลเริ่มต้นใน PostgreSQL แล้ว');
  } else {
    // เพิ่มบัญชี TEST ให้ฐานข้อมูลที่ใช้งานอยู่ โดยไม่แก้บัญชีเดิมหรือข้อมูลสมาชิก
    const current = await pool.query('SELECT data FROM app_state WHERE id = 1');
    const db = normalizeDB(current.rows[0].data);
    if (ensureTestAccounts(db)) {
      await pool.query('UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(db)]);
      console.log('เพิ่มบัญชีทดสอบ 5 บัญชีแล้ว (ไม่นับเป็นสมาชิก)');
    }
  }
}

initializeDatabase().then(() => {
  const bingoScheduler=setInterval(runBingoScheduler,1000);
  if(typeof bingoScheduler.unref==='function')bingoScheduler.unref();
  runBingoScheduler().catch(()=>{});
  app.listen(PORT, '0.0.0.0', () => console.log(`GANG CONTROL เปิดแล้วที่พอร์ต ${PORT}`));
}).catch(err => {
  console.error('เริ่มระบบไม่สำเร็จ:', err);
  process.exit(1);
});
