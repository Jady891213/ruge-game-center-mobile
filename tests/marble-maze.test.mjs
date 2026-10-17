import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/gravity-maze/core.js';
import {loadGame} from './helpers/html-vm.mjs';

const C = globalThis.MarbleMaze;
const plain = value => JSON.parse(JSON.stringify(value));
const center = (level, cell) => ({x:C.PAD+(cell%level.cols+.5)*C.CELL,y:C.PAD+(Math.floor(cell/level.cols)+.5)*C.CELL});
function game(t, {storage={},native=false,cover=false}={}) {
  const h=loadGame('gravity-maze',{storage,instrument(source,index){
    if(index===0) return `window.__feedback=[];window.RugeFX={emit:n=>window.__feedback.push(n)};${cover?"location.search='?cover=1';":''}${native?`window.__tilt={x:0,y:0,z:1,age:0,available:true};window.RugeTilt={gx:()=>window.__tilt.x,gy:()=>window.__tilt.y,gz:()=>window.__tilt.z,available:()=>window.__tilt.available,sampleAgeMs:()=>window.__tilt.age,coordinateSystem:()=>"screen-down-v1"};`:''}`;
    return source;
  }}); t.after(()=>h.dispose());return{h,g:h.window.__game,events:h.window.__feedback};
}
function steer(state, point) {
  for(let n=0;n<2000;n++) {
    const dx=point.x-state.x,dy=point.y-state.y;
    if(Math.hypot(dx,dy)<2 && Math.hypot(state.vx,state.vy)<8)return;
    const tx=C.clamp(dx*4,-105,105),ty=C.clamp(dy*4,-105,105);
    const x=C.clamp(((tx-state.vx)*8+C.DRAG*state.vx)/C.ACCELERATION,-.24,.24);
    const y=C.clamp(((ty-state.vy)*8+C.DRAG*state.vy)/C.ACCELERATION,-.24,.24);
    C.step(state,x,y);
    if(state.won)return;
  }
  assert.fail(`could not roll to ${point.x},${point.y} from ${state.x},${state.y}`);
}

test('钢珠迷宫：12张固定迷宫均可达，钥匙在门前，前三关没有坑',()=>{
  assert.equal(C.LEVELS.length,12);
  assert.deepEqual(C.LEVELS.map(l=>l.theme),[0,0,0,0,1,1,1,1,2,2,2,2]);
  for(const level of C.LEVELS) {
    assert.deepEqual(C.validateLevel(level),{ok:true,bad:[]},`level ${level.id+1}`);
    assert.ok(level.stars.length>=2&&level.stars.length<=3);
    assert.ok(level.edges.length===level.cols*level.rows-1);
    if(level.id<3)assert.equal(level.holes.length,0);
    if(level.gate){assert.ok(C.reachable(level).includes(level.key.cell));assert.ok(!C.reachable(level).includes(level.goal.cell));}
  }
});

test('钢珠迷宫：用真实物理逐个房格滚过12条关卡路径，不靠传送获得星星/钥匙和通关',()=>{
  for(const level of C.LEVELS) {
    const state=C.create(level.id);
    for(const cell of level.route.slice(1))steer(state,center(level,cell));
    assert.equal(state.won,true,`level ${level.id+1}`);
    assert.ok(state.stars.every(Boolean));assert.equal(state.falls,0);
    if(level.key)assert.equal(state.key,true);
  }
});

test('钢珠迷宫：10度倾角有明显加速度，回平后仍有惯性，反向倾斜可以制动',()=>{
  const state=C.create(0),start=state.y,tilt=Math.sin(Math.PI/18);
  for(let n=0;n<24;n++)C.step(state,0,-tilt);
  assert.ok(state.vy < -75 && state.vy > -100);
  assert.ok(start-state.y>8);
  const before=state.y,speed=Math.abs(state.vy);
  for(let n=0;n<12;n++)C.step(state,0,0);
  assert.ok(state.y<before-6,'a level tray does not fake an instant stop');
  assert.ok(Math.abs(state.vy)>speed*.8);
  for(let n=0;n<12;n++)C.step(state,0,tilt);
  assert.ok(Math.abs(state.vy)<speed*.6,'opposite tilt visibly brakes the ball');
});

test('钢珠迷宫：120Hz固定步长在不同帧率下相同且速度有上限',()=>{
  const a=C.create(0),b=C.create(0);
  for(let n=0;n<60;n++)C.advance(a,0,-.17,1/60);
  for(let n=0;n<30;n++)C.advance(b,0,-.17,1/30);
  for(const field of ['x','y','vx','vy','time'])assert.ok(Math.abs(a[field]-b[field])<1e-8,field);
  for(let n=0;n<1000;n++)C.step(a,1,-1);
  assert.ok(Math.hypot(a.vx,a.vy)<=C.MAX_SPEED+.0001);
});

