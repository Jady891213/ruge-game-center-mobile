package com.dsh.gamecenter;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** 乳鸽游戏中心外壳：一个 WebView 加载 assets 里的本地合集。
 *  返回键 = 游戏内回列表，列表上再按 = 退出。
 *
 *  开发版（BuildConfig.DEV=true）额外支持：优先从 App 外部文件目录读页面
 *  （/sdcard/Android/data/&lt;pkg&gt;/files/dev/index.html），改页面不用重装。
 *  正式版里这段代码会被编译器整段消除，不残留读取外部目录的能力。 */
public class MainActivity extends Activity {
    private WebView web;
    private volatile boolean backPending = false;
    private volatile long backGeneration = 0L;
    private long lastBackAt = 0L;
    private GameFeedback feedback;
    private GameAudio audio;
    private GameAssessment assessment;
    private GameServices services;
    private volatile boolean servicesPage = false;
    private volatile boolean assessmentPage = false;
    private GameCamera camera;
    private volatile TextToSpeech tts;
    private volatile boolean foreground = false;
    private volatile boolean destroyed = false;
    private volatile boolean keepAwake = true;
    private String devPageRoot;
    private String devResourceVersion;
    private volatile boolean ttsReady = false;
    private volatile Locale ttsChineseLocale = Locale.SIMPLIFIED_CHINESE;
    private volatile String ttsWhy = "not-started";

    // ── 重力计（倾斜控制）───────────────────────────────
    // 为什么不用网页的 DeviceOrientationEvent：
    //   Chrome 在**非安全上下文**（http 明文）里把 deviceorientation /
    //   devicemotion 直接移除了 —— 连构造函数都是 undefined。
    //   而 APK 里走 file:// 也不一定稳，所以干脆用原生传感器 + JS 桥推送。
    //   TYPE_ACCELEROMETER 不需要任何权限。
    private GameOrientation orientation;
    private SensorManager sensors;
    private Sensor tiltSensor;
    private final Object tiltLock = new Object();
    private final TiltReading tiltReading = new TiltReading();
    private volatile boolean tiltRegistered = false;
    private volatile int displayRotation = Surface.ROTATION_0;
    private volatile String tiltWhy = "not-started";
    private SensorEventListener tiltListener;

    /** Pure numeric sensor state; callers hold tiltLock, including bridge reads. */
    static final class TiltReading {
        private static final double ACCEL_TIME_CONSTANT_SECONDS = 0.18;
        float x = 0f, y = 0f, z = 1f;
        long timestampNanos = 0L;
        boolean ready = false;
        String source = "none";

        void clear() {
            x = y = 0f;
            z = 1f;
            timestampNanos = 0L;
            ready = false;
            source = "none";
        }

        boolean accept(float rx, float ry, float rz, long timestamp, boolean accelerometer) {
            if (Float.isNaN(rx) || Float.isInfinite(rx) || Float.isNaN(ry) || Float.isInfinite(ry)
                    || Float.isNaN(rz) || Float.isInfinite(rz) || timestamp <= 0L) {
                clear();
                return false;
            }
            // Reject delayed/out-of-order callbacks without replacing the newer sample.
            if (ready && timestamp <= timestampNanos) return true;
            float nx = rx / 9.81f, ny = ry / 9.81f, nz = rz / 9.81f;
            if (accelerometer && ready) {
                double dt = (timestamp - timestampNanos) / 1000000000.0;
                // dt-based low-pass extracts gravity; short translational jolts are attenuated.
                float blend = (float) (1.0 - Math.exp(-dt / ACCEL_TIME_CONSTANT_SECONDS));
                x += (nx - x) * blend;
                y += (ny - y) * blend;
                z += (nz - z) * blend;
            } else {
                x = nx; y = ny; z = nz;
            }
            timestampNanos = timestamp;
            ready = true;
            source = accelerometer ? "accelerometer-lowpass" : "gravity";
            return true;
        }

        float screenX(int rotation) {
            switch (rotation) {
                case 1: return y;
                case 2: return x;
                case 3: return -y;
                default: return -x;
            }
        }

