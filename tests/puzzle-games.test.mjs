import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

function puzzle(t, name, options = {}) {
  const h = loadGame(name, options);
  t.after(() => h.dispose());
  return { h, game: h.window.__game };
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








test('pipe: manual and background pauses preserve the route until explicit Continue', t => {
  const { h, game } = puzzle(t, 'pipe-flow');
  const tile = h.node('#grid').children.find(node => !node.classList.contains('locked'));
  tile.dispatch('click');
  h.click('#pause');
  const paused = plain(game.state());
  assert.equal(paused.paused, true);
  assert.equal(h.node('#pausePanel').hidden, false);
  tile.dispatch('click');
  assert.deepEqual(plain(game.state()), paused);
  h.emitWindow('ruge:resume');
  assert.equal(game.state().paused, true);
  h.click('#resume');
  tile.dispatch('click');
  assert.equal(game.state().moves, paused.moves + 1);
  h.emitWindow('ruge:pause');
  assert.equal(game.state().paused, true);
  h.click('#resume');
  assert.equal(game.state().paused, false);
});
