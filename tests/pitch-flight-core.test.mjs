import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const coreCode = fs.readFileSync(new URL('../app/assets/pitch-adventure/flight-core.js', import.meta.url), 'utf8');
const inputCode = fs.readFileSync(new URL('../app/assets/pitch-adventure/flight-input.js', import.meta.url), 'utf8');
function api() { const window = {document: {hidden: false}}; vm.runInNewContext(coreCode + '\n' + inputCode, {window}); return window; }
const sample = (pitch = 300, rms = .03, overrides = {}) => ({status: 'listening', ageMs: 0, pitch, rms, confidence: .95, ...overrides});
function calibrate(input, pitch = 300) { for (let i = 0; i < 60; i++) input.update(sample(pitch), 1 / 60); assert.equal(input.snapshot().ready, true); }
function run(engine, seconds, intent = 0) { for (let i = 0; i < seconds * 60; i++) engine.step(1 / 60, intent); return engine.snapshot(); }

test('舒适哼校准须连续稳定约0.85秒，静音和陈旧样本不计入', () => {
  const w = api(), input = w.PitchFlightInput.create();
  for (let i = 0; i < 30; i++) input.update(sample(), 1 / 60);
  assert.equal(input.snapshot().ready, false);
  assert.ok(input.snapshot().progress > .5);
  input.update(sample(300, 0), 1 / 60);
  assert.equal(input.snapshot().progress, 0);
  for (let i = 0; i < 120; i++) input.update(sample(300, .03, {ageMs: 500}), 1 / 60);
  assert.equal(input.snapshot().ready, false);
  calibrate(input);
  assert.equal(input.snapshot().baseline, 300);
  input.reset();
  for (let i = 0; i < 80; i++) input.update(sample(i % 12 < 6 ? 200 : 400), 1 / 60);
  assert.equal(input.snapshot().ready, false, '跳变噪声不能形成稳定舒适音域');
});

test('持续高低音可连续升降多个高度，停声保持目标且实际高度平滑', () => {
  const w = api(), input = w.PitchFlightInput.create(), engine = w.PitchFlightCore.create(1);
  calibrate(input);
  const before = engine.snapshot();
  for (let i = 0; i < 50; i++) engine.step(1 / 60, input.update(sample(380), 1 / 60).intent);
  const high = engine.snapshot();
  assert.ok(high.targetY < before.targetY - 100);
  assert.ok(high.y > high.targetY, '实际坐标追随而非瞬移');
  assert.ok(Math.abs(high.y - before.y) < Math.abs(high.targetY - before.targetY));
  for (let i = 0; i < 35; i++) engine.step(1 / 60, input.update(sample(300, 0), 1 / 60).intent);
  assert.equal(engine.snapshot().targetY, high.targetY);
  assert.ok(Math.abs(engine.snapshot().y - high.targetY) < 1);
  for (let i = 0; i < 80; i++) engine.step(1 / 60, input.update(sample(230), 1 / 60).intent);
  assert.ok(engine.snapshot().targetY > high.targetY + 180);
  assert.ok(engine.snapshot().targetY <= 370);
});

test('同音高跨响度方向相同，普通儿童不同基准音域方向相同', () => {
  const w = api();
  for (const base of [160, 240, 360, 500]) {
    for (const rms of [.007, .018, .06, .3]) {
      const input = w.PitchFlightInput.create(); calibrate(input, base);
      let high, low;
      for (let i = 0; i < 10; i++) high = input.update(sample(base * 1.25, rms), 1 / 60);
      for (let i = 0; i < 10; i++) low = input.update(sample(base * .8, rms), 1 / 60);
      assert.equal(high.intent, -1, `${base}/${rms} high`);
      assert.equal(low.intent, 1, `${base}/${rms} low`);
    }
  }
});

test('过期/低置信/后台/长帧均立刻无指令，校准基准不因响度改变', () => {
  const w = api(), input = w.PitchFlightInput.create(); calibrate(input);
  for (let i = 0; i < 10; i++) input.update(sample(380), 1 / 60);
  assert.equal(input.snapshot().intent, -1);
  for (const bad of [{ageMs: 351}, {confidence: .79}, {status: 'stopped'}, {rms: .005}, {pitch: NaN}, {ageMs: -1}, {rms: Infinity}, {confidence: Infinity}, {mode: 'command'}]) {
    assert.equal(input.update(sample(380, .03, bad), 1 / 60).intent, 0);
  }
  assert.equal(input.update(null, 1 / 60).intent, 0);
  w.document.hidden = true;
  assert.equal(input.update(sample(380), 1 / 60).intent, 0);
  w.document.hidden = false;
  assert.equal(input.update(sample(380), 3).intent, 0);
  assert.equal(input.snapshot().baseline, 300);
});

