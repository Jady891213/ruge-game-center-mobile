import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';

function game(t,{native=true,storage={},cover=false}={}) {
  const h=loadGame('gravity-maze',{storage,instrument(source,index){
    if(index!==0)return source;
    return `window.__events=[];window.RugeFX={emit:n=>window.__events.push(n)};${cover?"location.search='?cover=1';":''}${native?`window.__sensor={x:0,y:0,z:1,age:0,available:true};window.RugeTilt={sample:()=>JSON.stringify(window.__sensor)};`:''}`;
  }});
  t.after(()=>h.dispose());return{h,g:h.window.__game,s:h.window.__sensor};
}
function frames(h,n=16){for(let i=0;i<n;i++)h.frame(40);}
const plain=v=>JSON.parse(JSON.stringify(v));

test('钢珠简明界面：原触摸偏好不影响倾斜默认值，平放稳定后立即开始，常驻工具已删除',t=>{
  const {h,g}=game(t,{storage:{rugeMarbleInputV1:'touch',rollingGardenInputV2:'touch'}});
  assert.equal(g.state().mode,'tilt');assert.equal(h.node('#controls').hidden,true);
  for(const id of ['calibrate','tiltMode','touchMode','readyTilt','readyTouch','mechanism','finishPlan'])assert.equal(h.html.includes(`id="${id}"`),false);
  frames(h);assert.equal(g.start(),true);assert.equal(g.state().paused,false);assert.equal(h.node('#flatGuide').hidden,true);
});

test('钢珠简明界面：歪拿先显示图示，稳定放平后自动开始，游戏中可正常倾斜',t=>{
  const {h,g,s}=game(t);s.x=.5;s.z=Math.sqrt(.75);
  assert.equal(g.start(),false);assert.equal(g.state().waitingFlat,true);assert.equal(h.node('#flatGuide').hidden,false);
  frames(h,25);assert.equal(g.state().paused,true);assert.equal(g.input.read(.1).x>.4,true,'不能用歪姿势自动校准为零');
  s.x=0;s.z=1;frames(h,7);assert.equal(g.state().paused,true);frames(h,10);assert.equal(h.node('#flatTitle').textContent,'放好啦！');assert.equal(h.node('#flatCountdown').textContent,'2');assert.equal(g.state().paused,true);frames(h,51);assert.equal(g.state().paused,false);
  s.y=-.17;s.z=Math.sqrt(1-.17**2);const before=g.state().y;frames(h,8);assert.ok(g.state().y<before,'开局后允许倾斜，不能持续强制水平');
});

