import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=readFileSync(new URL('../app/assets/shared/players.js',import.meta.url),'utf8');
const LIB='rugePlayersV1', JOURNAL='rugePlayersTransactionV1';
function backend(seed={}){return{data:new Map(Object.entries(seed)), writes:0, failAt:0, persistentFailure:false, trace:[]};}
function page(shared,{path='/index.html',search='',constructor=true}={}){
  const events=new Map(),navigations=[];
  class Storage {
    constructor(data){this.data=data;}
    getItem(key){return this.data.get(String(key))??null;}
    key(index){return[...this.data.keys()][index]??null;}
    get length(){return this.data.size;}
    write(fn){shared.writes++;if(shared.failAt&&(shared.writes===shared.failAt||shared.persistentFailure&&shared.writes>=shared.failAt)){const e=Error('quota');e.name='QuotaExceededError';throw e;}fn();shared.trace.push(Object.fromEntries(shared.data));}
    setItem(key,value){this.write(()=>this.data.set(String(key),String(value)));}
    removeItem(key){this.write(()=>this.data.delete(String(key)));}
    clear(){this.write(()=>this.data.clear());}
  }
  const localStorage=new Storage(shared.data),sessionStorage=new Storage(new Map());
  const location={pathname:path,search,reload(){navigations.push('reload');},replace(url){navigations.push(url);}};
  const context={localStorage,sessionStorage,URL,location,document:{currentScript:{src:'http://test/shared/players.js'}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},dispatchEvent(e){for(const f of events.get(e.type)||[])f(e);}};
  if(constructor)context.Storage=Storage;
  context.window=context;vm.runInNewContext(source,context);
  return{P:context.RugePlayers,storage:localStorage,session:sessionStorage,navigations,emit:(type,init={})=>context.dispatchEvent({type,...init})};
}
const object=shared=>Object.fromEntries(shared.data);
const settings={rugeFeedbackV1:'{"sound":false,"vibration":true}',rugeMuted:'true',rugeMusicV1:'global-music',rugeAwake:'false',rugeTheme:'cream',gmFlipX:'1',unrecognized:'keep',serviceCredential:'synthetic-global-only'};
function seedEveryKey(){const h=page(backend());return Object.fromEntries(h.P.progressKeys.map((key,i)=>[key,'original-'+i+'-原样']));}
function physical(h){return Object.fromEntries(h.P.progressKeys.flatMap(k=>h.storage.getItem(k)===null?[]:[[k,h.storage.getItem(k)]]));}
function snapshotAll(shared){return Object.fromEntries(shared.data);}

test('首次启动保留全部旧键，不创建玩家库；读接口没有持久化副作用',()=>{
  const old={...seedEveryKey(),...settings},shared=backend(old),h=page(shared);
  assert.deepEqual(object(shared),old);assert.equal(shared.writes,0);
  assert.equal(h.P.current().id,'default');assert.equal(h.P.current().name,'小玩家');assert.equal(h.P.list().length,1);
  assert.equal(h.P.state().persistent,false);assert.equal(h.P.state().ready,true);assert.equal(shared.writes,0);
  assert.deepEqual(physical(h),seedEveryKey());
});

test('每个现行及历史游戏键和最近记录逐字节隔离，切回恢复，未知键及偏好全局保留',()=>{
  const original=seedEveryKey(),shared=backend({...original,...settings}),h=page(shared);
  const a=h.P.create('小桃','rabbit'),b=h.P.create('小熊','bear');assert.equal(h.P.current().id,'default');
  h.P.select(a.id);assert.deepEqual(physical(h),{});
  const aValues=Object.fromEntries(h.P.progressKeys.map((k,i)=>[k,'A-'+i]));for(const [k,v]of Object.entries(aValues))h.storage.setItem(k,v);
  h.P.select(b.id);assert.deepEqual(physical(h),{});h.storage.setItem('rugeBrainSchoolV1','B-brain');h.storage.setItem('rugeCenter','B-recent');
  h.P.select('default');assert.deepEqual(physical(h),original);
  h.P.select(a.id);assert.deepEqual(physical(h),aValues);
  h.P.select(b.id);assert.deepEqual(physical(h),{rugeBrainSchoolV1:'B-brain',rugeCenter:'B-recent'});
  for(const [k,v]of Object.entries(settings))assert.equal(shared.data.get(k),v);
  assert.equal(shared.data.has(JOURNAL),false);assert.ok(!shared.data.get(LIB).includes('synthetic-global-only'));
});

