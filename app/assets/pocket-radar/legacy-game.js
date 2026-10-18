(function(){
'use strict';
const C=window.PocketRadar,KEY='rugePocketRadarV1',cover=/[?&]cover=1(?:&|$)/.test(location.search),$=id=>document.getElementById(id);
const symbols={key:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="#f6d772" stroke="#9c7840" stroke-width="3"/><path d="m19 19 14 14m-6-6 5-5m-1 9 5-5" fill="none" stroke="#9c7840" stroke-width="5" stroke-linecap="round"/></svg>',star:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 3 5 11 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2Z" fill="#f5ca58" stroke="#b68d3b" stroke-width="2.5" stroke-linejoin="round"/></svg>',chest:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 18V13a7 7 0 0 1 7-7h16a7 7 0 0 1 7 7v5" fill="#e8ae62" stroke="#916337" stroke-width="3"/><rect x="5" y="17" width="30" height="18" rx="4" fill="#efc572" stroke="#916337" stroke-width="3"/><path d="M6 23h28M12 7v27M28 7v27" stroke="#a47743" stroke-width="2"/><rect x="16" y="19" width="8" height="10" rx="2" fill="#fff2af" stroke="#916337" stroke-width="2"/></svg>'};
const icons={home:'<path d="m3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7"/>',map:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',reset:'<path d="M5 10a8 8 0 1 1 0 8M5 3v7h7"/>',pause:'<path d="M8 5v14M16 5v14"/>'};
function icon(name){return'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';}
$('home').innerHTML=icon('home');$('mapButton').innerHTML=icon('map');$('reset').innerHTML=icon('reset');$('pauseButton').innerHTML=icon('pause');
$('turnLeft').innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 10H4V2M5 10a15 15 0 1 1-1 18"/></svg>';$('turnRight').innerHTML=$('turnLeft').innerHTML;
let raw=null;try{if(!cover)raw=JSON.parse(localStorage.getItem(KEY));}catch(_){}
const saved=C.restore(raw),motion=!cover&&window.RugeMotion?window.RugeMotion.create():null;
let state=saved.session,tab='radar',active=false,paused=false,gone=false,frame=0,lastTime=0,mode=window.RugeTilt?'sensor':'touch',touch=[0,0],turn=0,touchAngle=0,dragPoint=null,calibrated=false;
let duel=false,player=1,firstTime=null,lastPulse=-1,lastTickAngle=0,lastSave=0,waitingForPlayer=false,needNeutral=false,cueUntil=0;
const fx=name=>{if(!cover&&!paused&&!document.hidden)window.RugeFX?.emit(name);};
function save(){if(cover)return;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,bests:saved.bests,session:duel?saved.session:state}));}catch(_){} }
function clearInput(){touch=[0,0];turn=0;dragPoint=null;dragging=false;lastPulse=-1;if(state?.mode==='safe')state.hold=0;motion?.release();try{window.RugeFeedback?.cancelVibration();}catch(_){} }
function menu(){active=false;paused=false;waitingForPlayer=false;needNeutral=false;clearInput();$('menu').hidden=false;$('play').hidden=true;['pause','win','confirm','handover'].forEach(id=>$(id).hidden=true);$('mapButton').hidden=true;
 ['radar','safe','duel'].forEach(t=>$(t+'Tab').setAttribute('aria-pressed',String(tab===t)));
 const progress=saved.stars[tab==='radar'?'radar':'safe'];let reached=0;progress.forEach((n,i)=>{if(n)reached=Math.max(reached,Math.min(17,i+1));});
 $('levels').innerHTML='';for(let i=0;i<18;i++){const b=document.createElement('button');b.textContent=String(i+1);b.className=progress[i]?'done':'';b.disabled=tab!=='duel'&&i>reached;b.setAttribute('aria-label','第'+(i+1)+'关'+(b.disabled?'，未解锁':''));b.onclick=()=>start(i,tab==='radar'?'radar':'safe',tab==='duel');$('levels').appendChild(b);}
 $('continue').hidden=!saved.session;$('continue').onclick=()=>{duel=false;state=saved.session;open();};save();}
function start(level,kind=tab==='radar'?'radar':'safe',two=false){if(!Number.isInteger(level)||level<0||level>17)return false;
 if(!duel)saved.session=state;duel=two;player=1;firstTime=null;state=kind==='safe'?C.createSafe(level):C.createRadar(level);touchAngle=0;open();if(duel)handover();else{saved.session=state;save();}return true;}
