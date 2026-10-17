import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(new URL('../app/assets/hanzi-puzzle/strokes.js',import.meta.url),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('../app/assets/hanzi-puzzle/levels-extra.js',import.meta.url),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('../app/assets/hanzi-puzzle/core.js',import.meta.url),'utf8'),ctx);
for(const name of ['composites','answer-catalog'])vm.runInContext(fs.readFileSync(new URL(`../app/assets/hanzi-puzzle/${name}.js`,import.meta.url),'utf8'),ctx);
const H=ctx.window.HanziStrokes,D=ctx.window.HanziStrokeData;
const plain=x=>JSON.parse(JSON.stringify(x));
function memory(initial={}){const values=new Map(Object.entries(initial));let writes=0;return {getItem:k=>values.get(k)??null,setItem(k,v){writes++;values.set(k,v);},values,get writes(){return writes;}};}
function finish(g){const li=g.state().current;for(const t of H.LEVELS[li].targets){assert.equal(g.setSelection(t.sets[0]),true);assert.equal(g.submit().status,'success');}assert.equal(g.state().done,true);}
function atLevel(li,storage=null){const g=H.createGame({storage});for(let i=0;i<li;i++){finish(g);assert.equal(g.next(),true);}return g;}
test('六十关真实离线字形完整，目标只用原字整笔且原字本身也是答案',()=>{
 assert.equal(H.LEVELS.length,60);assert.equal(H.LEVELS[9].source,'意');
 H.LEVELS.forEach((lv,li)=>{
  assert.equal(lv.parts.reduce((n,p)=>n+D[p.char].strokes.length,0),H.STROKE_COUNTS[li]);
  assert(lv.targets.length<=20);assert(new Set(lv.targets.map(t=>t.char)).size===lv.targets.length);
  for(const part of lv.parts){assert.equal(D[part.char].medians.length,part.count);assert.equal(H.match(li,Array.from({length:part.count},(_,i)=>i+part.offset))?.char,part.char);}
  assert(lv.targets.length>=2);assert(lv.targets.every(t=>t.pinyin));
  if(lv.parts.length===1)assert.equal(H.match(li,Array.from({length:H.STROKE_COUNTS[li]},(_,i)=>i))?.char,lv.source);
  const used=new Map();
  for(const t of lv.targets)for(const s of t.sets){const k=[...s].sort((a,b)=>a-b).join(',');assert(!used.has(k),'同一笔画组合不能歧义');used.set(k,t.char);assert.equal(H.match(li,s)?.char,t.char);assert.equal(H.match(li,[...s].reverse())?.char,t.char);}
 });
});
test('每关所有横画单横/两横/三横替代组合均识别，不漏一二三',()=>{
 const hs=[[0,1,2],[0,1,3],[0],[2,4],[3,4],[0,4],[2,3,4],[2],[2,3,4],[1,4,7,8]];
 hs.forEach((indices,li)=>{
  for(let n=1;n<=Math.min(3,indices.length);n++)for(const s of H.combinations(indices,n)){
   const ch=['一','二','三'][n-1];
   assert.equal(H.match(li,s)?.char,ch,`${li+1} 关 ${s}`);
  }
 });
});
test('意的九个明确答案与部件整笔组合可收，心点不可冒充旦底横',()=>{
 const lv=H.LEVELS[9];assert.deepEqual(plain(lv.targets.map(t=>t.char)).sort(),['一','二','三','口','日','立','心','音','意'].sort());
 for(const [ch,selection] of Object.entries({口:[5,6,8],日:[5,6,7,8],立:[0,1,2,3,4],心:[9,10,11,12],音:[0,1,2,3,4,5,6,7,8]}))assert.equal(H.match(9,selection)?.char,ch);
 assert.equal(H.match(9,[5,6,7,8,9]),null);assert.equal(H.match(9,[5,6,7,8,10]),null);
});
test('木和米的同一撇捺只认人，不把八也当成另一答案',()=>{
 assert.equal(H.match(2,[2,3])?.char,'人');assert.equal(H.match(7,[4,5])?.char,'人');
 assert(!H.LEVELS[2].targets.some(t=>t.char==='八'));assert(!H.LEVELS[7].targets.some(t=>t.char==='八'));
});
test('选择可反选；空选、坏索引、重复笔、错误组合不消耗答案',()=>{
 const g=H.createGame();assert.equal(g.submit().status,'empty');assert.equal(g.toggle(0),true);assert.deepEqual(plain(g.state().selected),[0]);g.toggle(0);assert.deepEqual(plain(g.state().selected),[]);
 assert.equal(g.toggle(-1),false);assert.equal(g.toggle(3),false);assert.equal(g.setSelection([0,0]),false);
 const invalid=atLevel(1);invalid.setSelection([0,2]);assert.equal(invalid.submit().status,'invalid');assert.deepEqual(plain(invalid.state().found[1]),[]);assert.deepEqual(plain(invalid.state().selected),[0,2]);
 for(const bad of [null,[],[0,0],[-1],[0,999],['0'],[NaN]])assert.equal(H.match(0,bad),null);
});
test('同答案不同笔画只收一次，成功清选择而重复保留当前草稿，整局每字只计一次',()=>{
 const g=H.createGame();g.setSelection([0]);assert.equal(g.submit().char,'一');assert.deepEqual(plain(g.state().selected),[]);
 g.setSelection([2]);assert.equal(g.submit().status,'repeat');assert.equal(g.state().found[0].length,1);assert.deepEqual(plain(g.state().selected),[2]);
 g.setSelection([0,2]);const result=g.submit();assert.equal(result.status,'success');assert.equal(result.complete,false);assert.equal(g.state().done,false);g.setSelection([0,1,2]);assert.equal(g.submit().char,'三');assert.equal(g.state().done,true);assert.equal(g.submit().status,'complete');assert.equal(g.toggle(1),false);
});
test('六十关可以真实逐关全部通关，完成才解锁，最后一关不越界',()=>{
 const g=H.createGame();assert.equal(g.next(),false);assert.equal(g.loadLevel(1),false);
 for(let li=0;li<H.LEVELS.length;li++){assert.equal(g.state().current,li);finish(g);if(li<H.LEVELS.length-1){assert.equal(g.state().unlocked,li+1);assert.equal(g.next(),true);}else assert.equal(g.next(),false);}
 assert.equal(g.state().current,H.LEVELS.length-1);assert.equal(g.state().found.flat().length,H.LEVELS.reduce((n,lv)=>n+lv.targets.length,0));
});
test('重来只清当前关，保留其他收集和已解锁关，提示只显示组合不代提交',()=>{
 const g=atLevel(2);g.setSelection([0]);g.submit();const before=plain(g.state().found);assert.equal(g.loadLevel(0),true);g.reset();
 assert.deepEqual(plain(g.state().found[0]),[]);assert.deepEqual(plain(g.state().found[1]),before[1]);assert.deepEqual(plain(g.state().found[2]),before[2]);assert.equal(g.state().unlocked,2);
 const snapshot=plain(g.state());assert.deepEqual(plain(g.hint()),[0]);assert.deepEqual(plain(g.state()),snapshot);assert.equal(g.loadLevel(2),true);
});
test('新键保存/恢复收集、草稿与关卡，旧汉字存档和别的游戏不动',()=>{
 const legacy='{"old":"unchanged"}',s=memory({hzPuzzleProgress1:legacy,rugeCodebreakerV1:'other'}),g=atLevel(3,s);
 g.setSelection([2]);g.submit();g.setSelection([0,1,4]);const before=plain(g.state()),restored=H.createGame({storage:s});assert.deepEqual(plain(restored.state()),before);
 assert.equal(s.values.get('hzPuzzleProgress1'),legacy);assert.equal(s.values.get('rugeCodebreakerV1'),'other');
 restored.loadLevel(0);restored.reset();const again=H.createGame({storage:s});assert.equal(again.state().unlocked,3);assert.deepEqual(plain(again.state().found[3]),['一']);
});
test('非法/破损存档安全回空白，答案和草稿严格筛选',()=>{
 for(const raw of ['broken','null','{}','{"schema":9,"found":[]}']){const g=H.createGame({storage:memory({[H.KEY]:raw})});assert.equal(g.state().current,0);assert.equal(g.state().found.flat().length,0);}
 const bad={schema:1,current:999,reached:900,selected:[-1,0],found:[['一','一','假的'],['假的'],null]};
 const s=H.sanitize(bad);assert.equal(s.current,0);assert.equal(s.reached,0);assert.deepEqual(plain(s.found[0]),['一']);assert.deepEqual(plain(s.found[1]),[]);assert.deepEqual(plain(s.selected),[]);
 const g=H.createGame({storage:{getItem(){throw Error('denied');},setItem(){throw Error('quota');}}});g.toggle(0);assert.equal(g.submit().status,'success');
});
test('封面模式忽略存档且所有操作禁止写入',()=>{
 const s=memory({[H.KEY]:'do not touch',hzPuzzleProgress1:'old'}),g=H.createGame({storage:s,cover:true});
 for(let i=0;i<10;i++){finish(g);g.next();}g.loadLevel(0);g.reset();g.toggle(0);g.clear();g.hint();
 assert.equal(s.writes,0);assert.equal(s.values.get(H.KEY),'do not touch');assert.equal(s.values.get('hzPuzzleProgress1'),'old');
});
test('触摸容错按最近中线命中，交叉处不会一概选顶层笔画',()=>{
 const m=[[[0,0],[100,0]],[[50,-100],[50,100]]];
 assert.equal(H.nearestStroke(m,55,40,20),1);assert.equal(H.nearestStroke(m,90,6,20),0);assert.equal(H.nearestStroke(m,250,250,20),-1);
 H.LEVELS.forEach(lv=>lv.parts.forEach(part=>D[part.char].medians.forEach((line,i)=>{
  const candidates=line.map(p=>H.nearestStroke(D[part.char].medians,p[0],p[1],52));assert(candidates.includes(i),`${part.char} 第 ${i+1} 笔可被点选`);
 })));
});

