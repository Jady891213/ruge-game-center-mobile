import '../app/assets/shared/motion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/tilt-star-box/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.TiltStarBox,copy=x=>JSON.parse(JSON.stringify(x));

test('翻转星星盒36关真实BFS可解，原12关短解不变，四向滑动而非重复换皮',()=>{
 assert.equal(C.LEVELS.length,36);const lengths=[];
 C.LEVELS.forEach((l,i)=>{
  const s=C.createState(i),initial=copy(s),answer=C.solve(i);assert.ok(answer,'第 '+(i+1)+' 关可解');
  answer.moves.forEach(d=>{const result=C.move(s,d);assert.ok(result?.moved);assert.ok(C.validPositions(s.positions,l));});
  assert.equal(s.finished,true);assert.ok(C.won(s.positions,l));assert.equal(s.moves,answer.moves.length);lengths.push(answer.moves.length);assert.deepEqual(C.createState(i),initial);
 });
 assert.deepEqual(lengths.slice(0,12),[1,2,3,4,5,4,5,5,5,6,7,8]);assert.equal(new Set(C.LEVELS.map(l=>l.walls.join(',')+'|'+l.balls+'|'+l.goals)).size,36);
 assert.deepEqual(C.LEVELS.slice(0,12).map(l=>l.balls.length),[1,1,1,1,1,2,2,1,2,2,2,2]);assert.equal(C.LEVELS[11].w,5);
 assert.throws(()=>C.createState(-1));assert.throws(()=>C.createState(C.LEVELS.length));
});
test('同方向全部星星滑动，后星跟随前星但不能重叠；墙与同色巢及时截停',()=>{
 const l=C.parse(['AB.a','.##.','....','...b'],99);
 let r=C.slide(l,l.balls,'right');assert.deepEqual(r.positions,[2,3]);assert.deepEqual(r.paths,[[0,1,2],[1,2,3]]);assert.equal(r.finished,false);
 r=C.slide(l,[2,3],'down');assert.deepEqual(r.positions,[2,15]);assert.equal(r.finished,false); // A above a wall, B reaches blue nest.
 r=C.slide(l,[2,15],'up');assert.deepEqual(r.positions,[2,15]);assert.equal(r.moved,false); // Settled B stays put.
 const goal=C.parse(['A.a.','....','....','....'],99);r=C.slide(goal,goal.balls,'right');assert.deepEqual(r.positions,[2]);assert.equal(r.finished,true);assert.deepEqual(r.paths,[[0,1,2]]);
 const blocked=C.parse(['A#..','....','....','...a'],99);assert.equal(C.slide(blocked,blocked.balls,'right').moved,false);
});
test('滑动可整体撤回，完成不能重复走或奖励，撤销完成恢复活动局',()=>{
 const s=C.createState(9),initial=copy(s),answer=C.solve(9);answer.moves.forEach(d=>{const before=copy(s);assert.ok(C.move(s,d));assert.equal(C.undo(s),true);assert.deepEqual(s,before);assert.ok(C.move(s,d));});
 assert.equal(s.finished,true);assert.equal(C.move(s,'up'),null);while(C.undo(s)){}assert.deepEqual(s,initial);assert.equal(C.undo(s),false);
 for(const bad of ['sideways',null,{},4])assert.equal(C.move(s,bad),null);
});
test('存档严格重放历史，保留合法进度；坏档和伪造终局不能进入游戏',()=>{
 const s=C.createState(10),answer=C.solve(s).moves;answer.slice(0,3).forEach(d=>C.move(s,d));
 const raw={schema:1,stars:[3,2,0],session:s};assert.deepEqual(C.restore(copy(raw)).session,s);assert.deepEqual(C.restore(raw).stars,[3,2,...Array(C.LEVELS.length-2).fill(0)]);
 for(const change of [s=>s.positions[0]=999,s=>s.positions[0]=s.positions[1],s=>s.finished=true,s=>s.moves=999,s=>s.history.push('sideways'),s=>s.level=C.LEVELS.length,s=>s.history=Array(1001).fill('up')]){const bad=copy(raw);change(bad.session);assert.equal(C.restore(bad).session,null);}
 for(const bad of [null,{},[],{schema:2},{schema:1,session:{}}])assert.equal(C.restore(bad).session,null);
 const bad=copy(raw);delete bad.session.positions[0];assert.equal(C.restore(bad).session,null);
 answer.slice(3).forEach(d=>C.move(s,d));assert.equal(C.restore(copy(raw)).session.finished,true);
});
test('倾斜门限稳定110ms，保持方向只触发一次；回中/换向可以再触发',()=>{
 const g=C.createDirectionGate(),sample=(x,y,n=8)=>Array.from({length:n},()=>g.read(x,y,.02)).filter(Boolean);
 assert.deepEqual(sample(.17,0),[]);assert.deepEqual(sample(.25,0,4),[]);assert.deepEqual(sample(.25,0,2),['right']);assert.deepEqual(sample(.4,0,40),[]);
 assert.deepEqual(sample(0,-.3),['up']);assert.deepEqual(sample(.01,.01),[]);assert.deepEqual(sample(0,-.3),['up']);
 g.reset(true);assert.deepEqual(sample(.3,0,50),[]);sample(.04,.04);assert.deepEqual(sample(.3,0),['right']);
 g.reset();assert.equal(g.read(NaN,0,.05),null);assert.equal(g.read(.3,0,-1),null);assert.equal(g.read(.3,0,5),null);assert.equal(g.status().elapsed,.05);
});
test('倾斜方向抖动取消候选，不把短噪声和回前台读数累计为动作',()=>{
 const g=C.createDirectionGate();for(let i=0;i<40;i++)assert.equal(g.read(i%2?.3:0,i%2?0:.3,.02),null);
 g.reset(true);for(let i=0;i<30;i++)assert.equal(g.read(.5,0,.02),null);g.read(0,0,.02);for(let i=0;i<5;i++)assert.equal(g.read(.5,0,.02),null);assert.equal(g.read(.5,0,.02),'right');
});

