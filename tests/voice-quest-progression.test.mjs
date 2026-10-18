import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';

test('口令小冒险真实页面36关连续按按钮通关，下一关与持久化不丢进度',()=>{
 const h=loadGame('voice-quest',{storage:{olderGame:'keep'}});
 const advance=(ms=650)=>{for(let t=0;t<ms;t+=50)h.frame(50);};
 try{
  const ui=h.window.__game,C=h.window.VoiceQuestCore;ui.openLevel(0,false);
  for(let i=0;i<36;i++){
   assert.equal(ui.engine.level.id,i+1);h.node('#startTouch').onclick();
   for(const command of C.solve(i)){
    const b=h.node('[data-command="'+command+'"]');assert.ok(b,'button for '+command);b.onclick();advance();
   }
   advance(1000);assert.equal(ui.engine.snapshot().won,true,'第'+(i+1)+'关');assert.equal(h.node('#win').hidden,false);
   const saved=JSON.parse(h.saved.get('rugeVoiceQuestV1'));assert.equal(saved.stars[i+1],3);assert.equal(saved.reached,Math.min(36,i+2));assert.equal(saved.draft,null);
   if(i<35)h.node('#next').onclick();
  }
  assert.equal(h.saved.get('olderGame'),'keep');h.node('#winMap').onclick();assert.equal(h.node('#menu').hidden,false);assert.ok(h.node('#levels').children.every(b=>!b.disabled));
 }finally{h.dispose();}
});
