"""Execute the real GameAudio queued-start lifecycle and real bounded event buffer."""
import subprocess,sys,tempfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'));import build
TMP=Path(tempfile.mkdtemp(prefix='TMP to delete-command-native-',dir=ROOT))
try:
 stubs={
 'android/Manifest.java':'package android;public class Manifest{public static class permission{public static String RECORD_AUDIO="record";}}',
 'android/app/Activity.java':'package android.app;public class Activity{public int checkSelfPermission(String s){return 0;}public void requestPermissions(String[]s,int c){}}',
 'android/content/pm/PackageManager.java':'package android.content.pm;public class PackageManager{public static final int PERMISSION_GRANTED=0;}',
 'android/media/AudioFormat.java':'package android.media;public class AudioFormat{public static final int CHANNEL_IN_MONO=1,ENCODING_PCM_16BIT=2;}',
 'android/media/MediaRecorder.java':'package android.media;public class MediaRecorder{public static class AudioSource{public static final int VOICE_RECOGNITION=6;}}',
 'android/media/AudioRecord.java':'''package android.media;public class AudioRecord{public static final int STATE_INITIALIZED=1;public static volatile int starts;public static java.util.concurrent.CountDownLatch started=new java.util.concurrent.CountDownLatch(1);public AudioRecord(int s,int r,int c,int e,int b){}public static int getMinBufferSize(int r,int c,int e){return 4096;}public int getState(){return 1;}public void startRecording(){starts++;started.countDown();}public int read(short[]b,int o,int n){java.util.Arrays.fill(b,o,o+n,(short)1000);return n;}public void stop(){}public void release(){}}''',
 'android/os/Build.java':'package android.os;public class Build{public static class VERSION{public static int SDK_INT=35;}}',
 'android/os/Looper.java':'package android.os;public class Looper{public static Looper getMainLooper(){return new Looper();}}',
 'android/os/Handler.java':'package android.os;public class Handler{static java.util.ArrayDeque<Runnable>q=new java.util.ArrayDeque<Runnable>();public Handler(Looper l){}public boolean post(Runnable r){q.add(r);return true;}public static void drain(){while(!q.isEmpty())q.removeFirst().run();}}',
 'android/os/SystemClock.java':'package android.os;public class SystemClock{public static long elapsedRealtime(){return System.nanoTime()/1000000;}}',
 'android/webkit/JavascriptInterface.java':'package android.webkit;public @interface JavascriptInterface{}',
 'org/json/JSONObject.java':'package org.json;public class JSONObject{public JSONObject put(String k,Object v){return this;}public String toString(){return "{}";}}',
 'org/json/JSONArray.java':'package org.json;public class JSONArray{public JSONArray put(Object o){return this;}}',
 'com/dsh/gamecenter/VoiceRecognizer.java':'package com.dsh.gamecenter;final class VoiceRecognizer{VoiceRecognizer(android.app.Activity a){}String[]accept(float[]s,int n){return new String[0];}void close(){}}',
 'com/dsh/gamecenter/CommandHarness.java':'''package com.dsh.gamecenter;public class CommandHarness{
static void check(boolean b){if(!b)throw new AssertionError();}
public static void main(String[]args)throws Exception{
 VoiceCommandBuffer b=new VoiceCommandBuffer();for(int i=1;i<=4;i++)b.add("forward",i*100,i);VoiceCommandBuffer.Entry[]e=b.snapshot(500);check(e.length==4);for(int i=0;i<4;i++)check(e[i].serial==i+1&&e[i].command.equals("forward"));
 b.add("__ignore__",501,5);check(b.snapshot(501).length==4);b.add("向左转",502,6);check(b.snapshot(502).length==4);b.clear();check(b.snapshot(503).length==0);
 for(int i=0;i<30;i++)b.add("left",1000+i,i);check(b.snapshot(1100).length==16&&b.snapshot(1100)[0].serial==14);check(b.snapshot(2300).length==0);
 GameAudio a=new GameAudio(new android.app.Activity());try{a.foreground(true);a.start("command");a.stop();android.os.Handler.drain();check(android.media.AudioRecord.starts==0);a.start("command");a.foreground(false);android.os.Handler.drain();check(android.media.AudioRecord.starts==0);a.foreground(true);a.start("command");android.os.Handler.drain();check(android.media.AudioRecord.started.await(2,java.util.concurrent.TimeUnit.SECONDS));a.start("command");android.os.Handler.drain();check(android.media.AudioRecord.starts==1);}finally{a.close();}
 System.out.print("real GameAudio queued cancellation, same-mode reuse and real event queue passed");
}}
'''}
 files=[]
 for name,text in stubs.items():p=TMP/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);files.append(str(p))
 files.extend(str(ROOT/'app/src/com/dsh/gamecenter'/n)for n in['GameAudio.java','VoicePitch.java','VoiceCommandBuffer.java'])
 jdk=build.java_default();r=subprocess.run([str(jdk/'bin/javac'),'-encoding','UTF-8','-d',str(TMP/'classes'),*files],text=True,capture_output=True);assert r.returncode==0,r.stderr
 r=subprocess.run([str(jdk/'bin/java'),'-cp',str(TMP/'classes'),'com.dsh.gamecenter.CommandHarness'],text=True,capture_output=True,timeout=8);assert r.returncode==0,r.stderr;print(r.stdout)
finally:shutil.rmtree(TMP)
