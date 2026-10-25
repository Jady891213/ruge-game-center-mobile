import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const root = new URL('../app/assets/brain-school/', import.meta.url);
const window = {};
const context = vm.createContext({window});
for (const file of ['core.js', 'identify.js', 'compute.js']) {
  vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, {filename: file});
}
const B = window.BrainSchool;
const json = value => JSON.parse(JSON.stringify(value));
const all = (id, check, seeds = 100) => {
  const game = B.games.get(id);
  for (let level = 1; level <= 10; level++) for (let seed = 1; seed <= seeds; seed++) {
    const q = game.create(level, B.rng(seed * 1009));
    check(game, q, level, seed);
  }
};
const invalidScalars = [null, undefined, NaN, '0', [], {}, false, Infinity];

test('直觉与数字8款真实玩法注册、随机题可复现且有变化', () => {
  const ids = ['whack-match', 'species-spotlight', 'frame-filler', 'fast-focus', 'add-agency', 'mallet-math', 'tick-tock', 'balloon-burst'];
  assert.equal(B.games.size, ids.length);
  for (const id of ids) {
    const game = B.games.get(id);
    assert.ok(game && typeof game.mount === 'function');
    const variants = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const q = game.create(5, B.rng(seed * 1009));
      assert.deepEqual(json(q), json(game.create(5, B.rng(seed * 1009))));
      assert.equal(game.check(q, game.solution(q)), true, id + ' solvable');
      variants.add(JSON.stringify(q));
    }
    // Fast Focus deliberately reuses six animal assets, but permutes distractors/order.
    assert.ok(variants.size >= (id === 'fast-focus' ? 35 : 70), id + ': variety=' + variants.size);
  }
});

test('配图鼹鼠：收集全部目标才通过，顺序可变，重复或陌生图案拒绝', () => {
  all('whack-match', (game, q, level) => {
    assert.equal(new Set(q.targets).size, q.targets.length);
    assert.ok(q.targets.length >= 1 && q.targets.length <= 4);
    assert.equal(q.deck.length, 12); assert.equal(new Set(q.deck).size, 12);
    assert.ok(q.targets.every(id => q.deck.includes(id)));
    assert.equal(game.check(q, q.targets.slice().reverse()), true);
    assert.equal(game.check(q, q.targets.slice(1)), false);
    assert.equal(game.check(q, q.targets.concat(q.targets[0])), false);
    const wrong = Array.from(q.targets); wrong[0] = q.deck.find(id => !q.targets.includes(id));
    assert.equal(game.check(q, wrong), false);
    assert.equal(game.check(q, q.targets.map(String)), false);
    assert.equal(game.check(q, null), false);
    assert.equal(q.holes, level < 4 ? 3 : 6);
  });
});

test('动物照灯：从真实动物列表独立计数，每题唯一最多，候选答案一致', () => {
  all('species-spotlight', (game, q) => {
    const frequency = new Map();
    for (const id of q.animals) frequency.set(id, (frequency.get(id) || 0) + 1);
    assert.equal(frequency.size, q.species.length);
    q.species.forEach((id, i) => assert.equal(frequency.get(id), q.counts[i]));
    const max = Math.max(...frequency.values());
    const winners = [...frequency].filter(([, count]) => count === max).map(([id]) => id);
    assert.equal(winners.length, 1, 'must not generate ties');
    assert.equal(q.answer, winners[0]);
    for (let candidate = -1; candidate < 13; candidate++) assert.equal(game.check(q, candidate), candidate === winners[0]);
    for (const wrong of invalidScalars) assert.equal(game.check(q, wrong), false);
  });
});

