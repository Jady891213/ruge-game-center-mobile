import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/shared/motion.js';
import '../app/assets/number-merge/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.NumberMerge,copy=x=>JSON.parse(JSON.stringify(x));
const total=a=>a.reduce((n,v)=>n+v,0);

test('数字碰碰12固定关真实BFS可解，答案不超过10，后10关必须换向且中段有干扰数字',()=>{
 assert.equal(C.LEVELS.length,12);const lengths=[];
 C.LEVELS.forEach((l,i)=>{const s=C.createState(i),before=copy(s),answer=C.solve(i);assert.ok(answer,'第'+(i+1)+'关');assert.ok(l.goals.every(g=>g.value>0&&g.value<=10));assert.ok(new Set(l.walls).size===l.walls.length);assert.ok(l.goals.every(g=>!l.walls.includes(g.p)&&!l.cells[g.p]));
  answer.moves.forEach(d=>{const sum=total(s.cells);assert.ok(C.move(s,d));assert.equal(total(s.cells),sum);assert.ok(C.validCells(s.cells,l));});assert.equal(s.finished,true);assert.equal(C.won(s.cells,l),true);lengths.push(s.moves);assert.deepEqual(C.createState(i),before);
  if(i>=2){assert.ok(new Set(answer.moves).size>=2);for(const d of Object.keys(C.DIRECTIONS)){const same=C.createState(i);for(let n=0;n<20;n++)if(!C.move(same,d))break;assert.equal(same.finished,false,'第'+(i+1)+'关不能一直'+d);}}
 });
 assert.deepEqual(lengths,[1,1,2,3,3,4,4,4,4,4,5,6]);
 for(const i of [7,8]){const s=C.createState(i);C.solve(s).moves.forEach(d=>C.move(s,d));assert.ok(s.cells.filter(Boolean).length>C.LEVELS[i].goals.length,'多余数字无需清空');}
 assert.deepEqual(C.LEVELS.map(l=>l.goals.length),[1,1,1,1,1,1,1,1,1,2,2,2]);assert.throws(()=>C.createState(12));
});
test('任意两个数相加而非2048翻倍，每个数字单步最多合一次，10以上不合并',()=>{
 const level=C.define(99,4,2,[],[[0,1],[1,2],[2,3]],[[4,6]]);let r=C.slide(level,level.cells,'right');
 assert.deepEqual(r.cells,[0,0,1,5,0,0,0,0]);assert.equal(r.merges,1);assert.deepEqual(r.mergeEvents,[{a:3,b:2,sum:5,p:3}]);assert.equal(r.finished,false);
 const doubles=C.define(99,4,2,[],[[0,1],[1,1],[2,1],[3,1]],[[4,4]]);r=C.slide(doubles,doubles.cells,'right');assert.deepEqual(r.cells,[0,0,2,2,0,0,0,0]);assert.equal(r.merges,2);
 const max=C.define(99,4,2,[],[[0,5],[1,6]],[[4,3]]);r=C.slide(max,max.cells,'right');assert.deepEqual(r.cells,[0,0,5,6,0,0,0,0]);assert.equal(r.merges,0);
});
test('只有指定星格上的正确数才锁定，路过会停住，锁定块不移动不再合并',()=>{
 const l=C.define(99,4,2,[],[[0,3],[4,1]],[[2,3]]);let r=C.slide(l,l.cells,'right');assert.deepEqual(r.cells,[0,0,3,0,0,0,0,1]);assert.equal(r.finished,true);assert.equal(C.locked(l,r.cells,2),true);
 r=C.slide(l,r.cells,'down');assert.equal(r.cells[2],3);assert.equal(r.cells[7],1);
 const wrong=C.define(99,4,2,[],[[0,3]],[[4,3]]);r=C.slide(wrong,wrong.cells,'right');assert.equal(r.finished,false);assert.equal(r.cells[3],3);
 const atGoal=C.define(99,4,2,[],[[0,1],[1,2]],[[3,3]]);r=C.slide(atGoal,atGoal.cells,'right');assert.equal(r.cells[3],3);assert.equal(r.finished,true);
 const blocked=C.define(99,4,2,[1],[[0,1]],[[7,3]]);assert.equal(C.slide(blocked,blocked.cells,'right').moved,false);
});
test('撤回整步还原所有合并与目标，完成/无效动作不重复写历史',()=>{
 for(let i=0;i<12;i++){const s=C.createState(i),initial=copy(s);for(const d of C.solve(i).moves){const before=copy(s);assert.ok(C.move(s,d));assert.equal(C.undo(s),true);assert.deepEqual(s,before);C.move(s,d);}assert.equal(s.finished,true);assert.equal(C.move(s,'right'),null);while(C.undo(s)){}assert.deepEqual(s,initial);assert.equal(C.undo(s),false);}
 const s=C.createState(0),before=copy(s);for(const d of ['constructor','toString','__proto__','unknown',null,5,{},[]]){assert.equal(C.move(s,d),null);assert.deepEqual(s,before);assert.equal(C.slide(C.LEVELS[0],s.cells,d),null);}
});
test('存档严格重放历史保留进度，拒绝伪造数字/完成/原型方向/洞数组',()=>{
 const s=C.createState(11);C.solve(s).moves.slice(0,3).forEach(d=>C.move(s,d));const raw={schema:1,stars:[3,2],session:s};assert.deepEqual(C.restore(copy(raw)).session,s);assert.deepEqual(C.restore(raw).stars,[3,2,0,0,0,0,0,0,0,0,0,0]);
 for(const mutate of [s=>s.cells[0]=10,s=>s.cells[1]=NaN,s=>s.cells[3]=1,s=>s.finished=true,s=>s.moves=44,s=>s.history.push('constructor'),s=>s.history.push('toString'),s=>s.history.push('__proto__'),s=>s.level=12,s=>delete s.cells[0],s=>s.history=Array(501).fill('up')]){const bad=copy(raw);mutate(bad.session);assert.equal(C.restore(bad).session,null);}
 for(const bad of [null,{},[],{schema:2},{schema:1,session:{}}])assert.equal(C.restore(bad).session,null);
 C.solve(s).moves.forEach(d=>C.move(s,d));assert.equal(C.restore(copy(raw)).session.finished,true);
});
test('真实页面12关连续完成、动画阻止重入、独立存档与关卡解锁',()=>{
 const g=loadGame('number-merge');try{const a=g.window.__game;assert.equal(g.node('#levels').children[1].disabled,true);a.start(0);
  for(let i=0;i<12;i++){for(const d of C.solve(i).moves){assert.equal(a.act(d),true);assert.equal(a.busy(),true);assert.equal(a.act(d),false);g.tick(500);}assert.equal(a.state().finished,true);assert.equal(g.node('#win').hidden,false);assert.equal(a.progress()[i],3);g.node('#next').onclick();}
  assert.equal(g.node('#menu').hidden,false);assert.ok(g.node('#levels').children.every(b=>!b.disabled));assert.equal(C.restore(JSON.parse(g.saved.get(a.storageKey))).session.finished,true);
 }finally{g.dispose();}
});
test('真实页面合并无解可撤回，重置确认不丢草稿，后台落定不重放奖励',()=>{
 const g=loadGame('number-merge');try{const a=g.window.__game;a.start(7);let bad=null;for(const d of Object.keys(C.DIRECTIONS)){const s=C.createState(7);if(C.move(s,d)&&!C.solve(s)){bad=d;break;}}assert.ok(bad);const before=JSON.stringify(a.state());a.act(bad);a.pause();assert.equal(a.busy(),false);assert.equal(a.act('down'),false);g.tick(1000);assert.equal(a.state().moves,1);assert.equal(g.node('#pause').hidden,false);a.resume();assert.equal(a.gate.status().neutralWait,true);assert.equal(g.node('#undo').classList.contains('suggestUndo'),true);a.undo();assert.equal(JSON.stringify(a.state()),before);assert.equal(g.node('#undo').classList.contains('suggestUndo'),false);
  a.act(C.solve(7).moves[0]);g.tick(500);g.node('#restart').onclick();assert.equal(g.node('#confirm').hidden,false);assert.equal(a.act('down'),false);g.node('#cancelRestart').onclick();assert.equal(a.state().moves,1);g.node('#restart').onclick();g.node('#confirmRestart').onclick();assert.equal(a.state().moves,0);
  a.start(0);a.act('right');a.pause();assert.equal(g.node('#win').hidden,true);a.resume();assert.equal(g.node('#win').hidden,false);
 }finally{g.dispose();}
});
test('封面不读写存档且静默，坏JSON返回选关，暂停保留点方向入口',()=>{
 const cover=loadGame('number-merge',{storage:{rugeNumberMergeV1:'keep',other:'safe'},instrument:s=>s.replace("cover=/[?&]cover=1(?:&|$)/.test(location.search)","cover=true")});try{assert.equal(cover.window.__game.state().level,8);cover.emitWindow('pagehide');cover.window.__game.menu();assert.equal(cover.saved.get('rugeNumberMergeV1'),'keep');assert.equal(cover.saved.get('other'),'safe');}finally{cover.dispose();}
 const g=loadGame('number-merge',{storage:{rugeNumberMergeV1:'{bad'}});try{const a=g.window.__game;assert.equal(a.state(),null);a.start(0);a.pause();g.node('#pauseTouch').onclick();assert.equal(a.mode(),'touch');assert.equal(g.node('#pause').hidden,true);assert.equal(a.act('right'),true);g.tick(500);assert.equal(a.state().finished,true);}finally{g.dispose();}
});
test('倾斜门限和共享输入只触发一次，过期/恢复要求回中，不能后台自动补动作',()=>{
 const g=loadGame('number-merge',{instrument:s=>s.replace('window.RugeMotion.create()','({read:()=>window.__sample||{x:0,y:0,available:true,fresh:true},release(){},setMode(){},destroy(){},status(){return {}},calibrate(){return true;}})')});try{const a=g.window.__game;a.start(11);g.frame(20);g.window.__sample={x:.3,y:0,available:true,fresh:true};for(let i=0;i<8;i++)g.frame(20);assert.equal(a.state().moves,1);g.tick(500);for(let i=0;i<40;i++)g.frame(20);assert.equal(a.state().moves,1);
  g.window.__sample={x:0,y:0,available:false,fresh:false};g.frame(20);g.window.__sample={x:0,y:.3,available:true,fresh:true};for(let i=0;i<20;i++)g.frame(20);assert.equal(a.state().moves,1);g.window.__sample={x:0,y:0,available:true,fresh:true};g.frame(20);g.window.__sample={x:0,y:.3,available:true,fresh:true};for(let i=0;i<8;i++)g.frame(20);assert.equal(a.state().moves,2);a.pause();g.tick(1000);g.emitWindow('ruge:resume');for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,2);a.resume();for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,2);
 }finally{g.dispose();}
});
test('手持初始倾角自动归零，迟到首样本只校准，之后变化才是出手',()=>{
 const g=loadGame('number-merge',{instrument:s=>s.replace('const native = w.RugeTilt;',`const native = {sample:()=>JSON.stringify(window.__native||{x:0,y:0,z:1,available:false,age:0})};`)});try{const a=g.window.__game;a.start(11);assert.equal(a.pendingCalibration(),true);for(let i=0;i<20;i++)g.frame(20);assert.equal(a.state().moves,0);g.window.__native={x:0,y:.5,z:Math.sqrt(.75),available:true,age:0};for(let i=0;i<30;i++)g.frame(20);assert.equal(a.pendingCalibration(),false);assert.equal(a.state().moves,0);g.window.__native={x:0,y:.8,z:.6,available:true,age:0};for(let i=0;i<15;i++)g.frame(20);assert.equal(a.state().moves,1);g.tick(500);a.setMode('touch');a.setMode('tilt');for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,1);
 }finally{g.dispose();}
});

test('连续两次合并都重新播放算式反馈，暂停/撤回/换关清除旧算式',()=>{
 const g=loadGame('number-merge');try{const a=g.window.__game;a.start(3);a.act('right');g.tick(500);assert.equal(g.node('#equation').classList.contains('show'),true);const first=g.node('#equation').textContent;assert.ok(first.includes(' + '));g.tick(2000);a.act('up');assert.equal(g.node('#equation').classList.contains('show'),false);assert.equal(g.node('#equation').textContent,'');g.tick(500);assert.equal(g.node('#equation').classList.contains('show'),true);assert.notEqual(g.node('#equation').textContent,first);a.undo();assert.equal(g.node('#equation').textContent,'');a.act('up');g.tick(500);a.pause();assert.equal(g.node('#equation').classList.contains('show'),false);assert.equal(g.node('#equation').textContent,'');a.resume();a.start(4);assert.equal(g.node('#equation').textContent,'');assert.equal(g.node('#pieces').classList.contains('merged'),false);}finally{g.dispose();}
});
