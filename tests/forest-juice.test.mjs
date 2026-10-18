import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/forest-juice/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.ForestJuice;
const clone=x=>JSON.parse(JSON.stringify(x));

test('森林果汁屋36关真实BFS可解，容量/颜色逐步增加，关卡不共享数组',()=>{
  assert.equal(C.LEVELS.length,36);
  const lengths=[];
  C.LEVELS.forEach((l,i)=>{
    const s=C.createState(i),answer=C.solve(i);assert.ok(C.validBoard(s.tubes,i));assert.equal(s.finished,false);assert.ok(answer,'第 '+(i+1)+' 关可解');
    answer.moves.forEach(([from,to])=>assert.ok(C.pour(s,from,to)>0));
    assert.equal(s.finished,true);assert.ok(C.won(s.tubes,l.capacity));assert.ok(C.validBoard(s.tubes,i));lengths.push(answer.moves.length);
    assert.deepEqual(C.createState(i).tubes,l.tubes);
  });
  assert.deepEqual(lengths.slice(0,12),[3,3,5,7,7,7,7,10,14,13,14,14]);
  assert.deepEqual(C.LEVELS.slice(0,3).map(l=>l.colors),[2,2,2]);assert.equal(C.LEVELS[11].colors,4);assert.equal(C.LEVELS[11].capacity,4);
  assert.throws(()=>C.createState(-1));assert.throws(()=>C.createState(C.LEVELS.length));
});
test('只倒顶部连续同色且尽量倒满：空瓶/同色合法，异色/满瓶/自身非法',()=>{
  const t=[[0,1,1,1],[1,1,1],[],[0,0,0,0],[2]];
  assert.equal(C.pourCount(t,4,0,1),1);assert.equal(C.pourCount(t,4,0,2),3);
  assert.equal(C.pourCount(t,4,0,3),0);assert.equal(C.pourCount(t,4,0,4),0);
  assert.equal(C.pourCount(t,4,0,0),0);assert.equal(C.pourCount(t,4,2,0),0);
  for(const value of [-1,9,1.5,NaN,'1'])assert.equal(C.pourCount(t,4,value,2),0);
});
test('每次倒入与一次撤回守恒，连续同色整体撤回，完成状态正确回退',()=>{
  const s=C.createState(8),initial=clone(s.tubes);
  for(const [a,b] of C.solve(8).moves){const before=clone(s.tubes),count=C.pour(s,a,b);assert.ok(count);assert.ok(C.validBoard(s.tubes,8));assert.equal(C.undo(s),true);assert.deepEqual(s.tubes,before);assert.equal(s.finished,false);assert.equal(C.pour(s,a,b),count);}
  assert.equal(s.finished,true);assert.equal(C.pour(s,0,1),0);
  while(C.undo(s))assert.ok(C.validBoard(s.tubes,8));
  assert.deepEqual(s.tubes,initial);assert.equal(s.moves,0);assert.equal(C.undo(s),false);
});
test('存档通过真实历史重放校验，恢复草稿/完成局/星数',()=>{
  const s=C.createState(4),moves=C.solve(4).moves;
  moves.slice(0,3).forEach(([a,b])=>C.pour(s,a,b));
  let raw={schema:1,stars:[3,2,0],session:s};assert.deepEqual(C.restore(clone(raw)).session,s);
  moves.slice(3).forEach(([a,b])=>C.pour(s,a,b));assert.equal(C.restore(clone(raw)).session.finished,true);
  assert.deepEqual(C.restore(raw).stars,[3,2,...Array(C.LEVELS.length-2).fill(0)]);
});
test('拒绝液体增减/伪造移动或胜利/越界关卡/超长历史和坏JSON结构',()=>{
  const base={schema:1,stars:[3,99,-1,1.5],session:C.createState(0)};
  const changes=[s=>s.tubes[0].push(0),s=>s.tubes[0].pop(),s=>s.tubes[0][0]=9,s=>s.tubes.push([]),s=>s.finished=true,s=>s.level=C.LEVELS.length,s=>s.level=-1,s=>s.moves=1,s=>s.history=[[0,2,99]],s=>s.history=Array(1001).fill([0,2,1]),s=>{s.tubes=[[0,0],[1,1],[],[]];},s=>s.history=[null]];
  for(const change of changes){const raw=clone(base);change(raw.session);const restored=C.restore(raw);assert.equal(restored.session,null);assert.deepEqual(restored.stars,[3,...Array(C.LEVELS.length-1).fill(0)]);}
  for(const raw of [null,[],42,{schema:2},{schema:1,session:{}}])assert.equal(C.restore(raw).session,null);
  const actual=C.createState(0);C.pour(actual,0,2);actual.history[0][2]=2;assert.equal(C.restore({schema:1,session:actual}).session,null);
});
test('真实页面选瓶/合法目的地/动画互斥/撤回与重置确认',()=>{
  const g=loadGame('forest-juice');try{
    const api=g.window.__game;api.start(0);assert.equal(api.tap(0),true);assert.equal(api.selected(),0);
    assert.equal(g.node('#board').children[2].classList.contains('legal'),true);
    assert.equal(api.tap(2),true);assert.equal(api.busy(),true);assert.equal(api.state().moves,1);assert.equal(api.tap(1),false);
    g.tick(500);assert.equal(api.busy(),false);g.node('#undo').onclick();assert.equal(api.state().moves,0);
    api.tap(0);api.tap(2);g.tick(500);g.node('#restart').onclick();assert.equal(g.node('#confirm').hidden,false);assert.equal(api.tap(1),false);
    g.node('#cancelRestart').onclick();assert.equal(api.state().moves,1);g.node('#restart').onclick();g.node('#confirmRestart').onclick();assert.equal(api.state().moves,0);
    assert.equal(api.start(-1),false);assert.equal(api.start(C.LEVELS.length),false);
  }finally{g.dispose();}
});
test('真实页面36关连续通关，自动解锁/下一关/完成回选关',()=>{
  const g=loadGame('forest-juice');try{
    const api=g.window.__game;assert.equal(g.node('#levels').children[1].disabled,true);api.start(0);
    for(let i=0;i<C.LEVELS.length;i++){
      assert.equal(api.state().level,i);
      for(const [from,to] of C.solve(i).moves){assert.equal(api.tap(from),true);assert.equal(api.tap(to),true);g.tick(500);}
      assert.equal(api.state().finished,true);assert.equal(g.node('#win').hidden,false);assert.equal(api.progress()[i],3);g.node('#next').onclick();
    }
    assert.equal(g.node('#menu').hidden,false);assert.ok(g.node('#levels').children.every(b=>!b.disabled));
    const raw=JSON.parse(g.saved.get(api.storageKey));assert.equal(raw.stars.length,C.LEVELS.length);assert.equal(C.restore(raw).session.finished,true);
  }finally{g.dispose();}
});
test('暂停取消动画，继续保留本局；完成动画中切后台也能正确显示胜利',()=>{
  const g=loadGame('forest-juice');try{
    const api=g.window.__game;api.start(0);api.tap(0);api.tap(2);g.emitWindow('ruge:pause');assert.equal(api.busy(),false);assert.equal(g.node('#pause').hidden,false);assert.equal(api.tap(1),false);assert.equal(api.state().moves,1);g.tick(1000);api.resume();assert.equal(g.node('#pause').hidden,true);
    const answer=C.solve(clone(api.state()));answer.moves.forEach(([a,b],i)=>{api.tap(a);api.tap(b);if(i<answer.moves.length-1)g.tick(500);});
    assert.equal(api.state().finished,true);assert.equal(api.busy(),true);api.pause();assert.equal(api.busy(),false);assert.equal(g.node('#win').hidden,true);api.resume();assert.equal(g.node('#win').hidden,false);
    const restored=loadGame('forest-juice',{storage:Object.fromEntries(g.saved)});try{assert.equal(restored.window.__game.state().finished,true);assert.equal(restored.node('#win').hidden,false);}finally{restored.dispose();}
  }finally{g.dispose();}
});
test('封面模式不读写玩家存档；独立坏档安全退回选关',()=>{
  const original='untouched';const g=loadGame('forest-juice',{storage:{rugeForestJuiceV1:original},instrument:src=>src.replace('cover=/[?&]cover=1(?:&|$)/.test(location.search)','cover=true')});
  try{assert.equal(g.window.__game.state().level,8);g.emitWindow('pagehide');g.window.__game.menu();assert.equal(g.saved.get('rugeForestJuiceV1'),original);}finally{g.dispose();}
  const bad=loadGame('forest-juice',{storage:{rugeForestJuiceV1:'{bad'}});try{assert.equal(bad.node('#menu').hidden,false);assert.equal(bad.window.__game.state(),null);}finally{bad.dispose();}
});
