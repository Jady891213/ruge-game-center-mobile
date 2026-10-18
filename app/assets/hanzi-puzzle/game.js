(function(){
'use strict';
const H=window.HanziStrokes,DATA=window.HanziStrokeData,B=window.HanziBoard,COMPOSITES=window.HanziCompositeData;
const COVER=new URLSearchParams(location.search).get('cover')==='1';
let storage=null;try{storage=window.localStorage;}catch(e){}
const G=H.createGame({storage,cover:COVER}),$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
function fx(name){if(!COVER&&!paused)window.RugeFX?.emit(name);}
let backLevelMenu=false;
let hintIndices=[],hintTimer=0,feedbackTimer=0,repeatTimer=0,repeatAnswer=null,paused=false,lastNew='';
const preview={schema:1,current:30,found:H.LEVELS.map((l,i)=>i===30?['日','月','明']:[]),selected:[0,1,2,3],unlocked:30,done:false};
function state(){return COVER?preview:G.state();}
function icon(kind){return `<svg viewBox="0 0 24 24"><path d="${kind==='ok'?'m5 12 4 4L19 6':kind==='again'?'M5 9a8 8 0 1 1 0 7M5 3v6h6':'M12 5v8M12 18h.01'}"/></svg>`;}
function say(text,kind='ok'){
 clearTimeout(feedbackTimer);$('feedback').classList.toggle('warn',kind!=='ok');
 $('feedback').innerHTML=icon(kind);$('feedback').append(document.createTextNode(text));
 feedbackTimer=setTimeout(()=>{$('feedback').textContent='';},1700);
}
function clearHint(){clearTimeout(hintTimer);hintIndices=[];}
function clearRepeat(){clearTimeout(repeatTimer);repeatTimer=0;repeatAnswer?.classList.remove('repeated');repeatAnswer=null;}
function highlightRepeat(char){
 clearRepeat();repeatAnswer=Array.from($('answers').children).find(box=>box.dataset.char===char);
 if(!repeatAnswer)return;repeatAnswer.classList.add('repeated');repeatAnswer.scrollIntoView({block:'nearest',inline:'nearest'});
 repeatTimer=setTimeout(clearRepeat,1400);
}
function shakeBoard(){
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 $('boardWrap').animate?.([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:220});
}
function boardGeometry(){return B.forLevel(state().current,H,DATA,COMPOSITES);}
function renderBoard(){
 const s=state(),lv=H.LEVELS[s.current],geometry=boardGeometry(),boards=$('boards');
 boards.replaceChildren();boards.dataset.parts=String(lv.parts.length);boards.dataset.glyph=geometry.char;
 const svg=document.createElementNS(NS,'svg');svg.id='strokeBoard';svg.classList.add('stroke-board');svg.classList.toggle('has-selection',s.selected.length>0);
 svg.setAttribute('viewBox','0 0 1024 1024');svg.setAttribute('role','group');svg.setAttribute('aria-label',geometry.char+'：点选笔画');
 const guide=document.createElementNS(NS,'path');guide.classList.add('guide');guide.setAttribute('d','M512 0V1024M0 512H1024M0 0L1024 1024M1024 0L0 1024');svg.append(guide);
 const group=document.createElementNS(NS,'g');group.id='strokes';group.setAttribute('transform','translate(0,900) scale(1,-1)');svg.append(group);
 // Paint selected strokes last; hit testing continues to use original median indices.
 const order=geometry.strokes.map((_,i)=>i).sort((a,b)=>Number(s.selected.includes(a))-Number(s.selected.includes(b)));
 order.forEach(index=>{
  const d=geometry.strokes[index];
  const part=lv.parts.find(p=>index>=p.offset&&index<p.offset+p.count),path=document.createElementNS(NS,'path');
  path.setAttribute('d',d);path.dataset.stroke=String(index);path.setAttribute('role','button');path.setAttribute('tabindex',s.done?'-1':'0');
  path.setAttribute('aria-label',part.char+' 第 '+(index-part.offset+1)+' 笔');path.setAttribute('aria-pressed',String(s.selected.includes(index)));
  path.classList.toggle('selected',s.selected.includes(index));path.classList.toggle('hinted',hintIndices.includes(index));
  path.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();choose(index);}});group.append(path);
 });
 svg.addEventListener('pointerdown',e=>{
  if(COVER||paused)return;e.preventDefault();const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*1024,y=900-(e.clientY-r.top)/r.height*1024;
  const index=B.pick(geometry.medians,x,y,52);if(index>=0)choose(index);
 });
 svg.addEventListener('contextmenu',e=>e.preventDefault());boards.append(svg);
}
function renderAnswers(){
 clearRepeat();const s=state(),lv=H.LEVELS[s.current],found=s.found[s.current];
 document.body.classList.toggle('many-answers',lv.targets.length>10);
 $('answers').style.setProperty('--cols',Math.min(lv.targets.length,COVER?3:(lv.targets.length>8?5:4)));$('answers').replaceChildren();$('count').textContent=found.length+' / '+lv.targets.length;
 for(let i=0;i<lv.targets.length;i++){
  const box=document.createElement('div'),ch=found[i];box.className='answer '+(ch?'found':'empty');
  if(ch){box.dataset.char=ch;const target=lv.targets.find(t=>t.char===ch);const py=document.createElement('span'),char=document.createElement('span');py.className='py';py.textContent=target.pinyin;char.className='char';char.textContent=ch;box.append(py,char);box.setAttribute('aria-label',ch+' '+target.pinyin);if(ch===lastNew)box.classList.add('new');}
  else box.setAttribute('aria-label','还没有找到的汉字');
  $('answers').append(box);
 }
 if(lastNew){const newest=Array.from($('answers').children).find(b=>b.classList.contains('new'));newest?.scrollIntoView({block:'nearest',inline:'nearest'});}
 lastNew='';
}
function render(){
 const s=state();$('levelNum').textContent=s.current+1;renderAnswers();renderBoard();
 $('clear').disabled=s.done;$('submit').disabled=s.selected.length===0||paused;
 $('hint').disabled=s.done;$('submit').hidden=s.done;$('next').hidden=!s.done;
 $('next').firstChild.textContent=s.current===H.LEVELS.length-1?'再找一次 ':'下一关 ';
}
function choose(i){if(COVER||paused||$('levelDialog').open||$('resetDialog').open)return;clearHint();clearRepeat();if(G.toggle(i)){fx(G.state().selected.includes(i)?'select':'deselect');renderBoard();$('submit').disabled=G.state().selected.length===0;}}
$('clear').onclick=()=>{if(COVER||paused)return;clearHint();if(G.state().selected.length)fx('undo');G.clear();$('feedback').textContent='';render();};
$('submit').onclick=()=>{
 if(COVER||paused)return;clearHint();const result=G.submit();
 if(result.status==='success'){lastNew=result.char;fx(result.complete?'win':'success');render();say(result.complete?'找齐啦！':result.char+' '+result.pinyin);}
 else if(result.status==='repeat'){fx('error');render();highlightRepeat(result.char);say('已经找过啦','again');shakeBoard();}
 else if(result.status==='invalid'){fx('error');say('换几笔试试','warn');shakeBoard();}
};
$('hint').onclick=()=>{if(COVER||paused)return;clearHint();hintIndices=G.hint();if(hintIndices.length)fx('hint');renderBoard();hintTimer=setTimeout(()=>{hintIndices=[];renderBoard();},2200);};
function showReset(){if(COVER||paused)return;$('resetDialog').showModal();}
$('reset').onclick=showReset;$('cancelReset').onclick=()=>$('resetDialog').close();
$('confirmReset').onclick=()=>{if(COVER||paused)return;fx('undo');clearHint();G.reset();$('feedback').textContent='';$('resetDialog').close();render();};
$('next').onclick=()=>{if(COVER||paused)return;if(G.state().current===H.LEVELS.length-1){showReset();return;}if(G.next())fx('tap');clearHint();$('feedback').textContent='';render();};
function renderLevels(){
 const s=state();$('levelGrid').replaceChildren();
 H.LEVELS.forEach((lv,li)=>{
  const b=document.createElement('button');b.className='level';b.classList.toggle('word',lv.parts.length>1);b.classList.toggle('current',li===s.current);b.classList.toggle('done',s.found[li].length===lv.targets.length);
  const n=document.createElement('span');n.className='number';n.textContent=li+1;b.append(n);
  if(li<=s.unlocked){const ch=document.createElement('span');ch.className='source';ch.textContent=lv.source;b.append(ch);b.setAttribute('aria-label','第 '+(li+1)+' 关 '+lv.source);}
  else{b.disabled=true;b.innerHTML+='<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z"/></svg>';b.setAttribute('aria-label','第 '+(li+1)+' 关，未解锁');}
  b.onclick=()=>{if(COVER||paused&&!backLevelMenu)return;paused=false;$('pausePanel').hidden=true;backLevelMenu=false;if(G.loadLevel(li)){fx('tap');clearHint();$('feedback').textContent='';$('levelDialog').close();render();}};
  $('levelGrid').append(b);
 });
}
$('levelBtn').onclick=()=>{if(COVER||paused)return;window.RugeBack?.clearPause();backLevelMenu=false;renderLevels();$('levelDialog').showModal();$('levelGrid').querySelector('.current')?.scrollIntoView({block:'nearest'});};$('closeLevels').onclick=()=>{backLevelMenu=false;$('levelDialog').close();};
function home(){if(COVER)return;try{if(window.RugeNav){window.RugeNav.home();return;}}catch(e){}location.href='../index.html';}
$('home').onclick=()=>window.RugeBack.handle();$('pauseHome').onclick=home;
function pause(){if(COVER||paused)return;paused=true;clearHint();clearRepeat();$('levelDialog').close();$('resetDialog').close();$('pausePanel').hidden=false;renderBoard();}
function resume(){paused=false;$('pausePanel').hidden=true;render();}
$('resume').onclick=resume;window.addEventListener('ruge:pause',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('ruge:resume',()=>{/* Resume only after an explicit tap. */});
if(COVER)document.body.classList.add('cover-mode');
render();
window.__game={...H,DATA,COVER,board:B,geometry:boardGeometry,state:()=>({...state(),paused}),toggle:choose,setSelection:indices=>{if(COVER||paused)return false;clearHint();const result=G.setSelection(indices);render();return result;},submit:()=>{$('submit').click();},clear:()=>{$('clear').click();},reset:()=>{$('reset').click();},loadLevel:li=>{if(COVER)return false;const result=G.loadLevel(li);clearHint();render();return result;},pause,resume,engine:G};
window.onRugeBack=()=>{if(!$('pausePanel').hidden)return window.RugeBack.closePause(()=>{$('pausePanel').hidden=true;},resume);if($('resetDialog').open){$('resetDialog').close();return true;}if($('levelDialog').open){if(backLevelMenu)return false;$('levelDialog').close();return true;}clearHint();clearRepeat();renderLevels();$('levelDialog').showModal();backLevelMenu=true;return true;};
})();
