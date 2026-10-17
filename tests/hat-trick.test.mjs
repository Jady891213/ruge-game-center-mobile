import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/hat-trick/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.HatTrick,copy=x=>JSON.parse(JSON.stringify(x));
function game(t,storage={},cover=false){const h=loadGame('hat-trick',{storage,instrument:src=>cover?src.replace('cover=/[?&]cover=1(?:&|$)/.test(location.search)','cover=true'):src});t.after(()=>h.dispose());return {h,g:h.window.__game};}
const finishShuffle=s=>{assert.equal(C.hide(s),true);while(s.phase==='shuffle')assert.equal(C.advance(s),true);};
test('帽子18关每次只交换两顶帽子，按真实换位规则全部可解，含四种任务而非只加速',()=>{
  assert.equal(C.LEVELS.length,18);assert.deepEqual([...new Set(C.LEVELS.map(l=>l.mode))],['track','late','pair','order']);assert.equal(C.LEVELS[0].initial.length,3);assert.equal(C.LEVELS[17].initial.length,6);assert.equal(C.LEVELS[17].targets.length,3);assert.ok(Math.min(...C.LEVELS.map(l=>l.duration))>=900);
  for(let i=0;i<18;i++){const s=C.createState(i),l=C.LEVELS[i];assert.equal(new Set(l.initial).size,l.initial.length);assert.equal(C.hide(s),true);for(const pair of l.swaps){assert.deepEqual(C.nextSwap(s),pair);const before=s.order.slice();C.advance(s);assert.equal(s.order[pair[0]],before[pair[1]]);assert.equal(s.order[pair[1]],before[pair[0]]);before.forEach((id,p)=>{if(!pair.includes(p))assert.equal(s.order[p],id);});}assert.equal(s.phase,'choose');const answer=C.solution(i);answer.forEach(index=>assert.equal(C.pick(s,index).correct,true));assert.equal(s.phase,'won');assert.equal(C.pick(s,0),null);}
});
test('预览和换位不能偷选；越界及重复帽子没有副作用',()=>{
  const s=C.createState(7);assert.equal(C.pick(s,0),null);C.hide(s);assert.equal(C.pick(s,0),null);while(s.phase==='shuffle')C.advance(s);for(const id of [-1,4,'1',NaN,1.5,'constructor'])assert.equal(C.pick(s,id),null);const first=C.solution(7)[0];assert.equal(C.pick(s,first).correct,true);const before=copy(s);assert.equal(C.pick(s,first),null);assert.deepEqual(s,before);
});
test('按顺序关必须先找当前目标，错误保留当前任务与所有正确结果',()=>{
  const s=C.createState(15);finishShuffle(s);const answer=C.solution(15);assert.equal(C.pick(s,answer[1]).correct,false);assert.equal(s.mistakes,1);assert.deepEqual(s.found,[]);assert.equal(C.pick(s,answer[0]).correct,true);assert.equal(C.target(s),C.LEVELS[15].targets[1]);assert.equal(C.pick(s,answer[1]).correct,true);assert.equal(C.pick(s,answer[2]).finished,true);assert.equal(s.attempts,4);
});
test('存档校验真实换位顺序、目标顺序和胜利；中断换位恢复原始观察而非暴露最终位置',()=>{
  const s=C.createState(17);C.hide(s);C.advance(s);const raw={schema:1,stars:[3,2],session:s},restored=C.restore(copy(raw));assert.equal(restored.session.phase,'preview');assert.deepEqual(restored.session.order,C.LEVELS[17].initial);assert.equal(restored.session.move,0);
  while(s.phase==='shuffle')C.advance(s);C.pick(s,C.solution(17)[0]);assert.deepEqual(C.restore(copy(raw)).session,s);
  for(const change of [x=>x.order.reverse(),x=>x.found=[0],x=>x.phase='won',x=>x.move=999,x=>x.attempts=-1,x=>x.mistakes=2,x=>x.level=18]){const bad=copy(raw);change(bad.session);assert.equal(C.restore(bad).session,null);}assert.throws(()=>C.createState(18));
});
test('真实页面18关播放全部换位、点击真实目标通关和下一关，独立进度完整保存',t=>{
  const {h,g}=game(t,{other:'keep'});assert.equal(h.node('#levels').children[1].disabled,true);g.start(0);
  for(let i=0;i<18;i++){assert.equal(g.state().level,i);h.node('#hideAnimals').onclick();assert.equal(g.busy(),true);assert.equal(g.pick(0),null);h.tick(20000);assert.equal(g.state().phase,'choose');assert.equal(g.busy(),false);for(const index of C.solution(i))h.node('#hatStage').children[index].onclick();assert.equal(g.state().phase,'won');assert.equal(h.node('#win').hidden,false);assert.equal(g.progress()[i],3);h.node('#next').onclick();}
  assert.equal(h.node('#menu').hidden,false);assert.ok(h.node('#levels').children.every(b=>!b.disabled));assert.equal(h.saved.get('other'),'keep');assert.equal(C.restore(JSON.parse(h.saved.get(g.storageKey))).session.phase,'won');
});
test('后公布目标关观察时只有问号，全部换完才公布目标；顺序关高亮当前目标',t=>{
  const {h,g}=game(t);g.start(5);assert.ok(h.node('#targets').children.every(n=>n.innerHTML.includes('question')));g.hideAnimals();h.tick(20000);assert.ok(h.node('#targets').children.every(n=>!n.innerHTML.includes('question')));g.start(15);g.hideAnimals();h.tick(20000);assert.equal(h.node('#targets').children[0].classList.contains('current'),true);g.pick(C.solution(15)[0]);assert.equal(h.node('#targets').children[2].classList.contains('current'),true);assert.equal(h.node('#targets').children[0].classList.contains('done'),true);
});
test('暂停遮住整个棋盘与目标，换位中断后从初始布局重看，不自动继续或暴露当前答案',t=>{
  const {h,g}=game(t);g.start(8);g.hideAnimals();h.tick(1500);assert.equal(g.state().move,1);g.pause();assert.equal(g.isPaused(),true);assert.equal(h.document.body.classList.contains('paused'),true);const before=copy(g.state());h.tick(30000);assert.deepEqual(copy(g.state()),before);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();assert.equal(g.state().phase,'preview');assert.deepEqual(Array.from(g.state().order),C.LEVELS[8].initial);assert.equal(h.document.body.classList.contains('paused'),false);g.hideAnimals();h.tick(20000);g.pause();g.resume();assert.equal(g.state().phase,'choose');assert.ok(h.node('#hatStage').children.every(n=>!n.classList.contains('open')));
});
test('找错只抖动且保持帽子覆盖，找对留在原处，重来确认和重看不丢关卡进度',t=>{
  const {h,g}=game(t);g.start(7);g.hideAnimals();h.tick(20000);const answer=C.solution(7),wrong=[0,1,2,3].find(i=>!answer.includes(i));assert.equal(g.pick(wrong).correct,false);assert.equal(h.node('#hatStage').children[wrong].classList.contains('wrong'),true);assert.equal(h.node('#hatStage').children[wrong].classList.contains('open'),false);assert.equal(g.pick(answer[0]).correct,true);assert.equal(h.node('#hatStage').children[answer[0]].classList.contains('found'),true);assert.equal(g.pick(answer[0]),null);assert.equal(g.replay(),true);assert.equal(g.state().phase,'preview');assert.equal(C.restore(JSON.parse(h.saved.get(g.storageKey))).session.phase,'preview');h.node('#restart').onclick();assert.equal(h.node('#confirm').hidden,false);h.node('#cancelRestart').onclick();assert.equal(g.state().phase,'preview');h.node('#restart').onclick();h.node('#confirmRestart').onclick();assert.equal(g.state().mistakes,0);
});
test('帽子换位草稿持久化恢复为初始观察且暂停，封面不读取或覆盖玩家存档',t=>{
  const {h,g}=game(t);g.start(12);g.hideAnimals();h.tick(1500);h.emitWindow('pagehide');const again=game(t,Object.fromEntries(h.saved));assert.equal(again.g.state().phase,'preview');assert.equal(again.g.isPaused(),true);assert.deepEqual(Array.from(again.g.state().order),C.LEVELS[12].initial);const cover=game(t,{rugeHatTrickV1:'untouched',other:'keep'},true);assert.equal(cover.g.state().level,8);cover.h.tick(30000);cover.h.emitWindow('pagehide');cover.g.menu();assert.equal(cover.h.saved.get('rugeHatTrickV1'),'untouched');assert.equal(cover.h.saved.get('other'),'keep');
});
