import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';
function home(t,storage={},nativeAwake=false){
  const h=loadGame('.',{storage,instrument(source,index){
    if(index!==0||!nativeAwake)return source;
    return 'window.__awakeCalls=[];window.RugeScreen={keepAwakeEnabled:()=>false,keepAwake:v=>window.__awakeCalls.push(v),set:()=>{}};'+source;
  }});t.after(()=>h.dispose());return h;
}
const ids=h=>h.node('#cards').children.map(a=>a.dataset.id);
const select=(h,category)=>h.node(`[data-cat="${category}"]`).dispatch('click');

test('首页分组：十二款保留完整入口，重力三款单列分类，切换仅筛选不写游戏存档',t=>{
  const h=home(t,{userSave:'unchanged'});
  assert.equal(ids(h).length,12);assert.equal(ids(h)[0],'forest-juice');assert.ok(!ids(h).includes('bear-snack-shop'));
  for(const [category,expected] of [['learn',['hanzi-puzzle','hanzi-typing']],['tilt',['gravity-maze','number-merge','tilt-star-box']],['react',['flappy-bird','dino-runner','frog-pond']],['puzzle',['forest-juice','code-breaker','pipe-flow','paint-mixing']]]){
    h.node('#gameScroll').scrollTop=200;select(h,category);assert.deepEqual(ids(h),expected);assert.equal(h.node('#gameScroll').scrollTop,0);
    assert.equal(h.node(`[data-cat="${category}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(h.document.querySelectorAll('[data-cat]').filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
    for(const link of h.node('#cards').children){assert.equal(link.href,link.dataset.id+'/index.html');assert.ok(link.children[1].children[0].textContent.length>0);}
  }
  select(h,'all');assert.equal(ids(h).length,12);assert.deepEqual(Object.fromEntries(h.saved),{userSave:'unchanged'});
});

test('首页最近：按真实使用时间排序，隐藏下架记录，打开一项只更新该游戏并保留历史字段',t=>{
  const records={'gravity-maze':{last:100,plays:4,extra:'keep'},'code-breaker':{last:300,plays:2},'bear-snack-shop':{last:999,plays:1},'pipe-flow':{last:-1}};
  const original=JSON.stringify(records),h=home(t,{rugeCenter:original,other:'exact'});select(h,'recent');
  assert.deepEqual(ids(h),['code-breaker','gravity-maze']);assert.equal(h.saved.get('rugeCenter'),original);
  h.node('#cards').children[1].dispatch('click');const saved=JSON.parse(h.saved.get('rugeCenter'));
  assert.equal(saved['gravity-maze'].plays,5);assert.equal(saved['gravity-maze'].extra,'keep');assert.ok(saved['gravity-maze'].last>300);
  assert.deepEqual(saved['code-breaker'],records['code-breaker']);assert.deepEqual(saved['bear-snack-shop'],records['bear-snack-shop']);assert.equal(h.saved.get('other'),'exact');
  select(h,'recent');assert.deepEqual(ids(h),['gravity-maze','code-breaker']);
});

test('首页最近：空/坏记录显示简短空态，浏览分类不覆盖原记录，回全部继续正常使用',t=>{
  for(const raw of ['{}','null','[]','broken','"text"']){
    const h=home(t,{rugeCenter:raw,gameSave:'keep'});select(h,'recent');assert.equal(ids(h).length,0);assert.equal(h.node('#empty').hidden,false);assert.equal(h.node('#cards').hidden,true);
    assert.equal(h.saved.get('rugeCenter'),raw);select(h,'all');assert.equal(ids(h).length,12);assert.equal(h.node('#empty').hidden,true);assert.equal(h.saved.get('gameSave'),'keep');
  }
});

test('首页设置：图标保持音效/震动独立持久化，关闭有斜线和可读标签，常亮沿用原生偏好',t=>{
  const h=home(t,{rugeAwake:'true',rugeFeedbackV1:'{"sound":true,"vibration":true}',gameSave:'keep'},true);
  const sound=h.node('#soundToggle'),vibration=h.node('#vibrationToggle');
  h.click('#soundToggle');assert.equal(sound.getAttribute('aria-pressed'),'false');assert.equal(vibration.getAttribute('aria-pressed'),'true');assert.match(sound.innerHTML,/off-mark/);assert.equal(sound.getAttribute('aria-label'),'音效关闭');
  h.click('#vibrationToggle');assert.deepEqual(JSON.parse(h.saved.get('rugeFeedbackV1')),{sound:false,vibration:false});
  h.click('#soundToggle');assert.deepEqual(JSON.parse(h.saved.get('rugeFeedbackV1')),{sound:true,vibration:false});assert.doesNotMatch(sound.innerHTML,/off-mark/);
  assert.equal(h.node('#awake').getAttribute('aria-pressed'),'false','native awake preference takes priority');h.click('#awake');assert.equal(h.saved.get('rugeAwake'),'true');assert.deepEqual(Array.from(h.window.__awakeCalls),[true]);assert.equal(h.saved.get('gameSave'),'keep');
});
