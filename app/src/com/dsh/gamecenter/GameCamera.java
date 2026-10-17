package com.dsh.gamecenter;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Size;
import android.view.Surface;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Collections;

/** Local low-resolution camera input for the color game; no files, uploads or object recognition. */
public final class GameCamera {
    public static final int PERMISSION_REQUEST = 6308;
    private final Activity activity;
    private final WebView web;
    private final CameraManager manager;
    private HandlerThread thread;
    private Handler worker;
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader reader;
    private boolean opening;
    private int openingGeneration = -1;
    private volatile boolean foreground, destroyed, desired, running, permissionPending;
    private volatile String status = "stopped";
    private volatile int generation;
    private long lastFrame;
    private final Object frameLock = new Object();
    private long frameAt;
    private long sequence;
    private String jpeg = "";
    private JSONArray pixels = new JSONArray();
    private int orientation;

    public GameCamera(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        manager = (CameraManager) activity.getSystemService(Context.CAMERA_SERVICE);
    }

    @JavascriptInterface public boolean available() {
        try { return !destroyed && manager != null && manager.getCameraIdList().length > 0; }
        catch (Exception ignored) { return false; }
    }

    private boolean allowedPage() {
        String url = web == null ? null : web.getUrl();
        if (url == null || !url.startsWith("file://")) return false;
        try { return android.net.Uri.parse(url).getPath().endsWith("/camera-color/index.html"); }
        catch (Exception ignored) { return false; }
    }

