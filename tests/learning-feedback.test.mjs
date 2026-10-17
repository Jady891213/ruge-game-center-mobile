import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGame} from './helpers/html-vm.mjs';

// Exercise real packaged handlers with a recording feedback bridge. Extend only
// DOM methods used by the stroke page, which the generic VM does not render.
function learning(t,name,{cover=false,storage={}}={}){
 const g=loadGame(name,{storage,instrument:source=>{
  source=source.replace("new URLSearchParams(location.search).get('cover')==='1'",'/[?&]cover=1(?:&|$)/.test(location.search)');
  if(cover)source=source.replace("new URLSearchParams(location.search).get('cover')==='1'",'true').replace('/[?&]cover=1(?:&|$)/.test(location.search)','true').replace('/[?&]cover=1/.test(location.search)','true');
  return `
 window.__fxEvents=window.__fxEvents||[];
 window.__sound=window.__sound!==false;
 window.RugeFX={emit:name=>window.__fxEvents.push(name),enabled:()=>window.__sound,setSound:value=>{window.__sound=value;}};
 if(!window.__learningDOM){window.__learningDOM=true;window.localStorage=localStorage;
 const enhance=node=>{if(!node)return node;if(!node.append)node.append=(...items)=>node.children.push(...items);
 if(!node.replaceChildren)node.replaceChildren=(...items)=>{node.children.length=0;node.children.push(...items);};
 if(!node.scrollIntoView)node.scrollIntoView=()=>{};
 if(!node.showModal)node.showModal=()=>{node.open=true;};if(!node.close)node.close=()=>{node.open=false;};
 if(!node.click)node.click=()=>{if(!node.disabled){node.onclick?.();node.dispatch('click');}};
 if(!node.firstChild)node.firstChild={textContent:''};return node;};
 const byId=document.getElementById;document.getElementById=id=>enhance(byId(id));
 const create=document.createElement;document.createElement=name=>enhance(create(name));
 const createNS=document.createElementNS;document.createElementNS=(ns,name)=>enhance(createNS(ns,name));
 document.createTextNode=text=>({textContent:text});}
 `+source;
 }});
 t.after(()=>g.dispose());
 return {g,game:g.window.__game,events:g.window.__fxEvents,click:id=>g.node('#'+id).onclick()};
}

test('字里找字：选择/反选、每个新答案和最后通关仅反馈一次，重复答案不庆祝',t=>{
 const {g,game,events}=learning(t,'hanzi-puzzle');
 assert.deepEqual(Array.from(events),[],'初始渲染不发声');
 game.toggle(0);game.toggle(0);assert.deepEqual(Array.from(events),['select','deselect']);events.length=0;
 const submit=set=>{game.setSelection(set);g.node('#submit').onclick();};
 submit([0]);assert.deepEqual(Array.from(events),['success']);assert(g.node('#answers').children.some(n=>n.classList.contains('new')));
 submit([2]);assert.deepEqual(Array.from(events),['success','error'],'重复答案给错误式轻提醒');
 submit([0,2]);submit([0,1,2]);assert.deepEqual(Array.from(events),['success','error','success','win']);
 g.node('#submit').onclick();assert.equal(events.length,4,'完成后重复提交没有反馈');
});

test('字里找字：提示与错误柔和反馈，暂停、恢复渲染和封面不触发',t=>{
 const {g,game,events,click}=learning(t,'hanzi-puzzle');
 click('hint');assert.deepEqual(Array.from(events),['hint']);g.tick(2300);assert.equal(events.length,1,'提示动画不重复触发');
 game.engine.setSelection([0]);game.engine.submit();game.engine.setSelection([0,2]);game.engine.submit();game.engine.setSelection([0,1,2]);game.engine.submit();game.engine.next();
 game.setSelection([0,2]);click('submit');assert.equal(events.at(-1),'error');
 events.length=0;game.pause();game.toggle(0);click('submit');click('hint');click('clear');click('confirmReset');assert.deepEqual(Array.from(events),[]);game.resume();assert.deepEqual(Array.from(events),[]);
 const c=learning(t,'hanzi-puzzle',{cover:true});c.game.toggle(0);c.click('submit');c.click('confirmReset');assert.deepEqual(Array.from(c.events),[]);
});

