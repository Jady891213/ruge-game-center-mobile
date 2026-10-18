import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/html-vm.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
function game(t, storage = {}) {
  const h = loadGame('code-breaker', { storage });
  t.after(() => h.dispose());
  return { h, g: h.window.__game };
}
function digit(h, value) {
  const button = h.node('#keypad').children.find(node => node.dataset.digit === value);
  assert.ok(button, 'the real keypad must contain digit ' + value);
  assert.equal(button.disabled, false, 'digit ' + value + ' must be available');
  button.dispatch('click');
}
function fill(h, value) {
  h.click('#clear');
  for (const char of value) digit(h, char);
}
function submit(h, value) { fill(h, value); h.click('#submit'); }
function dialogAction(h, text) {
  const button = h.node('#dialogActions').children.find(node => node.textContent === text);
  assert.ok(button, 'missing dialog action ' + text);
  button.dispatch('click');
}

test('codebreaker UI: incomplete and duplicate inputs do not consume attempts', t => {
  const { h, g } = game(t);
  assert.equal(g.startFree(2, false), true);
  assert.equal(h.node('#keypad').children.find(node => node.dataset.digit === '0').disabled, false);
  assert.equal(g.submit(), false);
  assert.equal(g.state().run.guesses.length, 0);
  digit(h, '1');
  assert.equal(h.node('#submit').disabled, true);
  assert.equal(g.pressDigit('1'), false);
  assert.equal(g.submit(), false);
  assert.equal(g.state().run.guesses.length, 0);
  digit(h, '2');
  h.node('#slots').children[0].dispatch('click');
  assert.equal(g.state().run.cursor, 0);
  assert.equal(g.pressDigit('2'), false);
  assert.deepEqual(plain(g.state().run.draft), ['1', '2']);
  const erase = h.node('#keypad').children.find(node => node.className.includes('delete-key'));
  erase.dispatch('click');
  assert.deepEqual(plain(g.state().run.draft), ['', '2']);
  assert.equal(g.selectSlot(-1), false);
  assert.equal(g.selectSlot(2), false);
  assert.equal(g.pressDigit(3), false);
  assert.equal(g.pressDigit('１２'), false);
  assert.equal(g.startLevel(0), true);
  submit(h, '31');
  assert.deepEqual(plain(g.state().run.guesses), ['31']);
  submit(h, '31');
  assert.equal(g.state().run.guesses.length, 1);
  assert.equal(g.state().notice, '猜过啦');
});

test('codebreaker UI: backspace stays available and removes one slot without changing submitted history', t => {
  const { h, g } = game(t);
  g.startFree(4, false);
  const backspace = () => h.node('#keypad').children.find(node => node.className.includes('delete-key'));
  assert.equal(backspace().disabled, false);
  backspace().dispatch('click');
  assert.equal(g.state().run.cursor, 0);
  assert.deepEqual(plain(g.state().run.draft), ['', '', '', '']);
  fill(h, '0123');
  backspace().dispatch('click');
  assert.deepEqual(plain(g.state().run.draft), ['0', '1', '2', '']);
  backspace().dispatch('click');
  assert.equal(g.state().run.cursor, 2);
  assert.deepEqual(plain(g.state().run.draft), ['0', '1', '', '']);
  assert.deepEqual(plain(g.state().run.guesses), []);
  h.emitWindow('ruge:pause');
  assert.equal(backspace().disabled, true);
  h.click('#resume');
  assert.equal(backspace().disabled, false);
});

test('codebreaker UI: old campaign saves retain player guesses including a former starter guess', t => {
  const active = { kind: 'level', levelId: 0, guesses: ['31'], draft: ['4', ''], cursor: 1 };
  const { h, g } = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, active }) });
  assert.deepEqual(plain(g.state().run.guesses), ['31']);
  assert.deepEqual(plain(g.state().run.draft), ['4', '']);
  h.click('#continue');
  assert.equal(h.node('#history').children.length, 1);
  assert.equal(h.node('#history').children[0].children[0].textContent, '1');
});

