(function(){
'use strict';
const C=window.PaintMixing,$=id=>document.getElementById(id),cover=/[?&]cover=1(?:&|$)/.test(location.search);
const KEY='rugePaintMixingV1';let saved={stars:Array(C.LEVELS.length).fill(0),session:null};
if(!cover){try{saved=C.restore(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){}}
let state=saved.session,active=false,paused=false;
let lastMapKey='',mapTrail=[];
function canPlay(){return !cover&&active&&!paused&&$('confirm').hidden!==false;}
function fx(name){if(!cover&&!paused)window.RugeFX?.emit(name);}
const icons={back:'<path d="m15 5-8 7 8 7M7 12h15"/>',map:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="15" y="4" width="6" height="6" rx="1"/><rect x="4" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',undo:'<path d="M10 5 4 11l6 6M4 11h10a6 6 0 0 1 0 12" transform="translate(0 -3)"/>',empty:'<path d="M6 7h14M9 7V4h8v3M8 7l1 14h9l1-14M12 11v6M15 11v6"/>',reset:'<path d="M5 7v6h6M5 13a8 8 0 1 0 2-7"/>',lock:'<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'};
const icon=name=>'<svg viewBox="0 0 26 26" aria-hidden="true">'+icons[name]+'</svg>';
$('home').innerHTML=icon('back');$('map').innerHTML=icon('map');$('restart').innerHTML=icon('reset');$('undo').innerHTML=icon('undo');$('empty').innerHTML=icon('empty');
// Generated grayscale stickers keep their alpha and outlines; SVG color matrix
// tints their white body with the game's actual RYB result, never a second recipe.
const ART={frog:[52,79,374,375],orange:[495,43,359,398],grapes:[934,30,381,444],leaf:[1397,52,330,412],fish:[37,523,398,312],bunny:[520,485,320,373],cloud:[895,553,437,295],flower:[1375,489,363,355]};
function art(shape,color){
  const f=color||'#eee9d9',rgb=f.slice(1).match(/../g).map(c=>parseInt(c,16)/255),rect=ART[shape]||ART.frog;
  const tintId='paintTint'+shape+f.slice(1),clipId=tintId+'Crop';
  const matrix=rgb.map((c,i)=>[0,0,0,0,0].map((_,j)=>j===i?c:0).join(' ')).join(' ')+' 0 0 0 1 0';
  return '<svg viewBox="'+rect.join(' ')+'" role="img" aria-label="'+(C.current(state)?.name||'调色伙伴')+'"><defs><clipPath id="'+clipId+'"><rect x="'+rect[0]+'" y="'+rect[1]+'" width="'+rect[2]+'" height="'+rect[3]+'"/></clipPath><filter id="'+tintId+'" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="'+matrix+'"/></filter></defs><g fill="'+f+'" clip-path="url(#'+clipId+')"><image href="art/paint-friends.png" width="1774" height="887" filter="url(#'+tintId+')"/></g></svg>';
}
function save(){if(cover)return;saved.session=state;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,session:state}));}catch(_){}}
function home(){save();if(window.RugeNav&&typeof window.RugeNav.home==='function')window.RugeNav.home();else location.href='../index.html';}
function unlock(){let max=0;for(let i=0;i<C.LEVELS.length;i++)if(saved.stars[i])max=Math.max(max,Math.min(C.LEVELS.length-1,i+1));return max;}
function menu(){window.RugeBack?.clearPause();active=false;paused=false;$('pause').hidden=true;$('confirm').hidden=true;$('play').hidden=true;$('menu').hidden=false;$('map').hidden=true;$('levels').innerHTML='';
  const old=state;state=C.createState(0);document.querySelector('.mascot').innerHTML=art('frog',C.hex(C.mix(['yellow','blue'])));state=old;
  C.LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>unlock();b.setAttribute('aria-label','第 '+(i+1)+' 关 '+l.name+(b.disabled?' 未解锁':''));b.innerHTML='<span class="levelnum">'+(i+1)+'</span><span class="levelname">'+l.name+'<span class="levelstar">'+(saved.stars[i]?'★'.repeat(saved.stars[i]):'')+'</span></span>'+(b.disabled?'<span class="lock">'+icon('lock')+'</span>':'');b.onclick=()=>begin(i,false);$('levels').appendChild(b);});save();}
