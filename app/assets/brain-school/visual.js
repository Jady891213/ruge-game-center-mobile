/* Spatial games: generated geometry, no remote engine or borrowed game art. */
(function(root){
'use strict';
const B=root.BrainSchool;
const colors=['#ff8b95','#65bfd5','#f4c34f','#9c8ee2','#75c49c','#eea168','#a8ca65','#dc91c3'];
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const validSet=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));
function button(text,handler,cls='secondary'){const e=B.el('button',cls,text);e.type='button';e.addEventListener('click',handler);return e;}
function row(parent,cls='row'){const e=B.el('div',cls);parent.appendChild(e);return e;}
function pointKey(p){return p[0]+','+p[1];}
function rotateCells(cells,t){let out=cells.map(p=>p.slice());for(let i=0;i<t;i++)out=out.map(([x,y])=>[-y,x]);const mx=Math.min(...out.map(p=>p[0])),my=Math.min(...out.map(p=>p[1]));return out.map(([x,y])=>[x-mx,y-my]);}
const shapeLibrary=[
 [[0,0],[1,0]],
 [[0,0],[0,1],[1,1]],
 [[0,0],[1,0],[2,0]],
 [[0,0],[1,0],[0,1],[1,1]],
 [[0,0],[1,0],[2,0],[1,1]],
 [[0,0],[1,0],[1,1],[2,1]],
 [[0,0],[0,1],[0,2],[1,2]],
 [[0,0],[1,0],[2,0],[3,0]],
 [[0,0],[0,1],[1,1],[2,1],[2,0]],
];
function shapeAssembly(parts,rng){
 const placed=[],taken=new Set();
 for(const piece of parts){
  if(!placed.length){const cells=piece.cells.map(p=>p.slice());placed.push({id:piece.id,cells:piece.cells,world:cells});cells.forEach(p=>taken.add(pointKey(p)));continue;}
  const occupied=placed.flatMap(p=>p.world),shapeW=Math.max(...piece.cells.map(p=>p[0]))+1,shapeH=Math.max(...piece.cells.map(p=>p[1]))+1;
  const xmin=Math.min(...occupied.map(p=>p[0]))-shapeW,xmax=Math.max(...occupied.map(p=>p[0]))+1,ymin=Math.min(...occupied.map(p=>p[1]))-shapeH,ymax=Math.max(...occupied.map(p=>p[1]))+1;
  const candidates=[];
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
   const cells=piece.cells.map(([px,py])=>[x+px,y+py]);
   if(cells.some(p=>taken.has(pointKey(p))))continue;
   if(placed.length&&!cells.some(([px,py])=>[[px+1,py],[px-1,py],[px,py+1],[px,py-1]].some(p=>taken.has(pointKey(p)))))continue;
   const all=placed.flatMap(p=>p.world).concat(cells),w=Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0]))+1,h=Math.max(...all.map(p=>p[1]))-Math.min(...all.map(p=>p[1]))+1;
   candidates.push({x,y,cells,weight:w*h+Math.abs(w-h)*2});
  }
  candidates.sort((a,b)=>a.weight-b.weight);
  const chosen=B.pick(rng,candidates.slice(0,Math.min(5,candidates.length)));
  if(!chosen)throw Error('Could not assemble connected puzzle');
  placed.push({id:piece.id,cells:piece.cells,world:chosen.cells});chosen.cells.forEach(p=>taken.add(pointKey(p)));
 }
 const minX=Math.min(...placed.flatMap(p=>p.world.map(c=>c[0]))),minY=Math.min(...placed.flatMap(p=>p.world.map(c=>c[1])));
 return placed.map(p=>({...p,world:p.world.map(([x,y])=>[x-minX,y-minY])}));
}
function shapeMarkup(parts,filled=[],preview=false){
 const cells=parts.flatMap(p=>p.world||p.cells),w=Math.max(...cells.map(p=>p[0]))+1,h=Math.max(...cells.map(p=>p[1]))+1;
 const unit=Math.min(42,260/w,220/h),ox=(320-w*unit)/2,oy=(260-h*unit)/2;
 return parts.map((p,i)=>{
  const cells=p.world||p.cells,own=new Set(cells.map(pointKey));
  const fill=preview?colors[i%colors.length]:filled.includes(p.id)?colors[p.id%colors.length]:'#354b58';
  let out=cells.map(([x,y])=>`<rect x="${ox+x*unit}" y="${oy+y*unit}" width="${unit+.4}" height="${unit+.4}" fill="${fill}"/>`).join('');
  // Visible seams define each slot, so another mathematically possible tiling
  // is never presented as an unfair wrong answer in a randomly generated puzzle.
  if(!preview)cells.forEach(([x,y])=>{[[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy],edge)=>{if(own.has(pointKey([x+dx,y+dy])))return;const a=edge===0?[x,y]:edge===1?[x+1,y]:edge===2?[x+1,y+1]:[x,y+1],b=edge===0?[x+1,y]:edge===1?[x+1,y+1]:edge===2?[x,y+1]:[x,y];out+=`<path d="M ${ox+a[0]*unit} ${oy+a[1]*unit} L ${ox+b[0]*unit} ${oy+b[1]*unit}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`;});});
  return out;
 }).join('');
}
function makeShapes(level,rng){
 const count=Math.min(5,2+Math.floor((level-1)/3));
 const ids=B.sample(rng,shapeLibrary.map((_,i)=>i),count);
 const parts=shapeAssembly(ids.map(id=>({id,cells:rotateCells(shapeLibrary[id],B.rand(rng,0,3))})),rng);
 const choices=B.shuffle(rng,ids.concat(B.sample(rng,shapeLibrary.map((_,i)=>i).filter(i=>!ids.includes(i)),Math.min(3,1+Math.floor(level/3))))).map(id=>({id,cells:parts.find(p=>p.id===id)?.cells||rotateCells(shapeLibrary[id],B.rand(rng,0,3))}));
 return {level,parts,choices,target:parts.flatMap(p=>p.world)};
}
B.register({id:'shape-parts',name:'分解拼图',category:'visual',icon:10,
 create:makeShapes,
 check:(q,a)=>validSet(a,q.parts.map(p=>p.id)),solution:q=>q.parts.map(p=>p.id),
 mount(stage,q,api){
  B.prompt(stage,'找出拼图里的小积木');
  const scene=B.el('div','scene visual-shape-scene'),drawing=B.svg(shapeMarkup(q.parts));scene.appendChild(drawing);stage.appendChild(scene);
  const found=[];const grid=B.el('div','choices visual-pieces');grid.style.gridTemplateColumns=`repeat(${q.choices.length>6?4:3},minmax(0,1fr))`;stage.appendChild(grid);
  q.choices.forEach(choice=>{
   const tile=button('',()=>{
    if(!api.active()||found.includes(choice.id))return;
    if(!q.parts.some(p=>p.id===choice.id)){api.mistake();return;}
    found.push(choice.id);tile.classList.add('selected');tile.disabled=true;drawing.innerHTML=shapeMarkup(q.parts,found);scene.classList.remove('visual-snap');void scene.offsetWidth;scene.classList.add('visual-snap');api.fx('collect');
    if(found.length===q.parts.length)api.answer(found.slice());
   },'tile visual-piece');
   tile.setAttribute('aria-label','积木图形'+(choice.id+1));const w=Math.max(...choice.cells.map(p=>p[0]))+1,h=Math.max(...choice.cells.map(p=>p[1]))+1;tile.appendChild(B.svg(shapeMarkup([{id:choice.id,cells:choice.cells}],[],true),`${(320-w*42)/2-8} ${(260-h*42)/2-8} ${w*42+16} ${h*42+16}`));grid.appendChild(tile);
  });return {};
 }
});

