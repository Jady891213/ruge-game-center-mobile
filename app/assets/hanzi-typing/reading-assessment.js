/* Only Tencent SOE's real final response can resolve an assessment. Audio is memory-only. */
(function(w){
'use strict';
function failure(code){const e=new Error(code);e.code=code;return e;}
function create(options={}){
  const native=options.native||w.RugeAssessment,Socket=options.Socket||w.WebSocket;
  const emit=s=>{try{options.onState?.(s);}catch(_){}};
  let generation=0,timer=0,socket=null,pendingReject=null;
  function available(){try{return !!native?.available()&&typeof Socket==='function';}catch(_){return false;}}
  function configured(){try{return !!native?.configured();}catch(_){return false;}}
  function cancel(){generation++;clearTimeout(timer);timer=0;if(socket){socket.onopen=socket.onmessage=socket.onerror=socket.onclose=null;try{socket.close();}catch(_){}socket=null;}try{native?.cancel();}catch(_){}if(pendingReject){const reject=pendingReject;pendingReject=null;reject(failure('cancelled'));}emit({status:'idle',level:0,elapsedMs:0});}
  function finish(){try{native?.finish();}catch(_){}}
  async function start(task){
    cancel();if(!available())throw failure('unavailable');if(!configured())throw failure('unconfigured');if(document.hidden)throw failure('cancelled');
    if(!task||![0,8].includes(task.evalMode)||typeof task.reference!=='string'||task.reference.length>80)throw failure('invalid-task');
    const token=generation;
    return new Promise((resolve,reject)=>{
      pendingReject=reject;let done=false,recordSession='',recordStarted=false;
      function end(error,value){if(done)return;done=true;clearTimeout(timer);timer=0;pendingReject=null;if(socket){socket.onopen=socket.onmessage=socket.onerror=socket.onclose=null;try{socket.close();}catch(_){}socket=null;}try{native.cancel();}catch(_){}if(error){emit({status:'idle',level:0,elapsedMs:0});reject(failure(error));}else{emit({status:'idle',level:0,elapsedMs:0});resolve(value);}}
      function connect(payload){
        if(payload.sessionId!==recordSession||typeof payload.pcmBase64!=='string'||payload.sampleRate!==16000)return end('invalid-audio');
        let url,pcm;
        try{url=new URL(payload.url);if(url.protocol!=='wss:'||url.hostname!=='soe.cloud.tencent.com'||url.port||url.username||url.password||!/^\/soe\/api\/\d+$/.test(url.pathname)||url.searchParams.get('voice_id')!==recordSession||url.searchParams.get('rec_mode')!=='1')return end('invalid-endpoint');
          if(payload.pcmBase64.length>350000)return end('invalid-audio');const bytes=atob(payload.pcmBase64);if(bytes.length<11200||bytes.length>256000||bytes.length%2)return end('invalid-audio');pcm=Uint8Array.from(bytes,c=>c.charCodeAt(0));
        }catch(_){return end('invalid-audio');}
        emit({status:'processing',level:0,elapsedMs:0});let sent=false,result=null;
        try{socket=new Socket(url.href);}catch(_){return end('network');}
        timer=setTimeout(()=>end('network'),18000);
        socket.onmessage=e=>{
          if(token!==generation||document.hidden)return end('cancelled');let msg;
          try{msg=JSON.parse(e.data);}catch(_){return end('invalid-result');}
          if(!msg||msg.voice_id!==recordSession||typeof msg.code!=='number')return end('invalid-result');
          if(msg.code!==0)return end([4105,4108].includes(msg.code)?'no-speech':msg.code===4003?'service-disabled':msg.code===4004||msg.code===4005?'service-balance':msg.code===4002?'service-auth':'service-error');
          if(!sent){sent=true;socket.send(pcm);pcm=null;socket.send(JSON.stringify({type:'end'}));}
          if(msg.result!==undefined){try{const next=typeof msg.result==='string'?JSON.parse(msg.result):msg.result;if(!next||typeof next!=='object'||!Number.isFinite(next.SuggestedScore)||!Array.isArray(next.Words))return end('invalid-result');if(msg.final===1||next.SentenceId===-1)result=next;}catch(_){return end('invalid-result');}}
          if(msg.final===1){if(!result)return end('invalid-result');end(null,result);}
        };
        socket.onerror=()=>end('network');socket.onclose=()=>{if(!done)end('network');};
      }
      function poll(){
        if(done)return;if(token!==generation||document.hidden)return end('cancelled');let s;
        try{s=JSON.parse(native.read());}catch(_){return end('unavailable');}
        if(s.sessionId){if(recordSession&&recordSession!==s.sessionId)return end('cancelled');recordSession=s.sessionId;}
        if(s.status==='unconfigured')return end('unconfigured');
        if(s.status==='permission'||s.status==='ready'&&!s.sessionId){emit({status:'permission',level:0,elapsedMs:0});return end('permission');}
        if(s.status==='error')return end(['no-speech','too-short','recording-too-short','no-audio-detected'].includes(s.error)?'no-speech':s.error==='permission-denied'?'permission':'recording-error');
        if(s.status==='recorded'){let payload;try{payload=JSON.parse(native.take());}catch(_){return end('invalid-audio');}return connect(payload);}
        if(s.status==='recording'){recordStarted=true;emit({status:'recording',level:Math.max(0,Math.min(1,Number(s.level)||0)),elapsedMs:Number(s.elapsedMs)||0});}
        if(recordStarted&&s.status==='idle')return end('cancelled');
        if(Date.now()-began>11000)return end('recording-error');
        timer=setTimeout(poll,80);
      }
      const began=Date.now();try{native.begin(JSON.stringify({reference:task.reference,evalMode:task.evalMode}));}catch(_){return end('unavailable');}timer=setTimeout(poll,80);
    });
  }
  return Object.freeze({available,configured,start,finish,cancel});
}
w.ReadingAssessment=Object.freeze({create});
})(window);
