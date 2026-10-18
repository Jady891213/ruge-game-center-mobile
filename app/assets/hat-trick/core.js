(function(root){
  'use strict';
  const ANIMALS=Object.freeze(['星星','火箭','机器人','礼物','帆船','小花']);
  // Positions are stable places on the mat. Each move exchanges only two hats,
  // and the view animates those same two objects before advancing this state.
  const specs=[
    [[0,1,2],[1],'track',[[0,1],[1,2]]],
    [[2,0,1],[2],'track',[[0,2],[1,2],[0,1]]],
    [[1,2,0],[0],'track',[[1,2],[0,2],[0,1],[1,2]]],
    [[0,1,2,3],[3],'track',[[0,1],[2,3],[0,3]]],
    [[3,1,0,2],[1],'track',[[0,3],[1,2],[0,1],[2,3]]],
    [[1,3,2,0],[2],'late',[[0,2],[1,3],[2,3],[0,1]]],
    [[0,2,3,1],[0,3],'late',[[0,3],[1,2],[0,2],[1,3]]],
    [[2,1,3,0],[1,2],'pair',[[0,1],[2,3],[0,3],[1,2]]],
    [[0,1,2,3,4],[0,4],'pair',[[0,4],[1,3],[0,2],[2,4]]],
    [[3,0,2,1],[2,0],'order',[[0,2],[1,3],[0,1],[2,3],[0,3]]],
    [[4,2,0,3,1],[1],'late',[[0,2],[1,4],[2,3],[0,4],[1,3]]],
    [[1,4,3,0,2],[1,3],'pair',[[0,4],[1,3],[2,4],[0,3],[1,2]]],
    [[2,0,4,1,3],[4,0],'order',[[0,3],[1,4],[0,2],[2,4],[1,3],[0,4]]],
    [[0,1,2,3,4,5],[5],'late',[[0,5],[1,4],[2,3],[0,3],[2,5]]],
    [[5,2,4,0,3,1],[2,5],'pair',[[0,3],[1,4],[2,5],[0,5],[1,2]]],
    [[1,5,0,4,2,3],[1,4,0],'order',[[0,4],[1,5],[2,3],[0,3],[2,5],[1,4]]],
    [[4,3,1,5,0,2],[3,0],'late',[[0,5],[1,4],[2,3],[0,2],[3,5],[1,3]]],
    [[3,0,5,2,1,4],[5,1,3],'order',[[0,5],[1,4],[2,3],[0,2],[3,5],[1,3],[2,4]]],
  ];
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  const LEVELS=freeze(specs.map(([initial,targets,mode,swaps],i)=>({id:i+1,initial,targets,mode,swaps,duration:i<3?1000:900})));
  const validLevel=i=>Number.isInteger(i)&&i>=0&&i<LEVELS.length;
  function createState(level=0){if(!validLevel(level))throw new RangeError('Invalid hat level');return {level,order:LEVELS[level].initial.slice(),phase:'preview',move:0,found:[],attempts:0,mistakes:0};}
  function hide(s){if(s.phase!=='preview')return false;s.phase='shuffle';return true;}
  function nextSwap(s){if(s.phase!=='shuffle')return null;return LEVELS[s.level].swaps[s.move].slice();}
  function advance(s){const pair=nextSwap(s);if(!pair)return false;[s.order[pair[0]],s.order[pair[1]]]=[s.order[pair[1]],s.order[pair[0]]];s.move++;if(s.move===LEVELS[s.level].swaps.length)s.phase='choose';return true;}
  function target(s){const l=LEVELS[s.level];return l.mode==='order'?l.targets[s.found.length]:null;}
  function pick(s,index){if(s.phase!=='choose'||!Number.isInteger(index)||index<0||index>=s.order.length)return null;const id=s.order[index],l=LEVELS[s.level];if(s.found.includes(id))return null;s.attempts++;const correct=l.mode==='order'?id===target(s):l.targets.includes(id);if(correct){s.found.push(id);if(s.found.length===l.targets.length)s.phase='won';}else s.mistakes++;return {correct,id,finished:s.phase==='won'};}
  function replay(s){const mistakes=s.mistakes;Object.assign(s,createState(s.level),{attempts:mistakes,mistakes});return s;}
  function solution(level){const s=createState(level);hide(s);while(s.phase==='shuffle')advance(s);return LEVELS[level].targets.map(id=>s.order.indexOf(id));}
  function restore(raw){const empty={stars:Array(18).fill(0),session:null};if(!raw||raw.schema!==1)return empty;const stars=Array.from({length:18},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0),fail=()=>({stars,session:null}),s=raw.session;
    if(!s||!validLevel(s.level)||!['preview','shuffle','choose','won'].includes(s.phase)||!Number.isInteger(s.move)||!Array.isArray(s.order)||!Array.isArray(s.found)||new Set(s.found).size!==s.found.length||!Number.isInteger(s.attempts)||!Number.isInteger(s.mistakes)||s.attempts<0||s.attempts>100000||s.mistakes<0||s.mistakes+s.found.length!==s.attempts)return fail();
    const l=LEVELS[s.level],r=createState(s.level);if(s.move<0||s.move>l.swaps.length||s.found.some(id=>!l.targets.includes(id)))return fail();
    if(s.phase==='preview'&&(s.move||s.found.length)||s.phase==='shuffle'&&(s.move>=l.swaps.length||s.found.length)||['choose','won'].includes(s.phase)&&s.move!==l.swaps.length)return fail();
    if(s.phase!=='preview'){hide(r);for(let i=0;i<s.move;i++)advance(r);}if(JSON.stringify(r.order)!==JSON.stringify(s.order))return fail();
    if(l.mode==='order'&&s.found.some((id,i)=>id!==l.targets[i]))return fail();if((s.phase==='won')!==(s.found.length===l.targets.length))return fail();
    r.phase=s.phase;r.found=s.found.slice();r.attempts=s.attempts;r.mistakes=s.mistakes;
    // A saved half-shuffle is replayed from its original reveal. Revealing the
    // hidden current permutation on return would give away an unearned answer.
    if(r.phase==='shuffle')replay(r);return {stars,session:r};
  }
  const api={ANIMALS,LEVELS,createState,hide,nextSwap,advance,target,pick,replay,solution,restore};root.HatTrick=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
