(function (root) {
  'use strict';
  const colors = {pigeon:'#a9d9ce', rabbit:'#f2c2d1', cat:'#f4d17e', panda:'#c4d8ee', bear:'#d8b58f', fox:'#ecb78c'};
  const labels = {pigeon:'小鸽子', rabbit:'小兔子', cat:'小猫', panda:'熊猫', bear:'小熊', fox:'狐狸'};
  function avatar(id) {
    const color = colors[id] || colors.pigeon;
    const ears = id === 'rabbit' ? '<ellipse cx="18" cy="13" rx="5" ry="11"/><ellipse cx="34" cy="13" rx="5" ry="11"/>' : id === 'cat' || id === 'fox' ? '<path d="m9 24 2-17 14 12M43 24 41 7 27 19"/>' : '<circle cx="12" cy="16" r="7"/><circle cx="40" cy="16" r="7"/>';
    const bird = id === 'pigeon';
    return '<svg viewBox="0 0 52 52" aria-hidden="true"><g fill="' + color + '" stroke="#56695e" stroke-width="2.2" stroke-linejoin="round">' + (bird ? '<path d="M12 40V24a14 14 0 0 1 28 0v16Z"/>' : ears + '<ellipse cx="26" cy="30" rx="19" ry="17"/>') + '</g>' + (id === 'panda' ? '<ellipse cx="18" cy="28" rx="6" ry="7" fill="#56695e"/><ellipse cx="34" cy="28" rx="6" ry="7" fill="#56695e"/>' : '') + '<circle cx="19" cy="28" r="2.3" fill="' + (id === 'panda' ? '#fff' : '#40584d') + '"/><circle cx="33" cy="28" r="2.3" fill="' + (id === 'panda' ? '#fff' : '#40584d') + '"/>' + (bird ? '<path d="m22 33 4 6 4-6Z" fill="#e8aa58"/>' : '<path d="M23 35q3 4 6 0" fill="none" stroke="#56695e" stroke-width="2.3" stroke-linecap="round"/>') + '</svg>';
  }
  function mount() {
    const P = root.RugePlayers, d = root.document, entry = d.querySelector('#playerButton'), overlay = d.querySelector('#playersOverlay');
    if (!P || !entry || !overlay || entry.dataset.mounted) return null;
    entry.dataset.mounted = 'true';
    const $ = selector => overlay.querySelector(selector);
    let mode = 'list', editing = null, selectedAvatar = 'pigeon', previousFocus = null;
    const error = text => { $('#playersError').textContent = text || ''; };
    function updateEntry() {
      const p = P.current();
      d.querySelector('#playerAvatar').innerHTML = avatar(p.avatar);
      d.querySelector('#playerName').textContent = p.name;
      entry.setAttribute('aria-label', '玩家：' + p.name + '，切换玩家');
    }
    function show(next) {
      mode = next; error('');
      for (const name of ['list', 'edit', 'confirm']) $('#players' + name[0].toUpperCase() + name.slice(1)).hidden = name !== next;
      $('#playersTitle').textContent = next === 'list' ? '谁来玩？' : next === 'confirm' ? '清空进度' : editing ? '编辑玩家' : '新玩家';
    }
    function close() { overlay.hidden = true; entry.setAttribute('aria-expanded', 'false'); previousFocus?.focus?.(); }
    function reload() { close(); root.location.reload(); }
    function act(fn) {
      try { fn(); return true; } catch (e) {
        const text = /名字|已经|找不到|满啦/.test(e.message) ? e.message : '没有保存成功，请稍后再试';
        error(text); return false;
      }
    }
    function choose(id) { act(() => { if (P.current().id === id) close(); else { P.select(id); reload(); } }); }
    function list() {
      show('list'); const holder = $('#playersChoices'); holder.innerHTML = '';
      for (const p of P.list()) {
        const row = d.createElement('div'); row.className = 'player-row';
        const button = d.createElement('button'); button.type = 'button'; button.className = 'player-choice'; button.dataset.player = p.id;
        button.setAttribute('aria-pressed', String(p.active)); button.setAttribute('aria-label', p.name + (p.active ? '，正在玩' : '，切换到这个玩家'));
        const face = d.createElement('span'); face.className = 'player-face'; face.innerHTML = avatar(p.avatar);
        const name = d.createElement('span'); name.className = 'player-choice-name'; name.textContent = p.name;
        const state = d.createElement('span'); state.className = 'player-choice-state'; state.textContent = p.active ? '正在玩' : '切换';
        button.appendChild(face); button.appendChild(name); button.appendChild(state); button.addEventListener('click', () => choose(p.id));
        const edit = d.createElement('button'); edit.type = 'button'; edit.className = 'player-edit'; edit.setAttribute('aria-label', '编辑 ' + p.name);
        edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>';
        edit.addEventListener('click', () => editPlayer(p)); row.appendChild(button); row.appendChild(edit); holder.appendChild(row);
      }
    }
    function drawAvatars() {
      const holder = $('#playerAvatars'); holder.innerHTML = '';
      for (const id of P.avatars) {
        const button = d.createElement('button'); button.type = 'button'; button.className = 'player-avatar-option'; button.setAttribute('aria-label', labels[id]);
        button.setAttribute('aria-pressed', String(id === selectedAvatar)); button.innerHTML = avatar(id);
        button.addEventListener('click', () => { selectedAvatar = id; drawAvatars(); }); holder.appendChild(button);
      }
    }
    function editPlayer(p) {
      editing = p || null; selectedAvatar = p?.avatar || P.avatars[P.list().length % P.avatars.length]; show('edit');
      $('#playerNameInput').value = p?.name || ''; $('#playerReset').hidden = !p; drawAvatars();
      $('#playerNameInput').focus?.();
    }
    entry.addEventListener('click', () => { previousFocus = d.activeElement || entry; updateEntry(); list(); overlay.hidden = false; entry.setAttribute('aria-expanded', 'true'); $('#playersClose').focus?.(); });
    $('#playersClose').addEventListener('click', close);
    $('#playerAdd').addEventListener('click', () => editPlayer(null));
    $('#playerCancel').addEventListener('click', list);
    $('#playerForm').addEventListener('submit', event => {
      event.preventDefault(); act(() => {
        const name = $('#playerNameInput').value;
        if (editing) { P.rename(editing.id, name, selectedAvatar); updateEntry(); list(); }
        else { const p = P.create(name, selectedAvatar); P.select(p.id); reload(); }
      });
    });
    $('#playerReset').addEventListener('click', () => {
      show('confirm'); $('#playerResetName').textContent = '清空「' + editing.name + '」的进度？'; $('#playerKeep').focus?.();
    });
    $('#playerKeep').addEventListener('click', () => editPlayer(editing));
    $('#playerConfirmReset').addEventListener('click', () => act(() => { const active = P.current().id === editing.id; P.reset(editing.id); if (active) reload(); else list(); }));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll('button,input')].filter(node => !node.disabled && node.getClientRects?.().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && d.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && d.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    const beforeBack = root.onRugeBack;
    root.onRugeBack = function () { if (!overlay.hidden) { if (mode === 'confirm') editPlayer(editing); else if (mode === 'edit') list(); else close(); return true; } return typeof beforeBack === 'function' ? beforeBack() : false; };
    root.addEventListener('ruge:player-change', updateEntry); updateEntry();
    return Object.freeze({open:() => entry.click(), close, refresh:updateEntry});
  }
  root.RugePlayersUI = Object.freeze({mount, avatar});
})(window);
