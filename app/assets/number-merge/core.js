(function(root){
'use strict';
const DIRECTIONS=Object.freeze({up:Object.freeze([0,-1]),right:Object.freeze([1,0]),down:Object.freeze([0,1]),left:Object.freeze([-1,0])});
// Fixed boards. Numbers are tiles; goals stop and lock only the exact answer.
const definitions=[
 [4,4,[],[[4,1],[5,2]],[[7,3]]],
 [4,4,[],[[10,1],[11,3]],[[8,4]]],
 [4,4,[14],[[9,1],[10,2]],[[15,3]]],
 [4,4,[3],[[14,1],[13,1],[8,2]],[[4,4]]],
 [4,4,[0,8],[[11,1],[15,2],[7,2]],[[13,5]]],
 [4,4,[7,8],[[12,1],[4,2],[14,3]],[[13,6]]],
 [4,4,[4,9],[[10,1],[11,2],[8,4]],[[13,7]]],
 [4,4,[2,3,8],[[0,1],[1,2],[15,4]],[[11,3]]],
 [4,4,[2,6,12],[[11,1],[15,3],[3,5]],[[8,4]]],
 [4,4,[0,2,3],[[1,1],[12,2],[13,1],[10,3]],[[15,3],[5,4]]],
 [4,4,[0,3,6],[[9,1],[10,2],[11,2],[7,3]],[[1,3],[5,5]]],
 [4,4,[3,7,13],[[12,1],[9,2],[2,1],[0,4]],[[4,3],[5,5]]]
];
function define(id,w,h,walls,tiles,goals){
 const cells=Array(w*h).fill(0);tiles.forEach(([p,n])=>{cells[p]=n;});
 return Object.freeze({id,w,h,walls:Object.freeze(walls.slice()),cells:Object.freeze(cells),goals:Object.freeze(goals.map(([p,value])=>Object.freeze({p,value})))});
}
const LEVELS=Object.freeze(definitions.map((d,i)=>define(i+1,...d)));
const validLevel=i=>Number.isInteger(i)&&i>=0&&i<LEVELS.length;
function validCells(cells,level){return Array.isArray(cells)&&cells.length===level.w*level.h&&Array.from(cells).every((v,p)=>Number.isInteger(v)&&v>=0&&v<=10&&(!level.walls.includes(p)||v===0));}
const locked=(level,cells,p)=>level.goals.some(g=>g.p===p&&g.value===cells[p]);
const won=(cells,level)=>level.goals.every(g=>cells[g.p]===g.value);
function slide(level,cells,direction){
 if(typeof direction!=='string'||!Object.hasOwn(DIRECTIONS,direction))return null;const d=DIRECTIONS[direction];if(!validCells(cells,level))return null;
 const next=cells.slice(),merged=new Set(),traces=[],order=[];
 for(let p=0;p<next.length;p++)if(next[p])order.push(p);
 order.sort((a,b)=>(b%level.w*d[0]+Math.floor(b/level.w)*d[1])-(a%level.w*d[0]+Math.floor(a/level.w)*d[1]));
 let moved=false,mergeCount=0;const mergeEvents=[];
 for(const from of order){
  if(!next[from])continue;
  const value=next[from];let p=from,didMerge=false;
  if(!locked(level,next,p))for(let k=0;k<next.length;k++){
   const x=p%level.w+d[0],y=Math.floor(p/level.w)+d[1],q=y*level.w+x;
   if(x<0||x>=level.w||y<0||y>=level.h||level.walls.includes(q))break;
   if(next[q]){
    if(!merged.has(p)&&!merged.has(q)&&!locked(level,next,q)&&next[p]+next[q]<=10){mergeEvents.push({a:next[q],b:next[p],sum:next[q]+next[p],p:q});next[q]+=next[p];next[p]=0;merged.add(q);p=q;didMerge=true;moved=true;mergeCount++;}
    break;
   }
   next[q]=next[p];next[p]=0;if(merged.delete(p))merged.add(q);p=q;moved=true;
   if(locked(level,next,p))break;
  }
  traces.push({from,to:p,value,merged:didMerge});
 }
 return {cells:next,traces,moved,merges:mergeCount,mergeEvents,finished:won(next,level)};
}
function createState(level=0){if(!validLevel(level))throw RangeError('Invalid number-merge level');return {level,cells:LEVELS[level].cells.slice(),history:[],moves:0,finished:false};}
function move(state,direction){if(!state||!validLevel(state.level)||state.finished||state.history.length>=500)return null;const result=slide(LEVELS[state.level],state.cells,direction);if(!result?.moved)return null;state.cells=result.cells;state.history.push(direction);state.moves=state.history.length;state.finished=result.finished;return result;}
function undo(state){if(!state?.history.length||!validLevel(state.level))return false;const replay=createState(state.level);for(const d of state.history.slice(0,-1))if(!move(replay,d))return false;Object.assign(state,replay);return true;}
function solve(levelOrState,maxNodes=100000,maxDepth=30){
 const s=Number.isInteger(levelOrState)?createState(levelOrState):levelOrState;if(!s||!validLevel(s.level)||!validCells(s.cells,LEVELS[s.level]))return null;
 const level=LEVELS[s.level],nodes=[{cells:s.cells.slice(),parent:-1,direction:null,depth:0}],seen=new Set([s.cells.join(',')]);
 for(let head=0;head<nodes.length&&head<maxNodes;head++){
  const n=nodes[head];if(won(n.cells,level)){const steps=[];let p=head;while(nodes[p].parent>=0){steps.push(nodes[p].direction);p=nodes[p].parent;}return {moves:steps.reverse(),visited:head+1};}
  if(n.depth>=maxDepth)continue;
  for(const direction of Object.keys(DIRECTIONS)){const r=slide(level,n.cells,direction);if(!r.moved)continue;const key=r.cells.join(',');if(seen.has(key))continue;seen.add(key);nodes.push({cells:r.cells,parent:head,direction,depth:n.depth+1});}
 }
 return null;
}
function restore(raw){
 const stars=Array.from({length:LEVELS.length},(_,i)=>Number.isInteger(raw?.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0),fail=()=>({stars,session:null});
 if(!raw||raw.schema!==1)return {stars:Array(LEVELS.length).fill(0),session:null};
 const s=raw.session;if(!s||!validLevel(s.level)||!validCells(s.cells,LEVELS[s.level])||!Array.isArray(s.history)||s.history.length>500||s.moves!==s.history.length||typeof s.finished!=='boolean')return fail();
 const replay=createState(s.level);for(const d of s.history)if(!move(replay,d))return fail();
 if(replay.finished!==s.finished||JSON.stringify(replay.cells)!==JSON.stringify(s.cells))return fail();return {stars,session:replay};
}
function createDirectionGate(options){return root.RugeMotion.createDirectionGate(options);}
const api={LEVELS,DIRECTIONS,define,slide,move,undo,createState,restore,solve,won,locked,validCells,createDirectionGate};
root.NumberMerge=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
