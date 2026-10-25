/** Real pointer QA of the eight identify/compute games and collection lifecycle.
 * Uses a locally installed/cached Playwright as a development tool, never in APK. */
import {loadPlaywright} from './brain-browser-runtime.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=loadPlaywright(),out=resolve(root,'docs/Design Brain School 20');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),results=[],errors=[];
const ids=['whack-match','species-spotlight','frame-filler','fast-focus','add-agency','mallet-math','tick-tock','balloon-burst'];
try{
 for(const size of [{width:392,height:872},{width:320,height:568}]){
  const context=await browser.newContext({viewport:size});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto('file://'+root+'/app/assets/brain-school/index.html');
  assert.equal(await page.locator('.game-card').count(),20);await page.locator('.game-card').first().click();assert.equal((await page.evaluate(()=>__brain.state())).screen,'detail');await page.locator('#start').click();assert.equal((await page.evaluate(()=>__brain.state())).screen,'play');await page.locator('#back').click();assert.equal((await page.evaluate(()=>__brain.state())).paused,true);await page.locator('#pauseMenu').click();assert.equal((await page.evaluate(()=>__brain.state())).screen,'detail');await page.locator('#detailBack').click();assert.equal((await page.evaluate(()=>__brain.state())).screen,'hub');
  for(const level of [1,5,10])for(const id of ids){
   await page.evaluate(({id,level})=>__brain.start(id,28191+level,level),{id,level});await page.clock.runFor(40);
   const q=await page.evaluate(()=>__brain.question()),solution=await page.evaluate(()=>__brain.definition().solution(__brain.question()));
   if(level===1||level===10)await page.screenshot({path:resolve(out,`${id}-${size.width}-L${level}.png`)});
   if(id==='whack-match'){
    const found=new Set();for(let cycle=0;cycle<24&&found.size<q.targets.length;cycle++){
     const visible=await page.locator('.identify-hole').evaluateAll(bs=>bs.map((b,i)=>({index:i,id:Number(b.querySelector('.symbol')?.dataset.symbol),caught:b.classList.contains('caught')})));
     for(const item of visible)if(!item.caught&&q.targets.includes(item.id)&&!found.has(item.id)){await page.locator('.identify-hole').nth(item.index).click();found.add(item.id);}
     if(found.size<q.targets.length)await page.clock.runFor(q.period+20);
    }assert.equal(found.size,q.targets.length);
   }else if(id==='species-spotlight'){
    const box=await page.locator('.identify-dark').boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();for(const [x,y] of [[.8,.2],[.8,.8],[.2,.8],[.5,.5]])await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.up();await page.getByRole('button',{name:'看好了',exact:true}).click();await page.locator('.choices .tile').nth(q.species.indexOf(solution)).click();
   }else if(id==='frame-filler')await page.locator('.identify-patch').nth(solution).click();
   else if(id==='fast-focus'){await page.clock.runFor(q.reveal);await page.locator('.choices .tile').nth(q.options.indexOf(solution)).click();}
   else if(id==='add-agency'){for(const i of solution)await page.locator('.choices .tile').nth(i).click();}
   else if(id==='mallet-math'){
    for(let i=0;i<q.values.length;i++)if(!solution.includes(i)){await page.getByRole('button',{name:'敲掉数字'+q.values[i]+' 第'+(i+1)+'块',exact:true}).click();if((await page.evaluate(()=>__brain.state())).correct)break;}
   }else if(id==='tick-tock'){
    let delta=q.delta;for(const amount of [60,5])while(Math.abs(delta)>=amount){const sign=delta>0?1:-1;await page.getByRole('button',{name:(sign>0?'+':'−')+(amount===60?'1时':'5分'),exact:true}).click();delta-=sign*amount;}await page.getByRole('button',{name:'好了',exact:true}).click();
   }else if(id==='balloon-burst'){for(const value of solution){const balloon=page.getByRole('button',{name:'气球'+value,exact:true});await balloon.evaluate(e=>e.scrollIntoView({block:"center"}));const box=await balloon.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}}
   let state=await page.evaluate(()=>__brain.state());assert.equal(state.correct,1,`${id} L${level} did not score: ${JSON.stringify(state)}`);assert.ok(state.score>0);assert.equal(state.mistakes,0);
   await page.clock.runFor(750);state=await page.evaluate(()=>__brain.state());assert.equal(state.round,2);await page.locator('#pauseButton').click();const paused=await page.evaluate(()=>__brain.state());await page.clock.runFor(5000);assert.equal((await page.evaluate(()=>__brain.state())).remaining,paused.remaining);await page.locator('#resume').click();await page.clock.runFor(400);assert.ok((await page.evaluate(()=>__brain.state())).remaining<paused.remaining);
   results.push({id,level,width:size.width,correct:state.correct,score:state.score,pause:true,nextRound:true});
  }
  // Wrong input really penalizes, and a completed run writes only the new game's key.
  await page.evaluate(()=>{localStorage.setItem('qaExistingProgress','原样');__brain.start('fast-focus',711);});
  const q=await page.evaluate(()=>__brain.question());await page.locator('.choices .tile').nth(q.options.findIndex(x=>x!==q.answer)).click();assert.equal((await page.evaluate(()=>__brain.state())).mistakes,1);await page.clock.runFor(61000);assert.equal((await page.evaluate(()=>__brain.state())).screen,'result');assert.equal(await page.evaluate(()=>localStorage.getItem('qaExistingProgress')),'原样');await page.locator('#again').click();assert.equal((await page.evaluate(()=>__brain.state())).score,0);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,errors},null,2));
}finally{try{writeFileSync(resolve(out,'browser-identify-compute.json'),JSON.stringify({results,errors},null,2));}finally{await browser.close();}}
