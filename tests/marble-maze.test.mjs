import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import '../app/assets/gravity-maze/core.js';
import {loadGame} from './helpers/html-vm.mjs';

const C = globalThis.MarbleMaze;
const plain = value => JSON.parse(JSON.stringify(value));
const center = (level, cell) => ({x:C.PAD+(cell%level.cols+.5)*C.CELL,y:C.PAD+(Math.floor(cell/level.cols)+.5)*C.CELL});
function game(t, {storage={},native=false,cover=false}={}) {
  const h=loadGame('gravity-maze',{storage,instrument(source,index){
    if(index===0&&cover)source="location.search='?cover=1';\n"+source;
    if(source.includes("KEY='rugeFeedbackV1'")) return `window.__feedback=[];window.RugeFX={emit:n=>window.__feedback.push(n)};${cover?"location.search='?cover=1';":''}${native?`window.__tilt={x:0,y:0,z:1,age:0,available:true};window.RugeTilt={gx:()=>window.__tilt.x,gy:()=>window.__tilt.y,gz:()=>window.__tilt.z,available:()=>window.__tilt.available,sampleAgeMs:()=>window.__tilt.age,coordinateSystem:()=>"screen-down-v1"};`:''}`;
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
    const before={x:state.x,y:state.y};
    C.step(state,x,y);
    assert.equal(C.positionClear(C.LEVELS[state.level],state,state.x,state.y),true,'every 120Hz substep is outside walls and bumpers');
    assert.ok(Math.hypot(state.x-before.x,state.y-before.y)<=C.MAX_SPEED*C.STEP+.001,'solution cannot jump/respawn/teleport across the maze');
    if(state.won)return;
  }
  assert.fail(`could not roll to ${point.x},${point.y} from ${state.x},${state.y}`);
}

test('钢珠迷宫：36张固定关均可解，原18关几何保持，钥匙在门前，前三关没有坑',()=>{
  assert.equal(C.LEVELS.length,36);
  assert.equal(createHash('sha256').update(JSON.stringify(C.LEVELS.slice(0,18))).digest('hex'),'f3dce96e53d8b7d43a90dace583fa69e965d947972255594398d81705ed89b2a','4.19原18关全部几何/收集/机关初态不得改变');
  const keys=['cols','rows','w','h','theme','route','edges','walls','start','goal','stars','key','gate','holes','bumpers'];
  const baseline=JSON.stringify(C.LEVELS.slice(0,12).map(l=>Object.fromEntries(keys.map(k=>[k,l[k]]))));
  assert.equal(createHash('sha256').update(baseline).digest('hex'),'c5e0cb8045eea7740e3a2fe33a4bcce630640d44971e5134c1e67f5f223f9599','4.18原12关布局与收集位置不得改变');
  assert.deepEqual(C.LEVELS.slice(0,12).map(l=>l.theme),[0,0,0,0,1,1,1,1,2,2,2,2]);
  for(const level of C.LEVELS) {
    assert.deepEqual(C.validateLevel(level),{ok:true,bad:[]},`level ${level.id+1}`);
    assert.ok(level.stars.length>=2&&level.stars.length<=3);
    assert.ok(level.edges.length===level.cols*level.rows-1);
    if(level.id<3)assert.equal(level.holes.length,0);
    if(level.gate){assert.ok(C.reachable(level).includes(level.key.cell));assert.ok(!C.reachable(level).includes(level.goal.cell));}
  }
});

test('钢珠迷宫：用真实物理逐个房格滚过经典12条关卡路径，不靠传送获得星星/钥匙和通关',()=>{
  for(const level of C.LEVELS) {
    const state=C.create(level.id);
    if(level.rotors.length) continue;
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

test('钢珠迷宫：过期输入不能开局，新样本稳定后开始，运行失联暂停且可方向盘继续',async t=>{
  const {h,g}=game(t,{native:true});const tilt=h.window.__tilt;tilt.age=1501;
  h.click('#start');assert.equal(g.state().paused,true);assert.equal(g.state().result,'ready');
  tilt.age=0;for(let n=0;n<90;n++)h.frame(30);assert.equal(g.state().paused,false);
  tilt.age=1501;for(let n=0;n<20;n++)h.frame(30);
  assert.equal(g.state().paused,true);assert.equal(h.node('#pausePanel').hidden,false);
  h.click('#resume');assert.equal(g.state().paused,true);assert.equal(h.node('#flatGuide').hidden,false);
  h.click('#flatTouch');await Promise.resolve();assert.equal(g.state().mode,'touch');assert.equal(g.state().paused,false);
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
  finish(C.LEVELS.length-1);h.click('#next');assert.equal(g.state().li,0);finish(0);h.click('#next');assert.equal(g.state().li,1);
  assert.equal(JSON.parse(h.saved.get('rugeMarbleMazeV1')).mechanismReached,C.LEVELS.length-1);
  assert.equal(JSON.parse(h.saved.get('rugeMarbleMazeV1')).reached,1);
});

test('钢珠迷宫：封面无输入、无物理、无写盘、无奖励',t=>{
  const storage={rollingGardenV2:'{"highest":9}',other:'unchanged'}, {h,g,events}=game(t,{storage,cover:true});
  const before=plain(g.state());g.start();g.save();h.click('#next');for(let n=0;n<200;n++)h.frame(30);
  assert.deepEqual(plain(g.state()),before);assert.deepEqual(Object.fromEntries(h.saved),storage);assert.deepEqual(plain(events),[]);
});


test('钢珠机关：24关按真实求解器与120Hz物理完成，六关必须中途改变挡板朝向',()=>{
  for(const level of C.LEVELS.slice(12)) {
    const solution=C.solveLevel(level);assert.ok(solution);const state=C.create(level.id),turns=[];
    for(const action of solution) {
      if(action.type==='rotate') { assert.equal(C.rotate(state,action.index),true,`level ${level.id+1}`);turns.push(action.index); }
      else steer(state,center(level,action.cell));
      assert.equal(C.positionClear(level,state,state.x,state.y),true);
    }
    assert.equal(state.won,true);assert.ok(state.stars.every(Boolean));assert.equal(state.falls,0);assert.ok(turns.length>=1);
    if([16,17,20,21,22,23].includes(level.id)) {
      for(let bits=0;bits<(1<<level.rotors.length);bits++)assert.equal(C.solveLevel(level,level.rotors.map((_,i)=>bits>>i&1)),null,'任何固定朝向都不能一招通关');
      for(let i=0;i<level.rotors.length;i++)assert.ok(turns.includes(i),'每个换路闸在解法中使用两态（初态也计入）');
    }
  }
});

test('钢珠机关：闭合挡板真实挡球，转开后同一路径可通过，矩形与渲染共用',()=>{
  const level=C.LEVELS[12],s=C.create(12),rotor=level.rotors[0],p=center(level,8);
  steer(s,p);const before=plain(s);
  for(let n=0;n<240;n++)C.step(s,.24,0);
  assert.ok(s.x<rotor.x-C.RADIUS,'不能从闭合闸穿过');assert.equal(s.rotors[0],0);
  s.x=level.start.x;s.y=level.start.y;s.vx=s.vy=0;assert.equal(C.rotate(s,0),true);
  steer(s,p);steer(s,center(level,9));assert.ok(s.x>rotor.x+C.RADIUS);
  assert.deepEqual(C.allWalls(level,s).at(-1),C.rotorWall(rotor,1));
  assert.equal(C.restore(before).rotors[0],0);
});

test('钢珠机关：完整扫掠区有球时拒转，最终矩形不碰球也不能扫穿；远处检查点不锁死操作',()=>{
  const s=C.create(16),l=C.LEVELS[16],r=l.rotors[0];
  s.x=r.x+50;s.y=r.y+50;s.vx=17;s.vy=-3;
  assert.equal(C.circleHit(s.x,s.y,C.RADIUS,C.rotorWall(r,1)),false,'最终位置虽不碰球');
  const before=plain(s);assert.equal(C.rotate(s,0),false);assert.deepEqual(s,before,'拒绝时不动球/朝向/存档');
  s.x=center(l,13).x;s.y=center(l,13).y;s.checkpoint=center(l,11);s.stars[0]=true;
  assert.equal(C.rotationClear(s,r),true);assert.equal(C.rotate(s,0),true,'旧收星点在扫掠区但球已离开可以转');
  assert.equal(C.positionClear(l,s,s.checkpoint.x,s.checkpoint.y),true);assert.equal(s.vx,0);assert.equal(s.vy,0);
  s.recover=.1;assert.equal(C.rotate(s,0),false);s.recover=0;s.won=true;assert.equal(C.rotate(s,0),false);
});

test('钢珠机关：第13关上方/左侧实际安全球位可转，右下扫掠及端帽/近轴/快速来球拒转',()=>{
  const l=C.LEVELS[12],r=l.rotors[0];
  for(const [x,y] of [[90,114],[116,100],[48,176]]) {
    const s=C.create(12);s.x=x;s.y=y;s.vx=70;s.vy=-20;
    assert.equal(C.positionClear(l,s,x,y),true,`safe fixture ${x},${y}`);
    assert.equal(C.rotationClear(s,r),true);assert.equal(C.rotate(s,0),true);
    assert.equal(C.positionClear(l,s,x,y),true);assert.equal(s.x,x);assert.equal(s.y,y);
    for(let n=0;n<120;n++){C.step(s,0,0);assert.equal(C.positionClear(l,s,s.x,s.y),true);}
  }
  for(const [dx,dy,vx,vy] of [[32,32,0,0],[64,0,0,0],[0,64,0,0],[-10,-10,0,0],[77,10,0,0],[10,77,0,0],[30,-22,0,220]]) {
    const s=C.create(12);s.x=r.x+dx;s.y=r.y+dy;s.vx=vx;s.vy=vy;
    const before=plain(s);assert.equal(C.rotationClear(s,r),false,`unsafe ${dx},${dy}`);
    assert.equal(C.rotate(s,0),false);assert.deepEqual(s,before);
  }
});

test('钢珠机关：所有获准旋转点逐角扫描真实厚挡板，不扫穿球或留下夹球',()=>{
  const r=C.LEVELS[12].rotors[0];let allowed=0,blocked=0;
  // Each possible angle uses the actual rotated rectangular bar, including square caps.
  for(let dx=-105;dx<=105;dx+=3)for(let dy=-105;dy<=105;dy+=3) {
    const safe=C.rotationClear({x:r.x+dx,y:r.y+dy,vx:0,vy:0},r);
    if(!safe){blocked++;continue;}allowed++;
    for(let n=0;n<=180;n++) {
      const a=n*Math.PI/360,c=Math.cos(a),s=Math.sin(a);
      const localX=dx*c+dy*s,localY=-dx*s+dy*c;
      assert.equal(C.circleHit(localX,localY,C.RADIUS,{x:-C.WALL/2,y:-C.WALL/2,w:r.length+C.WALL,h:C.WALL}),false,`unsafe accepted ${dx},${dy} angle ${n/2}`);
    }
  }
  assert.ok(allowed>2000&&blocked>500);
});

test('钢珠机关：任意合法初始朝向的持续大倾角仍不穿挡板',()=>{
  for(const l of C.LEVELS.slice(12))for(let bits=0;bits<(1<<l.rotors.length);bits++) {
    const s=C.create(l.id);s.rotors=l.rotors.map((_,i)=>bits>>i&1);
    for(const [x,y] of [[1,0],[0,-1],[-1,0],[0,1]])for(let n=0;n<180;n++) {
      C.step(s,x,y);assert.equal(C.positionClear(l,s,s.x,s.y),true,`level ${l.id+1} orientation ${bits}`);
    }
  }
});

test('钢珠机关：schema1缺朝向时用初始值，保存后精确恢复，拒绝错误朝向数组',()=>{
  const old=C.snapshot(C.create(4));delete old.rotors;const legacy=C.restore(old);
  assert.ok(legacy);assert.deepEqual(legacy.rotors,[]);assert.equal(legacy.x,old.x);assert.deepEqual(legacy.stars,old.stars);
  const s=C.create(12);assert.equal(C.rotate(s,0),true);s.stars[0]=true;const raw=C.snapshot(s),restored=C.restore(raw);
  assert.deepEqual(restored.rotors,[1]);assert.deepEqual(restored.stars,raw.stars);assert.equal(restored.x,raw.x);
  assert.equal(C.restore({...raw,rotors:[2]}),null);assert.equal(C.restore({...raw,rotors:[]}),null);
  const missing={...raw};delete missing.rotors;assert.deepEqual(C.restore(missing).rotors,[0]);
});

test('钢珠机关：新章节首关直接可玩，经典进度不变；机关关按自身进度解锁',t=>{
  const draft=C.snapshot(C.create(3));delete draft.rotors;
  const raw={schema:1,reached:5,completed:[0,1,2],current:3,draft};
  const {h,g}=game(t,{storage:{rugeMarbleMazeV1:JSON.stringify(raw)}});
  assert.equal(g.state().li,3);assert.equal(g.state().progress.reached,5);assert.equal(g.state().progress.mechanismReached,12);
  g.showLevels();assert.equal(h.node('#levelGrid').children[5].disabled,false);assert.equal(h.node('#levelGrid').children[6].disabled,true);
  assert.equal(h.node('#mechanismGrid').children[0].disabled,false);assert.equal(h.node('#mechanismGrid').children[1].disabled,true);
  h.node('#mechanismGrid').children[0].dispatch('click');assert.equal(g.state().li,12);assert.equal(g.state().progress.reached,5);
  g.start();const {ball,level}=g.world();ball.stars.fill(true);ball.x=level.goal.x;ball.y=level.goal.y;h.frame(30);
  assert.equal(g.state().progress.mechanismReached,13);assert.equal(g.state().progress.reached,5);
  h.click('#next');assert.equal(g.state().li,13);
});

test('钢珠机关：准备页直接点轴不跑物理，运行中直接点后保持运行，后台/终局禁转',t=>{
  const {h,g,events}=game(t);g.loadLevel(12);const before=g.state();
  h.node('#rotorButtons').children[0].dispatch('click');assert.deepEqual(plain(g.state().rotors),[1]);assert.ok(events.includes('select'));
  for(let n=0;n<100;n++)h.frame(30);assert.equal(g.state().time,before.time);assert.equal(g.state().x,before.x);
  h.click('#start');assert.equal(g.state().paused,false);h.node('#rotorButtons').children[0].dispatch('click');assert.deepEqual(plain(g.state().rotors),[0]);assert.equal(g.state().paused,false);
  h.emitWindow('ruge:pause');h.emitWindow('ruge:resume');assert.equal(g.state().paused,true);assert.equal(g.rotateRotor(0),false);
  h.click('#resume');assert.equal(g.state().paused,false);const {ball,level}=g.world();ball.stars.fill(true);ball.x=level.goal.x;ball.y=level.goal.y;h.frame(30);
  assert.equal(g.state().result,'win');assert.equal(g.rotateRotor(0),false);
});

test('钢珠机关：用户第13关上方球位可直接点开，真正扫掠区拒转，选回当前关仍能点',t=>{
  const {h,g,events}=game(t);g.loadLevel(12);const {ball,level}=g.world();ball.x=126;ball.y=98;ball.stars[0]=true;
  h.node('#rotorButtons').children[0].dispatch('click');assert.deepEqual(plain(ball.rotors),[1]);assert.equal(ball.x,126);assert.equal(ball.y,98);
  const r=level.rotors[0];ball.x=r.x+48;ball.y=r.y+48;const before=plain(ball);
  assert.equal(g.rotateRotor(0),false);assert.deepEqual(plain(ball),before);assert.equal(events.at(-1),'error');assert.equal(h.node('#toast').textContent,'球先让一让');
  g.loadLevel(12);g.showLevels();assert.equal(g.rotateRotor(0),false);h.node('#mechanismGrid').children[0].dispatch('click');
  assert.equal(h.node('#levels').hidden,true);assert.equal(h.node('#rotorButtons').children[0].hidden,false);assert.equal(g.rotateRotor(0),true);
});

test('钢珠机关：确认重置只重置本关球/星星/朝向，保留完成/其他游戏；封面无操作',t=>{
  const {h,g}=game(t,{storage:{other:'exact'}});g.loadLevel(12);g.rotateRotor(0);
  const {ball}=g.world();ball.stars[0]=true;g.save();const saved=JSON.parse(h.saved.get('rugeMarbleMazeV1'));
  h.click('#reset');assert.equal(h.node('#resetPanel').hidden,false);assert.equal(g.state().stars[0],true);
  h.click('#resetNo');assert.equal(g.state().stars[0],true);h.click('#reset');h.click('#resetYes');
  assert.equal(g.state().li,12);assert.equal(g.state().stars.some(Boolean),false);assert.deepEqual(plain(g.state().rotors),[0]);
  assert.deepEqual(plain(g.state().progress.completed),saved.completed);assert.equal(h.saved.get('other'),'exact');
  const cover=game(t,{cover:true});assert.equal(cover.g.rotateRotor(0),false);cover.h.click('#reset');assert.deepEqual(Object.fromEntries(cover.h.saved),{});
});
