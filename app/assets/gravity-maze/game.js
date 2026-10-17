(function () {
  'use strict';
  const C = window.MarbleMaze, $ = s => document.querySelector(s);
  const COVER = /(?:\?|&)cover=1(?:&|$)/.test(location.search);
  const KEY = 'rugeMarbleMazeV1', INPUT_KEY = 'rugeMarbleInputV1';
  const clone = value => JSON.parse(JSON.stringify(value));
  function read(key) { if (COVER) return null; try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function progressFrom(raw, legacy) {
    if (raw?.schema === 1) {
      const reached = C.clamp(Math.floor(Number(raw.reached) || 0), 0, 11);
      const mechanismReached = C.clamp(Math.floor(Number(raw.mechanismReached) || 12), 12, C.LEVELS.length - 1);
      const completed = Array.isArray(raw.completed) ? [...new Set(raw.completed.filter(i => Number.isInteger(i) && i >= 0 && i < C.LEVELS.length))] : [];
      const draft = C.restore(raw.draft);
      const allowed = i => i >= 0 && (i < 12 ? i <= reached : i <= mechanismReached && i < C.LEVELS.length);
      const current = Number.isInteger(raw.current) && allowed(raw.current) ? raw.current : 0;
      return { schema: 1, reached, mechanismReached, completed, current, draft: draft && allowed(draft.level) ? draft : null, legacyMigrated: !!raw.legacyMigrated };
    }
    const current = C.clamp(Math.floor(Number(legacy?.highest) || 0), 0, 9);
    const completed = Object.keys(legacy?.stars || {}).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < 10 && Number(legacy.stars[i]) > 0);
    const reached = Math.max(current, Math.min(C.LEVELS.length - 1, Math.max(-1, ...completed) + 1));
    return { schema: 1, reached: Math.min(11, reached), mechanismReached: 12, completed, current, draft: null, legacyMigrated: !!legacy };
  }
  let progress = progressFrom(read(KEY), read('rollingGardenV2'));
  let state = progress.draft && progress.draft.level === progress.current ? progress.draft : C.create(progress.current);
  let result = state.won ? 'win' : 'ready', paused = true, last = 0, saveClock = 0, staleTime = 0, toastTimer = 0, pointerId = null, joystick = { x: 0, y: 0 }, effects = [];
  let foreground = true, planning = false, rotorButtons = [];
  let initialMode = 'tilt';
  if (!COVER) try { initialMode = localStorage.getItem(INPUT_KEY) || localStorage.getItem('rollingGardenInputV2') || 'tilt'; } catch (_) {}
  const input = window.RugeMotion.create();
  input.setMode(initialMode === 'touch' ? 'touch' : 'tilt');
  // A browser without a sensor starts in touch mode; native stale sensors stay explicit.
  if (initialMode !== 'touch' && !window.RugeTilt && !input.status().available) input.setMode('touch');
  const cv = $('#cv'), ctx = cv.getContext('2d');
  let width = 1, height = 1, scale = 1, ox = 0, oy = 0, dpr = 1, atlas = null;
  if (typeof Image !== 'undefined') {
    atlas = new Image(); atlas.onload = () => render(); atlas.src = '../shared/gravity-art.png';
  }
  const level = () => C.LEVELS[state.level];
  const fx = name => { if (!COVER && !paused) window.RugeFX?.emit(name); };
  function save() {
    if (COVER) return;
    progress.current = state.level; progress.draft = C.snapshot(state);
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (_) {}
  }
  function toast(text) {
    if (COVER) return;
    clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 1800);
  }
  function release() {
    pointerId = null; joystick = { x: 0, y: 0 }; input.release();
    $('#joyDot').style.transform = 'translate(-50%,-50%)';
  }
  function syncMode() {
    const touch = input.mode() === 'touch';
    for (const id of ['touchMode', 'readyTouch']) $('#' + id).classList.toggle('active', touch);
    for (const id of ['tiltMode', 'readyTilt']) $('#' + id).classList.toggle('active', !touch);
    $('#touchPad').hidden = !touch; $('#tiltGuide').hidden = touch; $('#calibrate').disabled = touch;
    $('#controlHint').textContent = '轻轻倾斜'; $('#controlHint').classList.remove('error');
    $('#readyHint').hidden = true;
  }
  async function setMode(mode) {
    release(); input.setMode(mode); state.vx = state.vy = 0; staleTime = 0;
    if (mode === 'tilt' && window.DeviceMotionEvent?.requestPermission && !window.RugeTilt) {
      try { await window.DeviceMotionEvent.requestPermission(); } catch (_) {}
    }
    if (!COVER) try { localStorage.setItem(INPUT_KEY, mode); } catch (_) {}
    syncMode(); render();
  }
  function canPlan() { return !COVER && foreground && !document.hidden && !state.won && !state.recover && level().rotors.length > 0 && $('#levels').hidden && $('#resetPanel').hidden && (result === 'ready' || result === 'run'); }
  function syncRotors() {
    const holder = $('#rotorButtons'); holder.innerHTML = ''; rotorButtons = [];
    level().rotors.forEach((rotor, index) => {
      const button = document.createElement('button'); button.className = 'rotor-button';
      button.dataset.rotor = index; button.setAttribute('aria-label', `旋转第${index + 1}个挡板`);
      button.innerHTML = '<svg viewBox="0 0 40 40"><path d="M10 18a11 11 0 1 1 4 11M10 10v8h8"/><circle cx="21" cy="20" r="4"/></svg>';
      button.addEventListener('click', () => rotateRotor(index)); holder.appendChild(button); rotorButtons.push(button);
    }); updateRotors();
  }
  function updateRotors() {
    rotorButtons.forEach((button, i) => {
      const rotor = level().rotors[i]; if (!rotor) { button.hidden = true; return; } button.style.left = `${ox + rotor.x * scale}px`; button.style.top = `${oy + rotor.y * scale}px`;
      button.hidden = !planning; button.disabled = !planning || !canPlan();
      button.classList.toggle('blocked', !C.rotationClear(state, rotor));
      button.setAttribute('aria-pressed', String(state.rotors[i] === 1));
    });
    $('#mechanism').hidden = !level().rotors.length; $('#pausePlan').hidden = !level().rotors.length;
    $('#mechanism').disabled = !planning && !canPlan();
    $('#mechanism').setAttribute('aria-pressed', String(planning));
    $('#controls').classList.toggle('planning', planning); $('#planActions').hidden = !planning;
    $('#finishPlan').textContent = result === 'ready' ? '开始' : '继续';
  }
  function enterPlan() {
    if (!canPlan()) return false;
    planning = true; paused = true; release(); state.vx = state.vy = 0; state.accumulator = 0;
    hidePanels(); updateRotors(); render(); return true;
  }
  function leavePlan(run = false) {
    if (!planning) return false;
    planning = false; updateRotors();
    if (result === 'ready') $('#ready').hidden = false;
    else if (result === 'run') { $('#pauseTitle').textContent = '休息一下'; $('#pausePanel').hidden = false; }
    render(); if (run) return result === 'ready' ? start() : resume(); return true;
  }
  function rotateRotor(index) {
    if (!planning || !canPlan()) return false;
    if (!C.rotate(state, index)) {
      window.RugeFX?.emit('error'); toast('先把球移开');
      const button = rotorButtons[index]; if (button) { button.classList.remove('shake'); void button.offsetWidth; button.classList.add('shake'); }
      return false;
    }
    window.RugeFX?.emit('select'); save(); updateRotors(); render(); return true;
  }
  function askReset() {
    if (COVER || !foreground || document.hidden) return;
    if (planning) leavePlan(); pauseGame(); release(); $('#resetPanel').hidden = false; updateRotors();
  }
  function cancelReset() { $('#resetPanel').hidden = true; updateRotors(); }
  function resetLevel() {
    if (COVER || !foreground || $('#resetPanel').hidden) return;
    loadLevel(state.level); save();
  }
  function syncHud() {
    $('#lvnum').textContent = `${state.level + 1} / ${C.LEVELS.length}`;
    $('#fruit').textContent = `${state.stars.filter(Boolean).length} / ${state.stars.length}`;
    $('#keyBadge').hidden = !level().key;
    $('#keyBadge').classList.toggle('collected', state.key);
    $('#keyBadge').style.opacity = state.key ? '1' : '.38';
  }
  function hidePanels() { for (const id of ['ready', 'pausePanel', 'win', 'levels', 'resetPanel']) $('#' + id).hidden = true; }
  function loadLevel(index, keep = false) {
    release(); planning = false; state = keep ? state : C.create(index); result = state.won ? 'win' : 'ready'; paused = true; effects = []; staleTime = 0;
    hidePanels(); $('#readyTitle').textContent = `第 ${state.level + 1} 关`;
    $('#start').textContent = keep && (state.time > 0 || state.stars.some(Boolean)) ? '继续' : '开始';
    if (state.won) showWin(false); else $('#ready').hidden = false;
    const theme = C.THEMES[level().theme];
    document.body.style.background = theme.sky; $('#stage').style.background = theme.sky;
    syncHud(); syncMode(); layout(); syncRotors(); render();
  }
  function sensorReady() {
    if (input.mode() === 'touch') return true;
    if (input.calibrate()) { state.vx = state.vy = 0; return true; }
    $('#readyHint').hidden = false; $('#controlHint').textContent = '请选触摸'; $('#controlHint').classList.add('error');
    toast('请选触摸'); return false;
  }
  function start() {
    if (COVER || !foreground || document.hidden || planning || !$('#resetPanel').hidden || state.won || result !== 'ready' || !sensorReady()) return false;
    hidePanels(); result = 'run'; paused = false; state.accumulator = 0; last = performance.now();
    updateRotors(); fx('tap'); save(); return true;
  }
  function pauseGame(reason = 'manual') {
    if (COVER || result !== 'run' || paused) return;
    paused = true; release(); state.vx = state.vy = 0; state.accumulator = 0;
    $('#pauseTitle').textContent = reason === 'sensor' ? '请选触摸' : '休息一下';
    $('#pausePanel').hidden = false; save(); render();
  }
  function resume() {
    if (COVER || !foreground || document.hidden || planning || !$('#resetPanel').hidden || result !== 'run' || !paused || !sensorReady()) return false;
    hidePanels(); paused = false; release(); state.accumulator = 0; last = performance.now(); staleTime = 0; return true;
  }
  function showWin(celebrate = true) {
    if (celebrate) fx('win');
    paused = true; result = 'win'; release();
    if (!progress.completed.includes(state.level)) progress.completed.push(state.level);
    if (state.level < 12) progress.reached = Math.max(progress.reached, Math.min(11, state.level + 1));
    else progress.mechanismReached = Math.max(progress.mechanismReached, Math.min(C.LEVELS.length - 1, state.level + 1));
    $('#stars').textContent = '★'.repeat(level().stars.length);
    $('#next').textContent = state.level === C.LEVELS.length - 1 ? '再玩一轮' : '下一关';
    $('#win').hidden = false; updateRotors(); if (celebrate) save();
  }
  function showLevels() {
    if (COVER) return;
    if (planning) leavePlan(); pauseGame(); const grid = $('#levelGrid'), mechanisms = $('#mechanismGrid'); grid.innerHTML = ''; mechanisms.innerHTML = '';
    C.LEVELS.forEach((item, i) => {
      const b = document.createElement('button'); b.textContent = i + 1; b.dataset.level = i; b.disabled = i < 12 ? i > progress.reached : i > progress.mechanismReached;
      b.setAttribute('aria-label', `第 ${i + 1} 关${b.disabled ? '，尚未解锁' : ''}`);
      b.className = `${i === state.level ? 'current ' : ''}${progress.completed.includes(i) ? 'done' : ''}`;
      b.addEventListener('click', () => {
        if (i < 12 ? i > progress.reached : i > progress.mechanismReached) return;
        if (i === state.level) { $('#levels').hidden = true; updateRotors(); return; }
        loadLevel(i); save();
      }); (i < 12 ? grid : mechanisms).appendChild(b);
    }); $('#levels').hidden = false; updateRotors();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circle(x, y, r, color, stroke, lw = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function sprite(index, x, y, size) {
    if (!atlas || !atlas.complete || !atlas.naturalWidth) return false;
    const rects = [[74,102,324,322],[484,77,364,342],[935,86,360,331],[1363,27,370,400],[45,466,374,373],[481,466,374,373],[920,463,376,376],[1358,463,375,376]];
    const [sx,sy,sw,sh] = rects[index];
    ctx.drawImage(atlas, sx, sy, sw, sh, x - size / 2, y - size / 2, size, size); return true;
  }
  function drawStar(x, y, r, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha;
    if (!sprite(1, x, y, r * 2.2)) {
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? r * .48 : r; const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = '#ffc84f'; ctx.fill();
    } ctx.restore();
  }
  function drawKey(x, y) {
    if (sprite(2, x, y, 37)) return;
    ctx.strokeStyle = '#e7aa36'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x - 5, y - 5, 6, 0, Math.PI * 2); ctx.moveTo(x, y); ctx.lineTo(x + 10, y + 10); ctx.lineTo(x + 14, y + 6); ctx.stroke();
  }
  function layout() {
    const rect = $('#stage').getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min((width - 12) / level().w, (height - 10) / level().h); ox = (width - level().w * scale) / 2; oy = (height - level().h * scale) / 2; updateRotors();
  }
  function render() {
    const lv = level(), theme = C.THEMES[lv.theme];
    ctx.clearRect(0, 0, width, height); ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    // The quiet board leaves room for a legible maze. No ornamental walls or fake wood.
    roundRect(3, 5, lv.w - 6, lv.h - 6, 21); ctx.fillStyle = theme.border + '35'; ctx.fill();
    roundRect(3, 1, lv.w - 6, lv.h - 7, 21); ctx.fillStyle = theme.floor; ctx.fill();
    for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++) {
      const cx = C.PAD + (x + .5) * C.CELL, cy = C.PAD + (y + .5) * C.CELL;
      circle(cx, cy, 2, theme.rail + '24');
    }
    for (const hole of lv.holes) {
      circle(hole.x, hole.y, hole.r + 4, '#e5b2a2'); circle(hole.x, hole.y, hole.r, '#536578'); circle(hole.x - 2, hole.y - 2, hole.r - 5, '#35485b');
    }
    // Draw exactly the same rectangles that the collision solver consumes.
    for (const wall of lv.walls) {
      roundRect(wall.x, wall.y + 2, wall.w, wall.h, Math.min(3, wall.w / 2, wall.h / 2)); ctx.fillStyle = theme.border; ctx.fill();
      roundRect(wall.x, wall.y, wall.w, wall.h, Math.min(3, wall.w / 2, wall.h / 2)); ctx.fillStyle = theme.rail; ctx.fill();
    }
    if (lv.gate && !state.key) {
      const g = lv.gate; roundRect(g.x, g.y, g.w, g.h, 3); ctx.fillStyle = '#edb44f'; ctx.fill();
      ctx.save(); ctx.translate(g.x + g.w / 2, g.y + g.h / 2); circle(0, 0, 10, '#fff1bb', '#d8a244', 2);
      roundRect(-5, -1, 10, 9, 2); ctx.fillStyle = '#ce9440'; ctx.fill(); ctx.strokeStyle = '#ce9440'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -1, 3.5, Math.PI, 0); ctx.stroke(); ctx.restore();
    }
    lv.rotors.forEach((rotor, i) => {
      const wall = C.rotorWall(rotor, state.rotors[i]);
      roundRect(wall.x, wall.y + 2, wall.w, wall.h, 4); ctx.fillStyle = '#cc8d39'; ctx.fill();
      roundRect(wall.x, wall.y, wall.w, wall.h, 4); ctx.fillStyle = state.rotors[i] ? '#ffc95f' : '#f2aa66'; ctx.fill();
      circle(rotor.x, rotor.y, 7, '#fff3c5', '#c58e3e', 2); circle(rotor.x, rotor.y, 2.4, '#cc9346');
    });
    for (const bumper of lv.bumpers) { circle(bumper.x, bumper.y + 2, bumper.r + 2, '#c07792'); circle(bumper.x, bumper.y, bumper.r, '#f4a8bb', '#df86a2', 2); circle(bumper.x - 3, bumper.y - 4, 4, '#ffd9df'); }
    const open = C.goalOpen(state), g = lv.goal;
    if (open) { ctx.globalAlpha = .11; circle(g.x, g.y, g.r + 7 + Math.sin(state.time * 3) * 2, theme.border); ctx.globalAlpha = 1; }
    ctx.save(); ctx.globalAlpha = open ? 1 : .46;
    if (!sprite(3, g.x, g.y, g.r * 2.4)) { circle(g.x, g.y, g.r, '#a9d690', theme.border, 4); ctx.strokeStyle = '#428774'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(g.x - 8, g.y); ctx.lineTo(g.x - 2, g.y + 6); ctx.lineTo(g.x + 9, g.y - 7); ctx.stroke(); }
    ctx.restore();
    if (!open) { ctx.fillStyle = '#7fa98b'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', g.x, g.y + 5); }
    lv.stars.forEach((star, i) => { if (!state.stars[i]) drawStar(star.x, star.y, star.r); });
    if (lv.key && !state.key) drawKey(lv.key.x, lv.key.y);
    const shrink = state.recover ? Math.max(.08, state.recover / .5) : 1;
    ctx.save(); ctx.translate(state.x, state.y); ctx.scale(shrink, shrink);
    circle(1, 4, C.RADIUS, '#46657338');
    if (!sprite(0, 0, 0, C.RADIUS * 2)) {
      circle(0, 0, C.RADIUS, '#b8d6e3', '#6c95b3', 1.5); circle(-3, -4, C.RADIUS * .58, '#e3f2f6'); circle(-4, -5, 3, '#ffffff');
    }
    ctx.restore();
    for (const item of effects) { ctx.save(); ctx.globalAlpha = item.life; drawStar(item.x, item.y - (1 - item.life) * 26, 10 + (1 - item.life) * 6); ctx.restore(); }
    ctx.restore();
  }
  function applyEvents(events) {
    let hud = false;
    for (const name of events) {
      if (name === 'star') { fx('collect'); effects.push({ x: state.x, y: state.y, life: 1 }); hud = true; save(); }
      if (name === 'key') { fx('success'); toast('开门啦！'); hud = true; save(); }
      if (name === 'bump') fx('land');
      if (name === 'fall') { fx('error'); toast('再来！'); save(); }
      if (name === 'win') { hud = true; showWin(); }
    }
    if (hud) syncHud();
  }
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(.05, Math.max(0, (now - last) / 1000 || 0)); last = now;
    if (paused || COVER) return;
    const motion = input.read(dt);
    if (input.mode() === 'tilt' && (!motion.available || !motion.fresh)) {
      staleTime += dt; if (staleTime > .4) { pauseGame('sensor'); return; }
    } else staleTime = 0;
    const touch = input.mode() === 'touch', multiplier = touch ? .24 : 1;
    const x = motion.fresh || touch ? motion.x * multiplier : 0, y = motion.fresh || touch ? motion.y * multiplier : 0;
    applyEvents(C.advance(state, x, y, dt));
    effects.forEach(item => { item.life -= dt * 1.8; }); effects = effects.filter(item => item.life > 0);
    saveClock += dt; if (saveClock > 1.5) { saveClock = 0; save(); }
    render();
  }
  const pad = $('#touchPad');
  function movePad(event) {
    const rect = pad.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / 34, y = (event.clientY - rect.top - rect.height / 2) / 34;
    const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
    joystick = { x, y }; input.setTouch(x, y);
    $('#joyDot').style.transform = `translate(calc(-50% + ${x * 20}px),calc(-50% + ${y * 20}px))`;
  }
  pad.addEventListener('pointerdown', event => {
    if (paused || input.mode() !== 'touch' || pointerId !== null) return;
    event.preventDefault(); pointerId = event.pointerId; try { pad.setPointerCapture(event.pointerId); } catch (_) {} movePad(event);
  }, { passive: false });
  pad.addEventListener('pointermove', event => { if (event.pointerId !== pointerId) return; event.preventDefault(); movePad(event); }, { passive: false });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(name, event => { if (event.pointerId === pointerId) release(); });
  for (const id of ['tiltMode', 'readyTilt']) $('#' + id).addEventListener('click', () => setMode('tilt'));
  for (const id of ['touchMode', 'readyTouch']) $('#' + id).addEventListener('click', () => setMode('touch'));
  $('#calibrate').addEventListener('click', () => {
    if (input.mode() !== 'tilt') return;
    if (input.calibrate()) { state.vx = state.vy = 0; toast('校准好了'); } else toast('请选触摸');
  });
  $('#start').addEventListener('click', start); $('#pause').addEventListener('click', () => { if (planning) leavePlan(); else pauseGame(); }); $('#resume').addEventListener('click', resume);
  $('#pauseTouch').addEventListener('click', async () => { await setMode('touch'); resume(); });
  $('#retry').addEventListener('click', askReset); $('#winRetry').addEventListener('click', () => { if (!COVER) { loadLevel(state.level); save(); } });
  $('#reset').addEventListener('click', askReset); $('#resetYes').addEventListener('click', resetLevel); $('#resetNo').addEventListener('click', cancelReset);
  $('#mechanism').addEventListener('click', () => planning ? leavePlan() : enterPlan()); $('#finishPlan').addEventListener('click', () => leavePlan(true));
  $('#pausePlan').addEventListener('click', enterPlan);
  $('#next').addEventListener('click', () => { if (!state.won) return; loadLevel(state.level === C.LEVELS.length - 1 ? 0 : state.level + 1); save(); });
  $('#levelBtn').addEventListener('click', showLevels); $('#pauseLevels').addEventListener('click', showLevels); $('#closeLevels').addEventListener('click', () => { $('#levels').hidden = true; updateRotors(); });
  $('#home').addEventListener('click', () => { save(); release(); input.destroy(); if (window.RugeNav?.home) window.RugeNav.home(); else location.href = '../index.html'; });
  addEventListener('ruge:pause', () => { foreground = false; if (planning) leavePlan(); pauseGame('background'); release(); updateRotors(); });
  addEventListener('ruge:resume', () => { foreground = true; last = performance.now(); updateRotors(); });
  addEventListener('ruge:orientation', () => { if (planning) leavePlan(); pauseGame('orientation'); release(); layout(); render(); });
  addEventListener('resize', () => { layout(); render(); }); addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { foreground = false; if (planning) leavePlan(); pauseGame('background'); release(); } else foreground = true; updateRotors(); last = performance.now(); });
  addEventListener('pagehide', () => { save(); input.destroy(); });
  window.__game = {
    ...C, input, loadLevel, start, pause: pauseGame, resume, setMode, showLevels, save, enterPlan, leavePlan, rotateRotor, askReset, resetLevel,
    state: () => ({ ...clone(state), li: state.level, result, paused, planning, foreground, mode: input.mode(), progress: clone(progress) }),
    world: () => ({ level: level(), ball: state }), render, progressFrom,
  };
  if (COVER) {
    document.body.classList.add('cover'); state = C.create(12);
    result = 'run'; paused = true; hidePanels(); syncHud(); layout(); render();
  } else { loadLevel(state.level, true); requestAnimationFrame(frame); }
})();
