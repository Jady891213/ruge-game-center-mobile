(function(){
'use strict';
const C=window.BearSnackShop,$=id=>document.getElementById(id),cover=/[?&]cover=1(?:&|$)/.test(location.search),KEY='rugeBearSnackShopV1';
let saved={stars:Array(12).fill(0),session:null};if(!cover){try{saved=C.restore(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){}}
let state=saved.session,active=false,paused=false;
const icons={back:'<path d="m15 5-8 7 8 7M7 12h15"/>',map:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="15" y="4" width="6" height="6" rx="1"/><rect x="4" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',undo:'<path d="m10 6-6 6 6 6M4 12h11a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',reset:'<path d="M5 7v6h6M5 13a8 8 0 1 0 2-7"/>',pause:'<path d="M9 5v16M18 5v16"/>',lock:'<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'};
const icon=name=>'<svg viewBox="0 0 26 26" aria-hidden="true">'+icons[name]+'</svg>';
const snack=id=>'<span class="snack" role="img" aria-label="'+C.SNACKS[id].name+'" style="background-position:'+C.SNACKS[id].x+'% '+C.SNACKS[id].y+'%"></span>';
$('home').innerHTML=icon('back');$('map').innerHTML=icon('map');$('undo').innerHTML=icon('undo');$('restart').innerHTML=icon('reset');$('pauseButton').innerHTML=icon('pause');
function save(){if(cover)return;saved.session=state;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,session:state}));}catch(_){}}
function home(){save();if(window.RugeNav&&typeof window.RugeNav.home==='function')window.RugeNav.home();else location.href='../index.html';}
function unlock(){let max=0;for(let i=0;i<12;i++)if(saved.stars[i])max=Math.max(max,Math.min(11,i+1));return max;}
function menu(){active=false;paused=false;$('pause').hidden=true;$('confirm').hidden=true;$('play').hidden=true;$('menu').hidden=false;$('map').hidden=true;$('continue').hidden=!state||state.finished;$('levels').innerHTML='';C.LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>unlock();b.setAttribute('aria-label','第 '+(i+1)+' 关'+(b.disabled?' 未解锁':''));b.innerHTML=(b.disabled?'<span class="lock">'+icon('lock')+'</span>':'<span>'+(i+1)+'</span>')+'<span class="levelStars">'+(saved.stars[i]?'★'.repeat(saved.stars[i]):'')+'</span>';b.onclick=()=>{if(!b.disabled){if(state&&!state.finished&&state.level===i){open();save();}else begin(i);}};$('levels').appendChild(b);});save();}
function begin(level){state=C.createState(level);open();save();}
function open(){active=true;paused=false;$('menu').hidden=true;$('play').hidden=false;$('map').hidden=false;$('pause').hidden=true;$('confirm').hidden=true;render();}
function render(){
const l=C.LEVELS[state.level],o=C.current(state),ordered=l.mode==='sequence';$('levelName').textContent='第 '+(state.level+1)+' 关';$('orders').innerHTML=l.orders.map((_,i)=>'<i class="'+(i<state.order||i===state.order&&state.accepted?'done':i===state.order?'current':'')+'"></i>').join('');
$('customer').style.backgroundPosition=({bear:0,bunny:50,cat:100}[o.customer])+'% 0';$('customer').setAttribute('aria-label',{bear:'小熊',bunny:'小兔',cat:'小猫'}[o.customer]);$('rule').textContent=ordered?'照顺序 →':'';
let targets=ordered?o.items.map((id,i)=>({id,n:i+1})):Array.from(new Set(o.items)).map(id=>({id,n:o.items.filter(x=>x===id).length}));
$('target').innerHTML=targets.map(({id,n})=>'<div class="targetItem">'+(ordered?'<span class="seq">'+n+'</span>':'')+snack(id)+(ordered?'':'<b class="qty">×'+n+'</b>')+'</div>').join('');
$('plate').innerHTML=o.items.map((_,i)=>'<div class="plateSlot '+(state.plate[i]?'filled':'')+'">'+(ordered?'<span class="seq">'+(i+1)+'</span>':'')+(state.plate[i]?snack(state.plate[i]):'<span class="slotDot"></span>')+'</div>').join('');
$('palette').innerHTML='';$('palette').style.setProperty('--choices',l.palette.length);l.palette.forEach(id=>{const b=document.createElement('button');b.dataset.snack=id;b.setAttribute('aria-label','加一个'+C.SNACKS[id].name);b.innerHTML=snack(id)+'<span class="addMark" aria-hidden="true">+</span>';b.disabled=paused||state.accepted||state.plate.length>=o.items.length;b.onclick=()=>{if(!canAct())return;if(C.add(state,id)){render();save();}};$('palette').appendChild(b);});
$('undo').disabled=paused||state.accepted||!state.plate.length;$('serve').hidden=state.accepted;$('serve').disabled=paused||!state.plate.length;$('next').hidden=!state.accepted;$('next').disabled=paused;$('next').textContent=state.order+1<l.orders.length?'下一位':state.level<11?'下一关':'完成';$('message').textContent=state.accepted?'好吃！':'';$('message').className=state.accepted?'success':'';
}
function canAct(){return active&&!paused&&$('confirm').hidden;}
$('home').onclick=home;$('pauseHome').onclick=home;$('map').onclick=menu;$('continue').onclick=()=>{if(state&&!state.finished){open();save();}};
$('undo').onclick=()=>{if(canAct()&&C.undo(state)){render();save();}};
$('serve').onclick=()=>{if(!canAct())return;if(C.submit(state)){if(C.complete(state))saved.stars[state.level]=3;render();$('customer').classList.remove('happy');void $('customer').offsetWidth;$('customer').classList.add('happy');save();}else if(state.plate.length){$('message').textContent='再看看';$('plate').classList.remove('shake');void $('plate').offsetWidth;$('plate').classList.add('shake');save();}};
$('next').onclick=()=>{if(!canAct()||!C.next(state))return;if(state.finished){if(state.level<11)begin(state.level+1);else menu();}else{render();save();}};
$('restart').onclick=()=>{if(!canAct())return;if(state.plate.length||state.served.length)$('confirm').hidden=false;else{state=C.restart(state);render();save();}};
$('confirmRestart').onclick=()=>{if(paused)return;$('confirm').hidden=true;state=C.restart(state);render();save();};$('cancelRestart').onclick=()=>{$('confirm').hidden=true;};
function pause(){if(!active||cover)return;paused=true;$('confirm').hidden=true;$('pause').hidden=false;save();}
function resume(){paused=false;$('pause').hidden=true;if(active)render();}
$('pauseButton').onclick=pause;$('resume').onclick=resume;window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',save);
window.__game={core:C,start:begin,menu,state:()=>state,progress:()=>saved.stars.slice(),pause,resume,storageKey:KEY,isPaused:()=>paused};
if(cover){document.body.classList.add('cover');state=C.createState(5);state.plate=['donut','donut'];open();}else if(state&&!state.finished){open();}else menu();
})();