test('真实页面36关连续通关、动作动画互斥、选关和独立存档',()=>{
 const g=loadGame('tilt-star-box');try{
  const a=g.window.__game;assert.equal(g.node('#levels').children[1].disabled,true);a.start(0);
  for(let i=0;i<C.LEVELS.length;i++){
   for(const d of C.solve(i).moves){assert.equal(a.act(d),true);assert.equal(a.busy(),true);assert.equal(a.act(d),false);g.tick(500);}
   assert.equal(a.state().finished,true);assert.equal(g.node('#win').hidden,false);assert.equal(a.progress()[i],3);g.node('#next').onclick();
  }
  assert.equal(g.node('#menu').hidden,false);assert.ok(g.node('#levels').children.every(b=>!b.disabled));assert.equal(C.restore(JSON.parse(g.saved.get(a.storageKey))).session.finished,true);
 }finally{g.dispose();}
});
test('真实页面撤销/重置确认保留草稿，暂停取消动画且恢复不补发奖励',()=>{
 const g=loadGame('tilt-star-box');try{
  const a=g.window.__game;a.start(1);a.act('right');assert.equal(a.busy(),true);a.pause();assert.equal(a.busy(),false);assert.equal(a.act('down'),false);g.tick(1000);assert.equal(a.state().moves,1);assert.equal(g.node('#pause').hidden,false);a.resume();assert.equal(a.gate.status().neutralWait,true);
  g.node('#undo').onclick();assert.equal(a.state().moves,0);a.act('right');g.tick(500);g.node('#restart').onclick();assert.equal(g.node('#confirm').hidden,false);assert.equal(a.act('down'),false);g.node('#cancelRestart').onclick();assert.equal(a.state().moves,1);
  g.node('#restart').onclick();g.node('#confirmRestart').onclick();assert.equal(a.state().moves,0);
  a.act('right');g.tick(500);a.act('down');a.pause();assert.equal(g.node('#win').hidden,true);a.resume();assert.equal(g.node('#win').hidden,false);
 }finally{g.dispose();}
});
test('封面静默不写游戏档，坏JSON安全回选关；触摸模式入口始终可用',()=>{
 const cover=loadGame('tilt-star-box',{storage:{rugeTiltStarBoxV1:'keep'},instrument:s=>s.replace("cover=/[?&]cover=1(?:&|$)/.test(location.search)","cover=true")});
 try{assert.equal(cover.window.__game.state().level,8);cover.emitWindow('pagehide');cover.window.__game.menu();assert.equal(cover.saved.get('rugeTiltStarBoxV1'),'keep');}finally{cover.dispose();}
 const g=loadGame('tilt-star-box',{storage:{rugeTiltStarBoxV1:'{bad'}});try{const a=g.window.__game;assert.equal(a.state(),null);a.start(0);a.pause();g.node('#pauseTouch').onclick();assert.equal(a.mode(),'touch');assert.equal(g.node('#pause').hidden,true);assert.equal(a.act('right'),true);g.tick(500);assert.equal(a.state().finished,true);}finally{g.dispose();}
});

