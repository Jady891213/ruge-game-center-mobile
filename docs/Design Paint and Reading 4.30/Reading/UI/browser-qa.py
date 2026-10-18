"""Real Chrome UI QA. Cloud fixtures below are SIMULATION, not pronunciation evidence."""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
R=Path(__file__).resolve().parents[4];D=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(R/'app/assets'),**k)
 def log_message(self,*a):pass
FIXTURE="""
window.__cloudUiFixture={starts:0,cancels:0};
Object.defineProperty(window,'ReadingAssessment',{configurable:true,get(){return{create({onState}){const q=window.__cloudUiFixture;return{available:()=>true,configured:()=>true,start:task=>{q.starts++;q.task=task;onState({status:'recording',level:.55});return new Promise((resolve,reject)=>{q.resolve=resolve;q.reject=reject;});},finish(){onState({status:'processing',level:0});},cancel(){q.cancels++;}};}}},set(){}});
"""
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();proc=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-reading-ui-',dir=R)as profile:
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
     await asyncio.sleep(.2);x=await call('Page.captureScreenshot',{'format':'png'});(D/name).write_bytes(base64.b64decode(x['data']))
    async def nav(url):
     await call('Page.navigate',{'url':url})
     for _ in range(100):
      if await ev('!!window.__reading'):break
      await asyncio.sleep(.05)
     await asyncio.sleep(.15)
    await call('Runtime.enable');await call('Page.enable')
    url=f'http://127.0.0.1:{server.server_port}/hanzi-typing/speaking.html'
    report={'productionLayouts':[],'fixtureOnly':True,'realAssessmentTested':False,'errors':errors}
    for width,height in [(320,568),(392,872),(568,320),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await nav(url)
     assert await ev("document.querySelector('#readingMic').disabled&&document.querySelector('#readingScore').textContent==='—'&&document.querySelector('#readingNext').disabled")
     layout=await ev("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,overflow:[...document.querySelectorAll('*')].map(e=>({id:e.id,tag:e.tagName,bottom:e.getBoundingClientRect().bottom})).filter(x=>x.bottom>innerHeight+1),charFont:getComputedStyle(document.querySelector('#readingChar')).fontSize,ring:(()=>{let r=document.querySelector('#wordRing').getBoundingClientRect();return{width:r.width,height:r.height}})(),buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{let r=e.getBoundingClientRect();return{id:e.id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})})")
     assert layout['scrollWidth']<=width+1 and layout['scrollHeight']<=height+1,layout
     assert all(b['x']>=-1 and b['x']+b['width']<=width+1 and b['y']>=-1 and b['bottom']<=height+1 for b in layout['buttons']),layout
     assert abs(layout['ring']['width']-layout['ring']['height'])<1,layout
     report['productionLayouts'].append(layout);await shot(f'unconfigured-{width}x{height}.png')
     await ev("document.querySelector('#readingSetup').click()")
     assert await ev("document.querySelector('#readingDialogText').textContent.includes('不会启动录音')")
     await shot(f'parent-{width}x{height}.png')
    # Install fixture by debugger for UI flow only. It is never in product assets.
    await call('Page.addScriptToEvaluateOnNewDocument',{'source':FIXTURE})
    await nav(url)
    await ev("document.querySelector('#readingMic').click()")
    assert await ev("__reading.state().phase==='recording'")
    await shot('SIMULATION-recording.png')
    await ev("document.querySelector('#readingMic').click()")
    assert await ev("__reading.state().phase==='processing'")
    await ev("(()=>{const t=__reading.state().task;__cloudUiFixture.resolve({SuggestedScore:85,Words:t.items.map(i=>({ReferenceWord:i.reference,MatchTag:0,PronAccuracy:85,Tone:{Valid:true,RefTone:i.tone,HypothesisTone:i.tone}}))})})()")
    await asyncio.sleep(.1)
    assert await ev("document.querySelector('#readingScore').textContent==='85分'&&!document.querySelector('#readingNext').disabled")
    await shot('SIMULATION-score-85.png')
    await ev("document.querySelector('#readingNext').click()")
    assert await ev("__reading.state().task.char==='山'&&document.querySelector('#readingScore').textContent==='—'")
    await ev("document.querySelector('#modeRead').click();document.querySelector('#readingGroup').click();document.querySelector('#readingGroups button:nth-child(4)').click()")
    assert await ev("__reading.state().task.char==='都'&&document.querySelectorAll('#readingPinyin button').length===2")
    await ev("document.querySelector('#readingPinyin button:nth-child(2)').click()")
    assert await ev("__reading.state().task.pinyin==='dū'")
    await shot('SIMULATION-read-du.png')
    report['flowFixture']='recording/finish/85 pass/next/read group/polyphonic choice';report['bird']=await ev("({loaded:document.querySelector('#readingBird').complete,width:document.querySelector('#readingBird').naturalWidth})")
    assert report['bird']['loaded'] and report['bird']['width']>0
    assert not errors,errors
    (D/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'layouts':len(report['productionLayouts']),'errors':len(errors),'cloud':'not activated; simulation only'}))
  finally:
   server.shutdown();server.server_close()
   if proc and proc.poll()is None:
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
asyncio.run(main())
