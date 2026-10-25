(function () {
  'use strict';
  const B = window.BrainSchool;
  const ICONS = Array.from({length: 12}, (_, i) => i);
  const sameSequence = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
  const levelOf = value => Math.max(1, Math.min(10, Math.floor(Number(value) || 1)));
  const copy = a => a.slice();
  function action(label, handler, cls = 'secondary') {
    const button = B.el('button', cls, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }
  function slots(stage, count, cls = '') {
    const row = B.el('div', 'memory-answer-row ' + cls);
    row.setAttribute('aria-label', '当前答案');
    const cells = Array.from({length: count}, () => {
      const cell = B.el('span', 'memory-answer-slot');
      row.appendChild(cell);
      return cell;
    });
    stage.appendChild(row);
    cells.row = row;
    return cells;
  }
  function setToken(cell, token, symbolic) {
    cell.textContent = '';
    if (token === undefined) { cell.textContent = '·'; return; }
    if (symbolic) cell.appendChild(B.symbol(token, 38));
    else cell.textContent = String(token);
  }
  function makeSequence(rng, pool, length) {
    const result = [];
    for (let i = 0; i < length; i++) {
      const available = pool.filter(x => i === 0 || x !== result[i - 1]);
      result.push(B.pick(rng, available));
    }
    return result;
  }
  function inputPanel(stage, api, pool, length, symbolic, submit, columns = 4) {
    let input = [], enabled = false, destroyed = false;
    const cells = slots(stage, length);
    const items = pool.map(value => symbolic ? {value, symbol: value} : {value, label: value});
    const buttons = B.choices(stage, items, value => {
      if (!enabled || destroyed || !api.active() || input.length >= length) return;
      input.push(value);
      api.fx('select');
      render();
      if (input.length === length) submit(copy(input));
    }, columns);
    const erase = action('⌫', () => {
      if (!enabled || destroyed || !api.active() || !input.length) return;
      input.pop(); api.fx('undo'); render();
    }, 'secondary memory-erase');
    erase.setAttribute('aria-label', '退回一格');
    cells.row.appendChild(erase);
    function render() {
      cells.forEach((cell, i) => setToken(cell, input[i], symbolic));
      erase.disabled = !enabled || !input.length;
    }
    buttons.forEach(button => { button.disabled = true; });
    render();
    return {
      enable() { enabled = true; buttons.forEach(button => {button.disabled = false;}); render(); },
      values: () => copy(input),
      destroy() { destroyed = true; enabled = false; buttons.forEach(button => {button.disabled = true;}); }
    };
  }

  B.register({
    id: 'flash-memory', name: '快闪记忆', category: 'memory', icon: 11,
    create(level, rng) {
      level = levelOf(level);
      const length = 2 + Math.floor((level - 1) / 2);
      const pool = Array.from({length: level < 3 ? 6 : 10}, (_, i) => String(i));
      if (level >= 7) pool.push('★', '♥');
      return {level, sequence: makeSequence(rng, pool, length), keys: copy(pool), showMs: Math.round(1400 + length * 260 - level * 70)};
    },
    check(q, answer) { return sameSequence(answer, q.sequence); },
    solution(q) { return copy(q.sequence); },
    mount(stage, q, api) {
      const prompt = B.prompt(stage, '记一记');
      const display = B.el('div', 'memory-flash scene');
      display.setAttribute('aria-label', '短暂显示的数字');
      q.sequence.forEach(token => display.appendChild(B.el('span', 'memory-flash-token', token)));
      const sweep = B.el('div', 'memory-time-track'), fill = B.el('i', '');
      sweep.appendChild(fill); display.appendChild(sweep); stage.appendChild(display);
      const panel = inputPanel(stage, api, q.keys, q.sequence.length, false, value => api.answer(value), q.keys.length <= 6 ? 3 : 4);
      let hidden = false;
      return {
        update(elapsed) {
          if (!hidden && elapsed >= q.showMs) {
            hidden = true; display.classList.add('memory-hidden');
            display.setAttribute('aria-hidden', 'true');
            display.querySelectorAll('.memory-flash-token').forEach(cell => {cell.textContent = '？';});
            prompt.textContent = '按顺序点'; panel.enable();
          }
          fill.style.transform = 'scaleX(' + Math.max(0, 1 - elapsed / q.showMs) + ')';
        },
        destroy() { panel.destroy(); }
      };
    }
  });

  B.register({
    id: 'memo-random', name: '卡片记忆', category: 'memory', icon: 6,
    create(level, rng) {
      level = levelOf(level);
      const count = 3 + Math.floor((level - 1) / 2);
      const pool = B.sample(rng, ICONS, Math.min(10, count + 2));
      const cards = level < 6 ? B.sample(rng, pool, count) : Array.from({length: count}, () => B.pick(rng, pool));
      const hidden = B.sample(rng, cards.map((_, i) => i), 1 + Math.floor((level - 1) / 4)).sort((a, b) => a - b);
      return {level, cards, hidden, pool: B.shuffle(rng, pool)};
    },
    check(q, answer) { return sameSequence(answer, q.hidden.map(index => q.cards[index])); },
    solution(q) { return q.hidden.map(index => q.cards[index]); },
    mount(stage, q, api) {
      const prompt = B.prompt(stage, '记一记');
      const board = B.el('div', 'memory-cards');
      board.style.gridTemplateColumns = 'repeat(' + (q.cards.length <= 4 ? q.cards.length : 4) + ',1fr)';
      const cards = q.cards.map((icon, index) => {
        const cell = B.el('div', 'memory-card');
        cell.setAttribute('aria-label', '第' + (index + 1) + '张卡');
        cell.appendChild(B.symbol(icon, 64));
        board.appendChild(cell); return cell;
      });
      stage.appendChild(board);
      let answering = false, input = [], destroyed = false;
      const remember = action('记好啦', () => {
        if (destroyed || answering || !api.active()) return;
        answering = true; remember.hidden = true; choices.hidden = false; erase.hidden = false;
        q.hidden.forEach(index => {cards[index].textContent = '？'; cards[index].classList.add('memory-covered');});
        prompt.textContent = '藏起来的是？'; api.fx('tap'); render();
      }, 'primary memory-remember');
      stage.appendChild(remember);
      const choices = B.el('div', 'memory-options' + (q.pool.length > 6 ? ' memory-many' : ''));
      const choiceButtons = B.choices(choices, q.pool.map(value => ({value, symbol: value})), value => {
        if (!answering || destroyed || !api.active() || input.length >= q.hidden.length) return;
        input.push(value); api.fx('select'); render();
        if (input.length === q.hidden.length) api.answer(copy(input));
      }, q.pool.length <= 6 ? 3 : 5);
      choices.hidden = true; stage.appendChild(choices);
      const erase = action('⌫', () => {
        if (!answering || destroyed || !api.active() || !input.length) return;
        input.pop(); api.fx('undo'); render();
      }, 'secondary memory-erase memory-memo-erase');
      erase.setAttribute('aria-label', '退回一格'); erase.hidden = true; stage.appendChild(erase);
      function render() {
        q.hidden.forEach((index, n) => {
          const cell = cards[index]; cell.textContent = '';
          cell.classList.toggle('memory-current', n === Math.min(input.length, q.hidden.length - 1));
          if (input[n] === undefined) cell.textContent = '？'; else cell.appendChild(B.symbol(input[n], 54));
        });
        erase.disabled = !input.length;
      }
      return {destroy() {destroyed = true; choiceButtons.forEach(button => {button.disabled = true;});}};
    }
  });

  B.register({
    id: 'reverse-retention', name: '倒着记忆', category: 'memory', icon: 4,
    create(level, rng) {
      level = levelOf(level);
      const length = 2 + Math.floor((level - 1) / 2);
      const pool = B.sample(rng, ICONS, Math.min(8, 3 + Math.floor(level / 2)));
      return {level, sequence: makeSequence(rng, pool, length), pool: B.shuffle(rng, pool), stepMs: 1100 - level * 50, gapMs: 180};
    },
    check(q, answer) { return sameSequence(answer, copy(q.sequence).reverse()); },
    solution(q) { return copy(q.sequence).reverse(); },
    mount(stage, q, api) {
      const prompt = B.prompt(stage, '记住顺序');
      const screen = B.el('div', 'memory-sequence scene');
      const spot = B.el('div', 'memory-sequence-spot');
      const dots = B.el('div', 'memory-step-dots');
      const markers = q.sequence.map(() => {const dot = B.el('i', ''); dots.appendChild(dot); return dot;});
      screen.appendChild(spot); screen.appendChild(dots); stage.appendChild(screen);
      const panel = inputPanel(stage, api, q.pool, q.sequence.length, true, value => api.answer(value), q.pool.length <= 6 ? 3 : 4);
      let previous = -1, answering = false;
      return {
        update(elapsed) {
          if (answering) return;
          const stride = q.stepMs + q.gapMs, index = Math.floor(elapsed / stride);
          if (index >= q.sequence.length) {
            answering = true; screen.classList.add('memory-sequence-done');
            spot.textContent = '↶'; spot.style.opacity = '1'; prompt.textContent = '从后往前点'; panel.enable(); return;
          }
          if (index !== previous) {
            previous = index; spot.textContent = ''; spot.appendChild(B.symbol(q.sequence[index], 108));
            markers.forEach((dot, n) => dot.classList.toggle('seen', n <= index));
            api.fx('tap');
          }
          spot.style.opacity = elapsed % stride < q.stepMs ? '1' : '0';
        },
        destroy() {panel.destroy();}
      };
    }
  });

  function cagePermutation(q, completed = q.swaps.length) {
    const occupants = Array.from({length: q.count}, (_, i) => i);
    q.swaps.slice(0, completed).forEach(([a, b]) => {[occupants[a], occupants[b]] = [occupants[b], occupants[a]];});
    return occupants;
  }
  function cageAnswer(q) {
    const occupants = cagePermutation(q);
    return occupants.map((id, slot) => q.birds.includes(id) ? slot : -1).filter(slot => slot >= 0);
  }
  B.register({
    id: 'covered-cages', name: '小鸟藏哪儿', category: 'memory', icon: 2,
    create(level, rng) {
      level = levelOf(level);
      const count = Math.min(6, 3 + Math.floor((level - 1) / 3));
      const birds = B.sample(rng, Array.from({length: count}, (_, i) => i), 1 + Math.floor((level - 1) / 4));
      const swaps = [];
      for (let i = 0; i < 2 + Math.floor(level / 2); i++) swaps.push(B.sample(rng, Array.from({length: count}, (_, n) => n), 2));
      return {level, count, birds, swaps, showMs: 1500, closeMs: 350, swapMs: 880 - level * 34};
    },
    check(q, answer) {
      return Array.isArray(answer) && answer.length === q.birds.length && new Set(answer).size === answer.length && B.sameSet(answer, cageAnswer(q));
    },
    solution(q) { return cageAnswer(q); },
    mount(stage, q, api) {
      const prompt = B.prompt(stage, '小鸟在哪儿？');
      const hint = B.el('div', 'memory-bird-count');
      q.birds.forEach(() => hint.appendChild(B.symbol(2, 28))); stage.appendChild(hint);
      const board = B.el('div', 'memory-cage-board scene'); stage.appendChild(board);
      let answering = false, destroyed = false, selected = [], currentSlots = Array.from({length: q.count}, (_, i) => i);
      const buttons = Array.from({length: q.count}, (_, id) => {
        const button = action('', () => {
          if (destroyed || !answering || !api.active()) return;
          const slot = currentSlots[id], at = selected.indexOf(slot);
          if (at >= 0) selected.splice(at, 1);
          else if (selected.length < q.birds.length) selected.push(slot);
          else return;
          button.classList.toggle('selected', selected.includes(slot)); api.fx('select');
          if (selected.length === q.birds.length) api.answer(copy(selected));
        }, 'memory-cage');
        const perch = B.el('span', 'memory-cage-inside');
        if (q.birds.includes(id)) perch.appendChild(B.symbol(2, 60));
        else perch.appendChild(B.el('span', 'memory-empty-perch', '·'));
        button.appendChild(perch); button.appendChild(B.el('span', 'memory-cage-door', '?'));
        button.disabled = true; board.appendChild(button); return button;
      });
      const position = slot => ({x: (slot % 3 + .5) * 100 / 3, y: q.count <= 3 ? 50 : 28 + Math.floor(slot / 3) * 44});
      function place(elapsed) {
        const shiftTime = elapsed - q.showMs - q.closeMs;
        const completed = Math.max(0, Math.min(q.swaps.length, Math.floor(shiftTime / q.swapMs)));
        const occupants = cagePermutation(q, completed);
        const slotsById = Array(q.count); occupants.forEach((id, slot) => {slotsById[id] = slot;});
        const progress = Math.max(0, Math.min(1, (shiftTime - completed * q.swapMs) / q.swapMs));
        const smooth = progress * progress * (3 - 2 * progress);
        const swapping = shiftTime >= 0 && completed < q.swaps.length;
        buttons.forEach((button, id) => {
          const slot = slotsById[id]; let p = position(slot);
          if (swapping) {
            const [a, b] = q.swaps[completed];
            if (slot === a || slot === b) {
              const target = position(slot === a ? b : a), arc = Math.sin(progress * Math.PI) * (slot === a ? -12 : 12);
              p = {x: p.x + (target.x - p.x) * smooth, y: p.y + (target.y - p.y) * smooth + arc};
            }
          }
          button.style.left = p.x + '%'; button.style.top = p.y + '%';
        });
        currentSlots = slotsById;
      }
      return {
        update(elapsed) {
          if (destroyed) return;
          const closed = elapsed >= q.showMs;
          board.classList.toggle('memory-cages-closed', closed);
          place(elapsed);
          if (!answering && elapsed >= q.showMs + q.closeMs + q.swaps.length * q.swapMs) {
            answering = true; prompt.textContent = '找到' + q.birds.length + '只小鸟';
            buttons.forEach((button, id) => {button.disabled = false; button.setAttribute('aria-label', '第' + (currentSlots[id] + 1) + '个鸟笼');});
          } else if (!answering && closed) prompt.textContent = '看仔细';
        },
        destroy() {destroyed = true; buttons.forEach(button => {button.disabled = true;});}
      };
    }
  });
})();
