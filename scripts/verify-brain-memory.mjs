#!/usr/bin/env node
/** Real Chrome pointer QA for the four memory games. No answer bridge injection. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {dirname, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPlaywright} from './brain-browser-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'app/assets');
const OUTPUT = resolve(ROOT, 'docs/Design Brain School 20');
const playwright=loadPlaywright();

await mkdir(OUTPUT, {recursive:true});
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.mp3':'audio/mpeg'};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(ASSETS, '.' + pathname);
    if (!file.startsWith(ASSETS + '/')) throw Error('path');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream'});
    response.end(await readFile(file));
  } catch {response.writeHead(404); response.end('not found');}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let browser;
try {browser=await playwright.chromium.launch({channel:'chrome',headless:true});}
catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
const report = {type:'real-chrome-pointer-memory',createdAt:new Date().toISOString(),cases:[],errors:[]};
const gameIds = ['flash-memory','memo-random','reverse-retention','covered-cages'];
async function state(page) {return page.evaluate(() => window.__brain.state());}
async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded({timeout:4000});
  const rect = await locator.boundingBox();
  assert.ok(rect && rect.width >= 30 && rect.height >= 30, 'usable visible pointer target');
  const hit = await locator.evaluate(el => {
    const r=el.getBoundingClientRect(), target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return target===el || el.contains(target);
  });
  assert.equal(hit,true,'real center pointer must hit the desired button');
  await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
}
async function tick(page, ms) {await page.clock.runFor(ms);}
async function runGame(page, id, level, width, height) {
  await page.evaluate(({id,level})=>window.__brain.start(id,0x59127+level,level),{id,level});
  await tick(page,32);
  const q = await page.evaluate(()=>window.__brain.question());
  const answer = await page.evaluate(()=>window.__brain.definition().solution(window.__brain.question()));
  const before = await state(page);
  assert.equal(before.correct,0);
  if (id==='flash-memory') {
    assert.ok(await page.locator('#stage .tile').first().isDisabled());
    await tick(page,q.showMs+50);
    assert.equal(await page.locator('.memory-flash-token').first().textContent(),'？');
  } else if (id==='memo-random') {
    await tap(page,page.locator('.memory-remember'));
    assert.equal(await page.locator('.memory-covered').count(),q.hidden.length);
  } else if (id==='reverse-retention') {
    assert.ok(await page.locator('#stage .tile').first().isDisabled());
    await tick(page,q.sequence.length*(q.stepMs+q.gapMs)+50);
    assert.equal(await page.locator('.prompt').textContent(),'从后往前点');
  } else {
    await tick(page,q.showMs+q.closeMs+q.swaps.length*q.swapMs+80);
    assert.equal(await page.locator('.memory-cages-closed').count(),1);
    assert.ok(await page.getByRole('button',{name:'第1个鸟笼',exact:true}).isEnabled());
  }
  const metrics=await page.evaluate(()=>({
    width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,
    stageHeight:document.getElementById('stage').clientHeight,stageContentHeight:document.getElementById('stage').scrollHeight,
    tiles:[...document.querySelectorAll('#stage button')].map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent,w:r.width,h:r.height};})
  }));
  assert.ok(metrics.bodyWidth<=width,'no horizontal overflow');
  assert.ok(metrics.stageContentHeight<=metrics.stageHeight+1,'memory challenge fits without scrolling');
  if (level===10) await page.screenshot({path:resolve(OUTPUT,`memory-${id}-${width}x${height}-L10.png`),animations:'disabled'});
  for (const value of answer) {
    const locator = id==='flash-memory'
      ? page.getByRole('button',{name:String(value),exact:true})
      : id==='covered-cages'
      ? page.getByRole('button',{name:'第'+(value+1)+'个鸟笼',exact:true})
      : page.locator(`#stage .tile:has(.symbol[data-symbol="${value}"])`);
    await tap(page,locator);
  }
  const solved = await state(page);
  assert.equal(solved.correct,1,id+' real pointer answer');
  assert.ok(solved.score>=100); assert.equal(solved.mistakes,0);
  await tick(page,650);
  const next = await state(page); assert.equal(next.round,2);
  report.cases.push({id,level,width,height,correct:solved.correct,score:solved.score,nextRound:next.round,metrics});
}
try {
  for (const [width,height] of [[320,568],[392,872]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    try {
      const page=await context.newPage();
      page.on('pageerror',error=>report.errors.push(String(error)));
      await page.clock.install({time:new Date('2026-10-26T12:00:00Z')});
      await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
      await page.goto(`http://127.0.0.1:${port}/brain-school/index.html`,{waitUntil:'load'});
      await page.evaluate(()=>localStorage.clear());
      // Verify the actual menu path once, before seeded level diagnostics.
      await tap(page,page.getByRole('button',{name:'记忆',exact:true}));
      assert.equal(await page.locator('.game-card').count(),4);
      await tap(page,page.locator('[data-game="flash-memory"]'));
      assert.equal((await state(page)).screen,'detail');
      await tap(page,page.locator('#start'));
      assert.equal((await state(page)).screen,'play');
      // Genuine pointer pause, manually advanced animation frames, genuine resume.
      await tick(page,400);
      await tap(page,page.locator('#pauseButton'));
      const paused=await state(page);
      await tick(page,2500);
      const frozen=await state(page);
      assert.equal(frozen.paused,true); assert.equal(frozen.remaining,paused.remaining); assert.equal(frozen.questionTime,paused.questionTime);
      await tap(page,page.locator('#resume'));
      await tick(page,250);
      assert.ok((await state(page)).questionTime>frozen.questionTime);
      // Page back pauses; the modal's own navigation returns to detail, then hub.
      await tap(page,page.locator('#back')); assert.equal((await state(page)).paused,true);
      await tap(page,page.locator('#pauseMenu')); assert.equal((await state(page)).screen,'detail');
      await tap(page,page.locator('#back')); assert.equal((await state(page)).screen,'hub');
      for(const id of gameIds) for(const level of [1,5,10]) await runGame(page,id,level,width,height);
      report.cases.push({type:'pause-and-layered-back',width,height,pauseFrozenMs:2500,passed:true});
    } finally {await context.close();}
  }
  assert.equal(report.errors.length,0,'no browser errors');
  report.passed=true;
} catch(error) {report.passed=false;report.failure=error.stack;throw error;}
finally {
  try{await writeFile(resolve(OUTPUT,'memory-browser-qa.json'),JSON.stringify(report,null,2)+'\n');}
  finally{try{await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}}
}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors.length}));