test('真实页面倾斜输入经共享桥读数只走一次，过期和暂停恢复都要求先回中',()=>{
 const g=loadGame('tilt-star-box',{instrument:s=>s.replace('window.RugeMotion.create()','({read:()=>window.__sample||{x:0,y:0,available:true,fresh:true},release(){},setMode(){},destroy(){},status(){return {}},calibrate(){return true;}})')});
 try{
  const a=g.window.__game;a.start(2);g.frame(20);g.window.__sample={x:0,y:.3,available:true,fresh:true};for(let i=0;i<8;i++)g.frame(20);assert.equal(a.state().moves,1);g.tick(500);
  for(let i=0;i<50;i++)g.frame(20);assert.equal(a.state().moves,1);
  g.window.__sample={x:0,y:0,available:false,fresh:false};g.frame(20);g.window.__sample={x:-.3,y:0,available:true,fresh:true};for(let i=0;i<20;i++)g.frame(20);assert.equal(a.state().moves,1);
  g.window.__sample={x:0,y:0,available:true,fresh:true};g.frame(20);g.window.__sample={x:-.3,y:0,available:true,fresh:true};for(let i=0;i<8;i++)g.frame(20);assert.equal(a.state().moves,2);a.pause();g.tick(1000);g.emitWindow('ruge:resume');for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,2);assert.equal(g.node('#pause').hidden,false);
  a.resume();g.window.__sample={x:0,y:-.3,available:true,fresh:true};for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,2);g.window.__sample={x:0,y:0,available:true,fresh:true};g.frame(20);g.window.__sample={x:0,y:-.3,available:true,fresh:true};for(let i=0;i<8;i++)g.frame(20);assert.equal(a.state().moves,3);assert.equal(a.state().finished,true);
 }finally{g.dispose();}
});

test('手持非零角度进入、切回倾斜和继续时自动归零，无须把手机平放',()=>{
 const base={x:0,y:.5,z:Math.sqrt(.75),available:true,age:0,source:'test'};
 const g=loadGame('tilt-star-box',{instrument:s=>s.replace('const native = w.RugeTilt;',`const native = {sample:()=>JSON.stringify(window.__native||${JSON.stringify(base)})};`)});
 try{
  const a=g.window.__game;a.start(2);assert.equal(a.motionStatus().calibrated,true);for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,0);
  g.window.__native={...base,y:.8,z:.6};for(let i=0;i<15;i++)g.frame(20);assert.equal(a.state().moves,1);g.tick(500);
  a.setMode('touch');a.setMode('tilt');for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,1);assert.equal(a.gate.status().neutralWait,false);
  a.pause();g.window.__native={...base,x:.4,y:.6,z:Math.sqrt(.48)};a.resume();for(let i=0;i<30;i++)g.frame(20);assert.equal(a.state().moves,1);assert.equal(a.gate.status().neutralWait,false);
 }finally{g.dispose();}
});
test('传感器首次样本迟到时只校准一次，不将初始手持角度当作移动',()=>{
 const g=loadGame('tilt-star-box',{instrument:s=>s.replace('const native = w.RugeTilt;',`const native = {sample:()=>JSON.stringify(window.__native||{x:0,y:0,z:1,available:false,age:0})};`)});
 try{
  const a=g.window.__game;a.start(2);assert.equal(a.pendingCalibration(),true);for(let i=0;i<20;i++)g.frame(20);assert.equal(a.state().moves,0);
  g.window.__native={x:0,y:.5,z:Math.sqrt(.75),available:true,age:0};for(let i=0;i<30;i++)g.frame(20);assert.equal(a.pendingCalibration(),false);assert.equal(a.state().moves,0);
  g.window.__native={x:0,y:.8,z:.6,available:true,age:0};for(let i=0;i<15;i++)g.frame(20);assert.equal(a.state().moves,1);
 }finally{g.dispose();}
});

test('走到无解局只短亮撤回入口，不自动重置或泄露下一步，撤销后提示解除',()=>{
 for(const [level,direction] of [[5,'right'],[8,'up']]){
  const g=loadGame('tilt-star-box');try{
   const a=g.window.__game;a.start(level);const before=JSON.stringify(a.state());assert.equal(a.act(direction),true);assert.equal(a.busy(),true);assert.equal(g.node('#undo').classList.contains('suggestUndo'),false);g.tick(500);assert.equal(C.solve(a.state()),null);
   assert.equal(a.state().moves,1);assert.equal(g.node('#undo').classList.contains('suggestUndo'),true);g.tick(5000);assert.equal(a.state().moves,1);
   g.node('#undo').onclick();assert.equal(JSON.stringify(a.state()),before);assert.equal(g.node('#undo').classList.contains('suggestUndo'),false);
  }finally{g.dispose();}
 }
});

test('翻转星星盒拒绝继承属性作为方向，坏历史不恢复',()=>{for(const direction of ['constructor','toString','__proto__','valueOf']){const s=C.createState(0),before=copy(s);assert.equal(C.move(s,direction),null);assert.deepEqual(s,before);const corrupt={schema:1,stars:Array(12).fill(0),session:{...s,history:[direction],moves:1}};assert.equal(C.restore(corrupt).session,null);}});