test('小小调色师：颜料、撤回、错误和完成有反馈，重复上色不误报失败',t=>{
 const {g,game,events,click}=learning(t,'paint-mixing');game.start(0);
 const drop=i=>g.node('#palette').children[i].onclick();
 assert.deepEqual(Array.from(events),[]);drop(0);click('undo');drop(0);click('paint');assert.deepEqual(Array.from(events),['drop','undo','drop','error']);
 drop(1);click('paint');assert.equal(events.at(-1),'win');assert(g.node('#art').classList.contains('happy'));
 const count=events.length;click('paint');assert.equal(events.length,count);click('next');assert.equal(events.at(-1),'tap');
 game.pause();events.length=0;drop(0);click('paint');click('undo');click('next');click('confirmRestart');assert.deepEqual(Array.from(events),[]);game.resume();assert.deepEqual(Array.from(events),[]);
 const c=learning(t,'paint-mixing',{cover:true});c.click('paint');c.click('undo');c.click('confirmRestart');assert.deepEqual(Array.from(c.events),[]);
});

test('看字打拼音：正确只反馈一次、暂停无反馈、共享静音按钮不影响 TTS 入口',t=>{
 const {g,game,events}=learning(t,'hanzi-typing');game.start(0);assert.deepEqual(Array.from(events),[]);
 g.input('x');assert.deepEqual(Array.from(events),['error']);g.input('xx');assert.equal(events.length,1,'连续错误前缀不重复震动');
 g.input(game.norm(game.state().ans[0]));assert.equal(events.at(-1),'success');const count=events.length;
 g.input('anything');assert.equal(events.length,count,'答题动画锁定后不反馈');
 game.pause();g.input('x');assert.equal(events.length,count);game.resume();assert.equal(events.length,count);
 g.click('#tSound');assert.equal(g.window.__sound,false);g.click('#tSound');assert.equal(g.window.__sound,true);assert.equal(events.at(-1),'tap');
 assert(g.node('#tRead'),'朗读保留');
 const c=learning(t,'hanzi-typing',{cover:true});c.g.input(c.game.norm(c.game.state().ans[0]));assert.deepEqual(Array.from(c.events),[]);
});

test('字里找字：重复答案保留选笔/提交入口，顶部只高亮对应字并短暂抖动，不新增答案',t=>{
 const {g,game,events,click}=learning(t,'hanzi-puzzle');
 game.setSelection([0]);click('submit');game.setSelection([0,2]);click('submit');
 game.setSelection([2]);const before=JSON.parse(JSON.stringify(game.state()));events.length=0;click('submit');
 assert.deepEqual(JSON.parse(JSON.stringify(game.state())),before);assert.deepEqual(Array.from(events),['error']);
 const answers=g.node('#answers').children;
 assert.equal(answers.filter(n=>n.classList.contains('repeated')).length,1);
 assert.equal(answers.find(n=>n.classList.contains('repeated')).dataset.char,'一');
 assert.equal(answers.some(n=>n.classList.contains('new')),false,'旧答案不重新庆祝');
 assert.equal(g.node('#submit').disabled,false);assert.equal(g.node('#submit').hidden,false);
 click('submit');assert.deepEqual(Array.from(game.state().selected),[2]);
 g.tick(1500);assert(answers.every(n=>!n.classList.contains('repeated')),'高亮自动结束');
 click('submit');game.pause();assert(g.node('#answers').children.every(n=>!n.classList.contains('repeated')),'暂停取消提醒');
});
test('字里找字：绘制置顶仅改变显示顺序，田中横与口保留原笔画索引/可反选',t=>{
 const {g,game}=learning(t,'hanzi-puzzle');
 for(let li=0;li<4;li++){for(const target of game.LEVELS[li].targets){game.setSelection(target.sets[0]);game.submit();}if(li<3)game.engine.next();}
 game.loadLevel(3);game.engine.reset();game.setSelection([2]);
 const paths=()=>g.node('#boards').children[0].children.find(n=>n.id==='strokes').children;
 assert.equal(paths().at(-1).dataset.stroke,'2','中横在未选中的中竖之后绘制');
 game.toggle(3);assert.deepEqual(paths().filter(p=>p.classList.contains('selected')).map(p=>p.dataset.stroke),['2','3']);
 game.toggle(2);assert.deepEqual(Array.from(game.state().selected),[3]);assert.equal(paths().at(-1).dataset.stroke,'3');
 game.setSelection([0,1,4]);assert.deepEqual(paths().slice(-3).map(p=>p.dataset.stroke),['0','1','4'],'口的整笔都在最上层');
 assert.equal(paths().length,5,'不额外复制几何或扩大命中区');
});
