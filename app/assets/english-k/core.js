(function(w){'use strict';
const WORDS=Object.freeze({apple:'苹果',banana:'香蕉',bed:'床',computer:'电脑',dad:'爸爸',mom:'妈妈',brother:'哥哥',me:'我',sister:'姐姐'});
const routes=[['me'],['dad'],['mom'],['bed'],['apple'],['banana'],['sister'],['brother'],['computer'],['me','dad'],['mom','bed'],['apple','banana'],['sister','brother'],['computer','bed'],['dad','mom','me'],['apple','bed','banana'],['brother','sister','me'],['computer','dad','mom'],['banana','apple','sister'],['me','brother','computer']];
const LEVELS=Object.freeze(routes.map((words,i)=>Object.freeze({id:i+1,words:Object.freeze(words),hint:i<6?'full':i<12?'first':'none',chapter:Math.floor(i/5)})));
function normalize(s){return String(s||'').toLowerCase().replace(/[^a-z]/g,'');}
function grade(raw,word){
 const score=Number.isFinite(raw?.SuggestedScore)&&raw.SuggestedScore>=0&&raw.SuggestedScore<=100?raw.SuggestedScore:null;
 if(score===null||!Array.isArray(raw.Words)||!raw.Words.length||!raw.Words.every(x=>x&&typeof(x.Word||x.ReferenceWord)==='string'&&normalize(x.Word||x.ReferenceWord)&&Number.isInteger(x.MatchTag)&&x.MatchTag>=0&&x.MatchTag<=9&&Number.isFinite(x.PronAccuracy)&&x.PronAccuracy>=0&&x.PronAccuracy<=100))return {score:null,passed:false,assessed:false,reason:'invalid-result'};
 const match=raw.Words.length===1&&raw.Words.find(x=>normalize(x.Word||x.ReferenceWord)===word);
 if(!match)return{score,passed:false,assessed:true,reason:'word'};
 const accuracy=Number.isFinite(match.PronAccuracy)?match.PronAccuracy:null;
 return {score,accuracy,passed:score>=75&&accuracy!==null&&accuracy>=70&&match.MatchTag===0,assessed:accuracy!==null&&Number.isInteger(match.MatchTag),reason:match.MatchTag!==0?'word':score<75||accuracy===null||accuracy<70?'pronunciation':'pass'};
}
function restore(raw){try{const p=typeof raw==='string'?JSON.parse(raw):raw;if(p?.schema!==1)throw 0;const best={};for(const [k,v]of Object.entries(p.best||{}))if(/^([1-9]|1\d|20)$/.test(k)&&Number.isFinite(v)&&v>=0)best[k]=Math.floor(v);return{schema:1,unlocked:Math.max(1,Math.min(20,Math.floor(Number(p.unlocked)||1))),best};}catch(_){return{schema:1,unlocked:1,best:{}};}}
function create(level=1){const l=LEVELS[Math.max(0,Math.min(19,level-1))];let index=0,hearts=5,score=0,phase='spell',draft='',last=null;
 function snapshot(){return{level:l.id,words:l.words.slice(),word:l.words[index],index,hearts,score,phase,draft,hint:l.hint,last};}
 function type(letter){if(phase==='spell'&&/^[a-z]$/.test(letter)&&draft.length<l.words[index].length)draft+=letter;return snapshot();}
 function erase(){if(phase==='spell')draft=draft.slice(0,-1);return snapshot();}
 function spell(){if(phase!=='spell')return false;if(draft!==l.words[index])return false;phase='read';return true;}
 function assess(raw){if(phase!=='read')return{ignored:true};last=grade(raw,l.words[index]);if(!last.assessed)return last;if(last.passed){score+=Math.round(last.score);phase='won-word';}else{hearts--;if(!hearts)phase='lost';}return last;}
 function next(){if(phase!=='won-word')return false;if(index===l.words.length-1){phase='complete';return true;}index++;draft='';last=null;phase='spell';return true;}
 return Object.freeze({snapshot,type,erase,spell,assess,next});
}
w.EnglishKingdom=Object.freeze({WORDS,LEVELS,normalize,grade,restore,create});
})(window);
