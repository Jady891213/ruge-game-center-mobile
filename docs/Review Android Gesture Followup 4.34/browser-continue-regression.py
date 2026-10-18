#!/usr/bin/env python3
"""Real browser pointer regression for shared pause continue; never modifies source."""
import asyncio,base64,functools,http.server,importlib.util,json,subprocess,threading,time,urllib.request,tempfile
from pathlib import Path
import websockets
ROOT=Path(__file__).resolve().parents[1] if 'TMP to delete' in str(Path(__file__).parent) else Path(__file__).resolve().parents[2]
# The permanent report directory is two parents below the project.
if not (ROOT/'app/assets').exists():ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/Review Android Gesture Followup 4.34';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('covers',ROOT/'scripts/render-action-covers.py');covers=importlib.util.module_from_spec(spec);spec.loader.exec_module(covers)
GAMES=['english-k','animal-balance','hat-trick','hat-trick/memory.html','pitch-adventure','voice-quest','pocket-radar','camera-color','forest-juice','code-breaker','pipe-flow','gravity-maze','number-merge','tilt-star-box','hanzi-puzzle','paint-mixing','hanzi-typing','hanzi-typing/speaking.html','hanzi-library','flappy-bird','frog-pond']
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class CDP:
 def __init__(self,ws):self.ws=ws;self.i=0;self.exceptions=[]
 async def call(self,m,p={}):
  self.i+=1;n=self.i;await self.ws.send(json.dumps(dict(id=n,method=m,params=p)))
  while True:
   r=json.loads(await self.ws.recv())
   if r.get('method')=='Runtime.exceptionThrown':self.exceptions.append(r['params'])
   if r.get('id')==n:
    if 'error'in r:raise RuntimeError(r['error'])
    return r.get('result',{})
 async def ev(self,s):
  r=await self.call('Runtime.evaluate',dict(expression=s,returnByValue=True,awaitPromise=True))
  if 'exceptionDetails'in r:raise RuntimeError(r['exceptionDetails'])
  return r.get('result',{}).get('value')
 async def shot(self,name):
  r=await self.call('Page.captureScreenshot',{'format':'png'});OUT.joinpath(name).write_bytes(base64.b64decode(r['data']))
 async def load(self,url):
  await self.call('Page.navigate',{'url':url});await asyncio.sleep(.2);await self.ev("new Promise(r=>document.readyState==='complete'?r():addEventListener('load',r,{once:true}))")
 async def pointer(self,kind,phase,x,y):
  if kind=='mouse':return await self.call('Input.dispatchMouseEvent',dict(type='mousePressed' if phase=='down' else 'mouseReleased',x=x,y=y,button='left',clickCount=1))
  return await self.call('Input.dispatchTouchEvent',dict(type='touchStart' if phase=='down' else 'touchEnd',touchPoints=[dict(x=x,y=y,radiusX=3,radiusY=3,force=1,id=1)]if phase=='down'else[]))
 async def measure(self,x=None,y=None):return await self.ev('''(()=>{const e=document.getElementById('rugeBackContinue');if(!e)return null;const r=e.getBoundingClientRect(),x=X??r.x+r.width/2,y=Y??r.y+r.height/2,t=document.elementFromPoint(x,y);return {x:r.x,y:r.y,w:r.width,h:r.height,transform:getComputedStyle(e).transform,active:e.matches(':active'),hit:t?.id||t?.className,hidden:e.hidden}})()'''.replace('X',json.dumps(x)).replace('Y',json.dumps(y)))
 async def prep(self,actual=False,game=''):
  await self.ev('''window.RugeBack.clearPause();window.__probe={resume:0,hide:0,shield:0,events:[]};if(!window.__probeInstalled){for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','touchstart','touchend'])document.addEventListener(type,e=>{window.__probe?.events.push({type,target:e.target.id||e.target.className})},true);window.__probeInstalled=true;}''')
  if not actual:await self.ev("RugeBack.closePause(()=>__probe.hide++,()=>__probe.resume++)")
  else:
   code={'pipe-flow':"document.getElementById('levels').hidden=true;pauseGame();",'hanzi-typing':"__game.start(0);__game.pause();",'hanzi-puzzle':"__game.pause();"}[game]
   await self.ev(code+'RugeBack.handle();')
  await self.ev("document.querySelector('.ruge-back-shield').addEventListener('click',()=>__probe.shield++);document.getElementById('rugeBackContinue').addEventListener('click',()=>__probe.resume++);" if actual else "document.querySelector('.ruge-back-shield').addEventListener('click',()=>__probe.shield++);")
 async def trial(self,kind,game,actual=False,negative=False,shot=False):
  await self.prep(actual,game)
  before=await self.measure();assert before,'continue not created';x=before['x']+before['w']/2;y=before['y']+before['h']/2
  await self.pointer(kind,'down',x,y);await asyncio.sleep(.08);down=await self.measure(x,y)
  if shot:await self.shot('browser-'+game+'-'+kind+('-old-css'if negative else'')+'-pressed.png')
  await self.pointer(kind,'up',x,y);await asyncio.sleep(.15)
  probe=await self.ev('__probe');removed=await self.ev("!document.getElementById('rugeBackContinue')&&!document.querySelector('.ruge-back-shield')")
  state=None
  if actual:state=await self.ev("__game.state()")
  stable=abs(down['x']-before['x'])<=2 and abs(down['y']-before['y'])<=3 and down['hit']=='rugeBackContinue'
  result={'game':game,'input':kind,'actualGamePause':actual,'negativeOldCss':negative,'before':before,'pressed':down,'probe':probe,'removed':removed,'stable':stable,'state':state,'passed':stable and probe['resume']==1 and probe['shield']==0 and removed}
  if actual:result['passed']=result['passed'] and state['paused']is False
  return result