test('同seed逐帧复现，暂停与长帧不偷偷移动或补跑', () => {
  const w = api(), a = w.PitchFlightCore.create(9), b = w.PitchFlightCore.create({seed: 9});
  for (let i = 0; i < 180; i++) { a.step(1 / 60, i < 30 ? -1 : 0); b.step(1 / 60, i < 30 ? -1 : 0); }
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
  a.pause(); const frozen = JSON.stringify(a.snapshot());
  run(a, 12, 1); assert.equal(JSON.stringify(a.snapshot()), frozen);
  a.pause(false); const resumed = JSON.stringify(a.snapshot());
  for (const dt of [2, NaN, Infinity, -1, 0]) a.step(dt, 1);
  assert.equal(JSON.stringify(a.snapshot()), resumed);
  a.step(1 / 60, 0); assert.ok(a.snapshot().distance > JSON.parse(resumed).distance);
});

test('32个seed各120门用真实平滑控制无伤走通，每门可达且难度封顶', () => {
  const w = api();
  for (let seed = 1; seed <= 32; seed++) {
    const engine = w.PitchFlightCore.create(seed); let checked = 0, n = 0;
    while (engine.snapshot().score < 120 && n++ < 15000) {
      const s = engine.snapshot(), gate = s.gates.find(g => !g.passed);
      for (const g of s.gates) if (g.id > checked) {
        assert.ok(g.gap >= 196 && g.gap <= 270);
        assert.ok(g.center - g.gap / 2 + s.radius < 370);
        assert.ok(g.center + g.gap / 2 - s.radius > 80);
        const previous = s.gates.find(other => other.id === g.id - 1);
        if (previous) {
          const seconds = (g.x - previous.x) / w.PitchFlightCore.MAX_SPEED;
          assert.ok(Math.abs(g.center - previous.center) / w.PitchFlightCore.TARGET_SPEED + .3 < seconds);
        }
        checked = g.id;
      }
      const delta = gate.center - s.targetY;
      engine.step(1 / 30, Math.abs(delta) > 2 ? Math.sign(delta) : 0);
      assert.equal(engine.snapshot().lives, 3, `seed ${seed} gate ${gate.id}`);
    }
    const s = engine.snapshot();
    assert.equal(s.score, 120, `seed ${seed} reaches 120`);
    assert.equal(s.speed, 145);
    assert.ok(s.stars > 100, '奖励沿可达门中心');
  }
});

test('碰撞每门至多扣一次，三次机会及护盾继续飞，非一撞结束', () => {
  const w = api(), engine = w.PitchFlightCore.create(19), damage = [];
  let first = null;
  for (let i = 0; i < 30000 && engine.snapshot().phase !== 'over'; i++) {
    const s = engine.step(1 / 60, -1);
    for (const event of s.events) if (event.type === 'hit') {
      damage.push(event.gate);
      if (!first) { first = {...s}; assert.equal(s.lives, 2); assert.equal(s.phase, 'running'); assert.ok(s.shield > 2); }
    }
  }
  assert.ok(first);
  assert.equal(new Set(damage).size, 3);
  assert.equal(damage.length, 3);
  assert.equal(engine.snapshot().phase, 'over');
  assert.equal(engine.snapshot().lives, 0);
  assert.ok(engine.snapshot().distance > first.distance);
  const ended = JSON.stringify(engine.snapshot()); run(engine, 1, 1);
  assert.equal(JSON.stringify(engine.snapshot()), ended);
});

test('每半秒才调整一次的粗粒度儿童策略也能过前20门', () => {
  const w = api();
  for (let seed = 1; seed <= 20; seed++) {
    const engine = w.PitchFlightCore.create(seed); let intent = 0;
    for (let i = 0; i < 6000 && engine.snapshot().score < 20; i++) {
      const s = engine.snapshot(), gate = s.gates.find(g => !g.passed);
      if (i % 15 === 0) intent = Math.abs(gate.center - s.targetY) > 48 ? Math.sign(gate.center - s.targetY) : 0;
      engine.step(1 / 30, intent);
    }
    assert.equal(engine.snapshot().score, 20, `seed ${seed}`);
    assert.equal(engine.snapshot().lives, 3, `seed ${seed}`);
  }
});


test('静音固定中线不能挂机通关：任意种子前五门必须调整高度', () => {
  const w = api();
  for (let seed = 1; seed <= 100; seed++) {
    const engine = w.PitchFlightCore.create(seed);
    const required = new Set();
    for (let i = 0; i < 2400 && engine.snapshot().phase !== 'over'; i++) {
      const s = engine.step(1 / 60, 0);
      for (const gate of s.gates) if (gate.id <= 5 &&
        (225 - s.radius < gate.center - gate.gap / 2 || 225 + s.radius > gate.center + gate.gap / 2)) required.add(gate.id);
    }
    assert.ok(required.has(3) && required.has(4) && required.has(5), `seed ${seed} requires clear up/down/up`);
    assert.equal(engine.snapshot().phase, 'over', `seed ${seed} cannot idle through five gates`);
    assert.ok(engine.snapshot().score <= 4);
    assert.equal(engine.snapshot().lives, 0);
  }
});
