import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/animal-balance/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.AnimalBalance,copy=x=>JSON.parse(JSON.stringify(x));
function game(t,storage={},cover=false){const h=loadGame('animal-balance',{storage,instrument:src=>cover?src.replace('cover=/[?&]cover=1(?:&|$)/.test(location.search)','cover=true'):src});t.after(()=>h.dispose());return {h,g:h.window.__game};}
test('水果天平18关全部用真实放置/称重求解，固定重量、限定只数、共享库存双桥',()=>{
  assert.equal(C.LEVELS.length,18);assert.equal(new Set(C.LEVELS.map(l=>l.weights.join(','))).size,1);assert.equal(C.LEVELS.filter(l=>l.targets.length===2).length,6);assert.ok(C.LEVELS.some(l=>l.exact.length));
  for(let i=0;i<18;i++){const answer=C.solve(i),s=C.createState(i);assert.ok(answer,'第 '+(i+1)+' 关可解');answer.forEach((pan,b)=>{pan.forEach(id=>assert.equal(C.place(s,b,id),true));assert.equal(C.weigh(s,b),0);});assert.equal(s.finished,true);assert.ok(C.remaining(s).every(n=>n>=0));for(const clue of C.LEVELS[i].clues)assert.equal(C.weight(i,clue.left),C.weight(i,clue.right),'图示线索不能说谎');assert.deepEqual(C.createState(i).pans,C.LEVELS[i].targets.map(()=>[]));}
});
test('库存和盘位限制不允许复制水果；越界/继承属性不改变本局',()=>{
  const s=C.createState(0);for(const id of [-1,6,'0',NaN,1.5,'constructor'])assert.equal(C.place(s,0,id),false);for(const b of [-1,9,1.5,'constructor']){assert.equal(C.place(s,b,0),false);assert.equal(C.remove(s,b,0),false);assert.equal(C.clear(s,b),false);}for(let i=0;i<3;i++)assert.equal(C.place(s,0,0),true);assert.equal(C.place(s,0,0),false);assert.equal(C.remove(s,0,3),false);assert.equal(C.remove(s,0,1),true);assert.equal(C.remaining(s)[0],1);assert.equal(C.clear(s,0),true);assert.equal(C.remaining(s)[0],3);assert.equal(C.clear(s,0),false);assert.throws(()=>C.createState(18));
});
test('轻重、数量不对与平衡是不同结果；未称重不能通关',()=>{
  const s=C.createState(0);assert.equal(C.weigh(s,0),null);C.place(s,0,0);assert.equal(C.weigh(s,0),-1);C.place(s,0,0);assert.equal(s.tested[0],null);assert.equal(s.finished,false);C.place(s,0,0);assert.equal(C.weigh(s,0),1);C.remove(s,0,0);assert.equal(C.weigh(s,0),0);assert.equal(s.finished,true);assert.equal(C.place(s,0,0),false);
  const limited=C.createState(14);C.place(limited,0,3);assert.equal(C.weigh(limited,0),2);assert.equal(limited.finished,false);
});
test('第13关双天平共享库存，已平衡盘可取回再分配',()=>{
 const s=C.createState(12);C.place(s,0,1);C.place(s,0,1);assert.equal(C.weigh(s,0),0);assert.equal(s.finished,false);assert.deepEqual(C.remaining(s),[0,2,1,0,0,0]);assert.equal(C.clear(s,0),true);assert.deepEqual(C.remaining(s),C.LEVELS[12].stock);for(const [b,pan] of C.solve(12).entries()){pan.forEach(id=>C.place(s,b,id));C.weigh(s,b);}assert.equal(s.finished,true);
});
test('水果存档保留草稿/星数，拒绝超库存、伪造轻重或胜利',()=>{
  const s=C.createState(12);C.place(s,0,1);C.weigh(s,0);const raw={schema:3,stars:[3,2],session:s};assert.deepEqual(C.restore(copy(raw)).session,s);assert.deepEqual(C.restore(raw).stars.slice(0,4),[3,2,0,0]);
  for(const change of [x=>x.pans[0].push(0),x=>x.tested[0]=0,x=>x.finished=true,x=>x.level=18,x=>x.attempts=-1,x=>x.pans[0]=['0'],x=>x.tested=[],x=>x.pans.push([])]){const bad=copy(raw);change(bad.session);assert.equal(C.restore(bad).session,null);}
});
test('真实页面18关连续求解与下一关，3星及18关解锁保存',t=>{
  const {h,g}=game(t,{other:'keep'});assert.equal(h.node('#levels').children.length,18);assert.equal(h.node('#levels').children[1].disabled,true);g.start(0);
  for(let i=0;i<18;i++){assert.equal(g.state().level,i);const answer=C.solve(i);answer.forEach((pan,b)=>{assert.equal(g.chooseBridge(b),true);pan.forEach(id=>{const button=h.node('#stock').children.find(n=>Number(n.dataset.animal)===id);button.onclick();});assert.equal(g.weigh(),0);assert.equal(g.busy(),true);assert.equal(g.add(0),false);h.tick(900);});assert.equal(g.state().finished,true);assert.equal(g.progress()[i],3);assert.equal(h.node('#win').hidden,false);h.node('#next').onclick();}
  assert.equal(h.node('#menu').hidden,false);assert.ok(h.node('#levels').children.every(n=>!n.disabled));assert.equal(h.saved.get('other'),'keep');assert.equal(C.restore(JSON.parse(h.saved.get(g.storageKey))).session.finished,true);
});
test('真实页面取回、重来确认、暂停和后台保留，称重动画不能重入',t=>{
  const {h,g}=game(t);g.start(0);g.add(0);h.node('#rightPan').children[0].onclick();assert.equal(g.state().pans[0].length,0);g.add(0);g.weigh();g.pause();assert.equal(g.busy(),false);assert.equal(g.isPaused(),true);assert.equal(g.add(0),false);h.tick(2000);h.emitWindow('ruge:resume');assert.equal(g.isPaused(),true);g.resume();assert.equal(g.state().tested[0],-1);h.node('#restart').onclick();assert.equal(h.node('#confirm').hidden,false);assert.equal(g.add(0),false);h.node('#cancelRestart').onclick();h.node('#restart').onclick();h.node('#confirmRestart').onclick();assert.equal(g.state().pans[0].length,0);assert.equal(g.state().attempts,0);g.add(0);h.emitWindow('pagehide');const next=game(t,Object.fromEntries(h.saved));assert.equal(next.g.state().pans[0].length,1);assert.equal(next.g.isPaused(),true);next.g.resume();assert.equal(next.g.add(0),true);
});
test('水果封面不读写游戏存档，坏档安全回选关',t=>{
  const {h,g}=game(t,{rugeAnimalBalanceV1:'untouched',other:'keep'},true);assert.equal(g.state().level,3);h.emitWindow('pagehide');g.menu();assert.equal(h.saved.get(g.storageKey),'untouched');assert.equal(h.saved.get('other'),'keep');const bad=game(t,{rugeAnimalBalanceV1:'bad'});assert.equal(bad.g.state(),null);assert.equal(bad.h.node('#menu').hidden,false);
});

