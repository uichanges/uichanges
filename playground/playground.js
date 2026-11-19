// uichanges playground: the whole cycle in the browser, no install.
//
// The shop runs in an iframe. Snapshots are taken with the library's own
// captureSnapshot inside that iframe, compared with diffSnapshots, and the
// review panel is the same one `uichanges review` shows. Instead of the local
// review server, a small in-browser backend answers the panel and keeps
// everything in localStorage.
import { captureSnapshot } from './lib/capture.js';
import { diffSnapshots, cssPathOf } from './lib/diff.js';
import { parseDescription } from './lib/markdown.js';
import { toReviewItems, manifestEntry } from './lib/review-items.js';

const KEY = 'uichanges-playground';
const SEEN = 'uichanges:seen';
const SHOP_PATH = new URL('shop.html', location.href).pathname;

const $ = (id) => document.getElementById(id);
const frame = $('frame');

// ---------- state ----------
const fresh = () => ({ step: 1, baseline: null, current: null, descriptions: {}, ignored: [], dynamic: [] });
let state = (() => {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return fresh(); }
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } };

// ---------- the shop iframe ----------
function loadShop(version) {
  $('version').textContent = `Версия ${version}`;
  $('version').classList.toggle('v2', version === 2);
  return new Promise((resolve) => {
    frame.addEventListener('load', () => resolve(frame.contentWindow), { once: true });
    frame.src = `shop.html?v=${version}`;
  });
}

/** captureSnapshot, run in the iframe's own window. */
function snapshot(win) {
  // eslint-disable-next-line no-new-func
  const run = new win.Function('options', `return (${captureSnapshot.toString()})(options);`);
  return run({ screen: 'shop' });
}

// ---------- the in-browser backend (what `uichanges review` answers) ----------
let lastChanges = [];

function changesNow() {
  if (!state.baseline || !state.current) return [];
  const { changes } = diffSnapshots(state.baseline, state.current, { dynamic: state.dynamic });
  for (const c of changes) {
    const ids = [c.id, c.block && c.block.id].filter(Boolean);
    c.status = ids.some((id) => state.descriptions[id]) ? 'described' : ids.some((id) => state.ignored.includes(id)) ? 'ignored' : 'new';
    c.path = SHOP_PATH;
    c.screen = 'shop';
    c.viewportWidth = state.current.viewport.width;
  }
  lastChanges = changes;
  return changes;
}

const fail = (message) => { throw new Error(message); };

const backend = {
  'GET /api/status': () => ({
    hasCurrent: Boolean(state.current),
    locale: 'ru',
    items: toReviewItems(changesNow(), (id) => state.descriptions[id] || null),
  }),
  'POST /api/describe': ({ id, title, body, priority }) => {
    if (!title || !title.trim()) fail('Напишите заголовок.');
    state.descriptions[id] = { title: title.trim(), body: (body || '').trim(), priority: priority || 'normal' };
    save();
    go(4);
    return { ok: true };
  },
  'POST /api/ignore': ({ id }) => {
    if (!state.ignored.includes(id)) state.ignored.push(id);
    save();
    return { ok: true };
  },
  'POST /api/dynamic': ({ id }) => {
    const c = lastChanges.find((x) => x.id === id) || fail(`Нет изменения ${id}`);
    for (const el of [c.before, c.after]) {
      const path = el && cssPathOf(el);
      if (path && !state.dynamic.includes(path)) state.dynamic.push(path);
    }
    save();
    return { ok: true };
  },
  'POST /api/capture': () => {
    const snap = snapshot(frame.contentWindow);
    if (!state.baseline) state.baseline = snap; else state.current = snap;
    save();
    return { ok: true };
  },
  'POST /api/accept': () => {
    if (state.current) { state.baseline = state.current; state.current = null; }
    save();
    return { ok: true, accepted: 1 };
  },
};

async function api(method, path, body) {
  const route = backend[`${method} ${path}`] || fail(`Нет такого запроса: ${method} ${path}`);
  return route(body || {});
}

// ---------- developer side ----------
function renderSteps() {
  document.querySelectorAll('.step').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('done', n < state.step);
    el.classList.toggle('active', n === state.step);
  });
}

function go(step) {
  state.step = Math.max(state.step, step);
  save();
  renderSteps();
}

function openPanel(win) {
  win.uichanges.review({
    api,
    panel: new URL('review.js', location.href).href,
    onExit: () => { go(4); },
  });
}

async function showDev() {
  // Steps 1 and 2 show the old version until "Показать новую версию".
  if (state.step <= 2) {
    await loadShop(1);
    return;
  }
  const win = await loadShop(2);
  if (state.step >= 3 && state.current) openPanel(win);
}

$('do-baseline').addEventListener('click', () => {
  state.baseline = snapshot(frame.contentWindow);
  state.current = null;
  go(2);
});