function open(){active=true;paused=false;waitingForPlayer=false;needNeutral=false;cueUntil=0;clearInput();calibrated=!!motion?.calibrate();lastTime=0;touchAngle=state.angle||0;lastTickAngle=touchAngle;$('menu').hidden=true;$('play').hidden=false;$('mapButton').hidden=false;['pause','win','confirm','handover'].forEach(id=>$(id).hidden=true);refresh();draw();if(state.finished)showResult();}
function handover(){waitingForPlayer=true;clearInput();$('handover').hidden=false;$('playerBadge').textContent=String(player);$('handoverTitle').textContent='交给'+(player===1?'一':'二')+'号玩家';}
function canAct(){return active&&!paused&&!state.finished&&$('confirm').hidden&&$('handover').hidden&&!document.hidden;}
function refresh(){if(!state)return;const safe=state.mode==='safe',l=safe?C.SAFE_LEVELS[state.level]:C.RADAR_LEVELS[state.level],count=safe?l.code.length:l.targets.length;
 $('levelName').textContent=(duel?'玩家'+player+' · ':'')+'第 '+(state.level+1)+' 关';$('timer').textContent=state.elapsed.toFixed(1);$('goals').innerHTML='';for(let i=0;i<count;i++){const n=document.createElement('span'),kind=safe?'star':l.targets[i].kind;n.className=i<state.index?'done':i===state.index?'current':'pending';n.innerHTML=symbols[kind];n.setAttribute('aria-label',(i<state.index?'已找到':i===state.index?'寻找':'随后寻找')+({key:'钥匙',star:'星星',chest:'宝箱'})[kind]);$('goals').appendChild(n);}
 $('inputMode').textContent=mode==='sensor'?'手机':'手指';$('inputMode').setAttribute('aria-pressed',String(mode==='sensor'));$('touchControls').hidden=mode!=='touch';$('arrows').hidden=safe;$('dialButtons').hidden=!safe;$('dig').hidden=safe;
 $('next').textContent=duel&&player===1?'换人':duel?'再挑战':state.level===17?'完成':'下一关';
 if(!state.finished){const strength=safe?C.safeSignal(state):C.radarSignal(state);$('signal').children&&Array.from($('signal').children).forEach((n,i)=>n.classList.toggle('on',strength>i*.2));$('cue').textContent=cueUntil>performance.now()?'再找找':safe?(state.hold>0?'停住！':'慢慢转'):(l.targets[state.index].kind==='key'?'找钥匙':l.targets[state.index].kind==='star'?'找星星':'找宝箱');}
}
function showResult(){
 $('winTitle').textContent=state.mode==='safe'?'打开啦！':'找到啦！';$('result').textContent=state.elapsed.toFixed(1)+' 秒';
 if(duel&&player===2){const diff=Number(state.elapsed.toFixed(1))-Number(firstTime.toFixed(1));$('winTitle').textContent=Math.abs(diff)<.001?'一样快！':diff<0?'二号更快！':'一号更快！';$('result').textContent='① '+firstTime.toFixed(1)+' 秒\n② '+state.elapsed.toFixed(1)+' 秒';}
 $('win').hidden=false;refresh();}
