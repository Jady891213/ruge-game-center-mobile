import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
const OLD={rugePitchAdventureV1:'{"reached":7,"stars":{"1":3},"draft":{"index":6}}',rugePitchEndlessV1:'{"schema":1,"best":19}',sentinel:'keep'};
function page(options={}){
  return loadGame('pitch-adventure',{storage:{...OLD,...options.storage},instrument(source,index){
    if(index===0)source=`window.__rotations=[];window.RugeScreen={set:o=>window.__rotations.push(o),get:()=> 'landscape'};window.__starts=0;window.__stops=0;window.__active=false;window.__sample={status:'listening',ageMs:0,pitch:320,rms:.035,confidence:.99};window.RugeAudioNative={start(){window.__starts++;window.__active=true},stop(){window.__stops++;window.__active=false},read(){return JSON.stringify({...window.__sample,mode:window.__active?'pitch':'',status:window.__active?window.__sample.status:'idle'})}};`+source;
    return options.instrument?options.instrument(source,index):source;
  }});
}
function frames(h,n){for(let i=0;i<n;i++)h.frame(16);}
async function voice(h){await h.window.__game.beginVoice();frames(h,80);assert.equal(h.window.__game.state.calibrating,false);assert.equal(h.window.__game.state.paused,false);}
function unchangedOld(h){for(const [key,value]of Object.entries(OLD))assert.equal(h.saved.get(key),value,key);}
test('新飞行默认开始走音高校准，未发声不能自动前进，稳定轻哼后开始',async()=>{
  const h=page();try{const g=h.window.__game;assert.equal(h.window.__starts,0);h.window.__sample.pitch=0;h.window.__sample.rms=0;await h.node('#startVoice').onclick();frames(h,40);assert.equal(g.state.calibrating,true);assert.equal(g.engine.snapshot().distance,0);assert.equal(h.node('#calibrationPanel').hidden,false);h.window.__sample={status:'listening',ageMs:0,pitch:320,rms:.035,confidence:.99};frames(h,20);assert.equal(g.engine.snapshot().distance,0);assert.equal(g.state.calibrating,true);frames(h,60);assert.equal(g.state.calibrating,false);assert.equal(g.state.paused,false);assert.ok(g.engine.snapshot().distance>0);assert.ok(h.window.__starts>=1);}finally{h.dispose();}
});
test('持续高音连续上升，持续低音连续下降；普通音/静音停留，不用喊得更响',async()=>{
  const h=page();try{const g=h.window.__game;await voice(h);h.window.__sample.pitch=440;frames(h,24);const a=g.engine.snapshot();frames(h,24);const b=g.engine.snapshot();assert.ok(b.targetY<a.targetY-20);h.window.__sample.pitch=225;frames(h,24);const c=g.engine.snapshot();frames(h,24);const d=g.engine.snapshot();assert.ok(d.targetY>c.targetY+20);h.window.__sample.pitch=320;frames(h,15);const level=g.engine.snapshot().targetY;for(const rms of [.009,.09,.3]){h.window.__sample.rms=rms;frames(h,12);assert.equal(g.engine.snapshot().targetY,level);}h.window.__sample.pitch=0;h.window.__sample.rms=0;frames(h,30);assert.equal(g.engine.snapshot().targetY,level);unchangedOld(h);}finally{h.dispose();}
});
test('真正声音处理链以0.5秒一次的粗调通过20道门，三颗心保留',async()=>{
  const h=page();try{const g=h.window.__game;await voice(h);let turns=0;while(g.engine.snapshot().score<20&&turns++<600){const s=g.engine.snapshot(),gate=s.gates.find(o=>!o.passed),d=gate.center-s.targetY;h.window.__sample.pitch=d>48?225:d< -48?440:320;frames(h,31);assert.notEqual(g.engine.snapshot().phase,'over');}assert.ok(g.engine.snapshot().score>=20);assert.equal(g.engine.snapshot().lives,3);unchangedOld(h);}finally{h.dispose();}
});
test('后台和页面退出停止麦克风；回前台保持暂停，不能自动重新收音或运动',async()=>{
  const h=page();try{const g=h.window.__game;await voice(h);h.emitWindow('ruge:pause');const s=JSON.stringify(g.engine.snapshot()),starts=h.window.__starts;assert.equal(g.state.paused,true);assert.equal(h.window.__active,false);h.emitWindow('ruge:resume');frames(h,100);assert.equal(JSON.stringify(g.engine.snapshot()),s);assert.equal(h.window.__starts,starts);await g.resume();frames(h,20);assert.equal(g.state.paused,false);assert.ok(h.window.__starts>starts);h.emitWindow('pagehide');assert.equal(h.window.__active,false);}finally{h.dispose();}
});
test('校准中切后台立即取消；旧收音结果不能越过暂停重新开始',async()=>{
  const h=page();try{const g=h.window.__game;h.window.__sample.pitch=0;await g.beginVoice();frames(h,12);h.emitWindow('ruge:pause');h.window.__sample.pitch=320;frames(h,120);assert.equal(g.state.paused,true);assert.equal(g.state.calibrating,false);assert.equal(g.engine.snapshot().distance,0);assert.equal(h.node('#pausePanel').hidden,false);}finally{h.dispose();}
});
test('申请收音未完成时切按钮模式，迟到Promise不能把触摸局改回声音局',async()=>{
  const h=page();try{const g=h.window.__game;let resolve;h.window.RugeAudioInput.start=()=>new Promise(r=>resolve=r);const pending=g.beginVoice();g.beginTouch();frames(h,20);const distance=g.engine.snapshot().distance;resolve(true);await pending;frames(h,10);assert.equal(g.state.voice,false);assert.equal(g.state.calibrating,false);assert.equal(g.state.paused,false);assert.ok(g.engine.snapshot().distance>=distance);assert.equal(h.node('#calibrationPanel').hidden,true);}finally{h.dispose();}
});
test('重复开始声音以最后请求为准；旧请求不能重置已开始的新局',async()=>{
  const h=page();try{const g=h.window.__game;const resolvers=[];h.window.RugeAudioInput.start=()=>new Promise(r=>resolvers.push(r));const a=g.beginVoice(),b=g.beginVoice();assert.equal(resolvers.length,2);resolvers[1](true);await b;h.window.__active=true;frames(h,80);assert.equal(g.state.paused,false);const engine=g.engine,token=g.state.requestToken,distance=g.engine.snapshot().distance;resolvers[0](true);await a;frames(h,10);assert.equal(g.engine,engine);assert.equal(g.state.requestToken,token);assert.ok(g.engine.snapshot().distance>=distance);assert.equal(g.state.voice,true);}finally{h.dispose();}
});
test('新飞行只写独立存档；暂停重来和回首页不碰旧18关或其他游戏',()=>{
  const h=page();try{const g=h.window.__game;g.beginTouch();for(let n=0;n<10000&&g.engine.snapshot().phase!=='over';n++){g.hold(n%100<50?-1:1);h.frame(16);}h.emitWindow('pagehide');const keys=[...h.saved.keys()].filter(k=>!(k in OLD));assert.deepEqual(keys,['rugePitchFlightV1']);const saved=JSON.parse(h.saved.get('rugePitchFlightV1'));assert.equal(saved.schema,1);unchangedOld(h);g.restart();g.menu();unchangedOld(h);}finally{h.dispose();}
});
test('封面不读写存档、不申请麦克风；画面不运行物理',()=>{
  const h=page({instrument(source,index){return index===0?"location.search='?cover=1';"+source:source;}});try{const g=h.window.__game,before=JSON.stringify(g.engine.snapshot());frames(h,120);h.emitWindow('pagehide');assert.equal(h.window.__starts,0);assert.equal(JSON.stringify(g.engine.snapshot()),before);assert.deepEqual([...h.saved],Object.entries(OLD));}finally{h.dispose();}
});
test('图片不可用的真实脚本仍绘画，无不合法Canvas ellipse，按钮开局可运行',()=>{
  const h=page({instrument(source,index){return index===0?"window.__ellipses=0;document.getElementById('canvas').getContext('2d').ellipse=(...a)=>{if(a.length<7)throw new TypeError('ellipse requires seven arguments');window.__ellipses++};"+source:source;}});try{h.window.__game.beginTouch();frames(h,60);assert.ok(h.window.__game.engine.snapshot().distance>0);assert.ok(h.window.__ellipses>0);}finally{h.dispose();}
});

test('固定横屏：进入请求landscape，后台暂停不改方向，真正离开才portrait',()=>{
  const h=page();try{assert.ok(h.window.__rotations.includes('landscape'));h.window.__game.beginTouch();h.emitWindow('ruge:pause');assert.equal(h.window.__rotations.at(-1),'landscape');h.emitWindow('ruge:resume');assert.equal(h.window.__rotations.at(-1),'landscape');h.node('#home').onclick();assert.equal(h.window.__rotations.at(-1),'portrait');}finally{h.dispose();}
});

test('真实声音链中音或静音不能一直挂机通关，云门必须主动改变高度',async()=>{
  for(const pitch of [320,0]){const h=page();try{const g=h.window.__game;await voice(h);h.window.__sample.pitch=pitch;if(!pitch)h.window.__sample.rms=0;let n=0;while(g.engine.snapshot().phase!=='over'&&g.engine.snapshot().score<12&&n++<5000)h.frame(16);assert.equal(g.engine.snapshot().phase,'over',`holding pitch ${pitch} must eventually need steering`);assert.ok(g.engine.snapshot().score<12);assert.equal(g.engine.snapshot().lives,0);}finally{h.dispose();}}
});