$('do-release').addEventListener('click', async () => {
  await loadShop(2);
  go(3);
});

$('do-review').addEventListener('click', async () => {
  if (state.step < 3) await loadShop(2);
  await api('POST', '/api/capture');
  openPanel(frame.contentWindow);
});

$('do-user').addEventListener('click', () => selectTab('user'));

$('do-restart').addEventListener('click', async () => {
  state = fresh();
  save();
  renderSteps();
  await loadShop(1);
});

// ---------- user side ----------
const EXAMPLES = [
  { match: (c) => c.kinds.includes('moved') && c.after.name.startsWith('Корзина'), title: 'Корзина теперь в шапке', body: 'Раньше она была в меню профиля. Теперь корзина всегда под рукой, на любой странице.', priority: 'high' },
  { match: (c) => c.type === 'added' && c.after.name === 'Сравнить', title: 'Новое: сравнение товаров', body: 'Отметьте пару товаров и сравните характеристики в одной таблице.' },
  { match: (c) => c.kinds.includes('renamed') && c.after.name === 'Мои заказы', title: '«Заказы» теперь «Мои заказы»', body: 'Всё на месте: история, статусы доставки и возвраты.', priority: 'low' },
  { match: (c) => c.type === 'removed' && c.before.name === 'Подписки', title: 'Где подписки?', body: 'Подписки переехали в настройки профиля: **Профиль → Настройки → Уведомления**.', priority: 'low' },
];

/** Snapshots of both versions taken off screen, at the width of the visible frame. */
async function exampleSnapshots() {
  const hidden = document.createElement('iframe');
  hidden.setAttribute('aria-hidden', 'true');
  hidden.tabIndex = -1;
  Object.assign(hidden.style, { position: 'fixed', left: '-10000px', top: '0', width: `${frame.clientWidth}px`, height: `${frame.clientHeight}px`, border: '0' });
  document.body.append(hidden);
  const shot = (v) => new Promise((resolve) => {
    hidden.addEventListener('load', () => resolve(snapshot(hidden.contentWindow)), { once: true });
    hidden.src = `shop.html?v=${v}`;
  });
  const before = await shot(1);
  const after = await shot(2);
  hidden.remove();
  return { before, after };
}

const slidesOf = (title, body) => parseDescription(`# ${title}\n\n${body}`).slides;

async function buildManifest() {
  const described = Object.keys(state.descriptions).length;
  let changes;
  let texts;
  if (described && state.baseline && state.current) {
    changes = changesNow();
    texts = (id) => state.descriptions[id];
    $('source').textContent = `Показаны ваши описания: ${described}.`;
  } else {
    const { before, after } = await exampleSnapshots();
    changes = diffSnapshots(before, after).changes;
    for (const c of changes) { c.path = SHOP_PATH; c.viewportWidth = after.viewport.width; c.status = 'new'; }
    texts = (id) => {
      const c = changes.find((x) => x.id === id);
      const ex = c && EXAMPLES.find((e) => e.match(c));
      return ex ? { title: ex.title, body: ex.body, priority: ex.priority || 'normal' } : null;
    };
    $('source').textContent = 'Вы ещё ничего не описали, поэтому показаны примеры. Опишите изменения на вкладке разработчика, и здесь появятся ваши тексты.';
  }
  const items = toReviewItems(changes, texts);
  return {
    version: 1,
    changes: items
      .filter((i) => i.description)
      .map((i) => manifestEntry(i, { title: i.description.title, slides: slidesOf(i.description.title, i.description.body), priority: i.description.priority })),
  };
}

async function showUser() {
  const manifest = await buildManifest();
  const returning = document.querySelector('input[name="who"]:checked').value === 'returning';
  $('who-hint').textContent = returning
    ? 'Каждую подсказку он увидит один раз.'
    : 'Новый покупатель не видел старую версию, поэтому подсказок не будет: для него всё и так новое.';
  $('do-again').hidden = !returning;
  const win = await loadShop(2);
  try {
    if (returning) win.localStorage.setItem(SEEN, '[]'); else win.localStorage.removeItem(SEEN);
  } catch { /* storage blocked */ }
  win.uichanges.start({ manifest });
}

$('do-again').addEventListener('click', showUser);
document.querySelectorAll('input[name="who"]').forEach((r) => r.addEventListener('change', showUser));

// ---------- tabs ----------
function selectTab(which) {
  const dev = which === 'dev';
  $('tab-dev').setAttribute('aria-selected', String(dev));
  $('tab-user').setAttribute('aria-selected', String(!dev));
  $('side-dev').hidden = !dev;
  $('side-user').hidden = dev;
  if (dev) showDev(); else showUser();
}
$('tab-dev').addEventListener('click', () => selectTab('dev'));
$('tab-user').addEventListener('click', () => selectTab('user'));

renderSteps();
selectTab(new URLSearchParams(location.search).get('tab') === 'user' ? 'user' : 'dev');
