import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/paint-mixing/core.js';
import '../app/assets/camera-color/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const P=globalThis.PaintMixing,C=globalThis.CameraColor;
test('调色色盘由实际可达混色构成，所有目标可定位，白色变化有独立亮度',()=>{
 for(const l of P.LEVELS){const gamut=P.gamut(l.palette);assert.ok(gamut.length);for(const {rgb,point} of gamut){assert.deepEqual(point,P.mapPoint(rgb));assert.ok(point.x>12&&point.x<190&&point.y>12&&point.y<172);assert.ok(point.light>=0&&point.light<=1.001);}for(const t of l.targets){assert.ok(gamut.some(v=>P.distance(v.rgb,t.color)===0));const g=P.guidance(t.recipe,t.color);assert.equal(g.score,100);assert.equal(g.pass,true);assert.deepEqual(g.target,g.current);}}
 const blue=P.mapPoint(P.mix(['blue'])),pale=P.mapPoint(P.mix(['blue','white','white']));assert.ok(pale.light>blue.light);assert.equal(P.mapPoint(null),null);
});
test('调色显示90分与真实17距离上色边界完全一致，包括空白/非精确配比',()=>{
 for(const l of P.LEVELS)for(const t of l.targets){const recipes=[[],['red'],['yellow','blue'],t.recipe,[...t.recipe,...t.recipe].slice(0,8)];for(const drops of recipes){const g=P.guidance(drops,t.color);assert.equal(g.pass,P.canPaint(drops,t.color));assert.equal(g.score>=90,g.pass);}}
 const rgb=P.mix(['yellow','blue']);assert.equal(P.guidance(['yellow','blue'],[rgb[0]+17,rgb[1],rgb[2]]).score>=90,true);assert.equal(P.guidance(['yellow','blue'],[rgb[0]+17.01,rgb[1],rgb[2]]).score>=90,false);
});
test('相机匹配分数与收集规则在色域扫描及唯一/亮暗边界一致',()=>{
 const history=[{rgb:C.COLORS.red.rgb}],steps=C.LEVELS.flatMap(l=>l.steps);
 for(let r=0;r<=255;r+=51)for(let g=0;g<=255;g+=51)for(let b=0;b<=255;b+=51)for(const step of steps){const sample=C.describe([r,g,b]),result=C.comparison(step,sample,history);assert.equal(result.pass,C.matches(step,sample,history));assert.equal(result.score>=C.PASS_SCORE,result.pass);assert.ok(result.score>=0&&result.score<=100);}
 assert.ok(C.comparison({kind:'color',color:'red'},C.describe(C.COLORS.red.rgb)).score>=99);
 const mixed={...C.describe(C.COLORS.red.rgb),usable:false};assert.ok(C.comparison({kind:'color',color:'red'},mixed).score<80);
});
test('相机页面实时显示目标/当前和分数，隐藏记忆目标，不以旧取景冒充新采样',()=>{
 const g=loadGame('camera-color');try{g.window.__game.start(0,'practice');g.window.__game.chooseSample(0);assert.equal(g.node('#matchScore').textContent,'100分');assert.equal(g.node('#comparison').classList.contains('is-match'),true);g.window.__game.chooseSample(3);assert.equal(g.node('#comparison').classList.contains('is-match'),false);assert.ok(parseInt(g.node('#matchScore').textContent)<80);g.window.__game.start(15,'practice');g.tick(3600);assert.equal(g.node('#comparison').hidden,true);g.window.__game.pause();assert.equal(g.window.__game.ready(),false);}finally{g.dispose();}
});
test('调色真实页面加滴/撤回地图更新，达标与自由画室不泄露配方',()=>{
 const g=loadGame('paint-mixing');try{g.window.__game.start(8);const click=c=>g.node('#palette').children.find(b=>b.dataset.color===c).onclick();click('red');const first=g.node('#colorMap').innerHTML;click('yellow');assert.notEqual(g.node('#colorMap').innerHTML,first);assert.ok(g.node('#colorMap').innerHTML.includes('polyline'));g.node('#undo').onclick();assert.equal(g.window.__game.state().drops.length,1);g.node('#empty').onclick();assert.equal(g.node('#paintMatch').textContent,'90分上色');for(const c of P.LEVELS[8].targets[0].recipe)click(c);assert.equal(g.node('#paintMatch').textContent,'100分');g.window.__game.start(0,true);assert.equal(g.node('#paintMatch').textContent,'自由配色');}finally{g.dispose();}
});
test('钢珠水平进度条和倒计时同步增长，歪拿/过期/后台清零且不迟到开局',()=>{
 const g=loadGame('gravity-maze',{instrument:(source,i)=>i===0?'window.__s={x:.5,y:0,z:Math.sqrt(.75),age:0,available:true};window.RugeTilt={sample:()=>JSON.stringify(window.__s)};'+source:source});
 try{g.window.__game.start();const s=g.window.__s;s.x=0;s.z=1;for(let i=0;i<13;i++)g.frame(40);const first=Number(g.node('#flatProgress').getAttribute('aria-valuenow'));assert.ok(first>=20&&first<40);assert.equal(g.node('#flatProgress').hidden,false);for(let i=0;i<20;i++)g.frame(40);const next=Number(g.node('#flatProgress').getAttribute('aria-valuenow'));assert.ok(next>first&&next<100);s.age=301;g.frame(40);assert.equal(g.node('#flatProgress').getAttribute('aria-valuenow'),'0');assert.equal(g.window.__game.state().paused,true);s.age=0;for(let i=0;i<20;i++)g.frame(40);g.emitWindow('ruge:pause');assert.equal(g.node('#flatProgress').getAttribute('aria-valuenow'),'0');for(let i=0;i<80;i++)g.frame(40);assert.equal(g.window.__game.state().paused,true);}finally{g.dispose();}
});
