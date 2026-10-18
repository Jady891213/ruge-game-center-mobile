import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../app/assets/shared/assessment.js',import.meta.url),'utf8')+readFileSync(new URL('../app/assets/hanzi-typing/reading-assessment.js',import.meta.url),'utf8');

function setup(){
  let phase='idle',next=0,clock=0;const pending=new Map(),sockets=[];
  const id='protocol-review-session';
  class WS{constructor(){this.sent=[];sockets.push(this);}send(v){this.sent.push(v);}close(){}receive(msg){this.onmessage?.({data:JSON.stringify(msg)});}}
  const native={available:()=>true,configured:()=>true,cancel(){phase='idle';},begin(){phase='recording';},finish(){phase='recorded';},read:()=>JSON.stringify({status:phase,sessionId:id,elapsedMs:500}),take:()=>JSON.stringify({sessionId:id,url:'wss://soe.cloud.tencent.com/soe/api/123?voice_id='+id+'&rec_mode=1',sampleRate:16000,pcmBase64:Buffer.alloc(16000).toString('base64')})};
  const context=vm.createContext({window:{RugeAssessment:native,WebSocket:WS},document:{hidden:false},setTimeout(fn,delay){const key=++next;pending.set(key,{fn,at:clock+delay});return key;},clearTimeout(key){pending.delete(key);},Date:{now:()=>clock},URL,atob,Uint8Array,Promise});
  vm.runInContext(source,context);const A=context.window.ReadingAssessment.create();
  function advance(ms){clock+=ms;for(const[k,t]of [...pending])if(t.at<=clock){pending.delete(k);t.fn();}}
  const promise=A.start({reference:'ban1',evalMode:8});promise.catch(()=>{});advance(80);A.finish();advance(80);
  return{A,id,promise,socket:sockets[0]};
}

for(const [name,bad] of [['null',null],['缺少总分',{Words:[]}],['错误总分类型',{SuggestedScore:'90',Words:[]}]]){
 test('最终结果'+name+'不回退到此前的中间高分',async()=>{
   const h=setup();try{
     const expected=assert.rejects(h.promise,e=>e.code==='invalid-result');
     h.socket.receive({code:0,voice_id:h.id,result:{SuggestedScore:99,Words:[{Word:'ban1'}],SentenceId:0}});
     h.socket.receive({code:0,voice_id:h.id,final:1,result:bad});
     await expected;
   }finally{h.A.cancel();}
 });
}

test('只有分句中间结果而没有确定整体结果时，空final不算有效评分',async()=>{
 const h=setup();try{
   const expected=assert.rejects(h.promise,e=>e.code==='invalid-result');
   h.socket.receive({code:0,voice_id:h.id,result:{SuggestedScore:99,Words:[{Word:'ban1'}],SentenceId:0}});
   h.socket.receive({code:0,voice_id:h.id,final:1});
   await expected;
 }finally{h.A.cancel();}
});
