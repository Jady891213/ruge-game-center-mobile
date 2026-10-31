package com.dsh.gamecenter;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.webkit.JavascriptInterface;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Short offline feedback. Only the foreground local WebView can reach this bridge. */
public final class GameFeedback {
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String,Integer> samples = new HashMap<String,Integer>();
    private final Set<Integer> loaded = new HashSet<Integer>();
    private final Set<Integer> streams = new HashSet<Integer>();
    private final Map<String,Long> lastEvents = new HashMap<String,Long>();
    private SoundPool pool;
    private Vibrator vibrator;
    private volatile boolean active, released, sound, vibration;
    private volatile float level;
    private volatile int generation;
    private long lastAt = -10000;
    private long lastPulseAt = -10000;
    private int lastPriority;
    private volatile int eventCount, soundCount, vibrationCount;
    private volatile String lastName = "";
    private volatile String hapticMode = "none";

    GameFeedback(Context context, SharedPreferences preferences) {
        prefs=preferences;
        sound=prefs.getBoolean("feedback-sound",true);
        vibration=prefs.getBoolean("feedback-vibration",true);
        float stored=prefs.getFloat("feedback-volume",.70f);
        level=Float.isNaN(stored)||Float.isInfinite(stored)?.70f:Math.max(0,Math.min(1,stored));
        try {
            if(Build.VERSION.SDK_INT>=31) {
                VibratorManager manager=(VibratorManager)context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if(manager!=null)vibrator=manager.getDefaultVibrator();
            } else vibrator=(Vibrator)context.getSystemService(Context.VIBRATOR_SERVICE);
        } catch(RuntimeException ignored) { }
        try {
            pool=new SoundPool.Builder().setMaxStreams(3).setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
            pool.setOnLoadCompleteListener(new SoundPool.OnLoadCompleteListener(){
                public void onLoadComplete(SoundPool p,int id,int status){if(status==0&&!released)loaded.add(id);}
            });
            String[] names={"tap","select","deselect","undo","drop","pour","jump","land","collect","hint","success","win","error"};
            for(String name:names) {
                int resource=context.getResources().getIdentifier("fx_"+name,"raw",context.getPackageName());
                if(resource!=0)samples.put(name,pool.load(context,resource,1));
            }
        } catch(RuntimeException ignored) { }
    }

