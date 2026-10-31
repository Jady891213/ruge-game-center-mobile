import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';

// Spy only on the shared output boundary; actions and state transitions execute the
// actual packaged game. Device audio/haptics are covered by the native review.
function puzzle(t,name,{storage={},cover=false}={}) {
  const h=loadGame(name,{storage,instrument(source,index){
    if(index===0&&cover)source="location.search='?cover=1';\n"+source;
    if(source.includes("KEY='rugeFeedbackV1'"))return `window.__feedback=[];window.RugeFX={emit:name=>window.__feedback.push(name)};${cover?"location.search='?cover=1';":''}`;
    return source;
  }});
  t.after(()=>h.dispose());
  return {h,g:h.window.__game,events:h.window.__feedback};
}
const take=events=>Array.from(events.splice(0));

test('密码箱：输入/撤销/提交揭晓/获胜有反馈，恢复和暂停静默，不泄露单字答案',t=>{
  const {h,g,events}=puzzle(t,'code-breaker');
  assert.deepEqual(take(events),[]);
  g.startLevel(0);assert.deepEqual(take(events),[]);
  g.pressDigit('1');assert.deepEqual(take(events),['select']);
  g.erase();assert.deepEqual(take(events),['undo']);
  g.clear();assert.deepEqual(take(events),[],'empty clear is not another action');
  const secret=g.state().run.secret;
  const other=g.state().run.pool.split('').find(c=>!secret.includes(c));
  g.pressDigit(secret[0]);g.pressDigit(other);take(events);
  const result=g.submit();assert.equal(result.won,false);assert.deepEqual(take(events),['tap']);
  const row=h.node('#history').children.at(-1);
  assert.equal(row.classList.contains('feedback-reveal'),true);
  assert.ok(row.children[1].children.every(node=>node.className===''),'individual digits remain neutral');
  for(const digit of secret)g.pressDigit(digit);take(events);g.submit();assert.deepEqual(take(events),['win']);
  const restored=puzzle(t,'code-breaker',{storage:Object.fromEntries(h.saved)});
  assert.deepEqual(take(restored.events),[],'restoring a finished run does not celebrate again');
  g.startLevel(0);h.emitWindow('ruge:pause');g.pressDigit('1');g.submit();g.erase();h.emitWindow('ruge:resume');
  assert.deepEqual(take(events),[]);
});

test('水管：旋转/撤销/提示和通关只按实际操作发出，水流绘制和暂停不重复',t=>{
  const {h,g,events}=puzzle(t,'pipe-flow');assert.deepEqual(take(events),[]);
  const tile=h.node('#grid').children.find(node=>!node.classList.contains('locked'));
  tile.dispatch('click');assert.deepEqual(take(events),['select']);
  h.click('#undo');assert.deepEqual(take(events),['undo']);
  h.click('#hint');assert.deepEqual(take(events),['hint']);
  h.click('#pause');tile.dispatch('click');h.click('#undo');h.click('#hint');h.frame();
  assert.deepEqual(take(events),[]);
  h.click('#resume');
  const width=g.LEVELS[g.state().li].w;
  for(const tile of g.state().tiles){
    if(!tile.onPath||tile.locked)continue;
    for(let n=0,turns=g.turnsToSolution(tile);n<turns;n++)h.node('#grid').children[tile.y*width+tile.x].dispatch('click');
  }
  assert.equal(g.state().won,true);
  assert.equal(events.filter(name=>name==='win').length,1);take(events);
  for(let n=0;n<10;n++)h.frame();h.tick(1000);
  assert.deepEqual(take(events),[]);
});

