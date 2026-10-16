(function(){
'use strict';
const C=window.PaintMixing,$=id=>document.getElementById(id),cover=/[?&]cover=1(?:&|$)/.test(location.search);
const KEY='rugePaintMixingV1';let saved={stars:Array(10).fill(0),session:null};
if(!cover){try{saved=C.restore(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){}}
let state=saved.session,active=false,paused=false;
function canPlay(){return !cover&&active&&!paused&&$('confirm').hidden!==false;}
function fx(name){if(!cover&&!paused)window.RugeFX?.emit(name);}
const icons={back:'<path d="m15 5-8 7 8 7M7 12h15"/>',map:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="15" y="4" width="6" height="6" rx="1"/><rect x="4" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',undo:'<path d="M10 5 4 11l6 6M4 11h10a6 6 0 0 1 0 12" transform="translate(0 -3)"/>',empty:'<path d="M6 7h14M9 7V4h8v3M8 7l1 14h9l1-14M12 11v6M15 11v6"/>',reset:'<path d="M5 7v6h6M5 13a8 8 0 1 0 2-7"/>',lock:'<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'};
const icon=name=>'<svg viewBox="0 0 26 26" aria-hidden="true">'+icons[name]+'</svg>';
$('home').innerHTML=icon('back');$('map').innerHTML=icon('map');$('restart').innerHTML=icon('reset');$('undo').innerHTML=icon('undo');$('empty').innerHTML=icon('empty');
function art(shape,color){
  const f=color||'#eee9d9',outline='#526f59',face='<ellipse cx="86" cy="104" rx="5" ry="7" fill="#35544b"/><ellipse cx="131" cy="104" rx="5" ry="7" fill="#35544b"/><path d="M101 121q9 10 18 0" fill="none" stroke="#35544b" stroke-width="4" stroke-linecap="round"/><ellipse cx="76" cy="119" rx="9" ry="5" fill="#f7b9ac"/><ellipse cx="143" cy="119" rx="9" ry="5" fill="#f7b9ac"/>';
  let body='';
  if(shape==='frog')body='<ellipse cx="109" cy="166" rx="74" ry="17" fill="#e3edda" stroke="none"/><ellipse cx="109" cy="120" rx="69" ry="53"/><circle cx="69" cy="75" r="24"/><circle cx="148" cy="75" r="24"/><ellipse cx="108" cy="139" rx="37" ry="24" fill="#ffffff33" stroke="none"/><path d="M50 145q-28 6-17 20h33M159 145q28 6 17 20h-33"/>'+face;
  if(shape==='orange')body='<path d="M110 56q-9-32 24-32 1 27-24 32" fill="#8eb66b"/><path d="M109 57V40"/><path d="M108 59C45 42 33 100 49 143c17 41 105 42 122 0 17-43 0-100-63-84Z"/>'+face;
  if(shape==='grapes')body='<path d="M110 45q-1-26 21-28M111 44q24-28 50-9-21 30-50 9" fill="#8eb66b"/><circle cx="79" cy="75" r="28"/><circle cx="134" cy="75" r="28"/><circle cx="58" cy="113" r="28"/><circle cx="110" cy="111" r="31"/><circle cx="161" cy="113" r="28"/><circle cx="84" cy="151" r="28"/><circle cx="135" cy="151" r="28"/><circle cx="110" cy="178" r="24"/>'+face;
  if(shape==='leaf')body='<path d="M57 155C12 73 90 43 175 34c3 88-35 150-118 121Z"/><path d="m44 181 98-105M80 144l-9-33M104 118l29 1" fill="none"/>'+face;
  if(shape==='fish')body='<path d="m161 102 40-32v75l-40-29Z"/><ellipse cx="101" cy="112" rx="68" ry="51"/><path d="M87 62q17-35 39-12l4 19M89 157q15 31 38 9"/><path d="M147 91q-16 20 0 40" fill="none"/>'+face;
  if(shape==='bunny')body='<ellipse cx="80" cy="53" rx="20" ry="47" transform="rotate(-13 80 53)"/><ellipse cx="134" cy="53" rx="20" ry="47" transform="rotate(12 134 53)"/><ellipse cx="108" cy="121" rx="65" ry="56"/><path d="M70 22v42M142 22v42" stroke="#ffffff66" stroke-width="10" stroke-linecap="round"/>'+face;
  if(shape==='cloud')body='<path d="M57 154c-48-1-47-66-6-69 2-45 56-61 77-20 41-20 68 13 59 39 41 28 11 63-18 54Z"/>'+face;
  if(shape==='flower')body='<path d="M108 131v68M109 182q-38 0-42-29 31-3 42 29M110 169q35-1 40-27-30-2-40 27" fill="#8eb66b"/><path d="M109 66C65 0 27 54 64 87 2 92 25 159 78 133c6 65 69 65 68-1 55 26 79-44 13-45 38-39-4-87-50-21Z"/><circle cx="108" cy="105" r="39" fill="#ffe8a6"/>'+face;
  return '<svg viewBox="0 0 220 220" role="img" aria-label="'+(C.current(state)?.name||'调色伙伴')+'"><g fill="'+f+'" stroke="'+outline+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'+body+'</g><path d="m29 44 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z" fill="#ffdc85"/><circle cx="189" cy="176" r="5" fill="#f9c8ba"/></svg>';
}
function save(){if(cover)return;saved.session=state;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,session:state}));}catch(_){}}
function home(){save();if(window.RugeNav&&typeof window.RugeNav.home==='function')window.RugeNav.home();else location.href='../index.html';}
function unlock(){let max=0;for(let i=0;i<10;i++)if(saved.stars[i])max=Math.max(max,Math.min(9,i+1));return max;}
function menu(){active=false;paused=false;$('pause').hidden=true;$('confirm').hidden=true;$('play').hidden=true;$('menu').hidden=false;$('map').hidden=true;$('levels').innerHTML='';
  const old=state;state=C.createState(0);document.querySelector('.mascot').innerHTML=art('frog',C.hex(C.mix(['yellow','blue'])));state=old;
  C.LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>unlock();b.setAttribute('aria-label','第 '+(i+1)+' 关 '+l.name+(b.disabled?' 未解锁':''));b.innerHTML='<span class="levelnum">'+(i+1)+'</span><span class="levelname">'+l.name+'<span class="levelstar">'+(saved.stars[i]?'★'.repeat(saved.stars[i]):'')+'</span></span>'+(b.disabled?'<span class="lock">'+icon('lock')+'</span>':'');b.onclick=()=>begin(i,false);$('levels').appendChild(b);});save();}
