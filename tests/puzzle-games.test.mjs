import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

function puzzle(t, name, options = {}) {
  const h = loadGame(name, options);
  t.after(() => h.dispose());
  return { h, game: h.window.__game };
}

function gravity(t, { native = false, exposeWorld = false, storage = {} } = {}) {
  return puzzle(t, 'gravity-maze', {
    storage,
    instrument(source, index) {
      if (index !== 0) return source;
      if (exposeWorld) source += '\nwindow.__world=()=>({lv,ball});';
      if (!native) return source;
      // The bridge is hardware input; physics and filtering remain the real page code.
      return `window.__tilt={x:0,y:0,age:0,available:true,modern:true};
        const RugeTilt=window.RugeTilt={
          gx:()=>window.__tilt.x,gy:()=>window.__tilt.y,
          available:()=>window.__tilt.available,
          sampleAgeMs:()=>window.__tilt.age,
          coordinateSystem:()=>window.__tilt.modern?'screen-down-v1':'legacy'
        };\n` + source;
    },
  });
}

function solvePipe(h, game) {
  const width = game.LEVELS[game.state().li].w;
  for (const tile of game.state().tiles) {
    if (!tile.onPath || tile.locked) continue;
    const turns = game.turnsToSolution(tile);
    for (let count = 0; count < turns; count++) h.node('#grid').children[tile.y * width + tile.x].dispatch('click');
  }
  assert.equal(game.state().won, true, 'the real rotation events must finish the authored route');
  h.tick(500);
  assert.equal(h.node('#win').hidden, false);
}

test('pipe: ten deterministic boards start unsolved and are solved through legal rotations', t => {
  const { game } = puzzle(t, 'pipe-flow');
  assert.equal(game.LEVELS.length, 10);
  for (let level = 0; level < 10; level++) {
    const board = game.newGame(level);
    assert.deepEqual(plain(board), plain(game.newGame(level)), `level ${level + 1} must be reproducible`);
    assert.equal(game.isSolved(board), false);
    assert.ok(board.par > 0);
    assert.equal(board.tiles.filter(tile => tile.locked).length, 2);
    for (const tile of board.tiles.filter(tile => tile.onPath && !tile.locked)) {
      const turns = game.turnsToSolution(tile);
      for (let count = 0; count < turns; count++) assert.equal(game.rotate(board, tile.y * board.w + tile.x), true);
    }
    assert.equal(game.isSolved(board), true, `level ${level + 1} needs a working water route`);
    assert.equal(board.moves, board.par);
    assert.equal(game.starsFor(board), 3);
  }
});

test('pipe: undo restores rotation and move count, locked/won boundaries reject writes', t => {
  const { game } = puzzle(t, 'pipe-flow');
  const board = game.newGame(3), index = board.tiles.findIndex(tile => !tile.locked);
  const before = plain(board);
  assert.equal(game.undo(board), false);
  assert.equal(game.rotate(board, -1), false);
  assert.equal(game.rotate(board, board.tiles.findIndex(tile => tile.locked)), false);
  assert.deepEqual(plain(board), before);
  assert.equal(game.rotate(board, index), true);
  assert.equal(board.moves, 1);
  assert.equal(game.undo(board), true);
  assert.deepEqual(plain(board), before);
  board.won = true;
  assert.equal(game.rotate(board, index), false);
  assert.equal(game.undo(board), false);
});

test('pipe: three hints consume no rotations, cannot record an unassisted best and reset on retry', t => {
  const { h, game } = puzzle(t, 'pipe-flow');
  const before = game.state().tiles.map(tile => tile.rot);
  for (let count = 0; count < 5; count++) h.click('#hint');
  assert.equal(game.state().hints, 3);
  assert.equal(h.node('#hint').disabled, true);
  assert.equal(game.state().moves, 0);
  assert.deepEqual(plain(game.state().tiles.map(tile => tile.rot)), plain(before));
  assert.equal(h.document.querySelectorAll('.tile.hint').length, 1);
  solvePipe(h, game);
  assert.equal(game.state().progress.best[0], undefined);
  assert.equal(game.state().progress.stars[0], 2);
  h.click('#hint');
  assert.equal(game.state().hints, 3);
  h.click('#winRetry');
  assert.equal(game.state().won, false);
  assert.equal(game.state().hints, 0);
  assert.equal(h.document.querySelectorAll('.tile.hint').length, 0);
  assert.deepEqual(plain(game.state().tiles.map(tile => tile.rot)), plain(before));
});

