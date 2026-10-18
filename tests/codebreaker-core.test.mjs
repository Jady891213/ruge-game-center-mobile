import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/assets/code-breaker/core.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const core = context.RugeCodebreaker;
const plain = value => JSON.parse(JSON.stringify(value));
const rejected = run => assert.throws(run, { name: 'RangeError' });
const fullPool = '0123456789';

test('codebreaker: works as a classic browser script and as a globalThis script', () => {
  const browser = vm.createContext({ window: {} });
  vm.runInContext(source, browser);
  assert.equal(typeof browser.window.RugeCodebreaker.score, 'function');
  assert.equal(core.LEVELS.length, 36);
  assert.ok(Object.isFrozen(core));
});

test('codebreaker: exact positions, misplaced digits and absent digits are disjoint', () => {
  assert.deepEqual(plain(core.score('4271', '4271')), { bulls: 4, cows: 0, wrong: 0 });
  assert.deepEqual(plain(core.score('4271', '7124')), { bulls: 0, cows: 4, wrong: 0 });
  assert.deepEqual(plain(core.score('4271', '4203')), { bulls: 2, cows: 0, wrong: 2 });
  assert.deepEqual(plain(core.score('4271', '4723')), { bulls: 1, cows: 2, wrong: 1 });
  assert.deepEqual(plain(core.score('60', '61')), { bulls: 1, cows: 0, wrong: 1 });
});

test('codebreaker: all legal two-digit pairs preserve totals and score symmetry', () => {
  const codes = core.candidates(2, fullPool);
  assert.equal(codes.length, 90);
  for (const secret of codes) {
    for (const guess of codes) {
      const result = core.score(secret, guess);
      assert.equal(result.bulls + result.cows + result.wrong, 2);
      assert.ok(Object.values(result).every(value => Number.isInteger(value) && value >= 0));
      assert.deepEqual(plain(result), plain(core.score(guess, secret)));
    }
  }
});

test('codebreaker: 2, 3 and 4 unique ASCII digits accept zero in every position', () => {
  for (const code of ['01', '012', '0123', '12', '123', '1234', '12345', '00', '11', '1', '１２', ' 12', '12 ', 12, null]) {
    const expected = typeof code === 'string' && ['01', '012', '0123', '12', '123', '1234'].includes(code);
    assert.equal(core.valid(code, typeof code === 'string' ? code.length : 2, fullPool), expected);
    if (!expected) rejected(() => core.score(code, '12'));
  }
  assert.equal(core.valid('20', 2, fullPool), true);
  assert.equal(core.valid('24', 2, '123'), false);
  assert.equal(core.valid('12', 2, '1123'), false);
  assert.equal(core.valid('12', 2, ''), false);
  assert.equal(core.valid('12', 2, '12x'), false);
  assert.equal(core.valid('123', 2, fullPool), false);
  rejected(() => core.score('123', '12'));
  assert.deepEqual(plain(core.score('12', '01')), { bulls: 0, cows: 1, wrong: 1 });
  assert.deepEqual(plain(core.score('0123', '0123')), { bulls: 4, cows: 0, wrong: 0 });
  assert.deepEqual(plain(core.score('0123', '1023')), { bulls: 2, cows: 2, wrong: 0 });
  rejected(() => core.score('12', '11'));
});

test('codebreaker: candidates include every legal permutation exactly once', () => {
  for (const [length, expected] of [[2, 90], [3, 720], [4, 5040]]) {
    const codes = core.candidates(length, fullPool);
    assert.equal(codes.length, expected);
    assert.equal(new Set(codes).size, expected);
    assert.ok(codes.every(code => core.valid(code, length, fullPool)));
  }
  assert.deepEqual(plain(core.candidates(2, '012')), ['01', '02', '10', '12', '20', '21']);
  for (const [length, pool] of [[1, fullPool], [5, fullPool], [2, '1'], [2, '0012'], [2, '12x'], [2, null]]) {
    rejected(() => core.candidates(length, pool));
  }
});

