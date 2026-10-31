import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app/assets/shared/feedback.js',import.meta.url),'utf8');
function load({cover=false,storage={},native=false,audio=false}={}){
 let now=0,releaseAudio;const events=new Map(),docEvents=new Map(),saved=new Map(Object.entries(storage)),output=[],buzz=[],nodes=[],gains=[];
 const settings={sound:true,vibration:true,volume:.70};
 const on=(map,k,fn)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(fn);};
 const window={addEventListener:(k,fn)=>on(events,k,fn),dispatchEvent:e=>(events.get(e.type)||[]).forEach(fn=>fn(e))};
 const document={hidden:false,addEventListener:(k,fn)=>on(docEvents,k,fn)};
 if(native)window.RugeFeedback={configured:()=>true,soundEnabled:()=>settings.sound,vibrationEnabled:()=>settings.vibration,volume:()=>settings.volume,setVolume:v=>settings.volume=v,setSound:v=>settings.sound=v,setVibration:v=>settings.vibration=v,stop:()=>output.push('stop'),cancelVibration:()=>output.push('cancel'),emit:name=>output.push(name)};
 if(audio)window.AudioContext=class {state='suspended';currentTime=0;destination={};resume(){return new Promise(r=>{releaseAudio=()=>{this.state='running';r();};});}createOscillator(){const node={frequency:{value:0},connect(){},start(){node.started=true;},stop(){node.stopped=true;},disconnect(){}};nodes.push(node);return node;}createGain(){const g={gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};gains.push(g);return g;}};
 const context=vm.createContext({window,document,location:{search:cover?'?cover=1':''},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},navigator:{vibrate:pattern=>buzz.push(pattern)},performance:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}});
 vm.runInContext(source,context);
 return {fx:window.RugeFX,window,document,saved,output,buzz,nodes,gains,settings,tick:n=>now+=n,releaseAudio:()=>releaseAudio?.(),emit:k=>(events.get(k)||[]).forEach(fn=>fn()),visibility:hidden=>{document.hidden=hidden;(docEvents.get('visibilitychange')||[]).forEach(fn=>fn());}};
}
test('共享反馈：节流连续点按，成功/通关可以覆盖轻触，重复通关静默',()=>{
 const g=load({native:true});assert.equal(g.fx.emit('select'),true);assert.equal(g.fx.emit('select'),false);assert.equal(g.fx.emit('success'),true);assert.equal(g.fx.emit('win'),true);assert.equal(g.fx.emit('win'),false);g.tick(901);assert.equal(g.fx.emit('win'),true);assert.deepEqual(g.output,['select','success','win','win']);assert.equal(g.fx.emit('unknown'),false);
});
test('共享反馈：声音与震动独立，设置统一持久化且发变更事件',()=>{
 const g=load({native:true});let changes=0;g.window.addEventListener('ruge:feedback-change',()=>changes++);g.fx.setSound(false);assert.equal(g.settings.sound,false);assert.equal(g.fx.enabled('vibration'),true);g.fx.emit('collect');assert.equal(g.output.at(-1),'collect');g.fx.setVibration(false);assert.equal(g.settings.vibration,false);assert.deepEqual(JSON.parse(g.saved.get('rugeFeedbackV1')),{sound:false,vibration:false,volume:.70});assert.equal(g.saved.get('rugeMuted'),'true');assert.equal(changes,2);g.fx.setSound(true);assert.equal(g.fx.enabled('vibration'),false);
});
test('共享反馈：快速纠正错误时成功优先，不被失败节流吞掉',()=>{
 const g=load({native:true});assert.equal(g.fx.emit('error'),true);g.tick(40);assert.equal(g.fx.emit('success'),true);assert.deepEqual(g.output,['error','success']);
});
test('共享反馈：后台停止全部输出，恢复不补播旧事件，封面不读写设置或输出',()=>{
 const g=load({native:true});g.fx.emit('select');g.emit('ruge:pause');g.tick(1000);assert.equal(g.fx.emit('win'),false);g.emit('ruge:resume');assert.equal(g.output.filter(x=>x==='win').length,0);assert.equal(g.fx.emit('win'),true);g.visibility(true);g.tick(1000);assert.equal(g.fx.emit('success'),false);
 const cover=load({cover:true,native:true,storage:{rugeFeedbackV1:'original'}});cover.fx.emit('win');cover.fx.setSound(false);cover.fx.setVibration(false);cover.emit('pagehide');assert.deepEqual(cover.output,[]);assert.equal(cover.settings.sound,true);assert.equal(cover.settings.vibration,true);assert.equal(cover.saved.get('rugeFeedbackV1'),'original');assert.equal(cover.saved.size,1);
});
test('共享反馈：网页降级也区分成功震动，旧静音偏好迁移时不改游戏记录',()=>{
 const g=load({storage:{rugeMuted:'true',gameSave:'keep'}});assert.equal(g.fx.enabled('sound'),false);assert.equal(g.fx.enabled('vibration'),true);g.fx.emit('success');assert.deepEqual(Array.from(g.buzz[0]),[24,35,28]);assert.equal(g.saved.size,2);assert.equal(g.saved.get('gameSave'),'keep');g.fx.setVibration(false);assert.equal(g.buzz.at(-1),0);g.tick(300);g.fx.emit('error');assert.equal(g.buzz.length,2);
});
test('共享反馈：异步解锁声音期间离开页面，不会延迟补播',async()=>{
 const g=load({audio:true});g.fx.emit('success');g.emit('ruge:pause');g.releaseAudio();await Promise.resolve();await Promise.resolve();assert.equal(g.nodes.length,0);g.emit('ruge:resume');g.tick(1000);g.fx.emit('success');assert.equal(g.nodes.length,3);g.emit('pagehide');assert.ok(g.nodes.every(n=>n.stopped));
});
test('探测震动沿用共享开关，后台/封面静默，拒绝非数值且限制单次时长',()=>{
 const g=load();assert.equal(g.fx.pulse(120,20),true);assert.equal(g.buzz.at(-1),20);assert.equal(g.fx.pulse(NaN,20),false);assert.equal(g.fx.pulse(300,999),true);assert.equal(g.buzz.at(-1),35);
 g.fx.setSound(false);assert.equal(g.fx.pulse(80,12),true);g.fx.setVibration(false);assert.equal(g.fx.pulse(150,12),false);g.fx.setVibration(true);g.emit('ruge:pause');assert.equal(g.fx.pulse(150,12),false);g.emit('ruge:resume');assert.equal(g.fx.pulse(150,12),true);
 const c=load({cover:true});assert.equal(c.fx.pulse(255,20),false);assert.deepEqual(c.buzz,[]);
});
test('音效音量：默认保持旧.70，原生/网页真实增益变化且独立于开关、震动、音乐',async()=>{
 const g=load({native:true,storage:{rugeMusicV1:'keep'}});assert.equal(g.fx.getVolume(),.70);g.fx.setSound(false);g.fx.setVolume(.12);assert.equal(g.settings.volume,.12);assert.equal(g.settings.sound,false);assert.equal(g.settings.vibration,true);assert.equal(g.saved.get('rugeMusicV1'),'keep');assert.equal(JSON.parse(g.saved.get('rugeFeedbackV1')).volume,.12);assert.equal(g.fx.setVolume(NaN),.12);assert.equal(g.fx.setVolume(Infinity),.12);assert.equal(g.fx.setVolume(2),1);assert.equal(g.fx.setVolume(-1),0);
 const web=load({audio:true});web.fx.emit('success');web.releaseAudio();await Promise.resolve();await Promise.resolve();assert.equal(web.gains[0].gain.value,1);web.fx.setVolume(.35);assert.equal(web.gains[0].gain.value,.5);web.fx.setVolume(0);assert.ok(web.nodes.every(n=>n.stopped));web.tick(500);const count=web.nodes.length;web.fx.emit('success');assert.equal(web.nodes.length,count);assert.equal(web.fx.enabled('vibration'),true);
 const restored=load({storage:{rugeFeedbackV1:JSON.stringify({sound:false,vibration:true,volume:.19})}});assert.equal(restored.fx.getVolume(),.19);assert.equal(restored.fx.enabled('sound'),false);const cover=load({cover:true,native:true});cover.fx.setVolume(.01);assert.equal(cover.settings.volume,.70);assert.equal(cover.saved.size,0);
});