function makeShadows(level,rng){
 const count=Math.min(4,1+Math.floor((level-1)/3));
 const targets=B.sample(rng,Array.from({length:12},(_,i)=>i),count);
 const candidates=B.shuffle(rng,targets.concat(B.sample(rng,Array.from({length:12},(_,i)=>i).filter(id=>!targets.includes(id)),Math.min(4,2+Math.floor(level/4)))));
 return {level,targets,candidates,motion:targets.map((id,i)=>({id,angle:B.rand(rng,-160,160),speed:(B.rand(rng,15,28)/1000)*(i%2?-1:1),phase:rng()*Math.PI*2}))};
}
B.register({id:'shadow-shift',name:'旋转剪影',category:'visual',icon:0,
 create:makeShadows,check:(q,a)=>validSet(a,q.targets),solution:q=>q.targets.slice(),
 mount(stage,q,api){
  B.prompt(stage,'影子里藏着谁？');
  const scene=B.el('div','scene visual-shadow-scene');stage.appendChild(scene);
  const shadows=q.motion.map((m,i)=>{const e=B.symbol(m.id,q.targets.length>2?110:136);e.classList.add('visual-shadow');e.style.left=(50+(i-(q.targets.length-1)/2)*17)+'%';e.style.top=(49+(i%2?10:-9))+'%';scene.appendChild(e);return e;});
  const selected=[];
  B.choices(stage,q.candidates.map(id=>({value:id,symbol:id})),(id,tile)=>{if(!api.active())return;const old=selected.indexOf(id);if(old>=0){selected.splice(old,1);tile.classList.remove('selected');}else{selected.push(id);tile.classList.add('selected');}api.fx('select');},q.candidates.length>6?4:3);
  const submit=button('找齐啦',()=>{if(api.active())api.answer(selected.slice());},'primary visual-submit');stage.appendChild(submit);
  return {update(ms){shadows.forEach((e,i)=>{const m=q.motion[i],wave=Math.sin(ms/1300+m.phase);e.style.transform=`translate(-50%,-50%) rotate(${m.angle+ms*m.speed}deg) translate(${wave*12}px,${Math.cos(ms/1700+m.phase)*8}px)`;});}};
 }
});