test('钢珠迷宫：连续大倾角不会穿墙，绘制和碰撞使用同一矩形',()=>{
  for(const level of C.LEVELS) {
    const s=C.create(level.id);
    for(const [x,y]of [[-1,0],[0,1],[1,0],[0,-1]])for(let n=0;n<260;n++) {
      C.step(s,x,y);
      assert.ok(!C.allWalls(level,s).some(w=>C.circleHit(s.x,s.y,C.RADIUS-.001,w)),`level ${level.id+1}`);
    }
  }
});

test('钢珠迷宫：弹性障碍旁的合法来球在联合碰撞后不会被推入墙内',()=>{
  for(const level of C.LEVELS.filter(l=>l.bumpers.length))for(const bumper of level.bumpers) {
    let fixtures=0;
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24) {
      const s=C.create(level.id);s.key=true;
      s.x=bumper.x+Math.cos(angle)*(C.RADIUS+bumper.r+.5);
      s.y=bumper.y+Math.sin(angle)*(C.RADIUS+bumper.r+.5);
      if(!C.positionClear(level,s,s.x,s.y))continue;
      fixtures++;s.vx=-Math.cos(angle)*C.MAX_SPEED;s.vy=-Math.sin(angle)*C.MAX_SPEED;
      for(let n=0;n<24;n++) {
        C.step(s,0,0);
        assert.ok(C.positionClear(level,s,s.x,s.y),`level ${level.id+1}, angle ${angle}`);
      }
    }
    assert.ok(fixtures>=8,'test must cover multiple safe approach angles beside the surrounding rails');
  }
});

test('钢珠迷宫：收齐星星才能结束，钥匙只解锁对应门',()=>{
  const first=C.create(0),lv=C.LEVELS[0];first.x=lv.goal.x;first.y=lv.goal.y;
  assert.ok(!C.step(first,0,0).includes('win'));
  first.stars.fill(true);assert.ok(C.step(first,0,0).includes('win'));assert.deepEqual(C.step(first,0,0),[]);
  const s=C.create(3),l=C.LEVELS[3];assert.equal(C.allWalls(l,s).length,l.walls.length+1);
  s.x=l.key.x;s.y=l.key.y;assert.ok(C.step(s,0,0).includes('key'));assert.equal(C.allWalls(l,s).length,l.walls.length);
});

test('钢珠迷宫：掉坑回最近收集点，保留星星，不扣命、不限重试',()=>{
  const s=C.create(10),lv=C.LEVELS[10],star=lv.stars[0],hole=lv.holes[0];
  s.x=star.x;s.y=star.y;assert.ok(C.step(s,0,0).includes('star'));
  for(let tries=0;tries<8;tries++) {
    s.x=hole.x;s.y=hole.y;s.vx=s.vy=0;
    assert.deepEqual(C.step(s,0,0),['fall']);
    assert.equal(s.stars[0],true);assert.equal(s.won,false);
    for(let n=0;n<62;n++)C.step(s,0,0);
    assert.equal(s.x,star.x);assert.equal(s.y,star.y);assert.equal(s.recover,0);
  }
  assert.equal(s.falls,8);assert.equal('lives' in s,false);
});

test('钢珠迷宫：存档恢复保留草稿与收集，清零惯性并拒绝墙内或坏坐标',()=>{
  const s=C.create(3),lv=C.LEVELS[3];s.x=lv.key.x;s.y=lv.key.y;C.step(s,0,0);s.vx=80;s.vy=-30;
  const restored=C.restore(C.snapshot(s));assert.equal(restored.key,true);assert.deepEqual(restored.stars,s.stars);assert.equal(restored.vx,0);assert.equal(restored.vy,0);
  const wall=lv.walls[0];const bad=C.restore({...C.snapshot(s),x:wall.x,y:wall.y});
  assert.deepEqual({x:bad.x,y:bad.y},s.checkpoint);
  assert.equal(C.restore({...C.snapshot(s),level:50}),null);assert.equal(C.restore({...C.snapshot(s),stars:[true]}),null);
});

test('钢珠迷宫：旧版解锁/奖章迁移到新键，旧键和其他游戏原样保留',t=>{
  const old=JSON.stringify({highest:7,stars:{0:3,1:2,6:1},best:{0:22}}),other='keep-exact';
  const {h,g}=game(t,{storage:{rollingGardenV2:old,other}});
  assert.equal(g.state().li,7);assert.equal(g.state().progress.reached,7);assert.deepEqual(plain(g.state().progress.completed),[0,1,6]);
  assert.equal(h.saved.has('rugeMarbleMazeV1'),false,'restore alone writes no save');
  g.start();assert.equal(JSON.parse(h.saved.get('rugeMarbleMazeV1')).schema,1);
  assert.equal(h.saved.get('rollingGardenV2'),old);assert.equal(h.saved.get('other'),other);
});