test('pipe: completing the tenth board starts a second campaign whose Next still advances', t => {
  const { h, game } = puzzle(t, 'pipe-flow');
  game.loadLevel(9); solvePipe(h, game);
  assert.equal(JSON.parse(h.saved.get('gardenFlowV2')).highest, 9);
  h.click('#next');
  assert.equal(game.state().li, 0);
  solvePipe(h, game); h.click('#next');
  assert.equal(game.state().li, 1);
  assert.equal(game.state().won, false);
});

test('gravity: ten authored boards have reachable fruit, powerups and exits at the real ball radius', t => {
  const { game } = gravity(t);
  assert.equal(game.LEVELS.length, 10);
  for (let level = 0; level < 10; level++) {
    const board = game.cloneLevel(level);
    assert.deepEqual(plain(board), plain(game.cloneLevel(level)));
    const reachable = game.reachable(board);
    assert.equal(reachable.ok, true, `level ${level + 1}: ${reachable.bad.join('; ')}`);
    assert.equal(reachable.goalOk, true);
    assert.equal(game.inHole(board, ...board.start), false);
    assert.equal(game.ballR(1000), game.BALL_R, 'eating fruit never enlarges the ball and blocks narrow routes');
    board.fruits[0][2] = true;
    assert.equal(game.cloneLevel(level).fruits[0][2], false, 'restarting clones fresh fruit without changing source levels');
  }
});

test('gravity: a shield escapes one hole safely and invulnerability delays a second fall', t => {
  const { game } = gravity(t);
  const board = game.cloneLevel(1), ball = game.newBall(board), hole = board.holes[0];
  ball.x = hole[0]; ball.y = hole[1]; ball.shield = true;
  assert.equal(game.step(board, ball, 0, 0, 1 / 120), 'shield');
  assert.equal(ball.shield, false);
  assert.equal(ball.lives, game.LIVES);
  assert.equal(game.inHole(board, ball.x, ball.y), false);
  assert.ok(ball.invuln > 0);
  assert.ok(game.allWalls(board).every(wall => !game.pushOut(ball.x, ball.y, game.BALL_R, wall)));
  ball.x = hole[0]; ball.y = hole[1];
  assert.notEqual(game.step(board, ball, 0, 0, .01), 'fall');
  ball.invuln = 0;
  assert.equal(game.step(board, ball, 0, 0, .01), 'fall', 'the shield cannot be reused');
});

test('gravity: respawn preserves collected fruit and lives; the exit requires every fruit', t => {
  const { game } = gravity(t);
  const board = game.cloneLevel(0), ball = game.newBall(board);
  const goal = board.goal;
  ball.x = goal[0] + goal[2] / 2; ball.y = goal[1] + goal[3] / 2;
  assert.notEqual(game.step(board, ball, 0, 0, 1 / 120), 'win');
  for (const fruit of board.fruits) {
    ball.x = fruit[0]; ball.y = fruit[1]; ball.vx = ball.vy = 0;
    assert.equal(game.step(board, ball, 0, 0, 1 / 120), 'eat');
  }
  assert.equal(ball.eaten, board.fruits.length);
  ball.lives = 2; ball.vx = 80; ball.vy = -60;
  game.respawn(board, ball);
  assert.equal(game.fruitLeft(board), 0);
  assert.equal(ball.eaten, board.fruits.length);
  assert.equal(ball.lives, 2);
  assert.equal(ball.vx, 0); assert.equal(ball.vy, 0);
  assert.equal(ball.invuln, 1.8);
  ball.x = goal[0] + goal[2] / 2; ball.y = goal[1] + goal[3] / 2;
  assert.equal(game.step(board, ball, 0, 0, 1 / 120), 'win');
});

