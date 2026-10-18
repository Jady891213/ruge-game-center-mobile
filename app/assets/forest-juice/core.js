(function(root){
  'use strict';
  const COLORS=Object.freeze([
    Object.freeze({name:'草莓',hex:'#f4768d',light:'#ffb6c2'}),
    Object.freeze({name:'蓝莓',hex:'#719fe8',light:'#b3d5ff'}),
    Object.freeze({name:'芒果',hex:'#f6c64d',light:'#ffeaa0'}),
    Object.freeze({name:'青苹果',hex:'#6ac9a1',light:'#b7f0ca'})
  ]);
  // Each tube is stored bottom first. Fixed boards, never unverified shuffles.
  const boards=[
    [2,[[0,1],[1,0],[],[]]],
    [2,[[0,1],[0,1],[],[]]],
    [3,[[0,1,0],[1,0,1],[],[]]],
    [3,[[0,1,0],[1,2,1],[2,0,2],[],[]]],
    [3,[[0,1,2],[1,2,0],[2,0,1],[],[]]],
    [3,[[0,2,1],[2,1,0],[1,0,2],[]]],
    [3,[[0,1,2],[0,2,1],[1,2,0],[]]],
    [4,[[0,1,2,0],[1,2,0,1],[2,0,1,2],[],[]]],
    [4,[[0,1,0,1],[1,0,1,0],[2,3,2,3],[3,2,3,2],[],[]]],
    [4,[[0,1,2,3],[1,2,3,0],[2,3,0,1],[3,0,1,2],[],[]]],
    [4,[[0,2,1,3],[1,3,2,0],[2,0,3,1],[3,1,0,2],[],[]]],
    [4,[[0,1,2,3],[1,0,3,2],[2,3,0,1],[3,2,1,0],[],[]]],
    // 4.33: new fixed puzzles, solved with the real slide/pour rules before inclusion.
    [3,[[2,1,0],[1,2,0],[1,0,2],[],[]]],
    [3,[[0,1,2],[1,0,1],[2,0,2],[],[]]],
    [3,[[0,2,1],[1,2,0],[1,0,2],[],[]]],
    [3,[[0,2,1],[0,2,1],[1,0,2],[],[]]],
    [3,[[2,1,0],[2,0,1],[2,0,1],[],[]]],
    [3,[[0,2,1],[1,0,2],[1,0,2],[],[]]],
    [4,[[1,3,1,3],[2,3,3,0],[1,2,2,0],[1,0,2,0],[],[]]],
    [4,[[2,1,0,1],[2,3,2,0],[2,3,0,3],[1,3,0,1],[],[]]],
    [4,[[0,1,1,3],[3,0,1,0],[3,2,3,1],[2,0,2,2],[],[]]],
    [4,[[1,2,3,3],[1,0,1,3],[3,2,2,0],[0,2,1,0],[],[]]],
    [4,[[0,2,3,3],[2,2,1,3],[0,2,0,1],[1,3,0,1],[],[]]],
    [4,[[0,1,2,1],[0,3,0,3],[2,1,2,3],[0,1,2,3],[],[]]],
    [4,[[2,1,1,0],[3,2,3,3],[2,3,1,0],[2,0,1,0],[],[]]],
    [4,[[0,3,2,2],[0,2,0,1],[1,3,2,3],[0,1,3,1],[],[]]],
    [4,[[0,1,2,2],[0,1,3,0],[0,3,2,3],[1,1,2,3],[],[]]],
    [4,[[1,0,3,1],[0,3,0,3],[1,1,3,2],[2,0,2,2],[],[]]],
    [4,[[3,3,1,3],[0,2,2,0],[1,2,2,3],[1,0,1,0],[],[]]],
    [4,[[0,2,2,1],[0,3,0,3],[2,1,1,3],[0,1,2,3],[],[]]],
    [4,[[2,1,0,1],[3,1,1,3],[2,0,2,3],[3,0,2,0],[],[]]],
    [4,[[3,1,0,2],[3,2,1,3],[3,0,1,2],[0,0,1,2],[],[]]],
    [4,[[0,2,0,2],[0,3,0,3],[1,3,1,1],[2,3,2,1],[],[]]],
    [4,[[1,1,2,1],[1,2,3,0],[3,2,3,0],[3,2,0,0],[],[]]],
    [4,[[2,0,1,3],[0,1,3,2],[0,3,0,2],[1,3,1,2],[],[]]],
    [4,[[2,1,0,2],[2,1,0,3],[3,1,0,3],[0,1,2,3],[],[]]]
  ];
  const LEVELS=Object.freeze(boards.map(([capacity,tubes],i)=>Object.freeze({id:i+1,capacity,colors:tubes.filter(t=>t.length).length,tubes:Object.freeze(tubes.map(t=>Object.freeze(t)))})));
  const copy=tubes=>tubes.map(t=>t.slice());
  const validLevel=i=>Number.isInteger(i)&&i>=0&&i<LEVELS.length;
  function won(tubes,capacity){return tubes.every(t=>!t.length||t.length===capacity&&t.every(c=>c===t[0]));}
  function pourCount(tubes,capacity,from,to){
    if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||!tubes[from]||!tubes[to])return 0;
    const a=tubes[from],b=tubes[to];
    if(!a.length||b.length>=capacity||b.length&&b[b.length-1]!==a[a.length-1])return 0;
    let run=1;while(run<a.length&&a[a.length-1-run]===a[a.length-1])run++;
    return Math.min(run,capacity-b.length);
  }
  function transfer(tubes,from,to,count){for(let i=0;i<count;i++)tubes[to].push(tubes[from].pop());}
  function createState(level=0){
    if(!validLevel(level))throw new RangeError('Invalid juice level');
    return {level,tubes:copy(LEVELS[level].tubes),history:[],moves:0,finished:false};
  }
  function pour(state,from,to){
    if(state.finished||state.history.length>=1000)return 0;
    const count=pourCount(state.tubes,LEVELS[state.level].capacity,from,to);
    if(!count)return 0;
    transfer(state.tubes,from,to,count);state.history.push([from,to,count]);state.moves=state.history.length;
    state.finished=won(state.tubes,LEVELS[state.level].capacity);return count;
  }
  function undo(state){
    const last=state.history.pop();if(!last)return false;
    transfer(state.tubes,last[1],last[0],last[2]);state.moves=state.history.length;state.finished=false;return true;
  }
  function validBoard(tubes,level){
    const spec=LEVELS[level];
    if(!Array.isArray(tubes)||tubes.length!==spec.tubes.length)return false;
    const count=Array(spec.colors).fill(0);
    for(const t of tubes){
      if(!Array.isArray(t)||t.length>spec.capacity)return false;
      for(const c of t){if(!Number.isInteger(c)||c<0||c>=spec.colors)return false;count[c]++;}
    }
    return count.every(n=>n===spec.capacity);
  }
  function restore(raw){
    const empty={stars:Array(LEVELS.length).fill(0),session:null};if(!raw||raw.schema!==1)return empty;
    const stars=Array.from({length:LEVELS.length},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0);
    const fail=()=>({stars,session:null}),s=raw.session;
    if(!s||!validLevel(s.level)||!validBoard(s.tubes,s.level)||!Array.isArray(s.history)||s.history.length>1000||s.moves!==s.history.length||typeof s.finished!=='boolean')return fail();
    const replay=createState(s.level);
    for(const m of s.history){
      if(!Array.isArray(m)||m.length!==3||!m.every(Number.isInteger)||m[2]!==pourCount(replay.tubes,LEVELS[s.level].capacity,m[0],m[1])||!m[2]||pour(replay,m[0],m[1])!==m[2])return fail();
    }
    if(JSON.stringify(replay.tubes)!==JSON.stringify(s.tubes)||replay.finished!==s.finished)return fail();
    return {stars,session:replay};
  }
  // Breadth-first solver uses exactly pourCount/transfer, with tube-permutation
  // symmetry only. Returned moves always refer to the original board's indices.
  function solve(levelOrState,maxNodes=250000){
    const state=Number.isInteger(levelOrState)?createState(levelOrState):levelOrState;
    if(!state||!validLevel(state.level)||!validBoard(state.tubes,state.level))throw new Error('Invalid solver state');
    const cap=LEVELS[state.level].capacity,key=t=>t.map(a=>a.join(',')).sort().join('|');
    const nodes=[{tubes:copy(state.tubes),parent:-1,move:null}],seen=new Set([key(state.tubes)]);
    for(let head=0;head<nodes.length&&head<maxNodes;head++){
      const n=nodes[head];
      if(won(n.tubes,cap)){
        const moves=[];let p=head;while(nodes[p].parent>=0){moves.push(nodes[p].move);p=nodes[p].parent;}
        return {moves:moves.reverse(),visited:head+1};
      }
      for(let a=0;a<n.tubes.length;a++)for(let b=0;b<n.tubes.length;b++){
        const count=pourCount(n.tubes,cap,a,b);if(!count)continue;
        // Moving a homogeneous whole tube into an empty tube changes no puzzle.
        if(!n.tubes[b].length&&count===n.tubes[a].length)continue;
        const t=copy(n.tubes);transfer(t,a,b,count);const k=key(t);if(seen.has(k))continue;
        seen.add(k);nodes.push({tubes:t,parent:head,move:[a,b]});
      }
    }
    return null;
  }
  const api={COLORS,LEVELS,createState,pourCount,pour,undo,won,validBoard,restore,solve};
  root.ForestJuice=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
