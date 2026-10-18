import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadGame} from './helpers/html-vm.mjs';
const scope=vm.createContext({});vm.runInContext(readFileSync(new URL('../app/assets/pitch-adventure/core.js',import.meta.url),'utf8'),scope);const C=scope.PitchAdventureCore;
const copy=x=>JSON.parse(JSON.stringify(x));
function advanceUntil(g,predicate,max=30000){let n=0,events=[];while(!predicate(g.snapshot())&&n++<max)events.push(...g.step(1/120));assert.ok(n<max,'condition reached');return events;}
function playFromCues(index,delay=0){const g=C.create(index),seen=new Set(),scheduled=new Map(),events=[];let frames=0;while(!g.snapshot().won&&frames++<20000){const s=g.snapshot(),cue=g.cue();if(cue&&!seen.has(cue.obstacle)){seen.add(cue.obstacle);scheduled.set(cue.obstacle,{action:cue.action,when:s.time+delay});}for(const [id,event]of scheduled)if(s.time>=event.when){assert.equal(g.act(event.action),true,'cue input accepted');scheduled.delete(id);}events.push(...g.step(1/60));}return{g,events,seen};}
test('18关按真实提示第一帧发一个动作均零碰撞通关，含连续坑/树枝/混合障碍',()=>{
  for(let i=0;i<18;i++){const {g,events,seen}=playFromCues(i);assert.equal(g.snapshot().won,true,'第'+(i+1)+'关');assert.equal(g.snapshot().falls,0);assert.equal(seen.size,g.level.obstacles.length);assert.equal(events.filter(e=>e.type==='jump').length,g.level.obstacles.filter(o=>o.type!=='branch').length);assert.equal(events.filter(e=>e.type==='duck').length,g.level.obstacles.filter(o=>o.type==='branch').length);}
});
test('18关从提示起延迟1.2秒或1.45秒到达的输入仍可通过，提供儿童反应与语音时间',()=>{
  for(const delay of [1.2,1.45])for(let i=0;i<18;i++){const {g}=playFromCues(i,delay);assert.equal(g.snapshot().won,true,'第'+(i+1)+'关，延迟'+delay);assert.equal(g.snapshot().falls,0);}
});
test('提前预约立即显示已收到，只在安全起跳区执行一次，不因连续输入重复跳跃',()=>{
  const g=C.create(0);advanceUntil(g,()=>!!g.cue());const at=g.snapshot();assert.ok(g.cue().distance>145);assert.equal(g.act('jump'),true);assert.equal(g.cue().phase,'queued');assert.equal(g.snapshot().vy,0);assert.deepEqual(copy(g.snapshot().pending),{action:'jump',obstacle:0});for(let i=0;i<20;i++)assert.equal(g.act('jump'),false);let events=advanceUntil(g,s=>s.activeJump===0);assert.ok(g.snapshot().x>=g.level.obstacles[0].x-26);assert.equal(g.snapshot().pending,null);assert.equal(events.filter(e=>e.type==='jump').length,1);for(let i=0;i<50;i++){assert.equal(g.act('jump'),false);events.push(...g.step(1/120));}assert.equal(events.filter(e=>e.type==='jump').length,1);assert.ok(g.snapshot().x>at.x);
});
test('一次蹲预约维持至整根树枝通过，并及时释放，不串到下一个障碍',()=>{
  const g=C.create(4);advanceUntil(g,()=>!!g.cue());assert.equal(g.act('duck'),true);advanceUntil(g,s=>s.x>g.level.obstacles[0].x+g.level.obstacles[0].w+24);assert.equal(g.snapshot().falls,0);advanceUntil(g,s=>g.cue()?.obstacle===1);assert.equal(g.snapshot().activeDuck,-1);assert.equal(g.snapshot().duck,0);assert.equal(g.snapshot().pending,null);advanceUntil(g,s=>s.falls>0);assert.equal(g.snapshot().falls,1,'one cue must not handle both branches');
});
test('坑边晚到8px仍可起跳，岩石/树枝前沿提供短纠错窗口并显示紧急提示',()=>{
  for(const index of [0,6,3]){const g=C.create(index),o=g.level.obstacles[0],target=o.type==='gap'?o.x+8:o.x-8;advanceUntil(g,s=>s.x>=target||s.falls>0);assert.equal(g.snapshot().falls,0);assert.equal(g.cue().phase,'late');assert.equal(g.act(o.type==='branch'?'duck':'jump'),true);advanceUntil(g,s=>s.x>o.x+o.w+30||s.falls>0);assert.equal(g.snapshot().falls,0);}
});
test('晚跳越过检查点后落地也会登记安全位置，恢复不退回整段起点',()=>{
  const g=C.create(0),o=g.level.obstacles[0];advanceUntil(g,s=>s.x>=o.x+8);assert.equal(g.act('jump'),true);advanceUntil(g,s=>s.x>o.x+o.w+65&&s.y===330);assert.equal(g.snapshot().checkpoint,o.x+o.w+46);assert.equal(C.create(0,g.save()).snapshot().x,o.x+o.w+46);
});
test('没有正确动作仍会失败；远离障碍时手指起跳立即生效',()=>{
  const wrong=C.create(0);advanceUntil(wrong,()=>!!wrong.cue());assert.equal(wrong.act('duck'),true);assert.equal(wrong.snapshot().pending,null);advanceUntil(wrong,s=>s.falls>0);assert.equal(wrong.snapshot().falls,1);const free=C.create(0);assert.equal(free.act('jump'),true);assert.equal(free.snapshot().vy,-480);assert.equal(free.snapshot().pending,null);assert.equal(free.step(.016).filter(e=>e.type==='jump').length,1);assert.equal(free.act('jump'),false);
});
test('暂停与草稿恢复清除未执行预约，不在后台消费，也不把旧命令带回新一局',()=>{
  const g=C.create(0);advanceUntil(g,()=>!!g.cue());g.act('jump');g.pause();assert.equal(g.snapshot().pending,null);const before=copy(g.snapshot());assert.deepEqual(copy(g.step(.12)),[]);assert.deepEqual(copy(g.snapshot()),before);assert.equal(g.act('jump'),false);g.pause(false);const events=advanceUntil(g,s=>s.falls>0);assert.equal(events.filter(e=>e.type==='jump').length,0);const restarted=C.create(0,g.save());assert.equal(restarted.snapshot().pending,null);
});
test('真实UI在18关提示首次出现就按对应按钮，下一关/三星保存持续正常',()=>{
  const h=loadGame('pitch-adventure',{entry:'legacy.html'});try{const ui=h.window.__game;ui.openLevel(0);for(let i=0;i<18;i++){ui.beginTouch();const seen=new Set();let n=0;while(!ui.engine.snapshot().won&&n++<20000){const cue=ui.engine.cue();if(cue&&!seen.has(cue.obstacle)){seen.add(cue.obstacle);h.node(cue.action==='jump'?'#jump':'#duck').onclick();assert.match(h.node('#cue').textContent,/✓/);}h.frame(16);}assert.equal(ui.engine.snapshot().won,true,'第'+(i+1)+'关');assert.equal(ui.engine.snapshot().falls,0);assert.equal(h.node('#win').hidden,false);assert.equal(ui.save.stars[i+1],3);if(i<17)h.node('#next').onclick();}assert.equal(ui.save.reached,18);}finally{h.dispose();}
});
test('真实UI切后台清除预约，回前台保持暂停，继续后不执行旧输入',()=>{
  const h=loadGame('pitch-adventure',{entry:'legacy.html'});try{const ui=h.window.__game;ui.openLevel(0);ui.beginTouch();for(let i=0;i<1000&&!ui.engine.cue();i++)h.frame(16);h.node('#jump').onclick();assert.ok(ui.engine.snapshot().pending);h.emitWindow('ruge:pause');assert.equal(ui.engine.snapshot().pending,null);const before=JSON.stringify(ui.engine.snapshot());h.emitWindow('ruge:resume');h.frame(200);assert.equal(ui.paused,true);assert.equal(JSON.stringify(ui.engine.snapshot()),before);ui.resume();for(let i=0;i<400&&!ui.engine.snapshot().falls;i++)h.frame(16);assert.equal(ui.engine.snapshot().falls,1);}finally{h.dispose();}
});
test('声音模式运行只发数字pulse保持触觉，停止麦克风后才播胜利；触摸音效正常',async()=>{
  const h=loadGame('pitch-adventure',{entry:'legacy.html',instrument(source,index){if(index===0)source="window.__audioStops=0;window.__calls=[];window.__sample={status:'listening',ageMs:0,pitch:320,rms:.05,confidence:.99};window.RugeAudioNative={start(){},stop(){window.__audioStops++;window.__calls.push(['audio-stop'])},read(){return JSON.stringify(window.__sample)}};"+source;if(source.includes("KEY='rugePitchAdventureV1'"))source="window.RugeFX={emit:n=>window.__calls.push(['emit',n]),pulse:(a,b)=>window.__calls.push(['pulse',a,b]),stop:()=>window.__calls.push(['fx-stop'])};"+source;return source;}});
  try{const ui=h.window.__game;ui.openLevel(0);await ui.beginVoice();for(let n=0;n<100;n++)h.frame(16);assert.equal(ui.paused,false);h.window.__calls.length=0;ui.action('jump');h.frame(16);assert.ok(h.window.__calls.some(c=>c[0]==='pulse'&&Number.isFinite(c[1])&&Number.isFinite(c[2])));assert.ok(!h.window.__calls.some(c=>c[0]==='emit'));const seen=new Set();for(let n=0;n<1500&&!ui.engine.snapshot().won;n++){const cue=ui.engine.cue();if(cue&&!seen.has(cue.obstacle)){seen.add(cue.obstacle);ui.action(cue.action);}h.frame(16);}assert.equal(ui.engine.snapshot().won,true);const calls=Array.from(h.window.__calls),win=calls.findIndex(c=>c[0]==='emit'&&c[1]==='win');assert.ok(win>=0);assert.ok(calls.slice(0,win).some(c=>c[0]==='audio-stop'));assert.deepEqual(calls.filter(c=>c[0]==='emit').map(c=>c[1]),['win']);
    ui.openLevel(0);ui.beginTouch();h.window.__calls.length=0;ui.action('jump');h.frame(16);assert.ok(h.window.__calls.some(c=>c[0]==='emit'&&c[1]==='jump'));assert.ok(!h.window.__calls.some(c=>c[0]==='pulse'));
  }finally{h.dispose();}
});
