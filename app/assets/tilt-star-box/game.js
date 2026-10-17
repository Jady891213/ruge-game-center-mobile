(function(){
'use strict';
const C=window.TiltStarBox,KEY='rugeTiltStarBoxV1',cover=/[?&]cover=1(?:&|$)/.test(location.search),$=id=>document.getElementById(id);
const icons={back:'<path d="m16 5-8 8 8 8M8 13h15"/>',map:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="15" y="4" width="7" height="7" rx="2"/><rect x="4" y="15" width="7" height="7" rx="2"/><rect x="15" y="15" width="7" height="7" rx="2"/>',reset:'<path d="M5 10a9 9 0 1 1 0 8M5 3v7h7"/>',undo:'<path d="m10 5-7 7 7 7M4 12h11a7 7 0 0 1 7 7"/>',pause:'<path d="M9 6v14M17 6v14"/>',calibrate:'<circle cx="13" cy="13" r="7"/><circle cx="13" cy="13" r="2"/><path d="M13 2v4M13 20v4M2 13h4M20 13h4"/>',tilt:'<rect x="7" y="3" width="12" height="20" rx="3" transform="rotate(15 13 13)"/><path d="m2 9 2-3M22 17l2-3"/>',touch:'<path d="M10 14V5a2 2 0 0 1 4 0v7l3-1 4 3v5a4 4 0 0 1-4 4h-5l-6-6a2 2 0 0 1 3-3l1 1"/>',up:'<path d="m6 15 7-7 7 7"/>',right:'<path d="m10 6 7 7-7 7"/>',down:'<path d="m6 11 7 7 7-7"/>',left:'<path d="m16 6-7 7 7 7"/>',lock:'<rect x="6" y="11" width="14" height="12" rx="3"/><path d="M9 11V7a4 4 0 0 1 8 0v4"/>'};
function icon(name){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
$('home').innerHTML=icon('back');$('map').innerHTML=icon('map');$('restart').innerHTML=icon('reset');$('calibrate').innerHTML=icon('calibrate');$('undo').innerHTML=icon('undo')+'<span>撤回</span>';$('undo').setAttribute('aria-label','撤回上一次翻转');$('pauseButton').innerHTML=icon('pause');
$('tiltMode').innerHTML=icon('tilt')+'<span>倾斜</span>';$('touchMode').innerHTML=icon('touch')+'<span>点方向</span>';Object.keys(C.DIRECTIONS).forEach(d=>$(d).innerHTML=icon(d));
let raw=null;try{if(!cover)raw=JSON.parse(localStorage.getItem(KEY));}catch(_){}
const saved=C.restore(raw),gate=C.createDirectionGate();let state=saved.session,active=false,paused=false,busy=false,timer=0,frame=0,lastTime=0,mode='tilt',gone=false,unavailableSince=0,pendingCalibration=false,routeBlocked=false;
const motion=!cover&&window.RugeMotion&&typeof window.RugeMotion.create==='function'?window.RugeMotion.create():null;
const fx=name=>{if(!cover&&active&&!paused&&window.RugeFX)window.RugeFX.emit(name);};
function save(){if(cover)return;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,session:state}));}catch(_){} }
function cancelAnimation(){clearTimeout(timer);timer=0;busy=false;}
function home(){cancelAnimation();save();if(motion)motion.release();if(window.RugeNav&&typeof window.RugeNav.home==='function')window.RugeNav.home();else location.href='../index.html';}
function unlocked(){let max=0;saved.stars.forEach((n,i)=>{if(n)max=Math.max(max,Math.min(C.LEVELS.length-1,i+1));});return max;}
function canAct(){return active&&!paused&&!busy&&$('confirm').hidden&&$('win').hidden;}
function prepareTilt(){gate.reset(true);if(motion)motion.release();pendingCalibration=mode==='tilt'&&!!motion&&!motion.calibrate();}
function setMode(value){if(value!=='tilt'&&value!=='touch')return false;mode=value;if(motion)motion.setMode(mode);prepareTilt();refreshMode();return true;}
function refreshMode(){
 $('tiltMode').setAttribute('aria-pressed',String(mode==='tilt'));$('touchMode').setAttribute('aria-pressed',String(mode==='touch'));$('calibrate').hidden=mode!=='tilt';
 $('tiltIndicator').classList.toggle('touch',mode==='touch');if(mode==='touch')$('sensorNotice').hidden=true;
}
function menu(){
 cancelAnimation();active=false;paused=false;gate.reset(true);if(motion)motion.release();
 $('play').hidden=true;$('menu').hidden=false;$('map').hidden=true;$('pause').hidden=true;$('confirm').hidden=true;$('win').hidden=true;$('levels').innerHTML='';
 C.LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>unlocked();b.className=saved.stars[i]?'done':'';b.setAttribute('aria-label','第 '+(i+1)+' 关'+(b.disabled?'，未解锁':''));b.innerHTML=b.disabled?icon('lock'):'<span>'+(i+1)+'</span><span class="levelStars">'+(saved.stars[i]?'★ ★ ★':'')+'</span>';b.onclick=()=>{if(i<=unlocked())begin(i);};$('levels').appendChild(b);});
 $('continue').hidden=!state;$('continue').onclick=()=>{if(state)open();};save();
}
function begin(level){if(!Number.isInteger(level)||level<0||level>=C.LEVELS.length)return false;cancelAnimation();state=C.createState(level);open();save();return true;}
function open(){cancelAnimation();routeBlocked=!!state&&!state.finished&&!C.solve(state);active=true;paused=false;if(!cover)prepareTilt();lastTime=0;unavailableSince=0;$('menu').hidden=true;$('play').hidden=false;$('map').hidden=false;$('pause').hidden=true;$('confirm').hidden=true;$('win').hidden=true;refreshMode();render();}
function position(node,p){const l=C.LEVELS[state.level];node.style.transform='translate('+(p%l.w*100)+'%,'+(Math.floor(p/l.w)*100)+'%)';}
function render(){
 if(!state)return;const l=C.LEVELS[state.level];
 $('levelName').textContent='第 '+(state.level+1)+' 关';$('board').style.setProperty('--cols',l.w);$('board').style.setProperty('--rows',l.h);$('pieces').style.setProperty('--cols',l.w);$('pieces').style.setProperty('--rows',l.h);$('board').innerHTML='';$('pieces').innerHTML='';$('nestProgress').innerHTML='';
 for(let p=0;p<l.w*l.h;p++){
  const n=document.createElement('div');n.className='cell'+(l.walls.includes(p)?' wall':'');
  const goal=l.goals.indexOf(p);if(goal>=0){const nest=document.createElement('div');nest.className='nest'+(state.positions[goal]===p?' filled':'');nest.style.setProperty('--color',C.COLORS[goal].color);nest.style.setProperty('--light',C.COLORS[goal].light);nest.innerHTML='<span class="artSprite nestSkin nest'+goal+'"></span>';n.appendChild(nest);}
  $('board').appendChild(n);
 }
 state.positions.forEach((p,i)=>{
  const n=document.createElement('div');n.className='piece'+(p===l.goals[i]?' docked':'');n.dataset.star=String(i);n.innerHTML='<span class="artSprite starSkin star'+i+'"></span>';position(n,p);$('pieces').appendChild(n);
  const dot=document.createElement('span');dot.className='progressDot'+(p===l.goals[i]?' done':'');dot.style.setProperty('--color',C.COLORS[i].color);$('nestProgress').appendChild(dot);
 });
 $('board').setAttribute('aria-label',l.w+' 行 '+l.h+' 列，'+state.positions.map((p,i)=>C.COLORS[i].name+'位于第 '+(Math.floor(p/l.w)+1)+' 行第 '+(p%l.w+1)+' 列'+(p===l.goals[i]?'，已到家':'')).join('；'));
 $('undo').disabled=paused||busy||!state.history.length||state.finished;$('undo').classList.toggle('suggestUndo',routeBlocked&&!paused&&!busy);$('restart').disabled=paused||busy;$('pauseButton').disabled=paused||busy;
 Object.keys(C.DIRECTIONS).forEach(d=>$(d).disabled=paused||busy||state.finished);
 $('calibrate').disabled=paused||busy||state.finished;$('tiltMode').disabled=paused||busy||state.finished;$('touchMode').disabled=paused||busy||state.finished;
 $('next').textContent=state.level===C.LEVELS.length-1?'完成':'下一关';$('win').hidden=cover||paused||busy||!state.finished;
}
function indicate(direction){$('directionGlow').dataset.direction=direction||'';$('directionGlow').classList.toggle('show',!!direction);Object.keys(C.DIRECTIONS).forEach(d=>$(d).classList.toggle('signal',d===direction));}
function act(direction,source='touch'){
 if(!canAct()||!C.DIRECTIONS[direction]||state.finished)return false;
 if(source==='touch'&&mode!=='touch')setMode('touch');
 const before=state.positions.slice(),result=C.move(state,direction);indicate(direction);
 if(!result){$('boardFrame').classList.remove('shake');void $('boardFrame').offsetWidth;$('boardFrame').classList.add('shake');fx('tap');return false;}
 busy=true;routeBlocked=!state.finished&&!C.solve(state);if(state.finished)saved.stars[state.level]=3;save();render();fx('drop');
 // Piece coordinates follow the actual cell path, including a nest stop halfway
 // through a lane. Other stars remain blocked by that settled star.
 result.paths.forEach((path,i)=>{const n=$('pieces').children[i];position(n,before[i]);n.style.transition='none';void n.offsetWidth;n.style.transition='transform '+duration(path)+'ms cubic-bezier(.25,.65,.4,1)';position(n,path[path.length-1]);});
 timer=setTimeout(()=>{timer=0;busy=false;render();indicate(null);if(paused)return;
  const arrivals=state.positions.map((p,i)=>p===C.LEVELS[state.level].goals[i]&&p!==before[i]);arrivals.forEach((a,i)=>{if(a)$('pieces').children[i].classList.add('arrived');});
  if(routeBlocked)$('status').textContent='试试撤回';if(state.finished){fx('win');$('status').textContent='星星到家啦';}else if(arrivals.some(Boolean)){fx('success');$('status').textContent='一颗星星到家啦';}
 },Math.max(...result.paths.map(duration))+30);return true;
}
function duration(path){return Math.min(430,160+(path.length-1)*55);}
function pause(){if(!active||cover)return;cancelAnimation();paused=true;gate.reset(true);indicate(null);if(motion)motion.release();$('confirm').hidden=true;$('win').hidden=true;$('pause').hidden=false;render();save();}
function resume(){if(!active)return;paused=false;prepareTilt();lastTime=0;$('pause').hidden=true;render();}
function onFrame(time){
 if(gone||cover)return;frame=requestAnimationFrame(onFrame);const dt=lastTime?Math.min(.05,(time-lastTime)/1000):.016;lastTime=time;
 if(!active||paused||busy||state.finished||!$('confirm').hidden)return;
 if(mode!=='tilt'){indicate(null);return;}
 const input=motion?motion.read(dt):{x:0,y:0,available:false,fresh:false};
 if(!input.available||!input.fresh){gate.reset(true);indicate(null);$('tiltDot').style.transform='translate(0,0)';if(!unavailableSince)unavailableSince=time;if(time-unavailableSince>500)$('sensorNotice').hidden=false;return;}
 unavailableSince=0;$('sensorNotice').hidden=true;if(pendingCalibration){if(motion.calibrate()){pendingCalibration=false;gate.reset(true);$('tiltDot').style.transform='translate(0,0)';}return;}const x=Number.isFinite(input.x)?input.x:0,y=Number.isFinite(input.y)?input.y:0;$('tiltDot').style.transform='translate('+(Math.max(-1,Math.min(1,x/.45))*11)+'px,'+(Math.max(-1,Math.min(1,y/.45))*11)+'px)';
 const d=gate.read(x,y,dt),preview=gate.status().candidate;indicate(preview);if(d)act(d,'tilt');
}
$('home').onclick=home;$('pauseHome').onclick=home;$('map').onclick=menu;$('winMap').onclick=menu;
$('pauseButton').onclick=()=>{if(canAct())pause();};$('resume').onclick=resume;$('pauseTouch').onclick=()=>{setMode('touch');resume();};
$('tiltMode').onclick=()=>{if(canAct()){setMode('tilt');fx('select');}};$('touchMode').onclick=()=>{if(canAct()){setMode('touch');fx('select');}};
$('calibrate').onclick=()=>{if(!canAct()||!motion)return;gate.reset(true);if(motion.calibrate()){pendingCalibration=false;fx('select');$('status').textContent='已校准';}else{$('sensorNotice').hidden=false;fx('tap');}};
Object.keys(C.DIRECTIONS).forEach(d=>$(d).onclick=()=>act(d));
$('undo').onclick=()=>{if(canAct()&&!state.finished&&C.undo(state)){routeBlocked=!state.finished&&!C.solve(state);gate.reset(true);render();save();fx('undo');}};
$('restart').onclick=()=>{if(!canAct())return;if(state.history.length){gate.reset(true);$('confirm').hidden=false;}else begin(state.level);};
$('confirmRestart').onclick=()=>{if(active&&!paused&&!$('confirm').hidden)begin(state.level);};$('cancelRestart').onclick=()=>{$('confirm').hidden=true;gate.reset(true);};
$('next').onclick=()=>{if(!active||paused||busy||!state.finished)return;if(state.level<C.LEVELS.length-1)begin(state.level+1);else menu();};
window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('ruge:orientation',()=>{gate.reset(true);if(active)pause();});window.addEventListener('pagehide',()=>{gone=true;cancelAnimation();cancelAnimationFrame(frame);if(motion)motion.destroy();save();});
window.__game={core:C,start:begin,menu,act,undo:()=>$('undo').onclick(),pause,resume,state:()=>state,progress:()=>saved.stars.slice(),busy:()=>busy,mode:()=>mode,setMode,gate,motionStatus:()=>motion?motion.status():null,pendingCalibration:()=>pendingCalibration,storageKey:KEY,animationDuration:result=>Math.max(...result.paths.map(duration))+30};
if(cover){document.body.classList.add('cover');state=C.createState(8);open();}else{menu();frame=requestAnimationFrame(onFrame);}
})();
