package com.dsh.gamecenter;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;

/** Full 360 degree camera pointing direction. No geographic north or permission is required.
 * GAME_ROTATION_VECTOR may drift slowly; the page anchors heading at each explicit start/resume.
 * Unlike gravity, this keeps yaw when the handset is upright and is not limited to +/-90 degrees.
 */
final class GameOrientation implements SensorEventListener {
    private final SensorManager manager;
    private final Sensor sensor;
    private final Object lock = new Object();
    private boolean foreground, registered, ready;
    private long timestampNanos;
    private int generation;
    private double heading, elevation;
    private final float[] matrix = new float[9];
    GameOrientation(Context context) {
        manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor candidate = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (candidate == null && manager != null) candidate = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        sensor = candidate;
    }
    void foreground(boolean value) {
        synchronized (lock) {
            foreground = value;
            ready = false; timestampNanos = 0;
            if (!value) {
                registered = false;
                if (manager != null) manager.unregisterListener(this);
            } else if (!registered && sensor != null) {
                generation++;
                try { registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME); }
                catch (RuntimeException ignored) { registered = false; }
            }
        }
    }
    void close() { foreground(false); }
    public void onSensorChanged(SensorEvent event) {
        synchronized (lock) {
            if (!foreground || !registered || event.values.length < 3) return;
            for (float f : event.values) if (Float.isNaN(f) || Float.isInfinite(f)) { ready = false; return; }
            if (event.timestamp <= timestampNanos) return;
            try { SensorManager.getRotationMatrixFromVector(matrix, event.values); }
            catch (RuntimeException ignored) { ready = false; return; }
            // Back-camera optical axis is device -Z. This is independent of screen rotation.
            double[] direction = pointing(matrix);
            heading = direction[0]; elevation = direction[1];
            double x = -matrix[2], y = -matrix[5];
            timestampNanos = event.timestamp;
            // Pointing nearly straight up/down makes heading physically undefined.
            ready = Math.hypot(x, y) > .17 && !Double.isNaN(heading) && !Double.isInfinite(heading) && !Double.isNaN(elevation) && !Double.isInfinite(elevation);
        }
    }
    static double[] pointing(float[] matrix) {
        double x = -matrix[2], y = -matrix[5], z = -matrix[8];
        return new double[]{(Math.toDegrees(Math.atan2(x, y)) + 360.0) % 360.0, Math.toDegrees(Math.atan2(z, Math.hypot(x, y)))};
    }
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    @JavascriptInterface public String coordinateSystem() { return "camera-relative-360-v1"; }
    @JavascriptInterface public String sample() {
        synchronized (lock) {
            long age = timestampNanos == 0 ? Long.MAX_VALUE : SystemClock.elapsedRealtime() - timestampNanos / 1000000L;
            boolean available = foreground && registered && ready && age >= 0 && age <= 750;
            String source = sensor == null ? "none" : sensor.getType() == Sensor.TYPE_GAME_ROTATION_VECTOR ? "game-rotation-vector" : "rotation-vector";
            return "{\"available\":" + available + ",\"heading\":" + heading + ",\"elevation\":" + elevation
                + ",\"age\":" + age + ",\"generation\":" + generation + ",\"relative\":true,\"source\":\"" + source + "\"}";
        }
    }
}
