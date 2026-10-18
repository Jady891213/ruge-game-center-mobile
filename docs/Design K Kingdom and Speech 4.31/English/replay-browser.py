"""Real Chrome UI replay; cloud responses are explicit fixtures, not pronunciation proof.
Own Chrome process/profile/HTTP server are closed in finally. No device mutation.
"""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[3];D=Path(__file__).resolve().parent
FIXTURE=b"window.__q={starts:0,cancels:0};window.GameAssessment={create({onState}){return{configured:()=>true,available:()=>true,start(task){__q.starts++;__q.task=task;onState({status:'recording',level:.5});return new Promise((resolve,reject)=>{__q.resolve=resolve;__q.reject=reject});},finish(){__q.finished=true;},cancel(){__q.cancels++;}}}};"
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
 def do_GET(self):
  if self.path=='/shared/assessment.js':self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(FIXTURE)
  else:super().do_GET()
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-k-browser-',dir=R)as profile:
  try:
   proc=subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
   f=Path(profile)/'DevToolsActivePort'
   for _ in range(100):
    if f.exists():break
    await asyncio.sleep(.1)
   port=f.read_text().splitlines()[0];page=next(p for p in json.load(urllib.request.urlopen('http://127.0.0.1:'+port+'/json'))if p['type']=='page')
   async with websockets.connect(page['webSocketDebuggerUrl'],max_size=20000000)as ws:
    seq=0;errors=[]
    async def call(method,params={}):
     nonlocal seq
     seq+=1;await ws.send(json.dumps({'id':seq,'method':method,'params':params}))
     while True:
      r=json.loads(await ws.recv())
      if r.get('method')=='Runtime.exceptionThrown':errors.append(r['params'])
      if r.get('id')==seq:assert'error'not in r,r;return r.get('result',{})
    async def ev(code):
     r=await call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True});assert'exceptionDetails'not in r,r;return r['result'].get('value')
    async def shot(name):
     x=await call('Page.captureScreenshot',{'format':'png'});(D/name).write_bytes(base64.b64decode(x['data']))
    async def spell():
     await ev("(()=>{for(const c of __english.state().word){const b=[...document.querySelectorAll('#letters button')].find(b=>!b.disabled&&b.textContent===c);if(!b)throw Error('missing letter '+c);b.click();}document.getElementById('submit').click()})()")
    async def pass_word():
     await ev("window.__pending=__english.record();__q.resolve({SuggestedScore:92,Words:[{Word:__q.task.reference,ReferenceWord:__q.task.reference+'_0',MatchTag:0,PronAccuracy:92}]});window.__pending")
    async def layout():
     return await ev("({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{let r=e.getBoundingClientRect();return{id:e.id,text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}}),images:[...document.images].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0}))})")
    await call('Runtime.enable');await call('Page.enable');report={'fixturesOnly':True,'layouts':[],'levels':[],'errors':errors}
    url=f'http://127.0.0.1:{server.server_port}/english-k/'
    for width,height in [(872,392),(568,320),(800,360),(640,360)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await call('Page.navigate',{'url':url})
     for _ in range(100):
      if await ev('!!window.__english'):break
      await asyncio.sleep(.05)
     await ev('__english.start(9)');await asyncio.sleep(.15)
     info=await layout();assert info['scroll']<=width+1,info
     assert all(b['x']>=-1 and b['x']+b['w']<=width+1 and b['y']>=-1 and b['bottom']<=height+1 for b in info['buttons']),info
     report['layouts'].append(info);await shot(f'spell-{width}x{height}.png');await spell();info=await layout();assert all(b['bottom']<=height+1 for b in info['buttons']),info;await shot(f'read-{width}x{height}.png');await pass_word();await asyncio.sleep(.48);await shot(f'magic-{width}x{height}.png');await ev('__english.pause()');await shot(f'pause-{width}x{height}.png')
    await ev('__english.resume()')
    for level in range(1,21):
     await ev('__english.start('+str(level)+')');words=await ev('__english.state().words')
     for word in words:
      await spell();assert await ev('__english.state().phase')=='read';await pass_word();assert await ev('__english.state().phase')=='won-word';await ev("document.getElementById('submit').click()")
     s=await ev('__english.state()');assert s['phase']=='complete',s;assert s['hearts']==5;report['levels'].append(s)
    assert await ev('__english.state().save.unlocked')==20
    await ev('__english.start(5)');await spell();await ev("window.__pending=__english.record();dispatchEvent(new Event('ruge:pause'));__q.resolve({SuggestedScore:99,Words:[{Word:'apple',MatchTag:0,PronAccuracy:99}]});window.__pending")
    assert await ev('__english.state().paused')is True;assert await ev('__english.state().phase')=='read';assert await ev('__english.state().hearts')==5;report['lateResponseIgnored']=True
    await ev('__english.resume()')
    for _ in range(5):await ev("window.__pending=__english.record();__q.resolve({SuggestedScore:25,Words:[{Word:'apple',MatchTag:0,PronAccuracy:25}]});window.__pending")
    assert await ev('__english.state().phase')=='lost';await ev("document.getElementById('continue').click()");assert await ev('__english.state().hearts')==5;assert await ev('__english.state().score')==0;report['fiveHeartRetry']=True
    await call('Page.navigate',{'url':url+'?cover=1'});await asyncio.sleep(.25);await shot('cover.png');assert not errors,errors
    (D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print({'layouts':len(report['layouts']),'levels':len(report['levels']),'errors':len(errors)})
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
asyncio.run(main())