function done(){clearInput();if(!duel){saved.stars[state.mode][state.level]=3;const best=saved.bests[state.mode][state.level];if(best===null||state.elapsed<best)saved.bests[state.mode][state.level]=state.elapsed;saved.session=state;save();}fx('win');showResult();}
function dig(){if(!canAct()||state.mode!=='radar')return false;const ok=C.dig(state);if(ok){cueUntil=0;if(state.finished)done();else{fx('collect');refresh();save();}}else{fx('error');cueUntil=performance.now()+700;$('cue').textContent='再找找';}return ok;}
function setMode(value){if(value!=='sensor'&&value!=='touch')return false;clearInput();mode=value;needNeutral=duel&&state?.mode==='safe'&&value==='sensor';calibrated=!!motion?.calibrate();$('posture').hidden=true;if(state)refresh();return true;}
function pause(){if(!active||cover)return;paused=true;waitingForPlayer=waitingForPlayer||!$('handover').hidden;clearInput();$('handover').hidden=true;$('confirm').hidden=true;$('posture').hidden=true;$('win').hidden=true;$('pause').hidden=false;save();}
function resume(){if(!active)return;paused=false;clearInput();calibrated=!!motion?.calibrate();lastTime=0;$('pause').hidden=true;if(waitingForPlayer)handover();else if(state.finished)showResult();refresh();}
function home(){clearInput();save();if(window.RugeNav)window.RugeNav.home();else location.href='../index.html';}
function pulse(strength,time){if(cover||paused||document.hidden)return;const interval=strength>.9?120:strength>.7?190:strength>.4?320:570;if(time-lastPulse<interval)return;lastPulse=time;
 try{if(!window.RugeFX?.pulse(Math.round(45+strength*190),strength>.9?24:12))fx(strength>.85?'hint':'tap');}catch(_){}
}
function tick(dt,time){if(!canAct())return;let available=true,angle=touchAngle,dx=touch[0],dy=touch[1];
 if(mode==='sensor'){
  if(state.mode==='safe'){const p=motion?.posture();available=!!p?.fresh&&p.y>.25&&Math.hypot(p.x,p.y)>.4;angle=available?Math.atan2(p.x,p.y)*180/Math.PI:state.angle;$('postureText').textContent=p?.fresh?'竖着拿，左右转':'试试手指';$('posture').hidden=available;}
  else{const p=motion?.read(dt);available=!!p?.available;if(available&&!calibrated){calibrated=motion.calibrate();dx=dy=0;}else{dx=available?Math.max(-1,Math.min(1,p.x/.25)):0;dy=available?Math.max(-1,Math.min(1,p.y/.25)):0;}$('postureText').textContent='试试手指';$('posture').hidden=available;}
 }else{$('posture').hidden=true;if(state.mode==='safe'){touchAngle=Math.max(-72,Math.min(72,touchAngle+turn*dt*40));angle=touchAngle;}else if(dragPoint){const vx=dragPoint[0]-state.x,vy=dragPoint[1]-state.y,n=Math.hypot(vx,vy);dx=n>.015?vx/n:0;dy=n>.015?vy/n:0;}}
 if(!available){if(state.mode==='safe')state.hold=0;refresh();draw();return;}
 if(needNeutral){if(Math.abs(angle)>10){state.hold=0;$('postureText').textContent='先转正';$('posture').hidden=false;refresh();draw();return;}needNeutral=false;$('posture').hidden=true;}
 if(state.mode==='safe'){
  const event=C.safeStep(state,angle,dt,available);if(event){if(state.finished)done();else{fx('success');save();}}
  if(available&&!state.finished){const strength=C.safeSignal(state);if(strength>.68||Math.abs(angle-lastTickAngle)>4){pulse(strength,time);lastTickAngle=angle;}}
 }else{C.radarMove(state,available?dx:0,available?dy:0,dt);pulse(C.radarSignal(state),time);}
 if(time-lastSave>1200){lastSave=time;save();}refresh();draw();
}
const canvas=$('board'),ctx=canvas.getContext('2d');
function roundRect(x,y,w,h,r,fill,stroke){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}}
function draw(){if(!state||cover)return;const box=canvas.getBoundingClientRect(),w=Math.max(200,box.width),h=Math.max(100,box.height),d=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
 if(state.mode==='safe'){
  ctx.fillStyle='#b2e0d6';ctx.fillRect(0,0,w,h);const r=Math.min(w*.36,h*.34),cx=w/2,cy=h*.53;
  roundRect(w*.06,h*.08,w*.88,h*.85,24,'#61c3b1','#3e8e84');
  ctx.fillStyle='#fff2c8';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#46766b';ctx.lineWidth=4;ctx.stroke();
  for(let a=-75;a<=75;a+=15){const rad=(a-90)*Math.PI/180;ctx.strokeStyle='#ac9664';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx+Math.cos(rad)*r*.8,cy+Math.sin(rad)*r*.8);ctx.lineTo(cx+Math.cos(rad)*r*.92,cy+Math.sin(rad)*r*.92);ctx.stroke();}
  const rad=(state.angle-90)*Math.PI/180;ctx.strokeStyle='#e99746';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(rad)*r*.72,cy+Math.sin(rad)*r*.72);ctx.stroke();ctx.fillStyle='#f1c557';ctx.beginPath();ctx.arc(cx,cy,r*.29,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b5883f';ctx.lineWidth=3;ctx.stroke();
  const hold=state.hold/C.SAFE_LEVELS[state.level].hold;if(hold>0){ctx.strokeStyle='#90e283';ctx.lineWidth=10;ctx.beginPath();ctx.arc(cx,cy,r*1.08,-Math.PI/2,-Math.PI/2+hold*Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#fff5ce';ctx.beginPath();ctx.moveTo(cx,h*.04);ctx.lineTo(cx-9,h*.04+13);ctx.lineTo(cx+9,h*.04+13);ctx.closePath();ctx.fill();
 }else{
  const l=C.RADAR_LEVELS[state.level];ctx.fillStyle='#d5edb3';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#c0dda0';ctx.lineWidth=2;for(let x=0;x<w;x+=w/5){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=h/5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  l.walls.forEach(b=>roundRect(b.x*w,b.y*h,b.w*w,b.h*h,10,'#96ac93','#688776'));
  l.targets.slice(0,state.index).forEach(t=>{ctx.fillStyle='#c0a26d';ctx.beginPath();ctx.ellipse(t.x*w,t.y*h,12,7,0,0,Math.PI*2);ctx.fill();});
  const strength=C.radarSignal(state),x=state.x*w,y=state.y*h;ctx.strokeStyle='#77ad6b';ctx.lineWidth=2;for(let n=2;n>0;n--){ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(x,y,15+n*12+Math.sin(state.elapsed*4)*3,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
  ctx.fillStyle='#fff8d8';ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#4d8d72';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#62785b';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+12,y+13);ctx.lineTo(x+23,y+24);ctx.stroke();ctx.fillStyle=strength>.91?'#edbc4b':'#9cc268';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();
 }
}
function frameLoop(t){if(gone||cover)return;frame=requestAnimationFrame(frameLoop);const dt=lastTime?Math.max(0,Math.min(.05,(t-lastTime)/1000)):.016;lastTime=t;tick(dt,t);}
$('home').onclick=home;$('mapButton').onclick=menu;$('pauseMap').onclick=menu;$('winMap').onclick=menu;$('pauseButton').onclick=pause;$('resume').onclick=resume;
['radar','safe','duel'].forEach(t=>$(t+'Tab').onclick=()=>{tab=t;menu();fx('select');});
$('dig').onclick=dig;$('inputMode').onclick=()=>{if(canAct()){setMode(mode==='touch'?'sensor':'touch');fx('tap');}};$('fallback').onclick=()=>setMode('touch');
$('reset').onclick=()=>{if(canAct()){clearInput();$('confirmTitle').textContent=duel?'重新比赛？':'重新开始？';$('confirm').hidden=false;}};$('cancelReset').onclick=()=>{$('confirm').hidden=true;lastTime=0;};$('confirmReset').onclick=()=>{if(active&&!paused&&!$('confirm').hidden){const level=state.level,kind=state.mode,two=duel;start(level,kind,two);}};
$('ready').onclick=()=>{if(active&&!paused&&!$('handover').hidden){waitingForPlayer=false;needNeutral=duel&&state.mode==='safe'&&mode==='sensor';$('handover').hidden=true;calibrated=!!motion?.calibrate();lastTime=0;}};
$('next').onclick=()=>{if(!active||paused||!state.finished||$('win').hidden)return;if(duel&&player===1){firstTime=state.elapsed;player=2;state=C.createSafe(state.level);open();handover();}else if(duel){tab='duel';menu();}else if(state.level<17)start(state.level+1,state.mode);else menu();};
const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
for(const [id,v]of Object.entries(dirs)){
 $(id).addEventListener('pointerdown',e=>{e.preventDefault();if(!canAct())return;setMode('touch');touch=v.slice();e.currentTarget?.setPointerCapture?.(e.pointerId);});
 ['pointerup','pointercancel','lostpointercapture'].forEach(n=>$(id).addEventListener(n,()=>{touch=[0,0];}));
}
for(const [id,v]of [['turnLeft',-1],['turnRight',1]]){$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(!canAct())return;setMode('touch');turn=v;e.currentTarget?.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(n=>$(id).addEventListener(n,()=>{turn=0;}));}
let dragging=false;
function pointer(e){const r=canvas.getBoundingClientRect();if(state.mode==='safe'){touchAngle=Math.max(-72,Math.min(72,Math.atan2(e.clientX-r.left-r.width/2,r.height*.53-(e.clientY-r.top))*180/Math.PI));}else dragPoint=[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];}
canvas.addEventListener('pointerdown',e=>{if(!canAct())return;setMode('touch');dragging=true;canvas.setPointerCapture?.(e.pointerId);pointer(e);});canvas.addEventListener('pointermove',e=>{if(dragging&&canAct())pointer(e);});['pointerup','pointercancel','lostpointercapture'].forEach(n=>canvas.addEventListener(n,()=>{dragging=false;dragPoint=null;}));
window.addEventListener('ruge:pause',pause);window.addEventListener('ruge:orientation',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',draw);window.addEventListener('pagehide',()=>{gone=true;clearInput();save();cancelAnimationFrame(frame);motion?.destroy();});
window.__game={core:C,start,menu,pause,resume,dig,setMode,state:()=>state,progress:()=>saved.stars,storageKey:KEY,step:tick,setAngle(v){touchAngle=v;},setPosition(x,y){if(state?.mode==='radar'){state.x=x;state.y=y;}},isPaused:()=>paused};
if(cover){document.body.classList.add('cover');$('mapButton').hidden=true;document.title='pocket-radar-cover-ready';}else{menu();frame=requestAnimationFrame(frameLoop);}
})();
