package com.dsh.gamecenter;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Shared, explicitly started foreground microphone. PCM stays in RAM and is never logged. */
public final class GameAudio {
    public static final int PERMISSION_REQUEST=9304;
    private final Activity activity;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile boolean foreground,closed;
    private volatile int generation;
    private volatile AudioRecord recorder;
    private volatile String status="idle",mode="",error="",command="";
    private volatile float pitch,rms,confidence;
    private volatile long updated,commandAt,commandSerial;
    private volatile int frames;
    public GameAudio(Activity activity){this.activity=activity;}
    public void foreground(boolean value){foreground=value;if(!value)stopNow();}
    public void permissionResult(int requestCode,int[] grants){if(requestCode==PERMISSION_REQUEST){status=grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED?"ready":"denied";}}
    @JavascriptInterface public boolean available(){return !closed;}
    @JavascriptInterface public String status(){return status;}
    @JavascriptInterface public void start(final String requested){
        if(!"pitch".equals(requested)&&!"command".equals(requested))return;
        main.post(new Runnable(){public void run(){
            if(!foreground||closed)return;
            if(Build.VERSION.SDK_INT>=23&&activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){status="permission";activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},PERMISSION_REQUEST);return;}
            final int token;
            synchronized(GameAudio.this){
                // Consecutive levels share the live capture/model, not a new recorder each time.
                if(requested.equals(mode)&&("loading".equals(status)||"warming".equals(status)||"listening".equals(status)))return;
                stopNow();if(!foreground||closed)return;
                mode=requested;status="loading";error="";frames=0;updated=0;
                command="";commandAt=0;token=generation;
            }
            worker.execute(new Runnable(){public void run(){capture(requested,token);}});
        }});
    }
    @JavascriptInterface public void stop(){stopNow();}
    private synchronized void stopNow(){
        generation++;mode="";pitch=0;rms=0;confidence=0;status=closed?"closed":"idle";
        AudioRecord r=recorder;if(r!=null)try{r.stop();}catch(RuntimeException ignored){}
    }
    public void close(){closed=true;foreground=false;stopNow();worker.shutdown();}
    private void capture(String requested,int token){
        AudioRecord local=null;VoiceRecognizer recognizer=null;
        try{
            if(token!=generation||!foreground||closed)return;
            if("command".equals(requested))recognizer=new VoiceRecognizer(activity);
            if(token!=generation||!foreground||closed)return;
            final int rate=16000,min=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            if(min<=0)throw new IllegalStateException("microphone-unavailable");
            local=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,8192));
            if(local.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("microphone-unavailable");
            synchronized(this){if(token!=generation||!foreground||closed)return;recorder=local;local.startRecording();status="warming";}
            short[] pcm=new short[512];float[] frame=new float[1536],samples=new float[512];int filled=0,untilPitch=0;
            while(token==generation&&foreground&&!closed){
                int n=local.read(pcm,0,pcm.length);if(n<=0){if(token==generation)throw new IllegalStateException("microphone-read");break;}
                for(int i=0;i<n;i++)samples[i]=pcm[i]/32768f;
                if(n<frame.length){System.arraycopy(frame,n,frame,0,frame.length-n);System.arraycopy(samples,0,frame,frame.length-n,n);filled=Math.min(frame.length,filled+n);}
                untilPitch+=n;
                if(filled==frame.length&&untilPitch>=1024){
                    float[] p=VoicePitch.estimate(frame,frame.length,rate);
                    synchronized(this){
                        if(token!=generation||!foreground||closed)break;
                        pitch=p[0];rms=p[1];confidence=p[2];updated=SystemClock.elapsedRealtime();frames++;
                        // A live microphone frame, not AudioRecord.startRecording(), makes us ready.
                        if(frames>=3)status="listening";
                    }
                    untilPitch=0;
                }
                if(recognizer!=null){
                    String heard=recognizer.accept(samples,n);
                    synchronized(this){
                        if(token!=generation||!foreground||closed)break;
                        if(heard.length()>0&&"listening".equals(status)){command=heard;commandAt=SystemClock.elapsedRealtime();commandSerial++;}
                    }
                }
            }
        }catch(Throwable failure){synchronized(this){if(token==generation&&foreground&&!closed){error=failure instanceof SecurityException?"permission":"audio-unavailable:"+failure.getClass().getSimpleName();status="error";}}}
        finally{
            if(local!=null){try{local.stop();}catch(RuntimeException ignored){}local.release();}
            if(recorder==local)recorder=null;
            if(recognizer!=null)recognizer.close();
        }
    }
    @JavascriptInterface public synchronized String read(){
        try{return new JSONObject().put("status",status).put("mode",mode).put("error",error).put("pitch",pitch).put("rms",rms).put("confidence",confidence).put("ageMs",updated==0?999999:SystemClock.elapsedRealtime()-updated).put("command",command).put("commandAgeMs",commandAt==0?999999:SystemClock.elapsedRealtime()-commandAt).put("commandSerial",commandSerial).put("frames",frames).toString();}
        catch(Exception ignored){return "{\"status\":\"error\"}";}
    }
}
