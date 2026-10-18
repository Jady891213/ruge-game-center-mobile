import asyncio,base64,json,os,signal,subprocess,tempfile,time,threading,urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
ROOT=Path.cwd();OUT=ROOT/'docs/Design Playful Refinement 4.25/Radar';TMP=ROOT/'TMP to delete-425-radar';TMP.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT/'app/assets'),**k)
 def log_message(self,*a):pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();process=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-radar-chrome-',dir=TMP) as profile:
  try:
   process=subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
   f=Path(profile)/'DevToolsActivePort'
   for _ in range(100):
    if f.exists():break
    await asyncio.sleep(.1)
   port=f.read_text().splitlines()[0];tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'));wsurl=next(t for t in tabs if t.get('type')=='page')['webSocketDebuggerUrl']
   async with websockets.connect(wsurl,max_size=50_000_000) as ws:
    seq=0;errors=[]
    async def call(method,params={}):
     nonlocal seq
     seq+=1;await ws.send(json.dumps({'id':seq,'method':method,'params':params}))
     while True:
      r=json.loads(await ws.recv())
      if r.get('method') in ['Runtime.exceptionThrown','Network.loadingFailed']:errors.append(r['params'])
      if r.get('id')==seq:
       if 'error' in r:raise RuntimeError(r['error'])
       return r.get('result',{})
    async def evaluate(code):
     r=await call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
     if 'exceptionDetails' in r:raise RuntimeError(r['exceptionDetails'])
     return r['result'].get('value')
    await call('Runtime.enable');await call('Page.enable');await call('Network.enable')
    await call('Page.addScriptToEvaluateOnNewDocument',{'source':'''window.requestAnimationFrame=()=>0;window.__pose={available:true,heading:350,elevation:0,age:0,generation:1,source:'browser-replay'};window.RugeOrientation={coordinateSystem(){return 'camera-relative-360-v1'},sample(){return JSON.stringify(window.__pose)}};window.__time=0;'''} )
    async def nav():
     await call('Page.navigate',{'url':f'http://127.0.0.1:{server.server_port}/pocket-radar/'})
     for _ in range(80):
      if await evaluate('!!window.__game'):return
      await asyncio.sleep(.05)
     raise RuntimeError(('page not ready',errors,await evaluate('document.documentElement.outerHTML.slice(0,2000)')))
    await nav()
    await evaluate("localStorage.setItem('rugePocketRadarV1','legacy-unchanged');localStorage.setItem('otherGame','keep');")
    report={'rules':{},'layouts':[],'errors':errors}
    for kind in ['safe','space']:
     await evaluate(f"__pose.heading=350;__pose.elevation=0;__game.start('{kind}',20);window.__base=350;window.__time=0;")
     await evaluate('window.aim=(heading,elevation)=>{__pose.heading=((heading+__base)%360+360)%360;__pose.elevation=elevation;};window.step=(n=1)=>{for(let i=0;i<n;i++)__game.step(.05,__time+=50);};window.aimTarget=()=>{const t=__game.state().target;aim(t.heading,t.elevation);};aimTarget();step(59);')
     before=await evaluate('JSON.parse(JSON.stringify(__game.state()))');assert before['cleared']==0 and before['hold']<3
     await evaluate('step();');after=await evaluate('JSON.parse(JSON.stringify(__game.state()))');assert after['cleared']==1 and after['round']==2 and after['remaining']>68
     # Back-facing signal is measured through the same page/adapter, not a duplicate rule.
     await evaluate('var t=__game.state().target;aim(t.heading+180,-t.elevation);step();')
     far=await evaluate('__game.core.signal(__game.state())');assert far<.001
     await evaluate('aimTarget();step(30);__game.pause();window.dispatchEvent(new Event("ruge:resume"));');assert await evaluate('__game.isPaused()') is True
     assert await evaluate('__game.state().hold')==0
     await evaluate('__game.resume();window.__base=__pose.heading-__game.state().heading;aimTarget();step(30);__pose.age=751;step(20);')
     stale=await evaluate('({hold:__game.state().hold,round:__game.state().round,remaining:__game.state().remaining})');assert stale['hold']==0 and stale['round']==2
     frozen=await evaluate('__game.state().remaining');await evaluate('step(20)');assert await evaluate('__game.state().remaining')==frozen
     await evaluate('__pose.age=0;__pose.generation++;step();');assert await evaluate('__game.isPaused()') is True
     await evaluate('__game.resume();window.__base=__pose.heading-__game.state().heading;')
     if kind=='space':
      await evaluate('var t=__game.state().target;aim(t.heading,t.elevation+50);step(70)');assert await evaluate('__game.state().cleared')==1
     await evaluate('aimTarget();step(62)');assert await evaluate('__game.state().cleared')==2
     await evaluate('__game.state().remaining=.02;aimTarget();step();');assert await evaluate('__game.state().finished') is True
     assert await evaluate('__game.state().cleared')==2
     report['rules'][kind]={'before3s':before,'after3s':after,'backFacingSignal':far,'stale':stale,'pauseExplicit':True,'generationRestartPaused':True,'pitchRequired':kind=='space','timeoutCleared':2}
    # Crossing 359/0 in actual adapter: anchored at 350 -> physical 349,350,351 => relative359,0,1.
    await evaluate("__pose.generation=1;__pose.heading=350;__pose.elevation=0;__game.start('safe',50);__pose.heading=349;step();window.__cross=[__game.state().heading];__pose.heading=350;step();__cross.push(__game.state().heading);__pose.heading=351;step();__cross.push(__game.state().heading);")
    report['cross360']=await evaluate('__cross');assert report['cross360']==[359,0,1]
    for width,height in [(320,568),(392,872),(568,320),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     for view in ['menu','safe','space']:
      if view=='menu':await evaluate('__game.menu()')
      else:await evaluate(f"__game.start('{view}',3);__game.setMode('touch');__game.draw();")
      await asyncio.sleep(.08)
      layout=await evaluate('''(()=>{const b=document.getElementById('boardFrame').getBoundingClientRect();return{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight,board:{x:b.x,y:b.y,width:b.width,height:b.height},controls:Array.from(document.querySelectorAll('button,input')).filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height).map(n=>{const r=n.getBoundingClientRect();return{id:n.id,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})}})()''')
      layout.update({'viewport':[width,height],'view':view});report['layouts'].append(layout)
      shot=await call('Page.captureScreenshot',{'format':'png'});(OUT/f'{view}-{width}x{height}.png').write_bytes(base64.b64decode(shot['data']))
      assert layout['scrollWidth']<=width+1,(width,height,view,layout)
      assert all(c['bottom']<=height+1 for c in layout['controls']),(width,height,view,layout)
    report['preserved']=await evaluate("({legacy:localStorage.getItem('rugePocketRadarV1'),other:localStorage.getItem('otherGame')})");assert report['preserved']=={'legacy':'legacy-unchanged','other':'keep'}
    # Follow the real secondary anchor, then play the unchanged legacy first lock.
    await evaluate("__game.menu();document.querySelector('a.oldLink').click();")
    for _ in range(100):
     if await evaluate("location.pathname.endsWith('/legacy.html')&&!!window.__game?.core?.createSafe"):break
     await asyncio.sleep(.05)
    else:raise RuntimeError('legacy anchor did not navigate')
    report['legacyEntry']={'levelButtons':await evaluate("document.getElementById('levels').children.length")}
    assert report['legacyEntry']['levelButtons']==18
    await evaluate("__game.start(0,'safe');__game.setMode('touch');__game.setAngle(-32);for(let i=0;i<25;i++)__game.step(.05,100+i*50);")
    report['legacyEntry']['firstLockWon']=await evaluate("__game.state().finished&&document.getElementById('win').hidden===false")
    assert report['legacyEntry']['firstLockWon']
    shot=await call('Page.captureScreenshot',{'format':'png'});(OUT/'legacy-first-lock.png').write_bytes(base64.b64decode(shot['data']))
    await evaluate("__game.menu();document.querySelector('#menu a').click();")
    for _ in range(100):
     if await evaluate("location.pathname.endsWith('/index.html')&&!!window.RadarChallenge&&window.__game?.core===RadarChallenge"):break
     await asyncio.sleep(.05)
    else:raise RuntimeError('return from legacy failed')
    report['legacyEntry']['returnedToChallenge']=True
    (OUT/'browser-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));assert not errors,errors
    print(json.dumps({'rules':list(report['rules']),'cross360':report['cross360'],'layouts':len(report['layouts']),'errors':len(errors)},ensure_ascii=False))
  finally:
   server.shutdown();server.server_close()
   if process and process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
asyncio.run(main())
