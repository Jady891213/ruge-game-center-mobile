import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function node(tag='div'){
 const classes=new Set(),listeners={};
 return{tagName:tag.toUpperCase(),children:[],dataset:{},attrs:{},parentNode:null,style:{setProperty(k,v){this[k]=v;}},className:'',textContent:'',innerHTML:'',
  appendChild(e){e.parentNode=this;this.children.push(e);return e;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(e=>e!==this);},
  setAttribute(k,v){this.attrs[k]=String(v);},addEventListener(k,fn){listeners[k]=fn;},dispatch(k){listeners[k]?.();},
  classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},
 };
}
function load(){
 const document={createElement:node,createElementNS:(_,t)=>node(t)};
 const context=vm.createContext({document,console});context.window=context;
 for(const name of['core','analysis'])vm.runInContext(readFileSync(new URL(`../app/assets/brain-school/${name}.js`,import.meta.url),'utf8'),context,{filename:name+'.js'});
 return context.BrainSchool;
}
const B=load();
const get=id=>B.games.get(id);
const json=x=>JSON.parse(JSON.stringify(x));

test('analysis: four independently playable games register with the shared catalog',()=>{
 assert.deepEqual([...B.games.keys()],['cube-count','heavyweight','match-blast','speed-sorting']);
 for(const g of B.games.values())assert.equal(g.category,'analysis');
});
test('analysis: seeded questions repeat exactly and vary across seeds at every difficulty',()=>{
 for(const g of B.games.values())for(let level=1;level<=10;level++){
  const seen=new Set();
  for(let seed=1;seed<=40;seed++){
   const a=g.create(level,B.rng(seed*7919)),b=g.create(level,B.rng(seed*7919));
   assert.deepEqual(json(a),json(b));seen.add(JSON.stringify(a));
  }
  assert.ok(seen.size>=25,`${g.id} level ${level} only ${seen.size} distinct questions`);
 }
});
test('analysis cubes: voxel coordinates are unique, supported, counted once and covered by choices',()=>{
 const g=get('cube-count');let low=0,high=0,tall=0;
 for(let level=1;level<=10;level++)for(let seed=1;seed<=100;seed++){
  const q=g.create(level,B.rng(seed*2311));
  const coords=new Set(q.cubes.map(c=>`${c.x},${c.y},${c.z}`));assert.equal(coords.size,q.cubes.length);
  for(const c of q.cubes){assert.ok(c.z>=0&&c.x>=0&&c.y>=0&&c.x<q.width&&c.y<q.depth);if(c.z)assert.ok(coords.has(`${c.x},${c.y},${c.z-1}`));}
  const height=(x,y)=>q.cubes.filter(c=>c.x===x&&c.y===y).length;
  for(let x=0;x<q.width;x++)for(let y=0;y<q.depth;y++){
   if(x+1<q.width)assert.ok(height(x,y)>=height(x+1,y),'near column must not hide a lower back column');
   if(y+1<q.depth)assert.ok(height(x,y)>=height(x,y+1),'column tops must remain visible');
  }
  const answer=coords.size;assert.ok(q.options.includes(answer));assert.equal(g.check(q,answer),true);assert.equal(g.check(q,answer+1),false);assert.equal(g.check(q,String(answer)),false);
  if(level===1)low+=answer;if(level===10){high+=answer;tall+=q.cubes.some(c=>c.z>=2)?1:0;}
 }
 assert.ok(high>low*2);assert.ok(tall>75);
});
test('analysis scales: displayed comparison graph uniquely implies the heaviest object',()=>{
 const g=get('heavyweight');let equalExamples=0;
 for(let level=1;level<=10;level++)for(let seed=1;seed<=120;seed++){
  const q=g.create(level,B.rng(seed*3109));
  const greater=q.items.map(()=>q.items.map(()=>false)),equal=q.items.map((_,i)=>q.items.map((_,j)=>i===j));
  const index=id=>q.items.indexOf(id);
  for(const c of q.comparisons){
   const a=index(c.left),b=index(c.right);assert.ok(a>=0&&b>=0);
   assert.equal(c.relation,Math.sign(q.weights[c.left]-q.weights[c.right]));
   if(c.relation>0)greater[a][b]=true;else if(c.relation<0)greater[b][a]=true;else{equal[a][b]=equal[b][a]=true;equalExamples++;}
  }
  // Propagate observable greater-than/equality, without consulting the hidden weight table.
  for(let pass=0;pass<q.items.length;pass++)for(let a=0;a<q.items.length;a++)for(let b=0;b<q.items.length;b++)for(let c=0;c<q.items.length;c++){
   if(equal[a][b]&&equal[b][c])equal[a][c]=true;
   if((greater[a][b]&&(greater[b][c]||equal[b][c]))||(equal[a][b]&&greater[b][c]))greater[a][c]=true;
  }
  const implied=q.items.filter((_,a)=>q.items.every((_,b)=>a===b||greater[a][b]));assert.equal(implied.length,1);
  assert.equal(g.check(q,implied[0]),true);assert.equal(g.solution(q),implied[0]);
  for(const wrong of q.items.filter(x=>x!==implied[0]))assert.equal(g.check(q,wrong),false);
 }
 assert.ok(equalExamples>100);
});

