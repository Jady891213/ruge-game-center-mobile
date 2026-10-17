/* Original authored mazes and fixed-step rolling physics. No rendering or input APIs. */
(function (root) {
  'use strict';
  const CELL = 64, PAD = 16, WALL = 8, RADIUS = 14;
  const STEP = 1 / 120, ACCELERATION = 2600, MAX_SPEED = 220, DRAG = .72;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const edgeId = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const THEMES = [
    { name: '薄荷花园', floor: '#f3f8dd', rail: '#63bba5', railLight: '#8bd3bd', border: '#369e8b', accent: '#ffbd52', sky: '#e6f5ed' },
    { name: '晴空小岛', floor: '#f1f8ff', rail: '#73b9e3', railLight: '#a3d9ed', border: '#428fb8', accent: '#ffbb62', sky: '#e6f3ff' },
    { name: '珊瑚乐园', floor: '#fff5e7', rail: '#eea4a1', railLight: '#f6c1ae', border: '#ce7c82', accent: '#a7c877', sky: '#fff0eb' },
  ];
  // Routes are deliberate, not random: a gentle introduction followed by wider mazes.
  // Extra rooms are short branches. They never bypass a key gate on the main route.
  const SPECS = [
    [3, 4, [9, 6, 7, 4, 1, 2], [2, 4]],
    [3, 4, [9, 10, 7, 6, 3, 4, 1, 2], [2, 4, 6]],
    [3, 4, [9, 10, 11, 8, 7, 4, 3, 0, 1, 2], [2, 5, 8]],
    [3, 4, [9, 6, 3, 4, 7, 8, 5, 2, 1, 0], [2, 5, 8], 3, 6],
    [4, 5, [16, 12, 8, 9, 10, 6, 2, 3], [2, 4, 6], -1, -1, 1],
    [4, 5, [16, 17, 13, 9, 8, 4, 5, 6, 10, 11, 7, 3], [2, 6, 10], 4, 8],
    [4, 5, [16, 12, 13, 14, 10, 9, 5, 6, 7, 3], [2, 5, 8], -1, -1, 1, 1],
    [4, 5, [16, 17, 18, 14, 13, 9, 10, 6, 5, 1, 2, 3], [2, 6, 10], 4, 8, 1],
    [5, 6, [25, 20, 21, 16, 11, 12, 17, 18, 13, 8, 3, 4], [3, 6, 10], -1, -1, 1, 1],
    [5, 6, [25, 26, 21, 20, 15, 10, 11, 6, 7, 12, 13, 8, 9, 4], [3, 8, 12], 5, 10, 1],
    [5, 6, [25, 20, 15, 16, 17, 12, 11, 6, 1, 2, 3, 8, 9, 4], [3, 7, 12], -1, -1, 2, 1],
    [5, 6, [25, 26, 27, 22, 21, 16, 17, 18, 13, 12, 7, 6, 1, 2, 3, 4], [3, 8, 13], 5, 11, 2, 1],
  ];
  function neighbours(cell, cols, rows) {
    const x = cell % cols, y = Math.floor(cell / cols), out = [];
    if (x > 0) out.push(cell - 1);
    if (y > 0) out.push(cell - cols);
    if (x < cols - 1) out.push(cell + 1);
    if (y < rows - 1) out.push(cell + cols);
    return out;
  }
  function makeLevel(spec, index) {
    const [cols, rows, route, starSteps, keyStep = -1, gateStep = -1, holes = 0, bumpers = 0] = spec;
    const center = cell => ({ x: PAD + (cell % cols + .5) * CELL, y: PAD + (Math.floor(cell / cols) + .5) * CELL, cell });
    const edges = new Set(), visited = new Set(route);
    for (let i = 1; i < route.length; i++) {
      if (!neighbours(route[i - 1], cols, rows).includes(route[i])) throw new Error('Non-adjacent authored route');
      edges.add(edgeId(route[i - 1], route[i]));
    }
    // Connect every side room once. This preserves the authored main route and gate order.
    while (visited.size < cols * rows) {
      for (let j = 0; j < cols * rows; j++) {
        const cell = (j + index * 3) % (cols * rows);
        if (visited.has(cell)) continue;
        const parent = neighbours(cell, cols, rows).find(n => visited.has(n));
        if (parent === undefined) continue;
        edges.add(edgeId(cell, parent)); visited.add(cell);
      }
    }
    const walls = [], half = WALL / 2;
    const rect = (x, y, w, h) => ({ x, y, w, h });
    walls.push(rect(PAD - half, PAD - half, cols * CELL + WALL, WALL));
    walls.push(rect(PAD - half, PAD + rows * CELL - half, cols * CELL + WALL, WALL));
    walls.push(rect(PAD - half, PAD - half, WALL, rows * CELL + WALL));
    walls.push(rect(PAD + cols * CELL - half, PAD - half, WALL, rows * CELL + WALL));
    for (let cell = 0; cell < cols * rows; cell++) {
      const x = cell % cols, y = Math.floor(cell / cols);
      if (x < cols - 1 && !edges.has(edgeId(cell, cell + 1))) walls.push(rect(PAD + (x + 1) * CELL - half, PAD + y * CELL - half, WALL, CELL + WALL));
      if (y < rows - 1 && !edges.has(edgeId(cell, cell + cols))) walls.push(rect(PAD + x * CELL - half, PAD + (y + 1) * CELL - half, CELL + WALL, WALL));
    }
    const degree = cell => neighbours(cell, cols, rows).filter(n => edges.has(edgeId(cell, n))).length;
    const branches = Array.from({ length: cols * rows }, (_, n) => n).filter(cell => !route.includes(cell) && degree(cell) === 1);
    const holeList = branches.slice(0, holes).map(cell => ({ ...center(cell), r: 15 }));
    const bumperList = branches.slice(holes, holes + bumpers).map(cell => ({ ...center(cell), r: 13 }));
    let gate = null;
    if (gateStep >= 1) {
      const a = center(route[gateStep - 1]), b = center(route[gateStep]);
      const vertical = a.y === b.y;
      gate = { ...rect((a.x + b.x) / 2 - (vertical ? half : CELL / 2 + half), (a.y + b.y) / 2 - (vertical ? CELL / 2 + half : half), vertical ? WALL : CELL + WALL, vertical ? CELL + WALL : WALL), edge: edgeId(a.cell, b.cell) };
    }
    return {
      id: index, cols, rows, w: cols * CELL + PAD * 2, h: rows * CELL + PAD * 2,
      theme: Math.floor(index / 4), route: route.slice(), edges: [...edges], walls,
      start: center(route[0]), goal: { ...center(route.at(-1)), r: 20 },
      stars: starSteps.map(n => ({ ...center(route[n]), r: 13 })),
      key: keyStep >= 0 ? center(route[keyStep]) : null, gate, holes: holeList, bumpers: bumperList, rotors: [],
    };
  }
  const LEVELS = SPECS.map(makeLevel);
  // Each hinge joins the left and upper edge of one room. The bar can close
  // either edge; later layouts require both states, with a safe pocket to turn it.
  const MECHANISMS = [
    { spec: [4, 5, [16,12,8,9,10,6,2,3], [1,4,6]], hinges: [[9,0]] },
    { spec: [4, 5, [16,17,13,9,8,4,5,6,10,11,7,3], [1,6,10]], hinges: [[13,1]] },
    { spec: [4, 5, [16,12,8,9,10,6,2,3], [1,4,6]], hinges: [[9,0],[3,0]] },
    { spec: [5, 5, [20,15,10,11,12,7,2,3,4,9,14,19,24], [1,5,10]], hinges: [[11,0],[19,1]] },
    { spec: [5, 5, [10,11,12,13,14,13,12,7,2,3,4], [1,4,8]], hinges: [[12,0]] },
    { spec: [5, 6, [25,20,15,16,17,18,19,18,17,12,11,6,7,8,9,8,7,2,3,4], [2,6,14]], hinges: [[17,0],[7,0]] },
    { spec: [4, 5, [16,17,13,9,8,4,0,1,2,3], [1,4,8]], hinges: [[13,1]] },
    { spec: [4, 5, [16,12,8,9,10,11,7,3,2,6,5,1,0], [2,5,10]], hinges: [[9,0],[7,1]] },
    { spec: [5, 5, [20,15,10,11,12,13,14,13,12,7,2,3,4], [1,6,11]], hinges: [[12,0]] },
    { spec: [5, 5, [24,23,22,17,12,7,6,5,0,5,6,7,2,3,4], [2,8,13]], hinges: [[7,0]] },
    { spec: [5, 6, [25,26,21,16,11,12,13,14,13,12,7,6,5,0,1,2,3,4], [1,7,13]], hinges: [[12,0],[7,0]] },
    { spec: [5, 6, [29,28,27,22,17,16,15,16,17,12,13,14,9,8,7,6,5,6,7,2,3,4], [2,6,16]], hinges: [[17,0],[7,0]] },
  ];
  MECHANISMS.forEach((item, offset) => {
    const level = makeLevel(item.spec, LEVELS.length);
    level.theme = Math.floor(offset / 2) % THEMES.length; level.mechanism = true;
    level.rotors = item.hinges.map(([cell, initial], id) => ({
      id, cell, x: PAD + cell % level.cols * CELL, y: PAD + Math.floor(cell / level.cols) * CELL,
      length: CELL, initial,
      edges: [cell % level.cols ? edgeId(cell - 1, cell) : null, cell >= level.cols ? edgeId(cell - level.cols, cell) : null],
    }));
    LEVELS.push(level);
  });
  function rotorWall(rotor, orientation) {
    const h = WALL / 2;
    return orientation === 1
      ? { x: rotor.x - h, y: rotor.y - h, w: rotor.length + WALL, h: WALL }
      : { x: rotor.x - h, y: rotor.y - h, w: WALL, h: rotor.length + WALL };
  }
  function orientations(level, state) { return level.rotors.map((r, i) => state?.rotors?.[i] ?? r.initial); }
  function allWalls(level, state) {
    return [...level.walls, ...(level.gate && !state.key ? [level.gate] : []), ...level.rotors.map((rotor, i) => rotorWall(rotor, orientations(level, state)[i]))];
  }
  function rotationClear(state, rotor) {
    // The hinge sweeps only the positive-x/positive-y quarter-disc between its
    // two visible bars. A full disc wrongly rejects safe balls above/left of it.
    // Project onto that closed sector, then Minkowski-expand by the ball and
    // square bar caps. sqrt(2)*halfWall bounds every rotated rectangle corner.
    const dx = state.x - rotor.x, dy = state.y - rotor.y;
    let qx = Math.max(0, dx), qy = Math.max(0, dy);
    const radius = Math.hypot(qx, qy);
    if (radius > rotor.length) { qx *= rotor.length / radius; qy *= rotor.length / radius; }
    const speed = Math.min(MAX_SPEED, Math.hypot(Number(state.vx) || 0, Number(state.vy) || 0));
    const clearance = RADIUS + Math.SQRT2 * WALL / 2 + 2 + speed * STEP;
    return Math.hypot(dx - qx, dy - qy) > clearance;
  }
  function rotate(state, index) {
    const level = LEVELS[state.level], rotor = level?.rotors[index];
    if (!rotor || state.won || state.recover || !rotationClear(state, rotor)) return false;
    const next = orientations(level, state); next[index] = 1 - next[index];
    const candidate = { ...state, rotors: next };
    if (!positionClear(level, candidate, state.x, state.y)) return false;
    state.rotors = next; state.vx = state.vy = 0; state.accumulator = 0;
    // Existing checkpoints are normally cell centres, clear in either orientation.
    // Keep a validated fallback so a future authored layout cannot respawn in a bar.
    if (!positionClear(level, state, state.checkpoint.x, state.checkpoint.y)) {
      const safe = [level.start, ...level.stars.filter((_, i) => state.stars[i]), ...(state.key && level.key ? [level.key] : [])]
        .filter(p => positionClear(level, state, p.x, p.y)).sort((a,b) => Math.hypot(a.x-state.x,a.y-state.y)-Math.hypot(b.x-state.x,b.y-state.y))[0];
      if (safe) state.checkpoint = { x: safe.x, y: safe.y };
    }
    return true;
  }
  function circleHit(x, y, r, wall) {
    const dx = x - clamp(x, wall.x, wall.x + wall.w), dy = y - clamp(y, wall.y, wall.y + wall.h);
    return dx * dx + dy * dy < r * r - .0001;
  }
  function positionClear(level, state, x, y) {
    return !allWalls(level, state).some(w => circleHit(x, y, RADIUS, w)) && !level.bumpers.some(b => Math.hypot(x - b.x, y - b.y) < RADIUS + b.r - .00001);
  }
  function resolveWall(state, wall) {
    const px = clamp(state.x, wall.x, wall.x + wall.w), py = clamp(state.y, wall.y, wall.y + wall.h);
    let dx = state.x - px, dy = state.y - py, d = Math.hypot(dx, dy);
    if (d >= RADIUS) return;
    if (d < .000001) {
      const options = [
        [Math.abs(state.x - wall.x), -1, 0, wall.x - RADIUS, state.y],
        [Math.abs(state.x - wall.x - wall.w), 1, 0, wall.x + wall.w + RADIUS, state.y],
        [Math.abs(state.y - wall.y), 0, -1, state.x, wall.y - RADIUS],
        [Math.abs(state.y - wall.y - wall.h), 0, 1, state.x, wall.y + wall.h + RADIUS],
      ].sort((a, b) => a[0] - b[0]);
      [, dx, dy, state.x, state.y] = options[0]; d = 1;
    } else {
      dx /= d; dy /= d;
      state.x = px + dx * RADIUS; state.y = py + dy * RADIUS;
    }
    const v = state.vx * dx + state.vy * dy;
    if (v < 0) { state.vx -= 1.24 * v * dx; state.vy -= 1.24 * v * dy; }
  }
  function create(index = 0) {
    const level = LEVELS[clamp(Math.floor(index), 0, LEVELS.length - 1)];
    return { schema: 1, level: level.id, x: level.start.x, y: level.start.y, vx: 0, vy: 0, spin: 0, stars: level.stars.map(() => false), key: false, rotors: level.rotors.map(r => r.initial), checkpoint: { x: level.start.x, y: level.start.y }, falls: 0, time: 0, recover: 0, bumpCooldown: 0, accumulator: 0, won: false };
  }
  function goalOpen(state) { return state.stars.every(Boolean) && (!LEVELS[state.level].key || state.key); }
  function step(state, inputX, inputY, dt = STEP) {
    const events = [], level = LEVELS[state.level];
    if (state.won) return events;
    state.time += dt;
    state.bumpCooldown = Math.max(0, state.bumpCooldown - dt);
    if (state.recover > 0) {
      state.recover = Math.max(0, state.recover - dt);
      if (state.recover === 0) { state.x = state.checkpoint.x; state.y = state.checkpoint.y; state.vx = state.vy = 0; events.push('respawn'); }
      return events;
    }
    state.vx = (state.vx + clamp(Number(inputX) || 0, -1, 1) * ACCELERATION * dt) * Math.exp(-DRAG * dt);
    state.vy = (state.vy + clamp(Number(inputY) || 0, -1, 1) * ACCELERATION * dt) * Math.exp(-DRAG * dt);
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > MAX_SPEED) { state.vx *= MAX_SPEED / speed; state.vy *= MAX_SPEED / speed; }
    if (Math.abs(inputX) < .002 && Math.abs(inputY) < .002 && speed < .7) state.vx = state.vy = 0;
    const oldX = state.x, oldY = state.y;
    state.x += state.vx * dt; state.y += state.vy * dt;
    state.spin += Math.hypot(state.vx, state.vy) * dt / RADIUS;
    // At <=220px/s each 120Hz move is <2px: wall crossings cannot tunnel through an 8px rail.
    const walls = allWalls(level, state);
    let bumperContact = false;
    // A bumper beside a rail constrains the same ball: solve both together rather
    // than pushing out of one collider into the other. Never retain penetration.
    for (let pass = 0; pass < 24; pass++) {
      for (const wall of walls) resolveWall(state, wall);
      for (const bumper of level.bumpers) {
        let dx = state.x - bumper.x, dy = state.y - bumper.y, d = Math.hypot(dx, dy);
        if (d >= RADIUS + bumper.r) continue;
        if (d < .001) { dx = 1; dy = 0; d = 1; }
        dx /= d; dy /= d;
        state.x = bumper.x + dx * (RADIUS + bumper.r + .00002); state.y = bumper.y + dy * (RADIUS + bumper.r + .00002);
        const v = state.vx * dx + state.vy * dy;
        if (v < 0) { state.vx -= 1.8 * v * dx; state.vy -= 1.8 * v * dy; }
        bumperContact = true;
      }
      if (positionClear(level, state, state.x, state.y)) break;
    }
    if (!positionClear(level, state, state.x, state.y)) {
      // A tight simultaneous contact may converge slowly. Keep the preceding safe
      // substep instead of leaving a ball inside a rail (or inventing a tunnel).
      const safe = positionClear(level, state, oldX, oldY) ? { x: oldX, y: oldY } : state.checkpoint;
      state.x = safe.x; state.y = safe.y;
    }
    if (bumperContact && !state.bumpCooldown) { events.push('bump'); state.bumpCooldown = .45; }
    for (let i = 0; i < level.stars.length; i++) {
      const star = level.stars[i];
      if (!state.stars[i] && Math.hypot(state.x - star.x, state.y - star.y) < RADIUS + star.r - 3) {
        state.stars[i] = true; state.checkpoint = { x: star.x, y: star.y }; events.push('star');
      }
    }
    if (level.key && !state.key && Math.hypot(state.x - level.key.x, state.y - level.key.y) < 23) {
      state.key = true; state.checkpoint = { x: level.key.x, y: level.key.y }; events.push('key');
    }
    for (const hole of level.holes) {
      if (Math.hypot(state.x - hole.x, state.y - hole.y) < hole.r * .8) {
        state.falls++; state.recover = .5; state.vx = state.vy = 0; events.push('fall'); return events;
      }
    }
    if (goalOpen(state) && Math.hypot(state.x - level.goal.x, state.y - level.goal.y) < 16) { state.won = true; state.vx = state.vy = 0; events.push('win'); }
    return events;
  }
  function advance(state, x, y, elapsed) {
    state.accumulator += clamp(Number(elapsed) || 0, 0, .1);
    const events = [];
    while (state.accumulator + 1e-9 >= STEP) { state.accumulator -= STEP; events.push(...step(state, x, y)); }
    return events;
  }
  function snapshot(state) {
    const out = JSON.parse(JSON.stringify(state));
    out.accumulator = 0; out.vx = out.vy = 0; out.bumpCooldown = 0;
    if (out.recover) { out.x = out.checkpoint.x; out.y = out.checkpoint.y; out.recover = 0; }
    return out;
  }
  function restore(raw) {
    if (!raw || raw.schema !== 1 || !Number.isInteger(raw.level) || !LEVELS[raw.level]) return null;
    const state = create(raw.level), level = LEVELS[state.level];
    if (!Array.isArray(raw.stars) || raw.stars.length !== level.stars.length || raw.stars.some(v => typeof v !== 'boolean')) return null;
    state.stars = raw.stars.slice(); state.key = !!raw.key && !!level.key;
    if (raw.rotors !== undefined) {
      if (!Array.isArray(raw.rotors) || raw.rotors.length !== level.rotors.length || raw.rotors.some(v => v !== 0 && v !== 1)) return null;
      state.rotors = raw.rotors.slice();
    }
    state.falls = clamp(Math.floor(Number(raw.falls) || 0), 0, 100000);
    state.time = clamp(Number(raw.time) || 0, 0, 360000);
    const checkpoints = [level.start, ...level.stars.filter((_, i) => state.stars[i]), ...(state.key ? [level.key] : [])];
    const cp = raw.checkpoint && checkpoints.find(p => p.x === raw.checkpoint.x && p.y === raw.checkpoint.y);
    if (cp) state.checkpoint = { x: cp.x, y: cp.y };
    state.x = state.checkpoint.x; state.y = state.checkpoint.y;
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y) && raw.x >= PAD + RADIUS && raw.x <= level.w - PAD - RADIUS && raw.y >= PAD + RADIUS && raw.y <= level.h - PAD - RADIUS && positionClear(level, state, raw.x, raw.y) && !level.holes.some(h => Math.hypot(raw.x - h.x, raw.y - h.y) < h.r + RADIUS)) {
      state.x = raw.x; state.y = raw.y;
    }
    state.won = !!raw.won && goalOpen(state) && Math.hypot(state.x - level.goal.x, state.y - level.goal.y) < 16;
    return state;
  }
  function reachable(level, gateOpen = false, rotorStates = level.rotors.map(r => r.initial)) {
    const visited = new Set([level.start.cell]), queue = [level.start.cell], edges = new Set(level.edges);
    for (let head = 0; head < queue.length; head++) for (const n of neighbours(queue[head], level.cols, level.rows)) {
      const edge = edgeId(queue[head], n);
      if (!edges.has(edge) || (!gateOpen && level.gate?.edge === edge) || level.rotors.some((r,i) => r.edges[rotorStates[i]] === edge) || visited.has(n)) continue;
      visited.add(n); queue.push(n);
    }
    return [...visited];
  }
  function solveLevel(level, fixed = null) {
    const starsAt = cell => level.stars.reduce((bits, star, i) => star.cell === cell ? bits | (1 << i) : bits, 0);
    const encode = node => `${node.cell}/${node.rotors.join('')}/${node.stars}/${+node.key}`;
    const start = { cell: level.start.cell, rotors: fixed ? fixed.slice() : level.rotors.map(r => r.initial), stars: starsAt(level.start.cell), key: false, parent: -1, action: null };
    const nodes = [start], seen = new Set([encode(start)]), edges = new Set(level.edges);
    for (let head = 0; head < nodes.length; head++) {
      const node = nodes[head];
      if (node.cell === level.goal.cell && node.stars === (1 << level.stars.length) - 1 && (!level.key || node.key)) {
        const path = []; let cursor = head;
        while (nodes[cursor].parent >= 0) { path.push(nodes[cursor].action); cursor = nodes[cursor].parent; }
        return path.reverse();
      }
      const add = (next, action) => {
        const nextKey = encode(next); if (seen.has(nextKey)) return;
        seen.add(nextKey); nodes.push({ ...next, parent: head, action });
      };
      for (const cell of neighbours(node.cell, level.cols, level.rows)) {
        const edge = edgeId(cell, node.cell);
        if (!edges.has(edge) || (!node.key && level.gate?.edge === edge) || level.rotors.some((rotor,i) => rotor.edges[node.rotors[i]] === edge)) continue;
        add({ cell, rotors: node.rotors, stars: node.stars | starsAt(cell), key: node.key || !!level.key && level.key.cell === cell }, { type: 'move', cell });
      }
      if (!fixed) level.rotors.forEach((rotor,index) => {
        const p = { x: PAD + (node.cell % level.cols + .5) * CELL, y: PAD + (Math.floor(node.cell / level.cols) + .5) * CELL };
        if (!rotationClear(p, rotor)) return;
        const next = node.rotors.slice(); next[index] = 1 - next[index];
        add({ ...node, rotors: next }, { type: 'rotate', index });
      });
    }
    return null;
  }
  function validateLevel(level) {
    const before = reachable(level), after = reachable(level, true), bad = [];
    if (level.key && !before.includes(level.key.cell)) bad.push('key behind its own gate');
    if (level.rotors.length) { if (!solveLevel(level)) bad.push('mechanism puzzle is unsolvable'); }
    else for (const item of [...level.stars, level.goal]) if (!after.includes(item.cell)) bad.push(`unreachable ${item.cell}`);
    if (level.gate && before.includes(level.goal.cell)) bad.push('gate can be bypassed');
    if (level.edges.length !== level.cols * level.rows - 1) bad.push('maze must be an authored tree');
    for (const item of [level.start, level.goal, ...level.stars, ...(level.key ? [level.key] : [])]) {
      if (level.walls.some(wall => circleHit(item.x, item.y, RADIUS, wall))) bad.push(`item intersects wall ${item.cell}`);
      if (level.holes.some(h => Math.hypot(item.x - h.x, item.y - h.y) < RADIUS + h.r)) bad.push(`item intersects hole ${item.cell}`);
    }
    return { ok: bad.length === 0, bad };
  }
  root.MarbleMaze = { CELL, PAD, WALL, RADIUS, STEP, ACCELERATION, MAX_SPEED, DRAG, THEMES, LEVELS, clamp, edgeId, neighbours, rotorWall, rotationClear, rotate, solveLevel, allWalls, circleHit, positionClear, create, step, advance, goalOpen, snapshot, restore, reachable, validateLevel };
})(typeof window !== 'undefined' ? window : globalThis);
