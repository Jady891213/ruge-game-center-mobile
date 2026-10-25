import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const ROOT = new URL('../app/assets/brain-school/', import.meta.url);
function element(tag) {
  let text = '';
  const node = {tagName: tag.toUpperCase(), className: '', children: [], style: {}, dataset: {}, attributes: {}, hidden: false, disabled: false, listeners: {}};
  Object.defineProperty(node, 'textContent', {get: () => text, set: value => {text = String(value); node.children.length = 0;}});
  node.appendChild = child => {node.children.push(child); return child;};
  node.setAttribute = (key, value) => {node.attributes[key] = String(value);};
  node.getAttribute = key => node.attributes[key];
  node.addEventListener = (type, callback) => {node.listeners[type] = callback;};
  node.click = () => {if (!node.disabled && !node.hidden) node.listeners.click?.();};
  const members = () => node.className.split(/\s+/).filter(Boolean);
  node.classList = {
    contains: value => members().includes(value),
    add(value) {node.className = [...new Set([...members(), value])].join(' ');},
    toggle(value, force) {const on = force ?? !members().includes(value); node.className = [...members().filter(x => x !== value), ...(on ? [value] : [])].join(' ');}
  };
  node.querySelectorAll = selector => {
    const descendants = list => list.flatMap(child => [child, ...descendants(child.children)]);
    return descendants(node.children).filter(child => selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector.toUpperCase());
  };
  return node;
}
function load() {
  const window = {document: {createElement: element, createElementNS: (_, tag) => element(tag)}};
  const context = vm.createContext({window, console, setTimeout() {throw Error('Memory game must use active elapsed time, never background timers');}});
  for (const file of ['core.js', 'memory.js']) vm.runInContext(readFileSync(new URL(file, ROOT), 'utf8'), context, {filename: file});
  return window.BrainSchool;
}
const B = load();
const data = value => JSON.parse(JSON.stringify(value));
const byClass = (root, cls) => root.querySelectorAll('.' + cls);
function harness(id, level = 1, seed = 21) {
  const game = B.games.get(id), q = game.create(level, B.rng(seed)), stage = element('main');
  let active = true;
  const answers = [], effects = [];
  const controller = game.mount(stage, q, {active: () => active, answer: value => {answers.push(data(value)); return game.check(q, value);}, fx: name => effects.push(name), mistake() {}, now: () => 0});
  return {game, q, stage, controller, answers, effects, activate(value) {active = value;}};
}

test('记忆类四个真实玩法完整注册，题目可复现且有足够随机变化', () => {
  const ids = ['flash-memory', 'memo-random', 'reverse-retention', 'covered-cages'];
  assert.equal(B.games.size, 4);
  for (const id of ids) {
    const game = B.games.get(id);
    assert.equal(game.category, 'memory');
    const samples = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const a = game.create(5, B.rng(seed)), b = game.create(5, B.rng(seed));
      assert.deepEqual(data(a), data(b)); samples.add(JSON.stringify(a));
    }
    assert.ok(samples.size >= 80, id + ' random variety');
  }
});

test('快闪记忆：十档两千种子样本的原顺序、重复数字与零均按字符判定', () => {
  const game = B.games.get('flash-memory');
  let sawZero = false, sawRepeat = false;
  for (let level = 1; level <= 10; level++) for (let seed = 1; seed <= 200; seed++) {
    const q = game.create(level, B.rng(seed * 619));
    assert.equal(q.sequence.length, 2 + Math.floor((level - 1) / 2));
    assert.ok(q.showMs >= 1000);
    assert.ok(q.sequence.every(token => q.keys.includes(token)));
    assert.equal(game.check(q, q.sequence), true);
    const wrong = data(q.sequence); wrong[0] = q.keys.find(key => key !== wrong[0]);
    assert.equal(game.check(q, wrong), false);
    assert.equal(game.check(q, q.sequence.join('')), false);
    assert.deepEqual(data(game.solution(q)), data(q.sequence));
    sawZero ||= q.sequence.includes('0'); sawRepeat ||= new Set(q.sequence).size < q.sequence.length;
  }
  assert.ok(sawZero && sawRepeat);
});

