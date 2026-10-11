(function () {
  'use strict';
  const C = window.RugeCodebreaker, KEY = 'rugeCodebreakerV1';
  const $ = id => document.getElementById(id);
  const clearButton = $('clear');
  const copy = value => JSON.parse(JSON.stringify(value));
  const cover = location.search.includes('cover=1');
  const DIGITS = '0123456789';
  const tiers = ['2位', '3位', '4位'];
  let store = { version: 1, levels: {}, free: {}, active: null }, run = null;
  let view = 'home', tier = 0, paused = false, modalType = '', notice = '', noticeType = '';
  let returnFocus = null, tutorialStep = 0, pickerLength = 2, pickerChallenge = false;
  let storageWarning = false, historyCount = -1, noticeTimer = null;

  function save() {
    if (cover) return;
    store.active = run ? copy(run) : null;
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (_) { storageWarning = true; }
  }
  function seeds(active = run) {
    if (!active || active.kind !== 'level') return [];
    return C.LEVELS[active.levelId].clues.map(guess => ({ guess, ...C.score(active.secret, guess), seed: true }));
  }
  function rows(active = run) {
    return [...seeds(active), ...active.guesses.map((guess, index) => ({ guess, ...C.score(active.secret, guess), index: index + 1 }))];
  }
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!data || data.version !== 1) return;
      for (const level of C.LEVELS) {
        const record = data.levels && data.levels[level.id];
        if (record && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3 && Number.isInteger(record.best) && record.best >= 1 && record.best <= 5000)
          store.levels[level.id] = { stars: record.stars, best: record.best };
      }
      for (const n of [2, 3, 4]) for (const mode of ['practice', 'challenge']) {
        const k = n + '-' + mode, value = data.free && data.free[k];
        if (value && Number.isInteger(value.wins) && value.wins >= 0 && Number.isInteger(value.best) && value.best > 0)
          store.free[k] = { wins: value.wins, best: value.best };
      }
      const active = data.active;
      if (!active || !['level', 'free'].includes(active.kind)) return;
      let expected;
      if (active.kind === 'level') {
        const level = C.LEVELS[active.levelId];
        if (!level || !unlocked(level.id)) return;
        expected = { length: level.length, pool: level.pool, secret: level.secret, limit: 0, challenge: false };
      } else {
        if (!C.valid(active.secret, active.length, DIGITS) || typeof active.challenge !== 'boolean') return;
        expected = { length: active.length, pool: DIGITS, secret: active.secret, challenge: active.challenge, limit: active.challenge ? active.length * 2 + 2 : 0 };
      }
      if (!Array.isArray(active.guesses) || active.guesses.length > 5000 || new Set(active.guesses).size !== active.guesses.length) return;
      if (active.guesses.some(g => !C.valid(g, expected.length, expected.pool))) return;
      const starter = active.kind === 'level' ? C.LEVELS[active.levelId].clues : [];
      if (active.guesses.some(g => starter.includes(g))) return;
      const success = active.guesses.indexOf(expected.secret);
      if (success >= 0 && success !== active.guesses.length - 1) return;
      if (expected.limit && active.guesses.length > expected.limit) return;
      const won = success >= 0, ended = won || Boolean(expected.limit && active.guesses.length >= expected.limit);
      const draft = Array.isArray(active.draft) && active.draft.length === expected.length ? active.draft : Array(expected.length).fill('');
      const used = new Set();
      const safeDraft = draft.map(digit => {
        if (typeof digit !== 'string' || !/^[0-9]$/.test(digit) || !expected.pool.includes(digit) || used.has(digit)) return '';
        used.add(digit); return digit;
      });
      run = { kind: active.kind, levelId: active.kind === 'level' ? active.levelId : null, ...expected,
        guesses: active.guesses, draft: safeDraft, cursor: Number.isInteger(active.cursor) && active.cursor >= 0 && active.cursor < expected.length ? active.cursor : 0,
        hints: Number.isInteger(active.hints) && active.hints >= 0 ? Math.min(active.hints, 5000) : 0, won, ended };
      if (run.kind === 'level') tier = Math.floor(run.levelId / 6);
    } catch (_) { /* A malformed save cannot prevent the other games from opening. */ }
  }
  function unlocked(id) { return id === 0 || Boolean(store.levels[id - 1]); }
  function completed() { return Object.keys(store.levels).length; }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(parent, text, className, action) {
    const node = element('button', className, text);
    node.type = 'button'; node.addEventListener('click', action); parent.appendChild(node); return node;
  }
  function icon(kind, className = 'feedback-icon') {
    const paths = {
      good: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>',
      almost: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      clear: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/>',
      erase: '<path d="m9 5-7 7 7 7h12V5Z M12 9l5 6m0-6-5 6"/>',
      star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>'
    };
    const node = element('span', className);
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kind] + '</svg>';
    return node;
  }
  function feedback(counts) {
    const badges = element('div', 'result-badges');
    for (const [key, kind, label] of [['bulls', 'good', '数字和位置都对'], ['cows', 'almost', '数字对，换个位置']]) {
      const badge = element('span', 'result-badge ' + kind);
      badge.appendChild(icon(kind)); badge.appendChild(element('b', 'feedback-count', String(counts[key])));
      badge.setAttribute('aria-label', counts[key] + ' 个' + label); badges.appendChild(badge);
    }
    return badges;
  }
  function setNotice(text, type = '') {
    notice = text; noticeType = type;
    clearTimeout(noticeTimer);
    $('notice').textContent = text; $('notice').className = 'notice ' + type; $('notice').hidden = !text;
    if (text) noticeTimer = setTimeout(() => { notice = ''; noticeType = ''; $('notice').textContent = ''; $('notice').hidden = true; }, 1800);
  }
  function showHome() { view = 'home'; closeDialog(); renderHome(); renderView(); save(); }
  function renderView() { $('home').hidden = view !== 'home'; $('play').hidden = view !== 'play'; }
  function renderHome() {
    $('progressCount').textContent = completed() + ' / 18';
    $('tiers').innerHTML = '';
    tiers.forEach((title, index) => {
      const node = button($('tiers'), title, '', () => { tier = index; renderHome(); });
      node.setAttribute('aria-selected', String(tier === index)); node.setAttribute('role', 'tab');
      node.setAttribute('aria-label', title + '密码关卡'); node.dataset.tier = index;
    });
    $('tiers').setAttribute('role', 'tablist');
    $('chapterTitle').textContent = ''; $('chapterNote').textContent = '';
    $('levels').innerHTML = '';
    const next = C.LEVELS.find(l => !store.levels[l.id]);
    C.LEVELS.slice(tier * 6, tier * 6 + 6).forEach(level => {
      const available = unlocked(level.id), record = store.levels[level.id];
      const node = button($('levels'), '', 'level-button' + (!available ? ' locked' : '') + (next && next.id === level.id ? ' current' : ''), () => requestLevel(level.id));
      node.dataset.level = level.id;
      node.setAttribute('aria-label', '第' + (level.id + 1) + '关' + (available ? record ? '，已完成' : '，开始' : '，待解锁'));
      node.appendChild(element('span', 'level-num', String(level.id + 1)));
      if (available) node.appendChild(element('span', 'stars', record ? '★'.repeat(record.stars) + '☆'.repeat(3 - record.stars) : '☆☆☆'));
      else node.appendChild(icon('lock', 'level-lock'));
    });
    $('continue').hidden = !run || run.ended;
    $('continueLabel').textContent = '';
  }
  function startLevel(id) {
    const level = C.LEVELS[id];
    if (!level || !unlocked(id)) return false;
    run = { kind: 'level', levelId: id, length: level.length, pool: level.pool, secret: level.secret,
      guesses: [], draft: Array(level.length).fill(''), cursor: 0, hints: 0, limit: 0, challenge: false, won: false, ended: false };
    paused = false; view = 'play'; tier = Math.floor(id / 6); notice = ''; noticeType = '';
    closeDialog(); renderPlay(); renderView(); save(); return true;
  }
  function startFree(length = 2, challenge = false) {
    if (![2, 3, 4].includes(length) || typeof challenge !== 'boolean') return false;
    run = { kind: 'free', levelId: null, length, pool: DIGITS, secret: C.randomCode(length, DIGITS),
      guesses: [], draft: Array(length).fill(''), cursor: 0, hints: 0, limit: challenge ? length * 2 + 2 : 0, challenge, won: false, ended: false };
    paused = false; view = 'play'; notice = ''; noticeType = '';
    closeDialog(); renderPlay(); renderView(); save(); return true;
  }
  function requestLevel(id) {
    if (!unlocked(id)) {
      openDialog('locked', '还没打开');
      $('dialogBody').appendChild(icon('lock', 'dialog-lock'));
      dialogButton('知道了', closeDialog, true); return;
    }
    if (run && !run.ended && run.kind === 'level' && run.levelId === id) return continueRun();
    requestNew(() => startLevel(id));
  }
  function requestNew(action) {
    if (!run || run.ended) return action();
    openDialog('replace', '换一局？');
    dialogButton('继续原来的', () => { closeDialog(); continueRun(); });
    dialogButton('开始新一局', action, true);
  }
  function continueRun() { if (!run || run.ended) return; paused = false; view = 'play'; closeDialog(); renderPlay(); renderView(); }
  function renderPlay() {
    if (!run) return;
    $('gameTag').textContent = run.kind === 'level' ? tiers[run.length - 2] : '自由' + (run.challenge ? '挑战' : '练习');
    $('levelNumber').textContent = run.kind === 'level' ? '第' + (run.levelId + 1) + '关' : run.length + '位';
    $('levelTitle').textContent = run.kind === 'level' ? C.LEVELS[run.levelId].title : run.challenge ? '挑战这只密码箱' : '慢慢发现密码';
    $('attempts').textContent = run.limit ? run.guesses.length + ' / ' + run.limit : String(run.guesses.length);
    $('attemptCaption').textContent = run.limit ? '次尝试' : '次尝试 · 不限';
    $('digitCount').textContent = run.length + ' 位 · 不重复';
    $('pauseBar').hidden = !paused || run.ended;
    $('slots').innerHTML = '';
    run.draft.forEach((digit, index) => {
      const node = button($('slots'), digit || '·', 'slot' + (!digit ? ' empty' : '') + (index === run.cursor && !run.ended ? ' selected' : ''), () => selectSlot(index));
      node.dataset.slot = index; node.disabled = paused || run.ended;
      node.setAttribute('aria-label', '第 ' + (index + 1) + ' 位，' + (digit || '空白'));
      node.setAttribute('aria-pressed', String(index === run.cursor));
    });
    $('entryHelp').textContent = '';
    const priorScroll = $('history').scrollTop || 0;
    $('history').innerHTML = '';
    const entries = rows();
    if (!entries.length) $('history').appendChild(element('p', 'history-empty', '•••'));
    entries.forEach(row => {
      const line = element('div', 'history-row' + (row.bulls === run.length ? ' won' : ''));
      const label = element('span', 'row-label' + (row.seed ? ' seed' : ''), row.seed ? '' : String(row.index));
      if (row.seed) { label.appendChild(icon('star', 'seed-icon')); label.setAttribute('aria-label', '起始线索'); }
      line.appendChild(label);
      const guess = element('div', 'guess-digits');
      Array.from(row.guess).forEach(digit => guess.appendChild(element('span', '', digit)));
      line.appendChild(guess);
      line.appendChild(feedback(row)); $('history').appendChild(line);
    });
    $('history').scrollTop = entries.length !== historyCount ? $('history').scrollHeight : priorScroll;
    historyCount = entries.length;
    $('keypad').innerHTML = '';
    function digitKey(digit) {
      const node = button($('keypad'), digit, 'key', () => pressDigit(digit)); node.dataset.digit = digit;
      node.disabled = paused || run.ended || !run.pool.includes(digit) || run.draft.some((d, i) => i !== run.cursor && d === digit);
      node.setAttribute('aria-label', '数字 ' + digit);
    }
    for (const digit of '123456789') digitKey(digit);
    clearButton.textContent = ''; clearButton.className = 'key clear-key';
    clearButton.appendChild(icon('clear', 'key-icon')); clearButton.setAttribute('aria-label', '清空数字');
    clearButton.disabled = paused || run.ended || !run.draft.some(Boolean);
    $('keypad').appendChild(clearButton);
    digitKey('0');
    const eraseButton = button($('keypad'), '', 'key delete-key', erase);
    eraseButton.appendChild(icon('erase', 'key-icon'));
    eraseButton.setAttribute('aria-label', '删除一位'); eraseButton.disabled = paused || run.ended;
    $('submit').disabled = paused || (!run.ended && run.draft.some(d => !d));
    $('submit').textContent = run.ended ? '再看看' : '打开';
    $('hint').disabled = paused || run.ended;
    $('poolLabel').textContent = '本关数字 ' + Array.from(run.pool).join(' ');
    setNotice(storageWarning ? '没存上' : notice, noticeType);
  }
  function playable() { return run && view === 'play' && !paused && !run.ended && !modalType; }
  function selectSlot(index) {
    if (!playable() || !Number.isInteger(index) || index < 0 || index >= run.length) return false;
    run.cursor = index; renderPlay(); save(); return true;
  }
  function pressDigit(digit) {
    if (!playable() || typeof digit !== 'string' || !/^[0-9]$/.test(digit) || !run.pool.includes(digit)) return false;
    if (run.draft.some((d, i) => i !== run.cursor && d === digit)) { setNotice('重复啦', 'error'); return false; }
    run.draft[run.cursor] = digit;
    const next = run.draft.findIndex((d, i) => i > run.cursor && !d);
    const empty = run.draft.indexOf('');
    if (next >= 0) run.cursor = next; else if (empty >= 0) run.cursor = empty;
    notice = ''; noticeType = ''; renderPlay(); save(); return true;
  }
  function erase() {
    if (!playable()) return false;
    if (!run.draft[run.cursor] && run.cursor > 0) run.cursor--;
    run.draft[run.cursor] = ''; notice = ''; noticeType = ''; renderPlay(); save(); return true;
  }
  function clear() {
    if (!playable()) return false;
    run.draft.fill(''); run.cursor = 0; notice = ''; noticeType = ''; renderPlay(); save(); return true;
  }
  function submit() {
    if (!playable()) return false;
    const guess = run.draft.join('');
    if (!C.valid(guess, run.length, run.pool)) { setNotice('还没填满', 'error'); return false; }
    if (rows().some(row => row.guess === guess)) { setNotice('猜过啦', 'error'); return false; }
    run.guesses.push(guess);
    const result = C.score(run.secret, guess);
    run.won = result.bulls === run.length;
    run.ended = run.won || Boolean(run.limit && run.guesses.length >= run.limit);
    notice = ''; noticeType = '';
    if (run.won) recordWin();
    if (!run.ended) { run.draft.fill(''); run.cursor = 0; }
    renderPlay(); save();
    if (run.ended) showResult();
    return { ...result, won: run.won, ended: run.ended };
  }
  function starsFor(active) {
    const par = C.LEVELS[active.levelId].par;
    const stars = active.guesses.length <= par ? 3 : active.guesses.length <= par + 2 ? 2 : 1;
    return active.hints ? Math.min(stars, 2) : stars;
  }
  function recordWin() {
    if (run.kind === 'level') {
      const prior = store.levels[run.levelId];
      store.levels[run.levelId] = { best: prior ? Math.min(prior.best, run.guesses.length) : run.guesses.length,
        stars: Math.max(prior ? prior.stars : 0, starsFor(run)) };
    } else {
      const k = run.length + '-' + (run.challenge ? 'challenge' : 'practice'), prior = store.free[k];
      store.free[k] = { wins: (prior ? prior.wins : 0) + 1, best: prior ? Math.min(prior.best, run.guesses.length) : run.guesses.length };
    }
  }
  function hint() {
    if (!playable()) return false;
    const advice = C.hint(run.length, run.pool, rows());
    run.hints++; notice = ''; noticeType = 'hint'; renderPlay(); save(); return advice;
  }
  function openDialog(type, title, eyebrow = '', text = '') {
    closeDialog(); modalType = type; returnFocus = document.activeElement;
    $('dialogTitle').textContent = title; $('dialogEyebrow').textContent = eyebrow;
    $('dialogBody').innerHTML = ''; $('dialogActions').innerHTML = '';
    if (text) $('dialogBody').appendChild(element('p', '', text));
    $('modal').hidden = false; $('dialog').focus();
  }
  function closeDialog() {
    $('modal').hidden = true; modalType = '';
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    returnFocus = null;
  }
  function dialogButton(text, action, primary = false) { return button($('dialogActions'), text, primary ? 'primary' : '', action); }
  function showRules() {
    openDialog('rules', '小线索');
    for (const [kind, title] of [['good', '位置也对'], ['almost', '换个位置']]) {
      const row = element('div', 'rule-row');
      row.appendChild(icon(kind)); row.appendChild(element('strong', '', title)); $('dialogBody').appendChild(row);
    }
    dialogButton('看一个例子', () => { tutorialStep = 0; showTutorial(); }); dialogButton('明白了', closeDialog, true);
  }
  function showTutorial() {
    openDialog('tutorial', '示例', (tutorialStep + 1) + ' / 3');
    const secret = element('div', 'example-safe');
    Array.from('24').forEach(d => secret.appendChild(element('span', '', d))); $('dialogBody').appendChild(secret);
    const guess = ['21', '42', '24'][tutorialStep], counts = C.score('24', guess);
    const row = element('div', 'example-step'); row.appendChild(element('strong', '', guess));
    row.appendChild(feedback(counts)); $('dialogBody').appendChild(row);
    dialogButton(tutorialStep ? '上一个' : '返回', () => { if (tutorialStep) { tutorialStep--; showTutorial(); } else closeDialog(); });
    dialogButton(tutorialStep < 2 ? '下一个 →' : '我来试试', () => { if (tutorialStep < 2) { tutorialStep++; showTutorial(); } else { closeDialog(); if (view === 'home') requestLevel(0); } }, true);
  }
  function showResult() {
    if (!run || !run.ended) return;
    openDialog('result', run.won ? '打开啦！' : '再试试');
    if (run.won) $('dialogBody').appendChild(icon('good', 'result-icon good'));
    $('dialogBody').appendChild(element('div', 'result-secret', run.secret));
    if (run.kind === 'level' && run.won) $('dialogBody').appendChild(element('div', 'big-stars', '★'.repeat(starsFor(run)) + '☆'.repeat(3 - starsFor(run))));
    if (run.kind === 'level') {
      dialogButton('回到关卡', showHome);
      if (run.levelId < C.LEVELS.length - 1) dialogButton('下一关 →', () => startLevel(run.levelId + 1), true);
      else dialogButton('自由挑战 →', openFreePicker, true);
    } else {
      const last = { length: run.length, challenge: run.challenge };
      dialogButton('选择难度', openFreePicker); dialogButton('再来一局 →', () => startFree(last.length, last.challenge), true);
    }
  }
  function openFreePicker() {
    openDialog('picker', '选一个');
    const lengths = element('div', 'picker-group picker-lengths'); $('dialogBody').appendChild(lengths);
    for (const n of [2, 3, 4]) {
      const node = button(lengths, n + '位', '', () => { pickerLength = n; openFreePicker(); });
      node.setAttribute('aria-pressed', String(n === pickerLength)); node.dataset.length = n;
    }
    const modes = element('div', 'picker-group'); $('dialogBody').appendChild(modes);
    for (const challenge of [false, true]) {
      const node = button(modes, challenge ? '挑战' : '不限', '', () => { pickerChallenge = challenge; openFreePicker(); });
      node.setAttribute('aria-pressed', String(challenge === pickerChallenge)); node.dataset.challenge = String(challenge);
    }
    dialogButton('返回', closeDialog); dialogButton('开始 →', () => { closeDialog(); requestNew(() => startFree(pickerLength, pickerChallenge)); }, true);
  }
  function pause() { if (run && !run.ended) { paused = true; save(); if (view === 'play') renderPlay(); } }
  function resume() { if (!run || run.ended) return false; paused = false; renderPlay(); return true; }
  $('center').addEventListener('click', () => { save(); try { if (window.RugeNav) { window.RugeNav.home(); return; } } catch (_) {} location.href = '../index.html'; });
  $('back').addEventListener('click', showHome);
  $('rules').addEventListener('click', showRules); $('playRules').addEventListener('click', showRules);
  $('tutorial').addEventListener('click', () => { tutorialStep = 0; showTutorial(); });
  $('free').addEventListener('click', openFreePicker); $('continue').addEventListener('click', continueRun);
  $('hint').addEventListener('click', hint); clearButton.addEventListener('click', clear); $('submit').addEventListener('click', () => { if (run && run.ended) showResult(); else submit(); });
  $('resume').addEventListener('click', resume); $('dialogClose').addEventListener('click', closeDialog);
  document.addEventListener('keydown', event => {
    if (modalType) {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key === 'Tab') {
        const focusable = Array.from($('dialog').querySelectorAll('button:not([disabled])'));
        const current = focusable.indexOf(document.activeElement);
        if (focusable.length) { event.preventDefault(); focusable[(current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus(); }
      }
      return;
    }
    if (!playable()) return;
    if (/^[0-9]$/.test(event.key)) { event.preventDefault(); pressDigit(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); erase(); }
    else if (event.key === 'Delete') { event.preventDefault(); clear(); }
    else if (event.key === 'Enter') { event.preventDefault(); submit(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('ruge:pause', pause);
  window.addEventListener('ruge:resume', () => { if (view === 'play') renderPlay(); });
  window.addEventListener('ruge:orientation', () => { if (view === 'play') renderPlay(); });
  window.addEventListener('pagehide', save);
  restore(); renderHome(); renderView();
  try { window.RugeScreen && window.RugeScreen.set('portrait'); } catch (_) {}
  if (cover) {
    document.body.classList.add('cover-mode');
    startLevel(0); pressDigit('1'); pressDigit('2'); submit(); pressDigit('4'); pressDigit('2');
    notice = ''; renderPlay();
  }
  window.__game = { ...C, KEY, state: () => copy({ view, paused, run, progress: store.levels, free: store.free, modal: modalType, notice }),
    startLevel, startFree, pressDigit, selectSlot, erase, clear, submit, hint, showHome, resume, unlocked, showRules, continueRun };
})();
