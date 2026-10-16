/* Original game rules. Stroke geometry is in strokes.js, licensed separately. */
(function(root){
'use strict';
const KEY='rugeHanziStrokesV1';
const combinations=(a,n)=>n===0?[[]]:a.flatMap((v,i)=>combinations(a.slice(i+1),n-1).map(r=>[v,...r]));
const h=(a)=>({一:combinations(a,1),...(a.length>=2?{二:combinations(a,2)}:{}),...(a.length>=3?{三:combinations(a,3)}:{})});
const target=(char,pinyin,sets)=>({char,pinyin,sets:sets.map(s=>s.slice().sort((a,b)=>a-b))});
function level(source,answers,extras={}){
 const py={王:'wáng',田:'tián',白:'bái',本:'běn',目:'mù',米:'mǐ',早:'zǎo',意:'yì',一:'yī',二:'èr',三:'sān',十:'shí',工:'gōng',土:'tǔ',干:'gān',人:'rén',木:'mù',口:'kǒu',日:'rì',立:'lì',心:'xīn',音:'yīn'};
 return {source,targets:Object.entries({...answers,...extras}).map(([ch,sets])=>target(ch,py[ch],sets))};
}
// Stroke indices are zero based in standard writing order. A folded stroke is indivisible.
// Only original strokes at their original positions can be used; no turning or moving.
const LEVELS=[
 level('三',h([0,1,2])),
 level('王',h([0,1,3]),{十:[[1,2]],工:[[0,2,3]],土:[[1,2,3]],干:[[0,1,2]]}),
 level('木',h([0]),{十:[[0,1]],人:[[2,3]]}),
 level('田',h([2,4]),{口:[[0,1,4]],日:[[0,1,2,4]],十:[[2,3]]}),
 level('白',h([3,4]),{口:[[1,2,4]],日:[[1,2,3,4]]}),
 level('本',h([0,4]),{十:[[0,1]],人:[[2,3]],木:[[0,1,2,3]]}),
 level('目',h([2,3,4]),{口:[[0,1,4]],日:[[0,1,2,4],[0,1,3,4]]}),
 level('米',h([2]),{十:[[2,3]],人:[[4,5]],木:[[2,3,4,5]]}),
 level('早',h([2,3,4]),{十:[[4,5]],口:[[0,1,3]],日:[[0,1,2,3]],干:[[3,4,5]]}),
 level('意',h([1,4,7,8]),{口:[[5,6,8]],日:[[5,6,7,8]],立:[[0,1,2,3,4]],心:[[9,10,11,12]],音:[[0,1,2,3,4,5,6,7,8]]}),
];
const STROKE_COUNTS=[3,4,4,5,5,5,5,6,6,13];
// Selecting every original stroke also finds the source character itself.
LEVELS.forEach((lv,i)=>{
 const all=Array.from({length:STROKE_COUNTS[i]},(_,n)=>n);
 if(!lv.targets.some(t=>t.char===lv.source)){
  const py=['sān','wáng','mù','tián','bái','běn','mù','mǐ','zǎo','yì'][i];
  lv.targets.push(target(lv.source,py,[all]));
 }
});
// A stroke index is global within the level; parts retain their own source geometry.
for(const lv of LEVELS)lv.parts=[{char:lv.source,offset:0,count:root.HanziStrokeData[lv.source].strokes.length}];
const extra=root.HanziExtraContent;
if(!extra)throw new Error('Missing offline Hanzi level content');
for(const item of extra.levels){
 let offset=0;const parts=[...item.source].map(char=>{const count=root.HanziStrokeData[char].strokes.length;const part={char,offset,count};offset+=count;return part;});
 const targets=new Map();
 function add(char,pinyin,sets){
  if(!targets.has(char))targets.set(char,{char,pinyin,sets:[]});
  const target=targets.get(char);
  for(const set of sets){const sorted=set.slice().sort((a,b)=>a-b),key=sorted.join(',');if(!target.sets.some(s=>s.join(',')===key))target.sets.push(sorted);}
 }
 for(const part of parts)for(const t of extra.profiles[part.char].targets)add(t.char,t.pinyin,t.sets.map(set=>set.map(i=>i+part.offset)));
 for(const t of item.cross||[])add(t.char,t.pinyin,[t.parts.flatMap(p=>p.strokes.map(i=>i+parts[p.at].offset))]);
 // Whole horizontal strokes may also come from different source characters.
 if(parts.length>1){
  const horizontal=parts.flatMap(part=>(extra.profiles[part.char].targets.find(t=>t.char==='一')?.sets||[]).filter(s=>s.length===1).map(s=>part.offset+s[0]));
  for(let n=2;n<=Math.min(3,horizontal.length);n++)add(n===2?'二':'三',n===2?'èr':'sān',combinations(horizontal,n));
 }
 LEVELS.push({source:item.source,parts,targets:[...targets.values()]});STROKE_COUNTS.push(offset);
}
const signature=a=>a.slice().sort((a,b)=>a-b).join(',');
function match(li,selection){
 if(!Number.isInteger(li)||!LEVELS[li]||!Array.isArray(selection)||!selection.length)return null;
 if(new Set(selection).size!==selection.length||selection.some(v=>!Number.isInteger(v)||v<0||v>=STROKE_COUNTS[li]))return null;
 const sig=signature(selection);
 return LEVELS[li].targets.find(t=>t.sets.some(s=>signature(s)===sig))||null;
}
const blank=()=>({schema:1,current:0,reached:0,found:LEVELS.map(()=>[]),selected:[]});
const complete=(state,li)=>state.found[li].length===LEVELS[li].targets.length;
function unlocked(state){let n=Number.isInteger(state.reached)?state.reached:0;while(n<LEVELS.length-1&&complete(state,n))n++;return n;}
function sanitize(raw){
 const out=blank();
 if(!raw||raw.schema!==1||!Array.isArray(raw.found))return out;
 out.found=LEVELS.map((lv,i)=>Array.isArray(raw.found[i])?[...new Set(raw.found[i].filter(c=>lv.targets.some(t=>t.char===c)))]:[]);
 out.reached=Number.isInteger(raw.reached)&&raw.reached>=0&&raw.reached<LEVELS.length?raw.reached:0;
 out.reached=unlocked(out);
 out.current=Number.isInteger(raw.current)?Math.max(0,Math.min(unlocked(out),raw.current)):0;
 if(Array.isArray(raw.selected)&&raw.selected.length<=STROKE_COUNTS[out.current]&&raw.selected.every(v=>Number.isInteger(v)&&v>=0&&v<STROKE_COUNTS[out.current])&&new Set(raw.selected).size===raw.selected.length)out.selected=raw.selected.slice();
 return out;
}
function createGame({storage=null,cover=false}={}){
 let state=blank();
 if(!cover&&storage){try{state=sanitize(JSON.parse(storage.getItem(KEY)));}catch(e){}}
 const save=()=>{if(!cover&&storage){try{storage.setItem(KEY,JSON.stringify(state));}catch(e){}}};
 const snapshot=()=>({...state,found:state.found.map(a=>a.slice()),selected:state.selected.slice(),unlocked:unlocked(state),done:complete(state,state.current)});
 const validIndex=i=>Number.isInteger(i)&&i>=0&&i<STROKE_COUNTS[state.current];
 return {
  state:snapshot,
  loadLevel(li){if(!Number.isInteger(li)||li<0||li>unlocked(state))return false;state.current=li;state.selected=[];save();return true;},
  toggle(i){if(!validIndex(i)||complete(state,state.current))return false;const at=state.selected.indexOf(i);if(at<0)state.selected.push(i);else state.selected.splice(at,1);save();return true;},
  setSelection(a){if(!Array.isArray(a)||a.some(i=>!validIndex(i))||new Set(a).size!==a.length||complete(state,state.current))return false;state.selected=a.slice();save();return true;},
  clear(){state.selected=[];save();},
  reset(){state.found[state.current]=[];state.selected=[];save();},
  submit(){
   if(complete(state,state.current))return {status:'complete'};
   if(!state.selected.length)return {status:'empty'};
   const t=match(state.current,state.selected);
   if(!t)return {status:'invalid'};
   state.selected=[];
   if(state.found[state.current].includes(t.char)){save();return {status:'repeat',char:t.char,pinyin:t.pinyin};}
   state.found[state.current].push(t.char);state.reached=unlocked(state);save();return {status:'success',char:t.char,pinyin:t.pinyin,complete:complete(state,state.current)};
  },
  next(){if(!complete(state,state.current)||state.current>=LEVELS.length-1)return false;state.current++;state.selected=[];save();return true;},
  hint(){const lv=LEVELS[state.current];return lv.targets.find(t=>!state.found[state.current].includes(t.char))?.sets[0].slice()||[];},
 };
}
function pointSegmentDistance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
function nearestStroke(medians,x,y,tolerance=52){let index=-1,best=Infinity;medians.forEach((points,i)=>{let d=Infinity;for(let j=1;j<points.length;j++)d=Math.min(d,pointSegmentDistance(x,y,points[j-1],points[j]));if(d<best){best=d;index=i;}});return best<=tolerance?index:-1;}
root.HanziStrokes={KEY,LEVELS,STROKE_COUNTS,combinations,match,sanitize,blank,unlocked,createGame,nearestStroke};
})(typeof window==='undefined'?globalThis:window);