test('重置非当前玩家仅清它的记录；重置当前玩家增加版本并保留其他玩家',()=>{
  const original=seedEveryKey(),shared=backend({...original,...settings}),h=page(shared),a=h.P.create('小桃','cat');
  h.P.select(a.id);h.storage.setItem('frogPondHi','88');h.storage.setItem('rugeCenter','A recent');
  h.P.reset('default');assert.deepEqual(physical(h),{frogPondHi:'88',rugeCenter:'A recent'});
  h.P.select('default');assert.deepEqual(physical(h),{});h.storage.setItem('flappyDashBest','12');
  const oldDocument=page(shared,{path:'/flappy-bird/index.html'}),epoch=h.P.state().epoch;
  h.P.reset('default');assert.deepEqual(physical(h),{});assert.equal(h.P.state().epoch,epoch+1);
  assert.throws(()=>oldDocument.storage.setItem('flappyDashBest','900'),{name:'InvalidStateError'});
  h.P.select(a.id);assert.deepEqual(physical(h),{frogPondHi:'88',rugeCenter:'A recent'});
  for(const [k,v]of Object.entries(settings))assert.equal(shared.data.get(k),v);
});

test('名字和头像可修改，支持中文与 emoji；拒绝空白、重名和超长名字且不写存储',()=>{
  const shared=backend({frogPondHi:'23'}),h=page(shared);h.P.rename('default','小鸽🕊️','fox');
  assert.equal(h.P.current().name,'小鸽🕊️');assert.equal(h.P.current().avatar,'fox');assert.equal(h.storage.getItem('frogPondHi'),'23');
  const a=h.P.create('弟弟','cat');h.P.rename(a.id,'妹妹','rabbit');assert.equal(h.P.list()[1].name,'妹妹');
  const before=object(shared),writes=shared.writes;
  for(const name of ['', '  ', '妹妹', '一二三四五六七八九'])assert.throws(()=>h.P.create(name,'bear'));
  assert.equal(shared.writes,writes);assert.deepEqual(object(shared),before);
});

test('旧游戏页面的迟到写、删除和 clear 都被挡住，读取不会串给新玩家，pageshow 返回首页',()=>{
  const shared=backend({frogPondHi:'55',...settings}),home=page(shared),old=page(shared,{path:'/frog-pond/index.html'});
  const a=home.P.create('小猫','cat');home.P.select(a.id);home.storage.setItem('frogPondHi','7');
  assert.equal(old.storage.getItem('frogPondHi'),null);
  assert.throws(()=>old.storage.setItem('frogPondHi','99'),{name:'InvalidStateError'});
  assert.throws(()=>old.storage.removeItem('frogPondHi'),{name:'InvalidStateError'});assert.throws(()=>old.storage.clear(),{name:'InvalidStateError'});
  assert.equal(home.storage.getItem('frogPondHi'),'7');old.emit('pageshow');assert.deepEqual(old.navigations,['http://test/index.html']);
  assert.throws(()=>old.P.select('default'),{name:'InvalidStateError'});
  // A stale game can still read/write the shared preference keys normally.
  old.storage.setItem('rugeAwake','true');assert.equal(home.storage.getItem('rugeAwake'),'true');
});

test('Storage 正常枚举与 sessionStorage 不受影响；clear 只清当前玩家，不删库和共享设置',()=>{
  const shared=backend({frogPondHi:'55',...settings}),h=page(shared);const a=h.P.create('妹妹','rabbit');
  const length=h.storage.length;assert.equal([...Array(length)].map((_,i)=>h.storage.key(i)).length,length);
  h.session.setItem('frogPondHi','session');h.session.clear();assert.equal(h.session.length,0);
  assert.throws(()=>h.storage.removeItem(LIB),{name:'InvalidStateError'});
  h.storage.clear();assert.equal(h.storage.getItem('frogPondHi'),null);assert.equal(h.P.list().length,2);h.P.select(a.id);h.P.select('default');assert.equal(h.storage.getItem('frogPondHi'),null);
  for(const [k,v]of Object.entries(settings))assert.equal(shared.data.get(k),v);
});

function prepared(){
  const shared=backend({frogPondHi:'original',rugeCenter:'original-recent',...settings}),h=page(shared),a=h.P.create('妹妹','rabbit');
  h.P.select(a.id);h.storage.setItem('frogPondHi','A-save');h.storage.setItem('rugeHanziStrokesV1','A-hanzi');
  h.P.select('default');return{shared,h,a};
}

test('交易每一处 quota 写失败都回滚或完成已提交状态，无半写交换',()=>{
  const probe=prepared(),start=probe.shared.writes;probe.h.P.select(probe.a.id);const count=probe.shared.writes-start;
  assert.ok(count>=5);
  for(let offset=1;offset<=count;offset++){
    const{shared,h,a}=prepared(),before=object(shared);shared.failAt=shared.writes+offset;let succeeded=false;
    try{h.P.select(a.id);succeeded=true;}catch(e){assert.equal(e.name,'QuotaExceededError');}
    if(succeeded){assert.equal(h.P.current().id,a.id);assert.deepEqual(physical(h),{frogPondHi:'A-save',rugeHanziStrokesV1:'A-hanzi'});}
    else assert.deepEqual(object(shared),before,'失败点 '+offset+' 应逐字节回滚');
    assert.equal(shared.data.has(JOURNAL),false);for(const[k,v]of Object.entries(settings))assert.equal(shared.data.get(k),v);
  }
});

