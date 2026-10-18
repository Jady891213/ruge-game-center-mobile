package com.dsh.gamecenter;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Explicit local-page recording. Cloud credentials and signing stay in native code.
 * No networking occurs here: take() transfers a single RAM-only PCM recording and a
 * 90-second signed Tencent SOE URL to the authorized local assessment page. */
public final class GameAssessment {
    public static final int PERMISSION_REQUEST = 9306;
    private static final String KEY_ALIAS = "ruge-assessment-aes-v1";
    private static final int RATE = 16000, MAX_SAMPLES = RATE * 8;
    private final Activity activity;
    private final Host host;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final SharedPreferences preferences;
    private final SecureRandom random = new SecureRandom();
    private boolean configured, finishRequested;
    private volatile boolean closed;
    private int generation;
    private int evalMode;
    private AudioRecord recorder;
    private byte[] pcm;
    private String status = "unconfigured", error = "", sessionId = "", reference = "", recordedSessionId = "";
    private long elapsedMs;
    private float level;

    public interface Host {
        boolean assessmentPageAllowed();
        /** Called on UI thread before claiming the microphone. */
        void prepareAssessmentMicrophone();
    }

    public GameAssessment(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
        preferences = activity.getSharedPreferences("assessment-private", Context.MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 23) {
            try { configured = credentials() != null; } catch (Exception ignored) { configured = false; }
        }
        status = configured ? "idle" : "unconfigured";
    }

    private boolean allowed() {
        return !closed && Build.VERSION.SDK_INT >= 23 && host.assessmentPageAllowed();
    }

    @JavascriptInterface public synchronized boolean available() { return allowed(); }
    @JavascriptInterface public synchronized boolean configured() { return allowed() && configured; }

