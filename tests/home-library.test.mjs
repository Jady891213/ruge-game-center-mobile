import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {loadGame} from './helpers/html-vm.mjs';
function home(t,storage={},nativeAwake=false){
  const h=loadGame('.',{storage,instrument(source,index){
    if(index!==0||!nativeAwake)return source;
    return 'window.__awakeCalls=[];window.RugeScreen={keepAwakeEnabled:()=>false,keepAwake:v=>window.__awakeCalls.push(v),set:()=>{}};'+source;
  }});t.after(()=>h.dispose());return h;
}
const ids=h=>h.node('#cards').children.map(a=>a.dataset.id);
const select=(h,category)=>h.node(`[data-cat="${category}"]`).dispatch('click');

test('首页分组：十八个入口包含独立字库，反应四款，切换仅筛选不写游戏存档',t=>{
  const h=home(t,{userSave:'unchanged'});
  assert.equal(ids(h).length,18);assert.equal(ids(h)[0],'animal-balance');assert.ok(!ids(h).includes('bear-snack-shop'));assert.ok(!ids(h).includes('dino-runner'));
  for(const [category,expected] of [['learn',['hanzi-puzzle','hanzi-typing','hanzi-library']],['tilt',['pocket-radar','gravity-maze','number-merge','tilt-star-box']],['react',['pitch-adventure','voice-quest','flappy-bird','frog-pond']],['puzzle',['animal-balance','hat-trick','camera-color','forest-juice','code-breaker','pipe-flow','paint-mixing']]]){
    h.node('#gameScroll').scrollTop=200;select(h,category);assert.deepEqual(ids(h),expected);assert.equal(h.node('#gameScroll').scrollTop,0);
    assert.equal(h.node(`[data-cat="${category}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(h.document.querySelectorAll('[data-cat]').filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
    for(const link of h.node('#cards').children){assert.equal(link.href,link.dataset.id+'/index.html');assert.ok(link.children[1].children[0].textContent.length>0);assert.ok(existsSync(new URL('../app/assets/'+link.href,import.meta.url)));assert.ok(existsSync(new URL('../app/assets/shared/'+link.dataset.id+'.png',import.meta.url)));}
  }
  select(h,'all');assert.equal(ids(h).length,18);assert.deepEqual(Object.fromEntries(h.saved),{userSave:'unchanged'});
});

test('首页最近：按真实使用时间排序，隐藏下架记录，打开一项只更新该游戏并保留历史字段',t=>{
  const records={'gravity-maze':{last:100,plays:4,extra:'keep'},'code-breaker':{last:300,plays:2},'bear-snack-shop':{last:999,plays:1},'dino-runner':{last:1000,plays:7},'pipe-flow':{last:-1}};
  const original=JSON.stringify(records),dinoStats=JSON.stringify({'dino-runner':{last:1000,score:321}}),h=home(t,{rugeCenter:original,dinoDashHi:'321',rugeStat:dinoStats,other:'exact'});select(h,'recent');
  assert.deepEqual(ids(h),['code-breaker','gravity-maze']);assert.equal(h.saved.get('rugeCenter'),original);
  h.node('#cards').children[1].dispatch('click');const saved=JSON.parse(h.saved.get('rugeCenter'));
  assert.equal(saved['gravity-maze'].plays,5);assert.equal(saved['gravity-maze'].extra,'keep');assert.ok(saved['gravity-maze'].last>300);
  assert.deepEqual(saved['code-breaker'],records['code-breaker']);assert.deepEqual(saved['bear-snack-shop'],records['bear-snack-shop']);assert.deepEqual(saved['dino-runner'],records['dino-runner']);assert.equal(h.saved.get('dinoDashHi'),'321');assert.equal(h.saved.get('rugeStat'),dinoStats);assert.equal(h.saved.get('other'),'exact');
  select(h,'recent');assert.deepEqual(ids(h),['gravity-maze','code-breaker']);
});

test('首页最近：空/坏记录显示简短空态，浏览分类不覆盖原记录，回全部继续正常使用',t=>{
  for(const raw of ['{}','null','[]','broken','"text"']){
    const h=home(t,{rugeCenter:raw,gameSave:'keep'});select(h,'recent');assert.equal(ids(h).length,0);assert.equal(h.node('#empty').hidden,false);assert.equal(h.node('#cards').hidden,true);
    assert.equal(h.saved.get('rugeCenter'),raw);select(h,'all');assert.equal(ids(h).length,18);assert.equal(h.node('#empty').hidden,true);assert.equal(h.saved.get('gameSave'),'keep');
  }
});

test('下架恐龙：当前可打包 assets 移除实现与封面，历史原版快照保留',()=>{
  assert.equal(existsSync(new URL('../app/assets/dino-runner/',import.meta.url)),false);
  assert.equal(existsSync(new URL('../app/assets/shared/dino-runner.png',import.meta.url)),false);
  assert.equal(existsSync(new URL('../reference/phone-v4.1/assets/dino-runner/index.html',import.meta.url)),true);
});

test('首页设置：图标保持音效/震动独立持久化，关闭有斜线和可读标签，常亮沿用原生偏好',t=>{
  const h=home(t,{rugeAwake:'true',rugeFeedbackV1:'{"sound":true,"vibration":true}',gameSave:'keep'},true);
  const sound=h.node('#soundToggle'),vibration=h.node('#vibrationToggle');
  h.click('#soundToggle');assert.equal(sound.getAttribute('aria-pressed'),'false');assert.equal(vibration.getAttribute('aria-pressed'),'true');assert.match(sound.innerHTML,/off-mark/);assert.equal(sound.getAttribute('aria-label'),'音效关闭');
  h.click('#vibrationToggle');assert.deepEqual(JSON.parse(h.saved.get('rugeFeedbackV1')),{sound:false,vibration:false});
  h.click('#soundToggle');assert.deepEqual(JSON.parse(h.saved.get('rugeFeedbackV1')),{sound:true,vibration:false});assert.doesNotMatch(sound.innerHTML,/off-mark/);
  assert.equal(h.node('#awake').getAttribute('aria-pressed'),'false','native awake preference takes priority');h.click('#awake');assert.equal(h.saved.get('rugeAwake'),'true');assert.deepEqual(Array.from(h.window.__awakeCalls),[true]);assert.equal(h.saved.get('gameSave'),'keep');
});


test('独立识字库：打开入口只更新自身最近记录，原拼音与找字进度逐字节保留',t=>{
  const oldTyping='{"lv":{"0":{"grade":"A","score":1800,"plays":2}},"best":1800,"days":{}}';
  const oldPuzzle='{"schema":1,"reached":8,"draft":{"selected":[3,2,4]}}';
  const records={'hanzi-typing':{last:100,plays:8,custom:'keep'},'hanzi-puzzle':{last:300,plays:6}};
  const original={hzTypingSave2:oldTyping,rugeHanziStrokesV1:oldPuzzle,rugeCenter:JSON.stringify(records),other:'原样保留'};
  const h=home(t,original);select(h,'learn');
  const library=h.node('#cards').children.find(card=>card.dataset.id==='hanzi-library');
  assert.ok(library);assert.equal(library.href,'hanzi-library/index.html');
  assert.deepEqual(Object.fromEntries(h.saved),original,'切换认字分类不推断已掌握，也不写游戏数据');
  library.dispatch('click');
  const after=JSON.parse(h.saved.get('rugeCenter'));
  assert.equal(after['hanzi-library'].plays,1);assert.ok(after['hanzi-library'].last>300);
  assert.deepEqual(after['hanzi-typing'],records['hanzi-typing']);assert.deepEqual(after['hanzi-puzzle'],records['hanzi-puzzle']);
  assert.equal(h.saved.get('hzTypingSave2'),oldTyping);assert.equal(h.saved.get('rugeHanziStrokesV1'),oldPuzzle);assert.equal(h.saved.get('other'),original.other);
  select(h,'recent');assert.equal(ids(h)[0],'hanzi-library');
  const keys=[...h.saved.keys()].sort();assert.deepEqual(keys,Object.keys(original).sort(),'不新建或重命名旧游戏存档键');
});
