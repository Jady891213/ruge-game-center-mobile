import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),candidate=process.env.JAVA_HOME||resolve(homedir(),'Library/Java/JavaVirtualMachines/openjdk-18.0.2.1/Contents/Home');
const bin=n=>existsSync(resolve(candidate,'bin',n))?resolve(candidate,'bin',n):n;
test('原生360方向：真实Java四象限/跨0、俯仰、无磁北、过期、后台注销及重新取样',t=>{
 if(spawnSync(bin('javac'),['-version']).status!==0){t.skip('JDK unavailable');return;}
 const temp=mkdtempSync(resolve(root,'TMP to delete-native-orientation-'));
 const files={
 'android/content/Context.java':'package android.content; public class Context {public static String SENSOR_SERVICE="sensor"; public Object getSystemService(String n){return new android.hardware.SensorManager();}}',
 'android/hardware/Sensor.java':'package android.hardware; public class Sensor {public static int TYPE_GAME_ROTATION_VECTOR=15,TYPE_ROTATION_VECTOR=11;public int getType(){return 15;}}',
 'android/hardware/SensorEvent.java':'package android.hardware; public class SensorEvent {public float[] values;public long timestamp; public SensorEvent(float[] v,long t){values=v;timestamp=t;}}',
 'android/hardware/SensorEventListener.java':'package android.hardware; public interface SensorEventListener {void onSensorChanged(SensorEvent e);void onAccuracyChanged(Sensor s,int a);}',
 'android/hardware/SensorManager.java':'package android.hardware;public class SensorManager {public static int SENSOR_DELAY_GAME=1,registered=0,unregistered=0;public Sensor getDefaultSensor(int t){return new Sensor();}public boolean registerListener(SensorEventListener l,Sensor s,int delay){registered++;return true;}public void unregisterListener(SensorEventListener l){unregistered++;}public static void getRotationMatrixFromVector(float[] m,float[] values){System.arraycopy(values,0,m,0,9);}}',
 'android/os/SystemClock.java':'package android.os;public class SystemClock {public static long now=1000;public static long elapsedRealtime(){return now;}}',
 'android/webkit/JavascriptInterface.java':'package android.webkit;public @interface JavascriptInterface {}',
 'com/dsh/gamecenter/GameOrientation.java':readFileSync(resolve(root,'app/src/com/dsh/gamecenter/GameOrientation.java'),'utf8'),
 'com/dsh/gamecenter/OrientationHarness.java':`package com.dsh.gamecenter;import android.hardware.*;import android.os.SystemClock;public class OrientationHarness {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static float[] matrix(double h,double e){double a=Math.toRadians(h),b=Math.toRadians(e);float[] m=new float[9];m[2]=(float)(-Math.sin(a)*Math.cos(b));m[5]=(float)(-Math.cos(a)*Math.cos(b));m[8]=(float)-Math.sin(b);return m;}
 public static void main(String[] args){GameOrientation g=new GameOrientation(new android.content.Context());check(g.sample().contains("\\\"available\\\":false"),"empty unavailable");g.foreground(true);
 for(int h:new int[]{0,90,180,270,359,1}){float[] m=matrix(h,25);g.onSensorChanged(new SensorEvent(m,++SystemClock.now*1000000));double[] p=GameOrientation.pointing(m);check(Math.abs(p[0]-h)<.0001,"heading quadrant");check(Math.abs(p[1]-25)<.0001,"elevation");check(g.sample().contains("\\\"available\\\":true"),"fresh");}
 SystemClock.now+=751;check(g.sample().contains("\\\"available\\\":false"),"751 stale");g.foreground(false);check(SensorManager.unregistered==1,"unregistered background");g.onSensorChanged(new SensorEvent(matrix(90,0),SystemClock.now*1000000));check(g.sample().contains("\\\"available\\\":false"),"background rejected");g.foreground(true);check(g.sample().contains("\\\"generation\\\":2"),"new generation");check(g.sample().contains("\\\"available\\\":false"),"requires new sample");g.onSensorChanged(new SensorEvent(matrix(20,90),++SystemClock.now*1000000));check(g.sample().contains("\\\"available\\\":false"),"vertical undefined heading");g.onSensorChanged(new SensorEvent(matrix(20,-35),++SystemClock.now*1000000));check(g.sample().contains("\\\"available\\\":true"),"pitch down works");g.onSensorChanged(new SensorEvent(new float[]{Float.NaN,0,0},++SystemClock.now*1000000));check(g.sample().contains("\\\"available\\\":false"),"NaN rejected");g.close();check(SensorManager.unregistered==2,"destroy closes");}
 }`};
 try{for(const [path,body]of Object.entries(files)){const dest=resolve(temp,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body);}let r=spawnSync(bin('javac'),['-encoding','UTF-8','-d',temp,...Object.keys(files).map(p=>resolve(temp,p))],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);r=spawnSync(bin('java'),['-cp',temp,'com.dsh.gamecenter.OrientationHarness'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}finally{rmSync(temp,{recursive:true,force:true});}
});
