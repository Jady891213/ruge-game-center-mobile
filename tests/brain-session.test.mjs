import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({console});context.window=context;
for(const file of ['core','identify','memory','analysis','compute','visual'])vm.runInContext(readFileSync(new URL(`../app/assets/brain-school/${file}.js`,import.meta.url),'utf8'),context);
const B=context.BrainSchool;
test('脑力游乐园20款真实玩法，5类各4款，所有生成和判定接口齐全',()=>{
 assert.equal(B.games.size,20);for(const cat of ['identify','memory','analysis','compute','visual'])assert.equal([...B.games.values()].filter(g=>g.category===cat).length,4);
 for(const game of B.games.values())for(const method of ['create','check','solution','mount'])assert.equal(typeof game[method],'function');
});
test('同一随机种子可复现整局，连续正确加分升难度，换题不会重置挑战时间',()=>{
 for(const game of B.games.values()){
  const a=B.session(game.id,12719),b=B.session(game.id,12719);
  for(let i=0;i<30;i++){
   assert.equal(JSON.stringify(a.question()),JSON.stringify(b.question()));
   a.tick(800);b.tick(800);const answer=game.solution(a.question());
   assert.equal(a.answer(answer).ok,true);assert.equal(b.answer(answer).ok,true);
   const score=a.state.score;assert.equal(a.answer(answer).ignored,true);assert.equal(a.state.score,score,'重复点击不得重复计分');
   a.next();b.next();
  }
  assert.equal(a.state.level,10);assert.equal(a.state.correct,30);assert.equal(a.state.remaining,36000);assert.ok(a.state.score>3000);
 }
});
test('挑战按真实有效毫秒计时，卡顿不延长限时，结束后拒绝输入和再次出题',()=>{
 const run=B.session('balloon-burst',17);run.tick(1000);assert.equal(run.state.remaining,59000);run.tick(59000);assert.equal(run.state.remaining,0);assert.equal(run.state.ended,true);assert.equal(run.next(),null);assert.equal(run.answer([1,2]).ignored,true);const score=run.state.score;run.mistake();assert.equal(run.state.score,score);
});
test('错误扣分扣时且连击清零，分数不为负，非法时间不污染状态',()=>{
 const run=B.session('fast-focus',19),game=B.games.get('fast-focus');run.answer(game.solution(run.question()));run.next();assert.ok(run.state.combo>0);const score=run.state.score;run.mistake();assert.equal(run.state.mistakes,1);assert.equal(run.state.combo,0);assert.ok(run.state.score<score);assert.equal(run.state.remaining,58500);run.tick(NaN);run.tick(Infinity);run.tick(-1);assert.equal(run.state.remaining,58500);for(let i=0;i<10;i++)run.mistake();assert.equal(run.state.score,0);
});
