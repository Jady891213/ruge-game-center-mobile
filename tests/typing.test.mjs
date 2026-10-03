import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

function typing(t, storage = {}) {
  const h = loadGame('hanzi-typing', { storage });
  t.after(() => h.dispose());
  const game = h.window.__game;
  return { h, game, submit: () => h.input(game.norm(game.state().ans[0])) };
}

test('typing: sixty unique practice characters have pinyin and complete offline stroke data', t => {
  const { h, game } = typing(t);
  const chars = game.LEVELS.flatMap(level => [...level.chars]);
  assert.equal(chars.length, 60);
  assert.equal(new Set(chars).size, 60);
  for (const char of chars) {
    assert.ok(game.answersOf(char).length, `${char} needs an accepted answer`);
    const data = h.window.STROKES[char];
    assert.ok(data, `${char} needs offline stroke data`);
    assert.equal(data.s.length, data.m.length);
  }
  assert.equal(h.node('#type').getAttribute('inputmode'), 'text');
  for (const answer of ['zhe', 'zhao', 'zhuo']) assert.ok(game.isExact('着', answer));
  for (const answer of ['kan', 'kàn', 'kān', 'kan4']) assert.ok(game.isExact('看', answer));
});

test('typing: existing hzTypingSave2 progress is loaded without resetting it', t => {
  const record = { lv: { 0: { grade: 'A', score: 1800, plays: 2 } }, best: 1800, days: {} };
  const { game } = typing(t, { hzTypingSave2: JSON.stringify(record) });
  assert.equal(game.Save.d.best, 1800);
  assert.equal(game.Save.d.lv[0].grade, 'A');
  assert.equal(game.Save.d.lv[0].plays, 2);
  assert.equal(game.state().savedLevels, 1);
});

test('typing: one question can score only once while its stroke animation is playing', t => {
  const { h, game, submit } = typing(t);
  game.start(0); h.tick(1000); submit();
  const accepted = game.state();
  const answer = h.node('#type').value;
  assert.equal(accepted.right, 1);
  assert.equal(accepted.accepting, false);
  assert.ok(accepted.hasAdvance);
  assert.equal(h.node('#type').readOnly, false, 'logical lock preserves the phone keyboard');
  for (let attempt = 0; attempt < 20; attempt++) {
    h.input('extra input');
    assert.equal(game.state().right, 1);
    assert.equal(game.state().score, accepted.score);
    assert.equal(h.node('#type').value, answer);
  }
  h.tick(4000);
  assert.equal(game.state().pos, 1, 'there is only one scheduled advance');
  assert.equal(game.state().accepting, true);
});

test('typing: leaving or restarting during animation cancels the previous question advance', t => {
  const { h, game, submit } = typing(t);
  game.start(0); h.tick(1000); submit();
  game.back();
  assert.equal(game.state().hasAdvance, false);
  h.tick(5000);
  assert.equal(game.state().playing, false);
  assert.equal(game.state().pos, 0);
  submit();
  assert.equal(game.state().right, 1, 'menu input cannot score');

  game.start(1); h.tick(1000); submit();
  game.start(2); h.tick(4000);
  assert.equal(game.state().pos, 0);
  assert.equal(game.state().right, 0);
  assert.equal(game.state().accepting, true);
});

test('typing: paused input is ignored and thirty seconds of rest are excluded from answer time', t => {
  const { h, game, submit } = typing(t);
  game.start(0); h.tick(1500);
  h.emitWindow('ruge:pause'); h.tick(30000); submit();
  assert.equal(game.state().right, 0);
  assert.equal(h.node('#type').readOnly, true);
  h.emitWindow('ruge:resume');
  assert.equal(game.state().paused, true, 'app foreground still requires Continue');
  h.click('#resumeBtn'); h.tick(500); submit();
  assert.ok(Math.abs(game.state().secsTotal - 2) < 1e-8);
});

test('typing: animation resumes its remaining hold and visibility needs explicit Continue', t => {
  const { h, game, submit } = typing(t);
  game.start(0); submit(); h.tick(100);
  h.document.hidden = true; h.emitDocument('visibilitychange');
  const remaining = game.state().advanceRemaining;
  h.tick(10000);
  assert.equal(game.state().pos, 0);
  h.document.hidden = false; h.emitDocument('visibilitychange');
  assert.equal(game.state().paused, true);
  h.click('#resumeBtn');
  assert.equal(h.node('#type').readOnly, false);
  h.tick(remaining - 1);
  assert.equal(game.state().pos, 0);
  h.tick(2);
  assert.equal(game.state().pos, 1);
});

test('typing: full sixty-question sequence includes every character and saves its result once', t => {
  const { h, game, submit } = typing(t);
  game.start(-1);
  const seen = [];
  let guard = 0;
  while (game.state().playing) {
    assert.ok(++guard < 75, 'the practice sequence must not stall or repeat');
    if (game.state().accepting) {
      seen.push(game.state().ch);
      submit();
      const svg = h.node('#ink').children[0];
      const paths = [];
      function collect(element) {
        if (element.style.animationDuration) paths.push(element);
        element.children.forEach(collect);
      }
      collect(svg);
      assert.equal(paths.length, h.window.STROKES[game.state().ch].s.length);
      const animationEnd = Math.max(...paths.map(path =>
        (parseFloat(path.style.animationDelay) + parseFloat(path.style.animationDuration)) * 1000));
      assert.ok(animationEnd < game.state().advanceRemaining, 'every stroke finishes before the real advance timer');
      h.tick(4000);
    } else if (h.node('#gpanel').classList.contains('on')) h.click('#gpNext');
    else assert.fail('unexpected locked state without a group result');
  }
  const expected = new Set(game.LEVELS.flatMap(level => [...level.chars]));
  assert.equal(seen.length, 60);
  assert.equal(new Set(seen).size, 60);
  for (const char of seen) assert.ok(expected.has(char));
  assert.equal(game.state().right, 60);
  assert.equal(game.Save.d.lv.all.plays, 1);
  h.click('#gpNext');
  assert.equal(game.Save.d.lv.all.plays, 1);
  assert.equal(game.state().hasAdvance, false);
  assert.ok(h.saved.get('hzTypingSave2'));
  assert.ok(JSON.parse(h.saved.get('rugeStat'))['hanzi-typing'].best > 0);
});