test('codebreaker UI: restart confirms, cancels safely and resets this level without clearing earned stars', t => {
  const { h, g } = game(t);
  g.startLevel(0); submit(h, '24');
  dialogAction(h, '下一关 →');
  submit(h, '12'); digit(h, '3');
  const before = plain(g.state().run), progress = plain(g.state().progress);
  h.click('#restart');
  assert.equal(g.state().modal, 'restart');
  dialogAction(h, '继续玩');
  assert.deepEqual(plain(g.state().run), before);
  h.click('#restart'); dialogAction(h, '重新开始');
  const after = g.state();
  assert.equal(after.run.levelId, before.levelId);
  assert.equal(after.run.secret, before.secret);
  assert.deepEqual(plain(after.run.guesses), []);
  assert.deepEqual(plain(after.run.draft), ['', '']);
  assert.equal(after.run.cursor, 0);
  assert.equal(after.run.hints, 0);
  assert.equal(after.modal, '');
  assert.deepEqual(plain(after.progress), progress);
  const restored = game(t, Object.fromEntries(h.saved));
  assert.deepEqual(plain(restored.g.state().run), plain(after.run));
  assert.deepEqual(plain(restored.g.state().progress), progress);
});

test('codebreaker UI: restart keeps the current free password and challenge settings', t => {
  const { h, g } = game(t);
  g.startFree(4, true);
  const before = plain(g.state().run);
  digit(h, '0'); h.click('#restart'); dialogAction(h, '重新开始');
  const after = g.state().run;
  assert.equal(after.secret, before.secret);
  assert.equal(after.length, 4);
  assert.equal(after.challenge, true);
  assert.equal(after.limit, 10);
  assert.deepEqual(plain(after.draft), ['', '', '', '']);
  assert.deepEqual(plain(after.guesses), []);
  h.emitWindow('ruge:pause'); assert.equal(h.node('#restart').disabled, true);
});

test('codebreaker UI: zero-first guesses keep their length, feedback and history after reload', t => {
  for (const length of [2, 3, 4]) {
    const secret = '1023'.slice(0, length), guess = '0123'.slice(0, length);
    const active = { kind: 'free', length, secret, challenge: true, guesses: [], draft: Array(length).fill(''), cursor: 0 };
    const first = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, active }) });
    first.h.click('#continue');
    fill(first.h, guess);
    assert.deepEqual(plain(first.g.state().run.draft), [...guess]);
    assert.equal(first.g.pressDigit('0'), false, 'zero is still subject to the no-repeat rule');
    first.h.click('#submit');
    assert.deepEqual(plain(first.g.state().run.guesses), [guess]);
    const feedback = first.h.node('#history').children[0].children.at(-1);
    assert.equal(feedback.children[0].children[1].textContent, String(length - 2));
    assert.equal(feedback.children[1].children[1].textContent, '2');
    const restored = game(t, Object.fromEntries(first.h.saved));
    assert.equal(restored.g.state().run.secret, secret);
    assert.deepEqual(plain(restored.g.state().run.guesses), [guess]);
    assert.equal(restored.g.state().run.ended, false);
  }
});

test('codebreaker UI: zero-first secrets and draft survive reload and win exactly once', t => {
  for (const length of [2, 3, 4]) {
    const secret = '0123'.slice(0, length);
    const active = { kind: 'free', length, secret, challenge: false, guesses: [], draft: ['0', ...Array(length - 1).fill('')], cursor: 1 };
    const first = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, active }) });
    assert.equal(first.g.state().run.secret, secret);
    assert.deepEqual(plain(first.g.state().run.draft), active.draft);
    first.h.click('#continue');
    for (const d of secret.slice(1)) digit(first.h, d);
    first.h.click('#submit');
    assert.equal(first.g.state().run.won, true);
    assert.deepEqual(plain(first.g.state().run.guesses), [secret]);
    assert.equal(first.g.state().free[length + '-practice'].wins, 1);
    const restored = game(t, Object.fromEntries(first.h.saved));
    assert.equal(restored.g.state().run.won, true);
    assert.equal(restored.g.state().run.secret, secret);
    assert.equal(restored.g.state().free[length + '-practice'].wins, 1);
    assert.equal(restored.g.submit(), false);
  }
});

test('codebreaker UI: all thirty-six levels unlock in sequence through real keypad and next-level clicks', t => {
  const { h, g } = game(t);
  assert.equal(g.startLevel(1), false);
  assert.equal(g.startLevel(36), false);
  assert.equal(g.unlocked(1), false);
  h.node('#levels').children[0].dispatch('click');
  for (const level of g.LEVELS) {
    assert.equal(g.state().run.levelId, level.id);
    assert.equal(g.state().view, 'play');
    assert.deepEqual(plain(g.state().run.guesses), []);
    assert.equal(level.clues.length, 0);
    assert.equal(h.node('#history').children.length, 1);
    assert.equal(h.node('#history').children[0].className, 'history-empty');
    submit(h, level.secret);
    const state = g.state();
    assert.equal(state.run.won, true);
    assert.equal(state.run.ended, true);
    assert.equal(state.modal, 'result');
    assert.equal(state.run.guesses.length, 1, 'the first submitted guess counts as attempt one');
    assert.deepEqual(plain(state.progress[level.id]), { best: 1, stars: 3 });
    assert.equal(Object.keys(state.progress).length, level.id + 1);
    assert.equal(g.submit(), false);
    if (level.id < 35) {
      assert.equal(g.unlocked(level.id + 1), true);
      dialogAction(h, '下一关 →');
    }
  }
  dialogAction(h, '回到关卡');
  assert.equal(g.state().view, 'home');
  assert.equal(h.node('#progressCount').textContent, '36 / 36');
});

