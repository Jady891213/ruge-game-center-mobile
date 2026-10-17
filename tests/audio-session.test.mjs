import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';

test('同一声音模式连续开始复用当前采集，换模式与后台仍释放',async()=>{
  const page=loadGame('voice-quest',{instrument:(source,index)=>(index===0?`window.__audioCalls=[];window.__nativeSample={status:'idle',mode:'',ageMs:0};window.RugeAudioNative={read(){return JSON.stringify(window.__nativeSample)},start(mode){window.__audioCalls.push('start:'+mode);window.__nativeSample={status:'listening',mode,ageMs:0}},stop(){window.__audioCalls.push('stop');window.__nativeSample={status:'idle',mode:'',ageMs:999999}}};`: '')+source});
  try {
    const a=page.window.RugeAudioInput,calls=page.window.__audioCalls;
    await a.start('command');const starts=calls.filter(x=>x==='start:command').length;
    await a.start('command');await a.start('command');
    assert.equal(calls.filter(x=>x==='start:command').length,starts);
    await a.start('pitch');assert.equal(calls.at(-1),'start:pitch');
    page.emitWindow('ruge:pause');assert.equal(calls.at(-1),'stop');
    await a.start('pitch');assert.equal(calls.filter(x=>x==='start:pitch').length,2);
  } finally {page.dispose();}
});
