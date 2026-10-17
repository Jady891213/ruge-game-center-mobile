import test from 'node:test';
import assert from 'node:assert/strict';
import '../app/assets/camera-color/core.js';
import {loadGame} from './helpers/html-vm.mjs';
const C=globalThis.CameraColor;
const swatches=[...Object.values(C.COLORS).map(c=>c.rgb),[245,244,228],[175,177,170],[96,100,99],[24,28,34],[248,183,185],[93,73,73]];
const pixels=rgb=>Array.from({length:49},()=>rgb.slice());
function solution(level){
 function visit(state,route){if(state.finished)return route;for(let i=0;i<swatches.length;i++){const next=structuredClone(state);if(C.collect(next,swatches[i])){const found=visit(next,[...route,i]);if(found)return found;}}return null;}
 return visit(C.createState(level,'practice'),[]);
}
test('六种标准颜色与亮暗/低饱和度正确分类，边界不把灰白当颜色',()=>{
 for(const [name,color] of Object.entries(C.COLORS))assert.equal(C.describe(color.rgb).color,name);
 assert.equal(C.describe([220,218,218]).color,null);assert.equal(C.describe([8,0,0]).color,null);assert.equal(C.describe([0,0,0]).brightness,0);assert.equal(C.describe([255,255,255]).brightness,1);
 assert.equal(C.describe([NaN,5,6]),null);assert.equal(C.describe([256,5,6]),null);
 assert.equal(C.matches({kind:'lighter'},C.describe([210,210,210]),[{rgb:[125,125,125]}]),true);
 assert.equal(C.matches({kind:'lighter'},C.describe([135,135,135]),[{rgb:[125,125,125]}]),false);
});
test('中心多数色拒绝多色混合造成的虚假目标，接受少量杂点',()=>{
 const mixed=[...pixels([220,35,35]).slice(0,24),...pixels([30,205,45]).slice(0,25)];assert.equal(C.analyze(mixed).usable,false);
 const reliable=[...pixels(C.COLORS.red.rgb).slice(0,40),...pixels(C.COLORS.blue.rgb).slice(0,9)];assert.equal(C.analyze(reliable).color,'red');assert.equal(C.analyze(reliable).usable,true);
 assert.equal(C.analyze([[1,2,3]]),null);assert.equal(C.analyze(Array(7).fill([Infinity,2,3])),null);
});
test('稳定取景需要连续不同真实帧，重复轮询不能补足650ms，过期图不能提交',()=>{
 const stable=C.stabilizer(),step={kind:'color',color:'red'};
 const frame=i=>({seq:i,ageMs:0,pixels:pixels(C.COLORS.red.rgb)});
 for(let i=0;i<4;i++)assert.equal(stable.push(frame(i),step,[],i*180).ready,false);
 assert.equal(stable.push(frame(3),step,[],720).ready,false);
 assert.equal(stable.push(frame(4),step,[],720).ready,true);
 assert.equal(stable.push({...frame(5),ageMs:1001},step,[],900).ready,false);
 assert.equal(stable.push(frame(6),step,[],1080).ready,false);
});
test('晃动、换色和中断会重新稳定，不接受伪造时间/序号',()=>{
 const stable=C.stabilizer(),step={kind:'any'};
 let result;for(let i=0;i<5;i++)result=stable.push({seq:i,ageMs:0,pixels:pixels(C.COLORS.red.rgb)},step,[],i*180);assert.equal(result.ready,true);
 assert.equal(stable.push({seq:5,ageMs:0,pixels:pixels(C.COLORS.blue.rgb)},step,[],900).ready,false);
 assert.equal(stable.push({seq:6,ageMs:0,pixels:pixels(C.COLORS.blue.rgb)},step,[],1700).ready,false);
 assert.equal(stable.push({seq:NaN,ageMs:0,pixels:pixels(C.COLORS.blue.rgb)},step,[],1800).ready,false);
});
test('18关均用真实规则搜索出完整答案，包含记忆、暖凉、不重复和相对明暗',()=>{
 assert.equal(C.LEVELS.length,18);const lengths=[];
 C.LEVELS.forEach((spec,i)=>{const answer=solution(i);assert.ok(answer,'关 '+(i+1)+' 无解');const state=C.createState(i);answer.forEach(index=>assert.equal(C.collect(state,swatches[index]),true));assert.equal(state.finished,true);assert.equal(state.collected.length,spec.steps.length);assert.equal(C.collect(state,swatches[0]),false);lengths.push(answer.length);});
 assert.ok(lengths.includes(4));assert.equal(C.LEVELS.filter(l=>l.memory).length,3);
});
test('重复颜色不算不同线索，错误提交保留已收集内容',()=>{
 const state=C.createState(9);assert.equal(C.collect(state,C.COLORS.red.rgb),true);assert.equal(C.collect(state,C.COLORS.red.rgb),false);assert.equal(state.collected.length,1);assert.equal(C.collect(state,C.COLORS.yellow.rgb),true);
 const three=C.createState(11);C.collect(three,C.COLORS.yellow.rgb);assert.equal(C.collect(three,C.COLORS.yellow.rgb),false);C.collect(three,C.COLORS.red.rgb);assert.equal(C.collect(three,C.COLORS.red.rgb),false);C.collect(three,C.COLORS.blue.rgb);assert.equal(three.finished,true);
});
test('存档重放真实规则，损坏或不满足线索的记录不恢复，练习与相机成绩分开',()=>{
 const state=C.createState(6,'practice');C.collect(state,C.COLORS.red.rgb);const raw={schema:1,session:state,cameraStars:[0],practiceStars:[3]};assert.deepEqual(C.restore(raw).session,state);assert.equal(C.restore(raw).cameraStars[0],0);assert.equal(C.restore(raw).practiceStars[0],3);
 const bad=structuredClone(raw);bad.session.collected.push({rgb:C.COLORS.blue.rgb});assert.equal(C.restore(bad).session,null);bad.session.collected=[{rgb:[300,20,10]}];assert.equal(C.restore(bad).session,null);assert.equal(C.restore({schema:9}).session,null);
});
test('真实页面颜色卡完成所有18关，记忆阶段禁止提前提交，每关可暂停重来',()=>{
 const g=loadGame('camera-color');try{
  for(let level=0;level<18;level++){
   g.window.__game.start(level,'practice');if(C.LEVELS[level].memory){assert.equal(g.window.__game.collect(),false);g.tick(3600);}
   for(const i of solution(level)){g.window.__game.chooseSample(i);assert.equal(g.window.__game.collect(),true);}
   assert.equal(g.window.__game.state().finished,true);assert.equal(g.window.__game.progress().practice[level],3);assert.equal(g.window.__game.progress().camera[level],0);
  }
  g.window.__game.start(6,'practice');g.emitWindow('ruge:pause');assert.equal(g.window.__game.chooseSample(0),false);assert.equal(g.window.__game.collect(),false);g.window.__game.resume();g.window.__game.chooseSample(0);g.window.__game.collect();assert.equal(g.window.__game.state().collected.length,1);g.node('#restart').onclick();assert.equal(g.window.__game.state().collected.length,0);
 }finally{g.dispose();}
});
test('相机不存在时明确给颜色卡入口，退出调用停止，相机状态不保存照片',()=>{
 const g=loadGame('camera-color');try{g.window.__game.start(0);assert.equal(g.node('#cameraHelp').hidden,false);assert.equal(g.node('#cameraMessage').textContent,'相机暂不可用');g.node('#switchPractice').onclick();assert.equal(g.window.__game.state().mode,'practice');g.emitWindow('pagehide');const saved=JSON.parse(g.saved.get('rugeCameraColorV1'));assert.equal(JSON.stringify(saved).includes('jpeg'),false);}finally{g.dispose();}
});
test('真实页面相机分支只在新帧稳定后允许收集，后台停止且不会自动续玩',()=>{
 const native=`window.__camCalls={start:0,stop:0,seq:0};window.RugeCamera={start(){window.__camCalls.start++},stop(){window.__camCalls.stop++},snapshot(){return JSON.stringify({running:true,jpeg:'unit-test-frame',seq:++window.__camCalls.seq,ageMs:0,pixels:Array.from({length:49},()=>[226,62,70])})}};`;
 const g=loadGame('camera-color',{instrument:(source,i)=>i===0?native+source:source});
 try{g.window.__game.start(0,'camera');assert.equal(g.window.__game.ready(),false);g.tick(540);assert.equal(g.window.__game.ready(),false);g.tick(180);assert.equal(g.window.__game.ready(),true);assert.equal(g.window.__game.collect(),true);assert.equal(g.window.__game.progress().camera[0],3);assert.equal(g.window.__game.progress().practice[0],0);g.window.__game.start(1,'camera');const starts=g.window.__camCalls.start;g.emitWindow('ruge:pause');assert.equal(g.window.__game.ready(),false);g.emitWindow('ruge:resume');g.tick(2000);assert.equal(g.window.__camCalls.start,starts);assert.equal(g.node('#pause').hidden,false);assert.ok(g.window.__camCalls.stop>=2);}finally{g.dispose();}
});
test('封面不申请相机、不读取或写入存档，生命周期亦不启动输入',()=>{
 const g=loadGame('camera-color',{storage:{rugeCameraColorV1:'untouched'},instrument:(src,i)=>(i===0?'window.__cameraStarts=0;window.RugeCamera={start(){window.__cameraStarts++},stop(){}};':'')+src.replace('cover=/[?&]cover=1(?:&|$)/.test(location.search)','cover=true').replaceAll('localStorage.getItem(','(() => { throw new Error("cover read storage"); })(')});
 try{assert.equal(g.saved.get('rugeCameraColorV1'),'untouched');g.emitWindow('ruge:pause');g.emitWindow('pagehide');assert.equal(g.saved.get('rugeCameraColorV1'),'untouched');assert.equal(g.window.__game.ready(),false);assert.equal(g.window.__cameraStarts,0);}finally{g.dispose();}
});
