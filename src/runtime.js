// uichanges browser SDK. No dependencies, no network calls except loading the
// manifest, nothing outside the page. Everything is drawn inside one Shadow DOM.
//
//   import { uichanges } from 'uichanges/runtime';
//   uichanges.start({ manifest: '/uichanges.json' });
//
// or, without a bundler (Blazor, server templates):
//   <script src="/uichanges.js" data-manifest="/uichanges.json" defer></script>

const LABELS = {
  en: { next: 'Next', back: 'Back', done: 'Got it', close: 'Close', was: 'It used to be here', of: 'of', open: 'What’s new here' },
  ru: { next: 'Далее', back: 'Назад', done: 'Понятно', close: 'Закрыть', was: 'Было здесь', of: 'из', open: 'Что здесь нового' },
};

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--uic-text, #1f2330); }
.beacon { position: fixed; width: 14px; height: 14px; margin: -7px 0 0 -7px; padding: 0; border-radius: 50%;
  background: var(--uic-accent, #4f46e5); border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.2);
  pointer-events: auto; cursor: pointer; }
.beacon::after { content: ""; position: absolute; inset: -2px; border-radius: 50%;
  border: 2px solid var(--uic-accent, #4f46e5); animation: uic-pulse 1.6s ease-out infinite; }
@keyframes uic-pulse { from { transform: scale(1); opacity: .8; } to { transform: scale(2.6); opacity: 0; } }
.beacon:focus-visible { outline: 2px solid var(--uic-accent, #4f46e5); outline-offset: 3px; }
.ring { position: fixed; border: 2px solid var(--uic-accent, #4f46e5); border-radius: 8px; }
.ghost { position: fixed; border: 2px dashed #9aa0b4; border-radius: 8px; background: rgba(154,160,180,.10); }
.ghost span { position: absolute; left: 0; bottom: 100%; margin-bottom: 4px; font-size: 12px; color: #5b6070;
  background: #fff; padding: 1px 6px; border-radius: 4px; white-space: nowrap; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
svg.arrow { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; }
.card { position: fixed; width: 320px; max-width: calc(100vw - 24px); box-sizing: border-box; padding: 16px 16px 12px;
  background: var(--uic-bg, #fff); border-radius: 12px; pointer-events: auto;
  box-shadow: 0 12px 32px rgba(15,20,40,.18), 0 0 0 1px rgba(15,20,40,.08); }
.card:focus { outline: none; }
.card h2 { font-size: 16px; line-height: 1.35; font-weight: 600; margin: 0 28px 8px 0; }
.body p, .body ul, .body ol, .body figure { margin: 0 0 8px; }
.body ul, .body ol { padding-left: 20px; }
.body h3, .body h4 { font-size: 14px; margin: 0 0 6px; }
.body img { display: block; max-width: 100%; border-radius: 8px; }
.body a { color: var(--uic-accent, #4f46e5); }
.body code { font: 12px ui-monospace, Consolas, monospace; background: rgba(0,0,0,.06); padding: 1px 4px; border-radius: 4px; }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.count { color: #6b7080; font-size: 12px; margin-right: auto; }
.btn { font: inherit; border-radius: 8px; padding: 6px 12px; border: 1px solid #d7d9e0; background: #fff; color: inherit; cursor: pointer; }
.btn.primary { background: var(--uic-accent, #4f46e5); border-color: transparent; color: #fff; }
.btn:focus-visible, .x:focus-visible { outline: 2px solid var(--uic-accent, #4f46e5); outline-offset: 2px; }
.x { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; border-radius: 6px;
  background: none; color: #6b7080; font-size: 18px; line-height: 1; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .beacon::after { animation: none; } }
`;

const ROLE_SELECTORS = {
  button: 'button,summary,[role=button],input[type=button],input[type=submit],input[type=reset],input[type=image]',
  link: 'a[href],[role=link]',
  heading: 'h1,h2,h3,h4,h5,h6,[role=heading]',
  textbox: 'input:not([type]),input[type=text],input[type=email],input[type=password],input[type=tel],input[type=url],input[type=number],textarea,[role=textbox]',
  searchbox: 'input[type=search],[role=searchbox]',
  checkbox: 'input[type=checkbox],[role=checkbox]',
  radio: 'input[type=radio],[role=radio]',
  combobox: 'select:not([multiple]),[role=combobox]',
  listbox: 'select[multiple],[role=listbox]',
  slider: 'input[type=range],[role=slider]',
};

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

function visibleText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.nodeValue;
    else if (child.nodeType === 1) {
      if (child.getAttribute('aria-hidden') === 'true') continue;
      if (getComputedStyle(child).display === 'none') continue;
      out += ` ${visibleText(child)} `;
    }
  }
  return out;
}

/** Same rules as the snapshot capture, so a name recorded there finds the element here. */
function accessibleName(el) {
  const ids = clean(el.getAttribute('aria-labelledby'));
  if (ids) {
    const t = clean(ids.split(' ').map((id) => document.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(' '));
    if (t) return t;
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['button', 'submit', 'reset'].includes(type) && el.value) return clean(el.value);
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && clean(label.textContent)) return clean(label.textContent);
    }
    const wrap = el.closest('label');
    if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
    const ph = clean(el.getAttribute('placeholder'));
    if (ph) return ph;
  }
  const text = clean(visibleText(el));
  if (text) return text;
  const img = el.querySelector('img[alt]');
  if (img && clean(img.getAttribute('alt'))) return clean(img.getAttribute('alt'));
  return clean(el.getAttribute('title'));
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.visibility !== 'collapse';
}

/** Tries each locator in order; a locator counts only if it finds exactly one visible element. */
export function resolveLocators(locators) {
  for (const loc of locators || []) {
    let found = [];
    const m = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]$/.exec(loc);
    try {
      if (m) {
        const name = clean(m[2].replace(/\\"/g, '"')).toLowerCase();
        const sel = ROLE_SELECTORS[m[1]] || `[role="${m[1]}"]`;
        found = [...document.querySelectorAll(sel)].filter((el) => accessibleName(el).toLowerCase() === name);
      } else {
        found = [...document.querySelectorAll(loc)];
      }
    } catch {
      continue; // an invalid selector must never break the page
    }
    found = found.filter(isVisible);
    if (found.length === 1) return found[0];
  }
  return null;
}

const FORM_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

/**
 * The part of an element a person sees as "it". A link stretched to the full
 * width of a flex column is visually just its text, so hints hug the text.
 */
function visualRect(el) {
  const r = el.getBoundingClientRect();
  if (FORM_TAGS.has(el.tagName)) return r;
  // A link styled as a button (its own background or border) is visually
  // the whole box, not just its text.
  const st = getComputedStyle(el);
  const hasBox = (st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent')
    || ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(st[`border${side}Width`]) > 0 && st[`border${side}Style`] !== 'none');
  if (hasBox) return r;
  const range = document.createRange();
  range.selectNodeContents(el);
  const t = range.getBoundingClientRect();
  if (t.width > 0 && t.height > 0 && t.width < r.width - 16) {
    return { left: t.left - 2, right: t.right + 2, top: r.top, bottom: r.bottom, width: t.width + 4, height: r.height };
  }
  return r;
}

const normPath = (p) => (p && p.length > 1 ? p.replace(/\/+$/, '') : p || '/');

const memoryStore = new Map();
const defaultStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { memoryStore.set(key, value); } },
  remove(key) { try { localStorage.removeItem(key); } catch { memoryStore.delete(key); } },
};

// Review mode: the developer opens the site with the link printed by
// `uichanges review`. The SDK then shows no hints and loads the review panel
// from the local review server instead. The mode lasts for the browser tab.
const REVIEW_KEY = 'uichanges:review';

function reviewSession() {
  let params;
  try { params = new URLSearchParams(location.search); } catch { return null; }
  const mode = params.get('uichanges');
  if (mode === 'off') {
    try { sessionStorage.removeItem(REVIEW_KEY); } catch { /* storage blocked */ }
    return null;
  }
  if (mode === 'review' && params.get('uichanges-token')) {
    const session = { port: Number(params.get('uichanges-port')) || 4400, token: params.get('uichanges-token') };
    try { sessionStorage.setItem(REVIEW_KEY, JSON.stringify(session)); } catch { /* storage blocked */ }
    // Keep the token out of the address bar, bookmarks and screenshots.
    ['uichanges', 'uichanges-port', 'uichanges-token'].forEach((k) => params.delete(k));
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
    return session;
  }
  try {
    const raw = sessionStorage.getItem(REVIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadReviewPanel(session) {
  window.__uichangesReview = { ...session, resolve: resolveLocators, visualRect };
  const script = document.createElement('script');
  script.src = `http://127.0.0.1:${session.port}/review.js`;
  script.onerror = () => console.warn(`uichanges: review panel not loaded. Is \`uichanges review\` running on port ${session.port}? Open the site with ?uichanges=off to leave review mode.`);
  document.head.appendChild(script);
}

function pickContent(change, locale) {
  const c = change.content || {};
  const short = locale.split('-')[0];
  return c[locale] || c[short] || c.default || Object.values(c)[0] || { title: '', slides: [] };
}

function createSdk() {
  const s = {
    opts: null, changes: [], seen: new Set(), beacons: new Map(), pending: [],
    host: null, layer: null, card: null, open: null, raf: 0, observer: null, cleanup: [], started: false,
  };

  const labels = () => LABELS[s.locale.toLowerCase().startsWith('ru') ? 'ru' : 'en'];
  const currentPath = () => normPath(s.opts.path ? s.opts.path() : location.pathname);
  const saveSeen = () => s.opts.storage.set(s.key, JSON.stringify([...s.seen]));

  function el(tag, cls, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  function mount() {
    s.host = document.createElement('uichanges-root');
    const root = s.host.attachShadow({ mode: 'open' });
    el('style', null, root).textContent = STYLE;
    s.layer = el('div', 'layer', root);
    document.body.appendChild(s.host);
  }

  function schedule() {
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => { s.raf = 0; evaluate(); layout(); });
  }

  /** Puts beacons on elements that are on screen now; removes those that are gone. */
  function evaluate() {
    const path = currentPath();
    for (const change of s.pending) {
      if (s.seen.has(change.id)) continue;
      const onThisPage = !change.path || normPath(change.path) === path;
      const target = onThisPage && change.locators.length ? resolveLocators(change.locators) : null;
      const beacon = s.beacons.get(change.id);
      if (target && !beacon) addBeacon(change, target);
      else if (beacon && !target && s.open !== change) removeBeacon(change.id);
      else if (beacon && target) beacon.target = target;
    }
    // Changes without an anchor (removed features) show as a card in the corner, one at a time.
    if (!s.open) {
      const corner = s.pending.find((c) => !s.seen.has(c.id) && !c.locators.length && (!c.path || normPath(c.path) === path));
      if (corner) openCard(corner, null);
    }
  }

  /** The element as it is in the DOM now; `known` if it is still attached. */
  function freshTarget(change, known) {
    if (known && known.isConnected) return known;
    return change.locators.length ? resolveLocators(change.locators) : null;
  }

  function addBeacon(change, target) {
    if (s.beacons.size >= s.opts.maxBeacons) return;
    const btn = el('button', 'beacon', s.layer);
    btn.type = 'button';
    btn.setAttribute('aria-label', `${labels().open}: ${pickContent(change, s.locale).title}`);
    // Read the target at click time: frameworks (Blazor prerendering, React
    // keys, Vue v-if) can replace the node after the beacon appeared.
    btn.addEventListener('click', () => {
      const b = s.beacons.get(change.id);
      openCard(change, freshTarget(change, b && b.target));
    });
    s.beacons.set(change.id, { node: btn, target, change });
    if (s.opts.onShow) s.opts.onShow(change);
    if (s.opts.autoOpen && !s.open) openCard(change, target);
  }

  function removeBeacon(id) {
    const b = s.beacons.get(id);
    if (b) { b.node.remove(); s.beacons.delete(id); }
  }

  function openCard(change, target) {
    closeCard(false);
    s.open = change;
    const content = pickContent(change, s.locale);
    const L = labels();
    let index = 0;

    const card = el('div', 'card', s.layer);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.tabIndex = -1;
    const title = el('h2', null, card);
    title.id = 'uic-title';
    title.textContent = content.title;
    card.setAttribute('aria-labelledby', 'uic-title');
    const x = el('button', 'x', card);
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', L.close);
    const body = el('div', 'body', card);
    const foot = el('div', 'foot', card);
    const count = el('span', 'count', foot);
    const back = el('button', 'btn', foot);
    back.type = 'button';
    back.textContent = L.back;
    const next = el('button', 'btn primary', foot);
    next.type = 'button';

    const slides = content.slides.length ? content.slides : [''];
    const render = () => {
      body.innerHTML = slides[index]; // built by `uichanges build`: escaped, safe subset of Markdown
      count.textContent = slides.length > 1 ? `${index + 1} ${L.of} ${slides.length}` : '';
      back.hidden = index === 0;
      next.textContent = index < slides.length - 1 ? L.next : L.done;
      layout();
    };
    back.addEventListener('click', () => { index = Math.max(0, index - 1); render(); });
    next.addEventListener('click', () => {
      if (index < slides.length - 1) { index++; render(); } else closeCard(true);
    });
    x.addEventListener('click', () => closeCard(true));
    card.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(true); });

    const extra = [];
    if (target) extra.push(el('div', 'ring', s.layer));
    const from = change.type === 'moved' && change.from;
    // Old coordinates are only meaningful at the width they were recorded at.
    if (target && from && Math.abs(window.innerWidth - (from.viewportWidth || window.innerWidth)) <= 40) {
      const ghost = el('div', 'ghost', s.layer);
      el('span', null, ghost).textContent = L.was;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'arrow');
      svg.innerHTML = '<defs><marker id="uic-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9aa0b4"/></marker></defs><path fill="none" stroke="#9aa0b4" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#uic-head)"/>';
      s.layer.insertBefore(svg, card);
      s.layer.insertBefore(ghost, svg);
      extra.push(ghost, svg);
    }

    s.card = { node: card, target, extra, from: from || null, change };
    render();
    card.focus({ preventScroll: true });
    if (target && s.opts.scrollIntoView !== false) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closeCard(markSeen) {
    if (!s.card) return;
    const { node, extra, change } = s.card;
    node.remove();
    extra.forEach((n) => n.remove());
    s.card = null;
    s.open = null;
    if (markSeen) {
      s.seen.add(change.id);
      saveSeen();
      removeBeacon(change.id);
      if (s.opts.onDismiss) s.opts.onDismiss(change);
      schedule();
    }
  }

  /** Recomputes every position from the live layout (scroll, resize, DOM changes). */
  function layout() {
    for (const b of s.beacons.values()) {
      const r = visualRect(b.target);
      const off = r.width <= 0 || r.bottom < 0 || r.top > innerHeight;
      b.node.style.display = off ? 'none' : '';
      b.node.style.left = `${Math.round(r.right)}px`;
      b.node.style.top = `${Math.round(r.top)}px`;
    }
    if (!s.card) return;
    const { node, target, extra, from } = s.card;
    if (target && !target.isConnected) {
      // Re-rendered: follow the new node. Gone for real (navigation): close.
      const fresh = freshTarget(s.card.change, null);
      if (!fresh) { closeCard(false); return; }
      s.card.target = fresh;
      layout();
      return;
    }
    const cw = node.offsetWidth;
    const ch = node.offsetHeight;
    if (!target) {
      node.style.right = '16px';
      node.style.bottom = '16px';
      return;
    }
    const r = visualRect(target);
    const [ring, ghost, svg] = extra;
    Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const below = r.bottom + 12 + ch <= innerHeight || r.top - 12 - ch < 0;
    const left = Math.min(Math.max(12, r.left), innerWidth - cw - 12);
    node.style.left = `${left}px`;
    node.style.top = `${below ? r.bottom + 12 : r.top - 12 - ch}px`;
    if (ghost && from) {
      const gx = from.x - scrollX;
      const gy = from.y - scrollY;
      Object.assign(ghost.style, { left: `${gx}px`, top: `${gy}px`, width: `${from.w}px`, height: `${from.h}px` });
      const sx = gx + from.w / 2;
      const sy = gy + from.h / 2;
      // End at the nearest point of the highlighted element, not its centre.
      const ex = Math.min(Math.max(sx, r.left - 6), r.right + 6);
      const ey = Math.min(Math.max(sy, r.top - 6), r.bottom + 6);
      const mx = (sx + ex) / 2;
      // Bend the arrow upwards if there is room, otherwise downwards, so it stays on screen.
      const bend = Math.max(40, Math.abs(ex - sx) * 0.15);
      const my = Math.min(sy, ey) - bend >= 8 ? Math.min(sy, ey) - bend : Math.max(sy, ey) + bend;
      svg.lastChild.setAttribute('d', `M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`);
    }
  }

  async function loadManifest(src) {
    if (typeof src !== 'string') return src;
    const res = await fetch(src, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`uichanges: cannot load ${src} (${res.status})`);
    return res.json();
  }

  return {
    version: '0.2.1',

    /**
     * @param {{ manifest: string|object, locale?: string, storageKey?: string,
     *   storage?: { get(k): string|null, set(k, v): void, remove?(k): void },
     *   maxBeacons?: number, autoOpen?: boolean, showOnFirstVisit?: boolean,
     *   path?: () => string, scrollIntoView?: boolean,
     *   onShow?: (change) => void, onDismiss?: (change) => void }} options
     */
    async start(options) {
      if (typeof window === 'undefined' || s.started) return;
      s.started = true;
      const review = reviewSession();
      if (review) {
        loadReviewPanel(review);
        return;
      }
      s.opts = { storageKey: 'uichanges:seen', storage: defaultStorage, maxBeacons: 3, autoOpen: false, showOnFirstVisit: false, ...options };
      s.key = s.opts.storageKey;
      s.locale = s.opts.locale || document.documentElement.lang || navigator.language || 'en';
      try {
        const manifest = await loadManifest(s.opts.manifest);
        s.changes = (manifest.changes || []).map((c) => ({ ...c, locators: c.locators || [] }));
      } catch (err) {
        console.warn(err);
        s.started = false;
        return;
      }

      const raw = s.opts.storage.get(s.key);
      if (raw === null && !s.opts.showOnFirstVisit) {
        // First visit: nothing is "new" to someone who never saw the old version.
        s.seen = new Set(s.changes.map((c) => c.id));
        saveSeen();
        return;
      }
      try { s.seen = new Set(JSON.parse(raw || '[]')); } catch { s.seen = new Set(); }
      s.pending = s.changes.filter((c) => !s.seen.has(c.id));
      if (!s.pending.length) return;

      if (!document.body) await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
      mount();
      // SPA navigation (Blazor, React Router…) and late rendering both show up as DOM mutations.
      s.observer = new MutationObserver((records) => {
        if (records.every((r) => s.host.contains(r.target) || r.target === s.host)) return;
        schedule();
      });
      s.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); s.cleanup.push(() => target.removeEventListener(type, fn, opt)); };
      on(window, 'scroll', schedule, { passive: true, capture: true });
      on(window, 'resize', schedule);
      on(window, 'popstate', schedule);
      schedule();
    },

    /** Opens the hint for a change by id, if its element is on the page. */
    open(id) {
      const change = s.changes.find((c) => c.id === id);
      if (!change) return false;
      const target = change.locators.length ? resolveLocators(change.locators) : null;
      if (change.locators.length && !target) return false;
      openCard(change, target);
      return true;
    },

    /** Removes everything the SDK drew. */
    stop() {
      if (s.observer) s.observer.disconnect();
      s.cleanup.forEach((fn) => fn());
      if (s.host) s.host.remove();
      if (s.raf) cancelAnimationFrame(s.raf);
      Object.assign(s, { beacons: new Map(), pending: [], host: null, card: null, open: null, raf: 0, observer: null, cleanup: [], started: false });
    },

    /** Forgets what this user has seen (for testing). The next start() counts as a first visit. */
    reset() {
      const storage = (s.opts && s.opts.storage) || defaultStorage;
      const key = (s.opts && s.opts.storageKey) || 'uichanges:seen';
      if (storage.remove) storage.remove(key); else storage.set(key, '[]');
    },
  };
}

export const uichanges = createSdk();
