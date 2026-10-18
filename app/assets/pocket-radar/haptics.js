(function(root){
'use strict';
// One foreground scheduler arbitrates detents and proximity. It never queues catch-up pulses.
function create(core){
 let lastOutput=-Infinity,lastSignal=-Infinity,lastHeading=null,lastBand=-1,quietUntil=-Infinity,lastTime=null;
 function reset(time,quietMs=0){lastOutput=-Infinity;lastSignal=-Infinity;lastHeading=null;lastBand=-1;lastTime=null;quietUntil=Number.isFinite(time)?time+Math.max(0,quietMs): -Infinity;}
 function profile(state){
  const error=core.distance(state),edge=core.tolerance(state);
  if(error<=Math.min(5,edge*.5))return{band:6,interval:120,strength:255,duration:35};
  if(error<=edge)return{band:5,interval:165,strength:235,duration:32};
  if(error<=edge+12)return{band:4,interval:230,strength:210,duration:28};
  if(error<=Math.max(45,edge+26))return{band:3,interval:340,strength:180,duration:24};
  if(error<=75)return{band:2,interval:480,strength:145,duration:21};
  if(error<=115)return{band:1,interval:700,strength:100,duration:17};
  return{band:0,interval:1050,strength:65,duration:13};
 }
 function next(state,time){
  if(!state||state.finished||!Number.isFinite(time)||!Number.isFinite(state.heading)||!Number.isFinite(state.elevation))return null;
  if(lastTime!==null&&(time<lastTime||time-lastTime>300)){
   const quiet=quietUntil;reset();quietUntil=quiet;
  }
  lastTime=time;
  if(lastHeading===null)lastHeading=state.heading;
  if(time<quietUntil)return null;
  const p=profile(state),detent=state.mode==='safe'&&Math.abs(core.delta(state.heading,lastHeading))>=6;
  if(time-lastOutput<110)return null;
  const approach=p.band>lastBand,signalDue=time-lastSignal>=p.interval;
  if(!approach&&!signalDue&&!detent)return null;
  const kind=approach||signalDue?'signal':'detent';
  lastOutput=time;if(detent)lastHeading=state.heading;lastBand=p.band;
  if(kind==='signal')lastSignal=time;
  // Even a moving detent carries distance information; a far tick cannot mask a strong near signal.
  return{kind,band:p.band,strength:detent?Math.max(105,p.strength):p.strength,duration:detent?Math.max(16,p.duration):p.duration,interval:p.interval};
 }
 return{next,reset,profile};
}
root.RadarHaptics=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
