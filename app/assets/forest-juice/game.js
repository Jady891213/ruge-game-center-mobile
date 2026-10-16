(function(){
'use strict';
const C=window.ForestJuice,$=id=>document.getElementById(id),cover=/[?&]cover=1(?:&|$)/.test(location.search),KEY='rugeForestJuiceV1';
let saved={stars:Array(12).fill(0),session:null};
if(!cover){try{saved=C.restore(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){}}
let state=saved.session,active=false,paused=false,busy=false,selected=-1,timer=0;
const fx=name=>{if(!cover&&!paused)window.RugeFX?.emit(name);};
const icons={back:'<path d="m15 5-8 7 8 7M7 12h15"/>',map:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="15" y="3" width="7" height="7" rx="2"/><rect x="3" y="15" width="7" height="7" rx="2"/><rect x="15" y="15" width="7" height="7" rx="2"/>',reset:'<path d="M5 7v6h6M5 13a8 8 0 1 0 2-7"/>',undo:'<path d="m10 5-7 7 7 7M4 12h10q8 0 8 9"/>',pause:'<path d="M8 5v16M18 5v16"/>',lock:'<rect x="6" y="10" width="12" height="12" rx="3"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'};
const icon=(name,cls='')=>'<svg class="'+cls+'" viewBox="0 0 26 26" aria-hidden="true">'+icons[name]+'</svg>';
$('home').innerHTML=icon('back');$('map').innerHTML=icon('map');$('restart').innerHTML=icon('reset');$('undo').innerHTML=icon('undo')+'<span>撤回</span>';$('pauseButton').innerHTML=icon('pause');
function save(){if(cover)return;saved.session=state;try{localStorage.setItem(KEY,JSON.stringify({schema:1,stars:saved.stars,session:state}));}catch(_){}}
function cancelAnimation(){clearTimeout(timer);timer=0;busy=false;}
function home(){cancelAnimation();save();if(window.RugeNav&&typeof window.RugeNav.home==='function')window.RugeNav.home();else location.href='../index.html';}
function unlocked(){let max=0;saved.stars.forEach((n,i)=>{if(n)max=Math.max(max,Math.min(11,i+1));});return max;}
function canAct(){return active&&!paused&&!busy&&$('confirm').hidden&&$('win').hidden;}
function menu(){
  cancelAnimation();active=false;paused=false;selected=-1;$('pause').hidden=true;$('confirm').hidden=true;$('win').hidden=true;$('play').hidden=true;$('menu').hidden=false;$('map').hidden=true;$('levels').innerHTML='';
  C.LEVELS.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>unlocked();b.setAttribute('aria-label','第 '+(i+1)+' 关'+(b.disabled?'，未解锁':''));b.innerHTML=b.disabled?icon('lock','lockIcon'):'<span>'+(i+1)+'</span><span class="levelStars">'+(saved.stars[i]?'★'.repeat(saved.stars[i]):'')+'</span>';b.onclick=()=>{if(i<=unlocked())begin(i);};$('levels').appendChild(b);});
  $('continue').hidden=!state;$('continue').onclick=()=>{if(state)open();};save();
}
function begin(level){if(!Number.isInteger(level)||level<0||level>=12)return false;cancelAnimation();state=C.createState(level);selected=-1;open();save();return true;}
function open(){cancelAnimation();active=true;paused=false;selected=-1;$('menu').hidden=true;$('play').hidden=false;$('map').hidden=false;$('pause').hidden=true;$('confirm').hidden=true;$('win').hidden=true;render();}
function render(){
  if(!state)return;
  const spec=C.LEVELS[state.level];
  $('levelName').textContent='第 '+(state.level+1)+' 关';$('steps').textContent=state.moves?String(state.moves):'';$('steps').setAttribute('aria-label','已倒入 '+state.moves+' 次');
  $('board').style.setProperty('--columns',state.tubes.length>4?3:2);$('board').style.setProperty('--capacity',spec.capacity);$('board').innerHTML='';
  state.tubes.forEach((t,i)=>{
    const b=document.createElement('button'),complete=t.length===spec.capacity&&t.every(c=>c===t[0]),legal=selected>=0&&C.pourCount(state.tubes,spec.capacity,selected,i)>0;
    b.className='bottle'+(selected===i?' selected':'')+(legal?' legal':'')+(complete?' complete':'');b.dataset.tube=String(i);b.disabled=paused||busy||state.finished;
    b.setAttribute('aria-pressed',selected===i?'true':'false');b.setAttribute('aria-label','瓶 '+(i+1)+'，'+(t.length?t.map(c=>C.COLORS[c].name).join('、'):'空瓶')+(selected===i?'，已选中':legal?'，可倒入':''));
    b.innerHTML='<div class="glass"><div class="layers">'+t.map(c=>'<div class="layer" style="--color:'+C.COLORS[c].hex+';--light:'+C.COLORS[c].light+'"></div>').join('')+'</div></div><span class="bottleCheck" aria-hidden="true">✓</span>';
    b.onclick=()=>tap(i);$('board').appendChild(b);
  });
  $('undo').disabled=paused||busy||!state.history.length||state.finished;$('restart').disabled=paused||busy;$('pauseButton').disabled=paused||busy;
  document.querySelectorAll('.customer').forEach(el=>{el.style.backgroundPosition=(state.level%3)*50+'% 0';});
  $('next').textContent=state.level===11?'完成':'下一关';$('win').hidden=cover||paused||busy||!state.finished;
}
function tap(i){
  if(!canAct()||state.finished||!Number.isInteger(i)||i<0||i>=state.tubes.length)return false;
  if(selected<0){if(!state.tubes[i].length){fx('error');return false;}selected=i;render();fx('select');return true;}
  if(selected===i){selected=-1;render();fx('deselect');return true;}
  const from=selected,count=C.pour(state,from,i);
  if(!count){selected=state.tubes[i].length?i:from;render();const target=$('board').children[i];target.classList.add('invalid');$('status').textContent='';fx('error');return false;}
  const completed=state.tubes[i].length===C.LEVELS[state.level].capacity&&state.tubes[i].every(c=>c===state.tubes[i][0]);
  fx('pour');selected=-1;busy=true;if(state.finished)saved.stars[state.level]=3;save();render();
  $('board').children[from].classList.add('pourFrom');$('board').children[i].classList.add('pourTo');
  const source=$('board').children[from].getBoundingClientRect(),target=$('board').children[i].getBoundingClientRect(),board=$('board').getBoundingClientRect();
  const x1=source.left+source.width/2-board.left,y1=source.top+15-board.top,x2=target.left+target.width/2-board.left,y2=target.top+19-board.top;
  const stream=document.createElementNS('http://www.w3.org/2000/svg','svg');stream.setAttribute('class','pourStream');stream.setAttribute('viewBox','0 0 '+board.width+' '+board.height);stream.setAttribute('aria-hidden','true');
  const color=state.tubes[i][state.tubes[i].length-1];stream.innerHTML='<path d="M '+x1+' '+y1+' Q '+((x1+x2)/2)+' '+(Math.min(y1,y2)-35)+' '+x2+' '+y2+'" stroke="'+C.COLORS[color].hex+'"/>';$('board').appendChild(stream);
  timer=setTimeout(()=>{timer=0;busy=false;render();if(state.finished)fx('win');else if(completed){$('board').children[i].classList.add('justComplete');fx('success');}},500);return true;
}
function pause(){if(!active||cover)return;cancelAnimation();paused=true;selected=-1;$('confirm').hidden=true;$('win').hidden=true;$('pause').hidden=false;render();save();}
function resume(){if(!active)return;paused=false;$('pause').hidden=true;render();}
$('home').onclick=home;$('pauseHome').onclick=home;$('map').onclick=menu;$('winMap').onclick=menu;$('pauseButton').onclick=()=>{if(canAct())pause();};$('resume').onclick=resume;
$('undo').onclick=()=>{if(canAct()&&!state.finished&&C.undo(state)){selected=-1;render();save();fx('undo');}};
$('restart').onclick=()=>{if(!canAct())return;if(state.history.length){$('confirm').hidden=false;}else begin(state.level);};
$('confirmRestart').onclick=()=>{if(!active||paused||$('confirm').hidden)return;begin(state.level);};$('cancelRestart').onclick=()=>{$('confirm').hidden=true;};
$('next').onclick=()=>{if(!active||paused||busy||!state.finished)return;if(state.level<11)begin(state.level+1);else menu();};
window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',()=>{cancelAnimation();save();});
window.__game={core:C,start:begin,menu,tap,state:()=>state,progress:()=>saved.stars.slice(),selected:()=>selected,busy:()=>busy,pause,resume,storageKey:KEY};
if(cover){document.body.classList.add('cover');$('sceneArt').src='../shared/forest-juice-scene.png';state=C.createState(8);open();}else if(state){open();}else menu();
})();