const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
function heading(a,b){return dirs.findIndex(([dx,dy])=>b[0]-a[0]===dx&&b[1]-a[1]===dy);}
function turnAt(path,i){const difference=(heading(path[i],path[i+1])-heading(path[i-1],path[i])+4)%4;return difference===3?-1:difference;}
function makePath(level,rng){
 const size=level<5?4:5,desired=Math.min(size*size-1,5+level),corners=[[0,0],[size-1,0],[size-1,size-1],[0,size-1]];
 let path=[];
 for(let attempt=0;attempt<100;attempt++){
  const start=B.pick(rng,corners),walk=[start],seen=new Set([pointKey(start)]);
  while(walk.length<desired){const last=walk[walk.length-1];const options=B.shuffle(rng,dirs).map(([dx,dy])=>[last[0]+dx,last[1]+dy]).filter(([x,y])=>x>=0&&y>=0&&x<size&&y<size&&!seen.has(pointKey([x,y])));if(!options.length)break;const next=options[0];walk.push(next);seen.add(pointKey(next));}
  if(walk.length>path.length)path=walk;
  if(walk.length>=desired)break;
 }
 const indices=Array.from({length:path.length-2},(_,i)=>i+1);
 const gaps=[1].concat(B.sample(rng,indices.filter(i=>i!==1),Math.min(indices.length-1,Math.floor((level-1)/2)))).sort((a,b)=>a-b);
 return {level,size,path,gaps};
}
function railMarkup(q,revealed){
 const size=q.size,s=280/size,x0=(360-280)/2,y0=(320-280)/2;
 const center=p=>[x0+(p[0]+.5)*s,y0+(p[1]+.5)*s];
 let str=`<rect x="${x0-8}" y="${y0-8}" width="296" height="296" rx="20" fill="#e6f2d7"/>`;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)str+=`<rect x="${x0+x*s+2}" y="${y0+y*s+2}" width="${s-4}" height="${s-4}" rx="10" fill="${(x+y)%2?'#f6f5d9':'#eff6e5'}"/>`;
 q.path.forEach((p,i)=>{
  const [cx,cy]=center(p);
  if(q.gaps.includes(i)&&!revealed.includes(i)){
   str+=`<circle cx="${cx}" cy="${cy}" r="${s*.32}" fill="#fff3c5" stroke="#e5ad37" stroke-width="3" stroke-dasharray="5 4"/><text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="32" font-weight="900" fill="#a77828">?</text>`;return;
  }
  const start=i?center(q.path[i-1]):[cx,cy],end=i<q.path.length-1?center(q.path[i+1]):[cx,cy];
  const d=`M ${(start[0]+cx)/2} ${(start[1]+cy)/2} L ${cx} ${cy} L ${(end[0]+cx)/2} ${(end[1]+cy)/2}`;
  str+=`<path d="${d}" fill="none" stroke="#b9a07a" stroke-width="${s*.32}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#526c75" stroke-width="${s*.19}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#eaf4f5" stroke-width="${s*.055}" stroke-linejoin="round" stroke-dasharray="3 6"/>`;
 });
 const start=center(q.path[0]),end=center(q.path[q.path.length-1]);
 str+=`<circle cx="${start[0]}" cy="${start[1]}" r="7" fill="#71b891"/><rect x="${end[0]-s*.3}" y="${end[1]-s*.34}" width="${s*.6}" height="${s*.62}" rx="8" fill="#ffcf78" stroke="#bd8e53" stroke-width="2"/><path d="M ${end[0]-s*.36} ${end[1]-s*.29} L ${end[0]} ${end[1]-s*.52} L ${end[0]+s*.36} ${end[1]-s*.29}" fill="#ee8c85"/><rect x="${end[0]-8}" y="${end[1]}" width="16" height="22" rx="4" fill="#bd8e53"/>`;
 return str;
}
B.register({id:'train-turn',name:'连接轨道',category:'visual',icon:8,
 create:makePath,check:(q,a)=>Array.isArray(a)&&a.length===q.gaps.length&&a.every((v,i)=>integer(v,-1,1)&&v===turnAt(q.path,q.gaps[i])),solution:q=>q.gaps.map(i=>turnAt(q.path,i)),
 mount(stage,q,api){
  const title=B.prompt(stage,'下一段怎么走？');
  const scene=B.el('div','scene visual-train-scene'),svg=B.svg(railMarkup(q,[]),'0 0 360 320');scene.appendChild(svg);stage.appendChild(scene);
  const train=B.el('div','visual-train');train.appendChild(B.symbol(8,39));const arrow=B.el('span','visual-train-arrow','➜');train.appendChild(arrow);scene.appendChild(train);
  const actions=[],revealed=[];let gapIndex=0,trainIndex=0,moving=null,finishedAt=null,submitted=false;
  const labels=[{value:-1,label:'↶ 左转'},{value:0,label:'↑ 直行'},{value:1,label:'↷ 右转'}];
  const buttons=B.choices(stage,labels,(value)=>{
   if(!api.active()||moving||finishedAt!==null)return;
   if(value!==turnAt(q.path,q.gaps[gapIndex])){api.mistake();return;}
   actions.push(value);revealed.push(q.gaps[gapIndex]);svg.innerHTML=railMarkup(q,revealed);api.fx('drop');
   const to=gapIndex+1<q.gaps.length?q.gaps[gapIndex+1]-1:q.path.length-1;
   moving={from:trainIndex,to,start:api.now(),duration:Math.max(500,(to-trainIndex)*260)};buttons.forEach(b=>b.disabled=true);
  },3);
  function position(index){
   const segment=Math.min(q.path.length-2,Math.floor(index)),fraction=Math.min(1,index-segment),a=q.path[segment],b=q.path[segment+1],x=a[0]+(b[0]-a[0])*fraction,y=a[1]+(b[1]-a[1])*fraction;
   train.style.left=((40+(x+.5)*280/q.size)/360*100)+'%';train.style.top=((20+(y+.5)*280/q.size)/320*100)+'%';
   arrow.style.transform=`rotate(${heading(a,b)*90-90}deg)`;
  }
  position(0);
  return {update(ms){
   if(moving){const t=Math.min(1,Math.max(0,(ms-moving.start)/moving.duration));position(moving.from+(moving.to-moving.from)*t);if(t===1){trainIndex=moving.to;moving=null;gapIndex++;if(gapIndex===q.gaps.length){finishedAt=ms;title.textContent='到站啦！';api.fx('collect');}else buttons.forEach(b=>b.disabled=false);}}
   if(finishedAt!==null&&!submitted&&ms-finishedAt>=550){submitted=true;api.answer(actions.slice());}
  }};
 }
});

