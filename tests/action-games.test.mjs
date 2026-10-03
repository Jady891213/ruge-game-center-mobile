import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

const GAMES = ['flappy-bird', 'dino-runner', 'frog-pond'];

/** Expose private functions only inside the VM; all game rules still come from HTML. */
function loadAction(t, game) {
  const flappy = game === 'flappy-bird';
  const frog = game === 'frog-pond';
  const members = flappy
    ? `spawnPipe,pipeBoxes,die,
       snapshot:()=>({state,paused,worldX,player,pipes,L,score,passed,best,practice,rescues}),
       setInvincible:value=>{invincible=value}`
    : `spawnObstacle,playerBox,obsBox,pressJump,releaseJump,${frog ? 'landOnPad,' : ''}
       snapshot:()=>({state,paused,worldX,player,obstacles,L,scoreF,hi,${frog ? 'pads,padHits,padCombo,bestCombo,' : ''}})
       ${frog ? ',setPads:value=>{pads=value}' : ''}`;
  const harness = loadGame(game, {
    instrument(source, index) {
      if (index !== 0) return source;
      assert.match(source, /\}\)\(\);\s*$/, 'expected the real game closure');
      return source.replace(/\}\)\(\);\s*$/, `window.__engine={render,${members}};})();`);
    },
  });
  t.after(() => harness.dispose());
  return { harness, engine: harness.window.__engine };
}