test('钢珠简明界面：取消、后台、转屏和选关取消水平等待，恢复前台不自动开局',t=>{
  for(const action of ['cancel','background','orientation','levels']){
    const {h,g,s}=game(t);s.x=.6;s.z=.8;g.start();assert.equal(g.state().waitingFlat,true);
    if(action==='cancel')h.click('#cancelFlat');
    if(action==='background'){h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');}
    if(action==='orientation')h.emitWindow('ruge:orientation');
    if(action==='levels'){g.showLevels();h.click('#closeLevels');}
    s.x=0;s.z=1;frames(h,30);assert.equal(g.state().waitingFlat,false,action);assert.equal(g.state().paused,true,action);
    assert.equal(g.state().result,'ready',action);
  }
});

test('钢珠简明界面：后台恢复仍需明确继续，继续先放平',t=>{
  const {h,g,s}=game(t);frames(h);g.start();h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');frames(h);
  assert.equal(g.state().paused,true);s.x=.6;s.z=.8;g.resume();frames(h);assert.equal(g.state().paused,true);
  s.x=0;s.z=1;frames(h,70);assert.equal(g.state().paused,false);
});

test('钢珠简明界面：挡板在准备和运行时都直接可点，暂停/选关/水平图示禁止转',t=>{
  const {h,g}=game(t,{native:false});g.loadLevel(12);const buttons=h.node('#rotorButtons').children;
  assert.equal(buttons.length,1);assert.equal(buttons[0].hidden,false);buttons[0].dispatch('click');assert.deepEqual(plain(g.state().rotors),[1]);
  g.start();buttons[0].dispatch('click');assert.deepEqual(plain(g.state().rotors),[0]);assert.equal(g.state().paused,false);
  g.pause();assert.equal(g.rotateRotor(0),false);assert.equal(buttons[0].hidden,true);
  g.showLevels();assert.equal(g.rotateRotor(0),false);
});

test('钢珠简明界面：没有传感器只显示方向盘，坏/过期native提供必要降级，封面静默',async t=>{
  const web=game(t,{native:false});assert.equal(web.g.state().mode,'touch');assert.equal(web.h.node('#controls').hidden,false);assert.equal(web.g.start(),true);
  const native=game(t);native.s.age=1501;native.g.start();assert.equal(native.h.node('#flatTouch').hidden,false);assert.equal(native.g.state().paused,true);
  native.h.click('#flatTouch');await Promise.resolve();assert.equal(native.g.state().mode,'touch');assert.equal(native.g.state().paused,false);
  const cover=game(t,{cover:true,storage:{other:'exact'}});cover.g.start();cover.g.rotateRotor(0);frames(cover.h,50);
  assert.equal(cover.g.state().paused,true);assert.deepEqual(Object.fromEntries(cover.h.saved),{other:'exact'});assert.deepEqual(plain(cover.h.window.__events),[]);
});

function barPoint(h,g) {
  const {level,ball}=g.world(),bar=g.rotorWall(level.rotors[0],ball.rotors[0]);
  const rect=h.node('#stage').getBoundingClientRect(),scale=Math.min((rect.width-12)/level.w,(rect.height-10)/level.h);
  const ox=(rect.width-level.w*scale)/2,oy=(rect.height-level.h*scale)/2;
  return {clientX:ox+(bar.x+bar.w*(bar.w>bar.h?.9:.5))*scale,
    clientY:oy+(bar.y+bar.h*(bar.h>bar.w?.9:.5))*scale,pointerId:41};
}
function tapBar(h,g){const p=barPoint(h,g),cv=h.node('#cv');cv.dispatch('pointerdown',p);cv.dispatch('pointerup',p);}

test('钢珠简明界面：真实画布挡板杆身短点转一次，随后click不重复，轴按钮保持一次',t=>{
  const {h,g}=game(t,{native:false});g.loadLevel(12);
  tapBar(h,g);assert.deepEqual(plain(g.state().rotors),[1]);
  h.node('#cv').dispatch('click',barPoint(h,g));assert.deepEqual(plain(g.state().rotors),[1]);
  h.node('#rotorButtons').children[0].dispatch('click');assert.deepEqual(plain(g.state().rotors),[0]);
  g.start();tapBar(h,g);assert.deepEqual(plain(g.state().rotors),[1]);assert.equal(g.state().paused,false);
});

test('钢珠简明界面：杆身拖动、长按、取消、后台和遮罩均不能触发旋转',t=>{
  for(const action of ['drag','long','cancel','background','levels','reset','outside']){
    const {h,g}=game(t,{native:false});g.loadLevel(12);const cv=h.node('#cv'),p=barPoint(h,g);cv.dispatch('pointerdown',p);
    if(action==='drag')cv.dispatch('pointermove',{...p,clientX:p.clientX+15});
    if(action==='long')h.tick(701);
    if(action==='cancel')cv.dispatch('pointercancel',p);
    if(action==='background'){h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');}
    if(action==='levels'){g.showLevels();h.click('#closeLevels');}
    if(action==='reset')g.askReset();
    cv.dispatch('pointerup',action==='outside'?{...p,clientX:p.clientX+60}:p);
    assert.deepEqual(plain(g.state().rotors),[0],action);
  }
});

test('钢珠简明界面：样本只是300ms不新鲜先等检测，不显示多余方向盘选择',t=>{
  const {h,g,s}=game(t);s.age=301;g.start();assert.equal(g.state().waitingFlat,true);assert.equal(h.node('#flatTouch').hidden,true);
  s.age=0;frames(h,70);assert.equal(g.state().paused,false);
});


function finishForNavigation(h,g){
  // UI transition fixture only; full physical solvability is covered by marble-maze tests.
  g.input.setMode('touch');g.start();const {ball,level}=g.world();
  ball.stars.fill(true);ball.key=!!level.key;ball.x=level.goal.x;ball.y=level.goal.y;h.frame(30);
  assert.equal(g.state().result,'win');g.input.setMode('tilt');
}

test('钢珠连续过关：平放时点下一关立即运行，无第二次开始/引导/倒计时，末关回首关也相同',t=>{
  for(const index of [0,12,23,35]){
    const {h,g}=game(t);g.loadLevel(index);finishForNavigation(h,g);h.click('#next');
    assert.equal(g.state().level,(index+1)%h.window.MarbleMaze.LEVELS.length);assert.equal(g.state().result,'run');assert.equal(g.state().paused,false);
    assert.equal(g.state().waitingFlat,false);assert.equal(h.node('#ready').hidden,true);assert.equal(h.node('#flatGuide').hidden,true);
    const after=g.state().level;h.click('#next');assert.equal(g.state().level,after,'double tap cannot skip another level');
  }
});

test('钢珠连续过关：歪拿点下一关直接看引导，放好有明确反馈和完整2、1倒计时，计时期间不跑球',t=>{
  const {h,g,s}=game(t);finishForNavigation(h,g);s.x=.5;s.z=Math.sqrt(.75);h.click('#next');
  assert.equal(g.state().level,1);assert.equal(g.state().waitingFlat,true);assert.equal(h.node('#ready').hidden,true);
  assert.equal(h.node('#flatTitle').textContent,'手机放平');assert.equal(h.node('#flatCountdown').hidden,true);
  const before=g.state();frames(h,30);assert.equal(g.state().time,before.time);
  s.x=0;s.z=1;frames(h,13);assert.equal(h.node('#flatTitle').textContent,'放好啦！');assert.equal(h.node('#flatCountdown').textContent,'2');
  assert.equal(g.state().paused,true);frames(h,26);assert.equal(h.node('#flatCountdown').textContent,'1');assert.equal(g.state().paused,true);
  assert.equal(g.state().x,before.x);assert.equal(g.state().y,before.y);assert.equal(g.state().time,before.time);
  frames(h,25);assert.equal(g.state().result,'run');assert.equal(g.state().paused,false);assert.equal(h.node('#flatGuide').hidden,true);
});

test('钢珠倒计时：再拿歪或样本变旧立即取消计数，重新放平必须从2开始',t=>{
  for(const invalid of ['tilt','stale']){
    const {h,g,s}=game(t);s.x=.5;s.z=Math.sqrt(.75);g.start();s.x=0;s.z=1;frames(h,40);
    assert.equal(h.node('#flatCountdown').textContent,'1');
    if(invalid==='tilt'){s.x=.5;s.z=Math.sqrt(.75);}else s.age=301;
    frames(h,2);assert.equal(h.node('#flatCountdown').hidden,true);assert.equal(h.node('#flatTitle').textContent,'手机放平');
    frames(h,70);assert.equal(g.state().paused,true);
    s.x=0;s.z=1;s.age=0;frames(h,13);assert.equal(h.node('#flatCountdown').textContent,'2');assert.equal(g.state().paused,true);
    frames(h,51);assert.equal(g.state().paused,false);
  }
});

test('钢珠倒计时：取消、后台、转屏、选关及重置清除倒计时，不会迟到自动开局',t=>{
  for(const action of ['cancel','background','orientation','levels','reset']){
    const {h,g,s}=game(t);s.x=.5;s.z=Math.sqrt(.75);g.start();s.x=0;s.z=1;frames(h,16);
    assert.equal(h.node('#flatCountdown').hidden,false);
    if(action==='cancel')h.click('#cancelFlat');
    if(action==='background'){h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');}
    if(action==='orientation')h.emitWindow('ruge:orientation');
    if(action==='levels'){g.showLevels();h.click('#closeLevels');}
    if(action==='reset')g.askReset();
    frames(h,100);assert.equal(g.state().paused,true,action);assert.equal(g.state().waitingFlat,false,action);assert.equal(h.node('#flatGuide').hidden,true,action);
  }
});


test('钢珠倒计时：放平后小幅手抖不重来，保持8度范围即可完成2、1',t=>{
  const {h,g,s}=game(t);s.x=.5;s.z=Math.sqrt(.75);g.start();s.x=0;s.z=1;frames(h,13);
  assert.equal(h.node('#flatCountdown').textContent,'2');
  s.x=Math.sin(3*Math.PI/180);s.z=Math.cos(3*Math.PI/180);frames(h,26);
  assert.equal(h.node('#flatCountdown').textContent,'1');assert.equal(g.state().paused,true);
  s.x=-Math.sin(3*Math.PI/180);frames(h,25);assert.equal(g.state().paused,false);
});