    void foreground(boolean value) {active=value;if(!value)stopNow();}
    private boolean knownEvent(String name){return "|tap|select|deselect|undo|drop|pour|jump|land|collect|hint|success|win|error|".contains("|"+name+"|");}
    private int priority(String name) {return "win".equals(name)?5:"success".equals(name)?4:"error".equals(name)?3:("collect".equals(name)||"pour".equals(name)||"hint".equals(name))?2:1;}
    @JavascriptInterface public boolean configured(){return prefs.contains("feedback-sound")||prefs.contains("feedback-vibration");}
    @JavascriptInterface public boolean soundEnabled(){return sound;}
    @JavascriptInterface public boolean vibrationEnabled(){return vibration;}
    @JavascriptInterface public double volume(){return level;}
    @JavascriptInterface public void setVolume(double value){
        if(released||Double.isNaN(value)||Double.isInfinite(value))return;
        level=(float)Math.max(0,Math.min(1,value));prefs.edit().putFloat("feedback-volume",level).apply();
        handler.post(new Runnable(){public void run(){if(pool!=null&&!released)for(Integer stream:streams)try{pool.setVolume(stream,level,level);}catch(RuntimeException ignored){}}});
    }
    @JavascriptInterface public boolean hasVibrator(){try{return vibrator!=null&&vibrator.hasVibrator();}catch(RuntimeException e){return false;}}
    @JavascriptInterface public boolean amplitudeControl(){try{return Build.VERSION.SDK_INT>=26&&hasVibrator()&&vibrator.hasAmplitudeControl();}catch(RuntimeException e){return false;}}
    /** Bounded directional signals; shared preferences, lifecycle and queue cancellation still apply. */
    @JavascriptInterface public void pulse(final int strength, final int milliseconds) {
        if(!active||released||!vibration||strength<1||strength>255)return;
        final int token=generation;
        handler.post(new Runnable(){public void run(){
            if(!active||released||!vibration||token!=generation||!hasVibrator())return;
            long now=SystemClock.elapsedRealtime();if(now-lastPulseAt<90)return;lastPulseAt=now;
            int duration=Math.max(8,Math.min(35,milliseconds));
            try{
                if(Build.VERSION.SDK_INT>=26){vibrator.vibrate(VibrationEffect.createOneShot(duration,amplitudeControl()?strength:VibrationEffect.DEFAULT_AMPLITUDE));hapticMode=amplitudeControl()?"amplitude-pulse":"duration-pulse";}
                else {vibrator.vibrate(duration);hapticMode="legacy-pulse";}
                vibrationCount++;lastName="signal";
            }catch(RuntimeException ignored){}
        }});
    }
    @JavascriptInterface public void setSound(boolean value){sound=value;prefs.edit().putBoolean("feedback-sound",value).apply();if(!value)handler.post(new Runnable(){public void run(){stopSounds();}});}
    @JavascriptInterface public void setVibration(boolean value){vibration=value;prefs.edit().putBoolean("feedback-vibration",value).apply();if(!value)cancelVibration();}
    @JavascriptInterface public void emit(final String name) {
        if(!active||released||name==null||!knownEvent(name))return;
        final int token=generation;
        handler.post(new Runnable(){public void run(){
            if(!active||released||token!=generation)return;
            long now=SystemClock.elapsedRealtime(),gap="win".equals(name)?900:"error".equals(name)?220:"success".equals(name)?180:65;
            Long previous=lastEvents.get(name);int p=priority(name);
            if(previous!=null&&now-previous<gap||now-lastAt<55&&p<=lastPriority)return;
            lastEvents.put(name,now);lastAt=now;lastPriority=p;eventCount++;lastName=name;
            if(p>=3)stopSounds();
            boolean played=false,shaken=false;
            Integer id=samples.get(name);
            if(sound&&pool!=null&&id!=null&&loaded.contains(id)){
                try{final int stream=level>0?pool.play(id,level,level,p,0,1f):0;if(stream>0){streams.add(stream);soundCount++;played=true;handler.postDelayed(new Runnable(){public void run(){streams.remove(stream);}},750);}}catch(RuntimeException ignored){}
            }
            if(vibration&&hasVibrator()){
                try{
                    long[] timing;int[] amplitude;
                    if("win".equals(name)){timing=new long[]{0,35,50,45,65,60};amplitude=new int[]{0,180,0,210,0,230};}
                    else if("success".equals(name)){timing=new long[]{0,28,45,32};amplitude=new int[]{0,170,0,200};}
                    else if("error".equals(name)){timing=new long[]{0,45,50,35};amplitude=new int[]{0,180,0,150};}
                    else if("undo".equals(name)){timing=new long[]{0,10,35,10};amplitude=new int[]{0,100,0,100};}
                    else{timing=new long[]{0,p==2?18:12};amplitude=new int[]{0,p==2?125:95};}
                    if(Build.VERSION.SDK_INT>=30&&("win".equals(name)||"success".equals(name))&&vibrator.arePrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK)[0]){
                        VibrationEffect.Composition sequence=VibrationEffect.startComposition().addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK,.65f).addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK,.9f,70);
                        if("win".equals(name))sequence.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK,1f,90);
                        vibrator.vibrate(sequence.compose());hapticMode="composition";
                    }else if(Build.VERSION.SDK_INT>=29){vibrator.vibrate(VibrationEffect.createPredefined("win".equals(name)?VibrationEffect.EFFECT_HEAVY_CLICK:"error".equals(name)?VibrationEffect.EFFECT_DOUBLE_CLICK:p>=2?VibrationEffect.EFFECT_CLICK:VibrationEffect.EFFECT_TICK));hapticMode="predefined";}
                    else if(Build.VERSION.SDK_INT>=26){if(!vibrator.hasAmplitudeControl())for(int i=0;i<amplitude.length;i++)if(amplitude[i]>0)amplitude[i]=VibrationEffect.DEFAULT_AMPLITUDE;vibrator.vibrate(VibrationEffect.createWaveform(timing,amplitude,-1));hapticMode="waveform";}
                    else{vibrator.vibrate(timing,-1);hapticMode="legacy";}
                    vibrationCount++;shaken=true;
                }catch(RuntimeException ignored){}
            }
            if(BuildConfig.DEV)android.util.Log.d("RugeFX",name+" sound="+played+" vibration="+shaken);
        }});
    }
    private void stopSounds(){if(pool!=null)for(Integer stream:streams){try{pool.stop(stream);}catch(RuntimeException ignored){}}streams.clear();}
    private void cancelOutputs(){stopSounds();try{if(vibrator!=null)vibrator.cancel();}catch(RuntimeException ignored){}}
    private void stopNow(){generation++;cancelOutputs();}
    @JavascriptInterface public void stop(){generation++;handler.post(new Runnable(){public void run(){cancelOutputs();}});}
    @JavascriptInterface public void cancelVibration(){handler.post(new Runnable(){public void run(){try{if(vibrator!=null)vibrator.cancel();}catch(RuntimeException ignored){}}});}
    @JavascriptInterface public String status(){
        if(!BuildConfig.DEV)return "{}";
        return "{\"active\":"+active+",\"sound\":"+sound+",\"vibration\":"+vibration+",\"vibrator\":"+hasVibrator()+",\"amplitudeControl\":"+amplitudeControl()+",\"events\":"+eventCount+",\"sounds\":"+soundCount+",\"haptics\":"+vibrationCount+",\"last\":\""+lastName+"\",\"hapticMode\":\""+hapticMode+"\",\"loaded\":"+loaded.size()+"}";
    }
    void release(){active=false;released=true;stopNow();handler.removeCallbacksAndMessages(null);if(pool!=null){pool.release();pool=null;}loaded.clear();}
}
