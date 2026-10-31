(function(root){
'use strict';
const KEY='rugeMusicV1',cover=typeof location!=='undefined'&&/[?&]cover=1(?:&|$)/.test(location.search);
const tracks=new Set(['meadow','orchard','paper','cloud','starlight']);
const pageTracks={
  'brain-school':'meadow','english-k':'paper','animal-balance':'orchard','hat-trick':'starlight',
  'pitch-adventure':'cloud','voice-quest':'paper','pocket-radar':'cloud','camera-color':'starlight',
  'forest-juice':'orchard','code-breaker':'paper','pipe-flow':'orchard','gravity-maze':'cloud',
  'number-merge':'paper','tilt-star-box':'starlight','hanzi-puzzle':'meadow','paint-mixing':'orchard',
  'hanzi-typing':'meadow','hanzi-library':'meadow','flappy-bird':'starlight','frog-pond':'orchard',
  'bear-snack-shop':'orchard','settings':'meadow'
};
const brainTracks={identify:'orchard',memory:'cloud',analysis:'paper',compute:'starlight',visual:'meadow'};
let enabled=true,level=.22,selected='',nativeSelected='',audio=null,stopped=false,exited=false,blocked=false,epoch=0;
const reasons=new Set(),bridge=root.RugeMusicNative;
const native=!!bridge&&typeof bridge.setTrack==='function'&&typeof bridge.play==='function';
let base='';
if(!cover){
  try {const p=JSON.parse(localStorage.getItem(KEY)||'null');if(p&&typeof p.enabled==='boolean')enabled=p.enabled;if(p&&Number.isFinite(p.volume))level=Math.max(0,Math.min(1,p.volume));}catch(_){}
  try {if(native){enabled=!!bridge.isEnabled();const v=Number(bridge.volume());if(Number.isFinite(v))level=Math.max(0,Math.min(1,v));localStorage.setItem(KEY,JSON.stringify({enabled,volume:level}));}}catch(_){}
  try {base=new URL('music/',document.currentScript?.src||new URL(/\/[^/]+\.html$/.test(location.pathname)&&!/\/(?:android_asset\/)?index\.html$/.test(location.pathname)?'../shared/music.js':'shared/music.js',location.href).href).href;}catch(_){}
  if(document.hidden)reasons.add('visibility');
}
function canPlay(){return !cover&&!stopped&&!exited&&enabled&&level>0&&tracks.has(selected)&&!document.hidden&&reasons.size===0;}
function persist(){if(cover)return;try{localStorage.setItem(KEY,JSON.stringify({enabled,volume:level}));}catch(_){}
  try{root.dispatchEvent(new CustomEvent('ruge:music-change',{detail:{enabled,volume:level}}));}catch(_){}
}
function silence(release=false){
  epoch++;blocked=false;
  if(cover)return;
  if(native){try{if(release){bridge.stop();nativeSelected='';}else bridge.pause();}catch(_){}return;}
  if(audio)try{audio.pause();if(release){audio.removeAttribute('src');audio.load();audio=null;}}catch(_){}
}
function sync(){
  if(!canPlay()){silence();return false;}
  // Android page-start and the previous document's pagehide can clear native
  // selection after this document booted. Reassert the idempotent track on
  // resume/pointer retry instead of trusting this document's cached selection.
  if(native){try{bridge.setTrack(selected);nativeSelected=selected;bridge.play();blocked=false;return true;}catch(_){return false;}}
  if(typeof root.Audio!=='function'||!base)return false;
  if(!audio){audio=new root.Audio(base+selected+'.ogg');audio.loop=true;audio.preload='none';}
  audio.volume=level;const own=audio,token=++epoch;
  try {const promise=own.play();if(promise&&typeof promise.then==='function')promise.then(()=>{
    // Some engines resolve play after pause/navigation. Never leave that retired element audible.
    if(own!==audio||!canPlay())try{own.pause();}catch(_){}
    if(token===epoch)blocked=false;
  }).catch(()=>{if(token===epoch)blocked=true;});return true;}catch(_){blocked=true;return false;}
}
function select(id){
  if(cover||!tracks.has(id))return false;
  if(selected!==id){silence(true);selected=id;}
  stopped=false;sync();return true;
}
function setEnabled(value){
  if(cover)return enabled;
  enabled=!!value;try{if(native)bridge.setEnabled(enabled);}catch(_){}persist();sync();return enabled;
}
function setVolume(value){
  if(cover||!Number.isFinite(value))return level;
  level=Math.max(0,Math.min(1,value));try{if(native)bridge.setVolume(level);}catch(_){}
  if(audio)audio.volume=level;persist();sync();return level;
}
function reason(value){return typeof value==='string'&&value?value:'manual';}
function suspend(value){if(cover)return;reasons.add(reason(value));try{if(native)bridge.setSuppressed(true);}catch(_){}silence();}
function resume(value){if(cover)return;reasons.delete(reason(value));try{if(native&&reasons.size===0)bridge.setSuppressed(false);}catch(_){}sync();}
function stop(){if(cover)return;stopped=true;silence(true);}
function state(){return {enabled,volume:level,track:selected,suspended:Array.from(reasons),stopped,exited,blocked,native};}
root.RugeMusic={enabled:()=>enabled,volume:()=>level,setEnabled,setVolume,select,suspend,resume,stop,state};
if(cover)return;
function pageTrack(){const parts=(location.pathname||'').split('/').filter(Boolean);for(let i=parts.length-2;i>=0;i--)if(pageTracks[parts[i]])return pageTracks[parts[i]];return 'meadow';}
function boot(){try{if(native&&reasons.size===0)bridge.setSuppressed(false);}catch(_){}select(pageTrack());}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
root.addEventListener('ruge:brain-game',event=>{const category=event.detail?.category;select(brainTracks[category]||'meadow');});
root.addEventListener('ruge:pause',()=>suspend('lifecycle'));
root.addEventListener('ruge:resume',()=>resume('lifecycle'));
document.addEventListener('visibilitychange',()=>document.hidden?suspend('visibility'):resume('visibility'));
root.addEventListener('pagehide',()=>{exited=true;silence(true);});
root.addEventListener('pageshow',event=>{if(event.persisted){exited=false;sync();}});
// Autoplay may be denied in a normal browser; retry only when an actual gesture arrives.
root.addEventListener('pointerdown',()=>{if(canPlay())sync();},{passive:true});
})(window);
