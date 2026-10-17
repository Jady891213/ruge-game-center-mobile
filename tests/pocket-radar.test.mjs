import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
import '../app/assets/pocket-radar/core.js';
const C=globalThis.PocketRadar;

test('口袋探宝：18把保险箱逐个实际转动、停稳并打开',()=>{
 assert.equal(C.SAFE_LEVELS.length,18);
 for(const l of C.SAFE_LEVELS){const s=C.createSafe(l.id);for(const target of l.code){
  while(Math.abs(s.angle-target)>.5)C.safeStep(s,s.angle+Math.sign(target-s.angle)*Math.min(1.5,Math.abs(target-s.angle)),.05);
  for(let i=0;i<24&&s.index<l.code.length&&!s.finished;i++){const before=s.index;C.safeStep(s,target,.05);if(s.index>before)break;}
 }assert.equal(s.finished,true,'safe '+(l.id+1));assert.equal(s.index,l.code.length);assert.ok(s.elapsed>0);}
});
test('保险箱：经过正确角度不算成功，离开或失效样本清停留，不跨暂停累计',()=>{
 const s=C.createSafe(0),target=C.SAFE_LEVELS[0].code[0];C.safeStep(s,target,.05);assert.equal(s.index,0);
 for(let i=0;i<6;i++)C.safeStep(s,target,.05);assert.ok(s.hold>0);C.safeStep(s,target,.05,false);assert.equal(s.hold,0);
 for(let i=0;i<6;i++)C.safeStep(s,target,.05);C.safeStep(s,target+20,.05);assert.equal(s.hold,0);assert.equal(s.finished,false);
 C.safeStep(s,NaN,.05);assert.equal(s.hold,0);
});
test('探宝：18张图的全部目标均可用真实移动规则绕开障碍到达并挖出',()=>{
 assert.equal(C.RADAR_LEVELS.length,18);
 for(const l of C.RADAR_LEVELS){const s=C.createRadar(l.id);for(const target of l.targets){
  assert.equal(C.blocked(l,target.x,target.y),false);
  const key=(x,y)=>x+','+y,grid=40,start=[Math.round(s.x*grid),Math.round(s.y*grid)];
  const queue=[{p:start,parent:null}],seen=new Set([key(...start)]);let found=null;
  for(let head=0;head<queue.length;head++){const node=queue[head],[x,y]=node.p;if(Math.hypot(x/grid-target.x,y/grid-target.y)<.045){found=node;break;}
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(nx<3||nx>37||ny<4||ny>37||seen.has(k)||C.blocked(l,nx/grid,ny/grid))continue;seen.add(k);queue.push({p:[nx,ny],parent:node});}
  }
  assert.ok(found,'reachable target in '+(l.id+1));const path=[];while(found){path.unshift(found.p);found=found.parent;}
  for(const [x,y]of path){for(let k=0;k<150&&Math.hypot(s.x-x/grid,s.y-y/grid)>.008;k++){
   const dx=x/grid-s.x,dy=y/grid-s.y,n=Math.hypot(dx,dy);C.radarMove(s,dx/n,dy/n,Math.min(.02,n/.42));
  }}assert.equal(C.dig(s),true,'dig at '+(l.id+1));
 }assert.equal(s.finished,true,'radar '+(l.id+1));}
});
test('探宝：乱挖不透露答案不跳关，墙体不能穿过，信号随接近增大',()=>{
 const s=C.createRadar(10);assert.equal(C.dig(s),false);assert.equal(s.index,0);const t=C.RADAR_LEVELS[s.level].targets[0],far=C.radarSignal(s);s.x=t.x;s.y=t.y;assert.ok(C.radarSignal(s)>far);
 s.x=.35;s.y=.43;for(let i=0;i<80;i++)C.radarMove(s,1,0,.02);assert.ok(s.x<.43);assert.equal(C.blocked(C.RADAR_LEVELS[s.level],s.x,s.y),false);
});
test('探宝存档：坏值回退、旧游戏键保留，保留进度而不恢复半次停稳',()=>{
 const saved=C.restore({schema:1,stars:{safe:[3]},bests:{safe:[12.4]},session:{mode:'safe',level:6,index:1,hold:99,elapsed:8.2}});
 assert.equal(saved.stars.safe[0],3);assert.equal(saved.bests.safe[0],12.4);assert.equal(saved.session.index,1);assert.equal(saved.session.hold,0);
 const invalid=C.restore({schema:1,session:{mode:'radar',level:999}});assert.equal(invalid.session,null);
});
test('真实UI：暂停阻止开锁、后台不自动继续、重置确认清本关保进度',t=>{
 const h=loadGame('pocket-radar',{storage:{otherGame:'unchanged'}});t.after(()=>h.dispose());const g=h.window.__game;
 assert.equal(h.node('#levels').children.length,18);g.start(0,'safe');g.setMode('touch');g.setAngle(-32);g.step(.05,100);g.pause();const before=JSON.stringify(g.state());g.step(.1,200);assert.equal(JSON.stringify(g.state()),before);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();h.node('#reset').onclick();assert.equal(h.node('#confirm').hidden,false);h.node('#confirmReset').onclick();assert.equal(g.state().index,0);assert.equal(h.saved.get('otherGame'),'unchanged');
});
test('双人：同一密码轮流玩，不计入单人星星与进度',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game;g.start(0,'safe',true);assert.equal(h.node('#handover').hidden,false);h.node('#ready').onclick();g.setMode('touch');g.setAngle(-32);for(let i=0;i<25;i++)g.step(.05,100+i*50);assert.equal(g.state().finished,true);h.node('#next').onclick();assert.equal(g.state().index,0);assert.equal(g.state().level,0);assert.equal(h.node('#handover').hidden,false);assert.equal(g.progress().safe[0],0);
});
test('双人：交接时切后台可明确继续，不会被交接层与暂停层互相锁死',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game;
 g.start(0,'safe',true);g.pause();assert.equal(h.node('#handover').hidden,true);assert.equal(h.node('#pause').hidden,false);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();assert.equal(g.isPaused(),false);assert.equal(h.node('#pause').hidden,true);assert.equal(h.node('#handover').hidden,false);
 h.node('#ready').onclick();g.setMode('touch');g.setAngle(-32);for(let i=0;i<25;i++)g.step(.05,100+i*50);h.node('#next').onclick();g.pause();g.resume();assert.equal(h.node('#handover').hidden,false);assert.match(h.node('#handoverTitle').textContent,/二/);h.node('#ready').onclick();assert.equal(h.node('#handover').hidden,true);assert.equal(g.state().index,0);
});
test('完成关卡菜单继续和重启恢复均显示结算与下一关，不进入无法操作的死局',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game;g.start(0,'safe');g.setAngle(-32);for(let i=0;i<25;i++)g.step(.05,100+i*50);assert.equal(g.state().finished,true);g.menu();h.node('#continue').onclick();assert.equal(h.node('#win').hidden,false);assert.equal(h.node('#next').textContent,'下一关');
 h.emitWindow('pagehide');const restored=loadGame('pocket-radar',{storage:Object.fromEntries(h.saved)});t.after(()=>restored.dispose());restored.node('#continue').onclick();assert.equal(restored.window.__game.state().finished,true);assert.equal(restored.node('#win').hidden,false);restored.node('#next').onclick();assert.equal(restored.window.__game.state().level,1);
});
test('传感器失效明确显示手指备用且冻结计时，手指入口立即恢复游戏',t=>{
 const h=loadGame('pocket-radar',{instrument:(src,i)=>i===0?'window.RugeTilt={sample(){return JSON.stringify({available:false,age:9000,x:0,y:0,z:1})}};'+src:src});t.after(()=>h.dispose());const g=h.window.__game;
 for(const kind of ['radar','safe']){g.start(0,kind);g.setMode('sensor');for(let i=0;i<10;i++)g.step(.1,i*100);assert.equal(g.state().elapsed,0);assert.equal(h.node('#posture').hidden,false);assert.equal(h.node('#postureText').textContent,'试试手指');h.node('#fallback').onclick();assert.equal(h.node('#posture').hidden,true);assert.equal(h.node('#touchControls').hidden,false);g.step(.1,1200);assert.ok(g.state().elapsed>0);}
});
test('双人体感每位玩家必须先转正，再开始计时，不能预对密码抢先通关',t=>{
 const inject='window.__tilt={available:true,age:0,x:-.5299192642,y:.8480480962,z:0};window.RugeTilt={sample(){return JSON.stringify(window.__tilt)}};';
 const h=loadGame('pocket-radar',{instrument:(src,i)=>i===0?inject+src:src});t.after(()=>h.dispose());const g=h.window.__game;
 g.start(0,'safe',true);h.node('#ready').onclick();for(let i=0;i<20;i++)g.step(.05,i*50);assert.equal(g.state().elapsed,0);assert.equal(g.state().index,0);assert.equal(h.node('#postureText').textContent,'先转正');h.window.__tilt.x=0;h.window.__tilt.y=1;g.step(.05,1100);assert.ok(g.state().elapsed>0);assert.equal(h.node('#posture').hidden,true);
});
test('地图拖动切后台后释放，继续时仅pointermove不会恢复旧拖动',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game;g.start(0,'radar');h.node('#board').dispatch('pointerdown',{clientX:300,clientY:100});g.step(.05,100);g.pause();g.resume();const before=[g.state().x,g.state().y];h.node('#board').dispatch('pointermove',{clientX:100,clientY:100});g.step(.05,200);assert.deepEqual([g.state().x,g.state().y],before);
});
test('双人完整比赛保留单人草稿和最佳成绩，相同显示用时判平局',t=>{
 const h=loadGame('pocket-radar',{storage:{otherGame:'keep'}});t.after(()=>h.dispose());const g=h.window.__game;
 g.start(6,'radar');const target=C.RADAR_LEVELS[6].targets[0];g.setPosition(target.x,target.y);g.dig();const single=JSON.parse(h.saved.get(g.storageKey));
 g.start(0,'safe',true);
 for(let player=1;player<=2;player++){
  h.node('#ready').onclick();g.setMode('touch');for(let i=0;i<(player===1?80:86);i++)g.step(.01,i*10);g.setAngle(-32);g.step(.01,1000);for(let i=0;i<65;i++)g.step(.01,1010+i*10);assert.equal(g.state().finished,true);if(player===1)h.node('#next').onclick();
 }
 assert.equal(h.node('#winTitle').textContent,'一样快！');assert.equal(h.node('#result').textContent,'① 1.5 秒\n② 1.5 秒');g.menu();const after=JSON.parse(h.saved.get(g.storageKey));assert.deepEqual(after.session,single.session);assert.deepEqual(after.stars,single.stars);assert.deepEqual(after.bests,single.bests);assert.equal(h.saved.get('otherGame'),'keep');h.node('#continue').onclick();assert.equal(g.state().mode,'radar');assert.equal(g.state().index,1);
});
test('挖错提示保留700ms，不会被下一次动画帧立即覆盖',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game;g.start(0,'radar');assert.equal(g.dig(),false);h.frame(16);assert.equal(h.node('#cue').textContent,'再找找');h.frame(710);assert.equal(h.node('#cue').textContent,'找宝箱');
});
test('获胜清除探测震动后仅触发一次win反馈，不立即把获胜震动取消',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game,events=[];h.window.RugeFX={emit(name){events.push(name);},pulse(){return true;}};h.window.RugeFeedback={cancelVibration(){events.push('cancel');}};
 g.start(0,'safe');events.length=0;g.setAngle(-32);for(let i=0;i<25;i++)g.step(.05,i*50);assert.equal(events.filter(e=>e==='win').length,1);assert.equal(events.at(-1),'win');g.start(0,'radar');events.length=0;const target=C.RADAR_LEVELS[0].targets[0];g.setPosition(target.x,target.y);g.dig();assert.deepEqual(events,['cancel','win']);
});
