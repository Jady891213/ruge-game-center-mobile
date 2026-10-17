/* Reviewed offline answer catalog. This is not OCR or an exhaustive dictionary.
 * Reuse canonical stroke indices through each compound's explicit strokeMap. */
(function(root){
'use strict';
const H=root.HanziStrokes,C=root.HanziCompositeData;
const profiles={},signature=set=>set.slice().sort((a,b)=>a-b).join(',');
function merge(targets,char,pinyin,sets){
 let target=targets.find(t=>t.char===char);
 if(!target){target={char,pinyin,sets:[]};targets.push(target);}
 for(const set of sets){const sorted=set.slice().sort((a,b)=>a-b),key=signature(sorted);if(!target.sets.some(s=>signature(s)===key))target.sets.push(sorted);}
}
function profile(char){return profiles[char]||(profiles[char]=[]);}
function wholeGlyph(lv,li){
 const all=Array.from({length:H.STROKE_COUNTS[li]},(_,i)=>i);
 const char=lv.parts.length===1?lv.source:H.match(li,all)?.char;
 const map=lv.parts.length===1?all:C[char]?.strokeMap;
 if(!char||!map||map.length!==all.length)throw new Error('Missing answer stroke map: '+lv.source);
 return {char,map};
}
// First consolidate the existing definitions. The same displayed 早 must have
// the same answers whether its original source was 早 or the compound 日十.
for(const [char,item]of Object.entries(root.HanziExtraContent.profiles))
 for(const t of item.targets)merge(profile(char),t.char,t.pinyin,t.sets);
const glyphs=H.LEVELS.map(wholeGlyph);
H.LEVELS.forEach((lv,li)=>{const {char,map}=glyphs[li];for(const t of lv.targets)merge(profile(char),t.char,t.pinyin,t.sets.map(set=>set.map(i=>map[i])));});
// Each entry has been reviewed against the whole original strokes. Ratios can
// vary; folds cannot be split and a vertical cannot be shortened to invent a character.
const reviewed={
 田:[['土','tǔ',[[2,3,4]]]],
 本:[['十','shí',[[1,4]]]],
 夫:[['大','dà',[[0,2,3]]]],
 去:[['云','yún',[[0,2,3,4]]]],
 由:[['土','tǔ',[[2,3,4]]]],
 里:[['甲','jiǎ',[[0,1,2,3,4]]],['旦','dàn',[[0,1,2,3,5],[0,1,2,3,6]]],['土','tǔ',[[2,4,6],[3,4,6]]]],
 生:[['土','tǔ',[[1,3,4]]]],
 青:[['土','tǔ',[[0,2,3]]]],
 早:[['旦','dàn',[[0,1,2,3,4]]]],
 昌:[['旦','dàn',[[0,1,2,3,6],[0,1,2,3,7]]]],
 晶:[['旦','dàn',[[0,1,2,3,6],[0,1,2,3,7],[0,1,2,3,10],[0,1,2,3,11]]]],
 星:[['早','zǎo',[[0,1,2,3,5,7],[0,1,2,3,6,7]]],['旦','dàn',[[0,1,2,3,5],[0,1,2,3,6],[0,1,2,3,8]]]]
};
for(const [char,targets]of Object.entries(reviewed))for(const [answer,pinyin,sets]of targets)merge(profile(char),answer,pinyin,sets);
H.LEVELS.forEach((lv,li)=>{
 // Expand each source component from the same catalog, so 田→土 also works
 // inside 思 and 男, with offsets remaining compatible with saved selections.
 for(const part of lv.parts)for(const t of profile(part.char))merge(lv.targets,t.char,t.pinyin,t.sets.map(set=>set.map(i=>i+part.offset)));
 const {char,map}=glyphs[li],inverse=[];map.forEach((standard,global)=>{inverse[standard]=global;});
 for(const t of profile(char))merge(lv.targets,t.char,t.pinyin,t.sets.map(set=>set.map(i=>inverse[i])));
 const seen=new Map();
 if(lv.targets.length>20)throw new Error('Too many Hanzi answers: '+lv.source);
 for(const t of lv.targets)for(const set of t.sets){
  if(!t.pinyin||!set.length||new Set(set).size!==set.length||set.some(i=>!Number.isInteger(i)||i<0||i>=H.STROKE_COUNTS[li]))throw new Error('Invalid Hanzi answer: '+lv.source+' '+t.char);
  const key=signature(set);if(seen.has(key)&&seen.get(key)!==t.char)throw new Error('Ambiguous Hanzi answer: '+lv.source+' '+key);
  seen.set(key,t.char);
 }
});
H.answerCatalog={version:1,profiles,reviewed};
})(window);