async def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'app/assets')));server.daemon_threads=True;thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}';process=None
 results=[];actual=[];negative=[]
 try:
  with tempfile.TemporaryDirectory(prefix='TMP to delete-continue-browser-',dir=ROOT)as directory:
   temp=Path(directory);profile=temp/'profile'
   with (temp/'chrome.log').open('wb')as log:
    try:
     process=subprocess.Popen([covers.find_chrome(None),'--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--mute-audio',f'--user-data-dir={profile}','--remote-debugging-port=0','about:blank'],stdout=log,stderr=log,start_new_session=True)
     for _ in range(100):
      if (profile/'DevToolsActivePort').exists():break
      await asyncio.sleep(.1)
     port=(profile/'DevToolsActivePort').read_text().splitlines()[0];target=next(p for p in json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))if p['type']=='page')
     async with websockets.connect(target['webSocketDebuggerUrl'],max_size=16000000)as ws:
      c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable');await c.call('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':1})
      for width,height in [(320,568),(392,872),(872,392)]:
       await c.call('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=True))
       for game in GAMES:
        path=game if game.endswith('.html')else game+'/index.html';await c.load(base+'/'+path)
        for kind in ['mouse','touch']:
         try:r=await c.trial(kind,game);r['viewport']=[width,height]
         except Exception as e:r={'game':game,'input':kind,'viewport':[width,height],'passed':False,'error':str(e)}
         results.append(r)
        print(width,game,results[-2]['passed'],results[-1]['passed'],flush=True)
      # Actual pause handlers and resumptions in the three strongest active-rule pages.
      await c.call('Emulation.setDeviceMetricsOverride',dict(width=392,height=872,deviceScaleFactor=1,mobile=True))
      for game in ['pipe-flow','hanzi-typing','hanzi-puzzle']:
       for kind in ['mouse','touch']:
        await c.load(base+'/'+game+'/index.html')
        try:r=await c.trial(kind,game,actual=True,shot=True)
        except Exception as e:r={'game':game,'input':kind,'actualGamePause':True,'passed':False,'error':str(e)}
        actual.append(r)
      # Restore the previous class selector in browser memory, then prove the regression is caught.
      for game in ['pipe-flow','hanzi-typing']:
       await c.load(base+'/'+game+'/index.html');await c.ev("for(const sheet of document.styleSheets){if(!sheet.href?.endsWith('/shared/back-navigation.css'))continue;for(let i=sheet.cssRules.length-1;i>=0;i--)if(sheet.cssRules[i].selectorText==='#rugeBackContinue:active')sheet.deleteRule(i);sheet.insertRule('.ruge-back-continue:active{transform:translate(-50%,-48%)}',sheet.cssRules.length);}")
       for kind in ['mouse','touch']:
        r=await c.trial(kind,game,negative=True,shot=True);negative.append(r)
      report={'scope':'Actual Chrome mouse and touch dispatch; no Android hardware or human-input claim','integration':results,'actualPauseHandlers':actual,'negativeControlOldCss':negative,'exceptions':c.exceptions}
      OUT.joinpath('browser-continue-pointer.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
      try:await c.call('Browser.close')
      except:pass
    finally:covers.stop_owned_browser(process,profile)
 finally:server.shutdown();server.server_close();thread.join(timeout=3)
 print('integration',sum(r['passed']for r in results),'/',len(results),'actual',sum(r['passed']for r in actual),'/',len(actual),'negative failures detected',sum(not r['passed']for r in negative),'/',len(negative),flush=True)
 if not results or not all(r['passed'] for r in results) or len(actual)!=6 or not all(r['passed'] for r in actual) or len(negative)!=4 or not all(not r['passed'] and r['probe']['resume']==0 for r in negative):raise SystemExit('Continue pointer regression failed')
if __name__=='__main__':asyncio.run(main())
