(function(root){
  'use strict';
  const COLORS=Object.freeze({red:{name:'红',hex:'#ff545f'},yellow:{name:'黄',hex:'#ffe033'},blue:{name:'蓝',hex:'#3266e6'},white:{name:'白',hex:'#fffdf5'}});
  const IDS=Object.keys(COLORS), MAX_DROPS=8;
  /* Paint-inspired RYB, not additive light / RGB averaging.
   * Basis: Gossett & Chen, Paint Inspired Color Compositing (2004),
   * author's manuscript: https://cfcs.pku.edu.cn/baoquan/docs/20180621150627775765.pdf
   * We independently implement a smoothed trilinear RYB cube with ORIGINAL,
   * child-friendly corner colors and a white-tint heuristic. This is an
   * educational approximation, not measured pigments, spectral simulation,
   * or a scientifically precise prediction of real paint brands.
   */
  const CORNERS=[[1,1,.96],[1,.13,.18],[1,.88,.06],[1,.47,.04],[.12,.33,.9],[.55,.22,.72],[.16,.65,.25],[.40,.28,.17]];
  const smooth=x=>x*x*(3-2*x);
  function validDrops(d){return Array.isArray(d)&&d.length<=MAX_DROPS&&d.every(x=>IDS.includes(x));}
  function mix(drops){
    if(!validDrops(drops))throw new Error('Invalid paint drops');
    if(!drops.length)return null;
    const n={red:0,yellow:0,blue:0,white:0};drops.forEach(c=>n[c]++);
    const m=Math.max(n.red,n.yellow,n.blue),col=n.red+n.yellow+n.blue;
    if(!m)return [255,253,245];
    const p=[smooth(n.red/m),smooth(n.yellow/m),smooth(n.blue/m)];
    const rgb=[0,0,0];
    for(let i=0;i<8;i++){
      let w=1;for(let k=0;k<3;k++)w*=i&(1<<k)?p[k]:1-p[k];
      for(let k=0;k<3;k++)rgb[k]+=CORNERS[i][k]*w;
    }
    const white=Math.pow(n.white/(col+n.white),.72);
    return rgb.map((v,i)=>Math.round((v*(1-white)+[1,.995,.975][i]*white)*255));
  }
  const hex=rgb=>rgb?'#'+rgb.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join(''):'#fffdf5';
  function distance(a,b){if(!a||!b)return Infinity;return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0));}
  // Perceptual a/b color map; lightness is shown separately so adding white stays visible.
  function mapPoint(rgb){
    if(!rgb||rgb.length!==3||rgb.some(v=>!Number.isFinite(v)||v<0||v>255))return null;
    const [r,g,b]=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return {x:100+(1.9779984951*l-2.428592205*m+.4505937099*s)*290,y:92-(.0259040371*l+.7827717662*m-.808675766*s)*290,light:.2104542553*l+.793617785*m-.0040720468*s};
  }
  // Standard continuous HSV disk is a DISPLAY of the resulting RGB only.
  // Mixing and the acceptance threshold still use the RYB model above.
  // Hue starts at top and runs clockwise. Saturation is radius; V uses a rail.
  function wheelPoint(rgb){
    if(!mapPoint(rgb))return null;
    const [r,g,b]=rgb.map(v=>v/255),v=Math.max(r,g,b),min=Math.min(r,g,b),d=v-min;
    let hue=0;if(d){hue=v===r?(g-b)/d+(g<b?6:0):v===g?(b-r)/d+2:(r-g)/d+4;hue*=60;}
    const saturation=v?d/v:0,angle=hue*Math.PI/180;
    return {x:128+Math.sin(angle)*110*saturation,y:128-Math.cos(angle)*110*saturation,hue,saturation,value:v};
  }
  const gamutCache=new Map();
  function gamut(palette=IDS){
    const ids=IDS.filter(c=>palette.includes(c)),key=ids.join(',');if(gamutCache.has(key))return gamutCache.get(key);
    const points=[],seen=new Set();
    function visit(i,drops){if(i===ids.length){if(drops.length){const rgb=mix(drops),key=rgb.join(',');if(!seen.has(key)){seen.add(key);points.push({rgb,point:mapPoint(rgb)});}}return;}for(let n=0;n+drops.length<=MAX_DROPS;n++)visit(i+1,[...drops,...Array(n).fill(ids[i])]);}
    visit(0,[]);gamutCache.set(key,points);return points;
  }
  function guidance(drops,targetColor){const rgb=mix(drops),d=distance(rgb,targetColor);return {current:mapPoint(rgb),target:mapPoint(targetColor),distance:d,score:!rgb?0:d<=17?Math.round(90+10*(1-d/17)):Math.max(0,Math.min(89,Math.round(90*(1-(d-17)/300)))),pass:!!rgb&&d<=17};}
  const R='red',Y='yellow',B='blue',W='white';
  const target=(name,shape,recipe)=>({name,shape,recipe,color:mix(recipe)});
  const LEVELS=[
    {name:'小青蛙',palette:[Y,B],targets:[target('小青蛙','frog',[Y,B])]},
    {name:'小橘子',palette:[R,Y],targets:[target('小橘子','orange',[R,Y])]},
    {name:'紫葡萄',palette:[R,B],targets:[target('紫葡萄','grapes',[R,B])]},
    {name:'小树叶',palette:[Y,B],targets:[target('小树叶','leaf',[Y,Y,B])]},
    {name:'小鱼儿',palette:[Y,B],targets:[target('小鱼儿','fish',[Y,B,B])]},
    {name:'粉兔兔',palette:[R,W],targets:[target('粉兔兔','bunny',[R,W,W])]},
    {name:'晴天云',palette:[B,W],targets:[target('晴天云','cloud',[B,W,W,W])]},
    {name:'花园派对',palette:IDS,targets:[target('小树叶','leaf',[Y,B]),target('小花花','flower',[R,Y,W,W])]},
    {name:'水果派对',palette:IDS,targets:[target('小橘子','orange',[R,Y,Y]),target('紫葡萄','grapes',[R,B,W])]},
    {name:'彩虹派对',palette:IDS,targets:[target('小鱼儿','fish',[Y,B,B]),target('粉兔兔','bunny',[R,W,W]),target('小花花','flower',[R,B,W,W])]}
  ];
  const canPaint=(drops,targetColor)=>!!drops.length&&distance(mix(drops),targetColor)<=17;
  function createState(level=0,free=false){
    const li=Number.isInteger(level)&&level>=0&&level<LEVELS.length?level:0;
    return {level:li,free:!!free,order:0,drops:[],painted:[],mistakes:0,accepted:false,finished:false};
  }
  function add(state,color){if(!IDS.includes(color)||state.accepted||state.finished||state.drops.length>=MAX_DROPS)return false;const palette=state.free?IDS:LEVELS[state.level].palette;if(!palette.includes(color))return false;state.drops.push(color);return true;}
  function undo(state){if(state.accepted||state.finished)return false;return !!state.drops.pop();}
  function reset(state){if(state.accepted||state.finished)return false;state.drops=[];return true;}
  function restart(state){return createState(state.level,state.free);}
  function current(state){return state.free?{name:'自由画室',shape:'bunny',color:mix(state.drops)}:LEVELS[state.level].targets[state.order];}
  function paint(state){
    if(state.accepted||state.finished||!state.drops.length)return false;
    if(!state.free&&!canPaint(state.drops,current(state).color)){state.mistakes++;return false;}
    state.painted.push({color:mix(state.drops),drops:state.drops.slice()});state.accepted=true;return true;
  }
  function next(state){if(!state.accepted)return false;if(!state.free&&state.order+1>=LEVELS[state.level].targets.length){state.finished=true;return true;}state.order++;state.drops=[];state.accepted=false;return true;}
  const stars=state=>Math.max(1,3-Math.floor(state.mistakes/2));
  function restore(raw){
    if(!raw||raw.schema!==1)return {stars:Array(10).fill(0),session:null};
    const savedStars=Array.from({length:10},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0);
    const s=raw.session;
    if(!s||!Number.isInteger(s.level)||s.level<0||s.level>=10||typeof s.free!=='boolean'||!Number.isInteger(s.order)||s.order<0||(!s.free&&s.order>=LEVELS[s.level].targets.length)||s.order>1000||!validDrops(s.drops)||!Number.isInteger(s.mistakes)||s.mistakes<0||s.mistakes>100000||typeof s.accepted!=='boolean'||typeof s.finished!=='boolean'||!Array.isArray(s.painted)||s.painted.length>1001)return {stars:savedStars,session:null};
    const palette=s.free?IDS:LEVELS[s.level].palette;
    if(!s.drops.every(c=>palette.includes(c)))return {stars:savedStars,session:null};
    if(s.painted.length!==s.order+(s.accepted?1:0)||s.finished&&(!s.accepted||s.free||s.order!==LEVELS[s.level].targets.length-1))return {stars:savedStars,session:null};
    const painted=[];
    for(let i=0;i<s.painted.length;i++){const p=s.painted[i];if(!p||!validDrops(p.drops)||!p.drops.length||!p.drops.every(c=>palette.includes(c))||!s.free&&!canPaint(p.drops,LEVELS[s.level].targets[i].color))return {stars:savedStars,session:null};painted.push({drops:p.drops.slice(),color:mix(p.drops)});}
    if(s.accepted&&(!s.drops.length||!s.free&&!canPaint(s.drops,LEVELS[s.level].targets[s.order].color)))return {stars:savedStars,session:null};
    return {stars:savedStars,session:{level:s.level,free:s.free,order:s.order,drops:s.drops.slice(),painted,mistakes:s.mistakes,accepted:s.accepted,finished:s.finished}};
  }
  const api={COLORS,IDS,MAX_DROPS,LEVELS,mix,hex,distance,mapPoint,wheelPoint,gamut,guidance,canPaint,createState,add,undo,reset,restart,current,paint,next,stars,restore};
  if(typeof module==='object'&&module.exports)module.exports=api;root.PaintMixing=api;
})(typeof window!=='undefined'?window:globalThis);
