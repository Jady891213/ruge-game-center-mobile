import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {loadGame} from './helpers/html-vm.mjs';

const assets=new URL('../app/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('shared/demo-audio/manifest.json',assets),'utf8'));
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function demo(g){const calls=[];g.window.DemoAudio={available:key=>!!manifest.clips[key],play:async key=>{calls.push(key);return true;},stop:()=>calls.push('stop')};return calls;}

test('全部有朗读的页面只引用共享离线播放器，无原生/浏览器TTS调用',()=>{
 function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const url=new URL(e.name+(e.isDirectory()?'/':''),dir);if(e.isDirectory())scan(url);else if(/\.(?:js|html)$/.test(e.name))assert.doesNotMatch(readFileSync(url,'utf8'),/RugeTTS|speechSynthesis|SpeechSynthesisUtterance/,url.pathname);}}
 scan(assets);
 for(const entry of ['hanzi-typing/index.html','hanzi-typing/speaking.html','hanzi-library/index.html','english-k/index.html']){
  const html=readFileSync(new URL(entry,assets),'utf8');
  assert.match(html,/shared\/demo-audio\/manifest\.js/);assert.match(html,/shared\/demo-audio\.js/);
 }
});

test('现101条完整覆盖80指定读法/12完整拼读/9英语，字库与打字默认音一致',()=>{
 const g=loadGame('hanzi-typing',{entry:'speaking.html'}),library=loadGame('hanzi-library'),english=loadGame('english-k');
 try{
  const V=g.window.HanziVocabulary,C=g.window.ReadingCore,keys=[];
  for(const [char,readings]of Object.entries(V.pinyin))for(const p of readings){const t=C.task(char,'read',p);keys.push(t.id);assert.ok(manifest.clips[t.id],t.id);assert.equal(manifest.clips[t.id].label,char+' '+p);}
  assert.equal(keys.length,80);
  for(const char of C.INTRO){const t=C.task(char,'spell');keys.push(t.id);const clip=manifest.clips[t.id];assert.ok(clip,t.id);assert.equal(clip.kind,'spell');assert.equal(clip.text.split('<#0.45#>').length,t.items.length);}
  for(const word of Object.keys(english.window.EnglishKingdom.WORDS)){keys.push('en:'+word);assert.ok(manifest.clips['en:'+word]);}
  assert.equal(keys.length,101);assert.equal(new Set(keys).size,101);
  assert.equal(library.window.HanziLibraryData.entries.length,60);
  for(const e of library.window.HanziLibraryData.entries){assert.equal(e.pinyin[0],V.pinyin[e.char][0]);assert.ok(manifest.clips['read:'+e.char+':'+e.pinyin[0]]);}
 }finally{g.dispose();library.dispose();english.dispose();}
});

test('打字实际60题按钮逐字读默认音，音效关闭仍可示范，朗读不改答题和旧存档',async()=>{
 const old='unrelated-data',g=loadGame('hanzi-typing',{storage:{otherGame:old}});try{
  const a=g.window.__game,calls=demo(g),spoken=[];g.window.RugeFX={enabled:()=>false,emit(){},setSound(){}};a.start(-1);
  let guard=0;while(a.state().playing){assert.ok(++guard<80);
   if(a.state().accepting){const before=a.state();g.click('#tRead');await flush();const key='read:'+before.ch+':'+a.answersOf(before.ch)[0];assert.equal(calls.at(-1),key);spoken.push(before.ch);assert.equal(a.state().score,before.score);assert.equal(a.state().right,before.right);g.input(a.norm(before.ans[0]));g.tick(4000);}
   else if(g.node('#gpanel').classList.contains('on'))g.click('#gpNext');else assert.fail('unexpected typing state');
  }
  assert.equal(spoken.length,60);assert.equal(new Set(spoken).size,60);assert.equal(g.saved.get('otherGame'),old);assert.equal(a.state().right,60);
 }finally{g.dispose();}
});

test('打字正确/换字/暂停会停止示范，迟到失败不覆盖答对反馈和分数',async()=>{
 const g=loadGame('hanzi-typing');try{
  const a=g.window.__game,calls=demo(g);let resolve;a.start(0);g.window.DemoAudio.play=()=>new Promise(r=>resolve=r);g.click('#tRead');
  g.input(a.norm(a.state().ans[0]));const score=a.state().score;assert.equal(g.node('#foot').textContent,'✓');resolve(false);await flush();assert.equal(g.node('#foot').textContent,'✓');assert.equal(a.state().score,score);assert.equal(a.state().right,1);assert.equal(calls.at(-1),'stop');
  g.tick(4000);g.window.DemoAudio.play=async()=>false;g.click('#tRead');await flush();assert.equal(g.node('#foot').textContent,'示范暂不可用');assert.equal(a.state().score,score);
  g.window.DemoAudio.play=()=>new Promise(r=>resolve=r);g.click('#tRead');a.pause();resolve(false);await flush();const n=calls.length;g.emitWindow('ruge:resume');assert.equal(calls.length,n);assert.equal(a.state().paused,true);
  a.resume();g.click('#tRead');g.emitWindow('pagehide');resolve(false);await flush();assert.equal(calls.at(-1),'stop');
 }finally{g.dispose();}
});

test('字库全部60字详情朗读精确默认音；换字/返回/后台使旧结果失效',async()=>{
 const g=loadGame('hanzi-library');try{
  const a=g.window.__game,calls=demo(g);
  for(const e of g.window.HanziLibraryData.entries){a.open(e.char);await a.read();assert.equal(calls.at(-1),'read:'+e.char+':'+e.pinyin[0]);}
  let resolve;g.window.DemoAudio.play=()=>new Promise(r=>resolve=r);a.open('日');const p=a.read();a.open('人');resolve(false);await p;assert.notEqual(g.node('#toast').textContent,'示范暂不可用');assert.equal(a.state().char,'人');
  const pending=a.read();g.emitWindow('ruge:pause');resolve(false);await pending;const n=calls.length;await a.read();assert.equal(calls.length,n);g.emitWindow('ruge:resume');assert.equal(calls.length,n);
  g.window.DemoAudio.play=async()=>false;await a.read();assert.equal(g.node('#toast').textContent,'示范暂不可用');a.list();assert.equal(a.state().view,'list');assert.equal(calls.at(-1),'stop');assert.equal(g.saved.size,0);
 }finally{g.dispose();}
});
