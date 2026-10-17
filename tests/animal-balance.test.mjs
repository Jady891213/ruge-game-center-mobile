import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/animal-balance/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.AnimalBalance,copy=x=>JSON.parse(JSON.stringify(x));
function game(t,storage={},cover=false){const h=loadGame('animal-balance',{storage,instrument:src=>cover?src.replace('cover=/[?&]cover=1(?:&|$)/.test(location.search)','cover=true'):src});t.after(()=>h.dispose());return {h,g:h.window.__game};}
test('动物天平桥18关全部用真实放置/称重求解，含换重量、限定只数、共享库存双桥',()=>{
  assert.equal(C.LEVELS.length,18);assert.equal(new Set(C.LEVELS.map(l=>l.weights.join(','))).size,4);assert.equal(C.LEVELS.filter(l=>l.targets.length===2).length,6);assert.ok(C.LEVELS.some(l=>l.exact.length));
  for(let i=0;i<18;i++){const answer=C.solve(i),s=C.createState(i);assert.ok(answer,'第 '+(i+1)+' 关可解');answer.forEach((pan,b)=>{pan.forEach(id=>assert.equal(C.place(s,b,id),true));assert.equal(C.weigh(s,b),0);});assert.equal(s.finished,true);assert.ok(C.remaining(s).every(n=>n>=0));for(const clue of C.LEVELS[i].clues)assert.equal(C.weight(i,clue.left),C.weight(i,clue.right),'图示线索不能说谎');assert.deepEqual(C.createState(i).pans,C.LEVELS[i].targets.map(()=>[]));}
});
test('库存和盘位限制不允许复制动物；越界/继承属性不改变本局',()=>{
  const s=C.createState(0);for(const id of [-1,6,'0',NaN,1.5,'constructor'])assert.equal(C.place(s,0,id),false);for(const b of [-1,9,1.5,'constructor']){assert.equal(C.place(s,b,0),false);assert.equal(C.remove(s,b,0),false);assert.equal(C.clear(s,b),false);}for(let i=0;i<3;i++)assert.equal(C.place(s,0,0),true);assert.equal(C.place(s,0,0),false);assert.equal(C.remove(s,0,3),false);assert.equal(C.remove(s,0,1),true);assert.equal(C.remaining(s)[0],1);assert.equal(C.clear(s,0),true);assert.equal(C.remaining(s)[0],3);assert.equal(C.clear(s,0),false);assert.throws(()=>C.createState(18));
});
test('轻重、数量不对与平衡是不同结果；未称重不能通关',()=>{
  const s=C.createState(0);assert.equal(C.weigh(s,0),null);C.place(s,0,0);assert.equal(C.weigh(s,0),-1);C.place(s,0,0);assert.equal(s.tested[0],null);assert.equal(s.finished,false);C.place(s,0,0);assert.equal(C.weigh(s,0),1);C.remove(s,0,0);assert.equal(C.weigh(s,0),0);assert.equal(s.finished,true);assert.equal(C.place(s,0,0),false);
  const limited=C.createState(10);C.place(limited,0,2);C.place(limited,0,2);assert.equal(C.weigh(limited,0),2);assert.equal(limited.finished,false);
});
test('第13关共享动物必须规划，第一桥的局部正确解可撤回重新分配',()=>{
  const s=C.createState(12);C.place(s,0,0);C.place(s,0,1);assert.equal(C.weigh(s,0),0);assert.equal(s.finished,false);assert.deepEqual(C.remaining(s),[0,1,1,0,0,0]);assert.equal(C.clear(s,0),true);C.place(s,0,2);C.weigh(s,0);C.place(s,1,1);C.place(s,1,1);C.weigh(s,1);assert.equal(s.finished,true);
});
test('动物存档保留草稿/星数，拒绝超库存、伪造轻重或胜利',()=>{
  const s=C.createState(12);C.place(s,0,0);C.weigh(s,0);const raw={schema:1,stars:[3,2],session:s};assert.deepEqual(C.restore(copy(raw)).session,s);assert.deepEqual(C.restore(raw).stars.slice(0,4),[3,2,0,0]);
  for(const change of [x=>x.pans[0].push(0),x=>x.tested[0]=0,x=>x.finished=true,x=>x.level=18,x=>x.attempts=-1,x=>x.pans[0]=['0'],x=>x.tested=[],x=>x.pans.push([])]){const bad=copy(raw);change(bad.session);assert.equal(C.restore(bad).session,null);}
});
test('真实页面18关连续求解与下一关，3星及18关解锁保存',t=>{
  const {h,g}=game(t,{other:'keep'});assert.equal(h.node('#levels').children.length,18);assert.equal(h.node('#levels').children[1].disabled,true);g.start(0);
  for(let i=0;i<18;i++){assert.equal(g.state().level,i);const answer=C.solve(i);answer.forEach((pan,b)=>{assert.equal(g.chooseBridge(b),true);pan.forEach(id=>{const button=h.node('#stock').children.find(n=>Number(n.dataset.animal)===id);button.onclick();});assert.equal(g.weigh(),0);assert.equal(g.busy(),true);assert.equal(g.add(0),false);h.tick(430);});assert.equal(g.state().finished,true);assert.equal(g.progress()[i],3);assert.equal(h.node('#win').hidden,false);h.node('#next').onclick();}
  assert.equal(h.node('#menu').hidden,false);assert.ok(h.node('#levels').children.every(n=>!n.disabled));assert.equal(h.saved.get('other'),'keep');assert.equal(C.restore(JSON.parse(h.saved.get(g.storageKey))).session.finished,true);
});
test('真实页面取回、重来确认、暂停和后台保留，称重动画不能重入',t=>{
  const {h,g}=game(t);g.start(0);g.add(0);h.node('#rightPan').children[0].onclick();assert.equal(g.state().pans[0].length,0);g.add(0);g.weigh();g.pause();assert.equal(g.busy(),false);assert.equal(g.isPaused(),true);assert.equal(g.add(0),false);h.tick(2000);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();assert.equal(g.state().tested[0],-1);h.node('#restart').onclick();assert.equal(h.node('#confirm').hidden,false);assert.equal(g.add(0),false);h.node('#cancelRestart').onclick();h.node('#restart').onclick();h.node('#confirmRestart').onclick();assert.equal(g.state().pans[0].length,0);assert.equal(g.state().attempts,0);g.add(0);h.emitWindow('pagehide');const next=game(t,Object.fromEntries(h.saved));assert.equal(next.g.state().pans[0].length,1);assert.equal(next.g.isPaused(),true);next.g.resume();assert.equal(next.g.add(0),true);
});
test('动物封面不读写游戏存档，坏档安全回选关',t=>{
  const {h,g}=game(t,{rugeAnimalBalanceV1:'untouched',other:'keep'},true);assert.equal(g.state().level,3);h.emitWindow('pagehide');g.menu();assert.equal(h.saved.get(g.storageKey),'untouched');assert.equal(h.saved.get('other'),'keep');const bad=game(t,{rugeAnimalBalanceV1:'bad'});assert.equal(bad.g.state(),null);assert.equal(bad.h.node('#menu').hidden,false);
});
