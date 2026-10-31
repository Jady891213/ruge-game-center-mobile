/** Real Chromium decoding/playback checks. Own server, context and browser close in finally. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPlaywright} from './brain-browser-runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),assets=resolve(root,'app/assets');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ogg':'audio/ogg','.json':'application/json'};
const server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=resolve(assets,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(assets+sep)){res.writeHead(403).end();return;}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(bytes);}catch(_){res.writeHead(404).end();}});
let browser,context;
const evidence={scope:'Desktop Chromium real OGG decoding and HTMLAudio playback state; not Android speaker listening or WebView lifecycle acceptance.',tracks:[],checks:[],errors:[]};
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await loadPlaywright().chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']});
 context=await browser.newContext({viewport:{width:392,height:872}});
 await context.addInitScript(()=>{const RealAudio=window.Audio;window.__musicAudio=[];window.Audio=function(src){const a=new RealAudio(src);window.__musicAudio.push(a);return a;};window.Audio.prototype=RealAudio.prototype;});
 const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.mouse.click(8,8);
 for(const track of ['meadow','orchard','paper','cloud','starlight']){
  await page.evaluate(id=>window.RugeMusic.select(id),track);
  await page.waitForFunction(id=>window.__musicAudio.some(a=>a.src.endsWith('/'+id+'.ogg')&&!a.paused&&a.currentTime>.08),track,{timeout:10000});
  const decoded=await page.evaluate(async id=>{const ac=new AudioContext();try{const buffer=await ac.decodeAudioData(await (await fetch('/shared/music/'+id+'.ogg')).arrayBuffer());return {id,duration:buffer.duration,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate,playing:window.__musicAudio.filter(a=>!a.paused).length};}finally{await ac.close();}},track);
  assert.equal(decoded.channels,2);assert.equal(decoded.playing,1);assert.ok(decoded.duration>=32&&decoded.duration<=48);evidence.tracks.push(decoded);
 }
 let result=await page.evaluate(()=>{RugeMusic.setVolume(.11);RugeFX.setVolume(.35);return {audio:window.__musicAudio.find(a=>!a.paused).volume,fx:RugeFX.getVolume(),vibration:RugeFX.enabled('vibration'),music:RugeMusic.volume()};});
 assert.equal(result.audio,.11);assert.equal(result.fx,.35);assert.equal(result.vibration,true);evidence.checks.push({name:'independent actual HTMLAudio / WebAudio volume',...result});
 result=await page.evaluate(()=>{RugeMusic.suspend('microphone');RugeMusic.suspend('demo');RugeMusic.resume('demo');return {paused:window.__musicAudio.every(a=>a.paused),reasons:RugeMusic.state().suspended};});
 assert.equal(result.paused,true);assert.deepEqual(result.reasons,['microphone']);await page.evaluate(()=>RugeMusic.resume('microphone'));await page.waitForFunction(()=>window.__musicAudio.some(a=>!a.paused));evidence.checks.push({name:'overlapping recorder/demo reason protection',...result});
 result=await page.evaluate(()=>{RugeMusic.setVolume(0);RugeMusic.setEnabled(true);window.dispatchEvent(new PointerEvent('pointerdown'));return {paused:window.__musicAudio.every(a=>a.paused),volume:RugeMusic.volume(),enabled:RugeMusic.enabled()};});
 assert.equal(result.paused,true);assert.equal(result.volume,0);assert.equal(result.enabled,true);evidence.checks.push({name:'zero volume remains silent after gesture',...result});
 await page.evaluate(()=>{RugeMusic.setVolume(.22);window.dispatchEvent(new PageTransitionEvent('pagehide'));RugeMusic.resume('microphone');window.dispatchEvent(new PointerEvent('pointerdown'));});
 result=await page.evaluate(()=>({paused:window.__musicAudio.every(a=>a.paused),exited:RugeMusic.state().exited}));assert.deepEqual(result,{paused:true,exited:true});evidence.checks.push({name:'page departure stays silent',...result});
 assert.deepEqual(evidence.errors,[]);
 const destination=resolve(root,'docs/Design Game Music Players and Brain UI');await mkdir(destination,{recursive:true});await writeFile(resolve(destination,'music-browser.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{
 try{if(context)await context.close();}finally{try{if(browser)await browser.close();}finally{await new Promise(r=>server.close(r));}}
}
