(function(root){
  'use strict';
  const PAIRS=Object.freeze([2,2,3,3,4,4,5,5,6,6,7,7,8,8,6,7,8,8,5,5,6,6,6,6,7,7,7,7,7,7,8,8,8,8,8,8]);
  const COLUMNS=Object.freeze([2,2,3,2,4,2,3,5,3,4,4,4,4,4,3,4,4,4,3,4,3,4,4,3,3,4,5,3,4,5,4,5,4,5,3,5]);
  const PREVIEW=Object.freeze([0,2500,0,3000,0,3500,0,0,3500,0,4000,0,4500,3000,0,2500,2500,0,1500,0,1500,2000,1500,0,2000,2000,1500,1500,1500,0,2000,2000,1500,1500,1500,0]);
  const validLevel=i=>Number.isInteger(i)&&i>=0&&i<PAIRS.length;
  const shuffle=(items,random)=>{for(let i=items.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[items[i],items[j]]=[items[j],items[i]];}return items;};
  function createState(level=0,random=Math.random){if(!validLevel(level))throw new RangeError('Invalid memory level');const ids=shuffle([0,1,2,3,4,5,6,7],random).slice(0,PAIRS[level]);return {level,deck:shuffle(ids.flatMap(id=>[id,id]),random),matched:[],open:[],moves:0,phase:PREVIEW[level]?'preview':'choose'};}
  function hidePreview(s){if(s.phase!=='preview')return false;s.phase='choose';return true;}
  function flip(s,index){if(s.phase!=='choose'||!Number.isInteger(index)||index<0||index>=s.deck.length||s.matched.includes(index)||s.open.includes(index))return null;s.open.push(index);if(s.open.length===2){s.moves++;s.phase='reveal';return {pair:true,match:s.deck[s.open[0]]===s.deck[s.open[1]]};}return {pair:false};}
  function settle(s){if(s.phase!=='reveal')return null;const match=s.deck[s.open[0]]===s.deck[s.open[1]];if(match)s.matched.push(...s.open);s.open=[];s.phase=s.matched.length===s.deck.length?'won':'choose';return {match,finished:s.phase==='won'};}
  function stars(s){return s.phase!=='won'?0:s.moves<=PAIRS[s.level]+1?3:s.moves<=PAIRS[s.level]*2?2:1;}
  function restore(raw){const saved={stars:Array(PAIRS.length).fill(0),session:null};if(!raw||raw.schema!==1)return saved;saved.stars=saved.stars.map((_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0);const s=raw.session;if(!s||!validLevel(s.level)||!Array.isArray(s.deck)||s.deck.length!==PAIRS[s.level]*2||s.deck.some(id=>!Number.isInteger(id)||id<0||id>7)||!Array.isArray(s.open)||!Array.isArray(s.matched)||!Number.isInteger(s.moves)||s.moves<0||s.moves>100000)return saved;
    const ids=new Set(s.deck);if(ids.size!==PAIRS[s.level]||[...ids].some(id=>s.deck.filter(x=>x===id).length!==2))return saved;
    if(s.matched.length%2||s.matched.some(i=>!Number.isInteger(i)||i<0||i>=s.deck.length)||new Set(s.matched).size!==s.matched.length||[...ids].some(id=>s.matched.filter(i=>s.deck[i]===id).length%2))return saved;
    if(s.open.length>2||new Set(s.open).size!==s.open.length||s.open.some(i=>!Number.isInteger(i)||i<0||i>=s.deck.length||s.matched.includes(i))||s.moves<s.matched.length/2+(s.open.length===2?1:0))return saved;
    if(!['preview','choose','reveal','won'].includes(s.phase)||(s.phase==='reveal')!==(s.open.length===2)||(s.phase==='won')!==(s.matched.length===s.deck.length)||s.phase==='won'&&s.open.length)return saved;
    if(s.phase==='preview'&&(!PREVIEW[s.level]||s.moves||s.open.length||s.matched.length))return saved;
    saved.session={level:s.level,deck:s.deck.slice(),matched:s.matched.slice(),open:s.open.slice(),moves:s.moves,phase:s.phase};return saved;
  }
  const api={PAIRS,COLUMNS,PREVIEW,createState,hidePreview,flip,settle,stars,restore};root.ToyMemory=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
