/* System back and page back arrows share the same explicit page hierarchy. */
(function(root){
'use strict';
let handling=false,resumeButton=null,pauseShield=null,hidePause=null;
function clearPause(){if(!resumeButton)return;resumeButton.hidden=true;resumeButton.remove();resumeButton=null;if(pauseShield){pauseShield.hidden=true;pauseShield.remove();pauseShield=null;}hidePause=null;}
function closePause(hide,resume){
 clearPause();hidePause=hide;hide();
 pauseShield=document.createElement('div');pauseShield.className='ruge-back-shield';pauseShield.setAttribute('aria-hidden','true');document.body.appendChild(pauseShield);
 const button=document.createElement('button');button.id='rugeBackContinue';button.className='ruge-back-continue';button.textContent='▶ 继续';button.setAttribute('aria-label','继续本局');
 button.onclick=()=>{clearPause();resume();};resumeButton=button;document.body.appendChild(button);return true;
}
function parent(){
 const path=String(location.pathname||'');
 if(/\/hanzi-typing\/speaking\.html$/.test(path))return 'index.html';
 if(/\/hat-trick\/memory\.html$/.test(path))return 'index.html?menu=1';
 if(/\/hanzi-library\/index\.html$/.test(path)&&/[?&]from=typing(?:&|$)/.test(location.search))return '../hanzi-typing/index.html';
 return null;
}
function home(){
 try{root.RugeScreen?.set?.('portrait');}catch(_){}
 try{if(typeof root.RugeNav?.home==='function'){root.RugeNav.home();return;}}catch(_){}
 location.href='../index.html';
}
function handle(){
 // A page owns its state; a bad/late handler must never unexpectedly exit it.
 if(handling)return true;
 handling=true;
 clearPause();
 try{
  if(typeof root.onRugeBack==='function'&&root.onRugeBack()!==false)return true;
  const target=parent();
  if(target){try{root.RugeScreen?.set?.('portrait');}catch(_){}location.href=target;}else home();
  return true;
 }catch(error){if(root.console?.error)root.console.error('Page back failed');return true;}
 finally{handling=false;}
}
function suspendPause(){if(resumeButton)resumeButton.hidden=true;if(pauseShield)pauseShield.hidden=true;}
function restorePause(){if(resumeButton){hidePause?.();resumeButton.hidden=false;if(pauseShield)pauseShield.hidden=false;}}
root.addEventListener?.('pagehide',clearPause);root.addEventListener?.('ruge:pause',suspendPause);root.addEventListener?.('ruge:resume',restorePause);
root.document?.addEventListener?.('visibilitychange',()=>root.document.hidden?suspendPause():restorePause());
root.RugeBack=Object.freeze({handle,closePause,clearPause});
})(window);
