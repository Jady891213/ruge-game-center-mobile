import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const window={},context=vm.createContext({window});
for(const name of['core','identify'])vm.runInContext(readFileSync(new URL(`../app/assets/brain-school/${name}.js`,import.meta.url),'utf8'),context);
const B=window.BrainSchool,game=B.games.get('frame-filler');
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
test('补全画片：每个随机缺口跨四格，四个物品均保留大半及可匹配的连续色边',()=>{
 for(let level=1;level<=10;level++)for(let seed=1;seed<=100;seed++){
  const q=game.create(level,B.rng(seed*1237)),w=q.window;
  assert.ok(w&&w.size>=56&&w.size<=80,'hole size follows difficulty');
  assert.ok(w.x>=0&&w.y>=0&&w.x+w.size<=320&&w.y+w.size<=240);
  const mask={x:w.x,y:w.y,w:w.size,h:w.size};
  const touched=q.art.map((_,i)=>i).filter(i=>overlap(mask,{x:i%4*80,y:Math.floor(i/4)*80,w:74,h:74})>0);
  assert.equal(touched.length,4,'a whole isolated unknown icon is not a valid puzzle');
  for(const i of touched){const area=overlap(mask,{x:i%4*80,y:Math.floor(i/4)*80,w:74,h:74});assert.ok(area>0&&area<74*74/2,'more than half of each object remains visible');}
  const targetEdges=touched.map(i=>(q.art[i]*30)%360);
  const candidates=q.options.map(a=>touched.map(i=>(a[i]*30)%360));
  const matching=candidates.map((hues,i)=>({hues,i})).filter(x=>x.hues.every((h,j)=>h===targetEdges[j])).map(x=>x.i);
  assert.equal(matching.length,1,'only one crop continues all four visible background colours');
  assert.equal(game.check(q,matching[0]),true);
  for(let i=0;i<4;i++)if(i!==matching[0])assert.ok(candidates[i].every((h,j)=>h!==targetEdges[j]),'all distractors visibly disagree at the crop edges');
 }
});
test('补全画片：higher difficulty hides more of the same four-corner junction',()=>{
 for(let seed=1;seed<=50;seed++){
  const a=game.create(1,B.rng(seed*647)),b=game.create(10,B.rng(seed*647));
  assert.ok(b.window.size>a.window.size);
  assert.equal(a.hole,b.hole);
 }
});
