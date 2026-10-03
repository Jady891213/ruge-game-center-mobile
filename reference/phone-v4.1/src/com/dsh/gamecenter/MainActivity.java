package com.dsh.gamecenter;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.util.Locale;

/** 乳鸽游戏中心外壳：一个 WebView 加载 assets 里的本地合集。
 *  返回键 = 游戏内回列表，列表上再按 = 退出。
 *
 *  开发版（BuildConfig.DEV=true）额外支持：优先从 App 外部文件目录读页面
 *  （/sdcard/Android/data/&lt;pkg&gt;/files/dev/index.html），改页面不用重装。
 *  正式版里这段代码会被编译器整段消除，不残留读取外部目录的能力。 */
public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile String ttsWhy = "not-started";

    // ── 重力计（倾斜控制）───────────────────────────────
    // 为什么不用网页的 DeviceOrientationEvent：
    //   Chrome 在**非安全上下文**（http 明文）里把 deviceorientation /
    //   devicemotion 直接移除了 —— 连构造函数都是 undefined。
    //   而 APK 里走 file:// 也不一定稳，所以干脆用原生传感器 + JS 桥推送。
    //   TYPE_ACCELEROMETER 不需要任何权限。
    private SensorManager sensors;
    private volatile float ax = 0f, ay = 0f, az = 9.81f;
    private volatile boolean tiltReady = false;
    private String tiltWhy = "not-started";
    private SensorEventListener tiltListener;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Android WebView **没有** Web Speech API（实测 speechSynthesis === undefined），
        // 所以中文朗读必须走原生 TextToSpeech，再用 JS 桥暴露给页面。
        initTts();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // 游戏最高分存 localStorage
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);    // 本地页面之间跳转
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);

        web.setBackgroundColor(0xFF0B1020);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        // 只加载本地 assets，不涉及远程内容，暴露接口是安全的
        web.addJavascriptInterface(new TtsBridge(), "RugeTTS");
        web.addJavascriptInterface(new TiltBridge(), "RugeTilt");
        web.addJavascriptInterface(new ScreenBridge(), "RugeScreen");
        web.addJavascriptInterface(new NavBridge(), "RugeNav");

        setContentView(web);
        // 必须在 setContentView 之后：getInsetsController() 依赖 DecorView，
        // 而 DecorView 此前还不存在 —— 早调会直接 NPE 崩溃。
        goEdgeToEdge();
        initTilt();
        web.loadUrl(startUrl());
    }

    /** 页面用 window.RugeTTS.speak("明") 就能出声；没有引擎时静默失败，不影响游戏。 */
    private class TtsBridge {
        @JavascriptInterface
        public boolean speak(String text) {
            if (!ttsReady || tts == null || text == null || text.isEmpty()) return false;
            try {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ruge");
                return true;
            } catch (Throwable t) { return false; }
        }
        @JavascriptInterface
        public boolean available() { return ttsReady; }
        /** 失败原因，供调试（如 init=-1 lang=-2） */
        @JavascriptInterface
        public String status() { return ttsWhy; }
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
        public void home() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try { web.loadUrl(startUrl()); } catch (Throwable ignored) { }
                }
            });
        }
        @JavascriptInterface
        public boolean available() { return true; }
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
    }

    /** 页面轮询 window.RugeTilt.gx() / gy() 拿倾斜值（-1 ~ 1）。没有传感器时 available() 为 false。 */
    private class TiltBridge {
        @JavascriptInterface
        public boolean available() { return tiltReady; }
        /** 左右倾斜：正 = 往右倾 */
        @JavascriptInterface
        public float gx() { return ax; }
        /** 前后倾斜：正 = 往自己这边倾 */
        @JavascriptInterface
        public float gy() { return ay; }
        /** 原始竖直分量（调试用） */
        @JavascriptInterface
        public float gz() { return az; }
        @JavascriptInterface
        public String status() { return tiltWhy; }
    }

    private void initTilt() {
        try {
            sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
            if (sensors == null) { tiltWhy = "no-service"; return; }
            Sensor acc = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (acc == null) { tiltWhy = "no-accelerometer"; return; }
            tiltListener = new SensorEventListener() {
                public void onSensorChanged(SensorEvent e) {
                    if (e.values.length < 3) return;
                    // 单位是 m/s²，除以 9.81 归一化到「几个 g」
                    ax = e.values[0] / 9.81f;
                    ay = e.values[1] / 9.81f;
                    az = e.values[2] / 9.81f;
                    tiltReady = true;
                }
                public void onAccuracyChanged(Sensor s2, int acc2) { }
            };
            boolean okReg = sensors.registerListener(tiltListener, acc, SensorManager.SENSOR_DELAY_GAME);
            tiltWhy = okReg ? "ok" : "register-failed";
        } catch (Throwable t) {
            tiltWhy = "error:" + t.getClass().getSimpleName();
        }
    }

    private void initTts() {
        try {
            // 用匿名内部类而不是 lambda：lambda 会生成 invokedynamic，
            // 在本环境（javac -source 8 + android.jar 当 bootclasspath）desugar 会失败。
            tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
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
            File dev = new File(getExternalFilesDir(null), "dev/index.html");
            if (dev.exists()) {
                url = "file://" + dev.getAbsolutePath();
            }
        }
        return url;
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

    /** 返回键：能后退就回上一页（游戏 → 列表），到顶了才退出。 */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
        // 后台就不用跑传感器了
        if (sensors != null && tiltListener != null) {
            try { sensors.unregisterListener(tiltListener); } catch (Throwable ignored) { }
        }
    }

    /** 开发版：每次回到前台就重载，改完外部目录里的页面切回来即生效，无需重装。 */
    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            if (BuildConfig.DEV) web.reload();
            web.onResume();
        }
        // 回前台再把传感器挂上
        if (sensors != null && tiltListener != null && !tiltReady) {
            try { sensors.registerListener(tiltListener, sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER),
                                           SensorManager.SENSOR_DELAY_GAME); } catch (Throwable ignored) { }
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Throwable t) {} }
        super.onDestroy();
    }
}
