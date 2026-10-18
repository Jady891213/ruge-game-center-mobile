/* Professional assessment task/result rules. Never derives a score from KWS or microphone volume. */
(function(w){
'use strict';
const V=w.HanziVocabulary,INTRO='班山大人好三上下天地来小';
const SPLIT={班:['b','an1','ban1'],山:['sh','an1','shan1'],大:['d','a4','da4'],人:['r','en2','ren2'],好:['h','ao3','hao3'],三:['s','an1','san1'],上:['sh','ang4','shang4'],下:['x','i','a4','xia4'],天:['t','i','an1','tian1'],地:['d','i4','di4'],来:['l','ai2','lai2'],小:['x','i','ao3','xiao3']};
const TONES={ā:['a',1],á:['a',2],ǎ:['a',3],à:['a',4],ē:['e',1],é:['e',2],ě:['e',3],è:['e',4],ī:['i',1],í:['i',2],ǐ:['i',3],ì:['i',4],ō:['o',1],ó:['o',2],ǒ:['o',3],ò:['o',4],ū:['u',1],ú:['u',2],ǔ:['u',3],ù:['u',4],ǖ:['v',1],ǘ:['v',2],ǚ:['v',3],ǜ:['v',4],ü:['v',0]};
function numeric(p){let tone=0;const text=Array.from(String(p).toLowerCase()).map(c=>{if(TONES[c]){tone=Math.max(tone,TONES[c][1]);return TONES[c][0];}return c;}).join('');return text+(tone||'');}
function marked(p){const m=/^([a-zv]+)([1-4])?$/.exec(p);if(!m)return p;let s=m[1].replace(/v/g,'ü');const n=Number(m[2]);if(!n)return s;let i=s.indexOf('a');if(i<0)i=s.indexOf('e');if(i<0&&s.includes('ou'))i=s.indexOf('o');if(i<0)for(let j=s.length-1;j>=0;j--)if('aeiouü'.includes(s[j])){i=j;break;}if(i<0)return s;const rows={a:'āáǎà',e:'ēéěè',i:'īíǐì',o:'ōóǒò',u:'ūúǔù',ü:'ǖǘǚǜ'};if(s[i]==='ü')return s.slice(0,i)+'ǖǘǚǜ'[n-1]+s.slice(i+1);return s.slice(0,i)+rows[s[i]][n-1]+s.slice(i+1);}
function readings(ch){return ch==='班'?['bān']:(V.pinyin[ch]||[]).slice();}
function deck(mode,group=0){if(mode==='spell')return Array.from(INTRO);if(mode!=='read'||!Number.isInteger(group)||group<0||group>=V.levels.length)throw new Error('invalid-group');return Array.from(V.levels[group].chars);}
function task(ch,mode='read',pinyin){const choices=readings(ch);if(!choices.length||!['read','spell'].includes(mode))throw new Error('invalid-task');const p=pinyin||choices[0];if(!choices.includes(p))throw new Error('invalid-reading');let refs;
if(mode==='spell'){if(!SPLIT[ch])throw new Error('not-in-spelling-deck');refs=SPLIT[ch].slice();if(refs.at(-1)!==numeric(p))throw new Error('invalid-spelling-reading');}else refs=[numeric(p)];
const neutral=mode==='read'&&!/[1-4]$/.test(refs[0]);
return{id:mode+':'+ch+':'+p,char:ch,pinyin:p,choices,mode,evalMode:neutral?0:mode==='read'?1:8,reference:neutral?ch:mode==='read'?ch+' '+refs[0]:refs.join(' '),items:refs.map((reference,i)=>({label:i===refs.length-1&&mode==='spell'?ch:marked(reference),reference:neutral?ch:reference,tone:Number(/[1-4]$/.exec(reference)?.[0]||0),kind:i===refs.length-1?'word':'part'}))};}
function number(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:null;}
function norm(s){return String(s||'').toLowerCase().replace(/ü/g,'v').replace(/\s/g,'');}
function detectedTone(word,expected){
  if(!expected)return 'none';const tone=word?.Tone;
  if(tone?.Valid!==true||tone.RefTone!==expected||![1,2,3,4].includes(tone.HypothesisTone??tone.HypTone))return 'unknown';
  return (tone.HypothesisTone??tone.HypTone)===expected?'match':'mismatch';
}
function grade(t,raw){const unavailable=reason=>({status:'unavailable',score:null,pass:false,parts:[],reason});if(!t||!raw||typeof raw!=='object')return unavailable('评分暂不可用');
let score=number(raw.SuggestedScore);if(score===null||!Array.isArray(raw.Words))return unavailable('评分暂不可用');
if(score===0&&raw.Words.length===0)return unavailable('没听清，再读一次');
const words=raw.Words,parts=t.items.map((item,i)=>{
 const word=words[i]||{},value=number(word.PronAccuracy),reference=norm(word.ReferenceWord||word.Word),expected=norm(item.reference),matches=reference===expected||(item.kind==='word'&&reference===t.char);
 let tone=detectedTone(word,item.tone),partScore=value;
 const phones=Array.isArray(word.PhoneInfos)?word.PhoneInfos.map(p=>({label:String(p.ReferencePhone||p.Phone||''),heard:String(p.Phone||''),score:number(p.PronAccuracy),matched:p.MatchTag===0})):[];
 // eval8 does not expose an independent Tone result. Its intermediate phoneme
 // score remains a phoneme score; never label a forced-aligned suffix as correct tone.
 if(t.mode==='spell'&&item.kind==='part'&&item.tone&&tone==='unknown'){
   tone=phones.some(p=>/[1-4]$/.test(p.label)&&/[1-4]$/.test(p.heard)&&p.label!==p.heard)?'mismatch':'phoneme';
 }
 if(t.mode==='spell'&&item.kind==='word'&&raw.ToneAudit){
   const audit=raw.ToneAudit,a=audit.result,aw=a?.Words;
   if(audit.index===i&&audit.reference===item.reference&&number(a?.SuggestedScore)!==null&&Array.isArray(aw)&&aw.length===1&&aw[0].MatchTag===0&&number(aw[0].PronAccuracy)!==null){
     tone=detectedTone(aw[0],item.tone);partScore=value===null?null:Math.min(value,aw[0].PronAccuracy);score=Math.min(score,a.SuggestedScore);
   }else tone='unknown';
 }
 return{label:item.label,score:partScore,tone,matched:matches&&word.MatchTag===0,phones};
});
const complete=words.length===t.items.length&&parts.every(p=>p.matched&&p.score!==null);
const toneWrong=parts.some(p=>p.tone==='mismatch'),toneUnknown=parts.some(p=>p.tone==='unknown');
const phonesWrong=parts.some(p=>p.phones.some(q=>q.score===null||q.score<45||!q.matched));
const pass=complete&&!toneWrong&&!toneUnknown&&!phonesWrong&&score>=80&&parts.every(p=>p.score>=60);
const reason=pass?'读得真棒！':!complete?'每一段都读出来':toneWrong?'声调再试试':toneUnknown?'声调没听准，再读一次':score<80||parts.some(p=>p.score<60)||phonesWrong?'再读清楚一点':'再试一次';
return{status:'scored',score:Math.floor(score),pass,parts,reason};}
w.ReadingCore=Object.freeze({deck,task,grade,readings,numeric,marked,INTRO,PASS_SCORE:80});
})(window);
