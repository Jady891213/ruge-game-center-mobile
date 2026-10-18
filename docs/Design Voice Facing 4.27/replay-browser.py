import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[2];D=R/'docs/Design Voice Facing 4.27';T=R/'TMP to delete-voice-facing-browser';T.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-facing-browser-',dir=T)as profile:
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
    await call('Runtime.enable');await call('Page.enable')
    await call('Page.addScriptToEvaluateOnNewDocument',{'source':"window.RugeAudioNative={start(){},stop(){},read(){return JSON.stringify({status:'unavailable'})}};"})
    await call('Page.navigate',{'url':f'http://127.0.0.1:{server.server_port}/voice-quest/'})
    for _ in range(100):
     if await ev('!!window.__game'):break
     await asyncio.sleep(.05)
    await ev("new Promise((resolve,reject)=>{let i=new Image;i.onload=resolve;i.onerror=reject;i.src='art/hero-directions.png'})")
    report={'layouts':[],'directions':[],'errors':errors}
    for width,height in [(320,568),(392,872),(568,320),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await ev('__game.openLevel(0,false);__game.beginTouch()');await asyncio.sleep(.1)
     layout=await ev('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,world:(()=>{let r=document.getElementById("world").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})(),playerBackground:getComputedStyle(document.getElementById("player")).backgroundImage})');assert layout['scrollWidth']<=width+1;assert 'hero-directions.png'in layout['playerBackground'];report['layouts'].append(layout)
     await shot(f'layout-{width}x{height}.png')
    await call('Emulation.setDeviceMetricsOverride',{'width':392,'height':872,'deviceScaleFactor':2,'mobile':True})
    for direction in ['up','down','left','right']:
     setup="localStorage.setItem('rugeVoiceQuestV1',JSON.stringify({schema:1,reached:18,stars:{},draft:{index:0,level:1,x:3,y:2,facing:"+json.dumps(direction)+",item:[3,2]}}))"
     injection=await call('Page.addScriptToEvaluateOnNewDocument',{'source':setup})
     await call('Page.reload')
     await asyncio.sleep(.2);await call('Page.removeScriptToEvaluateOnNewDocument',{'identifier':injection['identifier']});await ev('__game.openLevel(0);__game.beginTouch()');await asyncio.sleep(.1)
     start=await ev('({s:__game.engine.snapshot(),image:document.getElementById("player").style.backgroundPosition,facing:document.getElementById("player").dataset.facing})');assert start['facing']==direction
     await shot('facing-'+direction+'.png');await ev('__game.command("forward")');await asyncio.sleep(.12)
     moving=await ev('({s:__game.engine.snapshot(),pose:document.getElementById("player").dataset.pose,facing:document.getElementById("player").dataset.facing,visual:__game.visual})');assert moving['facing']==direction and moving['pose']!='0';await asyncio.sleep(.3)
     await ev('__game.command("backward")');await asyncio.sleep(.12);back=await ev('({facing:document.getElementById("player").dataset.facing,backward:__game.animation?.backward})');assert back['facing']==direction and back['backward'];await asyncio.sleep(.35)
     end=await ev('__game.engine.snapshot()');assert end['x']==start['s']['x']and end['y']==start['s']['y']and end['facing']==direction
     report['directions'].append({'direction':direction,'start':start,'moving':moving,'back':back,'end':end})
    assert not errors,errors;(D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print({'layouts':len(report['layouts']),'directions':len(report['directions']),'errors':len(errors)})
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
try:asyncio.run(main())
finally:
 if T.exists()and not any(T.iterdir()):T.rmdir()