test('卡片记忆：答案是被遮住的位置，允许不同位置出现同一图案', () => {
  const game = B.games.get('memo-random');
  let sawDuplicate = false;
  for (let level = 1; level <= 10; level++) for (let seed = 1; seed <= 200; seed++) {
    const q = game.create(level, B.rng(seed * 619));
    const expected = q.hidden.map(index => q.cards[index]);
    assert.ok(q.hidden.every(index => Number.isInteger(index) && index >= 0 && index < q.cards.length));
    assert.equal(new Set(q.hidden).size, q.hidden.length);
    assert.ok(expected.every(icon => q.pool.includes(icon)));
    assert.equal(game.check(q, expected), true);
    assert.equal(game.check(q, expected.slice(1)), false);
    const wrong = data(expected); wrong[0] = (wrong[0] + 1) % 12;
    assert.equal(game.check(q, wrong), false);
    assert.deepEqual(data(game.solution(q)), data(expected));
    sawDuplicate ||= new Set(q.cards).size < q.cards.length;
  }
  assert.ok(sawDuplicate);
});

test('倒着记忆：反向复现，不能把正向模仿误判为正确', () => {
  const game = B.games.get('reverse-retention');
  for (let level = 1; level <= 10; level++) for (let seed = 1; seed <= 200; seed++) {
    const q = game.create(level, B.rng(seed * 619));
    const expected = Array.from(q.sequence).reverse();
    assert.equal(game.check(q, expected), true);
    if (q.sequence.some((value, i) => value !== expected[i])) assert.equal(game.check(q, q.sequence), false);
    const wrong = data(expected); wrong[0] = q.pool.find(value => value !== wrong[0]);
    assert.equal(game.check(q, wrong), false);
    assert.deepEqual(data(game.solution(q)), data(expected));
    assert.ok(q.stepMs >= 600);
  }
});

test('小鸟藏哪儿：逐次独立重放位置交换，最终选位严格去重且可解', () => {
  const game = B.games.get('covered-cages');
  let moved = 0;
  for (let level = 1; level <= 10; level++) for (let seed = 1; seed <= 200; seed++) {
    const q = game.create(level, B.rng(seed * 619));
    const locationOfBirds = new Set(q.birds);
    for (const pair of q.swaps) {
      assert.equal(pair.length, 2); assert.notEqual(pair[0], pair[1]);
      const [a, b] = pair, birdAtA = locationOfBirds.has(a), birdAtB = locationOfBirds.has(b);
      locationOfBirds.delete(a); locationOfBirds.delete(b);
      if (birdAtA) locationOfBirds.add(b); if (birdAtB) locationOfBirds.add(a);
    }
    const expected = Array.from(locationOfBirds).sort((a, b) => a - b);
    assert.equal(game.check(q, expected), true);
    assert.equal(game.check(q, expected.slice(1)), false);
    assert.equal(game.check(q, expected.concat(expected[0])), false);
    assert.deepEqual(data(game.solution(q)), expected);
    moved += !q.birds.every(index => locationOfBirds.has(index));
  }
  assert.ok(moved > 1000);
});

test('难度确实改变记忆负担和洗牌复杂度，外部非法级别安全夹紧', () => {
  for (const id of B.games.keys()) {
    const game = B.games.get(id), low = game.create(1, B.rng(1)), high = game.create(10, B.rng(1));
    assert.equal(game.create(-200, B.rng(1)).level, 1);
    assert.equal(game.create(Infinity, B.rng(1)).level, 10);
    if (id === 'memo-random') assert.ok(high.cards.length > low.cards.length && high.hidden.length > low.hidden.length);
    else if (id === 'covered-cages') assert.ok(high.count > low.count && high.swaps.length > low.swaps.length && high.birds.length > low.birds.length && high.swapMs < low.swapMs);
    else assert.ok(high.sequence.length > low.sequence.length);
  }
});

