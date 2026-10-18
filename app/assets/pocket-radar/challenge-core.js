(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=v=>((v%360)+360)%360;
const delta=(a,b)=>((a-b+540)%360)-180;
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function target(s){const offset=55+random(s)*250;s.target={heading:wrap(s.heading+offset),elevation:s.mode==='space'?Math.round((random(s)*2-1)*Math.min(35,15+s.round*2)):0};}
function create(mode,seed=Date.now()){if(!['safe','space'].includes(mode))throw Error('invalid mode');const s={mode,seed:seed>>>0,round:1,cleared:0,remaining:60,elapsed:0,hold:0,heading:0,elevation:0,finished:false,target:null,lastHeading:null,lastElevation:null};target(s);return s;}
function tolerance(s){return Math.max(s.mode==='safe'?7:9,19-Math.floor((s.round-1)/2));}
function distance(s,heading=s.heading,elevation=s.elevation){if(s.mode==='safe')return Math.abs(delta(heading,s.target.heading));const a=elevation*Math.PI/180,b=s.target.elevation*Math.PI/180,y=delta(heading,s.target.heading)*Math.PI/180;return Math.acos(clamp(Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(b)*Math.cos(y),-1,1))*180/Math.PI;}
function signal(s){return clamp(1-distance(s)/180,0,1);}
function interrupt(s){if(s){s.hold=0;s.lastHeading=null;s.lastElevation=null;}}
function step(s,input,dt){
 if(s.finished)return null;
 // Never turn a long background frame into free hold time or an automatic clear.
 if(!Number.isFinite(dt)||dt<=0||dt>.25){interrupt(s);return null;}
 if(!input?.available||!Number.isFinite(input.heading)||!Number.isFinite(input.elevation)||!Number.isFinite(input.age)||input.age<0||input.age>750||Math.abs(input.elevation)>80){interrupt(s);return null;}
 dt=Math.min(dt,.1);s.elapsed+=dt;s.remaining=Math.max(0,s.remaining-dt);
 s.heading=wrap(input.heading);s.elevation=clamp(input.elevation,-80,80);
 if(s.remaining<=1e-8){s.finished=true;interrupt(s);return 'timeout';}
 const moved=s.lastHeading!==null&&(Math.abs(delta(s.heading,s.lastHeading))>Math.max(1,dt*28)||s.mode==='space'&&Math.abs(s.elevation-s.lastElevation)>Math.max(1,dt*28));
 s.lastHeading=s.heading;s.lastElevation=s.elevation;
 if(!moved&&distance(s)<=tolerance(s))s.hold+=dt;else s.hold=0;
 if(s.hold+1e-8<3)return null;
 s.cleared++;s.round++;const bonus=Math.max(6,12-Math.floor((s.round-2)/3));s.remaining=Math.min(90,s.remaining+bonus);interrupt(s);target(s);return {type:'clear',bonus};
}
function restoreRecords(raw){const out={schema:1,safe:0,space:0};if(raw?.schema===1)for(const k of ['safe','space'])if(Number.isInteger(raw[k])&&raw[k]>=0&&raw[k]<1000000)out[k]=raw[k];return out;}
root.RadarChallenge=Object.freeze({create,step,interrupt,signal,distance,tolerance,wrap,delta,restoreRecords});
})(typeof window!=='undefined'?window:globalThis);