/* Real 3D coordinates. Orthographic camera yaw changes horizontal/depth axes. */
function project(point,yaw,scale=47){const [x,y,z]=point,c=Math.cos(yaw),s=Math.sin(yaw);return [160+(x*c-z*s)*scale,165+(x*s+z*c)*scale*.36-y*scale*.84];}
function pointString(points,yaw,scale){return points.map(p=>project(p,yaw,scale).map(n=>n.toFixed(2)).join(',')).join(' ');}
function shade(hex,factor){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v*factor))).toString(16).padStart(2,'0')).join('');}
function sceneMarkup(scene,yaw,arrowView){
 let str=`<polygon points="${pointString([[-1.9,0,-1.9],[1.9,0,-1.9],[1.9,0,1.9],[-1.9,0,1.9]],yaw,43)}" fill="#e2efee" stroke="#b5d3cf" stroke-width="3"/>`;
 const sorted=scene.slice().sort((a,b)=>(a.x*Math.sin(yaw)+a.z*Math.cos(yaw))-(b.x*Math.sin(yaw)+b.z*Math.cos(yaw)));
 sorted.forEach(obj=>{
  const {x,z,h,color}=obj,r=.38,c=colors[color%colors.length];
  const sx=Math.sin(yaw)>=0?1:-1,sz=Math.cos(yaw)>=0?1:-1;
  const xface=[[x+sx*r,0,z-r],[x+sx*r,0,z+r],[x+sx*r,h,z+r],[x+sx*r,h,z-r]];
  const zface=[[x-r,0,z+sz*r],[x+r,0,z+sz*r],[x+r,h,z+sz*r],[x-r,h,z+sz*r]];
  const top=[[x-r,h,z-r],[x+r,h,z-r],[x+r,h,z+r],[x-r,h,z+r]];
  if(Math.abs(Math.sin(yaw))>.01)str+=`<polygon points="${pointString(xface,yaw,43)}" fill="${shade(c,.86)}" stroke="#496877" stroke-width="1.4" stroke-linejoin="round"/>`;
  if(Math.abs(Math.cos(yaw))>.01)str+=`<polygon points="${pointString(zface,yaw,43)}" fill="${c}" stroke="#496877" stroke-width="1.4" stroke-linejoin="round"/>`;
  str+=`<polygon points="${pointString(top,yaw,43)}" fill="${shade(c,1.12)}" stroke="#496877" stroke-width="1.4" stroke-linejoin="round"/>`;
  if(h>1){const a=project([x-r,1,z+sz*r],yaw,43),b=project([x+r,1,z+sz*r],yaw,43);str+=`<path d="M ${a.join(' ')} L ${b.join(' ')}" stroke="#496877" stroke-width="1" opacity=".5"/>`;}
 });
 if(arrowView!==undefined){
  const a=arrowView*Math.PI/2,side=[Math.sin(a),Math.cos(a)],base=[side[0]*2.5,.02,side[1]*2.5],tip=[side[0]*1.7,.02,side[1]*1.7];
  const p=project(base,yaw,43),t=project(tip,yaw,43),dx=t[0]-p[0],dy=t[1]-p[1],length=Math.hypot(dx,dy),nx=-dy/length*13,ny=dx/length*13;
  str+=`<path d="M ${p.join(' ')} L ${t.join(' ')}" stroke="#ff866e" stroke-width="8" stroke-linecap="round"/><circle cx="${p[0]}" cy="${p[1]}" r="9" fill="#fff" stroke="#ff866e" stroke-width="3"/><circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#bd7152"/><polygon points="${t[0]},${t[1]} ${t[0]-dx*.55+nx},${t[1]-dy*.55+ny} ${t[0]-dx*.55-nx},${t[1]-dy*.55-ny}" fill="#ff866e"/>`;
 }
 return str;
}
function projectionSignature(scene,view){return scene.slice().sort((a,b)=>a.color-b.color).map(o=>{const [x,y]=project([o.x,o.h,o.z],view*Math.PI/2,1);return [o.color,Number(x.toFixed(3)),Number(y.toFixed(3))].join(':');}).join('|');}
function makeView(level,rng){
 const count=Math.min(6,2+Math.floor((level-1)/2));
 const positions=B.sample(rng,[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]],count),palette=B.sample(rng,[0,1,2,3,4,5,6,7],count);
 const scene=positions.map(([x,z],i)=>({x,z,h:level>=6?B.rand(rng,1,2):1,color:palette[i]}));
 const view=B.rand(rng,0,3),n=level<4?2:level<8?3:4;
 const options=B.shuffle(rng,[view].concat(B.sample(rng,[0,1,2,3].filter(v=>v!==view),n-1)));
 return {level,scene,view,options};
}
B.register({id:'true-view',name:'选择视角',category:'visual',icon:11,
 create:makeView,check:(q,a)=>integer(a,0,q.options.length-1)&&q.options[a]===q.view,solution:q=>q.options.indexOf(q.view),
 mount(stage,q,api){
  B.prompt(stage,'从箭头那边看');
  let yaw=Math.PI/4;const scene=B.el('div','scene visual-view-scene'),drawing=B.svg(sceneMarkup(q.scene,yaw,q.view),'0 0 320 240');scene.appendChild(drawing);stage.appendChild(scene);
  const orbit=button('↻ 转一转',()=>{if(!api.active())return;yaw+=Math.PI/2;drawing.innerHTML=sceneMarkup(q.scene,yaw,q.view);api.fx('tap');},'secondary visual-orbit');scene.appendChild(orbit);
  const choices=B.el('div','choices visual-view-choices');choices.style.gridTemplateColumns=`repeat(${q.options.length===4?2:q.options.length},minmax(0,1fr))`;stage.appendChild(choices);
  q.options.forEach((view,i)=>{const tile=button('',()=>{if(api.active())api.answer(i);},'tile visual-view-choice');tile.setAttribute('aria-label','视图'+(i+1));tile.appendChild(B.svg(sceneMarkup(q.scene,view*Math.PI/2),'60 55 200 170'));choices.appendChild(tile);});
  return {};
 }
});
B.visualGeometry=Object.freeze({rotateCells,shapeLibrary,shapeAssembly,turnAt,heading,project,sceneMarkup,projectionSignature});
})(typeof window!=='undefined'?window:globalThis);
