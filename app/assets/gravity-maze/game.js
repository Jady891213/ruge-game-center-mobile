(function () {
  'use strict';
  const C = window.MarbleMaze, $ = s => document.querySelector(s);
  const COVER = /(?:\?|&)cover=1(?:&|$)/.test(location.search);
  const KEY = 'rugeMarbleMazeV1';
  const clone = value => JSON.parse(JSON.stringify(value));
  function read(key) { if (COVER) return null; try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function progressFrom(raw, legacy) {
    if (raw?.schema === 1) {
      const reached = C.clamp(Math.floor(Number(raw.reached) || 0), 0, 11);
      const completed = Array.isArray(raw.completed) ? [...new Set(raw.completed.filter(i => Number.isInteger(i) && i >= 0 && i < C.LEVELS.length))] : [];
      // Finishing the old final mechanism unlocks the newly appended chapter.
      const completedNext = Math.max(11, ...completed.filter(i => i >= 12)) + 1;
      const mechanismReached = C.clamp(Math.max(Math.floor(Number(raw.mechanismReached) || 12), completedNext), 12, C.LEVELS.length - 1);
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
  let foreground = true, rotorButtons = [], pendingStart = null, canvasTap = null;
  let countdownRemaining = null, countdownDigit = null;
  // The marble tray always uses the physical horizontal plane, never a saved pose.
  const input = window.RugeMotion.create({ reference: 'flat' });
  if (!COVER) {
    input.setMode('tilt');
    if (!window.RugeTilt && !input.status().available) input.setMode('touch');
  }
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
    canvasTap = null; pointerId = null; joystick = { x: 0, y: 0 }; input.release();
    $('#joyDot').style.transform = 'translate(-50%,-50%)';
  }
  function syncMode() {
    const touch = input.mode() === 'touch';
    $('#controls').hidden = !touch; $('#touchPad').hidden = !touch;
    document.body.classList.toggle('touch-input', touch);
    layout();
  }
  async function setMode(mode) {
    release(); input.setMode(mode); state.vx = state.vy = 0; staleTime = 0;
    syncMode(); render();
  }
  function canRotate() {
    return !COVER && foreground && !document.hidden && !state.won && !state.recover &&
      level().rotors.length > 0 && $('#levels').hidden && $('#resetPanel').hidden &&
      $('#pausePanel').hidden && $('#flatGuide').hidden &&
      (result === 'ready' || result === 'run' && !paused);
  }
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
      const rotor = level().rotors[i]; if (!rotor) { button.hidden = true; return; }
      button.style.left = `${ox + rotor.x * scale}px`; button.style.top = `${oy + rotor.y * scale}px`;
      button.hidden = !canRotate(); button.disabled = !canRotate();
      button.classList.toggle('blocked', !C.rotationClear(state, rotor));
      button.setAttribute('aria-pressed', String(state.rotors[i] === 1));
    });
  }
  function rotateRotor(index) {
    if (!canRotate()) return false;
    if (!C.rotate(state, index)) {
      window.RugeFX?.emit('error'); toast('球先让一让');
      const button = rotorButtons[index]; if (button) { button.classList.remove('shake'); void button.offsetWidth; button.classList.add('shake'); }
      return false;
    }
    window.RugeFX?.emit('select'); save(); updateRotors(); render(); return true;
  }
  function askReset() {
    if (COVER || !foreground || document.hidden) return;
    window.RugeBack?.clearPause();
    cancelWaiting(); pauseGame(); release(); $('#resetPanel').hidden = false; updateRotors();
  }
  function cancelReset() { $('#resetPanel').hidden = true; if (result === 'run' && paused) $('#pausePanel').hidden = false; updateRotors(); }
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
  function hidePanels() { for (const id of ['ready', 'pausePanel', 'win', 'levels', 'resetPanel', 'flatGuide']) $('#' + id).hidden = true; }
  function loadLevel(index, keep = false) {
    release(); input.resetPosture?.(); pendingStart = null; resetCountdown(); state = keep ? state : C.create(index); result = state.won ? 'win' : 'ready'; paused = true; effects = []; staleTime = 0;
    hidePanels(); $('#readyTitle').textContent = `第 ${state.level + 1} 关`;
    $('#start').textContent = keep && (state.time > 0 || state.stars.some(Boolean)) ? '继续' : '开始';
    if (state.won) showWin(false); else $('#ready').hidden = false;
    const theme = C.THEMES[level().theme];
    document.body.style.background = theme.sky; $('#stage').style.background = theme.sky;
    syncHud(); syncMode(); layout(); syncRotors(); render();
  }
  function posture(dt = 0) {
    return input.flatReady(dt);
  }
  function resetCountdown() { countdownRemaining = countdownDigit = null; $('#flatProgress').style.setProperty('--fill','0%'); $('#flatProgress').setAttribute('aria-valuenow','0'); }
  function updateFlatGuide(value, dt = 0) {
    $('#flatTouch').hidden = !!value.available;
    $('#flatProgress').classList.toggle('is-flat', !!value.flat);
    $('#flatProgress').classList.toggle('is-stable', !!value.stable);
    // Qualify stability once, then tolerate small hand movements inside the flat range.
    const ready = value.available && value.fresh && value.flat && (value.stable || countdownRemaining !== null);
    if (!ready) resetCountdown();
    else if (countdownRemaining === null) countdownRemaining = 2;
    else countdownRemaining = Math.max(0, countdownRemaining - dt);
    const digit = ready ? Math.max(1, Math.ceil(countdownRemaining)) : null;
    const title = ready ? '放好啦！' : '手机放平', text = ready ? String(digit) : '';
    if ($('#flatTitle').textContent !== title) $('#flatTitle').textContent = title;
    $('#flatCountdown').hidden = !ready;
    if ($('#flatCountdown').textContent !== text) $('#flatCountdown').textContent = text;
    const fill = ready ? Math.min(1,.2+(2-countdownRemaining)/2*.8) : value.flat&&value.fresh ? Math.min(1,(value.elapsed||0)/.5)*.2 : 0;
    $('#flatProgress').hidden = false;
    $('#flatProgress').style.setProperty('--fill',(fill*100).toFixed(1)+'%');
    $('#flatProgress').setAttribute('aria-valuenow',String(Math.round(fill*100)));
    $('#flatProgress').setAttribute('aria-label',ready?'放平进度 '+Math.round(fill*100)+'%':'正在检测水平');
    $('#flatGuide').classList.toggle('is-ready', !!ready);
    if (digit !== null && digit !== countdownDigit) window.RugeFX?.emit('select');
    countdownDigit = digit;
    if (ready && countdownRemaining === 0) beginRun();
  }
  function beginRun() {
    if (!foreground || document.hidden || !pendingStart || state.won) return false;
    pendingStart = null; resetCountdown(); hidePanels(); result = 'run'; paused = false; release();
    state.vx = state.vy = 0; state.accumulator = 0; staleTime = 0; last = performance.now();
    updateRotors(); fx('tap'); save(); return true;
  }
  function requestStart(kind) {
    if (COVER || !foreground || document.hidden || !$('#resetPanel').hidden || !$('#levels').hidden || state.won) return false;
    if (kind === 'resume' ? result !== 'run' || !paused : result !== 'ready') return false;
    canvasTap = null; pendingStart = kind; resetCountdown();
    if (input.mode() === 'touch') return beginRun();
    const value = posture();
    // A freshly flat phone continues straight into the next level; no second Start tap.
    if (value.available && value.fresh && value.flat && (value.stable || kind === 'next')) return beginRun();
    hidePanels(); $('#flatGuide').hidden = false; updateFlatGuide(value); updateRotors(); return false;
  }
  function start() { return requestStart('start'); }
  function cancelWaiting() {
    if (!pendingStart) return;
    pendingStart = null; resetCountdown(); $('#flatGuide').hidden = true;
    if (result === 'ready') $('#ready').hidden = false;
    else if (result === 'run') { $('#pauseTitle').textContent = '休息一下'; $('#pausePanel').hidden = false; }
    updateRotors();
  }
  function pauseGame(reason = 'manual') {
    cancelWaiting();
    if (COVER || result !== 'run' || paused) return;
    paused = true; release(); input.resetPosture?.(); state.vx = state.vy = 0; state.accumulator = 0;
    $('#pauseTitle').textContent = '休息一下';
    const value = input.posture(); $('#pauseTouch').hidden = !!value.available;
    $('#pausePanel').hidden = false; updateRotors(); save(); render();
  }
  function resume() { return requestStart('resume'); }
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
  let backLevelMenu = false;
  function showLevels() {
    window.RugeBack?.clearPause();
    backLevelMenu = false;
    if (COVER) return;
    cancelWaiting(); pauseGame(); release(); const grid = $('#levelGrid'), mechanisms = $('#mechanismGrid'); grid.innerHTML = ''; mechanisms.innerHTML = '';
    C.LEVELS.forEach((item, i) => {
      const b = document.createElement('button'); b.textContent = i + 1; b.dataset.level = i; b.disabled = i < 12 ? i > progress.reached : i > progress.mechanismReached;
      b.setAttribute('aria-label', `第 ${i + 1} 关${b.disabled ? '，尚未解锁' : ''}`);
      b.className = `${i === state.level ? 'current ' : ''}${progress.completed.includes(i) ? 'done' : ''}`;
      b.addEventListener('click', () => {
        backLevelMenu = false;
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
    if (COVER) return;
    if (foreground && !document.hidden && input.mode() === 'tilt' && paused) {
      const value = posture(dt);
      if (pendingStart) {
        updateFlatGuide(value, dt);
      }
    }
    if (paused) return;
    const motion = input.read(dt);
    if (input.mode() === 'tilt' && (!motion.available || !motion.fresh)) {
      staleTime += dt; if (staleTime > .4) { pauseGame('sensor'); return; }
    } else staleTime = 0;
    const touch = input.mode() === 'touch', multiplier = touch ? .24 : 1;
    const x = motion.fresh || touch ? motion.x * multiplier : 0, y = motion.fresh || touch ? motion.y * multiplier : 0;
    applyEvents(C.advance(state, x, y, dt));
    effects.forEach(item => { item.life -= dt * 1.8; }); effects = effects.filter(item => item.life > 0);
    saveClock += dt; if (saveClock > 1.5) { saveClock = 0; save(); }
    updateRotors(); render();
  }
  // The entire orange bar is a target, not only its circular rotation icon.
  // Listen on the Canvas itself: sibling DOM buttons cannot double-submit a tap.
  cv.addEventListener('pointerdown', event => {
    if (!canRotate() || canvasTap || event.isPrimary === false || event.button != null && event.button !== 0) return;
    event.preventDefault();
    canvasTap = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), moved: false };
    try { cv.setPointerCapture(event.pointerId); } catch (_) {}
  }, { passive: false });
  cv.addEventListener('pointermove', event => {
    if (canvasTap?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - canvasTap.x, event.clientY - canvasTap.y) >= 12) canvasTap.moved = true;
  });
  cv.addEventListener('pointerup', event => {
    const tap = canvasTap;
    if (!tap || tap.id !== event.pointerId) return;
    canvasTap = null;
    if (tap.moved || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) >= 12 || performance.now() - tap.time >= 700 || !canRotate()) return;
    const rect = cv.getBoundingClientRect(), x = (event.clientX - rect.left - ox) / scale, y = (event.clientY - rect.top - oy) / scale;
    let closest = -1, distance = Infinity;
    level().rotors.forEach((rotor, index) => {
      const bar = C.rotorWall(rotor, state.rotors[index]);
      const dx = Math.max(bar.x - x, 0, x - bar.x - bar.w), dy = Math.max(bar.y - y, 0, y - bar.y - bar.h);
      const d = Math.hypot(dx, dy);
      if (d < distance) { closest = index; distance = d; }
    });
    if (closest >= 0 && distance * scale <= 22) { event.preventDefault(); rotateRotor(closest); }
  }, { passive: false });
  for (const name of ['pointercancel', 'lostpointercapture']) cv.addEventListener(name, event => {
    if (canvasTap?.id === event.pointerId) canvasTap = null;
  });
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
  $('#start').addEventListener('click', start); $('#pause').addEventListener('click', () => pauseGame()); $('#resume').addEventListener('click', resume);
  $('#pauseTouch').addEventListener('click', async () => { await setMode('touch'); resume(); });
  $('#flatTouch').addEventListener('click', async () => { const action = pendingStart; await setMode('touch'); if (action && foreground && !document.hidden) beginRun(); });
  $('#cancelFlat').addEventListener('click', cancelWaiting);
  $('#retry').addEventListener('click', askReset); $('#winRetry').addEventListener('click', () => { if (!COVER) { loadLevel(state.level); save(); } });
  $('#reset').addEventListener('click', askReset); $('#resetYes').addEventListener('click', resetLevel); $('#resetNo').addEventListener('click', cancelReset);
  $('#next').addEventListener('click', () => {
    if (COVER || !foreground || document.hidden || !state.won || $('#win').hidden) return;
    loadLevel(state.level === C.LEVELS.length - 1 ? 0 : state.level + 1);
    requestStart('next'); save();
  });
  $('#levelBtn').addEventListener('click', showLevels); $('#pauseLevels').addEventListener('click', showLevels); $('#closeLevels').addEventListener('click', () => { backLevelMenu = false; $('#levels').hidden = true; if (result === 'run' && paused) $('#pausePanel').hidden = false; updateRotors(); });
  $('#home').addEventListener('click', () => window.RugeBack.handle());
  addEventListener('ruge:pause', () => { foreground = false; cancelWaiting(); pauseGame('background'); release(); updateRotors(); });
  addEventListener('ruge:resume', () => { foreground = true; last = performance.now(); updateRotors(); });
  addEventListener('ruge:orientation', () => { cancelWaiting(); pauseGame('orientation'); release(); layout(); render(); });
  addEventListener('resize', () => { layout(); render(); }); addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { foreground = false; cancelWaiting(); pauseGame('background'); release(); } else foreground = true; updateRotors(); last = performance.now(); });
  addEventListener('pagehide', () => { save(); input.destroy(); });
  window.__game = {
    ...C, input, loadLevel, start, pause: pauseGame, resume, setMode, showLevels, save, rotateRotor, askReset, resetLevel,
    state: () => ({ ...clone(state), li: state.level, result, paused, planning: false, waitingFlat: !!pendingStart, foreground, mode: input.mode(), progress: clone(progress) }),
    world: () => ({ level: level(), ball: state }), render, progressFrom, posture, cancelWaiting,
  };
  if (COVER) {
    document.body.classList.add('cover'); state = C.create(12);
    result = 'run'; paused = true; hidePanels(); syncHud(); layout(); render();
  } else { loadLevel(state.level, true); requestAnimationFrame(frame); }
window.onRugeBack=()=>{if(!$('#pausePanel').hidden&&$('#levels').hidden&&$('#resetPanel').hidden)return window.RugeBack.closePause(()=>{$('#pausePanel').hidden=true;},resume);if(!$('#resetPanel').hidden){cancelReset();return true;}if(!$('#levels').hidden){if(backLevelMenu)return false;$('#levels').hidden=true;updateRotors();return true;}if(pendingStart){cancelWaiting();return true;}showLevels();backLevelMenu=true;return true;};
})();
