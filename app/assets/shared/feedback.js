(function(root){
'use strict';
const cover=typeof location!=='undefined'&&/[?&]cover=1(?:&|$)/.test(location.search),KEY='rugeFeedbackV1';
const notes={tap:[[660,.04]],select:[[740,.045]],deselect:[[520,.035]],undo:[[520,.045],[392,.06]],drop:[[880,.065]],pour:[[440,.04],[660,.05],[520,.04],[880,.07]],jump:[[440,.035],[660,.045]],land:[[294,.04]],collect:[[988,.06],[1319,.10]],hint:[[659,.08],[784,.11]],success:[[659,.08],[880,.09],[1109,.14]],win:[[523,.09],[659,.09],[784,.09],[1047,.27]],error:[[247,.09],[196,.12]]};
const priority={tap:1,select:1,deselect:1,undo:1,drop:1,pour:2,jump:1,land:1,collect:2,hint:2,success:4,error:3,win:5};
let sound=true,vibration=true,volume=.70,paused=false,context=null,master=null,voices=[],epoch=0,lastAt=-Infinity,lastPriority=0;
const lastByName={},bridge=root.RugeFeedback;
if(!cover){try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&typeof raw.sound==='boolean'&&typeof raw.vibration==='boolean'){sound=raw.sound;vibration=raw.vibration;if(Number.isFinite(raw.volume))volume=Math.max(0,Math.min(1,raw.volume));}else sound=localStorage.getItem('rugeMuted')!=='true';}catch(_){}
  try{if(bridge?.configured()){sound=bridge.soundEnabled();vibration=bridge.vibrationEnabled();if(typeof bridge.volume==='function'){const v=Number(bridge.volume());if(Number.isFinite(v))volume=Math.max(0,Math.min(1,v));}}else{bridge?.setSound(sound);bridge?.setVibration(vibration);if(typeof bridge?.setVolume==='function')bridge.setVolume(volume);}}catch(_){}
}
function enabled(kind){return kind==='sound'?sound:kind==='vibration'?vibration:false;}
function change(){if(cover)return;try{localStorage.setItem(KEY,JSON.stringify({sound,vibration,volume}));localStorage.setItem('rugeMuted',String(!sound));}catch(_){}try{if(typeof CustomEvent==='function')root.dispatchEvent(new CustomEvent('ruge:feedback-change',{detail:{sound,vibration,volume}}));}catch(_){} }
function stopWebSounds(){epoch++;for(const v of voices){try{v.stop();}catch(_){}}voices=[];}
function stop(){if(cover)return;stopWebSounds();try{bridge?.stop();}catch(_){}try{if(typeof navigator!=='undefined')navigator.vibrate?.(0);}catch(_){} }
function setSound(value){if(cover)return sound;sound=!!value;try{bridge?.setSound(sound);}catch(_){}if(!sound)stopWebSounds();change();return sound;}
function setVolume(value){if(cover||!Number.isFinite(value))return volume;volume=Math.max(0,Math.min(1,value));try{if(typeof bridge?.setVolume==='function')bridge.setVolume(volume);}catch(_){}if(master)master.gain.value=volume/.70;if(volume===0)stopWebSounds();change();return volume;}
function setVibration(value){if(cover)return vibration;vibration=!!value;try{bridge?.setVibration(vibration);}catch(_){}if(!vibration){try{bridge?.cancelVibration();if(typeof navigator!=='undefined')navigator.vibrate?.(0);}catch(_){}}change();return vibration;}
function webSound(name){
  if(!sound||volume===0)return;const generation=epoch;
  try{const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;context=context||new AC();
    const play=()=>{if(generation!==epoch||paused||!sound||volume===0||document.hidden)return;if(!master){master=context.createGain();master.connect(context.destination);}master.gain.value=volume/.70;let at=context.currentTime+.005;
      notes[name].forEach(([frequency,duration])=>{const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(name==='error'?.07:.09,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(master);o.onended=()=>{voices=voices.filter(v=>v!==o);try{o.disconnect();g.disconnect();}catch(_){}};voices.push(o);o.start(at);o.stop(at+duration+.01);at+=duration*.85;});};
    if(context.state==='suspended'){const p=context.resume();if(p?.then)p.then(play).catch(()=>{});else play();}else play();
  }catch(_){}
}
function pulse(strength,milliseconds=12){
  if(cover||paused||!vibration||document.hidden||!Number.isFinite(strength))return false;
  const amount=Math.max(1,Math.min(255,Math.round(strength))),duration=Math.max(8,Math.min(35,Math.round(milliseconds)||12));
  try{if(typeof bridge?.pulse==='function'){bridge.pulse(amount,duration);return true;}if(typeof navigator!=='undefined'&&navigator.vibrate){navigator.vibrate(duration);return true;}}catch(_){}return false;
}
function emit(name){
  if(cover||paused||!notes[name]||document.hidden)return false;
  const now=typeof performance!=='undefined'?performance.now():Date.now(),p=priority[name];
  const gap=name==='win'?900:name==='error'?220:name==='success'?180:65;
  if(now-(lastByName[name]??-Infinity)<gap||now-lastAt<55&&p<=lastPriority)return false;
  lastByName[name]=now;lastAt=now;lastPriority=p;
  try{if(bridge&&typeof bridge.emit==='function'){bridge.emit(name);return true;}}catch(_){}
  webSound(name);if(vibration){try{if(typeof navigator!=='undefined')navigator.vibrate?.(name==='win'?[30,45,40,55,50]:name==='success'?[24,35,28]:name==='error'?[35,40,25]:name==='collect'?15:9);}catch(_){}}
  return true;
}
root.RugeFX={emit,pulse,enabled,setSound,setVibration,getVolume:()=>volume,setVolume,setSoundEnabled:setSound,isSoundEnabled:()=>sound,stop};
root.addEventListener('ruge:pause',()=>{paused=true;stop();});
root.addEventListener('ruge:resume',()=>{paused=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;stop();}else paused=false;});
root.addEventListener('pagehide',stop);
})(window);