test('持久 quota 阻止回滚时保留日志并阻断游戏，下一次加载成功恢复旧槽',()=>{
  const{shared,h,a}=prepared(),before=object(shared);shared.failAt=shared.writes+3;shared.persistentFailure=true;
  assert.throws(()=>h.P.select(a.id));assert.equal(shared.data.has(JOURNAL),true);assert.equal(h.P.state().ready,false);
  assert.throws(()=>h.storage.setItem('frogPondHi','late'),{name:'InvalidStateError'});
  shared.failAt=0;const recovered=page(shared);assert.deepEqual(object(shared),before);assert.equal(recovered.P.state().ready,true);
});

test('清空当前进度发生写失败时恢复原值；重新加载后其它玩家仍可恢复',()=>{
  const{shared,h,a}=prepared(),before=object(shared);shared.failAt=shared.writes+3;
  assert.throws(()=>h.P.reset('default'),{name:'QuotaExceededError'});assert.deepEqual(object(shared),before);
  shared.failAt=0;const next=page(shared);next.P.select(a.id);assert.deepEqual(physical(next),{frogPondHi:'A-save',rugeHanziStrokesV1:'A-hanzi'});
});

test('真实交易的每个崩溃截面：提交点之前恢复旧槽，之后完成目标槽',()=>{
  const{shared,h,a}=prepared();shared.trace=[];h.P.select(a.id);
  const states=shared.trace.filter(values=>values[JOURNAL]);assert.ok(states.length>=4);
  for(const state of states){
    const log=JSON.parse(state[JOURNAL]),committed=state[LIB]===log.afterLibrary,crashed=backend(state),recovered=page(crashed);
    assert.equal(crashed.data.has(JOURNAL),false);assert.equal(recovered.P.current().id,committed?a.id:'default');
    assert.deepEqual(physical(recovered),committed?{frogPondHi:'A-save',rugeHanziStrokesV1:'A-hanzi'}:{frogPondHi:'original',rugeCenter:'original-recent'});
    assert.equal(recovered.P.state().ready,true);for(const[k,v]of Object.entries(settings))assert.equal(crashed.data.get(k),v);
  }
});

test('cover=1 不持久化、不恢复交易日志、不让游戏写存档',()=>{
  const{shared,h,a}=prepared();shared.trace=[];h.P.select(a.id);const pending=shared.trace.find(values=>values[JOURNAL]);
  const covered=backend(pending),before=object(covered),cover=page(covered,{path:'/frog-pond/index.html',search:'?cover=1'});
  assert.deepEqual(object(covered),before);assert.equal(covered.writes,0);assert.equal(cover.storage.getItem('frogPondHi'),null);
  assert.throws(()=>cover.storage.setItem('frogPondHi','oops'),{name:'InvalidStateError'});assert.throws(()=>cover.P.create('封面','cat'));
  assert.equal(covered.writes,0);cover.emit('pageshow');assert.deepEqual(cover.navigations,[]);
});

test('损坏库或损坏日志保留原文并停止进度写入；无 Storage 构造器的旧测试桩仍可使用',()=>{
  for(const seed of [{[LIB]:'broken',frogPondHi:'keep'},{[JOURNAL]:'broken',frogPondHi:'keep'}]){
    const shared=backend(seed),h=page(shared);assert.equal(shared.writes,0);assert.deepEqual(object(shared),seed);assert.equal(h.P.state().ready,false);assert.throws(()=>h.storage.setItem('frogPondHi','oops'));
  }
  const shared=backend({frogPondHi:'keep'}),h=page(shared,{constructor:false});assert.equal(h.P.current().id,'default');const a=h.P.create('小猫','cat');h.P.select(a.id);assert.deepEqual(physical(h),{});h.P.select('default');assert.equal(h.storage.getItem('frogPondHi'),'keep');
});

test('全部现行游戏本地存档常量在明确白名单中；反馈、音量、密钥与原生偏好不归玩家',()=>{
  const h=page(backend()),seen=new Set(),base=new URL('../app/assets/',import.meta.url);
  function scan(path){for(const entry of readdirSync(path,{withFileTypes:true})){const full=resolve(path,entry.name);if(entry.isDirectory())scan(full);else if(/\.(js|html)$/.test(entry.name)&&!full.includes('/shared/')){const text=readFileSync(full,'utf8');for(const m of text.matchAll(/(?:\b(?:KEY|SAVE_KEY|ENDLESS_KEY)\s*=\s*|(?:getItem|setItem|removeItem)\(\s*)['"]([^'"]+)['"]/g)){if(!['rugeAwake'].includes(m[1]))seen.add(m[1]);}}}}
  scan(decodeURI(base.pathname));seen.add('rugeBrainSchoolV1');for(const key of seen)assert.ok(h.P.progressKeys.includes(key),'未覆盖 '+key);
  for(const key of Object.keys(settings))assert.ok(!h.P.progressKeys.includes(key));assert.equal(h.P.progressKeys.length,30);
});