function begin(level,free){state=C.createState(level,free);open();save();}
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
  $('next').hidden=!isDone;$('next').textContent=state.free?'再画一个':state.order+1<C.LEVELS[state.level].targets.length?'下一个':state.level<9?'下一关':'完成';
  $('artStars').textContent=isDone?'★ '.repeat(state.free?3:C.stars(state)).trim():'';$('artStars').hidden=!isDone;$('message').textContent='';
}
$('home').onclick=home;$('pauseHome').onclick=home;$('map').onclick=menu;$('free').onclick=()=>begin(0,true);
$('undo').onclick=()=>{if(canPlay()&&C.undo(state)){fx('undo');render();save();}};$('empty').onclick=()=>{if(canPlay()&&state.drops.length&&C.reset(state)){fx('undo');render();save();}};
$('paint').onclick=()=>{if(!canPlay()||state.accepted||state.finished)return;if(C.paint(state)){fx(!state.free&&state.order+1===C.LEVELS[state.level].targets.length?'win':'success');if(!state.free&&state.order+1===C.LEVELS[state.level].targets.length)saved.stars[state.level]=Math.max(saved.stars[state.level],C.stars(state));render();$('art').classList.remove('happy');void $('art').offsetWidth;$('art').classList.add('happy');save();}else if(state.drops.length){fx('error');$('message').textContent='再调一调';$('stage').classList.remove('shake');void $('stage').offsetWidth;$('stage').classList.add('shake');save();}};
$('next').onclick=()=>{if(!canPlay()||!C.next(state))return;fx('tap');if(state.finished){const li=state.level;if(li<9)begin(li+1,false);else menu();}else{render();save();}};
$('restart').onclick=()=>{if(!canPlay())return;if(state.drops.length||state.painted.length)$('confirm').hidden=false;else{state=C.restart(state);render();save();}};
$('confirmRestart').onclick=()=>{if(cover||paused||!active)return;fx('undo');$('confirm').hidden=true;state=C.restart(state);render();save();};$('cancelRestart').onclick=()=>{$('confirm').hidden=true;};
function pause(){if(!active||cover)return;paused=true;$('confirm').hidden=true;$('pause').hidden=false;save();}
$('resume').onclick=()=>{paused=false;$('pause').hidden=true;render();};
window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',save);
window.__game={core:C,start:begin,menu,state:()=>state,progress:()=>saved.stars.slice(),pause,resume:()=>{$('resume').click();},storageKey:KEY};
if(cover){document.body.classList.add('cover');state=C.createState(0);state.drops=['yellow','blue'];state.accepted=true;open();}else if(state&&!state.finished){open();}else menu();
})();
