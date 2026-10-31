#!/usr/bin/env node
/** Synthetic-data Chrome QA. Never reads a phone or a user's browser profile. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPlaywright} from './brain-browser-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),assets=path.join(root,'app/assets'),out=path.join(root,'docs/Design Game Music Players and Brain UI');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(assets,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(assets+path.sep))throw Error('path');res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch(_){res.writeHead(404);res.end();}});
let browser;const records=[],errors=[];
const snap=page=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
const read=page=>page.evaluate(()=>Object.fromEntries(RugePlayers.progressKeys.flatMap(k=>localStorage.getItem(k)===null?[]:[[k,localStorage.getItem(k)]])));
const frame=page=>page.evaluate(()=>{const r=document.querySelector('#homeHeader').getBoundingClientRect();return{viewport:innerWidth,scroll:document.documentElement.scrollWidth,header:{x:r.x,right:r.right,bottom:r.bottom},children:[...document.querySelectorAll('#homeHeader>*,#homeHeader .header-tools>*')].map(e=>{const b=e.getBoundingClientRect();return{x:b.x,right:b.right,w:b.width};}),cols:getComputedStyle(document.querySelector('#cards')).gridTemplateColumns.split(' ').length};});
await mkdir(out,{recursive:true});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await loadPlaywright().chromium.launch({channel:'chrome',headless:true});
 for(const viewport of [{width:320,height:568},{width:392,height:872}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  try{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'/index.html');const keys=await page.evaluate(()=>RugePlayers.progressKeys);
   const old=Object.fromEntries(keys.map((k,i)=>[k,'original-'+i+'-原样'])),global={rugeFeedbackV1:'{"sound":false,"vibration":true}',rugeAwake:'false',privateServiceConfig:'synthetic-global'};
   await page.evaluate(seed=>{for(const[k,v]of Object.entries(seed))localStorage.setItem(k,v);},{...old,...global});
   await page.reload();assert.deepEqual(await snap(page),{...old,...global});
   const geometry=await frame(page);assert.equal(geometry.scroll,viewport.width);assert.equal(geometry.cols,2);assert.ok(geometry.children.every(r=>r.x>=0&&r.right<=viewport.width));
   await page.screenshot({path:path.join(out,'players-home-'+viewport.width+'.png')});
   await page.locator('#playerButton').click();await page.screenshot({path:path.join(out,'players-list-'+viewport.width+'.png')});
   await page.getByRole('button',{name:'编辑 小玩家',exact:true}).click();await page.locator('#playerNameInput').fill('小鸽');await page.getByRole('button',{name:'小鸽子',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();
   assert.deepEqual(await read(page),old);await page.locator('#playerAdd').click();await page.locator('#playerNameInput').fill('小桃');await page.getByRole('button',{name:'小兔子',exact:true}).click();
   await page.screenshot({path:path.join(out,'players-edit-'+viewport.width+'.png')});
   await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'保存',exact:true}).click()]);assert.equal(await page.locator('#playerName').textContent(),'小桃');assert.deepEqual(await read(page),{});
   const a=Object.fromEntries(keys.map((k,i)=>[k,'A-'+i]));await page.evaluate(seed=>{for(const[k,v]of Object.entries(seed))localStorage.setItem(k,v);},a);
   await page.locator('#playerButton').click();await page.locator('#playerAdd').click();await page.locator('#playerNameInput').fill('小熊');await page.getByRole('button',{name:'小熊',exact:true}).click();
   await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'保存',exact:true}).click()]);assert.deepEqual(await read(page),{});
   await page.evaluate(()=>{localStorage.setItem('rugeBrainSchoolV1','B-brain');localStorage.setItem('rugeCenter','B-recent');});
   async function select(name){await page.locator('#playerButton').click();await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:name+'，切换到这个玩家',exact:true}).click()]);}
   await select('小桃');assert.deepEqual(await read(page),a);
   await page.locator('#playerButton').click();await page.getByRole('button',{name:'编辑 小熊',exact:true}).click();await page.locator('#playerReset').click();assert.equal(await page.locator('#playerResetName').textContent(),'清空「小熊」的进度？');
   await page.screenshot({path:path.join(out,'players-reset-confirm-'+viewport.width+'.png')});await page.locator('#playerKeep').click();await page.locator('#playerReset').click();await page.locator('#playerConfirmReset').click();assert.deepEqual(await read(page),a);
   await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'小熊，切换到这个玩家',exact:true}).click()]);assert.deepEqual(await read(page),{});
   await select('小鸽');assert.deepEqual(await read(page),old);for(const[k,v]of Object.entries(global))assert.equal((await snap(page))[k],v);
   await page.locator('#playerButton').click();assert.equal(await page.evaluate(()=>onRugeBack()),true);assert.equal(await page.locator('#playersOverlay').isHidden(),true);
   records.push({viewport,geometry,defaultUnchanged:true,roundTripAll30Keys:true,resetInactiveOnly:true,globalSettingsRetained:true,namedConfirmation:true,backClosesDialog:true});
  }finally{await context.close();}
 }
 // Use actual game UI to produce a save, then prove a cached page cannot write
 // its in-memory draft into a newly selected player's physical slot.
 const context=await browser.newContext({viewport:{width:392,height:872},reducedMotion:'reduce'});
 try{
  const home=await context.newPage(),game=await context.newPage();for(const p of[home,game])p.on('pageerror',e=>errors.push(String(e)));
  await home.goto(base+'/index.html');
  await game.addInitScript(()=>window.addEventListener('storage',e=>e.stopImmediatePropagation(),true));
  await game.goto(base+'/code-breaker/index.html');
  assert.ok(await game.evaluate(()=>!!RugePlayers),'every real game must load the players guard first');
  await game.getByRole('button',{name:'第1关，开始',exact:true}).click();await game.getByRole('button',{name:'数字 1',exact:true}).click();
  const original=await game.evaluate(()=>localStorage.getItem('rugeCodebreakerV1'));assert.ok(original.includes('1'));
  const a=await home.evaluate(()=>RugePlayers.create('妹妹','cat'));await home.evaluate(id=>RugePlayers.select(id),a.id);
  await home.evaluate(()=>localStorage.setItem('rugeCodebreakerV1','new-player-synthetic'));
  const stale=await game.evaluate(()=>{let blocked=false;try{localStorage.setItem('rugeCodebreakerV1','late-write');}catch(e){blocked=e.name==='InvalidStateError';}window.dispatchEvent(new Event('pagehide'));return{blocked,read:localStorage.getItem('rugeCodebreakerV1'),actual:localStorage.rugeCodebreakerV1};});
  assert.deepEqual(stale,{blocked:true,read:null,actual:'new-player-synthetic'});
  await home.evaluate(()=>RugePlayers.select('default'));assert.equal(await home.evaluate(()=>localStorage.getItem('rugeCodebreakerV1')),original);
  await game.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await game.waitForURL(base+'/index.html');
  records.push({actualCodebreakerUISaved:true,cachedPageLateWriteBlocked:true,cachedPageHideSaveBlocked:true,originalRestoredExactly:true,stalePageshowReturnsHome:true});
 }finally{await context.close();}
 // Native Storage is instrumented before players.js captures it. These are
 // injected QuotaExceededError failures on real Chrome storage, including a
 // persistent failure that also prevents rollback until the next document.
 const recoveryContext=await browser.newContext({viewport:{width:320,height:568}});
 try{
  await recoveryContext.addInitScript(()=>{
   window.__quota={writes:0,failAt:0,persistent:false};
   const proto=Storage.prototype,set=proto.setItem,remove=proto.removeItem;
   function attempt(){const q=window.__quota;q.writes++;if(q.failAt&&(q.writes===q.failAt||q.persistent&&q.writes>=q.failAt))throw new DOMException('Synthetic quota failure','QuotaExceededError');}
   proto.setItem=function(k,v){attempt();return set.call(this,k,v);};proto.removeItem=function(k){attempt();return remove.call(this,k);};
  });
  const page=await recoveryContext.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/index.html');
  const prepared=await page.evaluate(()=>{const a=RugePlayers.create('妹妹','cat');RugePlayers.select(a.id);localStorage.setItem('frogPondHi','A-save');localStorage.setItem('rugeHanziStrokesV1','A-hanzi');RugePlayers.select('default');localStorage.setItem('frogPondHi','original');localStorage.setItem('rugeCenter','original-recent');return{id:a.id,before:Object.fromEntries(Object.entries(localStorage))};});
  const rollback=await page.evaluate(id=>{__quota.failAt=__quota.writes+3;let rejected=false;try{RugePlayers.select(id);}catch(e){rejected=e.name==='QuotaExceededError';}return{rejected,ready:RugePlayers.state().ready,after:Object.fromEntries(Object.entries(localStorage))};},prepared.id);
  assert.equal(rollback.rejected,true);assert.equal(rollback.ready,true);assert.deepEqual(rollback.after,prepared.before);
  const pending=await page.evaluate(id=>{__quota.failAt=__quota.writes+3;__quota.persistent=true;let rejected=false;try{RugePlayers.select(id);}catch(e){rejected=e.name==='QuotaExceededError';}return{rejected,ready:RugePlayers.state().ready,after:Object.fromEntries(Object.entries(localStorage))};},prepared.id);
  assert.equal(pending.rejected,true);assert.equal(pending.ready,false);assert.ok(pending.after.rugePlayersTransactionV1);
  await page.goto(base+'/code-breaker/index.html?cover=1');assert.equal(await page.evaluate(()=>RugePlayers.state().cover),true);assert.deepEqual(await snap(page),pending.after,'cover must not recover or modify the pending transaction');
  await page.goto(base+'/index.html');assert.deepEqual(await snap(page),prepared.before);assert.equal(await page.evaluate(()=>RugePlayers.state().ready),true);
  records.push({realChromeInjectedQuotaRollback:true,persistentFailureKeepsJournal:true,coverDoesNotRecoverOrWrite:true,nextDocumentRecoversExactly:true});
 }finally{await recoveryContext.close();}
 // Fill an isolated real origin to its actual quota. The first journal write
 // must fail before touching the existing progress or creating a player store.
 const quotaContext=await browser.newContext();
 try{
  const page=await quotaContext.newPage();await page.goto(base+'/index.html');
  const quota=await page.evaluate(()=>{localStorage.setItem('frogPondHi','keep');let padding='';for(const size of[1048576,65536,1024,32]){for(let i=0;i<200;i++){try{const next=padding+'q'.repeat(size);localStorage.setItem('qaQuotaPadding',next);padding=next;}catch(_){break;}}}const before=JSON.stringify(Object.entries(localStorage));let rejected=false;try{RugePlayers.create('小猫','cat');}catch(e){rejected=e.name==='QuotaExceededError';}return{rejected,unchanged:JSON.stringify(Object.entries(localStorage))===before,progress:localStorage.getItem('frogPondHi'),libraryAbsent:localStorage.getItem('rugePlayersV1')===null};});
  assert.deepEqual(quota,{rejected:true,unchanged:true,progress:'keep',libraryAbsent:true});records.push({actualBrowserQuotaFullPreservesOriginal:true});
 }finally{await quotaContext.close();}
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'players-browser-check.json'),JSON.stringify({schema:1,kind:'real desktop Chrome; synthetic data only',phone:false,passed:records.length,records,errors},null,2)+'\n');
 console.log(JSON.stringify({passed:records.length,errors,report:path.relative(root,path.join(out,'players-browser-check.json'))}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
