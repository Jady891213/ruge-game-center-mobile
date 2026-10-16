import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

const games = ['flappy-bird', 'dino-runner', 'frog-pond'];

// Observe the semantic boundary; shared feedback has its own device/audio tests.
// All input, physics, collection and completion logic below is the real page.
function loadAction(t, game, { cover = false } = {}) {
  const flappy = game === 'flappy-bird';
  const frog = game === 'frog-pond';
  const h = loadGame(game, {
    instrument(source) {
      if (!source.includes('var GAME_ID')) {
        return `window.__events=[];window.__sound=true;
          window.RugeFX={enabled:()=>window.__sound,
          setSound:v=>{window.__sound=v},emit:name=>window.__events.push(name)};
          ${cover ? "location.search='?cover=1';" : ''}`;
      }
      const members = flappy
        ? `flap,die,update,snapshot:()=>({state,paused,player,L,pipes,score,passed}),
           scenario:values=>{if(values.pipes)pipes=values.pipes;if('score'in values)score=values.score;if('passed'in values)passed=values.passed;}`
        : `pressJump,die,update,${frog ? 'landOnPad,' : ''}
           snapshot:()=>({state,paused,player,L,scoreF}),
           scenario:values=>{if(values.gems)gems=values.gems;if(values.pads)pads=values.pads;
             if('worldX'in values)worldX=values.worldX;if('scoreF'in values)scoreF=values.scoreF;}`;
      return source.replace(/\}\)\(\);\s*$/, `window.__feedbackEngine={${members}};})();`);
    },
  });
  t.after(() => h.dispose());
  const events = Array.from(h.window.__events);
  h.window.__events = events;
  return { h, e: h.window.__feedbackEngine, events };
}

for (const game of games) {
  test(`${game}: cover, preview, pause and automatic resume have no gameplay feedback`, t => {
    const { h, e, events } = loadAction(t, game);
    assert.deepEqual(events, []);
    h.node('#stage').dispatch('pointerdown');
    assert.deepEqual(events, [], 'ready screen does not jump');
    h.click('#startBtn');
    h.click('#pauseBtn');
    h.node('#stage').dispatch('pointerdown');
    h.emitWindow('keydown', { code: 'Space', preventDefault() {} });
    h.emitWindow('ruge:resume');
    h.frame(); h.frame();
    assert.ok(e.snapshot().paused);
    assert.deepEqual(events, []);
    h.click('#restartBtn');
    assert.deepEqual(events, [], 'restarting does not play a fake jump or reward');
    h.node('#stage').dispatch('pointerdown');
    assert.deepEqual(events, ['jump']);
    const target = h.document.createElement('canvas');
    h.window.__actionPreview.draw(target, 600, 360, 1);
    assert.deepEqual(events, ['jump'], 'cover drawing preserves a live run silently');
  });

  test(`${game}: mute uses shared sound preference while retaining haptic events`, t => {
    const { h, events } = loadAction(t, game);
    h.click('#mute');
    assert.equal(h.window.__sound, false);
    assert.equal(h.saved.has('rugeMuted'), false, 'only shared preferences own persistence');
    h.click('#startBtn');
    h.node('#stage').dispatch('pointerdown');
    assert.deepEqual(events, ['jump'], 'semantic events still reach the vibration channel');
  });

  test(`${game}: collision reports once and a record rewards once at results`, t => {
    const { h, e, events } = loadAction(t, game);
    h.click('#startBtn');
    e.scenario(game === 'flappy-bird' ? { score: 10 } : { scoreF: 10 });
    e.die(); e.die();
    assert.deepEqual(events, ['error']);
    h.tick(800);
    assert.deepEqual(events, ['error', 'win']);
    h.tick(800);
    assert.deepEqual(events, ['error', 'win']);
    h.click('#againBtn');
    e.die(); h.tick(800);
    assert.deepEqual(events, ['error', 'win', 'error'], 'a new non-record run cannot repeat the award');
  });

  test(`${game}: generated cover has no feedback or saved game`, t => {
    const { h, events } = loadAction(t, game, { cover: true });
    h.frame(); h.frame();
    assert.deepEqual(events, []);
    assert.equal(h.saved.size, 0);
  });

  test(`${game}: leaving during result delay cancels the stale record reward`, t => {
    const { h, e, events } = loadAction(t, game);
    h.click('#startBtn');
    e.scenario(game === 'flappy-bird' ? { score: 10 } : { scoreF: 10 });
    e.die();
    h.emitWindow('ruge:pause'); h.emitWindow('ruge:resume');
    h.tick(800);
    assert.deepEqual(events, ['error']);
  });
}

test('flappy-bird: each pipe scores once and an eight-pipe goal replaces the small reward', t => {
  const { h, e, events } = loadAction(t, 'flappy-bird');
  h.click('#startBtn');
  const { L, player } = e.snapshot();
  const pipe = () => ({ x: L.birdX - L.pipeW - 2, gapY: player.y, scored: false, gemOff: 0, gemGot: false });
  e.scenario({ pipes: [pipe()] });
  e.update(0); e.update(0);
  assert.deepEqual(events, ['collect']);
  e.scenario({ pipes: [pipe()], passed: 7 });
  e.update(0); e.update(0);
  assert.deepEqual(events, ['collect', 'success']);
});

test('dino-runner: ignored airborne taps are silent, landing and buffered jumps follow actual motion', t => {
  const { h, e, events } = loadAction(t, 'dino-runner');
  h.click('#startBtn');
  e.pressJump(); e.pressJump(); e.pressJump();
  assert.deepEqual(events, ['jump']);
  const { player } = e.snapshot();
  player.yOff = 0.001; player.vy = -100;
  e.update(.001);
  assert.deepEqual(events, ['jump', 'land', 'jump'], 'only the accepted landing-buffer jump sounds');
  player.yOff = 0.001; player.vy = -100;
  e.update(.001); e.update(.001);
  assert.deepEqual(events, ['jump', 'land', 'jump', 'land']);
});

test('dino-runner: distance band and milestone each reward once, not on every frame', t => {
  const { h, e, events } = loadAction(t, 'dino-runner');
  h.click('#startBtn');
  e.scenario({ scoreF: 101 }); e.update(0); e.update(0);
  assert.deepEqual(events, ['collect']);
  e.scenario({ worldX: 2000 }); e.update(0); e.update(0);
  assert.deepEqual(events, ['collect', 'success']);
});

test('frog-pond: two jumps sound, a third is silent, target-pad goals reward once', t => {
  const { h, e, events } = loadAction(t, 'frog-pond');
  h.click('#startBtn');
  e.pressJump(); e.pressJump(); e.pressJump();
  assert.deepEqual(events, ['jump', 'jump']);
  const { L } = e.snapshot();
  for (let i = 0; i < 3; i++) {
    e.scenario({ pads: [{ x: L.playerX + L.playerW / 2, r: L.playerW, hit: false }] });
    e.landOnPad();
  }
  assert.deepEqual(events, ['jump', 'jump', 'collect', 'collect', 'success']);
  h.click('#pauseBtn'); e.landOnPad();
  assert.equal(events.length, 5);
});

for (const game of ['dino-runner', 'frog-pond']) {
  test(`${game}: a collected gem rewards once across successive physics frames`, t => {
    const { h, e, events } = loadAction(t, game);
    h.click('#startBtn');
    const { L } = e.snapshot();
    e.scenario({ gems: [{ x: L.playerX + L.playerW / 2, yOff: L.playerH / 2, r: 14, ph: 0, got: false }] });
    e.update(0); e.update(0);
    assert.deepEqual(events, ['collect']);
  });
}
