(function(){
'use strict';
const C=window.CameraColor,$=id=>document.getElementById(id),cover=/[?&]cover=1(?:&|$)/.test(location.search),KEY='rugeCameraColorV1';
const paths={back:'<path d="m15 5-8 7 8 7M7 12h15"/>',map:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="15" y="3" width="7" height="7" rx="2"/><rect x="3" y="15" width="7" height="7" rx="2"/><rect x="15" y="15" width="7" height="7" rx="2"/>',reset:'<path d="M5 7v6h6M5 13a8 8 0 1 0 2-7"/>',pause:'<path d="M8 5v16M18 5v16"/>',camera:'<path d="M9 7l2-3h6l2 3h4v15H3V7Z"/><circle cx="13" cy="14" r="5"/>',sun:'<circle cx="13" cy="13" r="5"/><path d="M13 1v3M13 22v3M1 13h3M22 13h3M4 4l2 2M20 20l2 2M4 22l2-2M20 6l2-2"/>',moon:'<path d="M19 3a10 10 0 1 0 4 17A11 11 0 0 1 19 3Z"/>',warm:'<path d="M14 2c2 7 7 7 7 14a8 8 0 0 1-16 0c0-4 3-6 4-9 0 5 3 5 3 2Z"/>',cool:'<path d="M13 2v22M3 7l20 12M3 19 23 7M9 4l4 4 4-4M9 22l4-4 4 4M3 11l5-2-1-5M19 22l-1-5 5-2M3 15l5 2-1 5M19 4l-1 5 5 2"/>',different:'<circle cx="8" cy="9" r="5"/><rect x="13" y="14" width="10" height="9" rx="2"/>'};
const icon=name=>'<svg viewBox="0 0 26 26" aria-hidden="true">'+paths[name]+'</svg>';
let saved=C.restore(null);if(!cover)try{saved=C.restore(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){}
let state=saved.session,mode=state?.mode||'camera',active=false,paused=false,pollTimer=0,peekTimer=0,toastTimer=0,peeking=false,ready=false,current=null,lastSnapshot=null,lastSnapshotAt=0,startedAt=0,stable=C.stabilizer(),practiceIndex=0;
const samples=[...Object.values(C.COLORS).map(c=>c.rgb),[245,244,228],[175,177,170],[96,100,99],[24,28,34],[248,183,185],[93,73,73]];
const fx=name=>{if(!cover&&!paused)window.RugeFX?.emit(name);};
function save(){if(cover)return;saved.session=state;try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(_){}}
function stopCamera(){clearTimeout(pollTimer);pollTimer=0;ready=false;current=null;lastSnapshot=null;stable.reset();try{window.RugeCamera?.stop();}catch(_){}$('preview').removeAttribute?.('src');$('preview').hidden=true;}
function stopTimers(){clearTimeout(peekTimer);peekTimer=0;clearTimeout(toastTimer);toastTimer=0;}
function home(){stopTimers();stopCamera();save();if(window.RugeNav?.home)window.RugeNav.home();else location.href='../index.html';}
function setMode(next){mode=next==='practice'?'practice':'camera';$('cameraMode').classList.toggle('primary',mode==='camera');$('practiceMode').classList.toggle('primary',mode==='practice');$('modeLabel').textContent=mode==='camera'?'不拍照 · 不上传':'颜色卡练习';renderLevels();}
function renderLevels(){
 $('levels').innerHTML='';const stars=mode==='camera'?saved.cameraStars:saved.practiceStars;
 C.LEVELS.forEach((spec,i)=>{const b=document.createElement('button');b.className='level'+(state?.level===i?' selected':'');b.setAttribute('aria-label','第'+(i+1)+'关，'+spec.title+(stars[i]?'，已完成':''));b.innerHTML='<span>'+(i+1)+'</span><span class="mini">'+(stars[i]?'★ ★ ★':'')+'</span>';b.onclick=()=>begin(i);$('levels').appendChild(b);});
}
function menu(){window.RugeBack?.clearPause();stopCamera();stopTimers();active=false;paused=false;$('play').hidden=true;$('menu').hidden=false;$('pause').hidden=true;$('win').hidden=true;$('map').hidden=true;$('continue').hidden=!state;setMode(mode);save();}
function begin(level,nextMode=mode){if(!C.LEVELS[level])return false;stopTimers();stopCamera();mode=nextMode==='practice'?'practice':'camera';state=C.createState(level,mode);practiceIndex=0;open();save();return true;}
function open(){active=true;paused=false;$('menu').hidden=true;$('play').hidden=false;$('map').hidden=false;$('pause').hidden=true;$('win').hidden=true;render();if(!cover&&!state.finished){showClues();startInput();}}
function stepIcon(step){if(step.kind==='color')return '<span class="clueDot" style="background:'+C.COLORS[step.color].hex+'"></span>';return icon(step.kind==='warm'?'warm':step.kind==='cool'?'cool':step.kind==='light'||step.kind==='lighter'?'sun':step.kind==='dark'||step.kind==='darker'?'moon':'different');}
function renderComparison(){
 const spec=C.LEVELS[state.level],step=spec.steps[state.collected.length],hidden=state.finished||spec.memory&&!peeking;
 $('comparison').hidden=hidden||cover;if(hidden)return;
 const result=C.comparison(step,current,state.collected),rgb=result.target||(step?.kind==='color'?C.COLORS[step.color].rgb:null);
 $('compareTarget').style.background=rgb?'rgb('+rgb.join(',')+')':'conic-gradient(#e44d53,#f7ca42,#56b86b,#559cdd,#a779cc,#e44d53)';
 $('compareSample').style.background=current?'rgb('+current.rgb.join(',')+')':'#e5e6d8';
 $('matchScore').textContent=current?result.score+'分':'—';$('matchFill').style.width=(current?result.score:0)+'%';
 $('comparison').classList.toggle('is-match',!!current&&result.pass);$('comparison').setAttribute('aria-label',current?'匹配度'+result.score+'分，80分合格':'等待取景');
}
function render(){
 if(!state)return;const spec=C.LEVELS[state.level],index=state.collected.length;
 $('levelName').textContent='第 '+(state.level+1)+' 关';$('inputBadge').textContent=state.mode==='camera'?'相机':'颜色卡';$('stepCount').textContent=index+'/'+spec.steps.length;
 $('clues').innerHTML='';spec.steps.forEach((step,i)=>{const node=document.createElement('div'),hidden=spec.memory&&!peeking&&i>=index;node.className='clue'+(i<index?' done':'')+(i===index?' current':'')+(hidden?' hiddenClue':'');node.innerHTML=i<index?'<span class="clueDot" style="background:rgb('+state.collected[i].rgb.join(',')+')"></span>':hidden?'?':stepIcon(step);node.setAttribute('aria-label',i<index?'已找到':hidden?'记忆线索':C.label(step));$('clues').appendChild(node);});
 const step=spec.steps[index];$('target').textContent=state.finished?'集齐啦':peeking?'记住顺序':spec.memory?'找第 '+(index+1)+' 个':(step.unique?'另一种':step.kind==='different'?'再找一种':'找')+C.label(step);
 $('peek').hidden=!spec.memory||state.finished||peeking;$('palette').hidden=state.mode!=='practice';$('practiceScene').hidden=state.mode!=='practice';$('cameraBlank').hidden=state.mode==='practice'||!$('preview').hidden;$('cameraHelp').hidden=true;
 $('capture').disabled=paused||peeking||state.finished||!ready;$('pauseButton').disabled=paused;$('restart').disabled=paused;
 $('win').hidden=cover||paused||!state.finished;$('winStars').textContent='★★★';$('next').textContent=state.level===C.LEVELS.length-1?'完成':'下一关';
 renderComparison();
}
function showClues(){clearTimeout(peekTimer);if(!C.LEVELS[state.level].memory)return;peeking=true;ready=false;render();peekTimer=setTimeout(()=>{peeking=false;stable.reset();render();if(state.mode==='practice')chooseSample(practiceIndex);},3600);}
function startInput(){
 if(cover||paused||state.finished)return;
 stable.reset();ready=false;current=null;
 if(state.mode==='practice'){$('preview').hidden=true;$('sampleBox').classList.remove('waiting');renderPalette();chooseSample(practiceIndex);return;}
 $('sampleBox').classList.add('waiting');$('viewState').textContent='';$('cameraBlank').hidden=false;startedAt=performance.now();
 if(window.RugeCamera){try{window.RugeCamera.start();}catch(_){}poll();}else showCameraHelp('相机暂不可用');
}
function showCameraHelp(message){$('cameraHelp').hidden=false;$('cameraMessage').textContent=message;}
function poll(){
 clearTimeout(pollTimer);if(!active||paused||state.finished||state.mode!=='camera'||cover)return;
 let snap=null;try{snap=JSON.parse(window.RugeCamera.snapshot());}catch(_){}
 if(snap?.running&&snap.jpeg&&snap.ageMs>=0&&snap.ageMs<=1000){
  $('preview').hidden=false;$('cameraBlank').hidden=true;$('cameraHelp').hidden=true;$('sampleBox').classList.remove('waiting');
  if(!lastSnapshot||lastSnapshot.seq!==snap.seq)$('preview').src='data:image/jpeg;base64,'+snap.jpeg;
  const result=stable.push(snap,{kind:'any'},state.collected,performance.now());lastSnapshot=snap;lastSnapshotAt=performance.now();current=result.sample;ready=result.ready&&!peeking;
  if(current)$('sampleColor').style.background='rgb('+current.rgb.join(',')+')';
  $('viewState').textContent=!current?.usable?'对准一小块颜色':ready?'稳住啦':'稳住';
 }else{
  ready=false;current=null;stable.reset();$('sampleBox').classList.add('waiting');
  if(snap?.status==='ready')try{window.RugeCamera.start();}catch(_){}
  if(['denied','unavailable','no-back-camera','unsupported'].includes(snap?.status)||performance.now()-startedAt>4500){
   $('preview').hidden=true;$('cameraBlank').hidden=false;showCameraHelp(snap?.status==='denied'?'相机未授权':'相机未开启');
  }
 }
 $('sampleBox').classList.toggle('ready',ready);$('capture').disabled=!ready||peeking||paused;
 renderComparison();
 pollTimer=setTimeout(poll,180);
}
function renderPalette(){
 $('palette').innerHTML='';samples.forEach((rgb,i)=>{const b=document.createElement('button');b.className='swatch';b.style.background='rgb('+rgb.join(',')+')';b.setAttribute('aria-label','颜色卡 '+(i+1));b.onclick=()=>chooseSample(i);$('palette').appendChild(b);});
}
function chooseSample(index){
 if(!active||paused||state.mode!=='practice'||state.finished||!samples[index])return false;
 practiceIndex=index;current=C.describe(samples[index]);ready=!peeking;$('practiceScene').style.setProperty('--sample','rgb('+current.rgb.join(',')+')');$('sampleColor').style.background='rgb('+current.rgb.join(',')+')';$('sampleBox').classList.toggle('ready',ready);$('capture').disabled=!ready;$('viewState').textContent='';
 Array.from($('palette').children).forEach((b,i)=>b.classList.toggle('active',i===index));renderComparison();fx('select');return true;
}
function collect(){
 if(!active||paused||peeking||state.finished||!ready||!current)return false;
 if(state.mode==='camera'&&(!lastSnapshot||lastSnapshot.ageMs+performance.now()-lastSnapshotAt>1000)){ready=false;return false;}
 if(!C.collect(state,current.rgb)){
  $('viewfinder').classList.remove('shake');void $('viewfinder').offsetWidth;$('viewfinder').classList.add('shake');$('viewState').textContent='再找找';fx('error');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('viewState').textContent='';},700);return false;
 }
 const color=current.rgb.slice();$('flash').classList.remove('pop');void $('flash').offsetWidth;$('flash').classList.add('pop');fx(state.finished?'win':'collect');stable.reset();ready=false;current=null;
 if(state.finished){(state.mode==='camera'?saved.cameraStars:saved.practiceStars)[state.level]=3;stopCamera();stopTimers();peeking=false;}
 render();$('sampleColor').style.background='rgb('+color.join(',')+')';save();
 if(state.mode==='practice'&&!state.finished)chooseSample(practiceIndex);return true;
}
function pause(){if(!active||cover)return;stopTimers();stopCamera();paused=true;peeking=false;$('win').hidden=true;$('pause').hidden=false;render();save();}
function resume(){if(!active)return;paused=false;$('pause').hidden=true;render();if(!state.finished){showClues();startInput();}}
for(const [id,name] of [['home','back'],['map','map'],['restart','reset'],['pauseButton','pause'],['capture','camera']])$(id).innerHTML=icon(name);
$('home').onclick=()=>window.RugeBack.handle();$('pauseHome').onclick=home;$('map').onclick=menu;$('winMap').onclick=menu;$('cameraMode').onclick=()=>setMode('camera');$('practiceMode').onclick=()=>setMode('practice');$('continue').onclick=()=>{if(state){mode=state.mode;open();}};
$('restart').onclick=()=>{if(!paused)begin(state.level,state.mode);};$('pauseButton').onclick=pause;$('resume').onclick=resume;$('capture').onclick=collect;$('peek').onclick=()=>{if(!paused){fx('hint');showClues();}};
$('enableCamera').onclick=()=>{if(active&&!paused&&state.mode==='camera'){stopCamera();startInput();}};$('retryCamera').onclick=$('enableCamera').onclick;$('switchPractice').onclick=()=>{if(active&&!paused)begin(state.level,'practice');};
$('next').onclick=()=>{if(state.finished&&!paused){if(state.level<C.LEVELS.length-1)begin(state.level+1,state.mode);else menu();}};
window.addEventListener('ruge:pause',pause);window.addEventListener('pagehide',()=>{stopTimers();stopCamera();save();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.__game={core:C,start:begin,menu,state:()=>state,mode:()=>mode,chooseSample,collect,pause,resume,ready:()=>ready,progress:()=>({camera:saved.cameraStars.slice(),practice:saved.practiceStars.slice()}),storageKey:KEY};
if(cover){document.body.classList.add('cover');state=C.createState(8,'camera');peeking=true;open();$('cameraBlank').hidden=false;$('target').textContent='找找颜色';}else menu();
window.onRugeBack=()=>{if(!$('pause').hidden)return window.RugeBack.closePause(()=>{$('pause').hidden=true;},resume);if(active){menu();return true;}return false;};
})();