    private boolean granted() {
        return Build.VERSION.SDK_INT < 23 || activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface public void start() {
        activity.runOnUiThread(new Runnable() { public void run() { startOnUi(); } });
    }

    private void startOnUi() {
        if (destroyed || !foreground || !allowedPage()) { status = "inactive"; return; }
        if (!available()) { status = "unavailable"; return; }
        if (!granted()) {
            status = "permission";
            if (!permissionPending && Build.VERSION.SDK_INT >= 23) {
                permissionPending = true;
                activity.requestPermissions(new String[]{Manifest.permission.CAMERA}, PERMISSION_REQUEST);
            }
            return;
        }
        if (desired) return;
        desired = true;
        status = "opening";
        final int token = ++generation;
        if (thread == null) {
            thread = new HandlerThread("RugeColorCamera");
            thread.start();
            worker = new Handler(thread.getLooper());
        }
        worker.post(new Runnable() { public void run() { open(token); } });
    }

    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != PERMISSION_REQUEST) return;
        permissionPending = false;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            status = "ready";
            // The active page resumes explicitly; granting permission must not reopen a paused game.
        } else status = "denied";
    }

    public void onResume() { foreground = true; }
    public void onPause() { foreground = false; stop(); }
    public void onDestroy() {
        destroyed = true;
        foreground = false;
        stop();
        if (worker != null) worker.post(new Runnable() { public void run() { quitIfDestroyed(); } });
    }

    @JavascriptInterface public void stop() {
        desired = false;
        running = false;
        ++generation;
        status = "stopped";
        synchronized (frameLock) { jpeg = ""; pixels = new JSONArray(); frameAt = 0; }
        if (worker != null) worker.post(new Runnable() { public void run() { closeCamera(); } });
    }

    @JavascriptInterface public String snapshot() {
        try {
            JSONObject out = new JSONObject();
            out.put("available", available());
            out.put("permission", granted());
            out.put("running", running);
            out.put("status", status);
            out.put("facing", "back");
            out.put("roi", 0.24);
            synchronized (frameLock) {
                out.put("seq", sequence);
                out.put("ageMs", frameAt == 0 ? -1 : SystemClock.elapsedRealtime() - frameAt);
                out.put("pixels", pixels);
                out.put("jpeg", jpeg);
            }
            return out.toString();
        } catch (Exception ignored) { return "{\"status\":\"error\",\"running\":false}"; }
    }

    private boolean current(int token) { return desired && foreground && !destroyed && token == generation; }
    private void fail(String why, int token) {
        if (token != generation) return;
        desired = false; running = false; status = why;
        closeCamera();
    }

    @SuppressWarnings("MissingPermission")
    private void open(final int token) {
        if (!current(token)) return;
        if (opening) {
            // Finish a prior asynchronous open before starting another generation.
            worker.postDelayed(new Runnable() { public void run() { open(token); } }, 120);
            return;
        }
        closeCamera();
        try {
            String selected = null;
            CameraCharacteristics chars = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics c = manager.getCameraCharacteristics(id);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    selected = id; chars = c; break;
                }
            }
            if (selected == null) { fail("no-back-camera", token); return; }
            StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size[] sizes = map == null ? null : map.getOutputSizes(ImageFormat.YUV_420_888);
            if (sizes == null || sizes.length == 0) { fail("unsupported", token); return; }
            Size size = sizes[0];
            long best = Long.MAX_VALUE;
            for (Size s : sizes) {
                long area = (long)s.getWidth() * s.getHeight();
                // Prefer a supported ~320x240 stream; cap conversion work where possible.
                long score = Math.abs(area - 320L*240L) + (s.getWidth() > 640 || s.getHeight() > 480 ? 10000000 : 0);
                if (score < best) { best = score; size = s; }
            }
            Integer sensor = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
            orientation = sensor == null ? 90 : sensor;
            reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.YUV_420_888, 3);
            final ImageReader target = reader;
            target.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                public void onImageAvailable(ImageReader r) { receive(r, token); }
            }, worker);
            opening = true;
            openingGeneration = token;
            manager.openCamera(selected, new CameraDevice.StateCallback() {
                public void onOpened(final CameraDevice opened) {
                    finishOpening(token);
                    if (!current(token)) { opened.close(); quitIfDestroyed(); return; }
                    device = opened;
                    try {
                        opened.createCaptureSession(Collections.singletonList(target.getSurface()), new CameraCaptureSession.StateCallback() {
                            public void onConfigured(CameraCaptureSession ready) {
                                if (!current(token)) { ready.close(); return; }
                                session = ready;
                                try {
                                    CaptureRequest.Builder request = opened.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                    request.addTarget(target.getSurface());
                                    request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                    ready.setRepeatingRequest(request.build(), null, worker);
                                    running = true; status = "running"; lastFrame = 0;
                                } catch (Exception ignored) { fail("capture-error", token); }
                            }
                            public void onConfigureFailed(CameraCaptureSession bad) { bad.close(); fail("configure-error", token); }
                        }, worker);
                    } catch (Exception ignored) { fail("session-error", token); }
                }
                public void onDisconnected(CameraDevice disconnected) { finishOpening(token); disconnected.close(); fail("disconnected", token); quitIfDestroyed(); }
                public void onError(CameraDevice failed, int error) { finishOpening(token); failed.close(); fail("camera-error-" + error, token); quitIfDestroyed(); }
            }, worker);
        } catch (SecurityException ignored) { finishOpening(token); fail("denied", token); quitIfDestroyed(); }
          catch (Exception ignored) { finishOpening(token); fail("open-error", token); quitIfDestroyed(); }
    }

    private void receive(ImageReader source, int token) {
        Image image = null;
        Bitmap raw = null, upright = null;
        try {
            image = source.acquireLatestImage();
            if (image == null || !current(token)) return;
            long now = SystemClock.elapsedRealtime();
            if (now - lastFrame < 180) return;
            lastFrame = now;
            int width = image.getWidth(), height = image.getHeight();
            byte[] nv21 = new byte[width * height * 3 / 2];
            Image.Plane[] planes = image.getPlanes();
            copyPlane(planes[0], width, height, nv21, 0, 1);
            copyPlane(planes[2], width / 2, height / 2, nv21, width * height, 2);
            copyPlane(planes[1], width / 2, height / 2, nv21, width * height + 1, 2);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            new YuvImage(nv21, ImageFormat.NV21, width, height, null).compressToJpeg(new Rect(0, 0, width, height), 72, bytes);
            byte[] encoded = bytes.toByteArray();
            raw = BitmapFactory.decodeByteArray(encoded, 0, encoded.length);
            if (raw == null) return;
            int display = activity.getWindowManager().getDefaultDisplay().getRotation();
            int degrees = display == Surface.ROTATION_90 ? 90 : display == Surface.ROTATION_180 ? 180 : display == Surface.ROTATION_270 ? 270 : 0;
            Matrix matrix = new Matrix();
            matrix.postRotate((orientation - degrees + 360) % 360);
            upright = Bitmap.createBitmap(raw, 0, 0, raw.getWidth(), raw.getHeight(), matrix, true);
            // Match the square, object-fit:cover web preview: center square crop.
            int side = Math.min(upright.getWidth(), upright.getHeight());
            int left = (upright.getWidth() - side) / 2, top = (upright.getHeight() - side) / 2;
            JSONArray samples = new JSONArray();
            for (int y = 0; y < 7; y++) for (int x = 0; x < 7; x++) {
                int px = left + (int)(side * (0.38 + (x + 0.5) * 0.24 / 7));
                int py = top + (int)(side * (0.38 + (y + 0.5) * 0.24 / 7));
                int rgb = upright.getPixel(px, py);
                samples.put(new JSONArray().put((rgb >> 16) & 255).put((rgb >> 8) & 255).put(rgb & 255));
            }
            bytes.reset();
            upright.compress(Bitmap.CompressFormat.JPEG, 62, bytes);
            if (!current(token)) return;
            synchronized (frameLock) {
                jpeg = Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
                pixels = samples;
                frameAt = now;
                sequence++;
            }
        } catch (Exception ignored) { if (current(token)) status = "frame-error"; }
          finally {
            if (image != null) image.close();
            if (upright != null && upright != raw) upright.recycle();
            if (raw != null) raw.recycle();
        }
    }

    private static void copyPlane(Image.Plane plane, int width, int height, byte[] out, int offset, int stride) {
        ByteBuffer buffer = plane.getBuffer();
        int base = buffer.position(), row = plane.getRowStride(), pixel = plane.getPixelStride();
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
            out[offset + (y * width + x) * stride] = buffer.get(base + y * row + x * pixel);
    }

    private void closeCamera() {
        if (session != null) { try { session.stopRepeating(); } catch (Exception ignored) {} session.close(); session = null; }
        if (device != null) { device.close(); device = null; }
        if (reader != null) { reader.close(); reader = null; }
    }

    private void quitIfDestroyed() {
        // Keep the callback looper alive while openCamera is pending, so a late device is closed.
        if (destroyed && !opening && thread != null) thread.quitSafely();
    }

    private void finishOpening(int token) {
        if (openingGeneration == token) { opening = false; openingGeneration = -1; }
    }
}
