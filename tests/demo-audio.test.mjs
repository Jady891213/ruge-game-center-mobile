import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('app/assets/shared/demo-audio.js',root),'utf8');
function setup({reject=false,deferred=false}={}){
 const events=new Map(),documentEvents=new Map(),instances=[];
 class Audio {
  constructor(url){this.url=url;this.paused=false;instances.push(this);}
  play(){if(reject)return Promise.reject(new Error('media'));if(deferred)return new Promise(r=>{this.resolve=r;});return Promise.resolve();}
  pause(){this.paused=true;}
  removeAttribute(name){if(name==='src')this.removed=true;}
  load(){this.loaded=true;}
 }
 const document={hidden:false,currentScript:{src:'file:///android_asset/shared/demo-audio.js'},addEventListener:(k,f)=>documentEvents.set(k,f)};
 const window={Audio,RugeDemoClips:{'en:apple':'b7a47eabc0611a3727.mp3',unsafe:'https://third-party.invalid/audio.mp3'},addEventListener:(k,f)=>events.set(k,f)};
 vm.runInNewContext(source,{window,document});
 return{api:window.DemoAudio,instances,document,events,documentEvents};
}
test('示范只播打包manifest白名单，使用shared绝对资源位置，不触网/造评分',async()=>{
 const g=setup();assert.equal(g.api.available('en:apple'),true);assert.equal(g.api.available('unsafe'),false);assert.equal(await g.api.play('missing'),false);assert.equal(g.instances.length,0);
 assert.equal(await g.api.play('en:apple'),true);assert.equal(g.instances[0].url,'file:///android_asset/shared/demo-audio/b7a47eabc0611a3727.mp3');assert.equal('score' in g.api,false);
 g.api.stop();assert.equal(g.instances[0].paused,true);assert.equal(g.instances[0].removed,true);
});
test('后台/退出/新示范会停止旧音频，迟到play完成不重新播',async()=>{
 const g=setup({deferred:true});const first=g.api.play('en:apple');const a=g.instances[0];g.events.get('ruge:pause')();a.resolve();assert.equal(await first,false);assert.equal(a.paused,true);
 const second=g.api.play('en:apple');const b=g.instances[1];g.document.hidden=true;g.documentEvents.get('visibilitychange')();b.resolve();assert.equal(await second,false);assert.equal(b.paused,true);
 assert.equal(await g.api.play('en:apple'),false);assert.equal(g.instances.length,2);
 g.document.hidden=false;const third=g.api.play('en:apple');const c=g.instances[2];g.events.get('pagehide')();c.resolve();assert.equal(await third,false);
});
test('媒体解码/播放失败返回false，供调用方在仍前台且未录音时兜底',async()=>{const g=setup({reject:true});assert.equal(await g.api.play('en:apple'),false);});
test('每条打包MP3与来源manifest的SHA一致，文件名无远程路径',()=>{
 const dir=new URL('app/assets/shared/demo-audio/',root),manifest=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));
 assert.equal(manifest.model,'speech-2.8-hd');assert.ok(Object.keys(manifest.clips).length>=3);
 for(const [key,clip]of Object.entries(manifest.clips)){
  assert.match(key,/^(en:|read:|spell:)/);assert.match(clip.file,/^[a-f0-9]{18}\.mp3$/);
  const path=new URL(clip.file,dir);assert.ok(existsSync(path));assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),clip.sha256);assert.ok(clip.duration>.2&&clip.duration<20);
 }
 assert.equal(/(?:fetch|WebSocket|XMLHttpRequest|Bearer|api\.minimax)/.test(source),false);
});
