import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(new URL('../app/assets/shared/music.js',import.meta.url),'utf8');
function load({cover=false,path='/index.html',native=true,storage={},pref={enabled:true,volume:.22},autoplay=false,deferred=false}={}){
 const events=new Map(),docs=new Map(),saved=new Map(Object.entries(storage)),calls=[],players=[],resolvers=[];
 let reads=0,writes=0;
 const on=(map,name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
 const window={addEventListener:(n,fn)=>on(events,n,fn),dispatchEvent:e=>(events.get(e.type)||[]).forEach(fn=>fn(e))};
 const document={hidden:false,readyState:'loading',currentScript:{src:'http://localhost/shared/music.js'},addEventListener:(n,fn)=>on(docs,n,fn)};
 const settings={...pref};
 if(native)window.RugeMusicNative={isEnabled:()=>settings.enabled,volume:()=>settings.volume,setEnabled:v=>{settings.enabled=v;calls.push(['enabled',v]);},setVolume:v=>{settings.volume=v;calls.push(['volume',v]);},setTrack:t=>calls.push(['track',t]),play:()=>calls.push(['play']),pause:()=>calls.push(['pause']),stop:()=>calls.push(['stop']),setSuppressed:v=>calls.push(['suppressed',v])};
 window.Audio=class {constructor(src){this.src=src;this.played=0;this.pauses=0;players.push(this);}play(){this.played++;if(deferred)return new Promise(resolve=>resolvers.push(resolve));return autoplay?Promise.reject(Error('gesture required')):Promise.resolve();}pause(){this.pauses++;}removeAttribute(n){delete this[n];}load(){this.loaded=true;}};
 const context=vm.createContext({window,document,location:{search:cover?'?cover=1':'',pathname:path,href:'http://localhost'+path},localStorage:{getItem:k=>{reads++;return saved.get(k)??null;},setItem:(k,v)=>{writes++;saved.set(k,v);}},URL,CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}}});
 vm.runInContext(source,context);
 const emit=(name,detail,extra={})=>window.dispatchEvent({type:name,detail,...extra});
 const dom=()=>{document.readyState='complete';(docs.get('DOMContentLoaded')||[]).forEach(fn=>fn());};
 return {music:window.RugeMusic,window,settings,saved,calls,players,emit,dom,document,resolvers,counts:()=>({reads,writes}),visibility:hidden=>{document.hidden=hidden;(docs.get('visibilitychange')||[]).forEach(fn=>fn());}};
}
test('音乐：20个上架入口、所有子HTML、主页和设置均选本地白名单曲目',()=>{
 const home=fs.readFileSync(new URL('../app/assets/home/index.js',import.meta.url),'utf8');
 const ids=[...home.matchAll(/\{id:'([^']+)',cat:/g)].map(m=>m[1]);assert.equal(ids.length,20);
 const valid=new Set(['meadow','orchard','paper','cloud','starlight']),chosen=new Set();
 for(const id of [...ids,'settings','bear-snack-shop'])for(const name of fs.readdirSync(new URL('../app/assets/'+id+'/',import.meta.url)).filter(x=>x.endsWith('.html'))){const g=load({path:'/android_asset/'+id+'/'+name});g.dom();assert.ok(valid.has(g.music.state().track),id+'/'+name);assert.equal(g.calls.find(c=>c[0]==='track')[1],g.music.state().track);chosen.add(g.music.state().track);}
 assert.equal(chosen.size,5);const homePage=load();homePage.dom();assert.equal(homePage.music.state().track,'meadow');
});
test('音乐：脑力五类独立风格，任意路径或未知ID不会进入音频加载器',()=>{
 const g=load({path:'/brain-school/index.html'});g.dom();
 const wanted={identify:'orchard',memory:'cloud',analysis:'paper',compute:'starlight',visual:'meadow'};
 for(const [category,track]of Object.entries(wanted)){g.emit('ruge:brain-game',{id:'any',category});assert.equal(g.music.state().track,track);}
 const n=g.calls.length;for(const bad of ['../secret','https://evil.invalid/audio','file:///tmp/a','meadow.ogg',null])assert.equal(g.music.select(bad),false);assert.equal(g.calls.length,n);
});
test('音乐：独立音量和开关持久化，静音不会自动打开或触碰已有游戏与音效偏好',()=>{
 const g=load({native:false,storage:{rugeMusicV1:JSON.stringify({enabled:false,volume:0}),rugeFeedbackV1:'keep',savedGame:'keep'}});g.dom();assert.equal(g.players.length,0);
 g.music.setVolume(.15);assert.equal(g.music.enabled(),false);assert.equal(g.players.length,0);g.music.setEnabled(true);assert.equal(g.players[0].volume,.15);
 g.music.setVolume(0);assert.equal(g.music.enabled(),true);assert.ok(g.players[0].pauses>0);g.emit('pointerdown');assert.equal(g.players[0].played,1);
 assert.equal(g.music.setVolume(NaN),0);assert.equal(g.music.setVolume(Infinity),0);assert.equal(g.music.setVolume(2),1);assert.equal(g.music.setVolume(-1),0);
 assert.deepEqual(JSON.parse(g.saved.get('rugeMusicV1')),{enabled:true,volume:0});assert.equal(g.saved.get('rugeFeedbackV1'),'keep');assert.equal(g.saved.get('savedGame'),'keep');
 const native=load({storage:{rugeMusicV1:JSON.stringify({enabled:true,volume:.99})},pref:{enabled:false,volume:.08}});native.dom();assert.equal(native.music.enabled(),false);assert.equal(native.music.volume(),.08);native.music.setVolume(.31);assert.equal(native.settings.volume,.31);assert.equal(native.settings.enabled,false);
});
test('音乐：录音/示范/生命周期独立理由全部解除才恢复，最后resume总清原生保护',()=>{
 const g=load();g.dom();g.music.suspend('microphone');g.music.suspend('demo');g.emit('ruge:pause');g.visibility(true);let plays=g.calls.filter(x=>x[0]==='play').length;
 for(const fn of [()=>g.music.resume('microphone'),()=>g.music.resume('demo'),()=>g.emit('ruge:resume')]){fn();assert.equal(g.calls.filter(x=>x[0]==='play').length,plays);}
 g.visibility(false);assert.equal(g.calls.filter(x=>x[0]==='play').length,plays+1);assert.deepEqual(Array.from(g.music.state().suspended),[]);
 let clears=g.calls.filter(x=>x[0]==='suppressed'&&!x[1]).length;g.music.resume('assessment');assert.equal(g.calls.filter(x=>x[0]==='suppressed'&&!x[1]).length,clears+1);
 g.music.stop();plays=g.calls.filter(x=>x[0]==='play').length;g.emit('ruge:resume');g.emit('pointerdown');assert.equal(g.calls.filter(x=>x[0]==='play').length,plays);
});
test('音乐：Android原生导航清空曲目后，resume重申当前曲目再播放',()=>{
 const g=load({path:'/voice-quest/index.html'});g.dom();
 g.calls.length=0;g.emit('ruge:resume');
 assert.deepEqual(g.calls.slice(-2),[['track','paper'],['play']]);
});
test('音乐：pagehide后指针和迟到恢复均不能补播，bfcache pageshow可正常重新选择',()=>{
 const g=load();g.dom();g.emit('pagehide');const plays=g.calls.filter(x=>x[0]==='play').length;g.emit('pointerdown');g.emit('ruge:resume');assert.equal(g.calls.filter(x=>x[0]==='play').length,plays);assert.equal(g.music.state().exited,true);
 g.emit('pageshow',null,{persisted:true});assert.equal(g.calls.filter(x=>x[0]==='play').length,plays+1);assert.equal(g.calls.filter(x=>x[0]==='track').length,2);
});
test('音乐：普通浏览器autoplay拒绝后真实指针重试，迟到play不得令旧元素重新响',async()=>{
 const blocked=load({native:false,autoplay:true});blocked.dom();await Promise.resolve();await Promise.resolve();assert.equal(blocked.music.state().blocked,true);assert.equal(blocked.players[0].played,1);blocked.emit('pointerdown');assert.equal(blocked.players[0].played,2);
 const g=load({native:false,deferred:true});g.dom();const old=g.players[0];g.music.select('paper');g.resolvers[0]();await Promise.resolve();assert.ok(old.pauses>=2);const current=g.players[1];g.emit('pagehide');g.resolvers[1]();await Promise.resolve();assert.ok(current.pauses>=2);assert.equal(g.music.state().exited,true);
});
test('音乐：cover=1完全不读写偏好、不调用原生、不创建音频',()=>{
 const g=load({cover:true,storage:{savedGame:'keep'}});g.dom();g.music.select('paper');g.music.setEnabled(false);g.music.setVolume(.9);g.music.suspend('demo');g.music.resume('demo');g.music.stop();g.emit('pointerdown');g.emit('ruge:pause');g.emit('pagehide');assert.deepEqual(g.counts(),{reads:0,writes:0});assert.deepEqual(g.calls,[]);assert.equal(g.players.length,0);assert.equal(g.saved.get('savedGame'),'keep');
});
test('原生音乐：执行真实Java的主线程、陈旧prepare、偏好、焦点与生命周期边界',()=>{
 const result=spawnSync('python3',[fileURLToPath(new URL('helpers/music-native.py',import.meta.url))],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.stdout);
});
test('原创OGG：解码后音量、循环边界、时长和所有SHA与来源manifest一致',()=>{
 const result=spawnSync('python3',[fileURLToPath(new URL('../scripts/generate-background-music.py',import.meta.url)),'--check'],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.stdout);
});
