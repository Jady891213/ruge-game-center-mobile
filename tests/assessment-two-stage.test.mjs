// Transport fixtures test cancellation and clipping; these are not pronunciation evidence.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
const src=readFileSync(new URL('../app/assets/shared/assessment.js',import.meta.url),'utf8');
function harness(){let phase='idle',next=0,clock=0;const timers=new Map(),sockets=[];const id='primary-id',auditId='tone-id';
 class WS{constructor(){this.sent=[];this.closed=false;sockets.push(this);}send(v){this.sent.push(v);}close(){this.closed=true;}receive(m){this.onmessage?.({data:JSON.stringify(m)});}}
 const url=id=>'wss://soe.cloud.tencent.com/soe/api/123?voice_id='+id+'&rec_mode=1';
 const native={available:()=>true,configured:()=>true,cancel(){phase='idle';},begin(){phase='recording';},finish(){phase='recorded';},read:()=>JSON.stringify({status:phase,sessionId:id,elapsedMs:500}),take:()=>JSON.stringify({sessionId:id,url:url(id),sampleRate:16000,pcmBase64:Buffer.alloc(16000,10).toString('base64'),toneAudit:{index:2,reference:'shan1',sessionId:auditId,url:url(auditId)}})};
 const c=vm.createContext({window:{RugeAssessment:native,WebSocket:WS},document:{hidden:false},setTimeout(fn,d){let key=++next;timers.set(key,{fn,at:clock+d});return key;},clearTimeout(k){timers.delete(k);},Date:{now:()=>clock},URL,atob,Uint8Array,Promise});vm.runInContext(src,c);const A=c.window.GameAssessment.create();
 function advance(ms){clock+=ms;for(const[k,t]of[...timers])if(t.at<=clock){timers.delete(k);t.fn();}}
 const p=A.start({evalMode:8,reference:'sh an1 shan1'});p.catch(()=>{});advance(80);A.finish();advance(80);
 const result={SuggestedScore:90,Words:[{Word:'sh',MatchTag:0,PronAccuracy:90},{Word:'an1',MatchTag:0,PronAccuracy:90},{Word:'shan1',MatchTag:0,PronAccuracy:90,MemBeginTime:200,MemEndTime:400}],SentenceId:-1};
 return{A,p,id,auditId,sockets,result,hide(){c.document.hidden=true;},advance};
}
test('同一份PCM按末字真实时间裁切，等待第二次最终Tone后返回，不再重新录音',async()=>{const h=harness();try{
 h.sockets[0].receive({code:0,voice_id:h.id,final:1,result:h.result});assert.equal(h.sockets.length,2);assert.equal(h.sockets[0].closed,true);const second=h.sockets[1];assert.equal(second.sent.length,0);
 second.receive({code:0,voice_id:h.auditId,final:0,result:null});assert.equal(second.sent[0].byteLength,11200);assert.equal(second.sent[0][0],10);assert.equal(second.sent[0].at(-1),0);
 second.receive({code:0,voice_id:h.auditId,final:1,result:{SuggestedScore:87,Words:[{Word:'啊',MatchTag:0,PronAccuracy:87,Tone:{Valid:true,RefTone:1,HypothesisTone:1}}]}});
 const r=await h.p;assert.equal(r.ToneAudit.index,2);assert.equal(r.ToneAudit.result.SuggestedScore,87);assert.equal(second.closed,true);assert.ok(second.sent[0].every(v=>v===0));assert.ok(h.sockets[0].sent[0].every(v=>v===0));
 }finally{h.A.cancel();}});
test('第二阶段取消/后台丢弃迟到分、关闭socket并擦除两段内存；技术错误不返回0分',async()=>{for(const kind of ['cancel','hidden','network']){const h=harness();try{
 const rejected=assert.rejects(h.p,e=>['cancelled','network'].includes(e.code));h.sockets[0].receive({code:0,voice_id:h.id,final:1,result:h.result});const s=h.sockets[1];s.receive({code:0,voice_id:h.auditId});
 if(kind==='cancel')h.A.cancel();else if(kind==='hidden'){h.hide();s.receive({code:0,voice_id:h.auditId,final:1,result:{SuggestedScore:99,Words:[]}});}else s.onerror();await rejected;assert.equal(s.closed,true);assert.ok(s.sent[0].every(v=>v===0));assert.ok(h.sockets[0].sent[0].every(v=>v===0));
 }finally{h.A.cancel();}}});
test('漏读片段或越界时间不上传无关录音片段',async()=>{for(const bad of ['missing','bounds']){const h=harness();try{
 if(bad==='missing'){h.result.Words[2].MatchTag=2;h.result.Words[2].PronAccuracy=-1;h.sockets[0].receive({code:0,voice_id:h.id,final:1,result:h.result});assert.equal((await h.p).Words[2].MatchTag,2);assert.equal(h.sockets.length,1);}
 else{const rejected=assert.rejects(h.p,e=>e.code==='invalid-result');h.result.Words[2].MemEndTime=9000;h.sockets[0].receive({code:0,voice_id:h.id,final:1,result:h.result});await rejected;assert.equal(h.sockets.length,1);}
 }finally{h.A.cancel();}}});
