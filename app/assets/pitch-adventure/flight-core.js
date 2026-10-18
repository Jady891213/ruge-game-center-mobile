/* Endless child-friendly flight. World units are independent of the viewport. */
(function (root) {
  'use strict';
  const W = 800, H = 450, X = 160, MIN_Y = 80, MAX_Y = 370;
  const RADIUS = 19, TARGET_SPEED = 160, MAX_SPEED = 145;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function create(options = {}) {
    let seed = (typeof options === 'number' ? options : options && options.seed) >>> 0;
    if (!seed) seed = 42619;
    let randomState = seed;
    function random() {
      randomState = (randomState + 0x6D2B79F5) >>> 0;
      let t = randomState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    let y = 225, targetY = y, vy = 0, distance = 0, score = 0, stars = 0;
    let lives = 3, shield = 0, paused = false, phase = 'running';
    let eventId = 0, events = [], nextId = 1, lastCenter = y;
    const gates = [];
    function difficulty(index) {
      const n = clamp(index - 5, 0, 40);
      return {speed: Math.min(MAX_SPEED, 95 + n * 1.25), gap: index <= 2 ? 270 : Math.max(196, 240 - (index - 3) * 1.1), spacing: Math.max(385, 440 - n * 1.375)};
    }
    function addGate(x) {
      const id = nextId++, d = difficulty(id);
      // A player can traverse the full maximum change before the next gate.
      // The visible opening includes the full craft radius plus ample child margin.
      // Two broad introductory gates, then an unmistakable up/down/up phrase.
      // Openings may extend beyond the sky; requiring the entire opening to fit
      // on screen would make every wide gate include the neutral middle lane.
      const introductoryCenters = [205, 245, 105, 345, 105];
      const center = id <= introductoryCenters.length ? introductoryCenters[id - 1] :
        clamp(lastCenter + (random() * 2 - 1) * 240, 95, 355);
      lastCenter = center;
      gates.push({id, x, center, gap: d.gap, width: 74, hit: false, passed: false,
        starX: x - 105, starY: center, starCollected: false});
    }
    addGate(720);
    while (gates[gates.length - 1].x < W + 550) {
      const last = gates[gates.length - 1];
      addGate(last.x + difficulty(nextId).spacing);
    }
    function emit(type, details = {}) { events.push({id: ++eventId, type, ...details}); }
    function snapshot() {
      return {seed, phase, paused, x: X, y, targetY, vy, radius: RADIUS,
        distance, speed: difficulty(score + 1).speed, score, stars, lives, shield,
        level: score + 1, eventId, events: events.map(e => ({...e})),
        gates: gates.map(g => ({...g}))};
    }
    function tick(dt, intent) {
      const speed = difficulty(score + 1).speed;
      const oldY = y;
      targetY = clamp(targetY + intent * TARGET_SPEED * dt, MIN_Y, MAX_Y);
      y += (targetY - y) * (1 - Math.exp(-dt * 10));
      vy = (y - oldY) / dt;
      distance += speed * dt;
      shield = Math.max(0, shield - dt);
      for (const gate of gates) {
        gate.x -= speed * dt;
        gate.starX -= speed * dt;
        if (!gate.starCollected && Math.hypot(gate.starX - X, gate.starY - y) < RADIUS + 20) {
          gate.starCollected = true;
          stars++;
          emit('star', {gate: gate.id, x: gate.starX, y: gate.starY});
        }
        const inWallX = Math.abs(gate.x - X) < gate.width / 2 + RADIUS;
        const inWallY = y - RADIUS < gate.center - gate.gap / 2 || y + RADIUS > gate.center + gate.gap / 2;
        if (!gate.hit && inWallX && inWallY) {
          gate.hit = true; // A single obstacle can never repeatedly drain lives.
          if (shield <= 0) {
            lives--;
            shield = 2.2;
            emit('hit', {gate: gate.id, lives});
            if (lives <= 0) { phase = 'over'; emit('over', {score, stars}); return; }
          }
        }
        if (!gate.passed && gate.x + gate.width / 2 < X - RADIUS) {
          gate.passed = true;
          score++;
          emit('gate', {gate: gate.id, score});
        }
      }
      while (gates.length && gates[0].x < -100) gates.shift();
      while (!gates.length || gates[gates.length - 1].x < W + 550) {
        const previous = gates[gates.length - 1];
        addGate(previous ? previous.x + difficulty(nextId).spacing : W + 100);
      }
    }
    return {
      step(dt, intent = 0) {
        // A background frame must not be replayed as seconds of unseen movement.
        if (paused || phase !== 'running' || !Number.isFinite(dt) || dt <= 0 || dt > .25) return snapshot();
        events = [];
        const direction = Number.isFinite(intent) ? clamp(intent, -1, 1) : 0;
        const parts = Math.ceil(dt * 120), slice = dt / parts;
        for (let i = 0; i < parts && phase === 'running'; i++) tick(slice, direction);
        return snapshot();
      },
      snapshot,
      pause(value = true) { paused = !!value; return snapshot(); }
    };
  }
  root.PitchFlightCore = Object.freeze({create, W, H, X, MIN_Y, MAX_Y, RADIUS, TARGET_SPEED, MAX_SPEED});
})(typeof window === 'undefined' ? globalThis : window);
