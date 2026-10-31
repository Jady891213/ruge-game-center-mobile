package com.dsh.gamecenter;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

/** One foreground-only local soundtrack. MediaPlayer is owned exclusively by the main Looper. */
public final class GameMusic {
    private final Context context;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AtomicInteger epoch = new AtomicInteger();
    private final AudioManager audio;
    private final AudioAttributes attributes = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
    private MediaPlayer player;
    private AudioFocusRequest focusRequest;
    private boolean focused, prepared;
    private volatile boolean active, released, suppressed, wanted, playing, enabled;
    private volatile float level;
    private volatile String track = "";
    private String playerTrack = "";
    private volatile int starts, failures;

    private final AudioManager.OnAudioFocusChangeListener focusListener = new AudioManager.OnAudioFocusChangeListener() {
        public void onAudioFocusChange(final int change) {
            // Do not revive audio when a call, recorder or another app gives focus back.
            if(change!=AudioManager.AUDIOFOCUS_GAIN) {
                wanted=false;epoch.incrementAndGet();
                main(new Runnable(){public void run(){disposePlayer();}});
            }
        }
    };

    GameMusic(Context owner, SharedPreferences preferences) {
        context=owner.getApplicationContext();prefs=preferences;
        enabled=prefs.getBoolean("music-enabled",true);
        level=clamp(prefs.getFloat("music-volume",.22f),.22f);
        audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
    }

    private static float clamp(double value,float fallback) {
        return Double.isNaN(value)||Double.isInfinite(value)?fallback:(float)Math.max(0,Math.min(1,value));
    }
    private static boolean allowed(String id) {
        return "meadow".equals(id)||"orchard".equals(id)||"paper".equals(id)||"cloud".equals(id)||"starlight".equals(id);
    }
    private void main(Runnable action) {
        if(Looper.myLooper()==Looper.getMainLooper())action.run();else handler.post(action);
    }
    private boolean eligible() {return !released&&active&&!suppressed&&wanted&&enabled&&level>0&&allowed(track);}

    @JavascriptInterface public boolean isEnabled(){return enabled;}
    @JavascriptInterface public double volume(){return level;}
    @JavascriptInterface public void setEnabled(boolean value) {
        if(released)return;
        enabled=value;prefs.edit().putBoolean("music-enabled",value).apply();
        if(!value){wanted=false;epoch.incrementAndGet();}
        main(new Runnable(){public void run(){sync();}});
    }
    @JavascriptInterface public void setVolume(double value) {
        if(released||Double.isNaN(value)||Double.isInfinite(value))return;
        level=clamp(value,.22f);prefs.edit().putFloat("music-volume",level).apply();
        if(level==0)epoch.incrementAndGet();
        main(new Runnable(){public void run(){sync();}});
    }
    @JavascriptInterface public void setTrack(final String id) {
        if(released||!allowed(id))return;
        // A new selection needs a fresh play() request. Invalid IDs never become file paths.
        if(id.equals(track))return;
        track=id;wanted=false;epoch.incrementAndGet();
        main(new Runnable(){public void run(){disposePlayer();}});
    }
    @JavascriptInterface public void play() {
        if(released||!active||!enabled||!allowed(track))return;
        wanted=true;
        main(new Runnable(){public void run(){sync();}});
    }
    @JavascriptInterface public void pause() {
        wanted=false;epoch.incrementAndGet();
        main(new Runnable(){public void run(){disposePlayer();}});
    }
    @JavascriptInterface public void stop() {
        wanted=false;track="";epoch.incrementAndGet();
        main(new Runnable(){public void run(){disposePlayer();}});
    }
    @JavascriptInterface public void setSuppressed(boolean value) {
        if(released)return;
        suppressed=value;
        if(value)epoch.incrementAndGet();
        main(new Runnable(){public void run(){sync();}});
    }
    void foreground(boolean value) {
        if(released)return;
        active=value;
        if(!value){wanted=false;epoch.incrementAndGet();main(new Runnable(){public void run(){disposePlayer();}});}
        // Foreground alone must never resurrect an exited or paused page.
    }

