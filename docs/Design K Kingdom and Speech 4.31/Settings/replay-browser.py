"""Real Chrome settings UI replay; quota responses are explicit contract fixtures, not real balance proof.
Own Chrome process/profile/HTTP server are closed in finally. No device mutation.
"""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[3];D=Path(__file__).resolve().parent
INJECT="""window.__settingsFixture={services:[{id:'tencent-soe',name:'腾讯云口语评测',status:'unsupported',configured:true,quota:null,updatedAt:null,error:'quota-console-only'},{id:'minimax-token-plan',name:'MiniMax 共享套餐',status:'ready',configured:true,quota:{remaining:99,total:100,unit:'%',expiresAt:Date.now()+7200000,weeklyRemaining:2,weeklyTotal:100,weeklyExpiresAt:Date.now()+86400000,windowLabel:'5小时窗口剩余',weeklyLabel:'本周剩余',expiresLabel:'重置'},updatedAt:Date.now(),error:''}],refreshes:[],consoles:[]};window.RugeServices={read:()=>JSON.stringify({version:'4.31',services:__settingsFixture.services}),refresh:id=>{__settingsFixture.refreshes.push(id);let s=__settingsFixture.services.find(x=>x.id===id);s.status='loading';setTimeout(()=>{s.status='ready';s.updatedAt=Date.now();s.quota.remaining=98},600);return true;},openConsole:id=>{__settingsFixture.consoles.push(id);return true;}};"""
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-settings-browser-',dir=R)as profile:
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
    await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{'source':INJECT});report={'fixturesOnly':True,'layouts':[],'errors':errors}
    url=f'http://127.0.0.1:{server.server_port}/settings/'
    for width,height in [(392,872),(320,568),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await call('Page.navigate',{'url':url})
     for _ in range(100):
      if await ev('!!window.__settings'):break
      await asyncio.sleep(.05)
     await asyncio.sleep(.15)
     layout=await ev("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,content:document.getElementById('content').getBoundingClientRect().toJSON(),header:document.querySelector('header').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('button')].map(e=>{let r=e.getBoundingClientRect();return{id:e.id,x:r.x,w:r.width}})})")
     assert layout['scrollWidth']<=width+1,layout
     assert all(b['x']>=-1 and b['x']+b['w']<=width+1 for b in layout['buttons']),layout
     await shot(f'settings-{width}x{height}.png')
     before=layout['header']['top'];await ev("document.getElementById('content').scrollTop=10000");await asyncio.sleep(.1)
     assert await ev("document.querySelector('header').getBoundingClientRect().top")==before
     assert await ev("document.documentElement.scrollTop")==0
     layout['headerFixedOnScroll']=True;report['layouts'].append(layout);await shot(f'settings-scrolled-{width}x{height}.png')
     await ev("document.querySelector('[data-service=\"minimax-token-plan\"] .refresh').click()")
     assert await ev('__settings.state().pending.length')==1
     await asyncio.sleep(1.4)
     assert await ev('__settings.state().pending.length')==0
     assert await ev('__settings.state().model.services[1].quota.remaining')==98
     await ev("document.querySelector('[data-service=\"tencent-soe\"] .console').click()")
     assert await ev('__settingsFixture.consoles[0]')=='tencent-soe'
     soundBefore=await ev("document.getElementById('sound').getAttribute('aria-checked')")
     await ev("document.getElementById('sound').click();document.getElementById('vibration').click();document.getElementById('awake').click()")
     assert await ev("document.getElementById('sound').getAttribute('aria-checked')")!=soundBefore
    await ev("__settingsFixture.services[1].quota.expiresAt=Date.now()+200;__settings.read()")
    refreshesBefore=await ev('__settingsFixture.refreshes.length');await asyncio.sleep(.5)
    assert await ev('__settings.state().model.services[1].status')=='stale'
    assert await ev('__settings.state().model.services[1].quota')is None
    assert await ev('__settingsFixture.refreshes.length')==refreshesBefore
    report['expiresLocallyWithoutNetworkRefresh']=True
    assert not errors,errors
    (D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print({'layouts':len(report['layouts']),'errors':len(errors),'fixedHeader':True,'asyncRefresh':True})
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
asyncio.run(main())
