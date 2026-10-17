import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{}});
for(const name of ['strokes','levels-extra','core','composites','answer-catalog','board-geometry'])vm.runInContext(fs.readFileSync(new URL(`../app/assets/hanzi-puzzle/${name}.js`,import.meta.url),'utf8'),ctx);
const {HanziStrokes:H,HanziStrokeData:D,HanziCompositeData:C,HanziBoard:B}=ctx.window;
const plain=x=>JSON.parse(JSON.stringify(x));
const board=li=>B.forLevel(li,H,D,C);
const index=source=>H.LEVELS.findIndex(l=>l.source===source);
function bounds(lines){const points=lines.flat();return {left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),bottom:Math.min(...points.map(p=>p[1])),top:Math.max(...points.map(p=>p[1]))};}
const centerX=b=>(b.left+b.right)/2;
test('30 个多字关采用完整合体字轮廓，原 30 个单字关保持原始几何',()=>{
 let compounds=0;
 H.LEVELS.forEach((lv,li)=>{
  const b=board(li);assert.equal(b.strokes.length,H.STROKE_COUNTS[li]);assert.equal(b.medians.length,b.strokes.length);assert.deepEqual(plain(b.parts),plain(lv.parts));
  if(lv.parts.length===1){assert.equal(b.compound,false);assert.strictEqual(b.strokes,D[lv.source].strokes);assert.strictEqual(b.medians,D[lv.source].medians);}
  else{compounds++;assert.equal(b.compound,true);assert.equal(b.char,H.match(li,Array.from({length:H.STROKE_COUNTS[li]},(_,i)=>i)).char);assert.equal(C[b.char].source,lv.source);}
 });
 assert.equal(compounds,30);assert.equal(Object.keys(C).length,30);assert.throws(()=>board(-1),/Unknown Hanzi level/);
});
test('真实合体字笔序映射保持部件全局索引，并支持明确的非恒等映射',()=>{
 for(let li=30;li<60;li++){
  const b=board(li),entry=C[b.char],glyph=entry.reuse?D[b.char]:entry;
  assert.equal(entry.strokeMap.length,H.STROKE_COUNTS[li]);assert.equal(new Set(entry.strokeMap).size,entry.strokeMap.length);assert(entry.mappingNote);
  b.parts.forEach(p=>{assert.equal(p.count,D[p.char].strokes.length);for(let i=0;i<p.count;i++){const global=p.offset+i,standard=entry.strokeMap[global];assert.equal(b.strokes[global],glyph.strokes[standard]);assert.deepEqual(plain(b.medians[global]),plain(glyph.medians[standard]));}});
 }
 // Preserve the save index even if a future compound's writing order interleaves parts.
 const li=index('日月'),entry=C.明,swapped={...entry,strokeMap:[1,0,2,3,4,5,6,7]};
 const b=B.forLevel(li,H,D,{...C,明:swapped});assert.equal(b.strokes[0],entry.strokes[1]);assert.equal(b.strokes[1],entry.strokes[0]);
 assert.throws(()=>B.forLevel(li,H,D,{...C,明:{...entry,strokeMap:[0,0,2,3,4,5,6,7]}}),/Invalid compound stroke map/);
 for(const ch of ['妈','好','她'])assert(C[ch].mappingNote.includes('提'),'record positional 女 radical shape');
 for(const ch of ['李','问','间','闲'])assert(C[ch].mappingNote.includes('→'),'record source component writing order');
});
test('森的三个木上下嵌合为一字，品/晶/众沿用上中下品字形结构',()=>{
 for(const source of ['木木木','口口口','日日日','人人人']){
  const b=board(index(source)),[top,left,right]=b.parts.map(p=>bounds(b.medians.slice(p.offset,p.offset+p.count)));
  assert(top.top>left.top&&top.top>right.top,source+' has an upper component');
  assert(top.bottom>left.bottom&&top.bottom>right.bottom,source+' lower components reach below top component');
  assert(centerX(left)<centerX(top)&&centerX(top)<centerX(right),source+' lower pair surrounds the upper component');
  assert(left.right>top.left&&right.left<top.right,source+' pieces share one composite footprint');
 }
});
test('问/间/闲的内字确实嵌在门的包围区域，没有独立并排字板',()=>{
 for(const source of ['门口','门日','门木']){
  const b=board(index(source)),outer=bounds(b.medians.slice(0,3)),inner=bounds(b.medians.slice(3));
  assert(inner.left>outer.left&&inner.right<outer.right,source+' inside left/right gate strokes');
  assert(inner.bottom>outer.bottom&&inner.top<outer.top,source+' below gate lintel and above foot');
 }
});
test('整字画布每一笔均有实际可达的中线点，交叉处不会只选顶层',()=>{
 let strokes=0;
 for(let li=0;li<H.LEVELS.length;li++){
  const b=board(li);
  b.medians.forEach((line,i)=>{assert(line.some(([x,y])=>B.pick(b.medians,x,y)===i),`${li+1} ${b.char} 第 ${i+1} 笔不可永久被挡住`);strokes++;});
 }
 assert.equal(strokes,H.STROKE_COUNTS.reduce((n,count)=>n+count,0));
 const cross=[[[0,0],[100,0]],[[50,-100],[50,100]]];
 assert.equal(B.pick(cross,55,40,20),1);assert.equal(B.pick(cross,90,6,20),0);assert.equal(B.pick(cross,250,250,20),-1);
});
test('几何替换不改变 60 关答案、旧草稿全局索引与存档 schema',()=>{
 const before=JSON.stringify(H.LEVELS),raw={schema:1,current:36,reached:59,found:H.LEVELS.map(()=>[]),selected:[0,4,8]};
 const saved=plain(H.sanitize(raw));for(let li=0;li<H.LEVELS.length;li++)board(li);
 assert.equal(JSON.stringify(H.LEVELS),before);assert.equal(H.LEVELS.length,60);assert.equal(H.LEVELS.reduce((n,l)=>n+l.targets.length,0),358);assert.deepEqual(plain(H.sanitize(raw)),saved);assert.deepEqual(saved.selected,[0,4,8]);assert.equal(saved.schema,1);assert.equal(H.KEY,'rugeHanziStrokesV1');
 for(let li=0;li<H.LEVELS.length;li++)for(const t of H.LEVELS[li].targets)for(const selected of t.sets)assert.equal(H.match(li,selected)?.char,t.char);
});
test('新 29 个字形离线收录固定提交来源与 SHA-256，早复用已有许可数据',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../app/assets/hanzi-puzzle/sources.json',import.meta.url),'utf8'));
 assert.equal(manifest.commit,'68d10a4b21150cae5e1ebbd223eed289cf32d90c');assert.equal(manifest.license,'Arphic Public License');
 assert.equal(new Set(manifest.files.map(f=>f.character)).size,manifest.files.length);
 for(const ch of Object.keys(C)){const file=manifest.files.find(f=>f.character===ch);assert(file,ch+' source');assert(/^[0-9a-f]{64}$/.test(file.sha256));assert(file.url.includes(manifest.commit));}
 assert.equal(C.早.reuse,'HanziStrokeData');assert.equal(C.早.strokes,undefined);assert.equal(manifest.files.length,73);
});