        float screenY(int rotation) {
            switch (rotation) {
                case 1: return x;
                case 2: return -y;
                case 3: return -x;
                default: return y;
            }
        }

        long ageMs(long nowMs) {
            return !ready ? -1L : Math.max(0L, nowMs - timestampNanos / 1000000L);
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        keepAwake = getPreferences(MODE_PRIVATE).getBoolean("keep-awake", true);
        feedback = new GameFeedback(this, getPreferences(MODE_PRIVATE));
        if (keepAwake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (BuildConfig.DEV) {
            File external = getExternalFilesDir(null);
            if (external != null) {
                try { devPageRoot = new File(external, "dev").getCanonicalPath(); }
                catch (Exception e) { android.util.Log.w("RugeGC", "No developer page directory", e); }
            }
        }

        // Android WebView **没有** Web Speech API（实测 speechSynthesis === undefined），
        // 所以中文朗读必须走原生 TextToSpeech，再用 JS 桥暴露给页面。
        initTts();

        web = new WebView(this);
        audio = new GameAudio(this);
        assessment = new GameAssessment(this, new GameAssessment.Host() {
            public boolean assessmentPageAllowed() { return foreground && !destroyed && assessmentPage; }
            public void prepareAssessmentMicrophone() {
                if (audio != null) audio.stop();
                stopSpeech();
            }
        });
        services = new GameServices(this, assessment, new GameServices.Host() {
            public boolean servicesPageAllowed() { return foreground && !destroyed && servicesPage; }
        });
        camera = new GameCamera(this, web);
        if (BuildConfig.DEV) WebView.setWebContentsDebuggingEnabled(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // 游戏最高分存 localStorage
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);    // 本地页面之间跳转
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);

        web.setBackgroundColor(0xFF0B1020);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new LocalPageClient());
        web.setWebChromeClient(new WebChromeClient());
        // 原生桥只供白名单内的打包页面 / 开发页面使用。
        web.addJavascriptInterface(new TtsBridge(), "RugeTTS");
        web.addJavascriptInterface(new TiltBridge(), "RugeTilt");
        orientation = new GameOrientation(this);
        web.addJavascriptInterface(orientation, "RugeOrientation");
        web.addJavascriptInterface(new ScreenBridge(), "RugeScreen");
        web.addJavascriptInterface(new NavBridge(), "RugeNav");
        web.addJavascriptInterface(feedback, "RugeFeedback");
        web.addJavascriptInterface(audio, "RugeAudioNative");
        web.addJavascriptInterface(assessment, "RugeAssessment");
        web.addJavascriptInterface(services, "RugeServices");
        web.addJavascriptInterface(camera, "RugeCamera");

        setContentView(web);
        // 必须在 setContentView 之后：getInsetsController() 依赖 DecorView，
        // 而 DecorView 此前还不存在 —— 早调会直接 NPE 崩溃。
        goEdgeToEdge();
        initTilt();
        if (BuildConfig.DEV) devResourceVersion = readDevResourceVersion();
        web.loadUrl(startUrl());
    }

    /** 页面用 window.RugeTTS.speak("明") 就能出声；没有引擎时静默失败，不影响游戏。 */
    private class TtsBridge {
        @JavascriptInterface
        public boolean speak(String text) {
            TextToSpeech engine = tts;
            if (assessment != null && assessment.recording()) return false;
            if (!foreground || destroyed || !ttsReady || engine == null || text == null || text.isEmpty()) return false;
            try {
                int language = engine.setLanguage(ttsChineseLocale);
                if (language < TextToSpeech.LANG_AVAILABLE) return false;
                engine.setSpeechRate(0.82f); engine.setPitch(1.12f);
                return engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ruge") != TextToSpeech.ERROR;
            } catch (Throwable t) { return false; }
        }
        @JavascriptInterface
        public boolean speakEnglish(String text) {
            TextToSpeech engine = tts;
            if (assessment != null && assessment.recording()) return false;
            if (!foreground || destroyed || !ttsReady || engine == null || text == null
                    || !text.matches("apple|banana|bed|computer|dad|mom|brother|me|sister")) return false;
            try {
                if (engine.isLanguageAvailable(Locale.US) < TextToSpeech.LANG_AVAILABLE
                        || engine.setLanguage(Locale.US) < TextToSpeech.LANG_AVAILABLE) return false;
                engine.setSpeechRate(0.8f); engine.setPitch(1.0f);
                return engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ruge-en") != TextToSpeech.ERROR;
            } catch (Throwable ignored) { return false; }
        }
        @JavascriptInterface
        public boolean available() { return ttsReady; }
        /** 失败原因，供调试（如 init=-1 lang=-2） */
        @JavascriptInterface
        public String status() { return ttsWhy; }
        @JavascriptInterface
        public void stop() { stopSpeech(); }
    }

