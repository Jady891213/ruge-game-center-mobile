(function(root){
'use strict';
const DIRECTIONS=Object.freeze({up:Object.freeze([0,-1]),right:Object.freeze([1,0]),down:Object.freeze([0,1]),left:Object.freeze([-1,0])});
const COLORS=Object.freeze([{name:'珊瑚星',color:'#f58a83',light:'#ffe0d3'},{name:'蓝星',color:'#67b7ed',light:'#c6e9ff'}]);
// One cell is one whole position. Uppercase = star, lowercase = matching nest.
const boards=[
 ['A..a','....','....','....'],
 ['A...','.#..','....','...a'],
 ['....','...A','#.a.','.#..'],
 ['..#A','....','...#','.a..'],
 ['..#.','...a','....','A#..'],
 ['.#..','.b.#','#.#B','A.a.'],
 ['..#B','A.a.','.#..','.b.#'],
 ['.....','.....','.....','..a#A','...#.'],
 ['.#...','A..b.','.....','.B..a','.###.'],
 ['..B..','.A#..','.#.b.','..a..','#....'],
 ['.....','...b#','...A#','Ba#..','..###'],
 ['B..A.','#..#a','...b.','.....','.....']
];
function parse(rows,id){
 const w=rows[0].length,h=rows.length,walls=[],balls=[],goals=[];
 rows.forEach((row,y)=>{if(row.length!==w)throw Error('Invalid row');[...row].forEach((c,x)=>{
  if(c==='#')walls.push(y*w+x);
  else if(/[AB]/.test(c))balls[c==='A'?0:1]=y*w+x;
  else if(/[ab]/.test(c))goals[c==='a'?0:1]=y*w+x;
  else if(c!=='.')throw Error('Invalid cell');
 });});
 if(!balls.length||balls.length!==goals.length||Array.from(balls).some(v=>v==null)||Array.from(goals).some(v=>v==null))throw Error('Invalid pieces');
 return Object.freeze({id,w,h,walls:Object.freeze(walls),balls:Object.freeze(balls),goals:Object.freeze(goals)});
}
const LEVELS=Object.freeze(boards.map((b,i)=>parse(b,i+1)));
const copy=a=>a.slice(),validLevel=i=>Number.isInteger(i)&&i>=0&&i<LEVELS.length;
function won(positions,level){return positions.every((p,i)=>p===level.goals[i]);}
function validPositions(positions,level){return Array.isArray(positions)&&positions.length===level.balls.length&&new Set(positions).size===positions.length&&Array.from(positions).every(p=>Number.isInteger(p)&&p>=0&&p<level.w*level.h&&!level.walls.includes(p));}
// Front-to-back processing permits stars in the same lane to follow each other.
// A star entering its own nest stops and blocks other stars for later steps.
function slide(level,positions,direction){
 const d=DIRECTIONS[direction];if(!d||!validPositions(positions,level))return null;
 const next=copy(positions),paths=positions.map(p=>[p]);
 const order=next.map((p,i)=>i).sort((a,b)=>((next[b]%level.w)*d[0]+Math.floor(next[b]/level.w)*d[1])-((next[a]%level.w)*d[0]+Math.floor(next[a]/level.w)*d[1]));
 let moved=false;
 for(let step=0;step<level.w*level.h;step++){
  let changed=false;
  for(const i of order){
   if(next[i]===level.goals[i])continue;
   const p=next[i],x=p%level.w+d[0],y=Math.floor(p/level.w)+d[1],q=y*level.w+x;
   if(x<0||x>=level.w||y<0||y>=level.h||level.walls.includes(q)||next.includes(q))continue;
   next[i]=q;paths[i].push(q);changed=true;moved=true;
  }
  if(!changed)break;
 }
 return {positions:next,paths,moved,finished:won(next,level)};
}
function createState(level=0){if(!validLevel(level))throw RangeError('Invalid star-box level');return {level,positions:copy(LEVELS[level].balls),history:[],moves:0,finished:false};}
function move(state,direction){
 if(!state||!validLevel(state.level)||state.finished||state.history.length>=1000)return null;
 const result=slide(LEVELS[state.level],state.positions,direction);if(!result||!result.moved)return null;
 state.positions=result.positions;state.history.push(direction);state.moves=state.history.length;state.finished=result.finished;return result;
}
function undo(state){
 if(!state?.history.length||!validLevel(state.level))return false;
 const history=state.history.slice(0,-1),replay=createState(state.level);for(const d of history)if(!move(replay,d))return false;
 Object.assign(state,replay);return true;
}
function solve(levelOrState,maxNodes=100000){
 const s=Number.isInteger(levelOrState)?createState(levelOrState):levelOrState;
 if(!s||!validLevel(s.level)||!validPositions(s.positions,LEVELS[s.level]))return null;
 const level=LEVELS[s.level],nodes=[{positions:copy(s.positions),parent:-1,direction:null}],seen=new Set([s.positions.join(',')]);
 for(let head=0;head<nodes.length&&head<maxNodes;head++){
  const n=nodes[head];if(won(n.positions,level)){const moves=[];let p=head;while(nodes[p].parent>=0){moves.push(nodes[p].direction);p=nodes[p].parent;}return {moves:moves.reverse(),visited:head+1};}
  for(const direction of Object.keys(DIRECTIONS)){
   const result=slide(level,n.positions,direction);if(!result.moved)continue;const k=result.positions.join(',');if(seen.has(k))continue;
   seen.add(k);nodes.push({positions:result.positions,parent:head,direction});
  }
 }
 return null;
}
function restore(raw){
 const empty={stars:Array(12).fill(0),session:null};if(!raw||raw.schema!==1)return empty;
 const stars=Array.from({length:12},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0),fail=()=>({stars,session:null});
 const s=raw.session;if(!s||!validLevel(s.level)||!validPositions(s.positions,LEVELS[s.level])||!Array.isArray(s.history)||s.history.length>1000||s.moves!==s.history.length||typeof s.finished!=='boolean')return fail();
 const replay=createState(s.level);for(const d of s.history)if(!move(replay,d))return fail();
 if(replay.finished!==s.finished||JSON.stringify(replay.positions)!==JSON.stringify(s.positions))return fail();
 return {stars,session:replay};
}
// Schmitt trigger + stable direction timer. A held tilt emits once; changing
// direction is allowed, but the same direction must first return through neutral.
function createDirectionGate({enter=.18,exit=.08,stable=.11}={}){
 let held=null,candidate=null,elapsed=0,neutralWait=false;
 function reset(requireNeutral=false){held=null;candidate=null;elapsed=0;neutralWait=requireNeutral;}
 function read(x,y,dt){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(dt)||dt<0){candidate=null;elapsed=0;return null;}
  const amplitude=Math.max(Math.abs(x),Math.abs(y));
  if(amplitude<=exit){reset();return null;}
  if(neutralWait)return null;
  if(amplitude<enter){candidate=null;elapsed=0;return null;}
  const direction=Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';
  if(direction===held){candidate=null;elapsed=0;return null;}
  if(candidate!==direction){candidate=direction;elapsed=0;}
  elapsed+=Math.min(dt,.05);if(elapsed+1e-9<stable)return null;
  held=direction;candidate=null;elapsed=0;return direction;
 }
 return {read,reset,status:()=>({held,candidate,elapsed,neutralWait})};
}
const api={LEVELS,COLORS,DIRECTIONS,parse,slide,move,undo,createState,restore,solve,won,validPositions,createDirectionGate};
root.TiltStarBox=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
