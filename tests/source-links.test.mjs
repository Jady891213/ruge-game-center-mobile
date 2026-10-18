import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),candidate=process.env.JAVA_HOME||resolve(homedir(),'Library/Java/JavaVirtualMachines/openjdk-18.0.2.1/Contents/Home');
const bin=n=>existsSync(resolve(candidate,'bin',n))?resolve(candidate,'bin',n):n;
test('出处外链：真实Java只接受指定学术字典的HTTPS路径，拒绝文件/脚本/伪域与凭证',t=>{
 if(spawnSync(bin('javac'),['-version']).status!==0){t.skip('JDK unavailable');return;}
 const temp=mkdtempSync(resolve(root,'TMP to delete-source-links-'));
 const allowed=['https://humanum.arts.cuhk.edu.hk/Lexis/lexi-mf/search.php?word=%E6%97%A5','https://www.zdic.net/hans/日','https://zdic.net/hans/%E5%80%91','https://commons.wikimedia.org/wiki/File:%E6%97%A5-oracle.svg','https://dict.variants.moe.edu.tw/dictView.jsp?educode=A00183'];
 const denied=[null,'','javascript:alert(1)','file:///android_asset/index.html','https://commons.wikimedia.org.evil.test/wiki/X','https://evil.test/?next=https://www.zdic.net/hans/日','http://www.zdic.net/hans/日','https://www.zdic.net:444/hans/日','https://evil@www.zdic.net/hans/日','https://www.zdic.net/a/../hans/日','https://www.zdic.net/%2e%2e/hans/日','https://www.zdic.net/not-a-dictionary','https://humanum.arts.cuhk.edu.hk/not-approved','https://www.zdic.net/hans/日\n','https://www.zdic.net/hans/'+Array(1700).fill('a').join('')];
 const literal=v=>v===null?'null':JSON.stringify(v);
 const body='package com.dsh.gamecenter;public class SourceHarness{public static void main(String[]a){'+allowed.map(u=>'if(!SourceLinks.allowed('+literal(u)+'))throw new AssertionError("valid source");').join('')+denied.map(u=>'if(SourceLinks.allowed('+literal(u)+'))throw new AssertionError("unsafe source");').join('')+'}}';
 try{const dir=resolve(temp,'com/dsh/gamecenter');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'SourceLinks.java'),readFileSync(resolve(root,'app/src/com/dsh/gamecenter/SourceLinks.java')));writeFileSync(resolve(dir,'SourceHarness.java'),body);let r=spawnSync(bin('javac'),['-encoding','UTF-8','-d',temp,resolve(dir,'SourceLinks.java'),resolve(dir,'SourceHarness.java')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);r=spawnSync(bin('java'),['-cp',temp,'com.dsh.gamecenter.SourceHarness'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}finally{rmSync(temp,{recursive:true,force:true});}
});
