(function(root){
  'use strict';
  const ANIMALS=Object.freeze(['小鸟','兔子','狐狸','小猫','企鹅','小熊']);
  const A=[1,2,3,4,5,6],B=[1,3,2,5,4,6],C=[2,3,5,4,6,7],D=[1,2,4,3,5,6];
  const eq=(left,right)=>({left,right});
  const specs=[
    [A,[[1]],[3,0,0,0,0,0],[eq([1],[0,0])]],
    [A,[[2]],[2,2,0,0,0,0],[eq([1],[0,0]),eq([2],[0,1])]],
    [A,[[3]],[2,2,1,0,0,0],[eq([3],[1,1]),eq([2],[0,1]),eq([1],[0,0])]],
    [A,[[4]],[3,2,1,0,0,0],[eq([4],[2,1]),eq([2],[0,1]),eq([1],[0,0])]],
    [A,[[5]],[2,2,1,0,0,0],[eq([5],[2,2]),eq([2],[0,1])]],
    [A,[[3,0]],[0,3,2,0,0,0],[eq([3],[1,1]),eq([2],[0,1]),eq([1],[0,0])],2],
    [B,[[4]],[3,2,2,0,0,0],[eq([1],[0,2]),eq([2],[0,0]),eq([4],[2,2])]],
    [B,[[3]],[2,1,2,0,0,0],[eq([3],[1,2]),eq([1],[0,2]),eq([2],[0,0])]],
    [C,[[5]],[2,2,1,0,0,0],[eq([2],[0,1]),eq([5],[0,2])],2],
    [D,[[5]],[2,2,1,1,0,0],[eq([3],[0,1]),eq([2],[1,1]),eq([5],[3,3])],2,[2]],
    [A,[[5]],[3,3,2,1,0,0],[eq([5],[2,2]),eq([2],[1,0]),eq([1],[0,0])],3,[3]],
    [C,[[4]],[2,2,1,1,0,0],[eq([3],[0,0]),eq([4],[1,1]),eq([2],[0,1])],2,[2]],
    [A,[[2],[3]],[1,2,1,0,0,0],[eq([1],[0,0]),eq([2],[0,1]),eq([3],[1,1])]],
    [A,[[4],[5]],[1,2,2,1,0,0],[eq([3],[1,1]),eq([4],[3,0]),eq([5],[2,2])]],
    [B,[[3],[5]],[2,2,2,0,1,0],[eq([4],[2,2]),eq([3],[4,0]),eq([5],[1,1])],3,[2,2]],
    [C,[[2],[5]],[3,3,0,1,0,0],[eq([2],[0,1]),eq([3],[0,0]),eq([5],[3,1])]],
    [D,[[4],[5]],[2,3,0,2,0,0],[eq([4],[3,1]),eq([5],[3,3]),eq([1],[0,0])],3,[2,3]],
    [C,[[4],[5]],[4,3,1,2,0,0],[eq([4],[1,1]),eq([2],[0,1]),eq([3],[0,0]),eq([5],[3,1])],3,[3,2]],
  ];
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  const LEVELS=freeze(specs.map(([weights,targets,stock,clues,slots=3,exact=[]],i)=>({id:i+1,weights:weights.slice(),targets,stock,clues,slots,exact})));
  const validLevel=i=>Number.isInteger(i)&&i>=0&&i<LEVELS.length;
  const weight=(level,animals)=>animals.reduce((n,id)=>n+LEVELS[level].weights[id],0);
  const validAnimal=id=>Number.isInteger(id)&&id>=0&&id<ANIMALS.length;
  function createState(level=0){if(!validLevel(level))throw new RangeError('Invalid animal bridge level');return {level,pans:LEVELS[level].targets.map(()=>[]),tested:LEVELS[level].targets.map(()=>null),attempts:0,finished:false};}
  function remaining(s){const stock=LEVELS[s.level].stock.slice();s.pans.flat().forEach(id=>stock[id]--);return stock;}
  function place(s,bridge,id){const l=LEVELS[s.level];if(s.finished||!validAnimal(id)||!Number.isInteger(bridge)||!s.pans[bridge]||s.pans[bridge].length>=(l.exact[bridge]||l.slots)||remaining(s)[id]<=0)return false;s.pans[bridge].push(id);s.tested[bridge]=null;return true;}
  function remove(s,bridge,index){if(s.finished||!Number.isInteger(bridge)||!s.pans[bridge]||!Number.isInteger(index)||index<0||index>=s.pans[bridge].length)return false;s.pans[bridge].splice(index,1);s.tested[bridge]=null;return true;}
  function clear(s,bridge){if(s.finished||!Number.isInteger(bridge)||bridge<0||bridge>=s.pans.length||!s.pans[bridge].length)return false;s.pans[bridge]=[];s.tested[bridge]=null;return true;}
  function result(s,bridge){const l=LEVELS[s.level];if(!s.pans[bridge]?.length)return null;const diff=Math.sign(weight(s.level,s.pans[bridge])-weight(s.level,l.targets[bridge]));if(diff===0&&l.exact[bridge]&&s.pans[bridge].length!==l.exact[bridge])return 2;return diff;}
  function weigh(s,bridge){if(s.finished||!Number.isInteger(bridge)||!s.pans[bridge]?.length)return null;const diff=result(s,bridge);s.tested[bridge]=diff;s.attempts++;s.finished=s.tested.every((n,i)=>n===0&&result(s,i)===0);return diff;}
  function solve(level){
    if(!validLevel(level))throw new RangeError('Invalid animal bridge level');
    const l=LEVELS[level],state=createState(level);
    function bridge(index){if(index===l.targets.length)return state.pans.map(p=>p.slice());const target=weight(level,l.targets[index]);let answer=null;
      function select(start,total){if(answer)return;if(total===target&&(!l.exact[index]||state.pans[index].length===l.exact[index])){if(weigh(state,index)===0){answer=bridge(index+1);if(answer)return;}state.finished=false;state.tested[index]=null;}if(total>=target||state.pans[index].length>=l.slots)return;
        for(let id=start;id<6;id++){if(!place(state,index,id))continue;select(id,total+l.weights[id]);if(answer)return;remove(state,index,state.pans[index].length-1);}}
      select(0,0);return answer;
    }
    return bridge(0);
  }
  function restore(raw){const empty={stars:Array(18).fill(0),session:null};if(!raw||raw.schema!==1)return empty;const stars=Array.from({length:18},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0),fail=()=>({stars,session:null}),s=raw.session;
    if(!s||!validLevel(s.level)||!Array.isArray(s.pans)||s.pans.length!==LEVELS[s.level].targets.length||!Array.isArray(s.tested)||s.tested.length!==s.pans.length||!Number.isInteger(s.attempts)||s.attempts<0||s.attempts>100000||typeof s.finished!=='boolean')return fail();
    const replay=createState(s.level);for(let b=0;b<s.pans.length;b++){if(!Array.isArray(s.pans[b]))return fail();for(const id of s.pans[b])if(!place(replay,b,id))return fail();}
    for(let b=0;b<s.tested.length;b++){if(s.tested[b]===null)continue;if(![-1,0,1,2].includes(s.tested[b])||s.tested[b]!==result(replay,b))return fail();replay.tested[b]=s.tested[b];}
    replay.finished=replay.tested.every((n,i)=>n===0&&result(replay,i)===0);if(replay.finished!==s.finished||s.attempts<replay.tested.filter(n=>n!==null).length)return fail();replay.attempts=s.attempts;return {stars,session:replay};
  }
  const api={ANIMALS,LEVELS,createState,remaining,place,remove,clear,result,weigh,weight,solve,restore};root.AnimalBalance=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
