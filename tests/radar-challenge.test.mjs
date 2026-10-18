import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
import '../app/assets/pocket-radar/challenge-core.js';
const C=globalThis.RadarChallenge;
const input=(s,extra={})=>({available:true,heading:s.target.heading,elevation:s.target.elevation,age:0,...extra});
function hold(s,seconds=3){let result;for(let i=0;i<seconds*100;i++)result=C.step(s,input(s),.01)||result;return result;}
test('无尽开锁与空间：两种模式皆需连续三秒，随机目标、加时、难度与圆周跨越',()=>{
 for(const mode of ['safe','space']){const s=C.create(mode,16);const t={...s.target};hold(s,2.99);assert.equal(s.cleared,0);assert.ok(s.hold>2.98);const result=C.step(s,input(s),.01);assert.equal(s.cleared,1);assert.equal(result.type,'clear');assert.equal(result.bonus,12);assert.ok(s.remaining>68.99);assert.equal(s.hold,0);assert.notDeepEqual(s.target,t);for(let i=0;i<30;i++)hold(s);assert.equal(s.cleared,31);assert.equal(C.tolerance(s),mode==='safe'?7:9);assert.ok(s.remaining<=90);}
 const s=C.create('safe',1);s.target.heading=359;assert.ok(C.distance(s,1,0)<3);assert.equal(C.delta(359,1),-2);assert.equal(C.wrap(-1),359);
});
test('不能经过即开锁、不能跨离开/暂停/长帧/过期样本累计；计时归零不额外通关',()=>{
 const s=C.create('safe',1);hold(s,2);C.step(s,input(s,{heading:s.target.heading+40}),.01);assert.equal(s.hold,0);hold(s,2);C.interrupt(s);assert.equal(s.hold,0);hold(s,2);C.step(s,input(s,{age:751}),.1);assert.equal(s.hold,0);const time=s.remaining;C.step(s,input(s),5);assert.equal(s.remaining,time);assert.equal(s.cleared,0);hold(s,2);s.remaining=.01;assert.equal(C.step(s,input(s),.01),'timeout');assert.equal(s.cleared,0);assert.equal(s.finished,true);
});
test('空间方向+俯仰均须对准，背向信号弱，上下错位不通关',()=>{
 const s=C.create('space',6);s.target={heading:5,elevation:30};s.heading=185;s.elevation=-30;assert.ok(C.signal(s)<.001);s.heading=5;s.elevation=-30;assert.ok(C.signal(s)>.66);for(let i=0;i<350;i++)C.step(s,input(s,{elevation:-30}),.01);assert.equal(s.cleared,0);hold(s,3.02);assert.equal(s.cleared,1);
});
test('角度0到360连续绕行，每个目标均有可达解；种子重放且两个模式独立',()=>{
 for(const mode of ['safe','space']){const a=C.create(mode,200),b=C.create(mode,200);assert.deepEqual(a.target,b.target);for(let n=0;n<25;n++){for(let h=0;h<360;h+=2)C.step(a,{available:true,heading:h,elevation:0,age:0},.01);assert.equal(a.cleared,n);hold(a,3.02);assert.equal(a.cleared,n+1);}}
 assert.deepEqual(C.restoreRecords({schema:1,safe:7,space:NaN}),{schema:1,safe:7,space:0});
});
test('真实UI：两入口、单局不改旧存档；暂停/转屏必须明确继续且清三秒进度',t=>{
 const old='{"schema":1,"stars":{"safe":[3]},"session":{"mode":"safe","level":2}}';const h=loadGame('pocket-radar',{storage:{rugePocketRadarV1:old,otherGame:'keep'}});t.after(()=>h.dispose());const g=h.window.__game;
 h.node('#safeStart').onclick();assert.equal(g.state().mode,'safe');g.setMode('touch');g.setDirection(g.state().target.heading);for(let i=0;i<40;i++)g.step(.05,i*50);assert.ok(g.state().hold>1.9);g.pause();assert.equal(g.state().hold,0);const state=JSON.stringify(g.state());g.step(.1,2500);assert.equal(JSON.stringify(g.state()),state);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();assert.equal(g.state().hold,0);h.emitWindow('ruge:orientation');assert.equal(g.isPaused(),true);assert.equal(h.saved.get('rugePocketRadarV1'),old);assert.equal(h.saved.get('otherGame'),'keep');
});
test('UI通关即时续关加时/最高记录、超时可重玩、保存独立于历史星数草稿',t=>{
 const h=loadGame('pocket-radar',{storage:{rugePocketRadarV1:'legacy'}});t.after(()=>h.dispose());const g=h.window.__game;g.start('space',33);g.setMode('touch');g.setDirection(g.state().target.heading,g.state().target.elevation);for(let i=0;i<60;i++)g.step(.05,i*50);assert.equal(g.state().round,2);assert.equal(g.records().space,1);assert.equal(h.node('#bonus').hidden,false);assert.equal(h.node('#win').hidden,true);g.state().remaining=.01;g.step(.05,4000);assert.equal(h.node('#win').hidden,false);assert.match(h.node('#result').textContent,/1/);h.node('#next').onclick();assert.equal(g.state().round,1);assert.equal(g.state().remaining,60);assert.equal(h.saved.get('rugePocketRadarV1'),'legacy');
});
test('原生adapter：相对360、穿越359/0、过期与generation重启，不借重力替代方向',t=>{
 const inject='window.__pose={available:true,heading:350,elevation:8,age:0,generation:1};window.RugeOrientation={coordinateSystem(){return "camera-relative-360-v1"},sample(){return JSON.stringify(window.__pose)}};';const h=loadGame('pocket-radar',{instrument:(src,i)=>i===0?inject+src:src});t.after(()=>h.dispose());const g=h.window.__game;g.start('safe',12);assert.equal(g.inputMode(),'sensor');h.window.__pose.heading=10;g.step(.05,1);assert.equal(g.state().heading,20);h.window.__pose.heading=349;g.step(.05,2);assert.equal(g.state().heading,359);h.window.__pose.age=751;const time=g.state().remaining;g.step(.05,3);assert.equal(g.state().remaining,time);assert.equal(h.node('#posture').hidden,false);h.window.__pose.age=0;h.window.__pose.generation=2;g.step(.05,4);assert.equal(g.isPaused(),true);g.resume();g.step(.05,5);assert.equal(g.state().heading,359);
});
test('探测反馈共用RugeFX，接近/背向强弱和频率不同，暂停不输出脉冲',t=>{
 const h=loadGame('pocket-radar');t.after(()=>h.dispose());const g=h.window.__game,events=[];h.window.RugeFX={emit(n){events.push(n);},pulse(a,d){events.push([a,d]);}};g.start('safe',7);g.setMode('touch');g.setDirection(g.state().target.heading+180);g.step(.05,1000);const far=events.filter(Array.isArray).at(-1);g.setDirection(g.state().target.heading);g.step(.05,2000);g.step(.05,2100);const near=events.filter(Array.isArray).at(-1);assert.ok(near[0]>far[0]);assert.ok(near[1]>far[1]);g.pause();const count=events.length;g.step(.1,4000);assert.equal(events.length,count);
});
