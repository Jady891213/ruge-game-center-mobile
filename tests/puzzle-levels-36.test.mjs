import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {puzzleCores,solvePuzzleLevels} from './helpers/puzzle-level-report.mjs';
import {loadGame} from './helpers/html-vm.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const baseline={
 'gravity-maze':[24,'1cbda1178615c6a8cc427cc0dc25e840da7dc09027d8a27933f4b9ee0f6c4f12'],
 'tilt-star-box':[12,'bce4c446d89805ba8f355b289621e0d58516154ef61e137bfd177c3ff3d18f22'],
 'number-merge':[12,'46fa5dcd067cc7cbbb1c94129d2b3e929a977c2e087145edf5a59a729a9e0bf8'],
 'forest-juice':[12,'b1864063cf4e3cbc1a71da70fdf1af2cdb773a035bbf8f67f92a8158505dd010'],
 'paint-mixing':[10,'5c5414854f88506c828357d6f0db9ad88e2373c1b32fbf5232a840adabbc5753']
};
test('36关扩展：五款旧关完整定义哈希保持，不能换题破坏既有草稿',()=>{
 for(const [name,[count,hash]]of Object.entries(baseline))assert.equal(createHash('sha256').update(JSON.stringify(puzzleCores[name].LEVELS.slice(0,count))).digest('hex'),hash,name);
});
test('36关扩展：180关均由真实core完成，钢珠120Hz逐步滚动且不穿墙/掉坑/传送',()=>{
 const report=solvePuzzleLevels();
 assert.equal(Object.values(report.games).reduce((n,g)=>n+g.count,0),180);
 for(const level of report.games['gravity-maze'].levels.slice(24))assert.ok(level.rotations>=1&&level.rotations<=4);
 const C=puzzleCores['gravity-maze'];
 for(const level of C.LEVELS.slice(28))for(let bits=0;bits<1<<level.rotors.length;bits++)assert.equal(C.solveLevel(level,level.rotors.map((_,i)=>bits>>i&1)),null,'new switchback levels need changing a gate during play');
 for(const level of report.games['number-merge'].levels.slice(12))assert.ok(level.steps>=4&&level.steps<=10);
 for(const level of report.games['tilt-star-box'].levels.slice(12))assert.ok(level.steps>=5&&level.steps<=12);
 for(const level of report.games['forest-juice'].levels.slice(12))assert.ok(level.steps>=7&&level.steps<=16);
});
function transforms(w){return Array.from({length:8},(_,t)=>p=>{let x=p%w,y=Math.floor(p/w);if(t>=4)x=w-1-x;for(let k=0;k<t%4;k++)[x,y]=[w-1-y,x];return y*w+x;});}
function starKey(l){const keys=[];for(const f of transforms(l.w))for(let swap=0;swap<2;swap++){let balls=l.balls.map(f),goals=l.goals.map(f);if(swap){balls.reverse();goals.reverse();}keys.push(JSON.stringify([l.w,l.walls.map(f).sort((a,b)=>a-b),balls,goals]));}return keys.sort()[0];}
function mergeKey(l){return transforms(l.w).map(f=>JSON.stringify([l.w,l.walls.map(f).sort((a,b)=>a-b),l.cells.flatMap((value,p)=>value?[[f(p),value]]:[]).sort((a,b)=>a[0]-b[0]),l.goals.map(g=>[f(g.p),g.value]).sort((a,b)=>a[0]-b[0])])).sort()[0];}
function permutations(a){return a.length?a.flatMap((n,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[n,...rest])):[[]];}
const colors=permutations([0,1,2,3]);
function juiceKey(l){return l.capacity+'/'+colors.map(p=>l.tubes.map(t=>t.map(c=>p[c]).join(',')).sort().join('|')).sort()[0];}
test('36关扩展：星盒/数字不是旋转镜像，果汁不是交换瓶子或颜色凑关',()=>{
 for(const [name,key]of [['tilt-star-box',starKey],['number-merge',mergeKey],['forest-juice',juiceKey]]){
  const C=puzzleCores[name],old=new Set(C.LEVELS.slice(0,12).map(key)),fresh=C.LEVELS.slice(12).map(key);
  assert.equal(new Set(fresh).size,24,name+' has 24 structurally different new boards');
  for(const k of fresh)assert.equal(old.has(k),false,name+' must differ from original boards');
 }
});
test('36关扩展：四款数组存档扩容补零，旧草稿/星数保留，新末关可重放恢复',()=>{
 for(const [name,C]of Object.entries(puzzleCores)){
  if(name==='gravity-maze')continue;
  const count=baseline[name][0],state=C.createState(count-1),stars=Array(count).fill(3);
  if(name==='paint-mixing')C.add(state,C.LEVELS[count-1].palette[0]);
  else if(name==='forest-juice')C.pour(state,...C.solve(count-1).moves[0]);
  else C.move(state,C.solve(count-1).moves[0]);
  const saved=C.restore(copy({schema:1,stars,session:state}));assert.deepEqual(saved.session,state,name);assert.equal(saved.stars.length,36);assert.deepEqual(saved.stars.slice(0,count),stars);assert.deepEqual(saved.stars.slice(count),Array(36-count).fill(0));
  const last=C.createState(35),lastSaved=C.restore(copy({schema:1,stars:saved.stars,session:last}));assert.deepEqual(lastSaved.session,last,name);
 }
});
test('36关扩展：旧尾关完成即解锁新关，钢珠机关进度与草稿也保留',()=>{
 for(const [name,[oldCount]]of Object.entries(baseline)){
  let key,raw;
  if(name==='gravity-maze'){
   key='rugeMarbleMazeV1';raw={schema:1,reached:11,mechanismReached:23,completed:Array.from({length:24},(_,i)=>i),current:23,draft:puzzleCores[name].snapshot(puzzleCores[name].create(23))};
  }else{
   key={'tilt-star-box':'rugeTiltStarBoxV1','number-merge':'rugeNumberMergeV1','forest-juice':'rugeForestJuiceV1','paint-mixing':'rugePaintMixingV1'}[name];raw={schema:1,stars:Array(oldCount).fill(3),session:null};
  }
  const h=loadGame(name,{storage:{[key]:JSON.stringify(raw),other:'keep'}});
  try{
   const a=h.window.__game;
   if(name==='gravity-maze'){
    assert.equal(a.state().li,23);assert.equal(a.state().progress.mechanismReached,24);a.showLevels();assert.equal(h.node('#mechanismGrid').children[12].disabled,false);assert.equal(h.node('#mechanismGrid').children[13].disabled,true);
   }else{
    assert.equal(h.node('#levels').children.length,36);assert.equal(h.node('#levels').children[oldCount].disabled,false);assert.equal(h.node('#levels').children[oldCount+1].disabled,true);
   }
   assert.equal(h.saved.get('other'),'keep');
  }finally{h.dispose();}
 }
});
test('36关扩展：调色真实按钮连续完成36关所有订单，尾关回菜单及存档36星',()=>{
 const C=puzzleCores['paint-mixing'],h=loadGame('paint-mixing');
 try{
  const a=h.window.__game;a.start(0,false);
  C.LEVELS.forEach((level,index)=>{
   assert.equal(a.state().level,index);
   level.targets.forEach((target,order)=>{
    assert.equal(a.state().order,order);
    for(const color of target.recipe)h.node('#palette').children.find(button=>button.dataset.color===color).onclick();
    h.node('#paint').onclick();assert.equal(a.state().accepted,true);assert.equal(h.node('#next').textContent,order<level.targets.length-1?'下一个':index<35?'下一关':'完成');h.node('#next').onclick();
   });
   assert.equal(a.progress()[index],3);
  });
  assert.equal(h.node('#menu').hidden,false);assert.equal(a.progress().length,36);assert.ok(h.node('#levels').children.every(b=>!b.disabled));
  assert.equal(C.restore(JSON.parse(h.saved.get(a.storageKey))).session.finished,true);
 }finally{h.dispose();}
});