test('果汁：倒入和单瓶完成分层反馈，500ms锁和后台不会补发完成声',t=>{
  const {h,g,events}=puzzle(t,'forest-juice');g.start(0);assert.deepEqual(take(events),[]);
  g.tap(0);assert.deepEqual(take(events),['select']);g.tap(0);assert.deepEqual(take(events),['deselect']);
  g.tap(0);take(events);g.tap(2);assert.deepEqual(take(events),['pour']);
  g.tap(1);g.tap(3);h.node('#undo').onclick();assert.deepEqual(take(events),[]);
  h.tick(500);take(events);h.node('#undo').onclick();assert.deepEqual(take(events),['undo']);
  const moves=g.core.solve(0).moves;
  for(const [from,to] of moves){g.tap(from);take(events);g.tap(to);assert.deepEqual(take(events),['pour']);h.tick(500);const completion=take(events);assert.ok(completion.every(x=>x==='success'||x==='win'));}
  assert.equal(g.state().finished,true);assert.deepEqual(take(events),[]);
  const restored=puzzle(t,'forest-juice',{storage:Object.fromEntries(h.saved)});assert.deepEqual(take(restored.events),[]);
  g.start(0);g.tap(0);g.tap(2);take(events);g.pause();h.tick(1000);g.tap(1);g.resume();
  assert.deepEqual(take(events),[]);
});

test('果汁：全关只庆祝一次，非法倒入不改存档且有轻反馈',t=>{
  const {h,g,events}=puzzle(t,'forest-juice');g.start(0);
  g.tap(0);take(events);const before=JSON.stringify(g.state());assert.equal(g.tap(1),false);
  assert.equal(JSON.stringify(g.state()),before);assert.deepEqual(take(events),['error']);
  // Invalid target becomes the next source as before; deselect before the solve.
  g.tap(g.selected());take(events);
  for(const [from,to]of g.core.solve(0).moves){g.tap(from);g.tap(to);h.tick(500);}
  assert.equal(events.filter(name=>name==='win').length,1);
  assert.ok(events.includes('success'),'intermediate complete bottle receives a reward');
  take(events);g.tap(0);h.tick(2000);assert.deepEqual(take(events),[]);
});

test('重力：收集/掉洞/过关有反馈，静止、贴墙、暂停和恢复静默',t=>{
  const {h,g,events}=puzzle(t,'gravity-maze');assert.deepEqual(take(events),[]);
  const snapshots=[];h.window.RugeFX.emit=name=>{events.push(name);snapshots.push({name,...g.state()});};
  h.click('#start');assert.deepEqual(take(events),['tap']);
  const {level,ball}=g.world();
  for(const star of level.stars){ball.x=star.x;ball.y=star.y;ball.vx=ball.vy=0;h.frame(30);assert.deepEqual(take(events),['collect']);}
  for(let i=0;i<20;i++)h.frame();assert.deepEqual(take(events),[]);
  g.pause();h.frame();h.emitWindow('ruge:resume');assert.deepEqual(take(events),[]);g.resume();assert.deepEqual(take(events),['tap'],'explicit continue has one tap, background resume is silent');
  ball.x=level.goal.x;ball.y=level.goal.y;ball.vx=ball.vy=0;h.frame(30);assert.deepEqual(take(events),['win']);
  assert.equal(g.state().result,'win');assert.equal(g.state().paused,true);
  assert.equal(snapshots.filter(event=>event.name==='win').length,1);
  assert.equal(snapshots.find(event=>event.name==='win').paused,false,'terminal feedback precedes the physics freeze');
  for(let i=0;i<20;i++)h.frame();assert.deepEqual(take(events),[]);
  g.loadLevel(4);h.click('#start');take(events);const next=g.world();next.ball.x=next.level.holes[0].x;next.ball.y=next.level.holes[0].y;h.frame(30);assert.deepEqual(take(events),['error']);
  assert.ok(g.state().recover>0);assert.equal(g.state().paused,false);
  for(let i=0;i<40;i++)h.frame();assert.deepEqual(take(events),[]);
  assert.equal(snapshots.filter(event=>event.name==='error').length,1,'respawn does not replay the fall event');
});

test('四款益智封面从不发出声效或震动事件',t=>{
  for(const name of ['code-breaker','forest-juice','pipe-flow','gravity-maze']){
    const {h,g,events}=puzzle(t,name,{cover:true});
    if(name==='gravity-maze')g.start();
    if(name==='forest-juice'){g.tap(0);g.tap(2);}
    h.frame();h.tick(2000);assert.deepEqual(take(events),[],name);
  }
});