test('旧版动物只迁移星数，不把不同重量的旧草稿放到新秤上',()=>{const s=C.createState(9);C.place(s,0,1);const restored=C.restore({schema:1,stars:[3,2,1],session:s});assert.deepEqual(restored.stars.slice(0,4),[3,2,1,0]);assert.equal(restored.session,null);});
test('真实阻尼天平即时按质量差摆动，有惯性并趋于平衡，不是固定角度',()=>{const p=C.createBalance();const first=C.advanceBalance(p,6,1,1/60);assert.ok(first<0&&first>C.targetAngle(6,1));assert.ok(p.velocity<0);for(let n=0;n<500;n++)C.advanceBalance(p,6,1,1/60);assert.ok(Math.abs(p.angle-C.targetAngle(6,1))<.001);assert.ok(Math.abs(C.targetAngle(6,2))>Math.abs(C.targetAngle(6,5)));const prev=p.angle;C.advanceBalance(p,6,6,1/60);assert.ok(p.angle>prev&&p.angle<0);for(let n=0;n<500;n++)C.advanceBalance(p,6,6,1/60);assert.ok(Math.abs(p.angle)<.001);assert.equal(C.targetAngle(3,6),-C.targetAngle(6,3));});
test('点放即时驱动秤杆，暂停停住物理、恢复继续，拖出秤盘不消耗水果',t=>{const {h,g}=game(t);g.start(0);for(let i=0;i<100;i++)h.frame();const empty=g.physics().angle;g.add(0);for(let i=0;i<30;i++)h.frame();assert.ok(g.physics().angle>empty);g.pause();const stopped=g.physics();for(let i=0;i<30;i++)h.frame();assert.deepEqual(g.physics(),stopped);g.resume();for(let i=0;i<30;i++)h.frame();assert.notDeepEqual(g.physics(),stopped);const btn=h.node('#stock').children[0];btn.dispatch('pointerdown',{clientX:50,clientY:50,pointerId:1});h.emitDocument('pointermove',{clientX:1000,clientY:1000,preventDefault(){}});h.emitDocument('pointerup',{clientX:1000,clientY:1000});assert.equal(g.state().pans[0].length,1);});

test('4.24旧水果草稿失效但星数与解锁保持，schema3只恢复新题',()=>{const old=C.createState(3);C.place(old,0,1);for(const schema of [1,2]){const r=C.restore({schema,stars:[3,2,1],session:old});assert.deepEqual(r.stars.slice(0,4),[3,2,1,0]);assert.equal(r.session,null);}assert.deepEqual(C.restore({schema:3,stars:[],session:old}).session,old);});
function vector(items){return Array.from({length:6},(_,id)=>items.filter(x=>x===id).length);}
function difference(a,b){const u=vector(a),v=vector(b);return u.map((n,i)=>n-v[i]);}
function rank(rows){const a=rows.map(r=>r.slice());let n=0;for(let c=0;c<6;c++){let p=a.findIndex((r,i)=>i>=n&&Math.abs(r[c])>1e-8);if(p<0)continue;[a[p],a[n]]=[a[n],a[p]];const d=a[n][c];a[n]=a[n].map(x=>x/d);for(let i=0;i<a.length;i++)if(i!==n){const m=a[i][c];a[i]=a[i].map((x,j)=>x-m*a[n][j]);}n++;}return n;}
const span=(rows,d)=>rank(rows)===rank([...rows,d]);
test('第3～18关所有合法答案都至少换算两条比例，不能直接照抄任一提示或目标',()=>{
 for(let i=2;i<18;i++){const l=C.LEVELS[i],rows=l.clues.map(c=>difference(c.left,c.right));assert.equal(l.clues.length,3);let count=0;const s=C.createState(i);
 function search(b){if(b===l.targets.length){count++;return;}const visit=start=>{if(C.result(s,b)===0){const d=difference(l.targets[b],s.pans[b]);assert.ok(d.some(Boolean),'不能放同形目标');assert.ok(span(rows,d),'线索必须足够推出答案');assert.ok(rows.every(r=>!span([r],d)),'不能单线索替换即解');search(b+1);}if(s.pans[b].length>=l.slots)return;for(let id=start;id<6;id++){if(C.place(s,b,id)){visit(id);C.remove(s,b,s.pans[b].length-1);}}};visit(0);}
 search(0);assert.ok(count>0,'所有后段题可解');}
});
