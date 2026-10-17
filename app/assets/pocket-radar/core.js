(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SAFE_CODES=[[-32],[36],[-52],[54],[-18],[22],[-40,32],[44,-30],[-58,20],[28,-54],[-22,52],[54,-38],[-45,30,-15],[50,-25,40],[-55,18,-35],[25,-52,48],[-30,55,-50],[58,-42,24]];
const POINTS=[[.22,.23],[.78,.28],[.23,.65],[.78,.67],[.5,.17],[.18,.45],[.82,.45],[.5,.62],[.35,.28],[.68,.73],[.32,.73],[.68,.22]];
const SAFE_LEVELS=SAFE_CODES.map((code,i)=>({id:i,code,tolerance:i<6?10:i<12?8:7,hold:i<6?.65:.85}));
const RADAR_LEVELS=Array.from({length:18},(_,i)=>{
 const count=i<4?1:i<10?2:3,order=[];
 for(let n=0;n<count;n++){const p=POINTS[(i*5+n*7)%POINTS.length];order.push({x:p[0],y:p[1],kind:n===count-1?'chest':n===0?'key':'star'});}
 const walls=i<6?[]:i<12?[{x:.43,y:.36,w:.14,h:.15}]:[{x:.38,y:.36,w:.2,h:.12},{x:.48,y:.68,w:.09,h:.08}];
 // All target points are reviewed outside the small obstacle rectangles.
 return {id:i,targets:order,walls,radius:.075};
});
function createSafe(level){if(!Number.isInteger(level)||!SAFE_LEVELS[level])throw Error('invalid level');return{mode:'safe',level,index:0,hold:0,angle:0,elapsed:0,finished:false};}
function createRadar(level){if(!Number.isInteger(level)||!RADAR_LEVELS[level])throw Error('invalid level');return{mode:'radar',level,index:0,x:.5,y:.88,elapsed:0,finished:false};}
function safeSignal(s,angle=s.angle){const l=SAFE_LEVELS[s.level];return s.finished?1:clamp(1-Math.abs(angle-l.code[s.index])/65,0,1);}
function safeStep(s,angle,dt,available=true){
 if(s.finished)return null;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);s.elapsed+=dt;
 if(!available||!Number.isFinite(angle)){s.hold=0;return null;}
 angle=clamp(angle,-72,72);const last=s.angle;s.angle=angle;const l=SAFE_LEVELS[s.level];
 const still=Math.abs(angle-last)<=Math.max(1.2,dt*23);
 if(still&&Math.abs(angle-l.code[s.index])<=l.tolerance)s.hold+=dt;else s.hold=0;
 if(s.hold+1e-8>=l.hold){s.index++;s.hold=0;if(s.index===l.code.length)s.finished=true;return s.finished?'win':'pin';}
 return null;
}
function blocked(l,x,y){const r=.026;return l.walls.some(b=>x+r>b.x&&x-r<b.x+b.w&&y+r>b.y&&y-r<b.y+b.h);}
function radarMove(s,dx,dy,dt){
 if(s.finished)return false;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);s.elapsed+=dt;
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
 const l=RADAR_LEVELS[s.level],x=clamp(s.x+clamp(dx,-1,1)*dt*.42,.055,.945),y=clamp(s.y+clamp(dy,-1,1)*dt*.42,.075,.93);
 if(!blocked(l,x,s.y))s.x=x;if(!blocked(l,s.x,y))s.y=y;return true;
}
function radarSignal(s){if(s.finished)return 1;const t=RADAR_LEVELS[s.level].targets[s.index];return clamp(1-Math.hypot(s.x-t.x,s.y-t.y)/.85,0,1);}
function dig(s){if(s.finished)return false;const l=RADAR_LEVELS[s.level],t=l.targets[s.index];if(Math.hypot(s.x-t.x,s.y-t.y)>l.radius)return false;s.index++;if(s.index===l.targets.length)s.finished=true;return true;}
function restore(raw){
 const result={schema:1,stars:{radar:Array(18).fill(0),safe:Array(18).fill(0)},bests:{radar:Array(18).fill(null),safe:Array(18).fill(null)},session:null};
 if(!raw||raw.schema!==1)return result;
 for(const mode of ['radar','safe'])for(let i=0;i<18;i++){if(raw.stars?.[mode]?.[i]===3)result.stars[mode][i]=3;const b=raw.bests?.[mode]?.[i];if(Number.isFinite(b)&&b>0)result.bests[mode][i]=b;}
 const d=raw.session;if(d&&['safe','radar'].includes(d.mode)&&Number.isInteger(d.level)&&d.level>=0&&d.level<18){
  const s=d.mode==='safe'?createSafe(d.level):createRadar(d.level),length=d.mode==='safe'?SAFE_CODES[d.level].length:RADAR_LEVELS[d.level].targets.length;
  s.index=Number.isInteger(d.index)?clamp(d.index,0,length):0;s.finished=s.index===length;s.elapsed=Number.isFinite(d.elapsed)?clamp(d.elapsed,0,86400):0;
  if(d.mode==='radar'&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.x>=.055&&d.x<=.945&&d.y>=.075&&d.y<=.93&&!blocked(RADAR_LEVELS[d.level],d.x,d.y)){s.x=d.x;s.y=d.y;}
  result.session=s;
 }
 return result;
}
root.PocketRadar=Object.freeze({SAFE_LEVELS,RADAR_LEVELS,createSafe,createRadar,safeSignal,safeStep,radarMove,radarSignal,dig,restore,blocked});
})(typeof window!=='undefined'?window:globalThis);
