"""UI review with actual local Chrome. --fixture uses 3 explicitly marked entries,
not production archaeological content; default reviews the real packaged catalog.
The only process/server/profile this script owns are always closed in finally.
"""
import asyncio,base64,json,os,signal,subprocess,tempfile,threading,urllib.request,sys
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import websockets
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
TMP=ROOT/'TMP to delete-426-ui';TMP.mkdir(exist_ok=True)
FIXTURE='--fixture' in sys.argv
fixture={'groups':[{'id':'sky','name':'天地','chars':['日','月']},{'id':'person','name':'身体','chars':['人']}], 'entries':[{'char':c,'pinyin':[p],'meaning':m,'story':s,'forms':[],'sources':[{'title':'临时UI验证链接，不是正式字源','url':'https://www.zdic.net/hans/'+c}]} for c,p,m,s in [('日','rì','太阳。','临时UI布局示例，正式内容以资料审校为准。'),('月','yuè','月亮。','临时UI布局示例，正式内容以资料审校为准。'),('人','rén','人。','临时UI布局示例，正式内容以资料审校为准。')]]}
fixture['entries'][0]['forms']=[{'stage':'seal','label':'篆文（后补）','caption':'临时长文案排版测试。古今字形分支说明在这里自然换行，不挤压相邻卡片。'}]
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT/'app/assets'),**k)
 def log_message(self,*a):pass
 def do_GET(self):
  if FIXTURE and self.path.split('?')[0]=='/hanzi-library/catalog.js':
   body=('window.HanziLibraryData='+json.dumps(fixture,ensure_ascii=False)+';').encode();self.send_response(200);self.send_header('Content-Type','application/javascript; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  super().do_GET()
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();process=None
 with tempfile.TemporaryDirectory(prefix='TMP to delete-library-chrome-',dir=TMP) as profile:
  try:
   process=subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
   f=Path(profile)/'DevToolsActivePort'
   for _ in range(100):
    if f.exists():break
    await asyncio.sleep(.1)
   port=f.read_text().splitlines()[0];tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'));wsurl=next(t for t in tabs if t.get('type')=='page')['webSocketDebuggerUrl']
   async with websockets.connect(wsurl,max_size=50_000_000) as ws:
    seq=0;errors=[];failures=[]
    async def call(method,params={}):
     nonlocal seq
     seq+=1;await ws.send(json.dumps({'id':seq,'method':method,'params':params}))
     while True:
      r=json.loads(await ws.recv())
      if r.get('method')=='Runtime.exceptionThrown':errors.append(r['params'])
      if r.get('method')=='Network.loadingFailed':failures.append(r['params'])
      if r.get('id')==seq:
       if 'error' in r:raise RuntimeError(r['error'])
       return r.get('result',{})
    async def evaluate(code):
     r=await call('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
     if 'exceptionDetails' in r:raise RuntimeError(r['exceptionDetails'])
     return r['result'].get('value')
    await call('Runtime.enable');await call('Page.enable');await call('Network.enable')
    await call('Page.addScriptToEvaluateOnNewDocument',{'source':'''Object.defineProperty(window,'localStorage',{get(){throw Error('字库触碰存档')}});window.__sources=[];window.RugeNav={openSource(url){__sources.push(url);return true},home(){}};'''} )
    async def nav(query='',hash=''):
     await call('Page.navigate',{'url':f'http://127.0.0.1:{server.server_port}/hanzi-library/{query}{hash}'})
     for _ in range(100):
      if await evaluate('!!window.__game'):return
      await asyncio.sleep(.05)
     raise RuntimeError(('page not ready',errors))
    report={'fixtureOnly':FIXTURE,'layouts':[],'errors':errors,'networkFailures':failures}
    await nav();report['entries']=await evaluate('__game.state().total');assert report['entries']==(3 if FIXTURE else 60)
    for width,height in [(320,568),(392,872),(568,320),(872,392)]:
     await call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
     await evaluate('__game.list()')
     for view in ['list','detail']:
      if view=='detail':await evaluate("__game.open(window.HanziLibraryData.entries.find(e=>e.char==='为')?.char||window.HanziLibraryData.entries[0].char)")
      await asyncio.sleep(.12)
      layout=await evaluate('''(()=>{const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return{scrollWidth:document.documentElement.scrollWidth,innerWidth,innerHeight,state:__game.state(),controls:[...document.querySelectorAll('button,input,summary')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height).map(n=>({id:n.id,label:n.getAttribute('aria-label')||n.textContent.trim(),...rect(n),inScrollable:!!n.closest('.list-scroll,.groups,.detail-scroll')})),list:rect(document.getElementById('listScroll')),detail:rect(document.getElementById('detailScroll')),formOverflow:[...document.querySelectorAll('.form-card')].filter(n=>n.scrollWidth>n.clientWidth+1).length,failedImages:[...document.images].filter(n=>n.complete&&!n.naturalWidth).map(n=>n.src)}})()''')
      layout.update({'viewport':[width,height],'view':view});report['layouts'].append(layout)
      shot=await call('Page.captureScreenshot',{'format':'png'});(OUT/f'{"fixture-" if FIXTURE else ""}{view}-{width}x{height}.png').write_bytes(base64.b64decode(shot['data']))
      assert layout['scrollWidth']<=width+1,(width,height,view,layout)
      fixed=[c for c in layout['controls'] if not c['inScrollable']]
      assert all(c['bottom']<=height+1 and c['x']>=-1 and c['right']<=width+1 for c in fixed),(width,height,view,fixed)
      assert all(c['height']>=43 and c['width']>=43 for c in layout['controls']),(width,height,view,layout['controls'])
      assert not layout['failedImages'],layout['failedImages']
      assert layout['formOverflow']==0,layout
    await evaluate("__game.list();document.getElementById('search').value='ri';document.getElementById('search').dispatchEvent(new Event('input'));document.getElementById('grid').firstElementChild.click();")
    assert await evaluate('__game.state().char')=='日'
    await evaluate("document.getElementById('sourceDetails').open=true;document.querySelector('.source-actions button:last-child').click();__game.list();")
    assert await evaluate('__game.state().query')=='ri';report['filteredReturn']=True
    if not FIXTURE:
     report['allEntries']=await evaluate('''(async()=>{let entries=[];for(const entry of HanziLibraryData.entries){__game.open(entry.char);entries.push({char:entry.char,rendered:document.getElementById('modernChar').textContent,forms:document.getElementById('forms').children.length,story:!!document.getElementById('story').textContent,sourceCount:document.getElementById('sources').children.length});}const files=[...new Set(HanziLibraryData.entries.flatMap(e=>(e.forms||[]).map(f=>f.src)).filter(Boolean))];const loaded=[];for(let i=0;i<files.length;i+=6){loaded.push(...await Promise.all(files.slice(i,i+6).map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({src,ok:true,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({src,ok:false});image.src=src;}))));}return{entries,images:loaded}})()''')
     assert len(report['allEntries']['entries'])==60
     assert all(e['char']==e['rendered'] and e['story'] and e['forms']>=1 for e in report['allEntries']['entries'])
     assert all(e['ok'] for e in report['allEntries']['images']),report['allEntries']['images']
    await nav(hash='#char='+urllib.parse.quote('日'));assert await evaluate('__game.state().char')=='日';report['deepLink']=True
    if not FIXTURE:
     await call('Emulation.setDeviceMetricsOverride',{'width':392,'height':872,'deviceScaleFactor':2,'mobile':True})
     for name,code in [('sun-detail',"__game.open('日');document.getElementById('detailScroll').scrollTop=0"),('sun-evolution',"document.querySelector('.evolution').scrollIntoView({block:'start'})"),('traditional-transition',"__game.open('为');document.querySelector('.evolution').scrollIntoView({block:'start'});document.getElementById('forms').scrollLeft=9999")]:
      await evaluate(code);await asyncio.sleep(.12);shot=await call('Page.captureScreenshot',{'format':'png'});(OUT/f'{name}-392x872.png').write_bytes(base64.b64decode(shot['data']))
     await evaluate("__game.open('日')")
    await evaluate("window.dispatchEvent(new Event('ruge:pause'));window.dispatchEvent(new Event('ruge:resume'))")
    assert await evaluate('__game.state().char')=='日';report['backgroundKeptChar']=True
    await nav('?cover=1','#char='+urllib.parse.quote('月'));assert await evaluate('__game.state().view')=='list';report['coverNoStorage']=True
    shot=await call('Page.captureScreenshot',{'format':'png'});(OUT/f'{"fixture-" if FIXTURE else ""}cover.png').write_bytes(base64.b64decode(shot['data']))
    (OUT/f'{"fixture-" if FIXTURE else ""}browser-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));assert not errors,errors;assert not failures,failures
    print(json.dumps({'entries':report['entries'],'layouts':len(report['layouts']),'errors':len(errors),'fixture':FIXTURE},ensure_ascii=False))
  finally:
   server.shutdown();server.server_close()
   if process and process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
asyncio.run(main())