test('codebreaker UI: misplaced digits are not a win and hints cost no attempts but cap new stars at two', t => {
  const { h, g } = game(t);
  g.startLevel(0);
  submit(h, '42');
  let state = g.state();
  assert.equal(state.run.won, false);
  assert.equal(state.run.ended, false);
  assert.equal(state.run.guesses.length, 1);
  assert.equal(state.modal, '');
  assert.equal(state.notice, '');
  h.click('#hint');
  assert.equal(g.state().run.guesses.length, 1);
  assert.equal(g.state().run.hints, 1);
  submit(h, '24');
  state = g.state();
  assert.deepEqual(plain(state.progress[0]), { best: 2, stars: 2 });
  assert.equal(state.run.guesses.length, 2);
  assert.equal(g.hint(), false);
  assert.equal(g.pressDigit('1'), false);
  // Replaying independently may improve the record without erasing earned progress.
  g.startLevel(0); submit(h, '24');
  assert.deepEqual(plain(g.state().progress[0]), { best: 1, stars: 3 });
  g.startLevel(0); h.click('#hint'); submit(h, '24');
  assert.deepEqual(plain(g.state().progress[0]), { best: 1, stars: 3 });
});

test('codebreaker UI: one and two stars follow actual attempts beyond the published target', t => {
  const levels = Object.fromEntries(Array.from({ length: 5 }, (_, id) => [id, { best: 1, stars: 3 }]));
  for (const [extra, stars] of [[2, 2], [3, 1]]) {
    const { h, g } = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, levels }) });
    g.startLevel(5);
    const level = g.LEVELS[5], attempts = level.par + extra;
    const wrong = g.candidates(level.length, level.pool)
      .filter(code => code !== level.secret && !level.clues.includes(code)).slice(0, attempts - 1);
    for (const guess of wrong) submit(h, guess);
    submit(h, level.secret);
    assert.deepEqual(plain(g.state().progress[5]), { best: attempts, stars });
  }
});

test('codebreaker UI: free 2/3/4-digit challenges win on the last allowed attempt and record once', t => {
  const { h, g } = game(t);
  for (const length of [2, 3, 4]) {
    assert.equal(g.startFree(length, true), true);
    const { secret, limit } = g.state().run;
    assert.equal(limit, length * 2 + 2);
    const wrong = g.candidates(length, '0123456789').filter(code => code !== secret).slice(0, limit - 1);
    for (const guess of wrong) {
      submit(h, guess);
      assert.equal(g.state().run.ended, false);
    }
    fill(h, secret);
    const result = g.submit();
    assert.deepEqual(plain(result), { bulls: length, cows: 0, wrong: 0, won: true, ended: true });
    assert.deepEqual(plain(g.state().free[length + '-challenge']), { wins: 1, best: limit });
    assert.equal(g.submit(), false);
    h.click('#submit');
    assert.equal(g.state().free[length + '-challenge'].wins, 1);
  }
  const before = plain(g.state());
  assert.equal(g.startFree(5, true), false);
  assert.equal(g.startFree(2, 'yes'), false);
  assert.deepEqual(plain(g.state()), before);
});

test('codebreaker UI: challenge exhaustion ends at 6/8/10 attempts and practice remains unlimited', t => {
  const { h, g } = game(t);
  for (const length of [2, 3, 4]) {
    g.startFree(length, true);
    const { secret, limit } = g.state().run;
    const wrong = g.candidates(length, '0123456789').filter(code => code !== secret).slice(0, limit);
    for (const guess of wrong) submit(h, guess);
    assert.equal(g.state().run.guesses.length, limit);
    assert.equal(g.state().run.ended, true);
    assert.equal(g.state().run.won, false);
    assert.equal(g.state().modal, 'result');
    assert.equal(g.state().free[length + '-challenge'], undefined);
    assert.equal(g.clear(), false);
    assert.equal(g.submit(), false);
  }
  g.startFree(2, false);
  const secret = g.state().run.secret;
  const wrong = g.candidates(2, '0123456789').filter(code => code !== secret).slice(0, 11);
  for (const guess of wrong) submit(h, guess);
  assert.equal(g.state().run.guesses.length, 11);
  assert.equal(g.state().run.ended, false);
  submit(h, secret);
  assert.deepEqual(plain(g.state().free['2-practice']), { wins: 1, best: 12 });
});

