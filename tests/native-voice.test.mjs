import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),candidate=process.env.JAVA_HOME||resolve(homedir(),'Library/Java/JavaVirtualMachines/openjdk-18.0.2.1/Contents/Home'),javac=existsSync(resolve(candidate,'bin/javac'))?resolve(candidate,'bin/javac'):'javac',java=existsSync(resolve(candidate,'bin/java'))?resolve(candidate,'bin/java'):'java';
test('真实Java音高DSP识别儿童与成人相对音高，并拒绝静音/微弱音量/随机噪声',t=>{const check=spawnSync(javac,['-version'],{encoding:'utf8'});if(check.error){t.skip('JDK is not installed');return;}const temp=mkdtempSync(resolve(root,'TMP to delete-native-voice-'));try{writeFileSync(resolve(temp,'VoicePitchCheck.java'),`import com.dsh.gamecenter.VoicePitch;
public class VoicePitchCheck {
 public static void main(String[] args){
  for(int hz:new int[]{90,120,240,420,650,800}){float[] pcm=new float[1536];for(int i=0;i<pcm.length;i++)pcm[i]=(float)(.1*Math.sin(2*Math.PI*hz*i/16000));float[] result=VoicePitch.estimate(pcm,pcm.length,16000);if(Math.abs(result[0]-hz)/hz>.03||result[2]<.8)throw new AssertionError("pitch "+hz+" -> "+result[0]);}
  float[] silent=new float[1536];if(VoicePitch.estimate(silent,silent.length,16000)[0]!=0)throw new AssertionError("silence");
  float[] quiet=new float[1536];for(int i=0;i<quiet.length;i++)quiet[i]=(float)(.002*Math.sin(2*Math.PI*300*i/16000));if(VoicePitch.estimate(quiet,quiet.length,16000)[0]!=0)throw new AssertionError("quiet");
  java.util.Random rng=new java.util.Random(19);float[] noise=new float[1536];for(int i=0;i<noise.length;i++)noise[i]=(rng.nextFloat()-.5f)*.2f;if(VoicePitch.estimate(noise,noise.length,16000)[0]!=0)throw new AssertionError("noise");
 }
}`);let result=spawnSync(javac,['-encoding','UTF-8','-d',temp,resolve(root,'app/src/com/dsh/gamecenter/VoicePitch.java'),resolve(temp,'VoicePitchCheck.java')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);result=spawnSync(java,['-cp',temp,'VoicePitchCheck'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}finally{rmSync(temp,{recursive:true,force:true});}});