test('补全画片：从实际缺口内容推导候选，正确补片恰有一个，越界/字符串拒绝', () => {
  all('frame-filler', (game, q) => {
    assert.ok(Number.isInteger(q.hole) && q.hole >= 0 && q.hole < q.art.length);
    assert.equal(q.art.length, 12); assert.equal(q.options.length, 4);
    const expected = [];
    q.options.forEach((art, index) => {
      assert.equal(art.length, q.art.length);
      assert.ok(art.every(id => Number.isInteger(id) && id >= 0 && id < 12));
      // Renderer crops precisely the hole tile, so uniqueness must hold at that tile,
      // not only in otherwise invisible parts of the full collage.
      if (art[q.hole] === q.art[q.hole]) expected.push(index);
    });
    assert.equal(expected.length, 1);
    assert.equal(q.answer, expected[0]);
    for (let answer = -2; answer <= 5; answer++) assert.equal(game.check(q, answer), answer === expected[0]);
    assert.equal(game.check(q, String(expected[0])), false);
    for (const wrong of invalidScalars) assert.equal(game.check(q, wrong), false);
  });
});

test('雾里猜猜：展示目标始终在候选内且不重复，只认正确物品', () => {
  all('fast-focus', (game, q, level) => {
    assert.equal(q.options.length, level < 3 ? 2 : 4);
    assert.equal(new Set(q.options).size, q.options.length);
    assert.equal(q.options.filter(id => id === q.answer).length, 1);
    for (let answer = -1; answer <= 12; answer++) assert.equal(game.check(q, answer), answer === q.answer);
    for (const wrong of invalidScalars) assert.equal(game.check(q, wrong), false);
    assert.ok(q.reveal >= 2500 && q.reveal <= 6500);
  });
});

test('凑数小队：枚举所有两组组合，每个合法非标准解都接受，重复索引不可凑数', () => {
  let alternativeSolutions = 0;
  all('add-agency', (game, q) => {
    assert.equal(new Set(q.values).size, q.values.length);
    assert.ok(q.values.every(n => Number.isInteger(n) && n > 0));
    const legal = [];
    for (let a = 0; a < q.values.length; a++) for (let b = a + 1; b < q.values.length; b++) {
      const expected = q.values[a] + q.values[b] === q.target;
      assert.equal(game.check(q, [a, b]), expected);
      assert.equal(game.check(q, [b, a]), expected, 'choice order should not matter');
      if (expected) legal.push([a, b]);
    }
    assert.ok(legal.length > 0, 'every generated task has a solution');
    alternativeSolutions += legal.length > 1;
    const submitted = json(game.solution(q));
    assert.ok(legal.some(pair => pair[0] === submitted[0] && pair[1] === submitted[1]));
    const i = submitted[0];
    for (const wrong of [null, [], [i], [i, i], [0, 1, 2], [-1, i], [i, q.values.length], [String(i), submitted[1]], [0.5, submitted[1]]]) {
      assert.equal(game.check(q, wrong), false);
    }
  });
  assert.ok(alternativeSolutions > 100, 'test includes multiple-valid-answer questions');
});

test('数字敲敲乐：独立穷举所有剩余集合，至少有一次删除解，所有等和合法解都有效', () => {
  let alternativeSolutions = 0;
  all('mallet-math', (game, q) => {
    const sum = q.values.reduce((a, b) => a + b, 0);
    assert.ok(q.target > 0 && q.target < sum, 'at least one block must be removed');
    const legal = [];
    for (let mask = 0; mask < 2 ** q.values.length; mask++) {
      const keep = [];
      for (let i = 0; i < q.values.length; i++) if (mask & 2 ** i) keep.push(i);
      const expected = keep.length > 0 && keep.reduce((total, i) => total + q.values[i], 0) === q.target;
      assert.equal(game.check(q, keep), expected);
      if (expected) {
        legal.push(keep);
        assert.equal(game.check(q, keep.slice().reverse()), true);
      }
    }
    assert.ok(legal.length > 0);
    alternativeSolutions += legal.length > 1;
    assert.ok(legal.some(keep => JSON.stringify(keep) === JSON.stringify(game.solution(q))));
    const i = legal[0][0];
    for (const wrong of [null, [], [i, i], [-1], [q.values.length], [String(i)], [i, -1], [0.5]]) assert.equal(game.check(q, wrong), false);
  }, 60);
  assert.ok(alternativeSolutions > 100);
});

