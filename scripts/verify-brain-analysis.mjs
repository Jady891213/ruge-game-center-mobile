#!/usr/bin/env node
/** Browser QA for the actual packaged analysis games. No scoring API shortcuts. */
import assert from 'node:assert/strict';
import {loadPlaywright} from './brain-browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const playwright=loadPlaywright();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs/Design Brain School 20');
await mkdir(out,{recursive:true});
const records=[],errors=[];
const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
try{
 for(const viewport of[{width:320,height:568},{width:392,height:872}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  try{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
   await page.clock.install({time:new Date('2026-10-26T04:00:00Z')});
   await page.goto(pathToFileURL(path.join(root,'app/assets/brain-school/index.html')).href,{waitUntil:'load'});
   await page.clock.pauseAt(new Date('2026-10-26T04:00:01Z'));
   for(const id of['cube-count','heavyweight','match-blast','speed-sorting'])for(const level of[1,5,10]){
    const seed=7919*level+id.length*317;
    await page.evaluate(({id,seed,level})=>window.__brain.start(id,seed,level),{id,seed,level});
    await page.clock.runFor(48);
    const sample=await page.evaluate(()=>{const q=window.__brain.question(),g=window.__brain.definition(),stage=document.getElementById('stage');return{q,solution:g.solution(q),state:window.__brain.state(),staleReaction:document.getElementById('reaction').classList.contains('show'),stage:{clientWidth:stage.clientWidth,scrollWidth:stage.scrollWidth,clientHeight:stage.clientHeight,scrollHeight:stage.scrollHeight},tiles:[...stage.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return{text:e.textContent,aria:e.getAttribute('aria-label'),w:r.width,h:r.height,x:r.x,y:r.y};})};});
    assert.equal(sample.state.level,level);assert.equal(sample.stage.scrollWidth,sample.stage.clientWidth,`${id}: horizontal overflow`);
    assert.equal(sample.staleReaction,false,'a new game must not retain the previous score toast');
    assert.ok(sample.stage.scrollHeight<=sample.stage.clientHeight+1,`${id}: required controls need vertical scrolling`);
    assert.ok(sample.tiles.every(t=>t.x>=-1&&t.x+t.w<=viewport.width+1),`${id}: clipped control`);
    const screenshot=`analysis-${id}-L${level}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({path:path.join(out,screenshot),fullPage:false});
    if(id==='cube-count'){
     await page.locator('#stage .tile').filter({hasText:new RegExp(`^${sample.solution}$`)}).click({force:true});
    }else if(id==='heavyweight'){
     await page.locator('#stage .tile').filter({has:page.locator(`.symbol[data-symbol="${sample.solution}"]`)}).click({force:true});
    }else if(id==='speed-sorting'){
     for(const value of sample.solution)await page.locator('#stage .tile').filter({has:page.locator(`.symbol[data-symbol="${value}"]`)}).click({force:true});
     if(sample.q.kind==='category')await page.getByRole('button',{name:'选好啦',exact:true}).click({force:true});
    }else{
     if(level===10){
      const before=await page.locator('#stage .analysis-piece').count();
      await page.locator(`[data-piece="${sample.solution[0]}"]`).click({force:true});await page.clock.runFor(300);
      await page.getByRole('button',{name:'↶ 撤回',exact:true}).click({force:true});
      assert.equal(await page.locator('#stage .analysis-piece').count(),before,'sculpt undo restores full board');
      await page.clock.runFor(40);
     }
     for(const value of sample.solution){await page.locator(`[data-piece="${value}"]`).click({force:true});await page.clock.runFor(300);}
    }
    await page.clock.runFor(100);
    const after=await page.evaluate(()=>window.__brain.state());assert.equal(after.correct,1,`${id} level${level} real pointer did not solve`);assert.equal(after.mistakes,0);
    assert.ok(after.score>=100,'successful interaction earns score');
    records.push({id,level,viewport,seed,screenshot,stage:sample.stage,question:sample.q,solution:sample.solution,after});
    console.log(`${viewport.width}x${viewport.height} ${id} L${level}: pointer solved, score ${after.score}`);
   }
   // Pause freezes both session time and sculpt movement lock; overlay absorbs pointer input.
   await page.evaluate(()=>window.__brain.start('match-blast',93939,10));await page.clock.runFor(48);
   await page.getByRole('button',{name:'暂停',exact:true}).click({force:true});
   const paused=await page.evaluate(()=>window.__brain.state());await page.clock.runFor(3000);
   const still=await page.evaluate(()=>window.__brain.state());assert.equal(still.elapsed,paused.elapsed);assert.equal(still.correct,0);
   await page.getByRole('button',{name:'继续玩',exact:true}).click({force:true});await page.clock.runFor(80);
   assert.equal((await page.evaluate(()=>window.__brain.state())).paused,false);
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[],'no browser exceptions');
 await writeFile(path.join(out,'analysis-browser-check.json'),JSON.stringify({schema:1,kind:'actual Chrome pointer interaction',phone:false,passed:records.length,errors,records},null,2)+'\n');
 console.log(`PASS ${records.length} real browser questions; browser/context closed in finally.`);
}finally{await browser.close();}
