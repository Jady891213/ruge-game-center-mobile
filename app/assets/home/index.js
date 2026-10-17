(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const games = [
    {id:'animal-balance',cat:'puzzle',name:'水果天平'},
    {id:'hat-trick',cat:'puzzle',name:'帽子小捣蛋'},
    {id:'pitch-adventure',cat:'react',name:'怪兽变声冒险'},
    {id:'voice-quest',cat:'react',name:'口令小冒险'},
    {id:'pocket-radar',cat:'tilt',name:'口袋探宝'},
    {id:'camera-color',cat:'puzzle',name:'颜色小侦探'},
    {id:'forest-juice',cat:'puzzle',name:'森林果汁屋'},
    {id:'code-breaker',cat:'puzzle',name:'小小密码箱'},
    {id:'pipe-flow',cat:'puzzle',name:'接水管'},
    {id:'gravity-maze',cat:'tilt',name:'钢珠迷宫'},
    {id:'number-merge',cat:'tilt',name:'数字碰碰'},
    {id:'tilt-star-box',cat:'tilt',name:'翻转星星盒'},
    {id:'hanzi-puzzle',cat:'learn',name:'字里找字'},
    {id:'paint-mixing',cat:'puzzle',name:'小小调色师'},
    {id:'hanzi-typing',cat:'learn',name:'看字打拼音'},
    {id:'flappy-bird',cat:'react',name:'扑翼小鸟'},
    {id:'frog-pond',cat:'react',name:'小青蛙跳池塘'},
  ];
  const labels = {all:'全部',recent:'最近',learn:'认字',puzzle:'益智',tilt:'重力',react:'反应'};
  let category = 'all';
  function history() {
    try {
      const raw = JSON.parse(localStorage.getItem('rugeCenter') || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch (_) { return {}; }
  }
  function remember(id) {
    const records = history(), previous = records[id];
    const valid = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    const plays = Number.isFinite(valid.plays) && valid.plays >= 0 ? valid.plays : 0;
    records[id] = {...valid, last:Date.now(), plays:plays + 1};
    try { localStorage.setItem('rugeCenter', JSON.stringify(records)); } catch (_) {}
  }
  function makeCard(game) {
    const link = document.createElement('a');
    link.className = 'card'; link.href = game.id + '/index.html'; link.dataset.id = game.id;
    const image = document.createElement('img');
    image.className = 'cover'; image.src = 'shared/' + game.id + '.png'; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    const meta = document.createElement('div'), title = document.createElement('h2');
    meta.className = 'meta'; title.textContent = game.name; meta.appendChild(title);
    link.appendChild(image); link.appendChild(meta);
    link.addEventListener('click', () => remember(game.id));
    return link;
  }
  function render(next, resetScroll = true) {
    category = Object.hasOwn(labels, next) ? next : 'all';
    const records = history();
    const last = game => records[game.id]?.last;
    const list = category === 'recent'
      ? games.filter(game => Number.isFinite(last(game)) && last(game) > 0).sort((a, b) => last(b) - last(a))
      : games.filter(game => category === 'all' || game.cat === category);
    const cards = $('#cards'), scroll = $('#gameScroll'), top = scroll.scrollTop;
    cards.innerHTML = ''; list.forEach(game => cards.appendChild(makeCard(game)));
    cards.hidden = list.length === 0; $('#empty').hidden = list.length !== 0;
    scroll.setAttribute('aria-label', labels[category] + '游戏');
    document.querySelectorAll('[data-cat]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cat === category)));
    scroll.scrollTop = resetScroll ? 0 : top;
  }
  document.querySelectorAll('[data-cat]').forEach(button => button.addEventListener('click', () => {
    render(button.dataset.cat); window.RugeFX?.emit('tap');
  }));
  const icons = {
    sound:'<path d="M4 9v6h4l5 4V5L8 9zM17 8a7 7 0 0 1 0 8M20 5a11 11 0 0 1 0 14"/>',
    vibration:'<rect x="7" y="4" width="10" height="16" rx="3"/><path d="M3 7v10M21 7v10M1 10v4M23 10v4"/>',
    awake:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  };
  function showToggle(button, kind, label, on) {
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[kind] + (on ? '' : '<path class="off-mark" d="m3 3 18 18"/>') + '</svg>';
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', label + (on ? '开启' : '关闭'));
    button.setAttribute('title', label + (on ? '开启' : '关闭'));
  }
  function refreshFeedback() {
    showToggle($('#soundToggle'), 'sound', '音效', window.RugeFX.enabled('sound'));
    showToggle($('#vibrationToggle'), 'vibration', '震动', window.RugeFX.enabled('vibration'));
  }
  $('#soundToggle').addEventListener('click', () => {
    const on = window.RugeFX.setSound(!window.RugeFX.enabled('sound')); refreshFeedback();
    if (on) window.RugeFX.emit('select');
  });
  $('#vibrationToggle').addEventListener('click', () => {
    const on = window.RugeFX.setVibration(!window.RugeFX.enabled('vibration')); refreshFeedback();
    if (on) window.RugeFX.emit('select');
  });
  let awake = true;
  try { awake = window.RugeScreen ? window.RugeScreen.keepAwakeEnabled() : localStorage.getItem('rugeAwake') !== 'false'; } catch (_) {}
  const showAwake = () => showToggle($('#awake'), 'awake', '屏幕常亮', awake);
  $('#awake').addEventListener('click', () => {
    awake = !awake;
    try { window.RugeScreen?.keepAwake(awake); localStorage.setItem('rugeAwake', String(awake)); } catch (_) {}
    showAwake(); window.RugeFX?.emit('tap');
  });
  window.addEventListener('ruge:feedback-change', refreshFeedback);
  window.addEventListener('ruge:resume', () => { render(category, false); refreshFeedback(); });
  window.addEventListener('pageshow', () => { render(category, false); refreshFeedback(); });
  showAwake(); refreshFeedback(); render('all');
  try { window.RugeScreen?.set('portrait'); } catch (_) {}
})();
