import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {loadGame} from './helpers/html-vm.mjs';
const backSource=readFileSync(new URL('../app/assets/shared/back-navigation.js',import.meta.url),'utf8');
function page(t,name,{entry='index.html',search='',storage={}}={}){
 const markup=readFileSync(new URL('../app/assets/'+name+'/'+entry,import.meta.url),'utf8');
 const hidden=[...markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*\bhidden(?:\s|>)/g)].map(m=>m[1]);
 const boot=`window.localStorage=localStorage;window.__homes=0;window.__rotations=[];window.RugeNav={home(){window.__homes++}};window.RugeScreen={set:x=>window.__rotations.push(x),get:()=> 'portrait'};window.__location=location;location.pathname=${JSON.stringify('/android_asset/'+name+'/'+entry)};location.search=${JSON.stringify(search)};
 const enhance=n=>{if(!n)return n;n.append=(...v)=>n.children.push(...v);n.replaceChildren=(...v)=>{n.children.length=0;n.children.push(...v)};n.scrollIntoView=()=>{};if(!n.firstChild)n.firstChild={textContent:''};if(!n.__backQuery){n.__backQuery=true;const q=n.querySelector;n.querySelector=s=>q(s)||(s==='.cardFront'?enhance(document.createElement('span')):null);}n.showModal=()=>{n.open=true};n.close=()=>{n.open=false};n.click=()=>{if(!n.disabled){n.onclick?.();n.dispatch('click')}};return n;};
 const byId=document.getElementById;document.getElementById=id=>enhance(byId(id));const query=document.querySelector;document.querySelector=id=>enhance(query(id));const create=document.createElement;document.createElement=x=>enhance(create(x));const createNS=document.createElementNS;document.createElementNS=(ns,x)=>enhance(createNS(ns,x));document.createTextNode=text=>({textContent:text});for(const id of ${JSON.stringify(hidden)})document.getElementById(id).hidden=true;`;
 const h=loadGame(name,{entry,storage:{unrelated:'preserve',...storage},instrument:(s,i)=>(i===0?boot:'')+s.replace("new URLSearchParams(location.search).get('cover')==='1'","/[?&]cover=1(?:&|$)/.test(location.search)")});
 t.after(()=>h.dispose());return h;
}
for(const name of ['animal-balance','camera-color','forest-juice','hat-trick','number-merge','tilt-star-box','paint-mixing'])test(`${name}：关内返回本游戏选关，再返回合集且不清草稿`,t=>{
 const h=page(t,name),g=h.window.__game;
 g.start(0,name==='camera-color'?'practice':false);
 const before=JSON.stringify(g.state());h.window.RugeBack.handle();
 assert.equal(h.node('#menu').hidden,false);assert.equal(h.node('#play').hidden,true);assert.equal(h.window.__homes,0);assert.equal(JSON.stringify(g.state()),before);
 h.window.RugeBack.handle();assert.equal(h.window.__homes,1);assert.equal(h.saved.get('unrelated'),'preserve');
});
for(const name of ['animal-balance','forest-juice','hat-trick','number-merge','tilt-star-box','paint-mixing'])test(`${name}：重置确认先取消，不越级离开本局`,t=>{
 const h=page(t,name),g=h.window.__game;g.start(0,false);h.node('#confirm').hidden=false;const before=JSON.stringify(g.state());
 h.window.RugeBack.handle();assert.equal(h.node('#confirm').hidden,true);assert.equal(h.node('#play').hidden,false);assert.equal(h.window.__homes,0);assert.equal(JSON.stringify(g.state()),before);
});
test('字库详情、出处、列表、所属打字入口逐层返回；筛选与滚动位置保留',t=>{
 const h=page(t,'hanzi-library',{search:'?from=typing'}),g=h.window.__game;
 const first=g.state().visible[0];h.node('#listScroll').scrollTop=155;g.open(first);h.node('#sourceDetails').open=true;
 h.window.RugeBack.handle();assert.equal(h.node('#sourceDetails').open,false);assert.equal(g.state().view,'detail');
 h.window.RugeBack.handle();assert.equal(g.state().view,'list');assert.equal(h.node('#listScroll').scrollTop,155);assert.equal(h.window.__homes,0);
 h.window.RugeBack.handle();assert.equal(h.window.__location.href,'../hanzi-typing/index.html');assert.equal(h.window.__homes,0);assert.equal(h.saved.get('unrelated'),'preserve');
});
test('从合集直接打开字库时，列表返回合集，不强塞打字入口',t=>{const h=page(t,'hanzi-library');h.window.RugeBack.handle();assert.equal(h.window.__homes,1);});
test('打字统计、练习和原入口逐层返回，不写入多余题目成绩',t=>{
 const h=page(t,'hanzi-typing'),g=h.window.__game;g.start(0);const before=JSON.stringify(g.Save.d);
 h.window.RugeBack.handle();assert.equal(g.state().playing,false);assert.equal(h.window.__homes,0);assert.equal(JSON.stringify(g.Save.d),before);
 g.stats();h.window.RugeBack.handle();assert.equal(h.node('#stats').classList.contains('on'),false);assert.equal(h.window.__homes,0);
 h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('专业朗读先关闭分组/设置弹层，再返回打字，取消收音且不自动开始',t=>{
 const h=page(t,'hanzi-typing',{entry:'speaking.html'}),g=h.window.__reading;
 g.start('read',0);h.node('#readingGroup').onclick();const task=JSON.stringify(g.state().task);
 h.window.RugeBack.handle();assert.equal(h.node('#readingOverlay').hidden,true);assert.equal(JSON.stringify(g.state().task),task);assert.equal(g.state().inFlight,false);
 h.window.RugeBack.handle();assert.equal(h.window.__location.href,'index.html');assert.equal(h.window.__homes,0);
});
test('翻牌子游戏回选关，再回帽子入口，不跨到合集',t=>{
 const h=page(t,'hat-trick',{entry:'memory.html'}),g=h.window.__game;g.start(0);h.window.RugeBack.handle();assert.equal(h.node('#menu').hidden,false);assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__location.href,'index.html?menu=1');assert.equal(h.window.__homes,0);
});
test('口令返回选关停止收音、清队列，迟到开始不重开游戏',async t=>{
 const h=page(t,'voice-quest'),g=h.window.__game;g.openLevel(0,false);g.beginTouch();g.command('right');g.command('left','voice');h.window.RugeBack.handle();await Promise.resolve();
 assert.equal(h.node('#menu').hidden,false);assert.equal(g.engine,null);assert.equal(g.commandQueue.length,0);assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('飞机返回飞行入口停麦且保持横屏，离开游戏才恢复竖屏',t=>{
 const h=page(t,'pitch-adventure'),g=h.window.__game;g.beginTouch();h.window.__rotations.length=0;h.window.RugeBack.handle();assert.equal(g.state.screen,'menu');assert.equal(g.paused,true);assert.deepEqual(Array.from(h.window.__rotations),[]);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);assert.equal(h.window.__rotations.at(-1),'portrait');
});
test('雷达回模式入口再离开，停止本轮寻宝',t=>{const h=page(t,'pocket-radar');h.window.__game.start('space',4);h.window.RugeBack.handle();assert.equal(h.node('#menu').hidden,false);assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);});
test('英语冒险由拼写回选关、标题入口，再离开；草稿保持',t=>{
 const h=page(t,'english-k'),g=h.window.__english;g.start(1);g.add('m');const before=JSON.stringify(g.state());h.window.RugeBack.handle();assert.equal(h.node('#levelGrid').children.length,36);assert.equal(h.window.__homes,0);assert.equal(g.state().draft,'m');
 h.window.RugeBack.handle();assert.equal(h.node('#dialogTitle').textContent,'K国王回家');assert.equal(g.state().draft,'m');assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
for(const name of ['flappy-bird','frog-pond'])test(`${name}：进行中回开始画面，下一次才离开`,t=>{
 const h=page(t,name);h.click('#startBtn');h.window.RugeBack.handle();assert.equal(h.node('#startScreen').classList.contains('hide'),false);assert.equal(h.node('#pauseScreen').classList.contains('hide'),true);assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('水管默认棋盘返回关卡根页再合集，普通选关弹层关闭仍保留暂停',t=>{
 const h=page(t,'pipe-flow'),g=h.window.__game;h.click('#pause');h.click('#levelBtn');h.window.RugeBack.handle();assert.equal(h.node('#levels').hidden,true);assert.equal(g.state().paused,true);assert.equal(h.window.__homes,0);
 h.window.RugeBack.handle();assert.equal(h.node('#pausePanel').hidden,true);assert.equal(g.state().paused,true);h.window.RugeBack.handle();assert.equal(h.node('#levels').hidden,false);assert.equal(h.node('#levelGrid').children.length,36);assert.equal(g.state().paused,true);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('钢珠默认棋盘返回选关根页再合集；选关弹层关闭不自动恢复物理',t=>{
 const h=page(t,'gravity-maze'),g=h.window.__game;g.showLevels();h.window.RugeBack.handle();assert.equal(h.node('#levels').hidden,true);assert.equal(g.state().paused,true);assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.node('#levels').hidden,false);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('字里找字确认框/普通选关先关闭；棋盘返回选关根页再合集',t=>{
 const h=page(t,'hanzi-puzzle'),g=h.window.__game;g.reset();h.window.RugeBack.handle();assert.equal(h.node('#resetDialog').open,false);assert.equal(h.window.__homes,0);
 h.node('#levelBtn').onclick();h.window.RugeBack.handle();assert.equal(h.node('#levelDialog').open,false);g.pause();h.window.RugeBack.handle();assert.equal(h.node('#pausePanel').hidden,true);assert.equal(g.state().paused,true);h.window.RugeBack.handle();assert.equal(h.node('#levelDialog').open,true);assert.equal(g.state().paused,true);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('密码箱弹层先关闭、再回本游戏首页，保留输入与猜测',t=>{
 const h=page(t,'code-breaker'),g=h.window.__game;g.startFree(2,false);g.pressDigit('0');g.showRules();h.window.RugeBack.handle();assert.equal(h.node('#modal').hidden,true);assert.equal(g.state().view,'play');assert.equal(g.state().run.draft[0],'0');h.window.RugeBack.handle();assert.equal(g.state().view,'home');assert.equal(h.window.__homes,0);h.window.RugeBack.handle();assert.equal(h.window.__homes,1);
});
test('共享返回防止同步重入和异常误退，不依赖浏览器history',()=>{
 const w={RugeNav:{home(){throw Error('must not exit')}},onRugeBack(){w.RugeBack.handle();return true;}},location={pathname:'/android_asset/voice-quest/index.html',search:'',href:''};vm.runInNewContext(backSource,{window:w,location,URLSearchParams});assert.equal(w.RugeBack.handle(),true);assert.equal(location.href,'');w.onRugeBack=()=>{throw Error('page error')};assert.equal(w.RugeBack.handle(),true);assert.equal(location.href,'');assert.doesNotMatch(backSource,/history\.(?:back|go|pushState)/);
});
test('全部当前游戏与设置入口都打包统一返回协议，旧legacy不冒充在架入口',()=>{
 const root=new URL('../app/assets/',import.meta.url);for(const dir of readdirSync(root,{withFileTypes:true})){if(!dir.isDirectory()||['shared','covers','vendor','voice-model','bear-snack-shop'].includes(dir.name))continue;let html;try{html=readFileSync(new URL(dir.name+'/index.html',root),'utf8')}catch{continue}assert.match(html,/src="\.\.\/shared\/back-navigation\.js"/,dir.name);}
});

for(const name of ['animal-balance','camera-color','forest-juice','hat-trick','number-merge','tilt-star-box','paint-mixing'])test(`${name}：关闭暂停层保留paused，中央继续入口不重叠生成，明确点击才恢复`,t=>{
 const h=page(t,name),g=h.window.__game;g.start(0,name==='camera-color'?'practice':false);g.pause();const before=JSON.stringify(g.state());h.window.RugeBack.handle();
 assert.equal(h.node('#pause').hidden,true);assert.equal(h.node('#play').hidden,false);assert.equal(h.window.__homes,0);h.frame(500);assert.equal(JSON.stringify(g.state()),before);
 const live=()=>h.document.body.children.filter(n=>n.id==='rugeBackContinue'&&!n.hidden);assert.equal(live().length,1);live()[0].onclick();assert.equal(live().length,0);assert.equal(h.node('#pause').hidden,true);g.pause();h.window.RugeBack.handle();assert.equal(live().length,1);h.window.RugeBack.handle();assert.equal(live().length,0);assert.equal(h.node('#menu').hidden,false);
});
test('朗读/英语的暂停层返回不恢复收音，明确继续才取消paused',t=>{
 const h=page(t,'hanzi-typing',{entry:'speaking.html'}),g=h.window.__reading;g.pause();h.window.RugeBack.handle();assert.equal(g.state().paused,true);assert.equal(g.state().inFlight,false);const chip=h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden);assert.ok(chip);chip.onclick();assert.equal(g.state().paused,false);
 const e=page(t,'english-k'),k=e.window.__english;k.start(1);k.pause();e.window.RugeBack.handle();assert.equal(k.state().paused,true);assert.equal(e.node('#overlay').hidden,true);assert.equal(e.node('#levelGrid').children.length,0);assert.equal(e.window.__homes,0);
});
test('钢珠运行中暂停层关闭不会继续物理；中央继续显式走原水平校验',async t=>{
 const h=page(t,'gravity-maze'),g=h.window.__game;await g.setMode('touch');g.start();g.pause();const before=JSON.stringify(g.state());h.window.RugeBack.handle();assert.equal(h.node('#pausePanel').hidden,true);assert.equal(g.state().paused,true);h.frame(500);assert.equal(JSON.stringify(g.state()),before);const chip=h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden);assert.ok(chip);chip.onclick();assert.equal(g.state().paused,false);
});

for(const name of ['pitch-adventure','pocket-radar','hanzi-puzzle','english-k','hanzi-typing'])test(`${name}：关闭暂停层后切后台再回来保留唯一继续入口`,t=>{
 const h=page(t,name,{entry:name==='hanzi-typing'?'speaking.html':'index.html'});
 if(name==='pitch-adventure')h.window.__game.beginTouch();else if(name==='pocket-radar')h.window.__game.start('safe',4);else if(name==='english-k')h.window.__english.start(1);
 const g=name==='hanzi-typing'?h.window.__reading:name==='english-k'?h.window.__english:h.window.__game;g.pause();h.window.RugeBack.handle();
 const chip=h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden);assert.ok(chip);h.emitWindow('ruge:pause');assert.equal(chip.hidden,true);h.emitWindow('ruge:resume');assert.equal(chip.hidden,false);assert.equal(h.document.body.children.filter(n=>n.id==='rugeBackContinue'&&!n.hidden).length,1);chip.onclick();assert.equal(chip.hidden,true);
});

test('字里找字暂停时点禁用选关不能删掉唯一继续入口',t=>{
 const h=page(t,'hanzi-puzzle'),g=h.window.__game;g.pause();h.window.RugeBack.handle();const chip=h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden);assert.ok(chip);h.node('#levelBtn').onclick();assert.notEqual(chip.hidden,true);assert.equal(g.state().paused,true);chip.onclick();assert.equal(g.state().paused,false);
});

test('钢珠暂停返回后去选关再关闭，仍有明确继续入口而非无响应棋盘',async t=>{
 const h=page(t,'gravity-maze'),g=h.window.__game;await g.setMode('touch');g.start();g.pause();h.window.RugeBack.handle();g.showLevels();h.click('#closeLevels');assert.equal(g.state().paused,true);assert.equal(h.node('#levels').hidden,true);assert.equal(h.node('#pausePanel').hidden,false);h.window.RugeBack.handle();assert.ok(h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden));
});

test('钢珠已暂停再开重置并取消仍保留暂停入口',async t=>{
 const h=page(t,'gravity-maze'),g=h.window.__game;await g.setMode('touch');g.start();g.pause();h.window.RugeBack.handle();g.askReset();assert.equal(h.node('#resetPanel').hidden,false);h.click('#resetNo');assert.equal(g.state().paused,true);assert.equal(h.node('#pausePanel').hidden,false);h.window.RugeBack.handle();assert.ok(h.document.body.children.find(n=>n.id==='rugeBackContinue'&&!n.hidden));
});
test('翻牌回帽子入口即使有旧局也停在选关，草稿与继续入口保留',t=>{
 const seed=page(t,'hat-trick');seed.window.__game.start(3);const raw=seed.saved.get('rugeHatTrickV1');assert.ok(raw);const old=JSON.parse(raw);
 const h=page(t,'hat-trick',{search:'?menu=1',storage:{rugeHatTrickV1:raw}});assert.equal(h.node('#menu').hidden,false);assert.equal(h.node('#play').hidden,true);assert.equal(h.node('#continue').hidden,false);assert.equal(h.window.__game.state().level,3);assert.equal(JSON.stringify(h.window.__game.state()),JSON.stringify(old.session));h.node('#continue').onclick();assert.equal(h.node('#play').hidden,false);assert.equal(h.window.__game.state().level,3);
 const direct=page(t,'hat-trick',{storage:{rugeHatTrickV1:raw}});assert.equal(direct.node('#play').hidden,false);assert.equal(direct.window.__game.state().level,3);assert.equal(direct.saved.get('unrelated'),'preserve');
});
