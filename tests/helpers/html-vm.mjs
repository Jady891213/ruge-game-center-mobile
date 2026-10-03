import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Run the actual packaged page offline with a small DOM and deterministic clock.
 * Canvas methods are no-ops: these tests cover game state, not pixel rendering. */
export function loadGame(game, { storage = {}, instrument = source => source } = {}) {
  const html = readFileSync(new URL(`../../app/assets/${game}/index.html`, import.meta.url), 'utf8');
  const nodes = new Map();
  const markupRoots = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  const timers = new Map();
  const frames = new Map();
  const saved = new Map(Object.entries(storage));
  let now = 0;
  let nextId = 0;
  let size = { width: 390, height: 844 };

  const gradient = () => ({ addColorStop() {} });
  const canvas = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, {
    get: (target, key) => key in target ? target[key] : () => {},
    set: (target, key, value) => { target[key] = value; return true; },
  });

  function createNode(tagName = 'DIV') {
    const attributes = new Map();
    const classes = new Set();
    const listeners = new Map();
    let className = '';
    let innerHTML = '';
    const element = {
      tagName, value: '', textContent: '', dataset: {}, children: [],
      readOnly: false, focusCount: 0, blurCount: 0, offsetWidth: 200,
      get clientWidth() { return size.width; },
      get clientHeight() { return size.height; },
      style: { setProperty(key, value) { this[key] = value; } },
      get innerHTML() { return innerHTML; },
      set innerHTML(value) { innerHTML = value; this.children.length = 0; },
      get className() { return className; },
      set className(value) {
        className = value;
        classes.clear();
        value.split(/\s+/).filter(Boolean).forEach(key => classes.add(key));
      },
      classList: {
        add: (...keys) => keys.forEach(key => classes.add(key)),
        remove: (...keys) => keys.forEach(key => classes.delete(key)),
        contains: key => classes.has(key),
        toggle(key, value = !classes.has(key)) {
          if (value) classes.add(key); else classes.delete(key);
          return value;
        },
      },
      setAttribute(key, value) { attributes.set(key, String(value)); },
      getAttribute: key => attributes.get(key) ?? null,
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      removeEventListener(type, listener) {
        listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
      },
      dispatch(type, detail = {}) {
        const event = { target: element, preventDefault() {}, stopPropagation() {}, ...detail };
        for (const listener of listeners.get(type) || []) listener(event);
      },
      appendChild(child) { this.children.push(child); return child; },
      querySelector: selector => select(element.children, selector)[0] ?? null,
      querySelectorAll: selector => select(element.children, selector),
      remove() {},
      focus() { this.focusCount++; },
      blur() { this.blurCount++; },
      closest(selector) { return selector === 'button' && tagName === 'BUTTON' ? element : null; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size }),
      getContext: () => canvas,
    };
    return element;
  }

  function descendants(roots) {
    return roots.flatMap(element => [element, ...descendants(element.children)]);
  }

  // Only the selector forms used by the packaged games are needed here.
  function matches(element, selector) {
    const excluded = /:not\(([^)]+)\)/.exec(selector);
    if (excluded && matches(element, excluded[1])) return false;
    selector = selector.replace(/:not\([^)]+\)/g, '');
    const tag = /^[a-z]+/i.exec(selector)?.[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) {
      if (!element.classList.contains(name)) return false;
    }
    for (const [, name, value] of selector.matchAll(/\[([\w-]+)="([^"]*)"\]/g)) {
      const actual = name.startsWith('data-') ? element.dataset[name.slice(5)] : element.getAttribute(name);
      if (String(actual) !== value) return false;
    }
    const id = /#([\w-]+)/.exec(selector)?.[1];
    return !id || element.getAttribute('id') === id;
  }

  function select(roots, selector) {
    let found = roots;
    for (const part of selector.trim().split(/\s+/)) {
      found = [...new Set(descendants(found))].filter(element => matches(element, part));
      if (!found.length) break;
    }
    return found;
  }

  function node(selector) {
    if (!/^#[\w-]+$/.test(selector)) return select(markupRoots, selector)[0] ?? null;
    if (!nodes.has(selector)) nodes.set(selector, createNode());
    return nodes.get(selector);
  }

  // Preserve the real static element tree as well as children created by game code.
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const stack = [];
  const voidTags = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const match of markup.matchAll(/<!--[^]*?-->|<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    if (!match[2]) continue;
    const tagName = match[2].toUpperCase();
    if (match[1]) {
      const last = stack.findLastIndex(element => element.tagName === tagName);
      if (last >= 0) stack.length = last;
      continue;
    }
    const element = createNode(tagName);
    for (const [, name, value] of match[3].matchAll(/([\w-]+)="([^"]*)"/g)) {
      element.setAttribute(name, value);
      if (name === 'class') element.className = value;
      if (name.startsWith('data-')) element.dataset[name.slice(5)] = value;
      if (name === 'id') nodes.set(`#${value}`, element);
    }
    (stack.length ? stack.at(-1).children : markupRoots).push(element);
    if (!voidTags.has(tagName) && !/\/\s*$/.test(match[3])) stack.push(element);
  }

  function addListener(map, type, listener) {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(listener);
  }

  const window = {
    innerWidth: size.width, innerHeight: size.height, devicePixelRatio: 2,
    addEventListener: (type, listener) => addListener(windowEvents, type, listener),
  };
  function removeListener(map, type, listener) {
    map.set(type, (map.get(type) || []).filter(item => item !== listener));
  }
  const document = {
    hidden: false, body: createNode('BODY'), documentElement: createNode('HTML'),
    querySelector: node, getElementById: id => node(`#${id}`),
    querySelectorAll: selector => select(markupRoots, selector),
    createElement: tag => createNode(tag.toUpperCase()),
    createElementNS: (_, tag) => createNode(tag.toUpperCase()),
    addEventListener: (type, listener) => addListener(documentEvents, type, listener),
    removeEventListener: (type, listener) => removeListener(documentEvents, type, listener),
  };
  const context = vm.createContext({
    window, document, location: { search: '', href: '', hash: '' },
    get innerWidth() { return window.innerWidth; },
    get innerHeight() { return window.innerHeight; },
    devicePixelRatio: window.devicePixelRatio,
    screen: { orientation: { angle: 0 } },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) },
    performance: { now: () => now },
    setTimeout(callback, delay = 0) {
      const id = ++nextId;
      timers.set(id, { due: now + delay, callback });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: window.addEventListener,
    console: { log() {}, error() {} },
  });

  [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].forEach((match, index) => {
    const source = instrument(match[1], index);
    new vm.Script(source, { filename: `${game}/index.html:script-${index}` }).runInContext(context);
  });

  function tick(milliseconds) {
    const end = now + milliseconds;
    let iterations = 0;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!pending) break;
      if (++iterations > 10000) throw new Error('Unexpected timer loop');
      now = pending[1].due;
      timers.delete(pending[0]);
      pending[1].callback();
    }
    now = end;
  }

  return {
    html, window, document, saved, node, tick,
    click: selector => node(selector).dispatch('click'),
    input(value) { node('#type').value = value; node('#type').dispatch('input'); },
    emitWindow(type, detail = {}) { for (const listener of windowEvents.get(type) || []) listener(detail); },
    emitDocument(type, detail = {}) { for (const listener of documentEvents.get(type) || []) listener(detail); },
    frame(milliseconds = 16) {
      tick(milliseconds);
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach(callback => callback(now));
    },
    resize(width, height) {
      size = { width, height };
      window.innerWidth = width;
      window.innerHeight = height;
      this.emitWindow('resize');
    },
    dispose() { timers.clear(); frames.clear(); windowEvents.clear(); documentEvents.clear(); nodes.clear(); },
  };
}