test('旧版已收集答案和已解锁关卡保留，新增原字须玩家完整选笔提交',()=>{
 const found=H.LEVELS.slice(0,10).map(lv=>lv.targets.filter(t=>t.char!==lv.source).map(t=>t.char));
 const raw={schema:1,current:9,reached:9,selected:[],found};
 const g=H.createGame({storage:memory({[H.KEY]:JSON.stringify(raw)})});
 assert.deepEqual(plain(g.state().found.slice(0,10)),plain(found));assert(g.state().found.slice(10).every(a=>a.length===0));assert.equal(g.state().unlocked,9);assert.equal(g.state().done,false);
 assert.deepEqual(plain(g.hint()),Array.from({length:13},(_,i)=>i));
 g.setSelection(Array.from({length:13},(_,i)=>i));assert.equal(g.submit().char,'意');assert.equal(g.state().done,true);
 g.loadLevel(0);assert.equal(g.state().done,false);g.setSelection([0,1,2]);assert.equal(g.submit().char,'三');assert.equal(g.state().done,true);
});

test('多字关有真实跨字答案，单字来自各自字板且无重复计分',()=>{
 const words=H.LEVELS.filter(l=>l.parts.length>1);assert(words.length>=30);assert(words.some(l=>l.parts.length===3));
 for(const lv of words){const li=H.LEVELS.indexOf(lv);assert(lv.targets.some(t=>t.sets.some(set=>new Set(set.map(i=>lv.parts.findIndex(p=>i>=p.offset&&i<p.offset+p.count))).size>1)),lv.source+' 应有跨字组合');
  for(const t of lv.targets)assert.equal([...t.char].length,1,'答案为一个汉字');
 }
});
test('已完成旧十关的存档自动解锁第十一关，原收集与其他存档不变',()=>{
 const old={schema:1,current:9,reached:9,selected:[],found:H.LEVELS.slice(0,10).map(l=>l.targets.map(t=>t.char))};
 const storage=memory({[H.KEY]:JSON.stringify(old),hzTypingSave2:'unchanged'}),g=H.createGame({storage});
 assert.equal(g.state().unlocked,10);assert.equal(g.state().current,9);assert.equal(g.next(),true);assert.equal(g.state().current,10);assert.equal(g.state().found.length,60);assert.equal(storage.getItem('hzTypingSave2'),'unchanged');
});

