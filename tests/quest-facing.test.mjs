import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
const advance=(h,ms=500)=>{for(let t=0;t<ms;t+=20)h.frame(20);};
const vector={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
function page(facing='right'){
 const draft={index:0,level:1,x:3,y:2,facing,item:[3,2],carrying:false,moves:0};
 const h=loadGame('voice-quest',{storage:{rugeVoiceQuestV1:JSON.stringify({schema:1,reached:8,stars:{2:3},draft})}});
 h.window.__game.openLevel(0);h.window.__game.beginTouch();return h;
}
test('角色四个实际画面朝向与存档一致，前进/后退均保持面朝方向，结束仍站稳同朝向',()=>{
 const positions=new Set();
 for(const facing of Object.keys(vector)){
  const h=page(facing);try{const g=h.window.__game,n=h.node('#player'),[dx,dy]=vector[facing];
   assert.equal(n.dataset.facing,facing);positions.add(n.style.backgroundPosition);
   assert.equal(g.command('forward').type,'move');advance(h,140);
   assert.equal(n.dataset.facing,facing);assert.notEqual(n.dataset.pose,'0');advance(h);
   assert.equal(g.engine.snapshot().x,3+dx);assert.equal(g.engine.snapshot().y,2+dy);assert.equal(n.dataset.pose,'0');
   assert.equal(g.command('backward').type,'move');advance(h,100);assert.equal(n.dataset.facing,facing);assert.equal(g.animation.backward,true);advance(h);
   assert.equal(g.engine.snapshot().x,3);assert.equal(g.engine.snapshot().y,2);assert.equal(n.dataset.facing,facing);assert.equal(n.dataset.pose,'0');
   assert.equal(g.save.stars[2],3);assert.equal(g.save.reached,8);
  }finally{h.dispose();}
 }
 assert.equal(positions.size,4,'不能把上下朝向继续画成同一张侧面');
});
test('原地转身当下就换画面方向；碰墙也保留新朝向，前进不是无提示地记上次位移',()=>{
 const h=page('right');try{const g=h.window.__game,n=h.node('#player');
  g.command('turnLeft');assert.equal(n.dataset.facing,'up');advance(h);
  g.command('forward');advance(h);assert.equal(g.engine.snapshot().y,1);
  assert.equal(g.command('forward').type,'wall');assert.equal(n.dataset.facing,'up');
  g.command('turnRight');assert.equal(n.dataset.facing,'right');advance(h);g.command('backward');advance(h);
  assert.equal(g.engine.snapshot().x,2);assert.equal(n.dataset.facing,'right');
 }finally{h.dispose();}
});
test('跳跃、拾取、暂停及恢复不突然变回右侧脸，面朝方向随草稿保存',()=>{
 const h=page('up');try{const g=h.window.__game,n=h.node('#player');
  assert.equal(g.command('take').type,'take');advance(h,150);assert.equal(n.dataset.facing,'up');advance(h);
  g.command('jump');advance(h,100);assert.equal(n.dataset.facing,'up');g.pause();assert.equal(n.dataset.facing,'up');assert.equal(n.dataset.pose,'0');
  const saved=JSON.parse(h.saved.get('rugeVoiceQuestV1'));assert.equal(saved.draft.facing,'up');assert.equal(saved.stars[2],3);
  g.beginTouch();assert.equal(n.dataset.facing,'up');
 }finally{h.dispose();}
});
