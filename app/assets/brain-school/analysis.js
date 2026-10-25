/* Original, seeded reasoning games. No Nintendo assets or code. */
(function(root){
'use strict';
const B=root.BrainSchool;
const colors=['#68c4bc','#ffc866','#f29bb6','#86b7e5','#ac9cdb','#f7a56b'];
const clampLevel=n=>Math.max(1,Math.min(10,Math.floor(Number(n)||1)));
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const button=(text,action,cls='secondary')=>{const el=B.el('button',cls,text);el.type='button';el.onclick=action;return el;};

function cubeSvg(cubes){
 const raw=(x,y,z)=>[(x-y)*27,(x+y)*14-z*30];
 const projected=cubes.flatMap(c=>[[c.x,c.y,c.z],[c.x+1,c.y+1,c.z+1]].map(v=>raw(...v)));
 const minX=Math.min(...projected.map(p=>p[0]))-42,maxX=Math.max(...projected.map(p=>p[0]))+42;
 const minY=Math.min(...projected.map(p=>p[1]))-38,maxY=Math.max(...projected.map(p=>p[1]))+38;
 const poly=(pts,fill)=>`<polygon points="${pts.map(p=>raw(...p).join(',')).join(' ')}" fill="${fill}" stroke="#446878" stroke-width="1.5" stroke-linejoin="round"/>`;
 const pieces=cubes.slice().sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.z-b.z).map(c=>{
  const{x,y,z}=c;
  return `<g>${poly([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],'#57b4b5')}${poly([[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1],[x+1,y,z+1]],'#40949f')}${poly([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],'#b1e9d7')}</g>`;
 }).join('');
 return B.svg(pieces,`${minX} ${minY} ${maxX-minX} ${maxY-minY}`);
}
B.register({
 id:'cube-count',name:'积木数一数',category:'analysis',icon:11,
 create(level,rng){
  level=clampLevel(level);
  const width=level<4?2:level<8?3:4,depth=level<6?2:3;
  const maxHeight=1+Math.floor((level-1)/4),cubes=[],heights=Array.from({length:depth},()=>Array(width).fill(0));
  // Back columns are never lower than their front neighbours: every column top
  // remains visible in this camera, so an unseen optional column cannot change the answer.
  for(let y=depth-1;y>=0;y--)for(let x=width-1;x>=0;x--){
   const minimum=Math.max(heights[y+1]?.[x]||0,heights[y][x+1]||0);
   const h=heights[y][x]=B.rand(rng,minimum,maxHeight);
   for(let z=0;z<h;z++)cubes.push({x,y,z});
  }
  if(cubes.length<2){cubes.push({x:0,y:0,z:0});if(!cubes.some(c=>c.x===1&&c.y===0&&c.z===0))cubes.push({x:1,y:0,z:0});}
  // A single column always consists of a complete, supported stack.
  const unique=[...new Map(cubes.map(c=>[`${c.x},${c.y},${c.z}`,c])).values()];
  const total=unique.length,options=new Set([total]);
  while(options.size<Math.min(6,total+3))options.add(B.rand(rng,Math.max(1,total-3),total+4));
  return{level,cubes:unique,width,depth,options:B.shuffle(rng,[...options])};
 },
 check(q,a){return Number.isInteger(a)&&a===q.cubes.length;},
 solution(q){return q.cubes.length;},
 mount(stage,q,api){
  B.prompt(stage,'一共有几块？');
  const scene=B.el('div','scene analysis-cube-scene');scene.appendChild(cubeSvg(q.cubes));stage.appendChild(scene);
  B.choices(stage,q.options.map(n=>({value:n,label:String(n)})),n=>{if(api.active())api.answer(n);},3);
  return{};
 }
});

function comparison(left,right,weights){return{left,right,relation:Math.sign(weights[left]-weights[right])};}
function scaleScene(c,small=false){
 const relation=c.relation,yl=39+relation*10,yr=39-relation*10;
 const box=B.el('div','analysis-scale'+(small?' analysis-small-scale':''));
 const beam=B.svg(`<path d="M30 ${yl}L160 39L290 ${yr}" fill="none" stroke="#5d7283" stroke-width="7" stroke-linecap="round"/><path d="M30 ${yl}V${yl+28}M290 ${yr}V${yr+28}" fill="none" stroke="#8caaa9" stroke-width="3"/><path d="M160 39V90M133 92H187" fill="none" stroke="#5d7283" stroke-width="8" stroke-linecap="round"/><circle cx="160" cy="39" r="9" fill="#ffd674"/>`,'0 0 320 100');beam.setAttribute('preserveAspectRatio','none');box.appendChild(beam);
 for(const [id,cls,y]of[[c.left,'left',yl],[c.right,'right',yr]]){
  const pan=B.el('div','analysis-pan '+cls);pan.style.top=`${(y-36)}%`;pan.appendChild(B.symbol(id,small?39:48));
  const plate=B.el('i','analysis-plate');pan.appendChild(plate);box.appendChild(pan);
 }
 return box;
}
B.register({
 id:'heavyweight',name:'谁最重',category:'analysis',icon:6,
 create(level,rng){
  level=clampLevel(level);
  const n=level<4?3:level<8?4:5,items=B.sample(rng,[0,1,2,3,4,5,6,7,8,9,10],n),rank=B.shuffle(rng,items),weights={};
  let weight=B.rand(rng,1,3);
  rank.forEach((id,i)=>{weight+=i===1&&level>=4&&rng()<.55?0:B.rand(rng,1,3);weights[id]=weight;});
  const comparisons=[];
  for(let i=1;i<n;i++){
   const pair=rng()<.5?[rank[i-1],rank[i]]:[rank[i],rank[i-1]];
   comparisons.push(comparison(pair[0],pair[1],weights));
  }
  return{level,items:B.shuffle(rng,items),weights,comparisons:B.shuffle(rng,comparisons)};
 },
 check(q,a){return Number.isInteger(a)&&q.items.includes(a)&&q.items.every(id=>id===a||q.weights[a]>q.weights[id]);},
 solution(q){return q.items.reduce((best,id)=>q.weights[id]>q.weights[best]?id:best,q.items[0]);},
 mount(stage,q,api){
  B.prompt(stage,'哪个最重？');
  const scene=B.el('div','scene analysis-scales'+(q.comparisons.length>2?' analysis-many-scales':''));q.comparisons.forEach(c=>scene.appendChild(scaleScene(c,q.comparisons.length>2)));stage.appendChild(scene);
  B.choices(stage,q.items.map(id=>({value:id,symbol:id})),id=>{if(api.active())api.answer(id);},3);
  return{};
 }
});

function clonePieces(pieces){return pieces.map(p=>({...p}));}
function settle(pieces){
 const result=clonePieces(pieces);
 let changed=true;
 while(changed){
  changed=false;
  for(const p of result.slice().sort((a,b)=>a.y-b.y||a.id-b.id)){
   while(p.y>0&&!result.some(o=>o.id!==p.id&&o.y===p.y-1&&o.x<p.x+p.width&&o.x+o.width>p.x)){
    p.y--;changed=true;
   }
  }
 }
 return result;
}
function occupancy(pieces){
 return pieces.flatMap(p=>Array.from({length:p.width},(_,i)=>`${p.x+i},${p.y}`)).sort();
}
function removeSequence(pieces,sequence){
 let current=clonePieces(pieces);
 for(const id of sequence){if(!current.some(p=>p.id===id))return null;current=settle(current.filter(p=>p.id!==id));}
 return current;
}
function makeBlast(level,rng){
 const width=level<5?3:level<9?4:5,n=3+Math.min(7,level),pieces=[];
 for(let id=0;id<n;id++){
  let pieceWidth=level>=3&&rng()<.45?2:1;
  const columnHeight=x=>pieces.filter(p=>p.x<=x&&p.x+p.width>x).reduce((h,p)=>Math.max(h,p.y+1),0);
  const landingHeight=x=>pieces.filter(p=>p.x<x+pieceWidth&&p.x+p.width>x).reduce((h,p)=>Math.max(h,p.y+1),0);
  let positions=Array.from({length:width-pieceWidth+1},(_,x)=>x).filter(x=>landingHeight(x)<5&&(pieceWidth===1||columnHeight(x)===columnHeight(x+1)));
  if(!positions.length){pieceWidth=1;positions=Array.from({length:width},(_,x)=>x).filter(x=>landingHeight(x)<5);}
  const x=B.pick(rng,positions);
  const y=pieces.length?Math.max(...pieces.map(p=>p.y))+2:0;
  pieces.push({id,x,y,width:pieceWidth,color:id%colors.length});
  const stable=settle(pieces);pieces.splice(0,pieces.length,...stable);
 }
 const count=Math.min(n-2,1+Math.floor((level-1)/3));
 const plan=B.sample(rng,pieces.map(p=>p.id),count),targetPieces=removeSequence(pieces,plan);
 return{level,width,height:Math.max(...pieces.map(p=>p.y))+1,pieces,target:occupancy(targetPieces),plan};
}
function renderTarget(q){
 const size=20,width=q.width*size,height=Math.max(2,q.height)*size;
 const cells=q.target.map(s=>{const[x,y]=s.split(',').map(Number);return`<rect x="${x*size+1}" y="${height-(y+1)*size+1}" width="${size-2}" height="${size-2}" rx="3" fill="#8094a3"/>`;}).join('');
 return B.svg(cells,`0 0 ${width} ${height}`);
}
function blastMatches(q,answer){
 if(!Array.isArray(answer)||!answer.length||answer.length>=q.pieces.length||new Set(answer).size!==answer.length||answer.some(id=>!Number.isInteger(id)))return false;
 const remaining=removeSequence(q.pieces,answer);return !!remaining&&same(occupancy(remaining),q.target);
}
B.register({
 id:'match-blast',name:'积木小雕塑',category:'analysis',icon:11,
 create(level,rng){return makeBlast(clampLevel(level),rng);},
 check:blastMatches,
 solution(q){return q.plan.slice();},
 mount(stage,q,api){
  B.prompt(stage,'敲一敲，变成这样');
  const target=B.el('div','analysis-target');target.appendChild(renderTarget(q));stage.appendChild(target);
  const board=B.el('div','analysis-blast-board');board.style.aspectRatio=`${q.width}/${Math.max(3,q.height)}`;board.style.setProperty('--columns',q.width);board.style.setProperty('--rows',Math.max(3,q.height));stage.appendChild(board);
  let pieces=clonePieces(q.pieces),removed=[],lockedUntil=0;
  const nodes=new Map(),history=[];
  const controls=B.el('div','row analysis-tools');stage.appendChild(controls);
  const undo=button('↶ 撤回',()=>{if(!api.active()||!history.length||api.now()<lockedUntil)return;const state=history.pop();pieces=state.pieces;removed=state.removed;draw();api.fx('undo');});
  const reset=button('重来',()=>{if(!api.active())return;pieces=clonePieces(q.pieces);removed=[];history.length=0;lockedUntil=0;draw();api.fx('undo');});
  const done=button('完成',()=>{if(api.active()&&api.now()>=lockedUntil)api.answer(removed.slice());},'primary');controls.appendChild(undo);controls.appendChild(reset);controls.appendChild(done);
  function draw(){
   for(const[id,node]of nodes)if(!pieces.some(p=>p.id===id)){node.remove();nodes.delete(id);}
   for(const p of pieces){
    let node=nodes.get(p.id);
    if(!node){node=button('',()=>hit(p.id),'analysis-piece');node.dataset.piece=String(p.id);node.setAttribute('aria-label','敲掉积木');node.style.background=colors[p.color];board.appendChild(node);nodes.set(p.id,node);}
    node.style.left=`${100*p.x/q.width}%`;node.style.top=`${100*(Math.max(3,q.height)-1-p.y)/Math.max(3,q.height)}%`;node.style.width=`${100*p.width/q.width}%`;node.style.height=`${100/Math.max(3,q.height)}%`;
   }
   undo.disabled=!history.length;
  }
  function hit(id){
   if(!api.active()||api.now()<lockedUntil)return;
   history.push({pieces:clonePieces(pieces),removed:removed.slice()});removed.push(id);pieces=removeSequence(pieces,[id]);lockedUntil=api.now()+270;draw();api.fx('drop');
  }
  let completed=false;
  draw();
  return{update(elapsed){if(!completed&&elapsed>=lockedUntil&&removed.length&&blastMatches(q,removed)){completed=true;api.answer(removed.slice());}},destroy(){nodes.clear();}};
 },
 // Tests and deterministic browser QA use the same production physics helpers.
 physics:{settle,occupancy,removeSequence}
});

const objects=[
 {id:0,name:'猫',group:'animal'}, {id:1,name:'狗',group:'animal'},
 {id:2,name:'小鸟',group:'animal',flies:true}, {id:3,name:'鱼',group:'animal'},
 {id:4,name:'兔子',group:'animal'}, {id:5,name:'青蛙',group:'animal'},
 {id:6,name:'苹果',group:'fruit'}, {id:7,name:'香蕉',group:'fruit'},
 {id:8,name:'汽车',group:'vehicle'}, {id:9,name:'帆船',group:'vehicle'},
 {id:10,name:'花',group:'plant'}
];
const criteria=[{key:'animal',label:'找出动物',symbol:0},{key:'fruit',label:'找出水果',symbol:6},{key:'vehicle',label:'找出交通工具',symbol:8},{key:'flies',label:'找出会飞的',symbol:2}];
const criterionMatches=(o,key)=>key==='flies'?!!o.flies:o.group===key;
B.register({
 id:'speed-sorting',name:'图片小侦探',category:'analysis',icon:8,
 create(level,rng){
  level=clampLevel(level);
  if(level>=5&&rng()<.45){
   // These chains use clearly separated real-world size bands; avoid cat-vs-dog ambiguities.
   const chain=B.pick(rng,[[5,4,8],[6,0,8],[7,1,8],[2,0,8]]),descending=chain.slice().reverse(),rank=B.rand(rng,1,3);
   return{level,kind:'rank',items:B.shuffle(rng,chain),rank,order:descending,label:`现实里，第${['','一','二','三','四'][rank]}大？`};
  }
  const criterion=B.pick(rng,criteria),positive=objects.filter(o=>criterionMatches(o,criterion.key)),negative=objects.filter(o=>!criterionMatches(o,criterion.key));
  const positives=B.sample(rng,positive,Math.min(positive.length,level<3?1:level<7?2:3));
  const negatives=B.sample(rng,negative,Math.min(negative.length,level<3?2:3));
  return{level,kind:'category',criterion:criterion.key,label:criterion.label,items:B.shuffle(rng,[...positives,...negatives].map(o=>o.id))};
 },
 check(q,answer){
  if(!Array.isArray(answer)||new Set(answer).size!==answer.length||answer.some(id=>!q.items.includes(id)))return false;
  if(q.kind==='rank')return answer.length===1&&answer[0]===q.order[q.rank-1];
  return B.sameSet(answer,q.items.filter(id=>criterionMatches(objects.find(o=>o.id===id),q.criterion)));
 },
 solution(q){return q.kind==='rank'?[q.order[q.rank-1]]:q.items.filter(id=>criterionMatches(objects.find(o=>o.id===id),q.criterion));},
 mount(stage,q,api){
  B.prompt(stage,q.label);
  const selected=new Set();
  B.choices(stage,q.items.map(id=>({value:id,symbol:id,label:objects.find(o=>o.id===id).name})),(id,node)=>{
   if(!api.active())return;
   if(q.kind==='rank'){api.answer([id]);return;}
   if(selected.has(id))selected.delete(id);else selected.add(id);
   node.classList.toggle('selected',selected.has(id));node.setAttribute('aria-pressed',String(selected.has(id)));api.fx('select');
  },q.items.length>=5?3:q.items.length<=3?3:2);
  if(q.kind==='category')stage.appendChild(button('选好啦',()=>{if(api.active())api.answer([...selected]);},'primary analysis-submit'));
  return{};
 }
});
})(window);
