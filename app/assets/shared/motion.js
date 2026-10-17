/* One calibrated gravity input for both continuous and discrete games.
 * Outputs sin(inclination), screen right/down positive. No game physics here. */
(function (w) {
  'use strict';
  const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
  const finite = Number.isFinite;
  function create(options = {}) {
    let mode = 'tilt', zero = [0, 0], filtered = [0, 0], touch = [0, 0];
    const fixedFlat = options.reference === 'flat';
    let paused = false, dead = false, calibrated = fixedFlat, web = null, lastStatus = '';
    let flatSeconds = 0, flatAnchor = null;
    const native = w.RugeTilt;
    function raw() {
      if (dead || paused || w.document?.hidden) return null;
      try {
        if (native) {
          let s;
          if (typeof native.sample === 'function') s = JSON.parse(native.sample());
          else s = {x: Number(native.gx()), y: Number(native.gy()), z: typeof native.gz === 'function' ? Number(native.gz()) : 1,
            available: native.available(), age: typeof native.sampleAgeMs === 'function' ? Number(native.sampleAgeMs()) : 0,
            source: 'native', legacy: typeof native.coordinateSystem !== 'function' || native.coordinateSystem() !== 'screen-down-v1'};
          if (!s.available || !finite(s.age) || s.age < 0 || s.age > 1500 || ![s.x, s.y, s.z].every(finite)) return null;
          if (s.legacy) s.x = -s.x;
          const n = Math.hypot(s.x, s.y, s.z);
          if (n < .35 || n > 1.8) return null;
          return {x: s.x / n, y: s.y / n, z: s.z / n, age: s.age, source: s.source || 'native'};
        }
      } catch (_) { return null; }
      if (web && performance.now() - web.time <= 1500) return web;
      return null;
    }
    const angles = s => [Math.atan2(s.x, Math.hypot(s.y, s.z)), Math.atan2(s.y, s.z)];
    function resetFlat() { flatSeconds = 0; flatAnchor = null; }
    function posture(s = raw()) {
      const age = s?.source === 'browser' ? performance.now() - s.time : (s?.age ?? 0);
      const fresh = !!s && age <= 300;
      const tiltDegrees = s ? Math.acos(clamp(s.z)) * 180 / Math.PI : null;
      const flat = fresh && s.z > 0 && tiltDegrees <= 8;
      return {available: !!s, fresh, flat, stable: flat && flatSeconds >= .5 - 1e-9,
        tiltDegrees, x: s?.x ?? 0, y: s?.y ?? 0, z: s?.z ?? 0, elapsed: flatSeconds};
    }
    function flatReady(dt = 1 / 60) {
      const s = raw(), p = posture(s);
      if (!p.flat) { resetFlat(); return posture(s); }
      if (!flatAnchor || Math.acos(clamp(s.x * flatAnchor.x + s.y * flatAnchor.y + s.z * flatAnchor.z)) > 2 * Math.PI / 180) {
        flatAnchor = s; flatSeconds = 0;
      }
      flatSeconds = Math.min(.5, flatSeconds + clamp(finite(dt) ? dt : 0, 0, .1));
      return posture(s);
    }
    function status(s = raw()) {
      return {mode, available: mode === 'touch' || !!s, fresh: !!s, calibrated, source: s?.source || 'unavailable', paused, destroyed: dead};
    }
    function inform(s) {
      const value = status(s), key = JSON.stringify(value);
      if (key !== lastStatus) { lastStatus = key; options.onChange?.(value); }
    }
    function read(dt = 1 / 60) {
      const s = raw(); inform(s);
      if (dead || paused || w.document?.hidden) return {x: 0, y: 0, available: false, fresh: false, angleX: 0, angleY: 0};
      if (mode === 'touch') return {x: touch[0], y: touch[1], available: true, fresh: true, angleX: Math.asin(touch[0]), angleY: Math.asin(touch[1])};
      if (!s) { filtered = [0, 0]; return {x: 0, y: 0, available: false, fresh: false, angleX: 0, angleY: 0}; }
      const a = angles(s).map((v, i) => clamp(Math.atan2(Math.sin(v - zero[i]), Math.cos(v - zero[i])), -Math.PI / 2, Math.PI / 2));
      const gain = 1 - Math.exp(-clamp(finite(dt) ? dt : 0, 0, .1) / .035);
      a.forEach((v, i) => { const target = Math.abs(v) < .012 ? 0 : Math.sin(v); filtered[i] += (target - filtered[i]) * gain; });
      return {x: filtered[0], y: filtered[1], available: true, fresh: true, angleX: a[0], angleY: a[1]};
    }
    function calibrate() { const s = raw(); if (!s) return false; zero = fixedFlat ? [0, 0] : angles(s); filtered = [0, 0]; touch = [0, 0]; calibrated = true; inform(s); return true; }
    function release() { touch = [0, 0]; filtered = [0, 0]; }
    function setMode(value) { if (value !== 'tilt' && value !== 'touch') return false; mode = value; release(); inform(raw()); return true; }
    function setTouch(x, y) { if (!finite(x) || !finite(y) || dead || paused) return; const n = Math.max(1, Math.hypot(x, y)); touch = [x / n, y / n]; }
    function orientation(e) {
      if (dead || !finite(e.beta) || !finite(e.gamma)) return;
      const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
      const x = Math.sin(g) * Math.cos(b), y = Math.sin(b), z = Math.cos(g) * Math.cos(b);
      const rotation = ((w.screen?.orientation?.angle ?? w.orientation ?? 0) + 360) % 360;
      const mapped = rotation === 90 ? [-y, x] : rotation === 180 ? [-x, -y] : rotation === 270 ? [y, -x] : [x, y];
      web = {x: mapped[0], y: mapped[1], z, time: performance.now(), source: 'browser'};
    }
    function pause() { paused = true; release(); resetFlat(); web = null; inform(null); }
    function resume() { paused = false; release(); resetFlat(); web = null; inform(raw()); }
    function rotate() { calibrated = fixedFlat; zero = [0, 0]; release(); resetFlat(); web = null; }
    function visibility() { if (w.document?.hidden) pause(); else resume(); }
    const events = [['deviceorientation', orientation], ['ruge:pause', pause], ['ruge:resume', resume], ['ruge:orientation', rotate], ['pagehide', pause]];
    events.forEach(([name, fn]) => w.addEventListener(name, fn));
    w.document?.addEventListener('visibilitychange', visibility);
    function destroy() { dead = true; release(); web = null; events.forEach(([name, fn]) => w.removeEventListener(name, fn)); w.document?.removeEventListener('visibilitychange', visibility); }
    return {read, calibrate, setMode, setTouch, release, posture, flatReady, resetPosture: resetFlat, mode: () => mode, status, destroy};
  }
  function createDirectionGate({enter=.18,exit=.08,stable=.11}={}){
   let held=null,candidate=null,elapsed=0,neutralWait=false;
   function reset(requireNeutral=false){held=null;candidate=null;elapsed=0;neutralWait=requireNeutral;}
   function read(x,y,dt){
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(dt)||dt<0){candidate=null;elapsed=0;return null;}
    const amplitude=Math.max(Math.abs(x),Math.abs(y));
    if(amplitude<=exit){reset();return null;}
    if(neutralWait)return null;
    if(amplitude<enter){candidate=null;elapsed=0;return null;}
    const direction=Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';
    if(direction===held){candidate=null;elapsed=0;return null;}
    if(candidate!==direction){candidate=direction;elapsed=0;}
    elapsed+=Math.min(dt,.05);if(elapsed+1e-9<stable)return null;
    held=direction;candidate=null;elapsed=0;return direction;
   }
   return {read,reset,status:()=>({held,candidate,elapsed,neutralWait})};
  }
  w.RugeMotion = Object.freeze({create, createDirectionGate});
})(typeof window !== 'undefined' ? window : globalThis);
