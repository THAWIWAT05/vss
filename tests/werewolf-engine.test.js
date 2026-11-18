const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../server.js','utf8');
const start=src.indexOf('const WW_ROLE_LABELS=');
const end=src.indexOf('function wwCleanup',start);
assert(start>=0&&end>start,'engine functions found');
const engine=src.slice(start,end);
const ctx={module:{exports:{}},exports:{},isoNow:()=> '2026-11-19T00:00:00.000Z'};
vm.createContext(ctx);
vm.runInContext(engine+'\nmodule.exports={WW_ROLE_LABELS,wwAlive,wwFinish,wwCheckWin,wwNightReady,wwWolfTarget,wwBuildRoles,wwResolveNight,wwResolveVote,wwPublic};',ctx);
const E=ctx.module.exports;
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e);process.exitCode=1}}
const mk=(id,role,extra={})=>({userId:String(id),name:'P'+id,role,alive:true,nightAction:null,voted:null,...extra});
const room=(players,extra={})=>({id:'r1',code:'123456',title:'test',phase:'night',players,dayNumber:0,roleConfig:{},hostId:'1',hostName:'P1',createdAt:'2026-11-19T00:00:00.000Z',...extra});
test('ผู้หยั่งรู้เห็นผลตรวจเฉพาะบัญชีตัวเอง',()=>{
 const r=room([mk(1,'seer',{seerResult:{targetName:'P2',isWolf:true}}),mk(2,'wolf')]);
 const s=E.wwPublic(r,{session:{user:{id:1}}});
 const v=E.wwPublic(r,{session:{user:{id:2}}});
 assert.equal(s.me.seerResult.targetName,'P2');assert.equal(s.me.seerResult.isWolf,true);assert.equal(v.me.seerResult,null);
});
test('หมาป่าฆ่าเป้าหมายและคืนสู่กลางวันพร้อมเพิ่มวัน',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'seer',{nightAction:{type:'inspect',targetId:'3'}}),mk(3,'villager'),mk(4,'villager')]);
 E.wwResolveNight(r);assert.equal(r.phase,'day');assert.equal(r.dayNumber,1);assert.equal(r.players.find(p=>p.userId==='3').alive,false);assert.deepEqual(r.lastNight.killed,['P3']);
});
test('ผู้พิทักษ์ป้องกันเหยื่อจากหมาป่า',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'guardian',{nightAction:{type:'protect',targetId:'3'}}),mk(3,'villager')]);
 E.wwResolveNight(r);assert.equal(r.players.find(p=>p.userId==='3').alive,true);assert.equal(r.lastNight.saved,true);assert.equal(r.phase,'day');
});
test('บอดี้การ์ดรับเคราะห์แทนเป้าหมาย',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'bodyguard',{nightAction:{type:'protect',targetId:'3'}}),mk(3,'villager')]);
 E.wwResolveNight(r);assert.equal(r.players.find(p=>p.userId==='2').alive,false);assert.equal(r.players.find(p=>p.userId==='3').alive,true);assert.equal(r.lastNight.bodyguardSacrifice,true);
});
test('แม่มดช่วยชีวิตได้เฉพาะเป้าหมายที่หมาป่าเลือก',()=>{
 const ps=[mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'witch',{nightAction:{type:'save',targetId:'3'}}),mk(3,'villager')];
 const r=room(ps);E.wwResolveNight(r);assert.equal(r.players.find(p=>p.userId==='3').alive,true);assert.equal(r.lastNight.saved,true);
});
test('แม่มดใช้ยาพิษทำให้เป้าหมายตาย',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'witch',{nightAction:{type:'poison',targetId:'4'}}),mk(3,'villager'),mk(4,'villager')]);
 E.wwResolveNight(r);assert.equal(r.players.find(p=>p.userId==='4').alive,false);assert.equal(r.lastNight.poisoned,true);
});
test('นายพรานที่ถูกฆ่ากลางคืนเข้าสู่ช่วงยิงและวันถูกนับแล้ว',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'seer',{nightAction:{type:'inspect',targetId:'3'}}),mk(3,'hunter'),mk(4,'villager')]);
 E.wwResolveNight(r);assert.equal(r.phase,'hunter_shot');assert.equal(r.pendingHunterId,'3');assert.equal(r.dayNumber,1);assert.equal(r.players.find(p=>p.userId==='3').deathReason,'night');
});
test('ผู้หยั่งรู้และแม่มดต้องส่งคำสั่งก่อนคืนจบ',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'4'}}),mk(2,'seer'),mk(3,'witch'),mk(4,'villager')]);
 assert.equal(E.wwNightReady(r),false);r.players[1].nightAction={type:'inspect',targetId:'4'};r.players[2].nightAction={type:'skip'};assert.equal(E.wwNightReady(r),true);
});
test('เสมอเสียงหมาป่าไม่ฆ่าใคร',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'3'}}),mk(2,'wolf',{nightAction:{type:'kill',targetId:'4'}}),mk(3,'villager'),mk(4,'villager')]);
 assert.equal(E.wwWolfTarget(r),null);E.wwResolveNight(r);assert.equal(r.lastNight.wolfAttack,false);assert.equal(r.players.find(p=>p.userId==='3').alive,true);assert.equal(r.players.find(p=>p.userId==='4').alive,true);
});
test('เงื่อนไขชนะเมื่อหมาป่าหมด',()=>{
 const r=room([mk(1,'villager'),mk(2,'villager')]);assert.equal(E.wwCheckWin(r),true);assert.equal(r.winner,'village');
});
test('เงื่อนไขชนะเมื่อหมาป่าเท่ากับฝ่ายอื่น',()=>{
 const r=room([mk(1,'wolf'),mk(2,'villager')]);assert.equal(E.wwCheckWin(r),true);assert.equal(r.winner,'wolf');
});

