'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
const roles = source.match(/function cheeseRolesFor\(count\)\{[\s\S]*?\nfunction cheeseFinish/);
const finish = source.match(/function cheeseFinish\(room,winner,result\)\{[\s\S]*?\nfunction cheeseResolveVote/);
const resolve = source.match(/function cheeseResolveVote\(room\)\{[\s\S]*?\napp\.get\('\/api\/cheese'/);
const pub = source.match(/function cheesePublic\(room,req\)\{[\s\S]*?\n\}/);
assert(roles && finish && resolve && pub, 'Cheese game helpers must exist');
const context = { isoNow: () => '2026-11-19T00:00:00.000Z', admin: () => false };
vm.createContext(context);
vm.runInContext(roles[0].replace(/\nfunction cheeseFinish$/, ''), context);
vm.runInContext(finish[0].replace(/\nfunction cheeseResolveVote$/, ''), context);
vm.runInContext(resolve[0].replace(/\napp\.get\('\/api\/cheese'$/, ''), context);
vm.runInContext(pub[0], context);
const room = (votes, roles=['thief','sleeper','watcher','sleeper']) => ({
 phase:'discussion',hostId:1,hostName:'P1',cheeseLeft:3,stolen:2,round:1,nightIndex:4,turnUserId:null,
 players:roles.map((role,i)=>({userId:i+1,name:`P${i+1}`,role,die:i+1,alive:true,voted:votes[i]||null,inspected:null})),
});
let r=room([2,1,1,1]);context.cheeseResolveVote(r);assert.equal(r.phase,'finished');assert.equal(r.winner,'village');
r=room([2,2,2,1]);context.cheeseResolveVote(r);assert.equal(r.winner,'thief');
r=room([2,2,1,1]);context.cheeseResolveVote(r);assert.equal(r.winner,'thief');
r=room([null,null,null,null]);const viewer={session:{user:{id:2,role:'member'}}};const data=context.cheesePublic(r,viewer);assert.equal(data.me.role,'sleeper');assert.equal(data.players[0].role,undefined);assert.equal(data.players[0].die,undefined);
assert(source.includes("if(r.players.length<4)return res.status(400)"), 'minimum player validation');
for (const n of [4,5,6,7,10]) { const assigned=context.cheeseRolesFor(n); assert.equal(assigned.length,n); assert.equal(assigned.filter(x=>x==='thief').length,1); assert.equal(assigned.filter(x=>x==='watcher').length,n>=5?1:0); assert.equal(assigned.filter(x=>x==='accomplice').length,n>=6?1:0); }
assert.equal(context.cheeseRolesFor(3),null); assert.equal(context.cheeseRolesFor(11),null);
assert(source.includes("if(String(r.turnUserId)!==String(p.userId))"), 'turn ownership validation');
assert(source.includes("if(String(target.userId)===String(p.userId))"), 'self-vote prevention');
console.log('CHEESE TESTS PASSED: role distribution (4–10 players), correct/wrong/tied votes, hidden-role privacy, turn lock, self-vote prevention');

// Render smoke tests for the actual browser view function (no browser/network needed).
const appSource = fs.readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
const viewMatch = appSource.match(/function cheese\(\)\{[\s\S]*?\n\}\nasync function wireCheese/);
assert(viewMatch, 'Cheese page renderer must exist');
const appContext = {
  cheeseState: { rooms: [], isAdmin: false, room: null },
  state: { user: { id: 1 } },
  esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  installCheeseStyles: () => {}
};
vm.createContext(appContext);
vm.runInContext(viewMatch[0].replace(/\nasync function wireCheese$/, ''), appContext);
assert(appContext.cheese().includes('สร้างห้องใหม่'), 'Lobby view renders create-room UI');
appContext.cheeseState.room = {
 id:'ch-test',code:'123456',title:'หนูขโมยชีส',phase:'night',hostId:1,hostName:'P1',cheeseLeft:5,
 nightOrder:[{name:'P1',turn:true,done:false}],turnName:'P1',voteCount:0,aliveCount:4,
 players:[{userId:1,name:'P1',alive:true},{userId:2,name:'P2',alive:true}],
 me:{userId:1,isHost:true,role:'thief',die:3,alive:true,acted:false,isMyTurn:true,voted:false}
};
const nightHtml=appContext.cheese();assert(nightHtml.includes('ขโมยชีส')&&nightHtml.includes('chSteal'), 'Thief night action renders');
appContext.cheeseState.room.phase='discussion';appContext.cheeseState.room.me.voted=false;
assert(appContext.cheese().includes('data-ch-vote'), 'Voting controls render');
console.log('CHEESE UI SMOKE TESTS PASSED: lobby, thief night action, discussion vote');
