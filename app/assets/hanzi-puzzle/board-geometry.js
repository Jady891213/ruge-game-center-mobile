/* Presentation geometry only: rules, global stroke indices and saves stay in core.js. */
(function(root){
'use strict';
function forLevel(li,H,DATA,COMPOSITES){
 const lv=H.LEVELS[li];
 if(!lv)throw new RangeError('Unknown Hanzi level');
 const parts=lv.parts.map(p=>({...p}));
 if(parts.length===1){
  const glyph=DATA[parts[0].char];
  return {char:parts[0].char,strokes:glyph.strokes,medians:glyph.medians,parts,compound:false};
 }
 const all=Array.from({length:H.STROKE_COUNTS[li]},(_,i)=>i);
 const char=H.match(li,all)?.char,entry=COMPOSITES[char];
 if(!entry||entry.source!==lv.source)throw new Error('Missing compound geometry: '+lv.source);
 const glyph=entry.reuse==='HanziStrokeData'?DATA[char]:entry;
 const map=entry.strokeMap;
 if(!glyph||map.length!==all.length||glyph.strokes.length!==all.length||glyph.medians.length!==all.length||new Set(map).size!==all.length||map.some(i=>!Number.isInteger(i)||i<0||i>=all.length))throw new Error('Invalid compound stroke map: '+char);
 return {char,strokes:map.map(i=>glyph.strokes[i]),medians:map.map(i=>glyph.medians[i]),parts,compound:true};
}
function segmentDistance(x,y,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
}
function pick(medians,x,y,tolerance=52){
 let index=-1,best=Infinity;
 medians.forEach((points,i)=>{
  let distance=points.length===1?Math.hypot(x-points[0][0],y-points[0][1]):Infinity;
  for(let j=1;j<points.length;j++)distance=Math.min(distance,segmentDistance(x,y,points[j-1],points[j]));
  if(distance<best){best=distance;index=i;}
 });
 return best<=tolerance?index:-1;
}
root.HanziBoard={forLevel,pick};
})(typeof window==='undefined'?globalThis:window);
