/* Local players share the existing game keys through one active physical slot.
 * Load before every game script. Only this module exchanges slots; settings and
 * unknown keys are never part of a player's progress. */
(function (root) {
  'use strict';
  if (root.RugePlayers) return;
  const LIB = 'rugePlayersV1', JOURNAL = 'rugePlayersTransactionV1';
  const progressKeys = Object.freeze([
    'rugeCenter', 'rugeStat', 'rugeBrainSchoolV1', 'rugeEnglishKingdomV1',
    'rugeAnimalBalanceV1', 'rugeHatTrickV1', 'rugeToyMemoryV1',
    'rugePitchFlightV1', 'rugeVoiceQuestV1', 'rugePocketRadarChallengeV1',
    'rugeCameraColorV1', 'rugeForestJuiceV1', 'rugeCodebreakerV1',
    'gardenFlowV2', 'rugeMarbleMazeV1', 'rugeNumberMergeV1', 'rugeTiltStarBoxV1',
    'rugeHanziStrokesV1', 'rugePaintMixingV1', 'hzTypingSave2', 'rugeHanziReadingV1',
    'flappyDashBest', 'frogPondHi',
    // Retired saves and migration inputs must follow the player too.
    'rugePocketRadarV1', 'rugePitchAdventureV1', 'rugePitchEndlessV1',
    'rugeBearSnackShopV1', 'rollingGardenV2', 'hzPuzzleProgress1', 'dinoDashHi'
  ]);
  const keys = new Set(progressKeys), avatars = Object.freeze(['pigeon', 'rabbit', 'cat', 'panda', 'bear', 'fox']);
  const cover = /[?&]cover=1(?:&|$)/.test(root.location?.search || '');
  let storage = null, rawGet, rawSet, rawRemove, rawClear, issue = null, navigating = false;
  try {
    storage = root.localStorage;
    rawGet = storage.getItem.bind(storage); rawSet = storage.setItem.bind(storage);
    rawRemove = storage.removeItem.bind(storage); rawClear = storage.clear?.bind(storage);
  } catch (_) { issue = 'storage-unavailable'; }
  const script = root.document?.currentScript?.src;
  let homeURL = '';
  try { if (script) homeURL = new URL('../index.html', script).href; } catch (_) {}
  function isHome() {
    if (homeURL) return root.location?.pathname === new URL(homeURL).pathname;
    return !root.location?.pathname || /(?:^|\/assets\/)index\.html$/.test(root.location.pathname) || root.location.pathname === '/';
  }
  const emptyLibrary = () => ({schema:1, epoch:0, active:'default', profiles:[{id:'default', name:'小玩家', avatar:'pigeon', progress:{}}]});
  const copy = value => JSON.parse(JSON.stringify(value));
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  function validProgress(value) { return plain(value) && Object.keys(value).every(k => keys.has(k) && typeof value[k] === 'string'); }
  function validLibrary(value) {
    return plain(value) && value.schema === 1 && Number.isSafeInteger(value.epoch) && value.epoch >= 0 &&
      Array.isArray(value.profiles) && value.profiles.length > 0 && value.profiles.length <= 20 &&
      value.profiles.every(p => plain(p) && typeof p.id === 'string' && /^[a-z0-9-]{1,80}$/.test(p.id) &&
        typeof p.name === 'string' && p.name.trim() && Array.from(p.name).length <= 8 && avatars.includes(p.avatar) && validProgress(p.progress)) &&
      new Set(value.profiles.map(p => p.id)).size === value.profiles.length && value.profiles.some(p => p.id === value.active);
  }
  function decode(raw) {
    if (raw === null) return emptyLibrary();
    const value = JSON.parse(raw);
    if (!validLibrary(value)) throw Error('invalid-library');
    return value;
  }
  function library() { if (!storage) throw Error('storage-unavailable'); return decode(rawGet(LIB)); }
  function snapshot() {
    const result = {};
    for (const key of progressKeys) { const value = rawGet(key); if (value !== null) result[key] = value; }
    return result;
  }
  function writeProgress(values) {
    // Remove absent values first to release quota before restoring the next slot.
    for (const key of progressKeys) if (!Object.hasOwn(values, key) && rawGet(key) !== null) rawRemove(key);
    for (const key of progressKeys) if (Object.hasOwn(values, key) && rawGet(key) !== values[key]) rawSet(key, values[key]);
  }
  function writeLibrary(raw) { if (raw === null) rawRemove(LIB); else rawSet(LIB, raw); }
  function recover() {
    if (!storage || cover) return false;
    const raw = rawGet(JOURNAL);
    if (raw === null) return true;
    try {
      const log = JSON.parse(raw);
      if (!plain(log) || log.schema !== 1 || !(log.beforeLibrary === null || typeof log.beforeLibrary === 'string') ||
          typeof log.afterLibrary !== 'string' || !validProgress(log.beforeProgress) || !validProgress(log.afterProgress)) throw Error('invalid-journal');
      decode(log.beforeLibrary); decode(log.afterLibrary);
      // The atomic library write is the commit point. A crash before it rolls
      // back; a crash after it finishes the committed slot on the next load.
      const committed = rawGet(LIB) === log.afterLibrary;
      writeProgress(committed ? log.afterProgress : log.beforeProgress);
      writeLibrary(committed ? log.afterLibrary : log.beforeLibrary);
      rawRemove(JOURNAL); issue = null;
      return true;
    } catch (_) { issue = 'recovery-required'; return false; }
  }
  if (!issue && !cover) { try { recover(); } catch (_) { issue = 'storage-unavailable'; } }
  let initial;
  try { initial = library(); } catch (_) { initial = emptyLibrary(); issue ||= 'invalid-library'; }
  const token = value => value.active + ':' + value.epoch;
  let documentToken = token(initial);
  function fresh() {
    if (!storage || issue) return false;
    try { return rawGet(JOURNAL) === null && token(library()) === documentToken; } catch (_) { return false; }
  }
  function backToHome() {
    if (cover || navigating || fresh()) return;
    navigating = true;
    try { if (homeURL) root.location.replace(homeURL); else root.location?.reload?.(); } catch (_) {}
  }
  function storageError() {
    const error = Error('玩家进度暂时不能保存，请回到游戏中心再试。'); error.name = 'InvalidStateError'; return error;
  }
  function writable() {
    if (cover || !isHome() || !fresh()) throw storageError();
  }
  function publicProfile(profile, active) { return Object.freeze({id:profile.id, name:profile.name, avatar:profile.avatar, active:profile.id === active}); }
  function readPublic() { try { return library(); } catch (_) { return initial; } }
  function notify() {
    try { root.dispatchEvent(new CustomEvent('ruge:player-change', {detail:{player:api.current()}})); } catch (_) {}
  }
  function transaction(change) {
    writable();
    const beforeLibrary = rawGet(LIB), next = decode(beforeLibrary), beforeProgress = snapshot();
    next.profiles.find(p => p.id === next.active).progress = copy(beforeProgress);
    const exchange = change(next);
    const afterProgress = exchange ? copy(next.profiles.find(p => p.id === next.active).progress) : beforeProgress;
    if (exchange) next.epoch++;
    const afterLibrary = JSON.stringify(next);
    const log = JSON.stringify({schema:1, beforeLibrary, afterLibrary, beforeProgress, afterProgress});
    try {
      // If quota rejects this first write, the live slot and old library are intact.
      rawSet(JOURNAL, log);
      if (exchange) writeProgress(afterProgress);
      rawSet(LIB, afterLibrary);
      rawRemove(JOURNAL);
    } catch (error) {
      // Recovery also covers a failed rollback. Keep the journal and deny game
      // writes until a later load can finish it; never hide a partial exchange.
      try { if (rawGet(JOURNAL) !== null) recover(); } catch (_) { issue = 'recovery-required'; }
      if (rawGet(LIB) !== afterLibrary || rawGet(JOURNAL) !== null) throw error;
    }
    documentToken = token(next); initial = next; issue = null; notify();
    return next;
  }
  function nameFor(value, profiles, excluding) {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!name || Array.from(name).length > 8) throw Error('名字请写 1 到 8 个字');
    if (profiles.some(p => p.id !== excluding && p.name === name)) throw Error('这个名字已经有啦');
    return name;
  }
  function avatarFor(value) { return avatars.includes(value) ? value : avatars[0]; }
  function find(value, id) { const p = value.profiles.find(p => p.id === id); if (!p) throw Error('找不到这个玩家'); return p; }
  const api = Object.freeze({
    progressKeys, avatars,
    current() { const value = readPublic(); return publicProfile(find(value, value.active), value.active); },
    list() { const value = readPublic(); return value.profiles.map(p => publicProfile(p, value.active)); },
    create(name, avatar) {
      let id;
      const value = transaction(next => {
        if (next.profiles.length >= 20) throw Error('玩家已经满啦');
        do { id = 'player-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); } while (next.profiles.some(p => p.id === id));
        next.profiles.push({id, name:nameFor(name, next.profiles), avatar:avatarFor(avatar), progress:{}});
        return false;
      });
      return publicProfile(find(value, id), value.active);
    },
    select(id) {
      writable();
      if (library().active === id) return api.current();
      const value = transaction(next => { find(next, id); next.active = id; return true; });
      return publicProfile(find(value, id), value.active);
    },
    rename(id, name, avatar) {
      const value = transaction(next => { const p = find(next, id); p.name = nameFor(name, next.profiles, id); if (avatar !== undefined) p.avatar = avatarFor(avatar); return false; });
      return publicProfile(find(value, id), value.active);
    },
    // The management UI asks for confirmation including this player's name.
    reset(id) { transaction(next => { find(next, id).progress = {}; return id === next.active; }); return true; },
    state() { const value = readPublic(); return Object.freeze({active:value.active, epoch:value.epoch, persistent:!!storage && rawGet(LIB) !== null, stale:!fresh(), cover, error:issue, ready:!!storage && !issue && fresh()}); }
  });
  root.RugePlayers = api;
  // Patch methods, not the Storage object: key(), length, enumeration and
  // sessionStorage retain their native behavior. Existing game code uses these
  // methods exclusively; direct named-property assignment is not supported.
  const proto = root.Storage?.prototype;
  if (storage && proto && storage instanceof root.Storage) {
    const get = proto.getItem, set = proto.setItem, remove = proto.removeItem, clear = proto.clear;
    proto.getItem = function (key) { key = String(key); if (this === storage && keys.has(key) && (!fresh() || cover)) return null; return get.call(this, key); };
    proto.setItem = function (key, value) {
      key = String(key);
      if (this === storage && (key === LIB || key === JOURNAL || keys.has(key) && (cover || !fresh()))) throw storageError();
      return set.call(this, key, value);
    };
    proto.removeItem = function (key) {
      key = String(key);
      if (this === storage && (key === LIB || key === JOURNAL || keys.has(key) && (cover || !fresh()))) throw storageError();
      return remove.call(this, key);
    };
    proto.clear = function () {
      if (this !== storage) return clear.call(this);
      if (cover || !fresh()) throw storageError();
      // A game's clear must never erase other players or shared preferences.
      for (const key of progressKeys) rawRemove(key);
    };
  }
  root.addEventListener?.('pageshow', backToHome);
  root.addEventListener?.('ruge:resume', backToHome);
  root.addEventListener?.('storage', event => { if (event.key === LIB || event.key === JOURNAL || event.key === null) backToHome(); });
})(window);
