"""Real Chrome viewport and actual game click checks. Own process/server closed in finally."""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[3];D=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-paint-browser-',dir=R)as profile:
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
     await asyncio.sleep(.65) # Wait for the real coloring/pop animation and SVG image paint.
     x=await call('Page.captureScreenshot',{'format':'png'});(D/name).write_bytes(base64.b64decode(x['data']))
    await call('Runtime.enable');await call('Page.enable')
    url=f'http://127.0.0.1:{server.server_port}/paint-mixing/'
    report={'layouts':[],'errors':errors}
    for width,height in [(320,568),(392,872),(568,320),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await call('Page.navigate',{'url':url})
     for _ in range(100):
      if await ev('!!window.__game'):break
      await asyncio.sleep(.05)
     await ev('__game.start(8)');await asyncio.sleep(.3)
     layout=await ev("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,wheel:(()=>{let r=document.querySelector('.wheel-disc').getBoundingClientRect();return{width:r.width,height:r.height}})(),buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{let r=e.getBoundingClientRect();return{id:e.id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})})")
     assert layout['scrollWidth']<=width+1 and layout['scrollHeight']<=height+1,layout
     assert all(b['x']>=-1 and b['x']+b['width']<=width+1 and b['y']>=-1 and b['bottom']<=height+1 for b in layout['buttons']),layout
     assert abs(layout['wheel']['width']-layout['wheel']['height'])<1,layout
     report['layouts'].append(layout);await shot(f'empty-{width}x{height}.png')
     await ev("document.querySelector('[data-color=red]').click();document.querySelector('[data-color=yellow]').click()")
     assert await ev("document.querySelector('#colorMap polyline')!==null")
     await shot(f'mixing-{width}x{height}.png')
     await ev("document.querySelector('[data-color=yellow]').click();document.querySelector('#paint').click()")
     assert await ev('__game.state().accepted')
     await shot(f'painted-{width}x{height}.png')
    # Actual fourteen recipes, including blue-yellow ratios and white tints.
    report['orders']=await ev("(()=>{let n=0;PaintMixing.LEVELS.forEach((l,i)=>{__game.start(i);for(const t of l.targets){for(const c of t.recipe)document.querySelector('[data-color='+c+']').click();document.querySelector('#paint').click();if(!__game.state().accepted)throw Error('not accepted '+i);n++;if(__game.state().order<l.targets.length-1)document.querySelector('#next').click();}});return n})()")
    assert report['orders']==14
    await ev('__game.start(9)');await ev("document.querySelector('[data-color=blue]').click();document.querySelector('[data-color=white]').click();document.querySelector('[data-color=white]').click()")
    await shot('white-tint.png')
    report['imageLoaded']=await ev("new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({w:i.naturalWidth,h:i.naturalHeight});i.onerror=()=>resolve(false);i.src='art/paint-friends.png'})")
    assert report['imageLoaded']=={'w':1774,'h':887}
    assert not errors,errors
    (D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
asyncio.run(main())