test('gravity: tilt calibration, dead zone, screen coordinates and stale input use the native bridge', t => {
  const { h, game } = gravity(t, { native: true });
  const tilt = h.window.__tilt, input = game.input;
  tilt.x = .12; tilt.y = -.08;
  assert.equal(input.calibrate(), true);
  tilt.x += .034; tilt.y -= .034;
  assert.deepEqual(plain(input.read(.2)), { x: 0, y: 0 });
  tilt.x = .5; tilt.y = .3;
  const screenInput = input.read(.2);
  assert.ok(screenInput.x > 0 && screenInput.y > 0, 'modern gx/gy point right/down');
  assert.ok(screenInput.x <= 1 && screenInput.y <= 1);
  tilt.modern = false;
  assert.equal(input.readRaw().x, -.5, 'older bridges still invert device gx');
  tilt.modern = true; tilt.age = 1500;
  assert.notEqual(input.readRaw(), null);
  tilt.age = 1501;
  assert.equal(input.readRaw(), null);
  assert.deepEqual(plain(input.read(.2)), { x: 0, y: 0 });
  assert.equal(input.sensorFresh, false);
  assert.equal(input.calibrate(), false);
  tilt.age = 0; tilt.available = false;
  assert.equal(input.readRaw(), null);
});

test('gravity: stale sensors cannot start/resume, and touch remains available', t => {
  const { h, game } = gravity(t, { native: true });
  const tilt = h.window.__tilt;
  tilt.age = 1501; h.click('#start');
  assert.equal(game.state().result, 'ready');
  assert.equal(game.state().paused, true);
  tilt.age = 0; h.click('#start');
  assert.equal(game.state().paused, false);
  tilt.age = 1501;
  for (let frame = 0; frame < 60; frame++) h.frame(33);
  assert.equal(h.node('#controlHint').classList.contains('error'), true);
  h.emitWindow('ruge:pause'); h.emitWindow('ruge:resume'); h.click('#resume');
  assert.equal(game.state().paused, true);
  h.click('#touchMode'); h.click('#resume');
  assert.equal(game.state().mode, 'touch');
  assert.equal(game.state().paused, false);
  assert.equal(h.node('#controlHint').classList.contains('error'), false);
});

test('gravity: background/orientation preserve a paused run and touch cancellation clears input', t => {
  const { h, game } = gravity(t, { native: true });
  h.click('#start'); h.frame(); h.frame();
  const before = game.state();
  h.emitWindow('ruge:pause'); h.tick(30000); h.emitWindow('ruge:resume'); h.frame();
  assert.equal(game.state().paused, true);
  assert.equal(game.state().time, before.time);
  assert.equal(game.state().x, before.x);
  h.click('#resume');
  h.window.__tilt.x = .5;
  h.emitWindow('ruge:orientation');
  assert.equal(game.state().paused, true);
  assert.deepEqual(plain(game.input.zero), { x: 0, y: 0 });
  h.click('#resume');
  assert.equal(game.input.zero.x, .5, 'Continue calibrates the new orientation');
  h.click('#touchMode');
  const stage = h.node('#stage');
  stage.dispatch('pointerdown', { pointerId: 7, clientX: 100, clientY: 200 });
  stage.dispatch('pointermove', { pointerId: 8, clientX: 200, clientY: 300 });
  assert.deepEqual(plain(game.input.read(.1)), { x: 0, y: 0 });
  stage.dispatch('pointermove', { pointerId: 7, clientX: 200, clientY: 300 });
  const pushed = game.input.read(.1);
  assert.ok(pushed.x > 0 && pushed.y > 0);
  assert.ok(Math.hypot(pushed.x, pushed.y) <= 1 + 1e-12);
  stage.dispatch('pointercancel', { pointerId: 7 });
  assert.deepEqual(plain(game.input.read(.1)), { x: 0, y: 0 });
});