// Independent discrete gravity replay validates the generated witness and the real checker.
function replay(pieces,actions){
 let list=json(pieces);
 for(const id of actions){
  assert.ok(list.some(p=>p.id===id));list=list.filter(p=>p.id!==id);
  let moved=true;
  while(moved){moved=false;list.sort((a,b)=>a.y-b.y||a.id-b.id);
   for(const p of list){
    if(!p.y)continue;
    const cells=Array.from({length:p.width},(_,i)=>p.x+i);
    const stopped=list.some(o=>o.id!==p.id&&o.y===p.y-1&&cells.some(x=>x>=o.x&&x<o.x+o.width));
    if(!stopped){p.y--;moved=true;}
   }
  }
 }
 return list;
}
const cells=list=>list.flatMap(p=>Array.from({length:p.width},(_,i)=>`${p.x+i},${p.y}`)).sort();
test('analysis sculpting: 1000 random boards have legal solutions under independent gravity',()=>{
 const g=get('match-blast');let changedHeight=0,bridges=0;
 for(let level=1;level<=10;level++)for(let seed=1;seed<=100;seed++){
  const q=g.create(level,B.rng(seed*4217));
  const original=cells(q.pieces);assert.equal(new Set(original).size,original.length);
  assert.notDeepEqual(original,json(q.target));assert.ok(q.target.length>0);
  assert.ok(q.height<=5,'preserve large tappable blocks');
  for(const p of q.pieces){assert.ok(p.x>=0&&p.x+p.width<=q.width&&p.y>=0);if(p.width===2)bridges++;}
  const sequence=json(g.solution(q)),played=replay(q.pieces,sequence);
  assert.deepEqual(cells(played),json(q.target));assert.equal(g.check(q,sequence),true);
  if(played.some(p=>p.y<q.pieces.find(o=>o.id===p.id).y))changedHeight++;
  assert.equal(g.check(q,[]),false);assert.equal(g.check(q,[999]),false);assert.equal(g.check(q,[sequence[0],sequence[0]]),false);
  assert.deepEqual(json(g.physics.removeSequence(q.pieces,sequence)),json(played).sort((a,b)=>a.id-b.id).map(p=>p).sort((a,b)=>a.id-b.id),undefined);
 }
 assert.ok(changedHeight>300,'deletions must actually cause falling in many generated puzzles');assert.ok(bridges>300);
});
test('analysis sorting: independent semantic sets and size chains accept all and only correct selections',()=>{
 const g=get('speed-sorting'),animals=new Set([0,1,2,3,4,5]),fruits=new Set([6,7]),vehicles=new Set([8,9]),flying=new Set([2]);let ranks=0,multiple=0;
 for(let level=1;level<=10;level++)for(let seed=1;seed<=100;seed++){
  const q=g.create(level,B.rng(seed*5147));let expected;
  if(q.kind==='rank'){
   ranks++;const small=q.items.find(x=>[2,5,6,7].includes(x)),medium=q.items.find(x=>[0,1,4].includes(x));
   assert.ok(small!==undefined&&medium!==undefined&&q.items.includes(8));expected=[[8,medium,small][q.rank-1]];
  }else{const set={animal:animals,fruit:fruits,vehicle:vehicles,flies:flying}[q.criterion];assert.ok(set);expected=q.items.filter(x=>set.has(x));if(expected.length>1)multiple++;}
  assert.ok(expected.length);assert.equal(g.check(q,expected),true);assert.equal(g.check(q,[]),false);assert.equal(g.check(q,[...expected,expected[0]]),false);
  const distractor=q.items.find(x=>!expected.includes(x));assert.notEqual(distractor,undefined);assert.equal(g.check(q,[distractor]),false);
 }
 assert.ok(ranks>100);assert.ok(multiple>150);
});
function flatten(e){return[e,...e.children.flatMap(flatten)];}
function apiFor(g,q){let active=true,time=0;const submitted=[],fx=[];return{api:{active:()=>active,now:()=>time,answer:a=>{submitted.push(json(a));return g.check(q,a);},mistake(){},fx:n=>fx.push(n)},setTime:n=>time=n,setActive:v=>active=v,submitted,fx};}
test('analysis UI: each game mounts actual controls and rejects input while paused',()=>{
 for(const id of['cube-count','heavyweight','speed-sorting']){
  const g=get(id),q=g.create(4,B.rng(4567)),stage=node(),a=apiFor(g,q);g.mount(stage,q,a.api);
  const tiles=flatten(stage).filter(n=>n.className==='tile');assert.ok(tiles.length>=3);
  a.setActive(false);tiles[0].dispatch('click');assert.equal(a.submitted.length,0);
  a.setActive(true);
  if(id==='speed-sorting'){
   for(const value of g.solution(q)){const tile=tiles[q.items.indexOf(value)];tile.dispatch('click');}
   flatten(stage).find(n=>n.textContent==='选好啦').onclick();
  }else{const choices=id==='cube-count'?q.options:q.items;tiles[choices.indexOf(g.solution(q))].dispatch('click');}
  assert.equal(g.check(q,a.submitted.at(-1)),true);
 }
});
test('analysis UI: sculpting deletes whole blocks, animates gravity, undoes, resets and submits a live solution',()=>{
 const g=get('match-blast'),q=g.create(8,B.rng(99999)),stage=node(),a=apiFor(g,q),controller=g.mount(stage,q,a.api);
 const nodes=()=>flatten(stage).filter(n=>n.dataset.piece!==undefined);
 const first=q.plan[0];a.setActive(false);nodes().find(n=>Number(n.dataset.piece)===first).onclick();assert.equal(nodes().length,q.pieces.length);
 a.setActive(true);nodes().find(n=>Number(n.dataset.piece)===first).onclick();assert.equal(nodes().length,q.pieces.length-1);
 a.setTime(400);flatten(stage).find(n=>n.textContent==='↶ 撤回').onclick();assert.equal(nodes().length,q.pieces.length);
 for(let i=0;i<q.plan.length;i++){a.setTime(1000+i*400);nodes().find(n=>Number(n.dataset.piece)===q.plan[i]).onclick();controller.update(1000+i*400);}
 a.setTime(1000+q.plan.length*400);controller.update(1000+q.plan.length*400);assert.equal(a.submitted.length,1);assert.equal(g.check(q,a.submitted[0]),true);
 controller.update(1000+q.plan.length*500);assert.equal(a.submitted.length,1,'success is not emitted every frame');controller.destroy();
});
