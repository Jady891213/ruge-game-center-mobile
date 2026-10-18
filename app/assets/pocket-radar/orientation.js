(function(root){
'use strict';
const wrap=v=>((v%360)+360)%360;
function create(){let origin=null,generation=null,offset=0;
 function raw(){try{const b=root.RugeOrientation;if(b?.coordinateSystem()!=='camera-relative-360-v1')return null;const x=JSON.parse(b.sample());return x&&x.available&&Number.isFinite(x.heading)&&Number.isFinite(x.elevation)&&Number.isFinite(x.age)&&x.age>=0&&x.age<=750?x:null;}catch(_){return null;}}
 function anchor(heading=0){origin=null;generation=null;offset=heading;const p=raw();if(!p)return false;origin=p.heading-offset;generation=p.generation;return true;}
 function read(){const p=raw();if(!p)return{available:false,reason:'unavailable'};
  if(origin===null){origin=p.heading-offset;generation=p.generation;}
  if(p.generation!==generation)return{available:false,reason:'restarted'};
  return{available:true,heading:wrap(p.heading-origin),elevation:p.elevation,age:p.age,source:p.source,generation};
 }
 return{read,anchor,release(){origin=null;generation=null;}};
}
root.RadarOrientation={create};
})(window);
