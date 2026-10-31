"""Run the real GameMusic against controllable Android state/Looper stubs, no device."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
import build

FILES={
'android/webkit/JavascriptInterface.java': 'package android.webkit; public @interface JavascriptInterface {}',
'android/os/Build.java': 'package android.os; public class Build {public static class VERSION {public static int SDK_INT=35;}}',
'android/os/Looper.java': '''package android.os;
public class Looper {public static final Looper MAIN=new Looper();public static boolean inMain=true;
public static Looper getMainLooper(){return MAIN;}public static Looper myLooper(){return inMain?MAIN:null;}
public static void check(){if(!inMain)throw new AssertionError("MediaPlayer/AudioManager touched off main Looper");}}
''',
'android/os/Handler.java': '''package android.os;import java.util.*;
public class Handler {public static final List<Runnable> q=new ArrayList<Runnable>();public Handler(Looper l){}
public boolean post(Runnable r){q.add(r);return true;}public void removeCallbacksAndMessages(Object o){q.clear();}
public static void drain(){Looper.inMain=true;int n=0;while(!q.isEmpty()){if(n++>100)throw new AssertionError("loop");q.remove(0).run();}}
}
''',
'android/content/SharedPreferences.java': '''package android.content;import java.util.*;
public class SharedPreferences {public final Map<String,Object> m=new HashMap<String,Object>();
public boolean getBoolean(String k,boolean d){Object v=m.get(k);return v instanceof Boolean?(Boolean)v:d;}public boolean contains(String k){return m.containsKey(k);}
public float getFloat(String k,float d){Object v=m.get(k);return v instanceof Number?((Number)v).floatValue():d;}
public Editor edit(){return new Editor();}public class Editor {
public Editor putBoolean(String k,boolean v){m.put(k,v);return this;}public Editor putFloat(String k,float v){m.put(k,v);return this;}public void apply(){}}
}
''',
'android/content/Context.java': '''package android.content;import android.content.res.*;import android.media.*;
public class Context {public static final String AUDIO_SERVICE="audio",VIBRATOR_SERVICE="vibrator",VIBRATOR_MANAGER_SERVICE="vibrator-manager";public final AudioManager audio=new AudioManager();public final AssetManager assets=new AssetManager();
public Context getApplicationContext(){return this;}public Object getSystemService(String s){return AUDIO_SERVICE.equals(s)?audio:VIBRATOR_SERVICE.equals(s)?new android.os.Vibrator():new android.os.VibratorManager();}public AssetManager getAssets(){return assets;}public Resources getResources(){return new Resources();}public String getPackageName(){return "test";}}
''',
'android/content/res/Resources.java': 'package android.content.res;public class Resources {static int id;public int getIdentifier(String n,String t,String p){return ++id;}}',
'android/content/res/AssetManager.java': '''package android.content.res;import java.io.*;import java.util.*;
public class AssetManager {public final List<String> paths=new ArrayList<String>();public AssetFileDescriptor openFd(String p)throws IOException{paths.add(p);return new AssetFileDescriptor();}}
''',
'android/content/res/AssetFileDescriptor.java': '''package android.content.res;import java.io.*;
public class AssetFileDescriptor implements AutoCloseable {public static int closed;public FileDescriptor getFileDescriptor(){return new FileDescriptor();}public long getStartOffset(){return 0;}public long getLength(){return 100;}public void close()throws IOException{closed++;}}
''',
'android/media/AudioAttributes.java': '''package android.media;public class AudioAttributes {
public static final int USAGE_GAME=14,CONTENT_TYPE_MUSIC=2,CONTENT_TYPE_SONIFICATION=4;
public static class Builder {public Builder setUsage(int v){return this;}public Builder setContentType(int v){return this;}public AudioAttributes build(){return new AudioAttributes();}}}
''',
'android/media/AudioFocusRequest.java': '''package android.media;import android.os.Handler;
public class AudioFocusRequest {public AudioManager.OnAudioFocusChangeListener listener;
public static class Builder {AudioFocusRequest request=new AudioFocusRequest();public Builder(int v){}public Builder setAudioAttributes(AudioAttributes a){return this;}public Builder setWillPauseWhenDucked(boolean b){return this;}public Builder setOnAudioFocusChangeListener(AudioManager.OnAudioFocusChangeListener l,Handler h){request.listener=l;return this;}public AudioFocusRequest build(){return request;}}}
''',
'android/media/AudioManager.java': '''package android.media;import android.os.Looper;
public class AudioManager {public static final int AUDIOFOCUS_GAIN=1,AUDIOFOCUS_LOSS=-1,AUDIOFOCUS_LOSS_TRANSIENT=-2,AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK=-3,AUDIOFOCUS_REQUEST_GRANTED=1,AUDIOFOCUS_REQUEST_FAILED=0,STREAM_MUSIC=3;
public interface OnAudioFocusChangeListener {void onAudioFocusChange(int c);}public OnAudioFocusChangeListener listener;public boolean grant=true,modern;public int abandons;
public int requestAudioFocus(AudioFocusRequest r){Looper.check();modern=true;listener=r.listener;return grant?1:0;}
public int requestAudioFocus(OnAudioFocusChangeListener l,int stream,int gain){Looper.check();modern=false;listener=l;return grant?1:0;}
public int abandonAudioFocusRequest(AudioFocusRequest r){Looper.check();abandons++;return 1;}public int abandonAudioFocus(OnAudioFocusChangeListener l){Looper.check();abandons++;return 1;}
public void fire(int v){Looper.inMain=true;if(listener!=null)listener.onAudioFocusChange(v);}}
''',
'android/media/MediaPlayer.java': '''package android.media;import android.os.Looper;import java.io.*;import java.util.*;
public class MediaPlayer {public interface OnPreparedListener{void onPrepared(MediaPlayer p);}public interface OnErrorListener{boolean onError(MediaPlayer p,int a,int b);}
public static final List<MediaPlayer> all=new ArrayList<MediaPlayer>();public static int totalStarts;
public boolean released,ready,initialized,loop,started;public float left,right;public OnPreparedListener callback;public OnErrorListener error;
public MediaPlayer(){Looper.check();all.add(this);}void valid(){Looper.check();if(released)throw new AssertionError("released player used");}
public void setAudioAttributes(AudioAttributes a){valid();}public void setOnPreparedListener(OnPreparedListener l){valid();callback=l;}public void setOnErrorListener(OnErrorListener l){valid();error=l;}
public void setDataSource(FileDescriptor f,long o,long len)throws IOException{valid();initialized=true;}public void prepareAsync(){valid();if(!initialized)throw new AssertionError("prepare before source");}
public void setLooping(boolean v){valid();if(!ready)throw new AssertionError("loop during Preparing");loop=v;}
public void setVolume(float l,float r){valid();if(!ready)throw new AssertionError("volume during Preparing");left=l;right=r;}
public void start(){valid();if(!ready)throw new AssertionError("start during Preparing");started=true;totalStarts++;}
public void release(){valid();released=true;started=false;}
// Intentionally deliver callbacks even after release, as a queued stale callback can do.
public void finish(){Looper.inMain=true;ready=true;callback.onPrepared(this);}public static MediaPlayer last(){return all.get(all.size()-1);}}
''',
'com/dsh/gamecenter/BuildConfig.java': 'package com.dsh.gamecenter; public class BuildConfig {public static boolean DEV=true;}',
'android/os/SystemClock.java': 'package android.os;public class SystemClock {public static long now=1000;public static long elapsedRealtime(){return now;}}',
'android/os/Vibrator.java': '''package android.os;public class Vibrator {public static int buzz;public boolean hasVibrator(){return true;}public boolean hasAmplitudeControl(){return true;}public boolean[] arePrimitivesSupported(int... a){return new boolean[]{true};}public void vibrate(VibrationEffect e){buzz++;}public void vibrate(long n){buzz++;}public void vibrate(long[] n,int r){buzz++;}public void cancel(){}}''',
'android/os/VibratorManager.java': 'package android.os;public class VibratorManager {public Vibrator getDefaultVibrator(){return new Vibrator();}}',
'android/os/VibrationEffect.java': '''package android.os;public class VibrationEffect {
public static final int DEFAULT_AMPLITUDE=-1,EFFECT_HEAVY_CLICK=5,EFFECT_DOUBLE_CLICK=2,EFFECT_CLICK=0,EFFECT_TICK=2;
public static VibrationEffect createOneShot(long n,int a){return new VibrationEffect();}public static VibrationEffect createPredefined(int a){return new VibrationEffect();}public static VibrationEffect createWaveform(long[] t,int[] a,int r){return new VibrationEffect();}public static Composition startComposition(){return new Composition();}
public static class Composition {public static final int PRIMITIVE_CLICK=1;public Composition addPrimitive(int a,float b){return this;}public Composition addPrimitive(int a,float b,int c){return this;}public VibrationEffect compose(){return new VibrationEffect();}}}''',
'android/util/Log.java': 'package android.util;public class Log {public static int d(String a,String b){return 0;}}',
'android/media/SoundPool.java': '''package android.media;public class SoundPool {
public static SoundPool last;public int plays;public float left,right;public interface OnLoadCompleteListener{void onLoadComplete(SoundPool p,int id,int status);}OnLoadCompleteListener listener;
public static class Builder {public Builder setMaxStreams(int a){return this;}public Builder setAudioAttributes(AudioAttributes a){return this;}public SoundPool build(){last=new SoundPool();return last;}}
public void setOnLoadCompleteListener(OnLoadCompleteListener l){listener=l;}public int load(android.content.Context c,int id,int p){listener.onLoadComplete(this,id,0);return id;}public int play(int id,float l,float r,int p,int loop,float rate){plays++;left=l;right=r;return plays;}public void setVolume(int id,float l,float r){left=l;right=r;}public void stop(int id){}public void release(){}}
''',
'com/dsh/gamecenter/MusicHarness.java': '''package com.dsh.gamecenter;
import android.os.*;import android.content.*;import android.content.res.*;import android.media.*;
public class MusicHarness {
static void ok(boolean value,String message){if(!value)throw new AssertionError(message);}static void near(double v,double expected){ok(Math.abs(v-expected)<.00001,"volume "+v+" != "+expected);}
static void js(){Looper.inMain=false;}static void flush(){Handler.drain();}static int count(){return MediaPlayer.all.size();}
public static void main(String[] args){
 Context context=new Context();SharedPreferences prefs=new SharedPreferences();prefs.edit().putBoolean("feedback-sound",false).putBoolean("feedback-vibration",true).apply();
 GameMusic music=new GameMusic(context,prefs);ok(music.isEnabled(),"default enabled");near(music.volume(),.22);
 js();music.play();music.setTrack("../secret");music.setTrack("https://evil.invalid/a.ogg");music.setTrack(null);flush();ok(count()==0,"path allowlist");
 js();music.setTrack("meadow");music.play();flush();ok(count()==0,"background play denied");music.foreground(true);flush();ok(count()==0,"foreground cannot revive background request");
 js();music.play();flush();MediaPlayer first=MediaPlayer.last();ok(!first.started,"asynchronous prepare only");first.finish();ok(first.started&&first.loop,"prepared loop starts");near(first.left,.22);ok(context.audio.modern,"API26+ focus API");ok(AssetFileDescriptor.closed==1,"asset descriptor closed");
 int starts=MediaPlayer.totalStarts;js();music.setVolume(.08);flush();near(first.left,.08);ok(MediaPlayer.totalStarts==starts,"volume doesn't restart");js();music.setVolume(Double.NaN);music.setVolume(Double.POSITIVE_INFINITY);flush();near(music.volume(),.08);
 js();music.setVolume(5);flush();near(music.volume(),1);js();music.setVolume(-2);flush();near(music.volume(),0);ok(first.released,"zero stops player");music.foreground(false);music.foreground(true);flush();ok(count()==1,"foreground can't revive muted/paused page");
 js();music.setVolume(.13);music.play();flush();MediaPlayer cancelled=MediaPlayer.last();js();music.pause();cancelled.finish();flush();ok(!cancelled.started&&cancelled.released,"pause immediately invalidates late preparation");
 js();music.play();flush();MediaPlayer stale=MediaPlayer.last();js();music.setTrack("orchard");stale.finish();flush();ok(!stale.started&&stale.released,"selection invalidates stale preparation");
 js();music.play();flush();MediaPlayer orchard=MediaPlayer.last();orchard.finish();ok(orchard.started,"new selection plays");ok(context.assets.paths.get(context.assets.paths.size()-1).equals("shared/music/orchard.ogg"),"local-only asset path");
 js();music.setSuppressed(true);flush();ok(orchard.released,"suppression disposes");int before=count();js();music.setSuppressed(false);flush();ok(count()==before+1,"suppression can restore existing requested play");MediaPlayer.last().finish();
 music.foreground(false);before=count();music.foreground(true);flush();ok(count()==before,"foreground alone never auto resumes");
 js();music.play();flush();MediaPlayer focus=MediaPlayer.last();focus.finish();context.audio.fire(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK);flush();ok(focus.released,"focus loss stops rather than fighting recorder");before=count();context.audio.fire(AudioManager.AUDIOFOCUS_GAIN);flush();ok(count()==before,"focus gain not auto resume");
 context.audio.grant=false;js();music.play();flush();MediaPlayer denied=MediaPlayer.last();denied.finish();ok(denied.released&&!denied.started,"no focus no playback");context.audio.grant=true;
 js();music.setEnabled(false);music.play();flush();before=count();music.foreground(true);flush();ok(count()==before&&!music.isEnabled(),"disabled never revived");near(music.volume(),.13);ok(!prefs.getBoolean("feedback-sound",true)&&prefs.getBoolean("feedback-vibration",false),"independent effects and haptics prefs");
 GameMusic restored=new GameMusic(context,prefs);ok(!restored.isEnabled(),"enabled persisted");near(restored.volume(),.13);restored.release();
 js();music.setEnabled(true);music.play();flush();MediaPlayer dying=MediaPlayer.last();js();music.release();dying.finish();flush();ok(!dying.started&&dying.released,"destroy rejects late prepare");before=count();js();music.play();music.setTrack("paper");music.setEnabled(false);music.setVolume(.9);flush();ok(count()==before,"released bridge inert");
 BuildConfig.DEV=false;ok(music.status().equals("{}"),"production status redacted");BuildConfig.DEV=true;
 Build.VERSION.SDK_INT=21;Context legacyContext=new Context();GameMusic legacy=new GameMusic(legacyContext,new SharedPreferences());legacy.foreground(true);js();legacy.setTrack("cloud");legacy.play();flush();MediaPlayer.last().finish();ok(!legacyContext.audio.modern,"API21 legacy focus path");legacy.release();
 for(MediaPlayer p:MediaPlayer.all)ok(p.released,"all player instances released");
 Build.VERSION.SDK_INT=35;Looper.inMain=true;SharedPreferences fxPrefs=new SharedPreferences();GameFeedback fx=new GameFeedback(new Context(),fxPrefs);near(fx.volume(),.70);fx.foreground(true);js();fx.setVolume(.35);fx.emit("collect");flush();SoundPool pool=SoundPool.last;ok(pool.plays==1,"actual SoundPool event emitted");near(pool.left,.35);ok(fx.soundEnabled()&&fx.vibrationEnabled(),"volume doesn't change FX toggles");
 js();fx.setVolume(.12);flush();near(pool.left,.12);int played=pool.plays,buzz=Vibrator.buzz;js();fx.setVolume(0);fx.emit("success");flush();ok(pool.plays==played&&Vibrator.buzz>buzz,"zero FX gain still permits vibration");
 js();fx.setSound(false);fx.setVolume(.27);fx.setVolume(Double.NaN);flush();near(fx.volume(),.27);ok(!fx.soundEnabled()&&fx.vibrationEnabled(),"FX volume independent of enabled and vibration");GameFeedback restoredFx=new GameFeedback(new Context(),fxPrefs);near(restoredFx.volume(),.27);ok(!restoredFx.soundEnabled(),"FX prefs restored");fx.release();restoredFx.release();
 System.out.println("actual GameMusic + GameFeedback Java: preferences, gain, allowlist, Looper ownership, stale prepare, focus, lifecycle and release passed");
}}
'''
}

def main():
    temp=Path(tempfile.mkdtemp(prefix='TMP to delete-music-native-',dir=ROOT))
    try:
        files=dict(FILES)
        files['com/dsh/gamecenter/GameMusic.java']=(ROOT/'app/src/com/dsh/gamecenter/GameMusic.java').read_text()
        files['com/dsh/gamecenter/GameFeedback.java']=(ROOT/'app/src/com/dsh/gamecenter/GameFeedback.java').read_text()
        files['android/os/Handler.java']=files['android/os/Handler.java'].replace('public boolean post(Runnable r)', 'public boolean postDelayed(Runnable r,long t){return true;}public boolean post(Runnable r)')
        for name,body in files.items():
            path=temp/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(body)
        jdk=build.java_default()
        result=subprocess.run([str(jdk/'bin/javac'),'-encoding','UTF-8','-d',str(temp),*[str(temp/n) for n in files]],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
        result=subprocess.run([str(jdk/'bin/java'),'-cp',str(temp),'com.dsh.gamecenter.MusicHarness'],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
        print(result.stdout)
    finally:shutil.rmtree(temp)

if __name__=='__main__':main()
