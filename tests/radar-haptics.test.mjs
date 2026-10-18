import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
import '../app/assets/pocket-radar/challenge-core.js';
import '../app/assets/pocket-radar/haptics.js';
const C=globalThis.RadarChallenge,H=globalThis.RadarHaptics;
function state(error=180,mode='safe'){const s=C.create(mode,2);s.target={heading:0,elevation:0};s.heading=error;s.elevation=0;return s;}
function sample(error){const h=H.create(C),s=state(error),pulses=[];for(let time=0;time<2400;time+=10){const p=h.next(s,time);if(p)pulses.push({...p,time});}return pulses;}
test('七档距离反馈逐渐更密、更强、更长，中心比有效边缘明确且不靠hold触发',()=>{
 const distances=[180,100,60,40,25,12,0],rows=distances.map(sample);
 for(let i=1;i<rows.length;i++){assert.ok(rows[i].length>rows[i-1].length,distances[i]+'频率');assert.ok(rows[i][0].strength>rows[i-1][0].strength);assert.ok(rows[i][0].duration>rows[i-1][0].duration);}
 assert.equal(rows.at(-1)[0].strength,255);assert.equal(rows.at(-1)[0].duration,35);
 for(const pulses of rows)for(let i=1;i<pulses.length;i++)assert.ok(pulses[i].time-pulses[i-1].time>=110,'留出原生限频余量');
});
test('拨动有独立六度刻度：慢转不会被周期信号重置；轻微抖动不伪造刻度',()=>{
 const h=H.create(C),s=state(180);h.next(s,0);const out=[];
 for(let time=50;time<=3000;time+=50){s.heading=180+time*.0025;const p=h.next(s,time);if(p)out.push(p);}
 assert.ok(out.some(p=>p.kind==='detent'),'3秒慢移7.5度仍应出现刻度');assert.ok(out.filter(p=>p.kind==='detent').every(p=>p.strength>=105&&p.duration>=16));
 const stable=H.create(C),quiet=[];for(let time=0;time<3000;time+=20){s.heading=180+Math.sin(time)*1.5;const p=stable.next(s,time);if(p)quiet.push(p);}assert.equal(quiet.some(p=>p.kind==='detent'),false);
});
test('转动时接近信号不被弱刻度遮盖；359/0穿越与大角度快转不爆发补发',()=>{
 const h=H.create(C),s=state(180);h.next(s,0);s.heading=3;const p=h.next(s,150);assert.equal(p.strength,255);assert.equal(p.duration,35);assert.equal(p.band,6);
 const wrap=H.create(C);s.target.heading=180;s.heading=359;wrap.next(s,0);s.heading=1;assert.equal(wrap.next(s,150),null,'2度跨界不误判358度拨动');s.heading=6;assert.equal(wrap.next(s,250).kind,'detent');
 const rapid=H.create(C),out=[];for(let time=0;time<1200;time+=10){s.heading=time%360;const p=rapid.next(s,time);if(p)out.push({time,...p});}assert.ok(out.length<=11);assert.ok(out.every(p=>p.strength<=255&&p.duration<=35));
});
test('空间反馈同时取方向和俯仰，背对弱、抬错低于抬准；新关保护成功确认450ms',()=>{
 const h=H.create(C),s=state(0,'space');s.target.elevation=35;s.elevation=-35;const low=h.profile(s);s.elevation=35;const aligned=h.profile(s);assert.ok(aligned.strength>low.strength);assert.ok(aligned.interval<low.interval);s.heading=180;s.elevation=-35;assert.equal(h.profile(s).band,0);
 h.reset(1000,450);assert.equal(h.next(s,1100),null);assert.equal(h.next(s,1449),null);assert.ok(h.next(s,1450));s.finished=true;assert.equal(h.next(s,1700),null);
});
test('真实页面：暂停/过期/长帧立即停，回前台不补震；通关后不打断确认效果',()=>{
 const h=loadGame('pocket-radar');try{const g=h.window.__game,out=[];h.window.RugeFX={emit(n){out.push({event:n});},pulse(a,d){out.push({a,d});}};
  g.start('safe',2);g.setMode('touch');g.setDirection(g.state().target.heading);for(let i=0;i<29;i++)g.step(.1,i*100);const before=out.filter(p=>p.event==='success').length;g.step(.1,2900);assert.equal(out.filter(p=>p.event==='success').length,before+1);const count=out.length;for(let t=2950;t<3350;t+=50)g.step(.05,t);assert.equal(out.length,count);g.step(.05,3400);assert.ok(out.length>count);
  g.pause();const paused=out.length;g.step(.1,3600);assert.equal(out.length,paused);g.resume();g.step(2,5000);assert.equal(out.length,paused);h.document.hidden=true;g.step(.1,5200);assert.equal(out.length,paused);
 }finally{h.dispose();}
});
test('真实姿态入口：样本过期时停止输出，恢复后从新反馈开始不补发旧刻度',()=>{
 const inject='window.__pose={available:true,heading:0,elevation:0,age:0,generation:1};window.RugeOrientation={coordinateSystem(){return "camera-relative-360-v1"},sample(){return JSON.stringify(window.__pose)}};';
 const h=loadGame('pocket-radar',{instrument:(s,i)=>i===0?inject+s:s});try{const out=[],g=h.window.__game;h.window.RugeFX={emit(){},pulse(a,d){out.push([a,d]);}};g.start('safe',2);h.window.__pose.heading=g.state().target.heading;g.step(.05,500);assert.equal(out.length,1);h.window.__pose.age=751;g.step(.05,650);assert.equal(out.length,1);assert.equal(h.node('#posture').hidden,false);assert.equal(g.state().hold,0);h.window.__pose.age=0;g.step(.05,800);assert.equal(out.length,2);assert.equal(h.node('#posture').hidden,true);
 }finally{h.dispose();}
});
