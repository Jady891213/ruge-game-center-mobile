import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/paint-mixing/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.PaintMixing;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function hsvRgb(p){const h=p.hue/60,c=p.value*p.saturation,x=c*(1-Math.abs(h%2-1)),m=p.value-c;const bands=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];return bands[Math.floor(h)%6].map(v=>(v+m)*255);}
test('连续色盘与标准渐变同坐标：红上、黄右上、蓝左下，白在中心',()=>{
 for(const [rgb,hue]of [[[255,0,0],0],[[255,255,0],60],[[0,255,0],120],[[0,255,255],180],[[0,0,255],240],[[255,0,255],300]]){const p=C.wheelPoint(rgb);near(p.hue,hue);near(Math.hypot(p.x-128,p.y-128),110);}
 const white=C.wheelPoint([255,255,255]);near(white.x,128);near(white.y,128);assert.equal(white.value,1);assert.equal(C.wheelPoint(null),null);assert.equal(C.wheelPoint([256,0,0]),null);
});
test('所有可达配色的轮盘与亮度可还原实际RYB结果，加白向中心靠近',()=>{
 for(const {rgb}of C.gamut(C.IDS)){const p=C.wheelPoint(rgb),restored=hsvRgb(p);restored.forEach((v,i)=>near(v,rgb[i]));assert.ok(Math.hypot(p.x-128,p.y-128)<=110.00001);}
 for(const base of ['red','yellow','blue']){const a=C.wheelPoint(C.mix([base])),b=C.wheelPoint(C.mix([base,'white','white']));assert.ok(b.saturation<a.saturation);assert.ok(b.value>=a.value);}
 // These are the established pigment recipes; the visualization must not turn blue+yellow gray.
 assert.deepEqual(C.mix(['yellow','blue']),[41,166,64]);assert.equal(C.guidance(['yellow','blue'],[41,166,64]).score,100);
});
test('真实页面用连续底盘、两类标记及生成图集，滴数和目标吻合时同点',()=>{
 const g=loadGame('paint-mixing');try{g.window.__game.start(0);let html=g.node('#colorMap').innerHTML;assert.match(html,/wheel-disc/);assert.doesNotMatch(html,/r="5.5"/);assert.match(g.node('#art').innerHTML,/art\/paint-friends.png/);assert.match(g.node('#art').innerHTML,/clip-path="url\(#paintTintfrog/);assert.match(g.node('#art').innerHTML,/<clipPath/);for(const b of g.node('#palette').children)b.onclick();html=g.node('#colorMap').innerHTML;const p=C.wheelPoint(C.mix(['yellow','blue']));assert.ok(html.includes('translate('+p.x+' '+p.y+')'));assert.ok(html.includes('cx="'+p.x+'" cy="'+p.y+'"'));assert.equal(g.node('#paintMatch').textContent,'100分');}finally{g.dispose();}
});
