async (page) => {
  const root = __PROJECT_ROOT__;
  const origin = new URL(page.url()).origin;
  const directory = root + '/docs/Design Animal and Hats';
  const errors = [], failures = [], metrics = [];
  page.on('pageerror', error => errors.push(String(error)));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const bounds = async () => page.evaluate(() => {
    const rect = id => { const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,visible:!e.hidden}; };
    const visible = [...document.querySelectorAll('#play button')].filter(b=>getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden');
    return {viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:rect(document.getElementById('board')?'board':'hatStage'),footer:rect('play'),outside:visible.filter(b=>{const r=b.getBoundingClientRect();return r.width&&r.height&&(r.x<-.5||r.right>innerWidth+.5||r.y<-.5||r.bottom>innerHeight+.5);}).map(b=>b.id||b.className)};
  });
  for (const [width,height] of [[320,568],[392,872]]) {
    await page.setViewportSize({width,height});
    for (const [game,levels] of [['animal-balance',[0,5,12,17]],['hat-trick',[0,8,15,17]]]) {
      await page.goto(origin + '/' + game + '/index.html');
      for (const level of levels) {
        await page.evaluate(i=>window.__game.start(i),level);
        const m=await bounds();metrics.push({game,level:level+1,...m});
        if(m.outside.length||m.scroll[0]>width||m.board.bottom>height||m.board.height<100)failures.push({game,level:level+1,...m});
        await page.screenshot({path:directory+'/'+game+'-level-'+(level+1)+'-'+width+'.png'});
      }
    }
  }
  assert(!failures.length,'Controls outside viewport: '+JSON.stringify(failures));
  await page.setViewportSize({width:320,height:568});
  await page.goto(origin + '/animal-balance/index.html');
  await page.evaluate(()=>window.__game.start(12));
  const answer=await page.evaluate(()=>window.AnimalBalance.solve(12));
  for(let bridge=0;bridge<answer.length;bridge++){
    await page.locator('#bridgeTabs button').nth(bridge).click();
    for(const id of answer[bridge])await page.locator('#stock button[data-animal="'+id+'"]').click();
    await page.locator('#weigh').click();await page.waitForTimeout(470);
  }
  assert(await page.evaluate(()=>window.__game.state().finished),'Animal double bridge not won');
  await page.locator('#next').click();
  assert(await page.evaluate(()=>window.__game.state().level===13),'Animal next level failed');
  await page.goto(origin + '/hat-trick/index.html');
  await page.evaluate(()=>window.__game.start(17));
  await page.locator('#hideAnimals').click();
  await page.waitForFunction(()=>window.__game.state().phase==='choose',{timeout:15000});
  const hats=await page.evaluate(()=>window.HatTrick.solution(17));
  await page.screenshot({path:directory+'/hat-trick-level-18-covered-320.png'});
  const targetRects=await page.locator('#hatStage button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
  assert(targetRects.every(r=>r.width>=44&&r.height>=44),'Hat target too small');
  for(const index of hats)await page.locator('#hatStage button').nth(index).click();
  assert(await page.evaluate(()=>window.__game.state().phase==='won'),'Hat order challenge not won');
  await page.locator('#next').click();assert(await page.locator('#menu').isVisible(),'Hat last level should return to map');
  await page.evaluate(()=>window.__game.start(8));await page.locator('#hideAnimals').click();await page.waitForTimeout(500);await page.locator('#pauseButton').click();
  assert(await page.evaluate(()=>getComputedStyle(document.getElementById('hatStage')).visibility==='hidden'),'Pause leaked board');
  await page.locator('#resume').click();assert(await page.evaluate(()=>window.__game.state().phase==='preview'),'Interrupted shuffle must restart observation');
  await page.screenshot({path:directory+'/hat-trick-replay-after-pause-320.png'});
  await page.setViewportSize({width:600,height:360});
  for(const game of ['animal-balance','hat-trick']){
    await page.goto(origin+'/'+game+'/index.html?cover=1');
    await page.screenshot({path:directory+'/'+game+'-cover.png'});
    assert(await page.evaluate(()=>document.body.classList.contains('cover')),'Cover mode did not load');
  }
  assert(!errors.length,'Browser errors: '+JSON.stringify(errors));
  return {pass:true,metrics,hatTargetRects:targetRects,browserErrors:errors};
}