for (const game of GAMES) {
  test(`${game}: preview reuses live drawings and restores the active run`, t => {
    const { harness: h, engine: e } = loadAction(t, game);
    assert.equal(h.node('.hero').children[0].tagName, 'CANVAS');
    h.click('#startBtn'); h.frame(); h.frame();
    const before = e.snapshot();
    const serialized = JSON.stringify(before);
    const saved = [...h.saved];
    const target = h.document.createElement('canvas');
    assert.equal(h.window.__actionPreview.draw(target, 600, 360, 2), target);
    assert.equal(target.width, 1200);
    assert.equal(target.height, 720);
    const after = e.snapshot();
    assert.equal(JSON.stringify(after), serialized);
    assert.equal(after.player, before.player);
    assert.equal(after.L, before.L);
    assert.deepEqual([...h.saved], saved);
    assert.doesNotThrow(() => e.render());
    h.frame();
    assert.ok(e.snapshot().worldX > before.worldX, 'normal gameplay keeps progressing');
  });

  test(`${game}: real page renders and DOM IDs are unique`, t => {
    const { harness, engine } = loadAction(t, game);
    const ids = [...harness.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.doesNotThrow(() => engine.render());
    harness.click('#startBtn');
    harness.frame();
    harness.frame();
    assert.ok(engine.snapshot().worldX > 0);
    assert.ok(JSON.parse(harness.saved.get('rugeStat'))[game].last > 0);
  });

  test(`${game}: pause blocks physics/input, foreground and rotation preserve a paused run`, t => {
    const { harness: h, engine: e } = loadAction(t, game);
    h.click('#startBtn'); h.frame(); h.frame();
    h.click('#pauseBtn');
    const before = e.snapshot();
    assert.ok(before.paused);
    h.node('#stage').dispatch('pointerdown');
    h.frame(200);
    assert.equal(e.snapshot().worldX, before.worldX);
    assert.equal(e.snapshot().player.vy, before.player.vy);
    h.click('#resumeBtn'); h.frame(); h.frame();
    assert.ok(e.snapshot().worldX > before.worldX);

    h.emitWindow('ruge:pause');
    h.emitWindow('ruge:resume');
    assert.ok(e.snapshot().paused, 'foreground never automatically continues gameplay');
    h.click('#resumeBtn');
    h.document.hidden = true;
    h.emitDocument('visibilitychange');
    h.document.hidden = false;
    h.emitDocument('visibilitychange');
    assert.ok(e.snapshot().paused);

    h.click('#resumeBtn');
    const prior = e.snapshot().worldX;
    h.resize(844, 390);
    assert.ok(e.snapshot().paused, 'rotation pauses before changing coordinate scale');
    assert.equal(e.snapshot().worldX, prior, 'rotation preserves run progress');
    assert.ok(Number.isFinite(e.snapshot().player.vy));
    assert.doesNotThrow(() => e.render());
  });
}

test('flappy-bird: pipe cap collision matches its outer edge, three practice rescues do not write a ranked record', t => {
  const { harness: h, engine: e } = loadAction(t, 'flappy-bird');
  h.click('#startBtn');
  e.spawnPipe();
  const pipe = e.snapshot().pipes[0];
  const boxes = e.pipeBoxes(pipe);
  assert.equal(boxes.length, 4);
  assert.ok(boxes[1].x < pipe.x, 'cap protrusion is included in collision rectangles');

  h.click('#practiceBtn');
  for (let rescue = 1; rescue <= 3; rescue++) {
    e.setInvincible(0);
    e.die();
    assert.equal(e.snapshot().state, 'run');
    assert.equal(e.snapshot().rescues, 3 - rescue);
  }
  e.setInvincible(0); e.die();
  assert.equal(e.snapshot().state, 'dead');
  assert.equal(e.snapshot().best, 0);
  assert.equal(h.saved.get('flappyDashBest'), undefined);
  h.tick(800);
  assert.ok(h.node('#overScreen').classList.contains('hide') === false);
});

for (const game of ['dino-runner', 'frog-pond']) {
  test(`${game}: generated obstacles fit jump height and high flyers leave a ground route`, t => {
    const { harness: h, engine: e } = loadAction(t, game);
    h.click('#startBtn');
    for (let count = 0; count < 400; count++) e.spawnObstacle();
    const { L, obstacles } = e.snapshot();
    const singleHeight = L.JUMP_UP ** 2 / (2 * L.G);
    const reachableHeight = game === 'frog-pond'
      ? singleHeight + (L.JUMP_UP * .88) ** 2 / (2 * L.G) : singleHeight;
    for (const obstacle of obstacles) {
      assert.ok(obstacle.w > 0 && obstacle.h > 0);
      if (obstacle.kind !== 'bird') assert.ok(obstacle.h <= reachableHeight);
      if (obstacle.kind === 'bird' && obstacle.base > L.playerH) {
        const box = e.obsBox(obstacle);
        assert.ok(box.y + box.h < e.playerBox().y, 'high flyer is clear of a grounded player');
      }
    }
    assert.doesNotThrow(() => e.render());
  });
}

test('frog-pond: landing on target pads builds a capped combo and missing resets it', t => {
  const { harness: h, engine: e } = loadAction(t, 'frog-pond');
  h.click('#startBtn');
  const { L } = e.snapshot();
  for (let count = 1; count <= 6; count++) {
    e.setPads([{ x: L.playerX + L.playerW / 2, r: L.playerW * .66, hit: false }]);
    e.landOnPad();
    assert.equal(e.snapshot().padCombo, Math.min(5, count));
    assert.equal(e.snapshot().padHits, count);
  }
  assert.equal(e.snapshot().bestCombo, 5);
  e.landOnPad();
  assert.equal(e.snapshot().padHits, 6, 'the same leaf cannot award twice');
  e.setPads([{ x: L.playerX + L.playerW / 2, r: L.playerW * .66, hit: false }]);
  e.landOnPad();
  assert.equal(e.snapshot().padCombo, 1);
  e.setPads([]); e.landOnPad();
  assert.equal(e.snapshot().padCombo, 0);
});

test('frog-pond: releasing a tap keeps its full arc, double jump works and a third jump is ignored', t => {
  const { harness: h, engine: e } = loadAction(t, 'frog-pond');
  h.click('#startBtn');
  h.node('#stage').dispatch('pointerdown');
  const initial = e.snapshot().player.vy;
  h.node('#stage').dispatch('pointerup');
  assert.equal(e.snapshot().player.vy, initial);
  h.frame(); h.frame(100);
  h.node('#stage').dispatch('pointerdown');
  assert.equal(e.snapshot().player.jumps, 2);
  const second = e.snapshot().player.vy;
  h.node('#stage').dispatch('pointerdown');
  assert.equal(e.snapshot().player.vy, second);
});
