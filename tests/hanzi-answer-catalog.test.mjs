import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {auditAnswers} from '../scripts/audit-hanzi-answers.mjs';
const ctx=vm.createContext({window:{}});
for(const name of ['strokes','levels-extra','core','composites','answer-catalog'])vm.runInContext(fs.readFileSync(new URL(`../app/assets/hanzi-puzzle/${name}.js`,import.meta.url),'utf8'),ctx);
const H=ctx.window.HanziStrokes,plain=x=>JSON.parse(JSON.stringify(x));
const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/hanzi-v4.16-answers.json',import.meta.url),'utf8'));
test('田/思/男同一田部件都可收土；由、去、里、早及上下结构漏字补齐',()=>{
 const cases=[[3,[2,3,4],'土'],[51,[2,3,4],'土'],[55,[2,3,4],'土'],[27,[2,3,4],'土'],[18,[0,2,3,4],'云'],[29,[0,1,2,3,4],'甲'],[29,[0,1,2,3,5],'旦'],[8,[0,1,2,3,4],'旦'],[52,[0,1,2,3,4],'旦'],[52,[3,4,5],'干'],[34,[0,1,2,3,6],'旦'],[38,[0,1,2,3,11],'旦'],[41,[0,1,2,3,5,7],'早'],[41,[0,1,2,3,6,7],'早'],[41,[0,1,2,3,8],'旦']];
 for(const[li,set,char]of cases)assert.equal(H.match(li,set)?.char,char,`${li+1} ${char}`);
});
test('同字合理替代选法也可收，不裁切笔画或把完整干强认士',()=>{
 const cases=[[5,[1,4],'十'],[15,[0,2,3],'大'],[29,[2,4,6],'土'],[29,[3,4,6],'土'],[41,[5,7,8],'土'],[59,[4,6,7],'土']];
 for(const[li,set,char]of cases)assert.equal(H.match(li,set)?.char,char);
 assert.equal(H.match(1,[0,1,2])?.char,'干');
 assert.equal(H.match(41,[5,6,7,8]),null,'生删撇后竖仍出头，不硬认王');
 assert.equal(H.match(59,[4,5,6,7]),null,'青字头不硬认王');
});
test('4.16全部旧合法选法和已收集进度保留，新增答案不赠送也不锁回旧关',()=>{
 for(let li=0;li<60;li++)for(const target of legacy.levels[li].targets)for(const set of target.sets)assert.equal(H.match(li,set)?.char,target.char,`${li+1} ${target.char} ${set}`);
 const values=new Map([[H.KEY,JSON.stringify(legacy.save)],['other-game','untouched']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},g=H.createGame({storage});
 assert.equal(g.state().unlocked,59);assert.equal(g.state().current,59);assert.deepEqual(plain(g.state().found),legacy.save.found);
 g.loadLevel(3);assert.equal(g.state().done,false);assert.equal(g.state().found[3].length,6);assert(!g.state().found[3].includes('土'));
 g.setSelection([2,3,4]);assert.equal(g.submit().char,'土');assert.equal(g.state().found[3].length,7);assert.equal(g.state().unlocked,59);assert.equal(values.get('other-game'),'untouched');
});
test('同一早字无论独立关还是日十关，全部答案与标准笔序选法一致',()=>{
 const normalized=li=>Object.fromEntries(H.LEVELS[li].targets.map(t=>[t.char,t.sets.map(s=>s.join(',')).sort()]));assert.deepEqual(plain(normalized(8)),plain(normalized(52)));
});
test('逐关枚举全部笔画子集校验查表一致、无歧义且每关不超过20答案',()=>{
 const result=auditAnswers();assert.equal(result.levelCount,60);assert.equal(result.answerCount,358);assert(result.checkedSubsets>20000);assert(result.maxAnswers<=20);assert.equal(result.levels[3].answerCount,7);
});
test('复合字笔序换序时，新答案由标准笔序反向映射回关卡索引',()=>{
 const c=vm.createContext({window:{}});
 for(const name of ['strokes','levels-extra','core','composites'])vm.runInContext(fs.readFileSync(new URL(`../app/assets/hanzi-puzzle/${name}.js`,import.meta.url),'utf8'),c);
 // Swap only a hypothetical 日十 compound's two last canonical strokes.
 c.window.HanziCompositeData.早.strokeMap=[0,1,2,3,5,4];
 vm.runInContext(fs.readFileSync(new URL('../app/assets/hanzi-puzzle/answer-catalog.js',import.meta.url),'utf8'),c);
 assert.equal(c.window.HanziStrokes.match(52,[0,1,2,3,5])?.char,'旦');
 assert.equal(c.window.HanziStrokes.match(52,[0,1,2,3,4]),null);
 assert.equal(c.window.HanziStrokes.match(8,[0,1,2,3,4])?.char,'旦','独立原字仍使用自身标准索引');
});
