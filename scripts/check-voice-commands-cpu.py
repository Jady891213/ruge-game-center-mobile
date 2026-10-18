#!/usr/bin/env python3
"""Run the bundled real KWS model on local macOS TTS/standard synthetic audio.
No cloud calls, no dependency install, no microphone. Temporary audio is removed.
Supply an isolated official sherpa-onnx 1.13.8 runtime directory via --runtime-dir.
"""
import argparse,concurrent.futures,hashlib,json,subprocess,sys,tempfile,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NEGATIVE=['今天下雨了','我想吃香蕉','这是我的电脑','我们回去吃饭','小兔正在睡觉','大门是蓝色的','前面的花很漂亮','后面的树很高','老师今天没来','不能这样做','向日葵开花了','别的地方有小鸟','我最喜欢苹果','哥哥在看书','妹妹在玩积木','你好小朋友','不要跳','不要前进','不要后退','不许开门']
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--keywords',type=Path,default=ROOT/'app/assets/voice-model/keywords.txt');p.add_argument('--trailing-blanks',type=int,default=8);p.add_argument('--voice',default='Tingting (中文（中国大陆）)');p.add_argument('--standard-audio',action='store_true');args=p.parse_args();sys.path.insert(0,str(args.runtime_dir));import numpy as np;import sherpa_onnx
 if sherpa_onnx.__version__!='1.13.8':raise SystemExit('Use the pinned 1.13.8 runtime')
 manifest=json.loads((ROOT/'app/assets/voice-model/commands.json').read_text());cases=[{'expected':c['id'],'text':q['text']}for c in manifest['commands']for q in c['phrases']]+[{'expected':'','text':t}for t in NEGATIVE]
 model=ROOT/'app/assets/voice-model';kws=sherpa_onnx.KeywordSpotter(tokens=str(model/'tokens.txt'),encoder=str(model/'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),decoder=str(model/'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),joiner=str(model/'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),keywords_file=str(args.keywords),num_threads=2,max_active_paths=8,keywords_score=1.5,keywords_threshold=.45,num_trailing_blanks=args.trailing_blanks)
 def infer(samples,stream=None):
  s=stream if stream is not None else kws.create_stream()
  if stream is None:s.accept_waveform(16000,np.zeros(4800,dtype=np.float32))
  samples=np.concatenate([samples,np.zeros(16000,dtype=np.float32)]);heard=[];raw=[]
  for i in range(0,len(samples),512):
   s.accept_waveform(16000,samples[i:i+512])
   while kws.is_ready(s):
    kws.decode_stream(s);value=kws.get_result(s)
    if value:
     raw.append(value)
     if value!='__ignore__':heard.append(value)
     kws.reset_stream(s)
  return heard,raw
 results=[]
 with tempfile.TemporaryDirectory(prefix='TMP to delete-command-CPU-',dir=ROOT)as work:
  work=Path(work)
  def synth(c):
   name=hashlib.sha256(c['text'].encode()).hexdigest()[:12];aiff=work/(name+'.aiff');wav=work/(name+'.wav');subprocess.run(['say','-v',args.voice,'-r','150','-o',str(aiff),c['text']],check=True,capture_output=True);subprocess.run(['ffmpeg','-v','error','-y','-i',str(aiff),'-ar','16000','-ac','1',str(wav)],check=True,capture_output=True);return wav
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:files=list(ex.map(synth,cases))
  for c,file in zip(cases,files):
   with wave.open(str(file),'rb')as f:samples=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
   heard,raw=infer(samples);results.append({**c,'heard':heard,'raw':raw,'pass':heard==([c['expected']]if c['expected']else[])})
  noises={'silence':np.zeros(48000,dtype=np.float32),'white-noise':np.random.default_rng(432).normal(0,.03,48000).astype(np.float32),'pink-room-noise':np.convolve(np.random.default_rng(433).normal(0,.05,48000),np.ones(12)/12,mode='same').astype(np.float32)}
  for name,samples in noises.items():heard,raw=infer(samples);results.append({'expected':'','text':name,'heard':heard,'raw':raw,'pass':not heard})
  if args.standard_audio:
   source=ROOT/'docs/Design Offline Voice and Commands 4.32/Commands/Standard Audio';standard=json.loads((source/'sources.json').read_text());stream=kws.create_stream();stream.accept_waveform(16000,np.zeros(4800,dtype=np.float32))
   for c in standard['clips']:
    wav=work/'standard.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(source/c['file']),'-ar','16000','-ac','1',str(wav)],check=True,capture_output=True)
    with wave.open(str(wav),'rb')as f:samples=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
    heard,raw=infer(samples,stream);results.append({**c,'kind':'natural same-stream standard','heard':heard,'raw':raw,'pass':heard==([c['expected']]if c['expected']else[])})
 summary={c['id']:{'passed':sum(r['pass']for r in results if r['expected']==c['id']and r.get('kind')is None),'total':sum(r['expected']==c['id']and r.get('kind')is None for r in results)}for c in manifest['commands']}
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps({'runtime':sherpa_onnx.__version__,'backend':'CPU, actual bundled model; synthetic voice does not establish child accuracy','trailingBlanks':args.trailing_blanks,'positiveByAction':summary,'results':results},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':sum(r['pass']for r in results),'total':len(results),'output':str(args.output)},ensure_ascii=False))
if __name__=='__main__':main()
