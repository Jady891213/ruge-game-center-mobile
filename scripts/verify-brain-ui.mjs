/** Real Chrome rendering QA for all 20 Brain School games. Development only. */
import {loadPlaywright} from './brain-browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'docs/Design Game Music Players and Brain UI');
await mkdir(out,{recursive:true});
const {chromium}=loadPlaywright(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),cases=[],errors=[];
async function tap(page,locator){
 const box=await locator.boundingBox();assert.ok(box&&box.width>=20&&box.height>=20,'A visible pointer target');
 const hit=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===e||e.contains(el);});
 assert.ok(hit,'The visible control receives pointer input without scrolling or force');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
}
async function fit(page,id){
 const m=await page.evaluate(()=>{const s=document.getElementById('stage'),r=s.getBoundingClientRect();return {scroll:s.scrollHeight,height:s.clientHeight,wide:s.scrollWidth,width:s.clientWidth,clipped:[...s.querySelectorAll('button')].map(e=>{const b=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent,x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height};}).filter(b=>b.w&&b.h&&(b.x<r.x-1||b.right>r.right+1||b.y<r.y-1||b.bottom>r.bottom+1))};});
 assert.ok(m.scroll<=m.height+2&&m.wide<=m.width+2,id+' answering layout fits');assert.deepEqual(m.clipped,[],id+' all available controls are visible');
}
async function solve(page,id){
 await fit(page,id);const q=await page.evaluate(()=>__brain.question()),answer=await page.evaluate(()=>__brain.definition().solution(__brain.question()));
 if(id==='whack-match'){
  const found=new Set();for(let cycle=0;cycle<28&&found.size<q.targets.length;cycle++){
   const visible=await page.locator('.identify-hole').evaluateAll(bs=>bs.map((b,i)=>({i,id:Number(b.querySelector('.symbol')?.dataset.symbol),caught:b.classList.contains('caught')})));
   for(const item of visible)if(!item.caught&&q.targets.includes(item.id)&&!found.has(item.id)){await tap(page,page.locator('.identify-hole').nth(item.i));found.add(item.id);}
   if(found.size<q.targets.length)await page.clock.runFor(q.period+20);
  }assert.equal(found.size,q.targets.length);
 }else if(id==='species-spotlight'){
  const box=await page.locator('.identify-dark').boundingBox();await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8);await page.mouse.up();
  await tap(page,page.getByRole('button',{name:'看好了',exact:true}));await fit(page,id);await tap(page,page.locator('.choices .tile').nth(q.species.indexOf(answer)));
 }else if(id==='frame-filler')await tap(page,page.locator('.identify-patch').nth(answer));
 else if(id==='fast-focus'){await page.clock.runFor(q.reveal);await tap(page,page.locator('.choices .tile').nth(q.options.indexOf(answer)));}
 else if(id==='add-agency'){for(const i of answer)await tap(page,page.locator('.choices .tile').nth(i));}
 else if(id==='mallet-math'){
  for(let i=0;i<q.values.length;i++)if(!answer.includes(i)){await tap(page,page.getByRole('button',{name:'敲掉数字'+q.values[i]+' 第'+(i+1)+'块',exact:true}));if((await page.evaluate(()=>__brain.state())).correct)break;}
 }else if(id==='tick-tock'){
  let delta=q.delta;for(const amount of [60,5])while(Math.abs(delta)>=amount){const sign=delta>0?1:-1;await tap(page,page.getByRole('button',{name:(sign>0?'+':'−')+(amount===60?'1时':'5分'),exact:true}));delta-=sign*amount;}
  await tap(page,page.getByRole('button',{name:'好了',exact:true}));
 }else if(id==='balloon-burst'){for(const value of answer)await tap(page,page.getByRole('button',{name:'气球'+value,exact:true}));}
 else if(['flash-memory','memo-random','reverse-retention','covered-cages'].includes(id)){
  if(id==='flash-memory')await page.clock.runFor(q.showMs+50);
  if(id==='memo-random')await tap(page,page.locator('.memory-remember'));
  if(id==='reverse-retention')await page.clock.runFor(q.sequence.length*(q.stepMs+q.gapMs)+50);
  if(id==='covered-cages')await page.clock.runFor(q.showMs+q.closeMs+q.swaps.length*q.swapMs+80);
  await fit(page,id);for(const value of answer){const target=id==='flash-memory'?page.getByRole('button',{name:String(value),exact:true}):id==='covered-cages'?page.getByRole('button',{name:'第'+(value+1)+'个鸟笼',exact:true}):page.locator(`#stage .tile:has(.symbol[data-symbol="${value}"])`);await tap(page,target);}
 }else if(id==='cube-count')await tap(page,page.locator('#stage .tile').filter({hasText:new RegExp(`^${answer}$`)}));
 else if(id==='heavyweight')await tap(page,page.locator(`#stage .tile:has(.symbol[data-symbol="${answer}"])`));
 else if(id==='match-blast'){for(const value of answer){await tap(page,page.locator(`[data-piece="${value}"]`));await page.clock.runFor(300);}}
 else if(id==='speed-sorting'){
  for(const value of answer)await tap(page,page.locator(`#stage .tile:has(.symbol[data-symbol="${value}"])`));
  if(q.kind==='category')await tap(page,page.getByRole('button',{name:'选好啦',exact:true}));
 }else if(id==='shape-parts'){for(const value of answer)await tap(page,page.getByRole('button',{name:'积木图形'+(value+1),exact:true}));}
 else if(id==='shadow-shift'){
  for(const value of answer)await tap(page,page.locator(`#stage .tile:has(.symbol[data-symbol="${value}"])`));
  await tap(page,page.getByRole('button',{name:'找齐啦',exact:true}));
 }else if(id==='train-turn'){
  for(let i=0;i<answer.length;i++){
   await tap(page,page.getByRole('button',{name:{'-1':'↶ 左转','0':'↑ 直行','1':'↷ 右转'}[answer[i]],exact:true}));
   const from=i?q.gaps[i]-1:0,to=i+1<q.gaps.length?q.gaps[i+1]-1:q.path.length-1;
   await page.clock.runFor(Math.max(500,(to-from)*260)+40);
  }await page.clock.runFor(600);
 }else if(id==='true-view'){await tap(page,page.getByRole('button',{name:'↻ 转一转',exact:true}));await tap(page,page.getByRole('button',{name:'视图'+(answer+1),exact:true}));}
 const state=await page.evaluate(()=>__brain.state());assert.equal(state.correct,1,id+' scores through real pointer input');assert.equal(state.mistakes,0,id+' no accidental hits');return {correct:state.correct,score:state.score};
}
try{
 for(const [width,height] of [[320,568],[392,872],[568,320]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  try{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.clock.install({time:new Date('2026-10-31T00:00:00Z')});
   await page.goto(pathToFileURL(resolve(root,'app/assets/brain-school/index.html')).href);await page.clock.pauseAt(new Date('2026-10-31T00:00:01Z'));
   await page.evaluate(()=>{window.qaBrainEvents=[];window.addEventListener('ruge:brain-game',e=>qaBrainEvents.push(e.detail));});
   const categories=page.locator('#categories button');for(let i=0;i<6;i++){const box=await categories.nth(i).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height,'All six menu categories are visible');await tap(page,categories.nth(i));assert.equal(await page.locator('.game-card').count(),i?4:20);}await tap(page,categories.first());
   await page.screenshot({path:resolve(out,`brain-hub-${width}x${height}.png`)});
   const ids=await page.evaluate(()=>[...BrainSchool.games.keys()]);
   for(const id of ids)for(const level of [1,10]){
    await page.evaluate(({id,level})=>__brain.start(id,28191+level,level),{id,level});await page.clock.runFor(40);
    const metrics=await page.evaluate(()=>{const stage=document.getElementById('stage');const box=e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,hidden:e.hidden};};return {stage:{height:stage.clientHeight,scrollHeight:stage.scrollHeight,width:stage.clientWidth,scrollWidth:stage.scrollWidth},prompt:box(stage.querySelector('.prompt')),buttons:[...stage.querySelectorAll('button')].filter(e=>getComputedStyle(e).display!=='none').map(box)};});
    if(level===10)await page.screenshot({path:resolve(out,`brain-${id}-${width}x${height}.png`)});
    const solved=process.env.BRAIN_UI_INSPECT?null:await solve(page,id);cases.push({id,level,width,height,metrics,solved});
   }
   await page.evaluate(()=>__brain.hub());
   assert.deepEqual(await page.evaluate(()=>qaBrainEvents.at(-1)),{id:null,category:'hub'});
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[],'No page errors');
 const overflows=cases.filter(c=>c.metrics.stage.scrollHeight>c.metrics.stage.height+2||c.metrics.stage.scrollWidth>c.metrics.stage.width+2);
 console.log(JSON.stringify({cases:cases.length,errors,overflows:overflows.map(c=>({id:c.id,level:c.level,width:c.width,height:c.height,stage:c.metrics.stage}))},null,2));
 await writeFile(resolve(out,'brain-ui-layout.json'),JSON.stringify({cases,errors,overflows},null,2)+'\n');
 if(!process.env.BRAIN_UI_INSPECT)assert.deepEqual(overflows,[],'Every required control fits without scrolling');
}finally{await browser.close();}
