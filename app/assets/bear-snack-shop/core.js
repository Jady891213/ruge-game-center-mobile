(function(root){
'use strict';
const SNACKS=Object.freeze({cookie:{name:'饼干',x:0,y:0},cupcake:{name:'纸杯蛋糕',x:50,y:0},donut:{name:'甜甜圈',x:100,y:0},croissant:{name:'牛角包',x:0,y:100},pudding:{name:'布丁',x:50,y:100},'strawberry-cake':{name:'草莓蛋糕',x:100,y:100}});
const order=(customer,items)=>({customer,items});
const LEVELS=[
{mode:'count',palette:['cookie','cupcake'],orders:[order('bear',['cookie'])]},
{mode:'count',palette:['cookie','cupcake'],orders:[order('bunny',['cupcake','cupcake'])]},
{mode:'count',palette:['cookie','donut'],orders:[order('cat',['donut','donut','donut'])]},
{mode:'count',palette:['cookie','pudding'],orders:[order('bear',['cookie','cookie']),order('bunny',['pudding','pudding'])]},
{mode:'count',palette:['cookie','cupcake','donut'],orders:[order('cat',['cookie','cupcake'])]},
{mode:'count',palette:['cookie','donut','pudding'],orders:[order('bunny',['donut','donut','cookie']),order('bear',['pudding','cookie'])]},
{mode:'count',palette:['croissant','pudding','strawberry-cake'],orders:[order('bear',['croissant','croissant','pudding']),order('cat',['strawberry-cake','pudding','pudding'])]},
{mode:'count',palette:['cookie','cupcake','donut','strawberry-cake'],orders:[order('bunny',['cookie','donut','donut']),order('cat',['cupcake','strawberry-cake']),order('bear',['cookie','cookie','cupcake','cupcake'])]},
{mode:'sequence',palette:['cookie','cupcake'],orders:[order('bear',['cookie','cupcake']),order('bunny',['cupcake','cookie'])]},
{mode:'sequence',palette:['donut','pudding','croissant'],orders:[order('cat',['pudding','donut','croissant']),order('bunny',['donut','croissant','pudding'])]},
{mode:'sequence',palette:['cookie','cupcake','strawberry-cake'],orders:[order('bunny',['cookie','cupcake','cookie']),order('bear',['strawberry-cake','cookie','cupcake']),order('cat',['cupcake','strawberry-cake','cookie'])]},
{mode:'sequence',palette:['croissant','pudding','donut','strawberry-cake'],orders:[order('bear',['croissant','pudding','donut','strawberry-cake']),order('bunny',['donut','croissant','strawberry-cake','pudding']),order('cat',['pudding','donut','pudding','croissant'])]}
];
function createState(level=0){return {level:Number.isInteger(level)&&level>=0&&level<LEVELS.length?level:0,order:0,plate:[],served:[],mistakes:0,accepted:false,finished:false};}
const current=s=>LEVELS[s.level].orders[s.order];
function matches(items,target,mode){if(!Array.isArray(items)||items.length!==target.length)return false;if(mode==='sequence')return items.every((x,i)=>x===target[i]);const a=items.slice().sort(),b=target.slice().sort();return a.every((x,i)=>x===b[i]);}
function add(s,id){if(s.accepted||s.finished||!LEVELS[s.level].palette.includes(id)||s.plate.length>=current(s).items.length)return false;s.plate.push(id);return true;}
function undo(s){if(s.accepted||s.finished)return false;return !!s.plate.pop();}
function submit(s){if(s.accepted||s.finished||!s.plate.length)return false;if(!matches(s.plate,current(s).items,LEVELS[s.level].mode)){s.mistakes++;return false;}s.accepted=true;s.served.push(s.plate.slice());return true;}
function next(s){if(!s.accepted||s.finished)return false;if(s.order===LEVELS[s.level].orders.length-1){s.finished=true;return true;}s.order++;s.plate=[];s.accepted=false;return true;}
const restart=s=>createState(s.level);
const complete=s=>s.accepted&&s.order===LEVELS[s.level].orders.length-1;
function restore(raw){
const empty={stars:Array(12).fill(0),session:null};if(!raw||raw.schema!==1)return empty;
const stars=Array.from({length:12},(_,i)=>Number.isInteger(raw.stars?.[i])&&raw.stars[i]>=0&&raw.stars[i]<=3?raw.stars[i]:0),fail=()=>({stars,session:null}),s=raw.session;
if(!s||!Number.isInteger(s.level)||s.level<0||s.level>=12||!Number.isInteger(s.order)||s.order<0||s.order>=LEVELS[s.level].orders.length||typeof s.accepted!=='boolean'||typeof s.finished!=='boolean'||!Number.isInteger(s.mistakes)||s.mistakes<0||s.mistakes>100000||!Array.isArray(s.plate)||!Array.isArray(s.served))return fail();
const l=LEVELS[s.level],valid=(arr,max)=>Array.isArray(arr)&&arr.length<=max&&arr.every(x=>l.palette.includes(x));
if(!valid(s.plate,current(s).items.length)||s.served.length!==s.order+(s.accepted?1:0)||s.finished&&!complete(s))return fail();
for(let i=0;i<s.served.length;i++)if(!valid(s.served[i],l.orders[i].items.length)||!matches(s.served[i],l.orders[i].items,l.mode))return fail();
if(s.accepted&&(!matches(s.plate,current(s).items,l.mode)||s.plate.some((x,i)=>s.served[s.order][i]!==x)))return fail();
return {stars,session:{level:s.level,order:s.order,plate:s.plate.slice(),served:s.served.map(x=>x.slice()),mistakes:s.mistakes,accepted:s.accepted,finished:s.finished}};
}
const api={SNACKS,LEVELS,createState,current,matches,add,undo,submit,next,restart,complete,restore};root.BearSnackShop=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
