/* Packaged demonstration clips only: no account key or synthesis network request. */
(function(w){'use strict';
const script=document.currentScript?.src;
const base=script?script.slice(0,script.lastIndexOf('/')+1)+'demo-audio/':'../shared/demo-audio/';
const clips=w.RugeDemoClips||{};let generation=0,active=null,suspended=false;
function available(key){return typeof w.Audio==='function'&&Object.hasOwn(clips,key)&&/^[a-f0-9]{18}\.mp3$/.test(clips[key]);}
function stop(){generation++;if(active){const a=active;active=null;try{a.pause();a.removeAttribute('src');a.load();}catch(_){}}try{w.RugeMusic?.resume('demo');}catch(_){}}
async function play(key){stop();if(suspended||document.hidden||!available(key))return false;const token=generation;w.RugeMusic?.suspend('demo');
 try{const a=new w.Audio(base+clips[key]);active=a;a.preload='auto';a.onended=a.onerror=()=>{if(active===a){active=null;w.RugeMusic?.resume('demo');}};
 await a.play();if(token!==generation||suspended||document.hidden){try{a.pause();}catch(_){}return false;}return true;
 }catch(_){if(token===generation){active=null;w.RugeMusic?.resume('demo');}return false;}}
w.addEventListener('ruge:pause',()=>{suspended=true;stop();});w.addEventListener('ruge:resume',()=>{suspended=false;});
w.addEventListener('pagehide',()=>{suspended=true;stop();});w.addEventListener('pageshow',()=>{suspended=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
w.DemoAudio=Object.freeze({available,play,stop});
})(window);
