#!/usr/bin/env python3
"""Safe explicit SOE synthetic-audio probe. No human microphone; no secret/URL logging."""
import argparse,asyncio,base64,hashlib,hmac,importlib.util,json,re,secrets,sys,time,urllib.parse,uuid
from pathlib import Path
import websockets
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assessment_private',ROOT/'scripts/assessment-private.py');private=importlib.util.module_from_spec(spec);spec.loader.exec_module(private)
def signed_url(config,engine,reference,mode,voice_id):
    if mode==1 and re.fullmatch(r'[\u3400-\u9fff] [a-z]+[1-4]',reference):
        char,pron=reference.split(' ');reference=char+'{::pron{'+pron+'}}'
    now=int(time.time()); p={'secretid':config['secretId'],'timestamp':str(now),'expired':str(now+90),'nonce':str(secrets.randbelow(2**31-2)+1),'server_engine_type':engine,'voice_id':voice_id,'voice_format':'0','text_mode':'0','ref_text':('{::cmd{F_TDET=true}}' if mode in (1,8) else '')+reference,'eval_mode':str(mode),'score_coeff':'1.0','sentence_info_enabled':'0','rec_mode':'1'}
    host='soe.cloud.tencent.com/soe/api/'+config['appId'];raw=host+'?'+'&'.join(k+'='+p[k] for k in sorted(p))
    sig=base64.b64encode(hmac.new(config['secretKey'].encode(),raw.encode(),hashlib.sha1).digest()).decode()
    return 'wss://'+host+'?'+urllib.parse.urlencode(sorted(p.items()),quote_via=urllib.parse.quote)+'&signature='+urllib.parse.quote(sig,safe='')
def sanitize(raw):
    # Whitelist only assessment numbers/text. Never save remote messages, URLs, IDs or transport traces.
    if not isinstance(raw,dict): return None
    result={k:raw[k] for k in ('SuggestedScore','PronAccuracy','PronCompletion','SentenceId','PronFluency') if isinstance(raw.get(k),(int,float))}
    result['Words']=[]
    for word in raw.get('Words',[]):
        out={k:word[k] for k in ('Word','ReferenceWord','PronAccuracy','MatchTag','MemBeginTime','MemEndTime') if isinstance(word.get(k),(str,int,float))}
        if isinstance(word.get('Tone'),dict):out['Tone']={k:word['Tone'][k] for k in ('Valid','RefTone','HypothesisTone','HypTone') if isinstance(word['Tone'].get(k),(int,float,bool))}
        out['PhoneInfos']=[{k:p[k] for k in ('Phone','ReferencePhone','PronAccuracy','MatchTag') if isinstance(p.get(k),(str,int,float))} for p in word.get('PhoneInfos',[])]
        result['Words'].append(out)
    return result
async def probe(config,pcm,engine,reference,mode):
    voice_id=str(uuid.uuid4());url=signed_url(config,engine,reference,mode,voice_id)
    try:
        async with websockets.connect(url,max_size=2_000_000,open_timeout=12,close_timeout=3,proxy=None) as ws:
            sent=False;result=None
            async with asyncio.timeout(25):
                async for data in ws:
                    m=json.loads(data)
                    if m.get('voice_id')!=voice_id:return {'status':'invalid-result'}
                    if m.get('code')!=0:return {'status':'cloud-error','code':m.get('code')}
                    if not sent:await ws.send(pcm);await ws.send('{"type":"end"}');sent=True
                    if 'result' in m:
                        nxt=m['result'];nxt=json.loads(nxt) if isinstance(nxt,str) else nxt
                        if m.get('final')==1 or isinstance(nxt,dict) and nxt.get('SentenceId')==-1:result=sanitize(nxt)
                    if m.get('final')==1:return {'status':'scored' if result else 'invalid-result','result':result}
            return {'status':'incomplete'}
    except Exception:
        # Never surface transport exceptions: they may embed the signed URL.
        return {'status':'transport-error'}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pcm',required=True,type=Path);p.add_argument('--engine',choices=['16k_zh','16k_en'],default='16k_zh');p.add_argument('--reference',required=True);p.add_argument('--mode',type=int,choices=[0,1,8],default=0);p.add_argument('--output',required=True,type=Path);args=p.parse_args()
    try:
        config=private.read_configuration();pcm=args.pcm.read_bytes()
        if not 11200<=len(pcm)<=256000 or len(pcm)%2:raise ValueError()
        result=asyncio.run(probe(config,pcm,args.engine,args.reference,args.mode));config.clear()
        result.update({'engine':args.engine,'reference':args.reference,'mode':args.mode,'audio':'local synthetic TTS / 16 kHz mono signed PCM; no human recording'})
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'code':result.get('code'),'output':str(args.output)},ensure_ascii=False))
    except Exception:print('Probe failed; details redacted',file=sys.stderr);return 1
    return 0
if __name__=='__main__':raise SystemExit(main())
