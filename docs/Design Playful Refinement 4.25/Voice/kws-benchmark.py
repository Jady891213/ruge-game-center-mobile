from pathlib import Path
import sherpa_onnx,numpy as np,json,subprocess,wave,time
ROOT=Path.cwd();D=ROOT/'app/assets/voice-model';T=ROOT/'TMP to delete-425-voice';T.mkdir(exist_ok=True);OUT=ROOT/'docs/Design Playful Refinement 4.25/Voice'
phrases=json.loads((OUT/'phrase-corpus.json').read_text())
extra=[{'phrase':x,'command':''} for x in ['今天真好玩','我们去公园','我想喝水','小兔子真可爱','大苹果','黄色的花','一二三四五','什么都不要做']]
for i,p in enumerate(phrases+extra):
 p['wave']=str(T/f'kws-{i}.wav')
 if not Path(p['wave']).exists():subprocess.run(['/usr/bin/say','-v','Tingting','-r','190','--file-format=WAVE','--data-format=LEI16@16000','-o',p['wave'],p['phrase']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 with wave.open(p['wave'],'rb') as f:p['pcm']=np.frombuffer(f.readframes(f.getnframes()),dtype=np.int16).astype(np.float32)/32768
configs=[('old4b2',OUT/'keywords-4.24.txt',4,2),('final8b4',D/'keywords.txt',8,4)]
report=[]
for name,kw,paths,blanks in configs:
 kws=sherpa_onnx.KeywordSpotter(tokens=str(D/'tokens.txt'),encoder=str(D/'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),decoder=str(D/'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),joiner=str(D/'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),keywords_file=str(kw),num_threads=2,max_active_paths=paths,keywords_score=1.5,keywords_threshold=.45,num_trailing_blanks=blanks)
 rows=[]
 for p in phrases+extra:
  stream=kws.create_stream();pcm=np.concatenate([np.zeros(4800,np.float32),p['pcm'],np.zeros(24000,np.float32)]);det=[]
  for off in range(0,len(pcm),512):
   stream.accept_waveform(16000,pcm[off:off+512])
   while kws.is_ready(stream):
    kws.decode_stream(stream);r=kws.get_result(stream)
    if r:det.append(r);kws.reset_stream(stream)
  rows.append({'phrase':p['phrase'],'expected':p['command'],'heard':det,'correct':det==[p['command']] if p['command'] else not det})
 report.append({'config':name,'maxActivePaths':paths,'trailingBlanks':blanks,'correct':sum(x['correct'] for x in rows),'total':len(rows),'rows':rows})
 (OUT/'kws-reproduction.json').write_text(json.dumps({'runtime':'sherpa-onnx 1.13.8 host arm64','syntheticVoice':'macOS Tingting,190wpm,16kHz PCM; no room noise, not child voice','results':report},ensure_ascii=False,indent=2)+'\n')
 print(name,sum(x['correct'] for x in rows),len(rows),[(x['phrase'],x['heard']) for x in rows if not x['correct']],flush=True)
