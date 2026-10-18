(function(root){
'use strict';
const COLORS={red:{name:'红色',hex:'#e44d53',rgb:[226,62,70]},yellow:{name:'黄色',hex:'#f7ca42',rgb:[245,202,48]},green:{name:'绿色',hex:'#56b86b',rgb:[65,177,86]},blue:{name:'蓝色',hex:'#559cdd',rgb:[56,134,221]},orange:{name:'橙色',hex:'#ef9343',rgb:[240,136,45]},purple:{name:'紫色',hex:'#a779cc',rgb:[151,88,195]}};
const color=c=>({kind:'color',color:c}),warm={kind:'warm'},cool={kind:'cool'},different={kind:'different'},lighter={kind:'lighter'},darker={kind:'darker'},light={kind:'light'},dark={kind:'dark'};
const LEVELS=[
 {title:'红色线索',steps:[color('red')]},
 {title:'蓝色线索',steps:[color('blue')]},
 {title:'黄色线索',steps:[color('yellow')]},
 {title:'绿色线索',steps:[color('green')]},
 {title:'暖暖的',steps:[warm]},
 {title:'凉凉的',steps:[cool]},
 {title:'红黄接力',steps:[color('red'),color('yellow')]},
 {title:'蓝绿接力',steps:[color('blue'),color('green')]},
 {title:'红蓝红',steps:[color('red'),color('blue'),color('red')]},
 {title:'两种暖色',steps:[warm,{kind:'warm',unique:true}]},
 {title:'两种凉色',steps:[cool,{kind:'cool',unique:true}]},
 {title:'三色收藏',steps:[color('yellow'),different,different]},
 {title:'亮亮暗暗',steps:[light,dark]},
 {title:'越找越亮',steps:[dark,lighter,lighter]},
 {title:'越找越暗',steps:[light,darker,darker]},
 {title:'记住三色',memory:true,steps:[color('red'),color('yellow'),color('blue')]},
 {title:'记住四色',memory:true,steps:[color('green'),color('blue'),color('yellow'),color('red')]},
 {title:'侦探徽章',memory:true,steps:[color('red'),cool,lighter,color('yellow')]},
 {title:'橙色邮差',steps:[color('orange')]},
 {title:'紫色星球',steps:[color('purple')]},
 {title:'橙紫接力',steps:[color('orange'),color('purple')]},
 {title:'冷暖转转',steps:[cool,warm,cool]},
 {title:'暖色花园',steps:[color('orange'),{kind:'warm',unique:true},{kind:'warm',unique:true}]},
 {title:'凉色海洋',steps:[color('purple'),{kind:'cool',unique:true},{kind:'cool',unique:true}]},
 {title:'四季颜色',steps:[color('green'),color('yellow'),color('orange'),color('blue')]},
 {title:'明暗回声',steps:[light,darker,lighter]},
 {title:'影子阶梯',steps:[dark,lighter,darker]},
 {title:'彩虹口袋',steps:[color('purple'),different,different,different]},
 {title:'暖凉交替',steps:[warm,cool,{kind:'warm',unique:true},{kind:'cool',unique:true}]},
 {title:'五色收藏',steps:[color('orange'),different,different,different,different]},
 {title:'蓝紫记忆',memory:true,steps:[color('blue'),color('purple'),color('blue')]},
 {title:'秋日记忆',memory:true,steps:[color('yellow'),color('orange'),color('red')]},
 {title:'森林记忆',memory:true,steps:[color('green'),color('purple'),color('yellow'),color('blue')]},
 {title:'光影记忆',memory:true,steps:[dark,lighter,lighter]},
 {title:'六色徽章',steps:[color('red'),different,different,different,different,different]},
 {title:'侦探大巡游',memory:true,steps:[color('purple'),color('orange'),color('green'),color('blue'),color('yellow')]}
].map((l,i)=>Object.freeze({id:i,...l,steps:l.steps.map(Object.freeze)}));
function rgbValid(rgb){return Array.isArray(rgb)&&rgb.length===3&&rgb.every(n=>Number.isFinite(n)&&n>=0&&n<=255);}
function describe(rgb){
 if(!rgbValid(rgb))return null;
 const [r,g,b]=rgb.map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 let hue=delta===0?0:max===r?60*(((g-b)/delta)%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);if(hue<0)hue+=360;
 const saturation=max===0?0:delta/max,brightness=(max+min)/2;
 let color=null;
 if(saturation>=.23&&max>=.17)color=hue<22||hue>=338?'red':hue<43?'orange':hue<80?'yellow':hue<169?'green':hue<270?'blue':'purple';
 return {rgb:rgb.map(Math.round),hue,saturation,brightness,color};
}
function analyze(pixels){
 if(!Array.isArray(pixels)||pixels.length<7||pixels.some(p=>!rgbValid(p)))return null;
 const median=i=>pixels.map(p=>p[i]).sort((a,b)=>a-b)[Math.floor(pixels.length/2)];
 const result=describe([median(0),median(1),median(2)]),counts={};
 for(const p of pixels){const c=describe(p).color||'neutral';counts[c]=(counts[c]||0)+1;}
 const key=result.color||'neutral';result.uniformity=(counts[key]||0)/pixels.length;
 // A mixed scene should not accidentally turn red + green pixels into a yellow clue.
 result.usable=result.uniformity>=.63;
 return result;
}
function label(step){return step.kind==='color'?COLORS[step.color].name:({warm:'暖色',cool:'凉色',different:'不一样',light:'亮色',dark:'暗色',lighter:'更亮',darker:'更暗'})[step.kind]||'';}
function matches(step,sample,history=[]){
 if(!sample||!rgbValid(sample.rgb)||sample.usable===false)return false;
 const value=describe(sample.rgb),prior=history.at(-1),seen=history.map(p=>describe(p.rgb).color);
 if(step.unique&&seen.includes(value.color))return false;
 switch(step.kind){
 case 'any':return true;
 case 'color':return value.color===step.color;
 case 'warm':return ['red','orange','yellow'].includes(value.color);
 case 'cool':return ['green','blue','purple'].includes(value.color);
 case 'different':return !!value.color&&!seen.includes(value.color);
 case 'light':return value.brightness>=.68;
 case 'dark':return value.brightness<=.28;
 case 'lighter':return !!prior&&value.brightness-describe(prior.rgb).brightness>=.16;
 case 'darker':return !!prior&&describe(prior.rgb).brightness-value.brightness>=.16;
 default:return false;
 }
}
const PASS_SCORE=80;
// The display uses the same category / brightness / uniqueness decision as collect().
// 80 is the rule boundary, not an RGB contrast ratio or a camera accuracy measure.
function comparison(step,sample,history=[]){
 if(!step||!sample||!rgbValid(sample.rgb))return {score:0,pass:false,target:null};
 const value=describe(sample.rgb),prior=history.at(-1),seen=history.map(p=>describe(p.rgb).color);
 let candidates=step.kind==='color'?[step.color]:step.kind==='warm'?['red','orange','yellow']:step.kind==='cool'?['green','blue','purple']:step.kind==='different'?Object.keys(COLORS).filter(c=>!seen.includes(c)):[];
 let raw=0,target=null;
 if(candidates.length){
  const delta=c=>{const t=describe(COLORS[c].rgb),h=Math.abs(value.hue-t.hue);return Math.min(h,360-h)/180*.8+Math.abs(value.saturation-t.saturation)*.2;};
  candidates.sort((a,b)=>delta(a)-delta(b));target=COLORS[candidates[0]].rgb.slice();raw=Math.max(0,1-delta(candidates[0]));
 }else if(['light','dark','lighter','darker'].includes(step.kind)){
  const before=prior?describe(prior.rgb).brightness:null;
  const bound=step.kind==='light'?.68:step.kind==='dark'?.28:before===null?null:step.kind==='lighter'?before+.16:before-.16;
  if(bound!==null){const goal=Math.max(0,Math.min(1,bound)),n=Math.round(goal*255);target=[n,n,n];raw=step.kind==='light'||step.kind==='lighter'?Math.min(1,value.brightness/Math.max(.01,goal)):Math.min(1,(1-value.brightness)/Math.max(.01,1-goal));}
 }else raw=1;
 const pass=matches(step,sample,history);
 return {score:pass?Math.max(PASS_SCORE,Math.round(80+20*raw)):Math.min(79,Math.max(0,Math.round(79*raw))),pass,target};
}
function createState(level,mode='camera'){
 if(!Number.isInteger(level)||!LEVELS[level])throw new RangeError('level');
 return {level,mode:mode==='practice'?'practice':'camera',collected:[],finished:false};
}
function collect(state,rgb){
 if(!state||state.finished||!rgbValid(rgb))return false;
 const sample=describe(rgb),spec=LEVELS[state.level];
 if(!matches(spec.steps[state.collected.length],sample,state.collected))return false;
 state.collected.push({rgb:sample.rgb});state.finished=state.collected.length===spec.steps.length;return true;
}
function restore(raw){
 const out={schema:1,cameraStars:Array(LEVELS.length).fill(0),practiceStars:Array(LEVELS.length).fill(0),session:null};
 if(!raw||raw.schema!==1)return out;
 for(const key of ['cameraStars','practiceStars'])if(Array.isArray(raw[key]))out[key]=out[key].map((_,i)=>[1,2,3].includes(raw[key][i])?raw[key][i]:0);
 const s=raw.session;if(!s||!Number.isInteger(s.level)||!LEVELS[s.level]||!['camera','practice'].includes(s.mode)||!Array.isArray(s.collected))return out;
 const restored=createState(s.level,s.mode);
 for(const clue of s.collected)if(!clue||!collect(restored,clue.rgb))return out;
 out.session=restored;return out;
}
// Consecutive fresh camera frames must agree for 650ms. Polling the same JPEG never counts.
function stabilizer(){
 let since=0,count=0,lastSeq=-1,lastAt=-1,reference=null,latest=null;
 function reset(){since=0;count=0;lastSeq=-1;lastAt=-1;reference=null;latest=null;}
 function push(frame,step,history,now){
  if(!frame||!Number.isFinite(now)||!Number.isFinite(frame.ageMs)||frame.ageMs<0||frame.ageMs>1000||!Number.isFinite(frame.seq)||frame.seq<lastSeq){reset();return {ready:false,progress:0,sample:null};}
  if(frame.seq===lastSeq)return {ready:count>=4&&lastAt-since>=650&&lastAt>=now-500,progress:Math.min(1,(lastAt-since)/650),sample:latest};
  const sample=analyze(frame.pixels);lastSeq=frame.seq;
  if(!sample||!matches(step,sample,history)){since=now;count=0;lastAt=now;reference=null;latest=sample;return {ready:false,progress:0,sample};}
  const distance=reference?Math.max(...sample.rgb.map((v,i)=>Math.abs(v-reference.rgb[i]))):0;
  if(!reference||distance>45||now-lastAt>500){since=now;count=0;reference=sample;}
  count++;lastAt=now;latest=sample;
  return {ready:count>=4&&now-since>=650,progress:Math.min(1,(now-since)/650),sample};
 }
 return {push,reset};
}
root.CameraColor={COLORS,LEVELS,describe,analyze,label,matches,comparison,PASS_SCORE,createState,collect,restore,stabilizer};
})(typeof window!=='undefined'?window:globalThis);