test('codebreaker UI: home and native pause preserve the secret, guesses and draft until explicit continue', t => {
  const { h, g } = game(t);
  g.startLevel(0); submit(h, '12'); digit(h, '4');
  const run = plain(g.state().run);
  h.click('#back');
  assert.equal(g.state().view, 'home');
  assert.equal(g.pressDigit('2'), false);
  assert.deepEqual(plain(g.state().run), run);
  h.click('#continue');
  assert.equal(g.state().view, 'play');
  assert.deepEqual(plain(g.state().run), run);
  h.emitWindow('ruge:pause');
  assert.equal(g.state().paused, true);
  assert.equal(h.node('#pauseBar').hidden, false);
  assert.equal(g.submit(), false);
  assert.equal(g.hint(), false);
  h.emitWindow('ruge:resume'); h.emitWindow('ruge:orientation');
  assert.equal(g.state().paused, true);
  assert.deepEqual(plain(g.state().run), run);
  assert.deepEqual(plain(g.state().progress), {});
  h.click('#resume');
  assert.equal(g.state().paused, false);
  assert.deepEqual(plain(g.state().run), run);
  h.document.hidden = true; h.emitDocument('visibilitychange');
  h.document.hidden = false; h.emitDocument('visibilitychange');
  assert.equal(g.state().paused, true);
});

test('codebreaker UI: saved active guesses and draft restore through the actual continue button', t => {
  const first = game(t);
  first.g.startLevel(0); submit(first.h, '12'); digit(first.h, '4');
  first.h.emitWindow('pagehide');
  const savedRun = plain(first.g.state().run);
  const second = game(t, Object.fromEntries(first.h.saved));
  assert.equal(second.g.state().view, 'home');
  assert.deepEqual(plain(second.g.state().run), savedRun);
  second.h.click('#continue');
  assert.equal(second.g.state().view, 'play');
  assert.deepEqual(plain(second.g.state().run), savedRun);
  digit(second.h, '2'); second.h.click('#submit');
  assert.equal(second.g.state().run.guesses.length, 2);
});

test('codebreaker UI: malformed saves are ignored and ended wins are not counted again on load', t => {
  const key = 'rugeCodebreakerV1';
  for (const data of ['{', 'null', '[]', JSON.stringify({ version: 2, levels: { 0: { best: 1, stars: 3 } } }),
    JSON.stringify({ version: 1, levels: { 0: { best: -1, stars: 3 }, 1: { best: 1, stars: 99 } },
      free: { '2-practice': { wins: -1, best: 1 } }, active: { kind: 'free', length: 2, secret: '00', challenge: false, guesses: [] } })]) {
    const { g } = game(t, { [key]: data });
    assert.equal(g.state().run, null);
    assert.deepEqual(plain(g.state().progress), {});
    assert.deepEqual(plain(g.state().free), {});
  }
  const first = game(t);
  first.g.startFree(3, false); submit(first.h, first.g.state().run.secret);
  const state = plain(first.g.state());
  for (let index = 0; index < 3; index++) {
    const next = game(t, Object.fromEntries(first.h.saved));
    assert.deepEqual(plain(next.g.state().free), state.free);
    assert.equal(next.g.state().run.won, true);
    assert.equal(next.g.state().run.ended, true);
    assert.equal(next.g.submit(), false);
    next.h.click('#continue');
    assert.equal(next.g.state().view, 'home');
    assert.deepEqual(plain(next.g.state().free), state.free);
  }
});

test('codebreaker UI: invalid active histories do not restore duplicate attempts or guesses after victory', t => {
  const base = { kind: 'free', length: 2, challenge: false, secret: '12', draft: ['', ''], cursor: 0, hints: 0 };
  for (const guesses of [['34', '34'], ['12', '34'], ['00'], ['11'], ['123']]) {
    const { g } = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, active: { ...base, guesses } }) });
    assert.equal(g.state().run, null);
  }
  const { g } = game(t, { rugeCodebreakerV1: JSON.stringify({ version: 1, active: {
    ...base, challenge: true, guesses: ['34', '35', '36', '37', '38', '39', '40']
  } }) });
  assert.equal(g.state().run, null, 'a two-digit challenge cannot restore more than six attempts');
});