test('codebreaker: all thirty-six fixed levels are progressive, legal and solvable', () => {
  assert.deepEqual(plain(core.LEVELS.slice(0,18).map(level => level.length)), [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
  for (const [id, level] of core.LEVELS.entries()) {
    assert.equal(level.id, id);
    assert.ok(level.title && level.lesson);
    assert.ok(Number.isInteger(level.par) && level.par > 0);
    assert.equal(core.valid(level.secret, level.length, level.pool), true);
    const history = level.clues.map(guess => {
      assert.equal(core.valid(guess, level.length, level.pool), true);
      assert.notEqual(guess, level.secret);
      return { guess, ...core.score(level.secret, guess) };
    });
    const possible = core.remaining(level.length, level.pool, history);
    assert.ok(possible.includes(level.secret));
    assert.ok(possible.length > 0);
    const solved = core.remaining(level.length, level.pool, [...history, {
      guess: level.secret, bulls: level.length, cows: 0
    }]);
    assert.deepEqual(plain(solved), [level.secret]);
    assert.equal(core.hint(level.length, level.pool, history).candidates, possible.length);
    if (id % 6) assert.ok(level.pool.length >= core.LEVELS[id - 1].pool.length);
  }
  assert.ok(Object.isFrozen(core.LEVELS) && Object.isFrozen(core.LEVELS[0].clues));
});

test('codebreaker: candidate filtering keeps the real answer and matches the complete history', () => {
  for (const secret of core.candidates(2, '01234')) {
    const history = [];
    for (const guess of ['12', '30', '24']) {
      history.push({ guess, ...core.score(secret, guess) });
      const possible = core.remaining(2, '01234', history);
      assert.ok(possible.includes(secret));
      for (const code of possible) for (const row of history) {
        const result = core.score(code, row.guess);
        assert.equal(result.bulls, row.bulls);
        assert.equal(result.cows, row.cows);
      }
    }
  }
  assert.deepEqual(plain(core.remaining(2, '1234', [{ guess: '13', bulls: 0, cows: 2, wrong: 999 }])), ['31']);
});

test('codebreaker: invalid feedback is rejected; valid but incompatible rows yield no candidates', () => {
  for (const history of [null, {}, [null], [{ guess: '01', bulls: 0, cows: 0 }],
    [{ guess: '11', bulls: 0, cows: 0 }], [{ guess: '12', bulls: -1, cows: 0 }],
    [{ guess: '12', bulls: 1.5, cows: 0 }], [{ guess: '12', bulls: '1', cows: 0 }],
    [{ guess: '12', bulls: 2, cows: 1 }], [{ guess: '12', bulls: 1, cows: 1 }],
    [{ guess: '12', bulls: 0 }]]) rejected(() => core.remaining(2, '1234', history));
  rejected(() => core.remaining(2, '12', [{ guess: '12', bulls: 0, cows: 0 }]));
  const contradictory = [{ guess: '12', bulls: 2, cows: 0 }, { guess: '34', bulls: 2, cows: 0 }];
  assert.deepEqual(plain(core.remaining(2, '1234', contradictory)), []);
  assert.equal(core.hint(2, '1234', contradictory).candidates, 0);
});

test('codebreaker: random challenge samples all legal candidates without endpoint bias', () => {
  for (const length of [2, 3, 4]) {
    const codes = core.candidates(length, fullPool);
    assert.equal(core.randomCode(length, fullPool, () => 0), codes[0]);
    assert.equal(core.randomCode(length, fullPool, () => 1 - Number.EPSILON), codes.at(-1));
    for (let i = 0; i < codes.length; i++) {
      assert.equal(core.randomCode(length, fullPool, () => (i + 0.5) / codes.length), codes[i]);
    }
  }
  for (const sample of [-0.1, 1, NaN, Infinity]) rejected(() => core.randomCode(2, fullPool, () => sample));
  rejected(() => core.randomCode(5, fullPool));
  rejected(() => core.randomCode(2, fullPool, null));
});

test('codebreaker: hints state facts inferred from clues, with no hidden-secret argument', () => {
  const unique = core.hint(2, '1234', [{ guess: '13', bulls: 0, cows: 2 }]);
  assert.equal(unique.candidates, 1);
  assert.match(unique.text, /第 1 位只能是 3/);
  const common = core.hint(3, '1234', [{ guess: '123', bulls: 0, cows: 3 }]);
  assert.match(common.text, /一定包含数字 1/);
  const excluded = core.hint(2, fullPool, [{ guess: '12', bulls: 0, cows: 0 }]);
  assert.match(excluded.text, /12.*都不在密码/);
  const general = core.hint(4, fullPool, []);
  assert.equal(general.candidates, 5040);
  assert.match(general.text, /5040 种可能/);
});

test('codebreaker: inferred hint facts hold for every two-digit feedback candidate set', () => {
  const codes = core.candidates(2, '012345');
  for (const guess of codes) {
    const seen = new Set();
    for (const secret of codes) {
      const feedback = core.score(secret, guess);
      const key = feedback.bulls + ':' + feedback.cows;
      if (seen.has(key)) continue;
      seen.add(key);
      const history = [{ guess, ...feedback }];
      const possible = core.remaining(2, '012345', history);
      const hint = core.hint(2, '012345', history);
      assert.equal(hint.candidates, possible.length);
      const position = hint.text.match(/第 (\d) 位只能是 (\d)/);
      const present = hint.text.match(/一定包含数字 (\d)/);
      if (position) assert.ok(possible.every(code => code[Number(position[1]) - 1] === position[2]));
      else if (present) assert.ok(possible.every(code => code.includes(present[1])));
      else if (hint.text.includes('都不在密码')) {
        assert.ok(possible.every(code => Array.from(guess).every(digit => !code.includes(digit))));
      }
    }
  }
});