    /**
     * 导航桥：游戏里的「回游戏中心」。
     *
     * 为什么要有它：游戏内返回只回到**游戏自己的主界面**，
     * 回游戏中心必须是**一个显式的按钮** —— 防止小朋友点着点着突然退出、
     * 而且退出时没有任何状态提示。
     */
    private class NavBridge {
        @JavascriptInterface
        public boolean backRequestActive(long generation) {
            return !destroyed && foreground && backPending && generation == backGeneration;
        }

        @JavascriptInterface
        public void home() {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (!destroyed && web != null) web.loadUrl(startUrl());
                }
            });
        }
        @JavascriptInterface
        public boolean available() { return true; }

        @JavascriptInterface
        public boolean openSource(final String address) {
            if (destroyed || !foreground || !SourceLinks.allowed(address)) return false;
            runOnUiThread(new Runnable() {
                public void run() {
                    if (destroyed || !foreground) return;
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(address));
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(intent);
                    } catch (RuntimeException ignored) { }
                }
            });
            return true;
        }
    }

    /**
     * 屏幕方向桥：网页自己没法转屏，得让 Activity 转。
     * 页面调 window.RugeScreen.set('landscape' | 'portrait' | 'auto') 即可。
     * manifest 已改成 fullSensor，且 configChanges 带 orientation|screenSize，
     * 所以转屏**不会重建 Activity**（WebView 不会重载，游戏状态不丢）。
     */
    private class ScreenBridge {
        @JavascriptInterface
        public void set(final String mode) {
            final int o;
            if ("landscape".equals(mode))      o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
            else if ("portrait".equals(mode))  o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
            else                               o = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR;
            runOnUiThread(new Runnable() {
                public void run() {
                    try { setRequestedOrientation(o); } catch (Throwable ignored) { }
                }
            });
        }
        @JavascriptInterface
        public String get() {
            return getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE
                   ? "landscape" : "portrait";
        }
        /** 保留用户选择；Android 只会在可见窗口上应用常亮。 */
        @JavascriptInterface
        public void keepAwake(final boolean enabled) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (destroyed) return;
                    keepAwake = enabled;
                    getPreferences(MODE_PRIVATE).edit().putBoolean("keep-awake", enabled).apply();
                    applyKeepAwake();
                }
            });
        }
        @JavascriptInterface
        public boolean keepAwakeEnabled() { return keepAwake; }
        @JavascriptInterface
        public boolean isForeground() { return foreground && !destroyed; }
        /** 显式刷新开发页面会回到入口页；正式版始终返回 false。 */
        @JavascriptInterface
        public boolean reloadDevelopmentPages() {
            if (BuildConfig.DEV) {
                if (destroyed) return false;
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (destroyed || web == null) return;
                        devResourceVersion = readDevResourceVersion();
                        web.loadUrl(startUrl());
                    }
                });
                return true;
            }
            return false;
        }
    }

    /** 页面轮询 window.RugeTilt.gx() / gy() 拿倾斜值（-1 ~ 1）。没有传感器时 available() 为 false。 */
    private class TiltBridge {
        @JavascriptInterface
        public boolean available() {
            synchronized (tiltLock) {
                return tiltAvailableLocked(tiltReading.ageMs(SystemClock.elapsedRealtime()));
            }
        }
        /** 屏幕坐标：向屏幕右侧滚动为正；已映射当前旋转方向。 */
        @JavascriptInterface
        public float gx() {
            synchronized (tiltLock) { return tiltReading.screenX(displayRotation); }
        }
        /** 屏幕坐标：向屏幕下方滚动为正。 */
        @JavascriptInterface
        public float gy() {
            synchronized (tiltLock) { return tiltReading.screenY(displayRotation); }
        }
        /** 原始竖直分量（调试用） */
        @JavascriptInterface
        public float gz() { synchronized (tiltLock) { return tiltReading.z; } }
        /** One atomic reading, screen-down-v1 coordinates in normalized g; age is milliseconds. */
        @JavascriptInterface
        public String sample() {
            synchronized (tiltLock) {
                int rotation = displayRotation;
                long age = tiltReading.ageMs(SystemClock.elapsedRealtime());
                return "{\"x\":" + tiltReading.screenX(rotation) + ",\"y\":" + tiltReading.screenY(rotation)
                    + ",\"z\":" + tiltReading.z + ",\"age\":" + age
                    + ",\"available\":" + tiltAvailableLocked(age)
                    + ",\"source\":\"" + tiltReading.source + "\",\"rotation\":" + rotation * 90 + "}";
            }
        }
        @JavascriptInterface
        public String status() {
            synchronized (tiltLock) {
                if (tiltRegistered && tiltReading.ready && tiltReading.ageMs(SystemClock.elapsedRealtime()) > 1500L) return "stale-sample";
                return tiltWhy;
            }
        }
        @JavascriptInterface
        public String coordinateSystem() { return "screen-down-v1"; }
        /** 单调时钟，不能和 JS Date.now() 直接相减；页面通常用 sampleAgeMs。 */
        @JavascriptInterface
        public long sampleTimeMs() { synchronized (tiltLock) { return tiltReading.timestampNanos / 1000000L; } }
        @JavascriptInterface
        public long sampleAgeMs() {
            synchronized (tiltLock) {
                long age = tiltReading.ageMs(SystemClock.elapsedRealtime());
                return age < 0L ? Long.MAX_VALUE : age;
            }
        }
    }

    /** Must be called while holding tiltLock. */
    private boolean tiltAvailableLocked(long age) {
        return foreground && tiltRegistered && tiltReading.ready && age >= 0L && age <= 1500L;
    }

    private void initTilt() {
        try {
            sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
            if (sensors == null) { tiltWhy = "no-service"; return; }
            tiltSensor = sensors.getDefaultSensor(Sensor.TYPE_GRAVITY);
            if (tiltSensor == null) tiltSensor = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (tiltSensor == null) { tiltWhy = "no-tilt-sensor"; return; }
            tiltListener = new SensorEventListener() {
                public void onSensorChanged(SensorEvent e) {
                    synchronized (tiltLock) {
                        if (!foreground || !tiltRegistered || e.values.length < 3) return;
                        boolean accelerometer = tiltSensor.getType() == Sensor.TYPE_ACCELEROMETER;
                        boolean valid = tiltReading.accept(e.values[0], e.values[1], e.values[2], e.timestamp, accelerometer);
                        tiltWhy = valid ? (accelerometer ? "ok-accelerometer" : "ok-gravity") : "invalid-sample";
                    }
                }
                public void onAccuracyChanged(Sensor s2, int acc2) { }
            };
            tiltWhy = "paused";
        } catch (Throwable t) {
            tiltWhy = "error:" + t.getClass().getSimpleName();
        }
    }

    private void startTilt() {
        synchronized (tiltLock) {
            if (tiltRegistered || sensors == null || tiltSensor == null || tiltListener == null) return;
            tiltReading.clear();
            try {
                tiltRegistered = sensors.registerListener(tiltListener, tiltSensor, SensorManager.SENSOR_DELAY_GAME);
                tiltWhy = tiltRegistered ? "waiting-for-sample" : "register-failed";
            } catch (RuntimeException e) {
                tiltRegistered = false;
                tiltWhy = "register-error:" + e.getClass().getSimpleName();
            }
        }
    }

    private void stopTilt() {
        synchronized (tiltLock) {
            tiltRegistered = false;
            tiltReading.clear();
            if (tiltSensor != null) tiltWhy = "paused";
        }
        if (sensors != null && tiltListener != null) {
            try { sensors.unregisterListener(tiltListener); }
            catch (RuntimeException e) { android.util.Log.w("RugeGC", "Sensor cleanup failed", e); }
        }
    }

    private void initTts() {
        try {
            // 用匿名内部类而不是 lambda：lambda 会生成 invokedynamic，
            // 在本环境（javac -source 8 + android.jar 当 bootclasspath）desugar 会失败。
            tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (destroyed || tts == null) return;
                    if (status != TextToSpeech.SUCCESS) {
                        ttsWhy = "init=" + status;
                        return;
                    }
                    // 小米引擎对 zh 的声明方式不一定和 SIMPLIFIED_CHINESE 对得上，
                    // 挨个试，别一次不中就放弃。
                    Locale[] tries = { Locale.SIMPLIFIED_CHINESE, Locale.CHINA, Locale.CHINESE,
                                       Locale.forLanguageTag("zh-Hans-CN"), Locale.getDefault() };
                    int last = TextToSpeech.LANG_NOT_SUPPORTED;
                    for (Locale loc : tries) {
                        try {
                            int a = tts.isLanguageAvailable(loc);
                            if (a == TextToSpeech.LANG_MISSING_DATA || a == TextToSpeech.LANG_NOT_SUPPORTED) {
                                last = a;
                                continue;
                            }
                            int r = tts.setLanguage(loc);
                            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                                last = r;
                                continue;
                            }
                            tts.setSpeechRate(0.82f);
                            tts.setPitch(1.12f);
                            ttsChineseLocale = loc;
                            ttsReady = true;
                            ttsWhy = "ok lang=" + loc + " avail=" + a;
                            return;
                        } catch (Throwable t) { ttsWhy = "try-err " + t.getClass().getSimpleName(); }
                    }
                    ttsWhy = "init=0 but no usable language, last=" + last
                           + " availZh=" + tts.isLanguageAvailable(Locale.SIMPLIFIED_CHINESE)
                           + " engines=" + java.util.Arrays.toString(tts.getEngines().toArray());
                }
            });
        } catch (Throwable t) { ttsReady = false; ttsWhy = "ctor-err " + t.getClass().getSimpleName(); }
    }

    /** 起始页面：正式版固定读 assets；开发版若外部目录有页面则优先用它。 */
    private String startUrl() {
        String url = "file:///android_asset/index.html";
        if (BuildConfig.DEV) {
            if (devPageRoot != null) {
                File dev = new File(devPageRoot, "index.html");
                String candidate = Uri.fromFile(dev).toString();
                if (dev.isFile() && isAllowedLocalUrl(candidate)) url = candidate;
            }
        }
        return url;
    }

    /** 页面文件的名称、大小、修改时间变化时才热刷新，正常切后台保留 JS 游戏状态。 */
    private String readDevResourceVersion() {
        if (BuildConfig.DEV) {
            if (devPageRoot != null) {
                File directory = new File(devPageRoot);
                File entry = new File(directory, "index.html");
                if (entry.isFile() && isAllowedLocalUrl(Uri.fromFile(entry).toString())) {
                    List<String> versions = new ArrayList<String>();
                    collectDevResourceVersions(directory, versions);
                    Collections.sort(versions);
                    return versions.toString();
                }
            }
        }
        return null;
    }

    private void collectDevResourceVersions(File directory, List<String> versions) {
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            try {
                // 不沿软链走出开发目录，也不让目录软链形成递归循环。
                if (!file.getCanonicalPath().equals(file.getAbsolutePath())) continue;
                if (!isAllowedLocalUrl(Uri.fromFile(file).toString())) continue;
                if (file.isDirectory()) collectDevResourceVersions(file, versions);
                else if (file.isFile()) versions.add(file.getAbsolutePath() + ":" + file.length() + ":" + file.lastModified());
            } catch (Exception e) { android.util.Log.w("RugeGC", "Cannot inspect developer resource", e); }
        }
    }

    private boolean isAllowedLocalUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            if (!"file".equals(uri.getScheme()) || (uri.getAuthority() != null && !uri.getAuthority().isEmpty())) return false;
            String path = uri.getPath();
            if (path == null) return false;
            String canonical = new File(path).getCanonicalPath();
            if (canonical.startsWith("/android_asset/")) return true;
            if (BuildConfig.DEV) {
                return devPageRoot != null && canonical.startsWith(devPageRoot + File.separator);
            }
        } catch (Exception e) { return false; }
        return false;
    }

    private class LocalPageClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            backGeneration++;
            backPending = false;
            // Leaving a game always closes its capture, even if pagehide never executes.
            assessmentPage = false;
            servicesPage = false;
            if (services != null) services.cancelInternal();
            if (assessment != null) assessment.cancelInternal();
            if (audio != null) audio.stop();
            if (camera != null) camera.stop();
            if (feedback != null) feedback.stop();
            stopSpeech();
        }
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) { return !isAllowedLocalUrl(url); }
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isAllowedLocalUrl(request.getUrl().toString());
        }
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (isAllowedLocalUrl(request.getUrl().toString())) return null;
            WebResourceResponse blocked = new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            blocked.setStatusCodeAndReasonPhrase(403, "Forbidden");
            return blocked;
        }
        @Override
        public void onPageFinished(WebView view, String url) {
            // Privileged provisioning/PCM/signing are never exposed to dev overrides,
            // other games, query variants, iframes or remote pages. speaking.html also
            // enforces frame-src 'none' in its own CSP.
            assessmentPage = ("file:///android_asset/hanzi-typing/speaking.html".equals(url)
                    || "file:///android_asset/english-k/index.html".equals(url)) && url.equals(view.getUrl());
            servicesPage = "file:///android_asset/settings/index.html".equals(url) && url.equals(view.getUrl());
            if (isAllowedLocalUrl(url)) dispatchLifecycle(foreground ? "resume" : "pause");
        }
    }

    private void dispatchLifecycle(String state) {
        if (web == null || destroyed) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ruge:" + state + "'));", null);
    }

    private void applyKeepAwake() {
        if (foreground && keepAwake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void stopSpeech() {
        TextToSpeech engine = tts;
        if (engine != null) {
            try { engine.stop(); }
            catch (RuntimeException e) { android.util.Log.w("RugeGC", "Speech stop failed", e); }
        }
    }

    private void updateDisplayRotation() {
        int rotation = getWindowManager().getDefaultDisplay().getRotation();
        synchronized (tiltLock) { displayRotation = rotation; }
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateDisplayRotation();
        goEdgeToEdge();
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ruge:orientation'));", null);
    }

    /**
     * 真·全屏：内容铺满整块屏（含状态栏、导航栏与挖孔区）。
     * 两处坑（都实测踩过）：
     *   ① getInsetsController() 依赖 DecorView，必须在 setContentView 之后调，否则 NPE 崩溃；
     *   ② 顶部那条黑带是**挖孔安全区**（displayCutoutSafeInsets），
     *      只调 setDecorFitsSystemWindows 治不了，必须显式声明 layoutInDisplayCutoutMode。
     * 全屏只是外观：整体 try/catch，失败退回普通显示，绝不把应用带崩。
     */
    private void goEdgeToEdge() {
        try {
            goEdgeToEdgeInner();
        } catch (Throwable t) {
            android.util.Log.e("RugeGC", "edge-to-edge failed", t);
        }
    }

    private void goEdgeToEdgeInner() {
        Window w = getWindow();

        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = (Build.VERSION.SDK_INT >= 30)
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }

        if (Build.VERSION.SDK_INT >= 21) {
            w.setStatusBarColor(0x00000000);
            w.setNavigationBarColor(0x00000000);
        }
    }

    /** 页面先消费内部层级，只有游戏根页才回合集；合集再返回退出。 */
    @Override
    public void onBackPressed() {
        if (destroyed || !foreground || web == null || backPending) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastBackAt < 200L) return;
        lastBackAt = now;
        final String current = web.getUrl();
        final String home = startUrl();
        boolean atHome = current != null
                && android.net.Uri.parse(home).getPath().equals(android.net.Uri.parse(current).getPath());
        if (atHome) {
            finish();
            return;
        }
        backPending = true;
        final long generation = ++backGeneration;
        web.evaluateJavascript("(function(){if(window.RugeNav && typeof window.RugeNav.backRequestActive === 'function' && !window.RugeNav.backRequestActive(" + generation + "))return true;return !!(window.RugeBack && window.RugeBack.handle());})()", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (destroyed || web == null || generation != backGeneration) return;
                backPending = false;
                if (!foreground || current == null || !current.equals(web.getUrl())) return;
                // Missing page code can fall back, but a slow/stale callback cannot
                // send a newer page home. Internal handlers cancel their own media.
                if (!"true".equals(value)) {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                    web.loadUrl(home);
                }
            }
        });
        // Release a stuck dispatch for retry; never navigate on a timer.
        web.postDelayed(new Runnable() {
            @Override public void run() {
                if (generation == backGeneration) { backGeneration++; backPending = false; }
            }
        }, 1200L);
    }

    @Override
    protected void onPause() {
        foreground = false;
        backGeneration++;
        backPending = false;
        if (services != null) services.cancelInternal();
        if (assessment != null) assessment.cancelInternal();
        if (feedback != null) feedback.foreground(false);
        if (audio != null) audio.foreground(false);
        if (camera != null) camera.onPause();
        dispatchLifecycle("pause");
        if (web != null) web.onPause();
        stopTilt();
        if (orientation != null) orientation.foreground(false);
        stopSpeech();
        applyKeepAwake();
        super.onPause();
    }

    /** 开发版只在外部资源变化时重载；普通后台恢复与正式版都保留页面状态。 */
    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        if (feedback != null) feedback.foreground(true);
        if (audio != null) audio.foreground(true);
        if (camera != null) camera.onResume();
        updateDisplayRotation();
        startTilt();
        if (orientation != null) orientation.foreground(true);
        applyKeepAwake();
        goEdgeToEdge();
        if (web != null) {
            web.onResume();
            boolean refreshed = false;
            if (BuildConfig.DEV) {
                String nextVersion = readDevResourceVersion();
                if (nextVersion != null && !nextVersion.equals(devResourceVersion)) {
                    if (devResourceVersion == null) web.loadUrl(startUrl());
                    else web.reload();
                    refreshed = true;
                }
                devResourceVersion = nextVersion;
            }
            if (!refreshed) dispatchLifecycle("resume");
        }
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        servicesPage = false;
        if (services != null) services.close();
        assessmentPage = false;
        if (assessment != null) assessment.close();
        if (feedback != null) feedback.release();
        if (audio != null) audio.close();
        if (camera != null) camera.onDestroy();
        foreground = false;
        stopTilt();
        if (orientation != null) orientation.close();
        ttsReady = false;
        TextToSpeech engine = tts;
        tts = null;
        if (engine != null) {
            try { engine.stop(); engine.shutdown(); }
            catch (RuntimeException e) { android.util.Log.w("RugeGC", "Speech cleanup failed", e); }
        }
        if (web != null) {
            web.stopLoading();
            web.removeJavascriptInterface("RugeTTS");
            web.removeJavascriptInterface("RugeTilt");
            web.removeJavascriptInterface("RugeOrientation");
            web.removeJavascriptInterface("RugeScreen");
            web.removeJavascriptInterface("RugeNav");
            web.removeJavascriptInterface("RugeFeedback");
            web.removeJavascriptInterface("RugeAudioNative");
            web.removeJavascriptInterface("RugeAssessment");
            web.removeJavascriptInterface("RugeServices");
            web.removeJavascriptInterface("RugeCamera");
            if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (audio != null) audio.permissionResult(requestCode, grants);
        if (assessment != null) assessment.permissionResult(requestCode, grants);
        if (camera != null) camera.onRequestPermissionsResult(requestCode, permissions, grants);
    }
}