test('สุ่มบทบาทครบทุกชนิดตามค่าที่เลือกและจำนวนผู้เล่น',()=>{
 const cfg={seer:true,witch:true,bodyguard:true,guardian:true,hunter:true,jester:true};
 const roles=E.wwBuildRoles(16,cfg,false);
 assert.equal(roles.length,16);for(const role of ['wolf','seer','witch','bodyguard','guardian','hunter','jester','villager'])assert(roles.includes(role),role+' missing');
 assert.equal(roles.filter(x=>x==='wolf').length,4);assert.equal(roles.filter(x=>x==='villager').length,6);
});
test('ปฏิเสธการตั้งค่าบทบาทที่ทำให้ไม่มีชาวบ้านเหลือ',()=>{
 assert.equal(E.wwBuildRoles(4,{seer:true,witch:true,bodyguard:true,guardian:true,hunter:true,jester:true},false),null);
});
test('ตัวตลกชนะทันทีเมื่อถูกโหวตออก',()=>{
 const r=room([mk(1,'wolf',{voted:'2'}),mk(2,'jester',{voted:'2'}),mk(3,'villager',{voted:'2'}),mk(4,'villager',{voted:'skip'})],{phase:'vote'});
 assert.equal(E.wwResolveVote(r),true);assert.equal(r.phase,'finished');assert.equal(r.winner,'jester');assert.equal(r.players.find(p=>p.userId==='2').alive,false);
});
test('นายพรานที่ถูกโหวตออกได้รับช่วงยิงก่อนเข้าสู่กลางคืน',()=>{
 const r=room([mk(1,'wolf',{voted:'2'}),mk(2,'hunter',{voted:'1'}),mk(3,'villager',{voted:'2'}),mk(4,'villager',{voted:'2'})],{phase:'vote'});
 E.wwResolveVote(r);assert.equal(r.phase,'hunter_shot');assert.equal(r.pendingHunterId,'2');assert.equal(r.players.find(p=>p.userId==='2').deathReason,'vote');
});
test('ชาวบ้านไม่ต้องส่งคำสั่งกลางคืน',()=>{
 const r=room([mk(1,'wolf',{nightAction:{type:'kill',targetId:'2'}}),mk(2,'villager'),mk(3,'villager')]);
 assert.equal(E.wwNightReady(r),true);
});
test('ผลตรวจผู้หยั่งรู้ไม่รั่วไปยังผู้เล่นอื่น',()=>{
 const r=room([mk(1,'seer',{seerResult:{targetName:'P2',isWolf:false}}),mk(2,'villager')]);
 const other=E.wwPublic(r,{session:{user:{id:2}}});assert.equal(other.me.seerResult,null);assert.equal(other.players[0].nightSubmitted,undefined);
});

const app=fs.readFileSync(__dirname+'/../public/app.js','utf8');
test('สถานะส่งคำสั่งกลางคืนไม่เปิดเผยรายบุคคล',()=>{assert(src.includes('nightSubmittedCount,nightRequiredCount:nightActors.length'));assert(!src.includes('left:!!p.left,role:roleReveal?p.role:undefined,nightSubmitted:!!p.nightAction'));});
test('การ์ดบทบาทส่วนตัวและผลตรวจถูกแสดงในหน้าเกม',()=>{
 assert(app.includes('${roleCard}${stage}'),'role card must be rendered before stage');
 assert(app.includes('ผลตรวจล่าสุด: <b>${esc(p.seerResult.targetName)}</b>'),'seer result name is rendered');
});
test('หน้าเกมแสดงสถานะ hunter_shot',()=>assert(app.includes("hunter_shot:'นายพรานตอบโต้'")));
test('เซิร์ฟเวอร์แยกการกลับไปกลางวัน/กลางคืนตามสาเหตุที่นายพรานตาย',()=>assert(src.includes("r.phase=hunter.deathReason==='night'?'day':'night'")));
test('เริ่มเกมใหม่ไม่คืนชีพผู้เล่นที่ออกจากเกมก่อนหน้า',()=>assert(src.includes('r.players=r.players.filter(p=>!p.left)')));
test('แม่มดใช้ยาช่วยชีวิตได้เฉพาะเป้าหมายที่หมาป่าโหวต',()=>assert(src.includes('String(targetId)!==String(wwWolfTarget(r)||\'\')')));
test('ผู้พิทักษ์ปกป้องคนเดิมติดกันไม่ได้',()=>assert(src.includes('ผู้พิทักษ์ห้ามปกป้องคนเดิมติดต่อกันสองคืน')));
console.log(`\n${passed} tests passed.`);
