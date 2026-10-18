import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
import '../app/assets/animal-balance/core.js';
import '../app/assets/hat-trick/core.js';
import '../app/assets/hat-trick/memory-core.js';
import '../app/assets/voice-quest/core.js';
const copy=x=>JSON.parse(JSON.stringify(x));

test('三种数组星数存档从18关扩至36关，旧草稿和星数逐项保留，新关不赠星',()=>{
 for(const [C,schema] of [[globalThis.AnimalBalance,3],[globalThis.HatTrick,1],[globalThis.ToyMemory,1]]){
  const stars=Array.from({length:18},(_,i)=>i%4),session=C.createState(17),restored=C.restore({schema,stars,session:copy(session)});
  assert.equal(restored.stars.length,36);assert.deepEqual(restored.stars.slice(0,18),stars);assert.deepEqual(restored.stars.slice(18),Array(18).fill(0));assert.deepEqual(restored.session,session);
  const last=C.createState(35);assert.deepEqual(C.restore({schema,stars:Array(36).fill(3),session:copy(last)}).session,last);
 }
});

test('新18关是不同的天平换算、帽子路线与记忆配置，口令地图不可重复',()=>{
 const B=globalThis.AnimalBalance,H=globalThis.HatTrick,M=globalThis.ToyMemory,Q=globalThis.VoiceQuestCore;
 for(const data of [B.LEVELS.map(({id,...l})=>l),H.LEVELS.map(({id,...l})=>l),Q.levels.map(l=>l.rows)])assert.equal(new Set(data.map(JSON.stringify)).size,36);
 const tuples=M.PAIRS.map((pairs,i)=>[pairs,M.COLUMNS[i],M.PREVIEW[i]]);assert.equal(new Set(tuples.slice(18).map(JSON.stringify)).size,18);assert.ok(tuples.every(([pairs])=>pairs<=8));
 for(let i=18;i<36;i++){
  const path=Q.solve(i),engine=Q.create(i);assert.ok(path.includes('jump'),'新地图包含可操作的跨水');assert.ok(path.length<=32,'保持儿童可完成的短任务');
  for(const command of path)engine.act(command);assert.equal(engine.snapshot().won,true);
 }
});

test('翻牌真实页面36关连续翻牌与下一关，最后回本游戏选关且保留独立存档',()=>{
 const h=loadGame('hat-trick',{entry:'memory.html',storage:{otherGame:'keep'},instrument:(source,i)=>(i===0?`// The minimal DOM does not parse dynamically assigned card-face HTML.
const makeNode=document.createElement.bind(document);document.createElement=tag=>{const n=makeNode(tag),q=n.querySelector.bind(n),face=makeNode('span');n.querySelector=selector=>selector==='.cardFront'?face:q(selector);return n;};
`:'')+source});try{
  const g=h.window.__game;assert.equal(h.node('#levels').children.length,36);g.start(0);
  for(let i=0;i<36;i++){
   assert.equal(g.state().level,i);h.tick(5000);const deck=Array.from(g.state().deck);
   for(const id of new Set(deck)){
    const pair=deck.flatMap((n,p)=>n===id?[p]:[]);for(const p of pair)h.node('#cards').children[p].onclick();h.tick(600);
   }
   assert.equal(g.state().phase,'won');assert.equal(g.progress()[i],3);h.node('#next').onclick();
  }
  assert.equal(h.node('#menu').hidden,false);assert.ok(h.node('#levels').children.every(b=>!b.disabled));assert.equal(h.saved.get('otherGame'),'keep');
 }finally{h.dispose();}
});

test('口令旧18关解锁与角色草稿保持，新关以自身朝向解释前进',()=>{
 const draft={level:18,x:1,y:2,facing:'down',carrying:true,item:[4,1]},stars={1:3,18:2};
 const h=loadGame('voice-quest',{storage:{rugeVoiceQuestV1:JSON.stringify({schema:1,reached:18,stars,draft})}});try{
  const g=h.window.__game;assert.equal(g.save.reached,18);assert.deepEqual(copy(g.save.stars),stars);g.openLevel(17);assert.equal(g.engine.snapshot().facing,'down');assert.equal(g.engine.snapshot().carrying,true);
  const last=h.window.VoiceQuestCore.create(35);assert.equal(last.snapshot().facing,'left');const before=last.snapshot();last.act('forward');const after=last.snapshot();assert.equal(after.facing,'left');if(after.x!==before.x)assert.equal(after.x,before.x-1);
 }finally{h.dispose();}
});

test('密码箱按位数分组展示12关，追加零首位密码仍按字符接受',()=>{
 const levels=Object.fromEntries(Array.from({length:35},(_,i)=>[i,{best:1,stars:3}]));
 const h=loadGame('code-breaker',{storage:{rugeCodebreakerV1:JSON.stringify({version:1,levels})}});try{
  const C=h.window.RugeCodebreaker,g=h.window.__game;for(const tier of h.node('#tiers').children){tier.dispatch('click');assert.equal(h.node('#levels').children.length,12);}
  assert.equal(g.startLevel(35),true);assert.equal(C.LEVELS.length,36);assert.ok(C.LEVELS.slice(18).some(l=>l.secret[0]==='0'));for(const l of C.LEVELS.slice(18))assert.equal(C.valid(l.secret,l.length,l.pool),true);
 }finally{h.dispose();}
});

test('密码箱滚至末关后进入游戏或返回选关会归零根滚动，横屏顶部按钮不遗留在视口外',()=>{
 const h=loadGame('code-breaker');try{
  h.document.scrollingElement={scrollTop:360};const g=h.window.__game;g.startLevel(0);assert.equal(h.document.scrollingElement.scrollTop,0);
  h.document.scrollingElement.scrollTop=180;g.showHome();assert.equal(h.document.scrollingElement.scrollTop,0);
  h.document.scrollingElement.scrollTop=240;g.startFree(4);assert.equal(h.document.scrollingElement.scrollTop,0);
 }finally{h.dispose();}
});
