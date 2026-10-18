#!/usr/bin/env python3
"""Generate checked-in speech demonstrations; credentials stay in .local-voice.

No synthesis requests happen in the APK. Only allowlisted official HTTPS hosts
receive the credential, redirects are disabled, and errors never print bodies.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'app/assets/shared/demo-audio'
REPORT = ROOT / 'docs/Design K Kingdom and Speech 4.31/Demo TTS'
PRIVATE = ROOT / '.local-voice'
LEDGER = PRIVATE / 'demo-tts-call-count.json'
ENDPOINTS = ('https://api.minimax.cn/v1/t2a_v2', 'https://api.minimax.io/v1/t2a_v2')
MODEL = 'speech-2.8-hd'
INITIALS = {'b':'bo1','sh':'shi1','d':'de1','r':'ri1','h':'he1','s':'si1','x':'xi1','t':'te1','l':'le1','i':'yi1'}

class SafeFailure(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SafeFailure('redirect-refused')

def tasks():
    code = """
const fs=require('node:fs'),vm=require('node:vm');const ctx={window:{}};
vm.createContext(ctx);for(const p of ['app/assets/shared/hanzi-vocabulary.js','app/assets/hanzi-typing/reading-core.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
const V=ctx.window.HanziVocabulary,C=ctx.window.ReadingCore,out=[];
for(const [ch,readings]of Object.entries(V.pinyin))for(const p of readings)out.push(C.task(ch,'read',p));
for(const ch of C.INTRO)out.push(C.task(ch,'spell'));
process.stdout.write(JSON.stringify(out));
"""
    records = json.loads(subprocess.run(['node','-e',code], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    output = []
    for word in 'apple banana bed computer dad mom brother me sister'.split():
        output.append({'key':'en:'+word,'text':word,'voice':'English_expressive_narrator','language':'English','kind':'word','label':word})
    for t in records:
        if t['mode'] == 'read':
            # A tone override also disambiguates the non-default polyphonic reading.
            p = t['items'][0]['reference']
            if t['evalMode'] == 0:
                # de/me/zhe/men are neutral; spell out fifth tone for synthesis.
                p = {'的':'de5','么':'me5','着':'zhe5','了':'le5','们':'men5','地':'de5'}.get(t['char'])
            text = '('+p+')' if p else t['char']
        else:
            # School 呼读音 (bo/sh(i)/de...) rather than English letter names.
            sounds = [INITIALS.get(i['reference'],i['reference']) for i in t['items']]
            text = '<#0.45#>'.join('('+p+')' for p in sounds)
        output.append({'key':t['id'],'text':text,'voice':'male-qn-qingse','language':'Chinese','kind':t['mode'],'label':t['char']+' '+t['pinyin']})
    return output

def read_key():
    path = PRIVATE / 'minimax-tts.env'
    if not path.exists(): raise SafeFailure('private-config-missing')
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#') or '=' not in line: continue
        k,v = line.split('=',1);v=v.strip().strip('"\'')
        if v: values[k.strip()] = v
    for key in ('MINIMAX_API_KEY','MINIMAX_TTS_API_KEY','MINIMAX_KEY'):
        if values.get(key): return values[key]
    if len(values)==1: return next(iter(values.values()))
    raise SafeFailure('private-key-not-found')

def request_audio(task, key, endpoint):
    count = json.loads(LEDGER.read_text()) if LEDGER.exists() else {'calls':0}
    if count['calls'] >= 120: raise SafeFailure('call-budget-exhausted')
    count['calls'] += 1
    LEDGER.write_text(json.dumps(count));os.chmod(LEDGER,0o600)
    body = {'model':MODEL,'text':task['text'],'stream':False,'output_format':'hex',
            'language_boost':task['language'],'voice_setting':{'voice_id':task['voice'],'speed':0.85,'vol':1,'pitch':0},
            'audio_setting':{'sample_rate':32000,'bitrate':128000,'format':'mp3','channel':1}}
    req = urllib.request.Request(endpoint,data=json.dumps(body,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req,timeout=55) as response:
            raw=response.read(5_000_001)
    except urllib.error.HTTPError as exc:
        # No exception object or response body is logged; both can contain secrets.
        try: code=json.loads(exc.read(100000)).get('base_resp',{}).get('status_code')
        except Exception: code=None
        if exc.code in (401,403) or code==1004: raise SafeFailure('authentication-failed') from None
        if code in (1008,2056): raise SafeFailure('quota-exhausted') from None
        if exc.code==429 or code in (1002,1039,2045): raise SafeFailure('rate-limit') from None
        raise SafeFailure('http-'+str(exc.code)) from None
    except SafeFailure: raise
    except Exception: raise SafeFailure('connection-failed') from None
    if len(raw)>5_000_000: raise SafeFailure('response-too-large')
    try: value=json.loads(raw)
    except Exception: raise SafeFailure('invalid-json') from None
    code=value.get('base_resp',{}).get('status_code')
    if code!=0:
        if code==1004: raise SafeFailure('authentication-failed')
        if code in (1008,2056): raise SafeFailure('quota-exhausted')
        if code in (1002,1039,2045): raise SafeFailure('rate-limit')
        raise SafeFailure('service-code-'+str(code))
    try:
        data=value['data'];audio=bytes.fromhex(data['audio'])
        if data.get('status')!=2 or len(audio)<1000: raise ValueError()
    except Exception: raise SafeFailure('invalid-audio') from None
    meta=value.get('extra_info') or {}
    return audio,{k:meta[k] for k in ('audio_length','audio_sample_rate','audio_size','audio_format','usage_characters') if k in meta}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--all',action='store_true',help='Generate all missing demos, after checking the samples')
    parser.add_argument('--only',nargs='+',help='Exact task keys; defaults to apple and two split samples')
    parser.add_argument('--list',action='store_true',help='List non-secret tasks without making requests')
    parser.add_argument('--interval',type=float,default=3,help='Seconds between actual requests (minimum 3)')
    args=parser.parse_args();items=tasks()
    if args.list:
        print(json.dumps(items,ensure_ascii=False,indent=2));return
    keys=None if args.all else set(args.only or ['en:apple','spell:班:bān','spell:山:shān'])
    if keys and keys-set(t['key'] for t in items): raise SafeFailure('unknown-task')
    selected=[t for t in items if keys is None or t['key'] in keys]
    DEST.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
    manifest_path=DEST/'manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'schema':1,'provider':'MiniMax','model':MODEL,'clips':{}}
    key=read_key();endpoint=ENDPOINTS[0]
    state_path=PRIVATE/'demo-tts-endpoint.txt'
    if state_path.exists() and state_path.read_text().strip() in ENDPOINTS: endpoint=state_path.read_text().strip()
    requested=False
    for task in selected:
        fingerprint=hashlib.sha256(json.dumps(task,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        filename=hashlib.sha256(task['key'].encode()).hexdigest()[:18]+'.mp3'
        cached=manifest['clips'].get(task['key'])
        if cached and cached.get('requestSha256')==fingerprint and (DEST/filename).exists():
            print('cached '+task['key'],flush=True);continue
        if requested: time.sleep(max(3,args.interval))
        requested=True
        try: audio,meta=request_audio(task,key,endpoint)
        except SafeFailure as exc:
            if str(exc)=='authentication-failed' and endpoint==ENDPOINTS[0] and not state_path.exists():
                endpoint=ENDPOINTS[1];audio,meta=request_audio(task,key,endpoint)
            else: raise
        state_path.write_text(endpoint);os.chmod(state_path,0o600)
        path=DEST/filename;path.write_bytes(audio)
        verified=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],capture_output=True,text=True)
        try: duration=float(verified.stdout.strip());assert verified.returncode==0 and .2<duration<20
        except Exception: path.unlink(missing_ok=True);raise SafeFailure('audio-decode-check-failed') from None
        manifest['clips'][task['key']]={**task,'file':filename,'sha256':hashlib.sha256(audio).hexdigest(),'requestSha256':fingerprint,'duration':round(duration,3),'metadata':meta}
        manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        runtime={k:v['file'] for k,v in manifest['clips'].items()}
        (DEST/'manifest.js').write_text('window.RugeDemoClips=Object.freeze('+json.dumps(runtime,ensure_ascii=False,separators=(',',':'))+');\n')
        print('generated '+task['key']+' '+str(round(duration,2))+'s',flush=True)
    (REPORT/'source.json').write_text(json.dumps({'provider':'MiniMax','model':MODEL,'endpoint':endpoint,'references':['https://platform.minimax.cn/docs/api-reference/speech-t2a-http','https://platform.minimax.io/docs/api-reference/speech-t2a-http'],'clips':len(manifest['clips']),'cloudSecretsPackaged':False,'runtimeNetworkRequired':False,'notes':['Split demos use Mandarin classroom 呼读音 followed by the final and combined syllable, with explicit tone-number pronunciation.','Samples require listening review; synthesis is not a child pronunciation score.']},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    try: main()
    except SafeFailure as exc: print('STOP '+str(exc),file=sys.stderr);sys.exit(2)
    except Exception: print('STOP local-generation-error',file=sys.stderr);sys.exit(2)
