import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const directory=new URL('../app/assets/brain-school/',import.meta.url);
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.listeners={};this.attrs={};this.disabled=false;this.offsetWidth=320;this.innerHTML='';this.textContent='';this.classes=new Set();this.classList={add:(s)=>this.classes.add(s),remove:(s)=>this.classes.delete(s),contains:(s)=>this.classes.has(s)};}
 appendChild(e){this.children.push(e);return e;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,val){this.attrs[name]=String(val);}
 click(){if(!this.disabled)this.listeners.click?.({target:this});}
}
function load(){
 const context={console,document:{createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t)}};context.window=context;vm.createContext(context);
 vm.runInContext(readFileSync(new URL('core.js',directory),'utf8'),context);
 vm.runInContext(readFileSync(new URL('visual.js',directory),'utf8'),context);
 return context.BrainSchool;
}
const plain=value=>JSON.parse(JSON.stringify(value));
const B=load(),ids=['shape-parts','shadow-shift','train-turn','true-view'];
const allNodes=n=>[n,...n.children.flatMap(allNodes)];
const definition=id=>B.games.get(id);
function connectivity(cells){const keys=new Set(cells.map(p=>p.join(','))),seen=new Set(),todo=[cells[0]];while(todo.length){const [x,y]=todo.pop(),key=[x,y].join(',');if(seen.has(key))continue;seen.add(key);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(keys.has([x+dx,y+dy].join(','))&&!seen.has([x+dx,y+dy].join(',')))todo.push([x+dx,y+dy]);}return seen.size===keys.size;}
function controls(game,q){let active=true,now=0;const answers=[],feedback=[],stage=new Node('section');const api={active:()=>active,now:()=>now,answer:a=>{answers.push(plain(a));return game.check(q,a);},mistake:()=>feedback.push('mistake'),fx:f=>feedback.push(f)};const view=game.mount(stage,q,api);return {stage,view,answers,feedback,setActive:v=>active=v,time:v=>{now=v;view.update?.(v,16);}};}

test('visual module registers four independently playable games',()=>{
 assert.deepEqual([...B.games.keys()],ids);for(const id of ids)assert.equal(definition(id).category,'visual');
});

test('all visual generators are deterministic and produce varied questions',()=>{
 for(const id of ids){const game=definition(id),seen=new Set();for(let seed=1;seed<=30;seed++){const a=game.create(6,B.rng(seed)),b=game.create(6,B.rng(seed));assert.deepEqual(plain(a),plain(b));seen.add(JSON.stringify(a));}assert.ok(seen.size>25,id);}
});

test('shape-parts builds connected non-overlapping slots and unique candidate shapes at every difficulty',()=>{
 const game=definition('shape-parts');
 for(let level=1;level<=10;level++)for(let seed=1;seed<=80;seed++){
  const q=game.create(level,B.rng(seed)),cells=q.parts.flatMap(p=>p.world),wanted=q.parts.map(p=>p.id);
  assert.equal(new Set(cells.map(p=>p.join(','))).size,cells.length,'pieces cannot overlap');assert.ok(connectivity(cells));
  assert.equal(new Set(q.choices.map(c=>c.id)).size,q.choices.length);
  q.parts.forEach(p=>{assert.ok(connectivity(p.world));assert.equal(p.cells.length,B.visualGeometry.shapeLibrary[p.id].length);assert.ok(q.choices.some(c=>c.id===p.id));});
  assert.ok(game.check(q,wanted));assert.ok(!game.check(q,wanted.slice(1)));assert.ok(!game.check(q,wanted.concat(wanted[0])));assert.ok(!game.check(q,[-1]));assert.ok(!game.check(q,null));
 }
 assert.ok(game.create(10,B.rng(1)).parts.length>game.create(1,B.rng(1)).parts.length);
});

test('shape-parts actual clicks snap only valid pieces, gate paused input and finish on the final piece',()=>{
 const game=definition('shape-parts'),q=game.create(6,B.rng(42)),c=controls(game,q),buttons=allNodes(c.stage).filter(n=>n.tagName==='BUTTON');
 const find=id=>buttons.find(b=>b.attrs['aria-label']==='积木图形'+(id+1));
 c.setActive(false);find(q.parts[0].id).click();assert.equal(c.feedback.length,0);c.setActive(true);
 const decoy=q.choices.find(p=>!q.parts.some(t=>t.id===p.id));find(decoy.id).click();assert.equal(c.feedback[0],'mistake');assert.equal(c.answers.length,0);
 q.parts.forEach(p=>find(p.id).click());assert.equal(c.answers.length,1);assert.ok(game.check(q,c.answers[0]));
 find(q.parts[0].id).click();assert.equal(c.answers.length,1);
});

test('shadow-shift samples distinct moving targets with distractors and requires every target',()=>{
 const game=definition('shadow-shift');for(let level=1;level<=10;level++)for(let seed=1;seed<=100;seed++){
  const q=game.create(level,B.rng(seed));assert.equal(new Set(q.targets).size,q.targets.length);assert.equal(new Set(q.candidates).size,q.candidates.length);
  assert.ok(q.candidates.length>=q.targets.length+2);assert.ok(q.targets.every(t=>q.candidates.includes(t)));assert.ok(game.check(q,q.targets));assert.ok(!game.check(q,[]));assert.ok(!game.check(q,q.targets.concat(q.targets[0])));
  const wrong=q.candidates.find(t=>!q.targets.includes(t));assert.ok(!game.check(q,q.targets.slice(1).concat(wrong)));
 }
});