test('时钟转转：独立换算前后分钟，跨12点、负方向与整圈等价均正确', () => {
  let forwards = 0, backwards = 0, wraps = 0;
  all('tick-tock', (game, q) => {
    assert.ok(q.start >= 0 && q.start < 720 && q.start % 5 === 0);
    assert.ok(q.delta !== 0 && q.delta % 5 === 0);
    const hours = Math.floor(q.start / 60), minutes = q.start % 60;
    let total = hours * 60 + minutes + q.delta;
    if (total < 0 || total >= 720) wraps++;
    while (total < 0) total += 720;
    while (total >= 720) total -= 720;
    assert.equal(q.target, total);
    assert.equal(game.check(q, total), true);
    assert.equal(game.check(q, total + 720), true);
    assert.equal(game.check(q, total - 720), true);
    assert.equal(game.check(q, total + 5), false);
    assert.equal(game.check(q, total + 0.5), false);
    assert.equal(game.check(q, String(total)), false);
    assert.equal(game.solution(q), total);
    forwards += q.delta > 0; backwards += q.delta < 0;
  });
  assert.ok(forwards > 300 && backwards > 300 && wraps > 20);
  const game = B.games.get('tick-tock');
  for (const [start, delta, target] of [[710, 30, 20], [10, -30, 700], [0, -60, 660], [690, 90, 60]]) {
    assert.equal(game.check({start, delta, target}, target), true);
    assert.equal(game.check({start, delta, target}, start), false);
  }
});

test('顺序气球：按数值排序而非大小/位置，错误次序、重复或遗漏拒绝', () => {
  let includesZero = false;
  all('balloon-burst', (game, q, level) => {
    assert.equal(new Set(q.values).size, q.values.length);
    assert.equal(q.values.length, Math.min(9, 2 + Math.ceil(level / 2)));
    assert.ok(q.values.every(n => Number.isInteger(n) && n >= 0));
    const expected = Array.from(q.values).sort((a, b) => a - b);
    assert.equal(game.check(q, expected), true);
    const wrong = expected.slice(); [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    assert.equal(game.check(q, wrong), false);
    const duplicate = expected.slice(); duplicate[1] = duplicate[0];
    assert.equal(game.check(q, duplicate), false);
    assert.equal(game.check(q, expected.slice(1)), false);
    assert.equal(game.check(q, expected.map(String)), false);
    assert.equal(game.check(q, null), false);
    assert.deepEqual(json(game.solution(q)), expected);
    assert.ok(q.sizes.slice(0, q.values.length).every(size => size >= 54 && size <= 86));
    includesZero ||= q.values.includes(0);
  });
  assert.ok(includesZero);
});

test('八款游戏都能连续随机出题、计时得分、递进至最高难度，错误扣分且留原题', () => {
  for (const id of B.games.keys()) {
    const run = B.session(id, 81763);
    const first = run.question();
    const wrong = id === 'frame-filler' ? -1 : id === 'species-spotlight' || id === 'fast-focus' || id === 'tick-tock' ? -1001 : [];
    const before = run.state.remaining;
    assert.equal(run.answer(wrong).ok, false);
    assert.equal(run.state.mistakes, 1); assert.ok(run.state.remaining < before);
    assert.equal(run.question(), first);
    const game = B.games.get(id);
    for (let i = 0; i < 30; i++) {
      const result = run.answer(game.solution(run.question()));
      assert.equal(result.ok, true, id); assert.ok(result.points >= 100);
      const prior = run.question(); run.next(); assert.notEqual(run.question(), prior);
    }
    assert.equal(run.state.correct, 30); assert.equal(run.state.level, 10); assert.ok(run.state.score > 3000);
    for (let i = 0; i < 400; i++) run.tick(200);
    assert.equal(run.state.ended, true); assert.equal(run.state.remaining, 0);
  }
});
