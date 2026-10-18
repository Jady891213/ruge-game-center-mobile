import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
const advance=(h,ms)=>{for(let t=0;t<ms;t+=50)h.frame(50);};
const nativeFixture=`window.__audio={status:'listening',mode:'command',commandSerial:0,commandAgeMs:0,rms:.04};window.__starts=0;window.__stops=0;window.RugeAudioNative={read(){return JSON.stringify(window.__audio)},start(){window.__starts++},stop(){window.__stops++}};`;
const voicePage=()=>loadGame('voice-quest',{instrument:(s,i)=>(i===0?nativeFixture:'')+s});
test('口令地图人物沿路径移动并保留同一个实体，忙时按FIFO保留连续声音口令',()=>{
 const h=loadGame('voice-quest');try{const g=h.window.__game;g.openLevel(0,false);g.beginTouch();const actor=h.node('#actor');g.command('right');assert.equal(g.engine.snapshot().x,2);assert.equal(g.visual.x,1);advance(h,150);assert.ok(g.visual.x>1&&g.visual.x<2);assert.equal(h.node('#actor'),actor);assert.equal(g.command('up','voice').type,'busy');assert.equal(g.queued,'up');g.command('left','voice');assert.equal(g.queued,'up');assert.deepEqual(Array.from(g.commandQueue,q=>q.name),['up','left']);advance(h,250);assert.equal(g.engine.snapshot().x,2);assert.equal(g.engine.snapshot().y,1);assert.equal(g.queued,'left');advance(h,700);assert.equal(g.engine.snapshot().x,1);assert.equal(g.engine.snapshot().y,1);assert.equal(g.visual.x,1);assert.equal(g.visual.y,1);assert.equal(h.node('#actor'),actor);assert.equal(g.queued,null);}finally{h.dispose();}
});
test('停止清除下一条口令、暂停结束视觉位移且不在后台偷走',()=>{
 const h=loadGame('voice-quest');try{const g=h.window.__game;g.openLevel(0,false);g.beginTouch();g.command('right');g.command('right','voice');g.command('stop');assert.equal(g.queued,null);advance(h,600);assert.equal(g.engine.snapshot().x,2);g.command('right');g.pause();const before=JSON.stringify(g.engine.snapshot());advance(h,900);assert.equal(g.animation,null);assert.equal(JSON.stringify(g.engine.snapshot()),before);h.emitWindow('ruge:resume');assert.equal(g.paused,true);}finally{h.dispose();}
});
test('默认语音直接开始，通关下一关复用正在听的会话，不重复模式选择',()=>{
 const h=voicePage();try{const g=h.window.__game;g.openLevel(0,false);assert.equal(g.voice,true);assert.equal(g.paused,false);assert.equal(h.node('#ready').hidden,true);assert.equal(h.node('#pad').hidden,true);for(const c of h.window.VoiceQuestCore.solve(0)){g.command(c,'voice');advance(h,1000);}assert.equal(h.node('#win').hidden,false);const stops=h.window.__stops,starts=h.window.__starts;h.node('#next').onclick();assert.equal(g.engine.level.id,2);assert.equal(g.voice,true);assert.equal(g.paused,false);assert.equal(h.node('#ready').hidden,true);assert.equal(h.window.__starts,starts);assert.equal(h.window.__stops,stops);}finally{h.dispose();}
});
test('拿起、交付有持续动画和不同目标结算，旧草稿持物不丢',()=>{
 const h=loadGame('voice-quest',{storage:{rugeVoiceQuestV1:JSON.stringify({schema:1,reached:2,stars:{1:2},draft:{level:2,x:3,y:1,facing:'left',carrying:true,item:[3,1]}})}});try{const g=h.window.__game;g.openLevel(1);assert.equal(g.engine.snapshot().carrying,true);assert.equal(h.node('#carried').hidden,false);g.beginTouch();g.openLevel(1,false);g.beginTouch();for(const c of h.window.VoiceQuestCore.solve(1)){const r=g.command(c);if(r.type==='take'){assert.equal(g.animation.kind,'take');assert.equal(h.node('#carried').hidden,false);}if(r.type==='win'){assert.equal(g.animation.kind,'win');assert.equal(h.node('#win').hidden,true);}advance(h,1000);}assert.equal(h.node('#winTitle').textContent,'小兔吃到啦！');assert.equal(g.save.stars[1],2);assert.equal(g.save.stars[2],3);}finally{h.dispose();}
});
test('退出准备状态的异步麦克风不得重新打开界面',async()=>{
 const h=voicePage();try{h.window.__audio.status='loading';const g=h.window.__game;g.openLevel(0,false);g.pause();await Promise.resolve();assert.equal(g.paused,true);assert.equal(h.node('#pause').hidden,false);assert.equal(h.node('#ready').hidden,true);}finally{h.dispose();}
});
test('实时口令事件沿动画缓冲继续，过期识别不移动角色',()=>{
 const h=voicePage();try{const g=h.window.__game;g.openLevel(0,false);h.window.__audio.command='right';h.window.__audio.commandSerial=1;advance(h,150);assert.equal(g.engine.snapshot().x,2);h.window.__audio.command='up';h.window.__audio.commandSerial=2;advance(h,100);assert.equal(g.queued,'up');advance(h,600);assert.equal(g.engine.snapshot().y,1);h.window.__audio.command='left';h.window.__audio.commandSerial=3;h.window.__audio.commandAgeMs=2000;advance(h,400);assert.equal(g.engine.snapshot().x,2);}finally{h.dispose();}
});
test('首次进关从idle自动启动麦克风，准备完成自动进入而不再点模式',async()=>{
 const fixture=`window.__audio={status:'idle',mode:'',commandSerial:0,commandAgeMs:0,rms:0};window.__starts=0;window.RugeAudioNative={read(){return JSON.stringify(window.__audio)},stop(){window.__audio.status='idle'},start(mode){window.__starts++;window.__audio.status='listening';window.__audio.mode=mode}};`;
 const h=loadGame('voice-quest',{instrument:(s,i)=>(i===0?fixture:'')+s});try{const g=h.window.__game;g.openLevel(0,false);await Promise.resolve();advance(h,150);assert.equal(h.window.__starts,1);assert.equal(g.voice,true);assert.equal(g.paused,false);assert.equal(h.node('#ready').hidden,true);assert.equal(h.node('#pad').hidden,true);}finally{h.dispose();}
});