test('钢珠迷宫：旧十关全通保留当前关，并立即解锁新增的第十一关',t=>{
  const old=JSON.stringify({highest:9,stars:Object.fromEntries(Array.from({length:10},(_,i)=>[i,3]))});
  const {h,g}=game(t,{storage:{rollingGardenV2:old}});
  assert.equal(g.state().li,9);assert.equal(g.state().progress.reached,10);
  g.showLevels();assert.equal(h.node('#levelGrid').children[10].disabled,false);assert.equal(h.node('#levelGrid').children[11].disabled,true);
  assert.equal(h.saved.get('rollingGardenV2'),old);
});

test('钢珠迷宫：后台和旋转保持暂停，只有明确继续才继续物理',t=>{
  const {h,g}=game(t);h.click('#start');h.frame(16);h.frame(16);
  g.input.setTouch(0,-1);h.frame(50);const before=g.state();
  h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');for(let n=0;n<100;n++)h.frame(30);
  assert.equal(g.state().paused,true);assert.equal(g.state().time,before.time);assert.equal(g.state().y,before.y);
  h.click('#resume');assert.equal(g.state().paused,false);h.frame(30);assert.ok(g.state().time>before.time);
  h.emitWindow('ruge:orientation');assert.equal(g.state().paused,true);
});

test('钢珠迷宫：倾斜过期不允许开始或继续，游戏中失联会暂停且可切触摸',async t=>{
  const {h,g}=game(t,{native:true});const tilt=h.window.__tilt;tilt.age=1501;
  h.click('#start');assert.equal(g.state().paused,true);assert.equal(g.state().result,'ready');
  tilt.age=0;h.click('#start');assert.equal(g.state().paused,false);
  tilt.age=1501;for(let n=0;n<20;n++)h.frame(30);
  assert.equal(g.state().paused,true);assert.equal(h.node('#pausePanel').hidden,false);
  h.click('#resume');assert.equal(g.state().paused,true);
  h.click('#pauseTouch');await Promise.resolve();assert.equal(g.state().mode,'touch');assert.equal(g.state().paused,false);
});

test('钢珠迷宫：方向盘忽略第二根手指，取消后清空输入',t=>{
  const {h,g}=game(t);g.start();const pad=h.node('#touchPad');
  pad.dispatch('pointerdown',{pointerId:5,clientX:250,clientY:350});const before=g.input.read(.1);
  assert.ok(Math.hypot(before.x,before.y)>0);assert.ok(Math.hypot(before.x,before.y)<=1.00001);
  pad.dispatch('pointermove',{pointerId:6,clientX:0,clientY:0});assert.deepEqual(plain(g.input.read(.1)),plain(before));
  pad.dispatch('pointercancel',{pointerId:5});assert.equal(g.input.read(.1).x,0);assert.equal(g.input.read(.1).y,0);
});

test('钢珠迷宫：保存退出后恢复草稿，不重新送星或播放奖励',t=>{
  const first=game(t);first.g.start();const {ball,level}=first.g.world();ball.x=level.stars[0].x;ball.y=level.stars[0].y;first.h.frame(30);
  first.g.pause();const saved=Object.fromEntries(first.h.saved),restored=game(t,{storage:saved});
  assert.equal(restored.g.state().stars[0],true);assert.equal(restored.g.state().paused,true);assert.deepEqual(plain(restored.events),[]);
  assert.equal(restored.g.state().x,first.g.state().x);assert.equal(restored.g.state().y,first.g.state().y);
});

test('钢珠迷宫：最后一关结束可再玩一轮，第二轮下一关仍正常',t=>{
  const {h,g}=game(t);
  function finish(index) {
    g.loadLevel(index);g.start();const {ball,level}=g.world();ball.stars.fill(true);ball.key=!!level.key;ball.x=level.goal.x;ball.y=level.goal.y;h.frame(30);
    assert.equal(g.state().result,'win');assert.equal(g.state().paused,true);
  }
  finish(11);h.click('#next');assert.equal(g.state().li,0);finish(0);h.click('#next');assert.equal(g.state().li,1);
  assert.equal(JSON.parse(h.saved.get('rugeMarbleMazeV1')).reached,11);
});

test('钢珠迷宫：封面无输入、无物理、无写盘、无奖励',t=>{
  const storage={rollingGardenV2:'{"highest":9}',other:'unchanged'}, {h,g,events}=game(t,{storage,cover:true});
  const before=plain(g.state());g.start();g.save();h.click('#next');for(let n=0;n<200;n++)h.frame(30);
  assert.deepEqual(plain(g.state()),before);assert.deepEqual(Object.fromEntries(h.saved),storage);assert.deepEqual(plain(events),[]);
});