test('shadow-shift mount animates silhouettes and submits actual selected tiles',()=>{
 const game=definition('shadow-shift'),q=game.create(7,B.rng(23)),c=controls(game,q),nodes=allNodes(c.stage),shadows=nodes.filter(n=>n.classes.has('visual-shadow'));
 c.time(0);const old=shadows.map(n=>n.style.transform);c.time(700);assert.ok(shadows.some((n,i)=>n.style.transform!==old[i]));
 const buttons=nodes.filter(n=>n.tagName==='BUTTON'),candidates=buttons.slice(0,q.candidates.length),submit=buttons.at(-1);
 submit.click();assert.equal(c.answers.length,1);assert.ok(!game.check(q,c.answers[0]));q.targets.forEach(t=>candidates[q.candidates.indexOf(t)].click());submit.click();assert.ok(game.check(q,c.answers.at(-1)));
});

function independentTurns(q){return Array.from(q.gaps,index=>{const a=q.path[index-1],b=q.path[index],c=q.path[index+1],ix=b[0]-a[0],iy=b[1]-a[1],ox=c[0]-b[0],oy=c[1]-b[1];assert.notEqual(ix*ox+iy*oy,-1,'path may not immediately reverse');return Math.sign(ix*oy-iy*ox);});}

test('train-turn random paths never cross themselves and each relative turn is geometrically valid',()=>{
 const game=definition('train-turn');for(let level=1;level<=10;level++)for(let seed=1;seed<=120;seed++){
  const q=game.create(level,B.rng(seed));assert.equal(new Set(q.path.map(p=>p.join(','))).size,q.path.length);assert.ok(q.path.length>=6);
  q.path.forEach((p,i)=>{assert.ok(p.every(v=>v>=0&&v<q.size));if(i)assert.equal(Math.abs(p[0]-q.path[i-1][0])+Math.abs(p[1]-q.path[i-1][1]),1);});
  assert.equal(q.gaps[0],1);assert.ok(q.gaps.every(i=>i>0&&i<q.path.length-1));const expected=independentTurns(q);assert.deepEqual(plain(game.solution(q)),expected);assert.ok(game.check(q,expected));
  const bad=expected.slice();bad[0]=bad[0]===0?1:0;assert.ok(!game.check(q,bad));assert.ok(!game.check(q,[]));assert.ok(!game.check(q,['constructor']));
 }
});

test('train-turn actual controls animate every filled stretch and score only after reaching the station',()=>{
 const game=definition('train-turn'),q=game.create(10,B.rng(327)),expected=independentTurns(q),c=controls(game,q),buttons=allNodes(c.stage).filter(n=>n.tagName==='BUTTON'),train=allNodes(c.stage).find(n=>n.className==='visual-train');
 let now=0;c.setActive(false);buttons[expected[0]+1].click();assert.equal(c.answers.length,0);c.setActive(true);
 const initial=train.style.left+train.style.top;buttons[(expected[0]===0?1:0)+1].click();assert.equal(c.feedback.at(-1),'mistake');
 expected.forEach(turn=>{buttons[turn+1].click();assert.ok(buttons.every(b=>b.disabled));now+=10000;c.time(now);});
 assert.notEqual(train.style.left+train.style.top,initial);assert.equal(c.answers.length,0);c.time(now+600);assert.equal(c.answers.length,1);assert.deepEqual(c.answers[0],expected);
});

test('true-view questions use unique actual scene positions and distinct camera projections',()=>{
 const game=definition('true-view');for(let level=1;level<=10;level++)for(let seed=1;seed<=120;seed++){
  const q=game.create(level,B.rng(seed));assert.equal(new Set(q.scene.map(o=>o.x+','+o.z)).size,q.scene.length);assert.equal(new Set(q.scene.map(o=>o.color)).size,q.scene.length);
  assert.equal(new Set(q.options).size,q.options.length);assert.ok(q.options.includes(q.view));
  const signatures=q.options.map(view=>B.visualGeometry.projectionSignature(q.scene,view));assert.equal(new Set(signatures).size,signatures.length,'identical options are unfair');
  const target=q.options.findIndex(v=>v===q.view);assert.equal(game.solution(q),target);q.options.forEach((_,i)=>assert.equal(game.check(q,i),i===target));assert.ok(!game.check(q,String(target)));
  q.scene.forEach(o=>{assert.ok(Number.isInteger(o.h)&&o.h>=1&&o.h<=2);for(let view=0;view<4;view++){
   const [screenX,screenY]=B.visualGeometry.project([o.x,o.h,o.z],view*Math.PI/2,1);
   const rotated=[[o.x,o.z],[-o.z,o.x],[-o.x,-o.z],[o.z,-o.x]][view];
   assert.ok(Math.abs(screenX-(160+rotated[0]))<1e-8);assert.ok(Math.abs(screenY-(165+rotated[1]*.36-o.h*.84))<1e-8);
  }});
 }
});

test('true-view renders finite geometry and actual orbit/answer controls',()=>{
 const game=definition('true-view'),q=game.create(10,B.rng(123));for(let view=0;view<4;view++){const svg=B.visualGeometry.sceneMarkup(q.scene,view*Math.PI/2,q.view);assert.ok(svg.includes('<polygon'));assert.ok(!/NaN|Infinity|undefined/.test(svg));}
 const c=controls(game,q),buttons=allNodes(c.stage).filter(n=>n.tagName==='BUTTON'),drawing=allNodes(c.stage).find(n=>n.tagName==='SVG'),before=drawing.innerHTML;
 buttons[0].click();assert.notEqual(drawing.innerHTML,before);c.setActive(false);buttons[1+q.options.indexOf(q.view)].click();assert.equal(c.answers.length,0);c.setActive(true);buttons[1+q.options.indexOf(q.view)].click();assert.equal(c.answers.length,1);assert.ok(game.check(q,c.answers[0]));
});
