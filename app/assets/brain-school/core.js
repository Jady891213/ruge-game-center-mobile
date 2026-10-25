/* Shared seeded questions and scoring. All resources are packaged offline. */
(function(root){
'use strict';
const games=new Map();
function rng(seed){let state=(Number(seed)>>>0)||0x129ab317;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};next.state=()=>state>>>0;return next;}
function rand(r,min,max){return min+Math.floor(r()*(max-min+1));}
function shuffle(r,items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=rand(r,0,i);[a[i],a[j]]=[a[j],a[i]];}return a;}
function sameSet(a,b){return Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&a.length===b.length&&a.every(x=>b.includes(x));}
function el(tag,cls,text){const e=root.document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
const labels=['小猫','小狗','小鸟','小鱼','小兔','青蛙','苹果','香蕉','小汽车','帆船','花朵','星星'];
const spriteRects=[[20,28,340,354],[392,24,312,360],[745,70,345,303],[1105,94,331,276],[52,393,260,353],[399,443,304,304],[773,421,300,324],[1098,410,333,330],[12,808,360,258],[396,752,310,321],[784,750,276,324],[1112,760,308,298]];
function symbol(id,size=64){const e=el('span','symbol');e.style.width=size+'px';e.style.height=size+'px';const [x,y,w,h]=spriteRects[id]||spriteRects[11],extent=Math.max(w,h),art=el('span','symbol-art');art.style.width=w/extent*100+'%';art.style.height=h/extent*100+'%';art.style.backgroundSize=1448/w*100+'% '+1086/h*100+'%';art.style.backgroundPosition=x/(1448-w)*100+'% '+y/(1086-h)*100+'%';e.appendChild(art);e.setAttribute('role','img');e.setAttribute('aria-label',labels[id]||'图案');e.dataset.symbol=String(id);return e;}
function svg(markup,viewBox='0 0 320 260'){const e=root.document.createElementNS('http://www.w3.org/2000/svg','svg');e.setAttribute('viewBox',viewBox);e.innerHTML=markup;return e;}
function choices(stage,items,handler,columns=3){const grid=el('div','choices');grid.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;const buttons=items.map(item=>{const b=el('button','tile',item.label);b.type='button';if(item.symbol!==undefined)b.appendChild(symbol(item.symbol,64));b.setAttribute('aria-label',String(item.label??labels[item.symbol]??item.value));b.addEventListener('click',()=>handler(item.value,b));grid.appendChild(b);return b;});stage.appendChild(grid);return buttons;}
function register(def){if(!def||games.has(def.id)||!['create','check','solution','mount'].every(k=>typeof def[k]==='function'))throw Error('Invalid brain game registration');games.set(def.id,def);}
function session(id,seed,startLevel=1){
 const game=games.get(id);if(!game)throw Error('Unknown brain game');
 const random=rng(seed),s={id,seed:Number(seed)>>>0,score:0,correct:0,mistakes:0,combo:0,level:Math.min(10,Math.max(1,startLevel)),remaining:60000,elapsed:0,questionTime:0,round:0,ended:false};let q,answered=false;
 const next=()=>{if(s.ended)return null;s.level=Math.min(10,Math.max(1,startLevel)+Math.floor(s.correct/3));s.round++;s.questionTime=0;answered=false;q=game.create(s.level,random);return q;};next();
 function tick(dt){if(s.ended)return;const value=Number(dt),ms=Number.isFinite(value)?Math.max(0,value):0;s.elapsed+=ms;s.questionTime+=ms;s.remaining=Math.max(0,s.remaining-ms);if(!s.remaining)s.ended=true;}
 function mistake(){if(s.ended||answered)return false;s.mistakes++;s.combo=0;s.score=Math.max(0,s.score-(25+s.level*5));s.remaining=Math.max(0,s.remaining-1500);if(!s.remaining)s.ended=true;return false;}
 function answer(value){if(s.ended||answered)return {ok:false,ignored:true};if(!game.check(q,value)){mistake();return {ok:false};}answered=true;s.correct++;s.combo++;const points=100+s.level*25+Math.min(5,s.combo)*10;s.score+=points;return {ok:true,points};}
 return {state:s,question:()=>q,next,tick,mistake,answer,answered:()=>answered};
}
root.BrainSchool={register,games,rng,rand,pick:(r,a)=>a[rand(r,0,a.length-1)],shuffle,sample:(r,a,n)=>shuffle(r,a).slice(0,n),sameSet,el,symbol,svg,choices,prompt:(stage,text)=>{const e=el('h2','prompt',text);stage.appendChild(e);return e;},session,labels};
})(typeof window!=='undefined'?window:globalThis);