function begin(level,free){state=C.createState(level,free);lastMapKey='';mapTrail=[];open();save();}
function open(){active=true;paused=false;$('menu').hidden=true;$('play').hidden=false;$('map').hidden=false;$('pause').hidden=true;render();}
function render(){
  const target=C.current(state),mixed=C.mix(state.drops),isDone=state.accepted;
  $('levelName').textContent=state.free?'自由画室':'第 '+(state.level+1)+' 关';
  $('orders').innerHTML=state.free?'':C.LEVELS[state.level].targets.map((_,i)=>'<i class="'+(i<state.order||i===state.order&&state.accepted?'done':i===state.order?'current':'')+'"></i>').join('');
  $('targetName').textContent=state.free?'随心画':target.name;$('targetSwatch').style.background=C.hex(target.color);document.querySelector('.target span').textContent=state.free?'我的颜色':'照着调';
  $('art').innerHTML=art(target.shape,isDone||cover?C.hex(mixed||target.color):null);
  $('paintFill').style.background=C.hex(mixed);
  $('dropList').innerHTML=state.drops.map(c=>'<i style="--c:'+C.COLORS[c].hex+'"></i>').join('');
  $('palette').innerHTML='';(state.free?C.IDS:C.LEVELS[state.level].palette).forEach(c=>{const b=document.createElement('button'),n=state.drops.filter(x=>x===c).length;b.dataset.color=c;b.style.setProperty('--c',C.COLORS[c].hex);b.setAttribute('aria-label',C.COLORS[c].name+'色，加一滴');b.innerHTML='<span class="blob"></span><span>'+C.COLORS[c].name+'</span>'+(n?'<b class="count">'+n+'</b>':'');b.disabled=paused||isDone||state.drops.length>=C.MAX_DROPS;b.onclick=()=>{if(!canPlay())return;if(C.add(state,c)){fx('drop');render();save();}};$('palette').appendChild(b);});
  $('undo').disabled=paused||isDone||!state.drops.length;$('empty').disabled=paused||isDone||!state.drops.length;$('paint').hidden=isDone;$('paint').disabled=paused||!state.drops.length;
  $('next').hidden=!isDone;$('next').textContent=state.free?'再画一个':state.order+1<C.LEVELS[state.level].targets.length?'下一个':state.level<C.LEVELS.length-1?'下一关':'完成';
  $('artStars').textContent=isDone?'★ '.repeat(state.free?3:C.stars(state)).trim():'';$('artStars').hidden=!isDone;$('message').textContent='';
  renderColorMap(target,mixed);
}
function renderColorMap(target,mixed){
  $('colorGuide').hidden=cover;
  const g=C.guidance(state.drops,state.free?mixed:target.color),key=state.level+':'+state.free+':'+state.order;
  if(lastMapKey!==key){mapTrail=[];lastMapKey=key;}
  const last=mapTrail.at(-1),point=C.wheelPoint(mixed),goalPoint=state.free?null:C.wheelPoint(target.color);
  if(point&&(!last||Math.hypot(point.x-last.x,point.y-last.y)>.01||Math.abs(point.value-last.value)>.001)){mapTrail.push(point);if(mapTrail.length>8)mapTrail.shift();}
  if(!mixed)mapTrail=[];
  const star=p=>'<path transform="translate('+p.x+' '+p.y+')" d="M0-12 3.7-4 12.5-3.5 6 3 8 12 0 7.5-8 12-6 3-12.5-3.5-3.7-4Z" fill="'+C.hex(target.color)+'" stroke="#fffdf6" stroke-width="4" stroke-linejoin="round"/><path transform="translate('+p.x+' '+p.y+')" d="M0-12 3.7-4 12.5-3.5 6 3 8 12 0 7.5-8 12-6 3-12.5-3.5-3.7-4Z" fill="none" stroke="#35544b" stroke-width="1.5"/>';
  const goal=goalPoint?star(goalPoint):'',current=point?'<circle cx="'+point.x+'" cy="'+point.y+'" r="8" fill="'+C.hex(mixed)+'" stroke="white" stroke-width="4"/><circle cx="'+point.x+'" cy="'+point.y+'" r="10" fill="none" stroke="#35544b" stroke-width="1.5"/>':'';
  const valueY=p=>232-p.value*208;
  $('colorMap').innerHTML='<div class="wheel-layout"><div class="wheel"><div class="wheel-disc" aria-hidden="true"></div><svg viewBox="0 0 256 256" role="img" aria-label="连续色盘，星星是目标，圆点是现在，白色在中央">'+(mapTrail.length>1?'<polyline points="'+mapTrail.map(p=>p.x+','+p.y).join(' ')+'" stroke="white" stroke-width="4" fill="none"/><polyline points="'+mapTrail.map(p=>p.x+','+p.y).join(' ')+'" stroke="#35544b" opacity=".8" stroke-width="1.6" stroke-dasharray="3 4" fill="none"/>':'')+goal+current+'<text x="128" y="13" text-anchor="middle">红</text><text x="238" y="68" text-anchor="middle">黄</text><text x="33" y="190" text-anchor="middle">蓝</text>'+(!point||Math.hypot(point.x-128,point.y-128)>25?'<text x="128" y="132" text-anchor="middle" class="white-label">白</text>':'')+'</svg></div><svg class="value-rail" viewBox="0 0 44 256" role="img" aria-label="亮度对照，上方亮，下方暗"><defs><linearGradient id="brightness" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf0"/><stop offset="1" stop-color="#35453f"/></linearGradient></defs><rect x="16" y="24" width="16" height="208" rx="8" fill="url(#brightness)" stroke="#d9d5c5" stroke-width="2"/>'+(goalPoint?'<path d="M12 '+valueY(goalPoint)+' l-7-5v10z" fill="#ffca55" stroke="#35544b" stroke-width="1.5"/>':'')+(point?'<circle cx="24" cy="'+valueY(point)+'" r="7" fill="'+C.hex(mixed)+'" stroke="white" stroke-width="3"/><circle cx="24" cy="'+valueY(point)+'" r="8.5" fill="none" stroke="#35544b" stroke-width="1.5"/>':'')+'<text x="24" y="14" text-anchor="middle">亮</text><text x="24" y="250" text-anchor="middle">暗</text></svg></div>';
  $('paintMatch').textContent=state.free?'自由配色':mixed?g.score+'分':'90分上色';$('paintMatch').classList.toggle('matched',g.pass&&!state.free);
}
$('home').onclick=()=>window.RugeBack.handle();$('pauseHome').onclick=home;$('map').onclick=menu;$('free').onclick=()=>begin(0,true);
$('undo').onclick=()=>{if(canPlay()&&C.undo(state)){fx('undo');render();save();}};$('empty').onclick=()=>{if(canPlay()&&state.drops.length&&C.reset(state)){fx('undo');render();save();}};
$('paint').onclick=()=>{if(!canPlay()||state.accepted||state.finished)return;if(C.paint(state)){fx(!state.free&&state.order+1===C.LEVELS[state.level].targets.length?'win':'success');if(!state.free&&state.order+1===C.LEVELS[state.level].targets.length)saved.stars[state.level]=Math.max(saved.stars[state.level],C.stars(state));render();$('art').classList.remove('happy');void $('art').offsetWidth;$('art').classList.add('happy');save();}else if(state.drops.length){fx('error');$('message').textContent='再调一调';$('stage').classList.remove('shake');void $('stage').offsetWidth;$('stage').classList.add('shake');save();}};
$('next').onclick=()=>{if(!canPlay()||!C.next(state))return;fx('tap');if(state.finished){const li=state.level;if(li<C.LEVELS.length-1)begin(li+1,false);else menu();}else{render();save();}};
$('restart').onclick=()=>{if(!canPlay())return;if(state.drops.length||state.painted.length)$('confirm').hidden=false;else{state=C.restart(state);render();save();}};
$('confirmRestart').onclick=()=>{if(cover||paused||!active)return;fx('undo');$('confirm').hidden=true;state=C.restart(state);render();save();};$('cancelRestart').onclick=()=>{$('confirm').hidden=true;};
function pause(){if(!active||cover)return;paused=true;$('confirm').hidden=true;$('pause').hidden=false;save();}
$('resume').onclick=()=>{paused=false;$('pause').hidden=true;render();};
window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',save);
window.__game={core:C,start:begin,menu,state:()=>state,progress:()=>saved.stars.slice(),pause,resume:()=>{$('resume').click();},storageKey:KEY};
if(cover){document.body.classList.add('cover');state=C.createState(0);state.drops=['yellow','blue'];state.accepted=true;open();}else if(state&&!state.finished){open();}else menu();
window.onRugeBack=()=>{if(!$('pause').hidden)return window.RugeBack.closePause(()=>{$('pause').hidden=true;},()=>$('resume').onclick());if(!$('confirm').hidden){$('cancelRestart').onclick();return true;}if(active){menu();return true;}return false;};
})();
