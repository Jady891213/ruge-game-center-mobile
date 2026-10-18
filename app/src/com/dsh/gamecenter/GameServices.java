package com.dsh.gamecenter;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Read-only provider status. Secrets, HTTP requests and quota parsing stay native. */
public final class GameServices {
    static final String MINIMAX_URL = "https://api.minimax.cn/v1/token_plan/remains";
    static final String TENCENT_CONSOLE = "https://console.cloud.tencent.com/soenew";
    static final String MINIMAX_CONSOLE = "https://platform.minimax.cn/user-center/payment/token-plan";
    private final Activity activity;
    private final GameAssessment assessment;
    private final Host host;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean closed, loading;
    private int generation;
    private long lastRefresh, updatedAt;
    private String state = "stale", error = "";
    private JSONObject quota;
    private HttpURLConnection connection;
    public interface Host { boolean servicesPageAllowed(); }
    public GameServices(Activity activity, GameAssessment assessment, Host host) {
        this.activity = activity; this.assessment = assessment; this.host = host;
    }
    private boolean allowed() { return !closed && host.servicesPageAllowed(); }
    @JavascriptInterface public synchronized String read() {
        try {
            if (!allowed()) return "{\"version\":\"4.31\",\"services\":[]}";
            boolean tencent = assessment.privateConfigured();
            boolean minimax = assessment.minimaxConfigured();
            JSONArray rows = new JSONArray();
            rows.put(row("tencent-soe", "腾讯云口语评测", tencent ? "unsupported" : "unconfigured", tencent, null, 0, tencent ? "quota-console-only" : ""));
            rows.put(row("minimax-token-plan", "MiniMax 共享套餐", minimax ? state : "unconfigured", minimax, minimax ? quota : null, minimax ? updatedAt : 0, minimax ? error : ""));
            return new JSONObject().put("version", "4.31").put("services", rows).toString();
        } catch (Exception ignored) { return "{\"version\":\"4.31\",\"services\":[]}"; }
    }
    static JSONObject row(String id, String name, String status, boolean configured, JSONObject quota, long at, String error) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("status", status).put("configured", configured)
                .put("quota", quota == null ? JSONObject.NULL : quota).put("updatedAt", at == 0 ? JSONObject.NULL : at).put("error", error);
    }
    @JavascriptInterface public synchronized boolean refresh(String id) {
        if (!allowed()) return false;
        if ("tencent-soe".equals(id)) return true; // No undocumented/broad billing request.
        if (!"minimax-token-plan".equals(id) || loading) return false;
        final String token = assessment.minimaxToken();
        if (token.isEmpty()) return false;
        long now = System.currentTimeMillis();
        if (lastRefresh != 0 && now - lastRefresh < 30000L) return false;
        lastRefresh = now; loading = true; state = "loading"; error = "";
        final int request = generation;
        worker.execute(new Runnable() { public void run() { fetch(token, request); }});
        return true;
    }
    private void fetch(String token, int request) {
        HttpURLConnection local = null; JSONObject result = null; String failure = "";
        try {
            synchronized (this) { if (request != generation || !allowed()) return; }
            local = (HttpURLConnection) new URL(MINIMAX_URL).openConnection();
            local.setInstanceFollowRedirects(false); local.setConnectTimeout(5000); local.setReadTimeout(5000);
            local.setRequestMethod("GET"); local.setRequestProperty("Authorization", "Bearer " + token);
            local.setRequestProperty("Accept", "application/json");
            synchronized (this) { if (request != generation || !allowed()) return; connection = local; }
            int http = local.getResponseCode();
            if (http != 200) failure = (http == 401 || http == 403) ? "service-auth" : "service-error";
            else {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = local.getInputStream()) {
                    byte[] chunk = new byte[2048]; int count;
                    while ((count = input.read(chunk)) != -1) {
                        if (bytes.size() + count > 65536) throw new IllegalArgumentException();
                        bytes.write(chunk, 0, count);
                        synchronized (this) { if (request != generation || !allowed()) return; }
                    }
                }
                JSONObject response = new JSONObject(new String(bytes.toByteArray(), "UTF-8"));
                JSONObject status = response.optJSONObject("base_resp");
                if (status == null || status.optInt("status_code", -1) != 0) failure = "service-error";
                else result = parseMiniMaxQuota(response);
                if (result == null && failure.isEmpty()) failure = "quota-unavailable";
            }
        } catch (java.io.IOException ignored) { failure = "network"; }
        catch (Exception ignored) { failure = "invalid-result"; }
        finally {
            if (local != null) local.disconnect();
            synchronized (this) {
                if (connection == local) connection = null;
                if (request == generation && allowed()) {
                    loading = false;
                    if (result != null) { quota = result; updatedAt = System.currentTimeMillis(); state = "ready"; error = ""; }
                    else { state = "network".equals(failure) ? "offline" : "error"; error = failure; }
                }
            }
        }
    }
    /** Official Token Plan response has percentages even when count fields are zero. */
    static JSONObject parseMiniMaxQuota(JSONObject response) throws Exception {
        JSONArray models = response.optJSONArray("model_remains");
        if (models == null || models.length() == 0) return null;
        JSONObject item = null;
        for (int i = 0; i < models.length(); i++) {
            JSONObject candidate = models.optJSONObject(i);
            if (candidate != null && "general".equals(candidate.optString("model_name"))) { item = candidate; break; }
        }
        if (item == null) return null;
        int remaining = percentage(item.opt("current_interval_remaining_percent"));
        int weekly = percentage(item.opt("current_weekly_remaining_percent"));
        long reset = timestamp(item.opt("end_time")), weekReset = timestamp(item.opt("weekly_end_time"));
        if (remaining < 0 || remaining > 100 || weekly < 0 || weekly > 100 || reset <= 0 || weekReset <= 0) return null;
        return new JSONObject().put("remaining", remaining).put("total", 100).put("unit", "%").put("expiresAt", reset)
                .put("windowLabel", "5小时窗口剩余").put("weeklyLabel", "本周剩余").put("expiresLabel", "重置")
                .put("weeklyRemaining", weekly).put("weeklyTotal", 100).put("weeklyExpiresAt", weekReset);
    }
    static int percentage(Object value) {
        if (!(value instanceof Number)) return -1;
        double number = ((Number) value).doubleValue();
        if (Double.isNaN(number) || Double.isInfinite(number) || number < 0 || number > 100 || number != Math.rint(number)) return -1;
        return (int) number;
    }
    static long timestamp(Object value) {
        if (!(value instanceof Number)) return 0;
        double number = ((Number) value).doubleValue();
        if (Double.isNaN(number) || Double.isInfinite(number) || number <= 0 || number > 9007199254740991d || number != Math.rint(number)) return 0;
        return ((Number) value).longValue();
    }
    @JavascriptInterface public boolean openConsole(final String id) {
        final String address = consoleUrl(id);
        synchronized (this) { if (!allowed() || address == null) return false; }
        main.post(new Runnable() { public void run() {
            synchronized (GameServices.this) { if (!allowed()) return; }
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address))); } catch (Exception ignored) { }
        }});
        return true;
    }
    static String consoleUrl(String id) {
        return "tencent-soe".equals(id) ? TENCENT_CONSOLE : "minimax-token-plan".equals(id) ? MINIMAX_CONSOLE : null;
    }
    synchronized void cancelInternal() {
        generation++; loading = false;
        if ("loading".equals(state)) state = "stale";
        if (connection != null) { connection.disconnect(); connection = null; }
    }
    synchronized void close() { cancelInternal(); closed = true; worker.shutdownNow(); }
}
