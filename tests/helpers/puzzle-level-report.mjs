import assert from 'node:assert/strict';
import '../../app/assets/gravity-maze/core.js';
import '../../app/assets/tilt-star-box/core.js';
import '../../app/assets/number-merge/core.js';
import '../../app/assets/forest-juice/core.js';
import '../../app/assets/paint-mixing/core.js';
export const puzzleCores={
 'gravity-maze':globalThis.MarbleMaze,'tilt-star-box':globalThis.TiltStarBox,
 'number-merge':globalThis.NumberMerge,'forest-juice':globalThis.ForestJuice,'paint-mixing':globalThis.PaintMixing
};
function rollTo(C,state,level,cell){
 const point={x:C.PAD+(cell%level.cols+.5)*C.CELL,y:C.PAD+(Math.floor(cell/level.cols)+.5)*C.CELL};
 for(let frame=0;frame<2000;frame++){
  const dx=point.x-state.x,dy=point.y-state.y;
  if(Math.hypot(dx,dy)<2&&Math.hypot(state.vx,state.vy)<8)return;
  const tx=C.clamp(dx*4,-105,105),ty=C.clamp(dy*4,-105,105),before={x:state.x,y:state.y};
  C.step(state,C.clamp(((tx-state.vx)*8+C.DRAG*state.vx)/C.ACCELERATION,-.24,.24),C.clamp(((ty-state.vy)*8+C.DRAG*state.vy)/C.ACCELERATION,-.24,.24));
  assert.equal(C.positionClear(level,state,state.x,state.y),true);
  assert.ok(Math.hypot(state.x-before.x,state.y-before.y)<=C.MAX_SPEED*C.STEP+.001,'cannot teleport, cross walls or respawn to solve');
  if(state.won)return;
 }
 assert.fail(`level ${level.id+1}: physical controller cannot reach cell ${cell}`);
}
// Uses the shipped core for every rule and move. The controller only supplies
// bounded tilt; it never changes position, collections, rotor states or victory.
export function solvePuzzleLevels(){
 const games={};
 for(const [name,C]of Object.entries(puzzleCores)){
  assert.equal(C.LEVELS.length,36);
  const levels=C.LEVELS.map((level,index)=>{
   if(name==='paint-mixing'){
    const state=C.createState(index);
    const orders=level.targets.map(target=>{
     assert.ok(target.recipe.length<=C.MAX_DROPS);
     target.recipe.forEach(color=>assert.equal(C.add(state,color),true));
     assert.equal(C.paint(state),true);assert.equal(C.next(state),true);
     return {shape:target.shape,recipe:target.recipe,hex:C.hex(target.color),score:C.guidance(target.recipe,target.color).score};
    });
    assert.equal(state.finished,true);
    return {level:index+1,orders,finished:true};
   }
   const maze=name==='gravity-maze',state=maze?C.create(index):C.createState(index);
   const solution=maze?C.solveLevel(level):C.solve(index)?.moves;
   assert.ok(solution,`${name} ${index+1} has a solution`);
   if(maze){
    assert.deepEqual(C.validateLevel(level),{ok:true,bad:[]});
    for(const action of solution){
     if(action.type==='rotate')assert.equal(C.rotate(state,action.index),true);
     else rollTo(C,state,level,action.cell);
    }
    assert.equal(state.won,true);assert.equal(state.falls,0);assert.ok(state.stars.every(Boolean));
    return {level:index+1,actions:solution,rotations:solution.filter(a=>a.type==='rotate').length,steps:solution.length,physics120Hz:true,falls:state.falls,finished:true};
   }
   for(const action of solution){
    if(name==='forest-juice')assert.ok(C.pour(state,...action)>0);
    else assert.ok(C.move(state,action));
   }
   assert.equal(state.finished,true);
   return {level:index+1,actions:solution,steps:solution.length,finished:true};
  });
  games[name]={count:levels.length,levels};
 }
 return {version:'4.33',scope:'Actual shipped core solvers, moves, RYB recipes and 120Hz marble physics. Not a child usability or sensor test.',games};
}