test('gravity: the tenth-board Next wraps once and advances normally in the second campaign', t => {
  const { h, game } = gravity(t, { exposeWorld: true });
  function complete() {
    h.click('#start');
    const { lv, ball } = h.window.__world();
    // Place the real ball at contact fixtures; the real frame handles all collection and victory.
    for (const fruit of lv.fruits) {
      ball.x = fruit[0]; ball.y = fruit[1]; ball.vx = ball.vy = 0;
      h.frame();
    }
    ball.x = lv.goal[0] + lv.goal[2] / 2;
    ball.y = lv.goal[1] + lv.goal[3] / 2;
    ball.vx = ball.vy = 0; h.frame();
    assert.equal(game.state().result, 'win');
    assert.equal(h.node('#win').hidden, false);
  }
  game.loadLevel(9); complete(); h.click('#next');
  assert.equal(game.state().li, 0);
  complete(); h.click('#next');
  assert.equal(game.state().li, 1);
  assert.equal(game.state().result, 'ready');
  assert.equal(game.state().paused, true);
  assert.equal(JSON.parse(h.saved.get('rollingGardenV2')).highest, 9);
});

test('hanzi puzzle: all twelve recipes conserve duplicate parts and reject illegal drops without mutation', t => {
  const { game } = puzzle(t, 'hanzi-puzzle');
  assert.equal(game.LEVELS.length, 12);
  for (let level = 0; level < game.LEVELS.length; level++) {
    const board = game.newGame(level), before = plain(board), recipe = [...board.need];
    assert.equal(game.invariantHolds(board), true);
    assert.equal(game.tryDrop(board, recipe[0], null), 'reject');
    assert.equal(game.tryDrop(board, '不存在', recipe[0]), 'reject');
    assert.deepEqual(plain(board), before);
    for (const extra of game.LEVELS[level].extra || []) {
      assert.equal(game.tryDrop(board, extra, recipe[0]), 'reject');
      assert.deepEqual(plain(board), before);
    }
    assert.equal(game.tryDrop(board, recipe[1], recipe[0]), recipe.length === 2 ? 'fuse' : 'merge');
    assert.equal(game.invariantHolds(board), true);
    for (const char of recipe.slice(2)) {
      const afterMerge = plain(board);
      assert.equal(game.tryDrop(board, char, char), 'reject', 'a nonempty pile only accepts one free card');
      assert.deepEqual(plain(board), afterMerge);
      assert.equal(game.tryDrop(board, char, null), 'fuse');
      assert.equal(game.invariantHolds(board), true);
    }
    assert.equal(board.done, true);
    assert.equal(game.sameSet(board.pile, recipe), true);
    assert.equal(board.free.length, (game.LEVELS[level].extra || []).length);
    const completed = plain(board);
    assert.equal(game.tryDrop(board, recipe[0], null), 'reject');
    assert.deepEqual(plain(board), completed);
  }
});

function solveHanzi(h, game) {
  const recipe = [...game.LEVELS[game.state().li].p];
  for (const char of recipe) {
    const card = h.node('#parts').children.find(element => element.tagName === 'BUTTON' && element.dataset.ch === char && !element.classList.contains('sel'));
    assert.ok(card, `free card ${char} must exist`);
    card.dispatch('click');
  }
  assert.equal(game.state().done, true);
  assert.equal(h.node('#reveal').classList.contains('show'), true);
}

test('hanzi puzzle: real clicks collect letters, restore the new save and advance through a second round', t => {
  const { h, game } = puzzle(t, 'hanzi-puzzle', {
    storage: { hzPuzzleProgress1: JSON.stringify({ idx: 10, bank: ['林', '无效字'] }) },
  });
  assert.equal(game.state().li, 10);
  assert.equal(h.node('#collection').textContent, '字卡收藏 · 林');
  solveHanzi(h, game); h.click('#next');
  assert.equal(game.state().li, 11);
  solveHanzi(h, game); h.click('#next');
  assert.equal(h.node('#next').textContent, '再来一遍');
  h.click('#next');
  assert.equal(game.state().li, 0);
  solveHanzi(h, game); h.click('#next');
  assert.equal(game.state().li, 1);
  assert.equal(game.state().done, false);
  const stored = JSON.parse(h.saved.get('hzPuzzleProgress1'));
  assert.equal(stored.idx, 1);
  assert.deepEqual(stored.bank, ['林', '休', '河']);
  assert.equal(JSON.parse(h.saved.get('rugeStat'))['hanzi-puzzle'].best, 3);
  const { game: restored } = puzzle(t, 'hanzi-puzzle', { storage: Object.fromEntries(h.saved) });
  assert.equal(restored.state().li, 1);
  assert.equal(restored.state().done, false);
});
