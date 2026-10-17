#!/usr/bin/env node
/** Enumerate actual lookup results. Linguistic completeness still needs review. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function auditAnswers(){
 const ctx=vm.createContext({window:{}});
 for(const name of ['strokes','levels-extra','core','composites','answer-catalog'])vm.runInContext(fs.readFileSync(path.join(root,'app/assets/hanzi-puzzle',name+'.js'),'utf8'),ctx);
 const H=ctx.window.HanziStrokes,C=ctx.window.HanziCompositeData;
 const levels=H.LEVELS.map((lv,li)=>{
  const expected=new Map();
  if(lv.targets.length>20)throw Error('Answer limit exceeded');
  for(const t of lv.targets)for(const set of t.sets){const key=set.join(',');if(expected.has(key)&&expected.get(key)!==t.char)throw Error('Ambiguous selection');expected.set(key,t.char);}
  const count=H.STROKE_COUNTS[li];let subsets=0,recognized=0;
  for(let mask=1;mask<2**count;mask++){
   const selected=Array.from({length:count},(_,i)=>i).filter(i=>mask&(2**i)),expectedChar=expected.get(selected.join(','))||null;
   if((H.match(li,selected)?.char||null)!==expectedChar)throw Error('Lookup mismatch at level '+(li+1));subsets++;if(expectedChar)recognized++;
  }
  const all=Array.from({length:count},(_,i)=>i),glyph=lv.parts.length===1?lv.source:H.match(li,all).char;
  return {level:li+1,source:lv.source,glyph,strokeCount:count,answerCount:lv.targets.length,legalSelectionCount:recognized,checkedSubsets:subsets,strokeMap:lv.parts.length===1?all:C[glyph].strokeMap,targets:JSON.parse(JSON.stringify(lv.targets))};
 });
 return {catalogVersion:H.answerCatalog.version,levelCount:levels.length,answerCount:levels.reduce((n,l)=>n+l.answerCount,0),legalSelectionCount:levels.reduce((n,l)=>n+l.legalSelectionCount,0),checkedSubsets:levels.reduce((n,l)=>n+l.checkedSubsets,0),maxAnswers:Math.max(...levels.map(l=>l.answerCount)),levels};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=auditAnswers(),flag=process.argv.indexOf('--out');
 if(flag>=0){
  const dir=path.resolve(process.argv[flag+1]);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'answer-inventory.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'answer-inventory.md'),'# 字里找字答案清单（4.17）\n\n以下为实际离线答案库，不宣称涵盖所有汉字。整笔选择，折笔不拆；多字关保留既有部件重组规则。\n\n|关卡|题字|实际画布|答案数|答案|\n|---|---|---|---:|---|\n'+result.levels.map(l=>`|${l.level}|${l.source}|${l.glyph}|${l.answerCount}|${l.targets.map(t=>t.char).join('、')}|`).join('\n')+'\n');
 }
 const {levels,...summary}=result;console.log(JSON.stringify(summary,null,2));
}