test('真实快闪UI：显示期间输入无效，隐藏后字符消失，错误答案保留可退格', () => {
  const h = harness('flash-memory');
  const keys = byClass(h.stage, 'tile');
  assert.ok(keys.every(button => button.disabled));
  keys[0].click(); assert.equal(h.answers.length, 0);
  h.controller.update(h.q.showMs - 1); assert.ok(keys.every(button => button.disabled));
  h.controller.update(h.q.showMs);
  assert.ok(keys.every(button => !button.disabled));
  assert.ok(byClass(h.stage, 'memory-flash-token').every(cell => cell.textContent === '？'));
  const wrong = h.q.keys.find(token => token !== h.q.sequence[0]);
  keys.find(button => button.textContent === wrong).click();
  keys.find(button => button.textContent === h.q.sequence[1]).click();
  assert.equal(h.answers.length, 1); assert.equal(h.game.check(h.q, h.answers[0]), false);
  assert.equal(byClass(h.stage, 'memory-answer-slot')[0].textContent, wrong);
  byClass(h.stage, 'memory-erase')[0].click();
  assert.equal(byClass(h.stage, 'memory-answer-slot')[1].textContent, '·');
  h.controller.destroy(); assert.ok(keys.every(button => button.disabled));
});

test('真实卡片UI：确认记好后隐藏指定卡，按位置补全，暂停不接受输入', () => {
  const h = harness('memo-random', 10);
  const remember = byClass(h.stage, 'memory-remember')[0];
  h.activate(false); remember.click(); assert.equal(remember.hidden, false);
  h.activate(true); remember.click(); assert.equal(remember.hidden, true);
  assert.equal(byClass(h.stage, 'memory-covered').length, h.q.hidden.length);
  const choices = byClass(h.stage, 'tile');
  for (const value of h.game.solution(h.q)) {
    const button = choices.find(button => button.children[0]?.dataset.symbol === String(value));
    button.click();
  }
  assert.equal(h.answers.length, 1); assert.equal(h.game.check(h.q, h.answers[0]), true);
});

test('真实逆序UI：逐项展示、间隔隐藏与反向输入，未调用update不会偷跑', () => {
  const h = harness('reverse-retention');
  const stride = h.q.stepMs + h.q.gapMs;
  h.controller.update(0);
  const spot = byClass(h.stage, 'memory-sequence-spot')[0];
  assert.equal(spot.children[0].dataset.symbol, String(h.q.sequence[0]));
  h.controller.update(h.q.stepMs); assert.equal(spot.style.opacity, '0');
  h.controller.update(stride); assert.equal(spot.children[0].dataset.symbol, String(h.q.sequence[1]));
  const keys = byClass(h.stage, 'tile'); assert.ok(keys.every(button => button.disabled));
  h.controller.update(h.q.sequence.length * stride);
  for (const value of h.game.solution(h.q)) keys.find(button => button.children[0]?.dataset.symbol === String(value)).click();
  assert.equal(h.answers.length, 1); assert.equal(h.game.check(h.q, h.answers[0]), true);
});

test('真实洗牌UI：盖住后无鸟图泄露，运动途中禁点，最后物理按钮对应真实最终位置', () => {
  const h = harness('covered-cages', 9), buttons = byClass(h.stage, 'memory-cage');
  h.controller.update(0); assert.ok(buttons.every(button => button.disabled));
  h.controller.update(h.q.showMs + h.q.closeMs + h.q.swapMs / 2);
  assert.equal(byClass(h.stage, 'memory-cages-closed').length, 1);
  assert.ok(buttons.every(button => button.disabled));
  const finish = h.q.showMs + h.q.closeMs + h.q.swapMs * h.q.swaps.length;
  h.controller.update(finish);
  const expected = h.game.solution(h.q);
  h.activate(false); buttons[0].click(); assert.equal(h.answers.length, 0); h.activate(true);
  expected.forEach(slot => buttons.find(button => button.attributes['aria-label'] === '第' + (slot + 1) + '个鸟笼').click());
  assert.equal(h.answers.length, 1); assert.equal(h.game.check(h.q, h.answers[0]), true);
  h.controller.destroy(); assert.ok(buttons.every(button => button.disabled));
});