    /** DEV-only private provisioning, never an asset/config file or child-facing UI. */
    @JavascriptInterface public synchronized boolean configure(String json) {
        if (!BuildConfig.DEV || !allowed()) return false;
        byte[] plain = null, encrypted = null;
        try {
            JSONObject value = new JSONObject(json);
            String appId = value.getString("appId"), secretId = value.getString("secretId"), secretKey = value.getString("secretKey");
            if (value.length() != 3 || !appId.matches("[0-9]{5,20}")
                    || !secretId.matches("[A-Za-z0-9]{8,128}") || !secretKey.matches("[A-Za-z0-9+/=_-]{8,256}")) return false;
            plain = new JSONObject().put("appId", appId).put("secretId", secretId).put("secretKey", secretKey).toString().getBytes(StandardCharsets.UTF_8);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            cipher.updateAAD(KEY_ALIAS.getBytes(StandardCharsets.UTF_8));
            encrypted = cipher.doFinal(plain);
            boolean stored = preferences.edit().clear()
                    .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit();
            if (!stored) { error = "configuration-unavailable"; return false; }
            cancelInternal();
            configured = true; status = "ready"; error = "";
            return true;
        } catch (Exception ignored) { error = "configuration-unavailable"; return false; }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); if (encrypted != null) Arrays.fill(encrypted, (byte) 0); }
    }

    @JavascriptInterface public void begin(String json) {
        if (!allowed()) return;
        final String accepted;
        final int acceptedMode;
        try {
            JSONObject value = new JSONObject(json);
            acceptedMode = value.optInt("evalMode", -1);
            if ((acceptedMode != 0 && acceptedMode != 8) || value.length() != 2) throw new IllegalArgumentException();
            accepted = validateReference(value.getString("reference"), acceptedMode);
        } catch (Exception ignored) { fail("invalid-reference"); return; }
        final int requestedGeneration;
        synchronized (this) {
            if (!allowed()) return;
            requestedGeneration = generation;
        }
        main.post(new Runnable() { public void run() {
            synchronized (GameAssessment.this) {
                // A cancellation/navigation can overtake this queued UI runnable.
                // Never resurrect an old request after the child has stopped it.
                if (!allowed() || requestedGeneration != generation) return;
                cancelInternal();
                if (!configured) { status = "unconfigured"; return; }
                if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    status = "permission";
                    activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_REQUEST);
                    return;
                }
                host.prepareAssessmentMicrophone();
                if (!allowed()) return;
                reference = accepted;
                evalMode = acceptedMode;
                sessionId = UUID.randomUUID().toString();
                status = "ready"; error = ""; finishRequested = false;
                final int token = generation;
                worker.execute(new Runnable() { public void run() { capture(token); }});
            }
        }});
    }

    /** Request completion; recorded is announced only after the recorder is released. */
    @JavascriptInterface public synchronized void finish() {
        if (!allowed() || !("recording".equals(status) || "ready".equals(status))) return;
        finishRequested = true;
        if (recorder != null) try { recorder.stop(); } catch (RuntimeException ignored) { }
    }

    @JavascriptInterface public synchronized String read() {
        try {
            if (!allowed()) return new JSONObject().put("status", "error").put("error", "page-unavailable").toString();
            return new JSONObject().put("status", configured ? status : "unconfigured").put("sessionId", sessionId)
                    .put("elapsedMs", elapsedMs).put("level", level).put("error", error).toString();
        } catch (Exception ignored) { return "{\"status\":\"error\",\"error\":\"state-unavailable\"}"; }
    }

    /** One-shot. No PCM or signed URL is retained after transfer. */
    @JavascriptInterface public synchronized String take() {
        if (!allowed()) return "{\"error\":\"page-unavailable\"}";
        if (!"recorded".equals(status) || pcm == null || !sessionId.equals(recordedSessionId))
            return "{\"error\":\"recording-unavailable\"}";
        byte[] bytes = pcm; pcm = null;
        try {
            JSONObject configuration = credentials();
            if (configuration == null) { configured = false; throw new IllegalStateException(); }
            long now = System.currentTimeMillis() / 1000L;
            TreeMap<String, String> parameters = new TreeMap<String, String>();
            parameters.put("secretid", configuration.getString("secretId"));
            parameters.put("timestamp", Long.toString(now));
            parameters.put("expired", Long.toString(now + 90));
            parameters.put("nonce", Integer.toString(1 + random.nextInt(Integer.MAX_VALUE - 1)));
            parameters.put("server_engine_type", "16k_zh");
            parameters.put("voice_id", sessionId);
            parameters.put("voice_format", "0");
            parameters.put("text_mode", "0");
            parameters.put("ref_text", (evalMode == 8 ? "{::cmd{F_TDET=true}}" : "") + reference);
            parameters.put("eval_mode", Integer.toString(evalMode));
            parameters.put("score_coeff", "1.0");
            parameters.put("sentence_info_enabled", "0");
            parameters.put("rec_mode", "1");
            String url = signedUrl(configuration.getString("appId"), configuration.getString("secretKey"), parameters);
            String output = new JSONObject().put("sessionId", sessionId).put("url", url)
                    .put("pcmBase64", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("sampleRate", RATE).toString();
            reference = ""; recordedSessionId = ""; status = "idle"; error = "";
            return output;
        } catch (Exception ignored) { reference = ""; recordedSessionId = ""; status = "error"; error = "signing-unavailable"; return "{\"error\":\"signing-unavailable\"}"; }
        finally { Arrays.fill(bytes, (byte) 0); }
    }

    @JavascriptInterface public synchronized void cancel() { if (allowed()) cancelInternal(); }

    /** Native navigation/background cleanup bypasses the page gate on purpose. */
    synchronized void cancelInternal() {
        generation++; finishRequested = false;
        AudioRecord local = recorder;
        if (local != null) try { local.stop(); } catch (RuntimeException ignored) { }
        if (pcm != null) { Arrays.fill(pcm, (byte) 0); pcm = null; }
        reference = ""; sessionId = ""; recordedSessionId = ""; elapsedMs = 0; level = 0; error = "";
        status = configured ? "idle" : "unconfigured";
    }

    synchronized boolean recording() { return "recording".equals(status) || ("ready".equals(status) && !sessionId.isEmpty()); }

    void permissionResult(int requestCode, int[] grants) {
        if (requestCode != PERMISSION_REQUEST) return;
        synchronized (this) {
            // Granting permission never starts recording. The child must press again.
            status = grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED ? "ready" : "error";
            error = "error".equals(status) ? "permission-denied" : "";
        }
    }

    synchronized void close() { cancelInternal(); closed = true; worker.shutdown(); }

    private synchronized void fail(String reason) { cancelInternal(); status = "error"; error = reason; }

    private void capture(int token) {
        AudioRecord local = null;
        byte[] buffer = new byte[MAX_SAMPLES * 2], completed = null;
        short[] samples = new short[512];
        int total = 0, voiced = 0;
        boolean completedNormally = false;
        String failure = "";
        try {
            synchronized (this) { if (token != generation || !allowed() || finishRequested) return; }
            int minimum = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) throw new IllegalStateException();
            local = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum * 2, 8192));
            synchronized (this) {
                if (token != generation || !allowed() || finishRequested) return;
                if (local.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException();
                recorder = local; local.startRecording(); status = "recording";
            }
            while (total < MAX_SAMPLES) {
                synchronized (this) { if (token != generation || !allowed()) return; if (finishRequested) break; }
                int count = local.read(samples, 0, Math.min(samples.length, MAX_SAMPLES - total));
                if (count <= 0) {
                    synchronized (this) { if (token != generation || !allowed()) return; if (finishRequested) break; }
                    throw new IllegalStateException();
                }
                double energy = 0;
                for (int i = 0; i < count; i++) {
                    int position = (total + i) * 2;
                    buffer[position] = (byte) (samples[i] & 255);
                    buffer[position + 1] = (byte) ((samples[i] >> 8) & 255);
                    double value = samples[i] / 32768.0; energy += value * value;
                }
                double rms = Math.sqrt(energy / count);
                if (rms >= .008) voiced += count;
                total += count;
                synchronized (this) {
                    if (token != generation || !allowed()) return;
                    elapsedMs = total * 1000L / RATE; level = Math.min(1f, (float) rms * 10f);
                }
            }
            if (total < RATE * .35) failure = "recording-too-short";
            else if (voiced < RATE * .16) failure = "no-audio-detected";
            else { completed = Arrays.copyOf(buffer, total * 2); completedNormally = true; }
        } catch (Exception ignored) { failure = "microphone-unavailable"; }
        finally {
            if (local != null) {
                try { local.stop(); } catch (RuntimeException ignored) { }
                try { local.release(); } catch (RuntimeException ignored) { }
            }
            Arrays.fill(buffer, (byte) 0); Arrays.fill(samples, (short) 0);
            synchronized (this) {
                if (recorder == local) recorder = null;
                if (token == generation && allowed()) {
                    level = 0;
                    if (completedNormally) { pcm = completed; completed = null; recordedSessionId = sessionId; status = "recorded"; error = ""; }
                    else if (!failure.isEmpty()) { status = "error"; error = failure; reference = ""; }
                    else if (finishRequested) { status = "error"; error = "recording-too-short"; reference = ""; }
                }
            }
            if (completed != null) Arrays.fill(completed, (byte) 0);
        }
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private JSONObject credentials() throws Exception {
        String encrypted = preferences.getString("ciphertext", ""), iv = preferences.getString("iv", "");
        if (encrypted.isEmpty() || iv.isEmpty()) return null;
        byte[] plain = null, ciphertext = Base64.decode(encrypted, Base64.DEFAULT), nonce = Base64.decode(iv, Base64.DEFAULT);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(KEY_ALIAS.getBytes(StandardCharsets.UTF_8));
            plain = cipher.doFinal(ciphertext);
            return new JSONObject(new String(plain, StandardCharsets.UTF_8));
        } finally { Arrays.fill(ciphertext, (byte) 0); Arrays.fill(nonce, (byte) 0); if (plain != null) Arrays.fill(plain, (byte) 0); }
    }

    // Pure request helpers are package-visible so deterministic tests execute the actual code.
    static String validateReference(String input, int mode) {
        if (input == null) throw new IllegalArgumentException();
        String text = input.trim().replaceAll("\\s+", " ");
        if (text.isEmpty() || text.length() > 80 || (mode != 0 && mode != 8)) throw new IllegalArgumentException();
        if (mode == 0 && !text.matches("[\\u3400-\\u9FFF]{1,10}")) throw new IllegalArgumentException();
        if (mode == 8 && !text.matches("[a-z]+[1-4]?( [a-z]+[1-4]?){0,11}")) throw new IllegalArgumentException();
        return text;
    }

    static String signedUrl(String appId, String signingKey, TreeMap<String, String> parameters) throws Exception {
        String path = "soe.cloud.tencent.com/soe/api/" + appId;
        StringBuilder raw = new StringBuilder(path).append('?');
        for (Map.Entry<String, String> item : parameters.entrySet()) {
            if (raw.charAt(raw.length() - 1) != '?') raw.append('&');
            raw.append(item.getKey()).append('=').append(item.getValue());
        }
        Mac mac = Mac.getInstance("HmacSHA1");
        byte[] key = signingKey.getBytes(StandardCharsets.UTF_8), digest = null;
        try {
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            digest = mac.doFinal(raw.toString().getBytes(StandardCharsets.UTF_8));
            String signature = Base64.encodeToString(digest, Base64.NO_WRAP);
            StringBuilder url = new StringBuilder("wss://").append(path).append('?');
            for (Map.Entry<String, String> item : parameters.entrySet()) {
                if (url.charAt(url.length() - 1) != '?') url.append('&');
                url.append(encode(item.getKey())).append('=').append(encode(item.getValue()));
            }
            return url.append("&signature=").append(encode(signature)).toString();
        } finally { Arrays.fill(key, (byte) 0); if (digest != null) Arrays.fill(digest, (byte) 0); }
    }

    private static String encode(String value) throws Exception {
        return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
    }
}
