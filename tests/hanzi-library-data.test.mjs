import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';

const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'app/assets'),library=resolve(assets,'hanzi-library');
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
function vocabulary(){
  const window={};vm.runInNewContext(readFileSync(resolve(assets,'shared/hanzi-vocabulary.js'),'utf8'),{window});
  return plain(window.HanziVocabulary);
}
function dataset(){return readJson(resolve(library,'data.json'));}
function notes(value){return (Array.isArray(value)?value:[value]).filter(Boolean).join(' ');}
function https(value,label){
  const url=new URL(value);assert.equal(url.protocol,'https:',label);assert.equal(url.username,'',label);assert.equal(url.password,'',label);
  assert.ok(!url.port||url.port==='443',label);assert.equal(value.trim(),value,label);return url;
}

test('识字库：六组原60字与拼音练习共用词表，不新增、漏字、换序或改已有接受读音',()=>{
  const data=dataset(),v=vocabulary(),expected=v.levels.flatMap(group=>[...group.chars]);
  assert.equal(data.entries.length,60);assert.equal(new Set(data.entries.map(entry=>entry.char)).size,60);
  assert.deepEqual(data.entries.map(entry=>entry.char),expected);
  assert.equal(data.groups.length,v.levels.length);assert.equal(new Set(data.groups.map(group=>group.id)).size,v.levels.length);
  data.groups.forEach((group,index)=>{
    assert.ok(typeof group.id==='string'&&group.id.length);assert.equal(group.name,v.themes[index]);
    assert.deepEqual([...group.chars],[...v.levels[index].chars]);
  });
  for(const entry of data.entries)assert.deepEqual(entry.pinyin,v.pinyin[entry.char],entry.char+'沿用原练习读音');
});

test('识字库：打包catalog与JSON完全一致，只装载本地资料，不读存档或联网',()=>{
  const window={},storage=new Proxy({},{get(){throw Error('资料装载不能读取游戏存档');},set(){throw Error('资料装载不能修改游戏存档');}});
  vm.runInNewContext(readFileSync(resolve(library,'catalog.js'),'utf8'),{
    window,localStorage:storage,fetch(){throw Error('字库必须离线可读');},XMLHttpRequest(){throw Error('字库不能拉取远端内容');}
  });
  assert.deepEqual(plain(window.HanziLibraryData),dataset());
});

test('识字库：每字都有精简的现代义、字源说明、谨慎边界和可直达的学术或字典来源',()=>{
  const domains=new Set(['humanum.arts.cuhk.edu.hk','www.zdic.net','zdic.net','dict.variants.moe.edu.tw']);
  for(const entry of dataset().entries){
    const char=entry.char;
    for(const key of ['traditional','meaning','story','evolutionNote'])assert.ok(typeof entry[key]==='string'&&entry[key].trim(),`${char}缺少${key}`);
    assert.ok(entry.meaning.length+entry.story.length<=100,char+'的孩子/家长正文需精简');
    assert.ok(notes(entry.confidenceNotes).trim(),char+'需保留字源或适用读音边界');
    assert.ok(Array.isArray(entry.sources)&&entry.sources.length>=1,char+'缺少来源');
    for(const source of entry.sources){
      assert.ok(typeof source.title==='string'&&source.title.trim(),char+'来源名称');
      const url=https(source.url,char+'来源');assert.ok(domains.has(url.hostname),char+'需使用已审查的学术或字典出处');
      assert.ok(url.pathname!=='/',char+'来源必须直达具体资料');
    }
    for(const stage of ['oracle','bronze','seal'])assert.equal(typeof entry.attestedStages?.[stage],'boolean',char+'字形查证阶段');
    assert.ok(Array.isArray(entry.forms),char+'的字形数组');
    if(!entry.forms.length)assert.ok(/未|不|缺|暂|查|较晚|后起/.test(entry.evolutionNote+notes(entry.confidenceNotes)),char+'无古字图片时应说明资料边界');
  }
});

test('识字库：每张古字图片都有本地安全路径、实际阶段依据和公有领域来源，打包字节哈希一致',()=>{
  const manifest=readJson(resolve(root,'docs/Design Hanzi Library 4.26/form-sources.json'));
  const available=manifest.files.filter(item=>item.available),byPath=new Map(available.map(item=>[item.path,item]));
  const used=new Set();assert.ok(available.length>0,'需有真实古字形，不只显示今字');
  for(const entry of dataset().entries){
    const stages=new Set();
    for(const form of entry.forms){
      assert.ok(['oracle','bronze','seal'].includes(form.stage),entry.char+'阶段有效');
      assert.ok(!stages.has(form.stage),entry.char+'每阶段展示一张清楚例形');stages.add(form.stage);
      assert.match(form.src,/^forms\/[a-z0-9-]+\.svg$/,entry.char+'只加载本地古字形');
      const file=resolve(library,form.src);assert.ok(!relative(library,file).startsWith('..'+sep));assert.ok(existsSync(file),entry.char+'缺少图片');
      const path=relative(root,file).split(sep).join('/'),record=byPath.get(path);assert.ok(record,entry.char+'图片缺少来源清单');
      assert.equal(record.char,entry.char);assert.equal(record.stage,form.stage);assert.equal(record.sourceUrl,form.sourceUrl);
      assert.ok(form.label&&form.caption,entry.char+'需要阶段标签及例形说明');
      if(record.reference)assert.match(form.caption,/参考|相关|源字/,entry.char+'跨字参考不能伪装直接祖形');
      else assert.equal(entry.attestedStages[form.stage],true,entry.char+'图片阶段须已查证');
      used.add(path);
    }
  }
  for(const record of available){
    assert.match(record.path,/^app\/assets\/hanzi-library\/forms\/[a-z0-9-]+\.svg$/,'清单只能指向专用本地古字');
    assert.match(record.license,/^(?:Public domain|CC0(?: 1\.0)?)$/,'只纳入公有领域或CC0');
    const source=https(record.sourceUrl,'图片出处');assert.equal(source.hostname,'commons.wikimedia.org');assert.match(source.pathname,/^\/wiki\/File:/);
    const file=resolve(root,record.path),bytes=readFileSync(file);assert.equal(bytes.length,record.bytes,record.path+'字节数');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,record.path+'打包SVG校验');
    const svg=bytes.toString('utf8');assert.match(svg,/<svg[\s>]/i,record.path+'应为SVG');
    assert.doesNotMatch(svg,/<(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=/i,record.path+'不能含可执行或嵌入元素');
    assert.doesNotMatch(svg,/\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']+/i,record.path+'不得引用外部图片或文件');
    assert.doesNotMatch(svg,/@import|url\(\s*["']?\s*(?:https?:|\/\/|data:)/i,record.path+'不得引入外部样式');
  }
  assert.ok(used.size>0,'古字资源须被实际目录使用');
  const actual=readdirSync(resolve(library,'forms')).filter(name=>name.endsWith('.svg')).map(name=>'app/assets/hanzi-library/forms/'+name);
  for(const file of actual)assert.ok(byPath.has(file),file+'不能漏记来源和许可');
});
