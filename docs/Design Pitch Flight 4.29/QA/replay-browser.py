"""Actual Chrome rendering with deterministic RAF and native audio samples.
The fake input checks UI logic, not microphone or perceived device latency.
All browser, profile and HTTP-server resources are owned and closed in finally.
"""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[3];D=Path(__file__).resolve().parent
T=R/'TMP to delete-pitch-flight-browser';T.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
INJECT="""
window.__qaTime=0;window.__qaFrames=[];
window.requestAnimationFrame=cb=>(__qaFrames.push(cb),__qaFrames.length);
window.cancelAnimationFrame=()=>{};
window.__tick=ms=>{const n=Math.ceil(ms/16);for(let i=0;i<n;i++){__qaTime+=ms/n;const q=__qaFrames;__qaFrames=[];for(const cb of q)cb(__qaTime);}};
window.__micStarts=0;window.__micStops=0;window.__micActive=false;
window.__sample={status:'listening',mode:'pitch',ageMs:0,pitch:320,rms:.035,confidence:.99};
window.RugeAudioNative={start(){__micStarts++;__micActive=true},stop(){__micStops++;__micActive=false},read(){return JSON.stringify({...__sample,mode:__micActive?'pitch':'',status:__micActive?__sample.status:'idle'})}};
"""
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-browser-',dir=T)as profile:
  try:
   proc=subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
   f=Path(profile)/'DevToolsActivePort'
   for _ in range(100):
    if f.exists():break
    await asyncio.sleep(.1)
   port=f.read_text().splitlines()[0];page=next(p for p in json.load(urllib.request.urlopen('http://127.0.0.1:'+port+'/json'))if p['type']=='page')
   async with websockets.connect(page['webSocketDebuggerUrl'],max_size=20_000_000)as ws:
    seq=0;errors=[]
    async def call(method,params={}):
     nonlocal seq
     seq+=1;await ws.send(json.dumps({'id':seq,'method':method,'params':params}))
     while True:
      r=json.loads(await ws.recv())
      if r.get('method')=='Runtime.exceptionThrown':errors.append(r['params'])
      if r.get('id')==seq:
       assert'error'not in r,r;return r.get('result',{})
    async def ev(code):
     r=await call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True});assert'exceptionDetails'not in r,r;return r['result'].get('value')
    async def shot(name):
     x=await call('Page.captureScreenshot',{'format':'png'});(D/name).write_bytes(base64.b64decode(x['data']))
    await call('Runtime.enable');await call('Page.enable');await call('Network.enable')
    await call('Page.addScriptToEvaluateOnNewDocument',{'source':INJECT})
    url=f'http://127.0.0.1:{server.server_port}/pitch-adventure/'
    async def navigate(target=url):
     await call('Page.navigate',{'url':target})
     for _ in range(100):
      if await ev('!!window.__game'):break
      await asyncio.sleep(.05)
     await asyncio.sleep(.15)
    report={'layouts':[],'coarseControls':{},'errors':errors}
    for width,height in [(872,392),(568,320),(800,360),(640,360)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await navigate();await ev('__tick(32)')
     layout=await ev("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{let r=e.getBoundingClientRect();return{id:e.id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})})")
     assert layout['scrollWidth']<=width+1,layout
     assert all(b['x']>=-1 and b['x']+b['width']<=width+1 and b['y']>=-1 and b['bottom']<=height+1 for b in layout['buttons']),layout
     report['layouts'].append(layout);await shot(f'start-{width}x{height}.png')
     await ev('__game.beginTouch();__tick(1200)');await shot(f'flight-{width}x{height}.png')
     await ev('__game.pause()');await shot(f'pause-{width}x{height}.png')
    await call('Emulation.setDeviceMetricsOverride',{'width':872,'height':392,'deviceScaleFactor':2,'mobile':True})
    await navigate();await ev('__game.beginVoice()');await ev('__tick(1100)')
    assert await ev('__game.state.calibrating') is False
    coarse=await ev("""(()=>{let turns=0,decisions=[];while(__game.engine.snapshot().score<20&&turns++<600){const s=__game.engine.snapshot(),g=s.gates.find(g=>!g.passed),d=g.center-s.targetY;__sample.pitch=d>45?225:d< -45?440:320;decisions.push({t:turns/2,pitch:__sample.pitch,y:s.y,center:g.center,score:s.score});__tick(500);if(__game.engine.snapshot().phase==='over')break;}return{snapshot:__game.engine.snapshot(),decisions}})()""")
    report['coarseControls']=coarse
    assert coarse['snapshot']['score']>=20,coarse
    assert coarse['snapshot']['lives']==3,coarse
    await shot('voice-gate-20.png')
    await ev('__game.pause()');starts=await ev('__micStarts');before=await ev('JSON.stringify(__game.engine.snapshot())')
    await ev("dispatchEvent(new Event('ruge:resume'));__tick(2000)")
    assert await ev('__micStarts')==starts
    assert await ev('JSON.stringify(__game.engine.snapshot())')==before
    report['pauseNoAutoMic']=True
    report['idleModes']=[]
    for pitch in [320,0]:
     await ev('__game.menu();__sample.pitch=320;__sample.rms=.035;__game.beginVoice()');await ev('__tick(1100)')
     idle=await ev("(()=>{__sample.pitch="+str(pitch)+";__sample.rms="+('.035' if pitch else '0')+";let n=0;while(__game.engine.snapshot().phase!=='over'&&__game.engine.snapshot().score<12&&n++<180)__tick(500);return __game.engine.snapshot()})()")
     assert idle['phase']=='over' and idle['score']<12,idle
     report['idleModes'].append({'pitch':pitch,'snapshot':idle})
    await call('Network.setBlockedURLs',{'urls':['*/pitch-adventure/art/*','*/shared/playful-art/*']})
    await navigate(url+'?qa-fallback=1');await ev('__game.beginTouch();__tick(1500)');await shot('cold-image-fallback.png')
    report['fallbackSnapshot']=await ev('__game.engine.snapshot()')
    assert report['fallbackSnapshot']['distance']>0
    await call('Network.setBlockedURLs',{'urls':[]})
    prior=await ev('JSON.stringify(Object.entries(localStorage).sort())')
    await navigate(url+'?cover=1');await ev('__tick(500)');await shot('cover.png')
    assert await ev('JSON.stringify(Object.entries(localStorage).sort())')==prior
    assert await ev('__micStarts')==0
    assert not errors,errors
    (D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print({'layouts':len(report['layouts']),'gates':coarse['snapshot']['score'],'lives':coarse['snapshot']['lives'],'errors':len(errors)})
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
try:asyncio.run(main())
finally:
 if T.exists()and not any(T.iterdir()):T.rmdir()
