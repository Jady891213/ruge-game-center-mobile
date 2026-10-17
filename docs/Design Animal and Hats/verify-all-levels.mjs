async (page) => {
  const config=__RUN_CONFIG__,origin=new URL(page.url()).origin,results=[];
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  if(config.first){await page.setViewportSize({width:320,height:568});await page.goto(origin+'/'+config.game+'/index.html');await page.evaluate(()=>window.__game.start(0));}
  for(const level of config.levels){
    assert(await page.evaluate(i=>window.__game.state().level===i,level),'Wrong level '+level);
    if(config.game==='animal-balance'){
      const answer=await page.evaluate(i=>window.AnimalBalance.solve(i),level);
      for(let b=0;b<answer.length;b++){
        if(answer.length>1)await page.locator('#bridgeTabs button').nth(b).click();
        for(const id of answer[b])await page.locator('#stock button[data-animal="'+id+'"]').click();
        await page.locator('#weigh').click();await page.waitForFunction(()=>!window.__game.busy());
      }
      assert(await page.evaluate(()=>window.__game.state().finished),'Animal level '+(level+1)+' did not win');
      results.push({game:config.game,level:level+1,answer,won:true});
    }else{
      await page.locator('#hideAnimals').click();
      await page.waitForFunction(()=>window.__game.state().phase==='choose',null,{timeout:18000});
      const answer=await page.evaluate(i=>window.HatTrick.solution(i),level);
      for(const index of answer)await page.locator('#hatStage button').nth(index).click();
      assert(await page.evaluate(()=>window.__game.state().phase==='won'),'Hat level '+(level+1)+' did not win');
      results.push({game:config.game,level:level+1,answer,won:true,swaps:await page.evaluate(()=>window.__game.state().move)});
    }
    assert(await page.locator('#win').isVisible(),'Win panel missing on '+(level+1));
    await page.locator('#next').click();
  }
  if(config.levels.includes(17)){assert(await page.locator('#menu').isVisible(),'Last level must return to map');assert(await page.evaluate(()=>window.__game.progress().every(n=>n===3)),'All levels must save three stars');}
  return {pass:true,results};
}