    private boolean requestFocus() {
        if(focused)return true;
        if(audio==null)return false;
        try {
            int result;
            if(Build.VERSION.SDK_INT>=26) {
                focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
                    .setWillPauseWhenDucked(true).setOnAudioFocusChangeListener(focusListener,handler).build();
                result=audio.requestAudioFocus(focusRequest);
            } else result=audio.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN);
            focused=result==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch(RuntimeException ignored){focused=false;}
        return focused;
    }
    private void abandonFocus() {
        if(audio!=null&&focused)try {
            if(Build.VERSION.SDK_INT>=26&&focusRequest!=null)audio.abandonAudioFocusRequest(focusRequest);
            else audio.abandonAudioFocus(focusListener);
        } catch(RuntimeException ignored) { }
        focused=false;focusRequest=null;
    }
    private void sync() {
        if(!eligible()){disposePlayer();return;}
        if(player!=null&&!track.equals(playerTrack))disposePlayer();
        if(player!=null) {
            // No state-changing methods while asynchronous preparation is in flight.
            if(prepared)startPrepared(player,epoch.get());
            return;
        }
        final int token=epoch.get();
        final String selected=track;
        AssetFileDescriptor file=null;
        try {
            final MediaPlayer pending=new MediaPlayer();player=pending;playerTrack=selected;prepared=false;
            pending.setAudioAttributes(attributes);
            pending.setOnPreparedListener(new MediaPlayer.OnPreparedListener(){public void onPrepared(final MediaPlayer ready){
                main(new Runnable(){public void run(){
                    if(ready!=player)return;
                    if(token!=epoch.get()||!selected.equals(track)||!eligible()){disposePlayer();return;}
                    prepared=true;ready.setLooping(true);startPrepared(ready,token);
                }});
            }});
            pending.setOnErrorListener(new MediaPlayer.OnErrorListener(){public boolean onError(final MediaPlayer failed,int what,int extra){
                main(new Runnable(){public void run(){if(failed==player){failures++;wanted=false;epoch.incrementAndGet();disposePlayer();}}});
                return true;
            }});
            file=context.getAssets().openFd("shared/music/"+selected+".ogg");
            pending.setDataSource(file.getFileDescriptor(),file.getStartOffset(),file.getLength());
            pending.prepareAsync();
        } catch(IOException ignored){failures++;wanted=false;disposePlayer();}
          catch(RuntimeException ignored){failures++;wanted=false;disposePlayer();}
        finally {if(file!=null)try{file.close();}catch(IOException ignored){}}
    }
    private void startPrepared(MediaPlayer ready,int token) {
        if(ready!=player||token!=epoch.get()||!eligible()){disposePlayer();return;}
        try {
            ready.setVolume(level,level);
            if(!playing) {
                if(!requestFocus()){wanted=false;disposePlayer();return;}
                // Focus callbacks and public cancellation can invalidate the request during setup.
                if(token!=epoch.get()||!eligible()){disposePlayer();return;}
                ready.start();playing=true;starts++;
            }
        } catch(RuntimeException ignored){failures++;wanted=false;disposePlayer();}
    }
    private void disposePlayer() {
        MediaPlayer old=player;player=null;playerTrack="";playing=false;prepared=false;
        // release() is legal in every state, including Preparing; stop/reset are not.
        if(old!=null)try{old.release();}catch(RuntimeException ignored){}
        abandonFocus();
    }
    @JavascriptInterface public String status() {
        if(!BuildConfig.DEV)return "{}";
        return "{\"active\":"+active+",\"enabled\":"+enabled+",\"volume\":"+level+",\"suppressed\":"+suppressed+
            ",\"wanted\":"+wanted+",\"playing\":"+playing+",\"released\":"+released+",\"track\":\""+track+
            "\",\"starts\":"+starts+",\"failures\":"+failures+"}";
    }
    void release() {
        released=true;active=false;wanted=false;track="";epoch.incrementAndGet();
        main(new Runnable(){public void run(){disposePlayer();handler.removeCallbacksAndMessages(null);}});
    }
}