test('多字题可跨字板选整横组成二和三，重复答案不拆成多个目标',()=>{
 const li=H.LEVELS.findIndex(l=>l.source==='木木木');assert.equal(H.match(li,[0,4])?.char,'二');assert.equal(H.match(li,[0,4,8])?.char,'三');
 assert.equal(H.LEVELS[li].targets.filter(t=>t.char==='三').length,1);
});

test('田的口重复提交保留原选笔和存档，反复提交不改变收集/解锁，重启后草稿仍在',()=>{
 const storage=memory(),g=atLevel(3,storage);g.setSelection([0,1,4]);assert.equal(g.submit().char,'口');
 g.setSelection([4,0,1]);const before=plain(g.state()),saved=storage.getItem(H.KEY),writes=storage.writes;
 for(let i=0;i<3;i++){assert.equal(g.submit().status,'repeat');assert.deepEqual(plain(g.state()),before);}
 assert.equal(storage.getItem(H.KEY),saved);assert.equal(storage.writes,writes,'重复提示不改写已经保存的草稿');
 const restored=H.createGame({storage});assert.deepEqual(plain(restored.state()),before);
 restored.toggle(2);assert.equal(restored.submit().char,'日');assert.deepEqual(plain(restored.state().selected),[],'真正找到新字仍清选笔');
});
