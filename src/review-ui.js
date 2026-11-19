// uichanges review panel. Served by `uichanges review` and loaded by the SDK
// when the site is opened with ?uichanges=review. Plain script, no build step.
// Everything is drawn in one Shadow DOM; page text is only ever set with
// textContent, never as HTML.
(function () {
  'use strict';
  const ctx = window.__uichangesReview;
  if (!ctx || window.__uichangesReviewLoaded) return;
  window.__uichangesReviewLoaded = true;

  const API = `http://127.0.0.1:${ctx.port}`;

  const STRINGS = {
    ru: {
      title: 'Описание изменений',
      capture: 'Обновить слепки', capturing: 'Снимаю слепки…',
      accept: 'Принять как базу', acceptConfirm: 'Точно? Нажмите ещё раз', accepted: 'Готово: текущая версия стала базой',
      onPage: 'На этой странице', noElement: 'Без элемента на странице', otherPages: 'На других страницах',
      none: 'Изменений нет. Поменяйте интерфейс и нажмите «Обновить слепки».',
      noCapture: 'Сравнивать пока не с чем. Нажмите «Обновить слепки», чтобы снять текущую версию сайта.',
      kinds: { added: 'Новое', moved: 'Переехало', renamed: 'Переименовано', removed: 'Удалено', block: 'Раздел переехал' },
      status: { new: 'нужно описание', described: 'описано', ignored: 'скрыто' },
      back: '← Все изменения',
      titleLabel: 'Заголовок', bodyLabel: 'Текст',
      bodyHint: 'Слайды разделяются строкой ---. Можно **жирный**, списки, ссылки.',
      priority: 'Важность', prio: { high: 'высокая', normal: 'обычная', low: 'низкая' },
      save: 'Сохранить', saving: 'Сохраняю…', saved: 'Сохранено. Пользователи увидят подсказку после деплоя.',
      ignore: 'Не показывать пользователям', ignored: 'Скрыто: пользователи это изменение не увидят.',
      dynamic: 'Это данные пользователя',
      dynamicHint: 'Если текст меняется сам (выбранная группа, имя, счётчик), это не изменение интерфейса.',
      dynamicDone: 'Запомнил: смена текста этого элемента больше не считается изменением.',
      lowConfidence: 'Проверьте: возможно, это разные элементы.',
      notFound: 'Элемент сейчас не виден на странице.',
      titleRequired: 'Напишите заголовок.',
      exit: 'Выйти', collapse: 'Свернуть', dock: 'Перенести панель на другую сторону',
      serverDown: 'Нет связи с `uichanges review`. Он запущен?',
      count: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'изменение' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'изменения' : 'изменений'}`,
      elements: (n) => `${n} элем.`,
    },
    en: {
      title: 'Describe changes',
      capture: 'Update snapshots', capturing: 'Taking snapshots…',
      accept: 'Accept as baseline', acceptConfirm: 'Sure? Click again', accepted: 'Done: the current version is the baseline now',
      onPage: 'On this page', noElement: 'No element on the page', otherPages: 'On other pages',
      none: 'No changes. Change your UI and click “Update snapshots”.',
      noCapture: 'Nothing to compare yet. Click “Update snapshots” to capture the current version.',
      kinds: { added: 'New', moved: 'Moved', renamed: 'Renamed', removed: 'Removed', block: 'Section moved' },
      status: { new: 'needs description', described: 'described', ignored: 'hidden' },
      back: '← All changes',
      titleLabel: 'Title', bodyLabel: 'Text',
      bodyHint: 'Separate slides with a line of ---. **Bold**, lists and links work.',
      priority: 'Priority', prio: { high: 'high', normal: 'normal', low: 'low' },
      save: 'Save', saving: 'Saving…', saved: 'Saved. Users will see the hint after you deploy.',
      ignore: 'Don’t show to users', ignored: 'Hidden: users won’t see this change.',
      dynamic: 'This is user data',
      dynamicHint: 'If the text changes on its own (a chosen group, a name, a counter), it is not a UI change.',
      dynamicDone: 'Got it: text changes of this element are no longer reported.',
      lowConfidence: 'Check: these may be different elements.',
      notFound: 'The element is not visible on the page right now.',
      titleRequired: 'Write a title.',
      exit: 'Exit', collapse: 'Collapse', dock: 'Move the panel to the other side',
      serverDown: 'Cannot reach `uichanges review`. Is it running?',
      count: (n) => `${n} change${n === 1 ? '' : 's'}`,
      elements: (n) => `${n} elements`,
    },
  };

  const COLORS = { added: '#16a34a', moved: '#2563eb', renamed: '#d97706', removed: '#dc2626', block: '#2563eb' };

  const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2330; }
.mark { position: fixed; border: 2px dashed var(--c); border-radius: 6px; }
.mark.done { border-style: solid; border-width: 1px; }
.mark.active { border-width: 3px; border-style: solid; box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 20%, transparent); }
.chip { position: absolute; left: -2px; bottom: 100%; margin-bottom: 3px; pointer-events: auto; cursor: pointer;
  border: 0; border-radius: 4px; padding: 1px 6px; font: 600 11px/1.6 system-ui, sans-serif; color: #fff; background: var(--c);
  white-space: nowrap; }
.mark.below .chip { bottom: auto; top: 100%; margin: 3px 0 0; }
.mark.flip .chip { left: auto; right: -2px; }
.ghost { position: fixed; border: 2px dashed #9aa0b4; border-radius: 6px; background: rgba(154,160,180,.12); }
svg.arrow { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; }
.panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 360px; max-width: calc(100vw - 24px);
  display: flex; flex-direction: column; background: #fff; border-radius: 12px; pointer-events: auto;
  box-shadow: 0 16px 40px rgba(15,20,40,.22), 0 0 0 1px rgba(15,20,40,.08); overflow: hidden; }
.panel.left { right: auto; left: 12px; }
.panel.collapsed { bottom: auto; width: auto; }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eceef3; }
.head b { font-size: 14px; margin-right: auto; }
.icon { border: 0; background: none; color: #6b7080; cursor: pointer; padding: 4px 6px; border-radius: 6px; font: inherit; }
.icon:hover { background: #f1f2f6; }
.actions { display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #eceef3; }
.body { flex: 1; overflow: auto; padding: 6px 0 12px; }
.section { padding: 10px 14px 4px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #8a8fa0; }
.item { display: block; width: 100%; text-align: left; border: 0; background: none; cursor: pointer; padding: 8px 14px; font: inherit; color: inherit; }
.item:hover, .item:focus-visible { background: #f5f6fa; outline: none; }
.row { display: flex; align-items: center; gap: 6px; }
.kind { font-size: 11px; font-weight: 600; color: var(--c); }
.state { margin-left: auto; font-size: 11px; color: #8a8fa0; white-space: nowrap; }
.state.new { color: #dc2626; }
.state.described { color: #16a34a; }
.name { margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: #8a8fa0; }
.empty { padding: 16px 14px; color: #6b7080; }
.btn { font: inherit; border-radius: 8px; padding: 6px 10px; border: 1px solid #d7d9e0; background: #fff; color: inherit; cursor: pointer; }
.btn:hover { background: #f5f6fa; }
.btn.primary { background: #4f46e5; border-color: transparent; color: #fff; }
.btn.primary:hover { background: #4338ca; }
.btn:disabled { opacity: .6; cursor: default; }
.btn.link { border: 0; padding: 0; background: none; color: #4f46e5; }
.form { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 12px; }
input, textarea, select { font: 13px/1.45 system-ui, sans-serif; font-weight: 400; border: 1px solid #d7d9e0; border-radius: 8px;
  padding: 7px 9px; color: inherit; background: #fff; width: 100%; }
textarea { min-height: 150px; resize: vertical; }
input:focus, textarea:focus, select:focus, .btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }
.hint { font-weight: 400; color: #8a8fa0; font-size: 12px; }
.what { padding: 10px 14px 0; }
.what .name { white-space: normal; }
.warn { color: #b45309; font-size: 12px; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.extra { border-top: 1px solid #eceef3; margin-top: 4px; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.toast { margin: 8px 14px 0; padding: 8px 10px; border-radius: 8px; background: #ecfdf3; color: #166534; }
.toast.error { background: #fef2f2; color: #991b1b; }
`;

  const state = {
    t: STRINGS.ru, items: [], hasCurrent: false, view: 'list', current: null,
    collapsed: false, busy: false, toast: null, acceptArmed: false, loaded: false, dock: 'right', dockAuto: true,
  };

  // ---------- helpers ----------
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }
  const normPath = (p) => (p && p.length > 1 ? p.replace(/\/+$/, '') : p || '/');
  const onThisPage = (item) => !item.path || normPath(item.path) === normPath(location.pathname);

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: { 'x-uichanges-token': ctx.token, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(state.t.serverDown);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function label(item) {
    if (item.kind === 'block') return `«${item.after}» · ${state.t.elements(item.size)}`;
    if (item.kinds.includes('renamed')) return `«${item.before}» → «${item.after}»`;
    return `«${item.after || item.before}»`;
  }

  function kindOf(item) {
    if (item.kind === 'block') return 'block';
    return item.kind;
  }

  // ---------- DOM ----------
  const host = document.createElement('uichanges-review');
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', null, STYLE));
  const layer = h('div', { class: 'layer' });
  const marks = h('div');
  const overlay = h('div');
  const panel = h('div', { class: 'panel', role: 'complementary', 'aria-label': 'uichanges' });
  layer.append(marks, overlay, panel);
  root.append(layer);
  document.body.append(host);

  // Typing in the panel must not trigger the site's keyboard shortcuts.
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('keyup', (e) => e.stopPropagation());

  // ---------- highlights on the page ----------
  let markNodes = [];

  function targetOf(item) {
    if (!onThisPage(item) || !item.locators || !item.locators.length) return null;
    return ctx.resolve(item.locators);
  }

  function renderMarks() {
    marks.replaceChildren();
    markNodes = [];
    for (const item of state.items) {
      const target = targetOf(item);
      if (!target) continue;
      const k = kindOf(item);
      const done = item.status !== 'new';
      const chip = h('button', {
        class: 'chip',
        type: 'button',
        onclick: () => openEditor(item.id),
      }, `${done ? '✓ ' : ''}${state.t.kinds[k]}`);
      const node = h('div', {
        class: `mark${done ? ' done' : ''}${state.current === item.id ? ' active' : ''}`,
        style: `--c: ${COLORS[k]}`,
      }, chip);
      marks.append(node);
      markNodes.push({ node, item, target });
    }
    renderOverlay();
    layout();
    chooseSide();
  }

  // Until the developer moves the panel, keep it on the side where it covers
  // fewer highlighted elements.
  function chooseSide() {
    if (!state.dockAuto || state.view === 'edit' || !markNodes.length) return;
    const width = panel.offsetWidth + 24;
    let left = 0;
    let right = 0;
    for (const m of markNodes) {
      const r = ctx.visualRect(m.target);
      if (r.right > innerWidth - width) right++;
      if (r.left < width) left++;
    }
    const side = right > left ? 'left' : 'right';
    if (side !== state.dock) { state.dock = side; render(); }
  }

  // The selected moved element: ghost at the old place and an arrow.
  let arrow = null;
  function renderOverlay() {
    overlay.replaceChildren();
    arrow = null;
    const item = state.items.find((i) => i.id === state.current);
    if (!item || !item.from || !onThisPage(item)) return;
    if (Math.abs(window.innerWidth - (item.from.viewportWidth || window.innerWidth)) > 40) return;
    const ghost = h('div', { class: 'ghost' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'arrow');
    svg.innerHTML = '<defs><marker id="uicr-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9aa0b4"/></marker></defs><path fill="none" stroke="#9aa0b4" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#uicr-head)"/>';
    overlay.append(ghost, svg);
    arrow = { ghost, path: svg.lastChild, item };
  }

  function layout() {
    for (const m of markNodes) {
      if (!m.target.isConnected) { m.target = ctx.resolve(m.item.locators) || m.target; }
      const r = ctx.visualRect(m.target);
      const hidden = !m.target.isConnected || r.width <= 0;
      m.node.style.display = hidden ? 'none' : '';
      Object.assign(m.node.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      // No room for the label above the element at the top edge: put it below.
      m.node.classList.toggle('below', r.top < 24);
      // …and keep it inside the window at the right edge.
      m.node.classList.toggle('flip', r.left + 140 > innerWidth);
    }
    if (arrow) {
      const m = markNodes.find((x) => x.item.id === arrow.item.id);
      const f = arrow.item.from;
      const gx = f.x - scrollX;
      const gy = f.y - scrollY;
      Object.assign(arrow.ghost.style, { left: `${gx}px`, top: `${gy}px`, width: `${f.w}px`, height: `${f.h}px` });
      if (m && m.target.isConnected) {
        const r = ctx.visualRect(m.target);
        const sx = gx + f.w / 2;
        const sy = gy + f.h / 2;
        const ex = Math.min(Math.max(sx, r.left - 6), r.right + 6);
        const ey = Math.min(Math.max(sy, r.top - 6), r.bottom + 6);
        const bend = Math.max(40, Math.abs(ex - sx) * 0.15);
        const my = Math.min(sy, ey) - bend >= 8 ? Math.min(sy, ey) - bend : Math.max(sy, ey) + bend;
        arrow.path.setAttribute('d', `M${sx} ${sy} Q${(sx + ex) / 2} ${my} ${ex} ${ey}`);
      }
    }
  }

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; layout(); });
  };
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  // Re-find elements after SPA navigation or re-rendering.
  let remarkTimer = 0;
  new MutationObserver((records) => {
    if (records.every((r) => host.contains(r.target) || r.target === host)) return;
    clearTimeout(remarkTimer);
    remarkTimer = setTimeout(renderMarks, 150);
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => setTimeout(() => { renderMarks(); render(); }, 50));

  // ---------- panel ----------
  function toastNode() {
    if (!state.toast) return null;
    return h('div', { class: `toast${state.toast.error ? ' error' : ''}`, role: 'status' }, state.toast.text);
  }

  function setToast(text, error = false) {
    state.toast = text ? { text, error } : null;
  }

  function render() {
    const t = state.t;
    panel.classList.toggle('collapsed', state.collapsed);
    panel.classList.toggle('left', state.dock === 'left');
    const pending = state.items.filter((i) => i.status === 'new').length;
    const head = h('div', { class: 'head' },
      h('b', null, `uichanges · ${t.title}`),
      state.collapsed ? h('span', { class: 'muted' }, t.count(pending)) : null,
      h('button', { class: 'icon', type: 'button', title: t.dock, 'aria-label': t.dock, onclick: () => { state.dock = state.dock === 'left' ? 'right' : 'left'; state.dockAuto = false; render(); } }, '⇆'),
      h('button', { class: 'icon', type: 'button', title: t.collapse, 'aria-label': t.collapse, onclick: () => { state.collapsed = !state.collapsed; render(); } }, state.collapsed ? '▢' : '–'),
      h('button', { class: 'icon', type: 'button', title: t.exit, onclick: exitReview }, t.exit),
    );
    if (state.collapsed) { panel.replaceChildren(head); return; }

    const actions = h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', disabled: state.busy, onclick: capture }, state.busy === 'capture' ? t.capturing : t.capture),
      h('button', { class: 'btn', type: 'button', disabled: state.busy || !state.hasCurrent, onclick: acceptBaseline }, state.acceptArmed ? t.acceptConfirm : t.accept),
    );
    const body = h('div', { class: 'body' });
    if (state.view === 'edit') body.append(editorView());
    else body.append(listView());
    panel.replaceChildren(head, actions, body);
  }

  function itemButton(item) {
    const k = kindOf(item);
    return h('button', { class: 'item', type: 'button', style: `--c: ${COLORS[k]}`, onclick: () => openEditor(item.id) },
      h('div', { class: 'row' },
        h('span', { class: 'kind' }, state.t.kinds[k]),
        h('span', { class: `state ${item.status}` }, state.t.status[item.status])),
      h('div', { class: 'name', title: label(item) }, label(item)));
  }

  function listView() {
    const t = state.t;
    const wrap = h('div');
    const toast = toastNode();
    if (toast) wrap.append(toast);
    if (!state.loaded) return wrap;
    if (!state.hasCurrent) { wrap.append(h('div', { class: 'empty' }, t.noCapture)); return wrap; }
    if (!state.items.length) { wrap.append(h('div', { class: 'empty' }, t.none)); return wrap; }

    const here = state.items.filter((i) => onThisPage(i) && i.locators.length);
    const noEl = state.items.filter((i) => onThisPage(i) && !i.locators.length);
    const other = state.items.filter((i) => !onThisPage(i));
    const order = { new: 0, described: 1, ignored: 2 };
    const sort = (list) => list.sort((a, b) => order[a.status] - order[b.status]);
    for (const [title, list] of [[t.onPage, here], [t.noElement, noEl], [t.otherPages, other]]) {
      if (!list.length) continue;
      wrap.append(h('div', { class: 'section' }, title), ...sort(list).map(itemButton));
    }
    return wrap;
  }

  function editorView() {
    const t = state.t;
    const item = state.items.find((i) => i.id === state.current);
    if (!item) { state.view = 'list'; return listView(); }
    const k = kindOf(item);
    const d = item.description;
    const title = h('input', { type: 'text', value: d ? d.title : '', placeholder: suggestTitle(item) });
    const text = h('textarea', { placeholder: t.bodyHint });
    text.value = d ? d.body : '';
    const prio = h('select', null, ...['high', 'normal', 'low'].map((p) => {
      const o = h('option', { value: p }, t.prio[p]);
      if ((d ? d.priority : 'normal') === p) o.selected = true;
      return o;
    }));
    const target = targetOf(item);
    const saveBtn = h('button', { class: 'btn primary', type: 'button', disabled: state.busy }, state.busy === 'save' ? t.saving : t.save);
    saveBtn.addEventListener('click', () => save(item, title.value, text.value, prio.value));

    const extra = h('div', { class: 'extra' },
      item.status !== 'ignored' ? h('button', { class: 'btn link', type: 'button', onclick: () => ignore(item) }, t.ignore) : null,
      item.canBeDynamic ? h('button', { class: 'btn link', type: 'button', onclick: () => markDynamic(item) }, t.dynamic) : null,
      item.canBeDynamic ? h('span', { class: 'hint' }, t.dynamicHint) : null,
    );

    return h('div', null,
      h('div', { class: 'what' },
        h('button', { class: 'btn link', type: 'button', onclick: () => { state.view = 'list'; state.current = null; setToast(null); renderMarks(); render(); } }, t.back),
        h('div', { class: 'row', style: `margin-top: 10px; --c: ${COLORS[k]}` },
          h('span', { class: 'kind' }, t.kinds[k]),
          h('span', { class: `state ${item.status}` }, t.status[item.status])),
        h('div', { class: 'name' }, label(item)),
        item.confidence === 'low' ? h('div', { class: 'warn' }, t.lowConfidence) : null,
        onThisPage(item) && item.locators.length && !target ? h('div', { class: 'warn' }, t.notFound) : null),
      toastNode(),
      h('div', { class: 'form' },
        h('label', null, t.titleLabel, title),
        h('label', null, t.bodyLabel, text, h('span', { class: 'hint' }, t.bodyHint)),
        h('label', null, t.priority, prio),
        h('div', { class: 'buttons' }, saveBtn),
        extra));
  }

  function suggestTitle(item) {
    const ru = state.t === STRINGS.ru;
    const name = item.after || item.before;
    switch (item.kind) {
      case 'added': return ru ? `Новое: «${name}»` : `New: “${name}”`;
      case 'moved': return ru ? `«${name}» теперь здесь` : `“${name}” is here now`;
      case 'renamed': return ru ? `«${item.before}» теперь называется «${item.after}»` : `“${item.before}” is now “${item.after}”`;
      case 'removed': return ru ? `«${name}» больше нет` : `“${name}” is gone`;
      default: return ru ? `Раздел «${name}» переехал` : `Section “${name}” has moved`;
    }
  }

  // ---------- actions ----------
  async function refresh() {
    try {
      const data = await api('GET', '/api/status');
      state.items = data.items;
      state.hasCurrent = data.hasCurrent;
      state.t = STRINGS[data.locale] || STRINGS.en;
      state.loaded = true;
    } catch (err) {
      state.loaded = true;
      setToast(err.message, true);
    }
    renderMarks();
    render();
  }

  function openEditor(id) {
    state.view = 'edit';
    state.current = id;
    state.collapsed = false;
    setToast(null);
    renderMarks();
    render();
    const item = state.items.find((i) => i.id === id);
    const target = item && targetOf(item);
    if (target) {
      // Move the panel out of the way if it covers the element.
      const r = ctx.visualRect(target);
      const width = panel.offsetWidth + 24;
      if (state.dock === 'right' && r.right > innerWidth - width) state.dock = 'left';
      else if (state.dock === 'left' && r.left < width) state.dock = 'right';
      render();
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const input = panel.querySelector('input');
    if (input) input.focus({ preventScroll: true });
  }

  async function run(kind, fn, done) {
    state.busy = kind;
    render();
    try {
      await fn();
      setToast(done);
    } catch (err) {
      setToast(err.message, true);
    }
    state.busy = false;
    await refresh();
  }

  function save(item, title, body, priority) {
    if (!title.trim()) { setToast(state.t.titleRequired, true); render(); return; }
    return run('save', () => api('POST', '/api/describe', { id: item.id, title, body, priority }), state.t.saved);
  }

  function ignore(item) {
    return run('ignore', () => api('POST', '/api/ignore', { id: item.id }), state.t.ignored);
  }

  function markDynamic(item) {
    state.view = 'list';
    state.current = null;
    return run('dynamic', () => api('POST', '/api/dynamic', { id: item.id }), state.t.dynamicDone);
  }

  function capture() {
    state.view = 'list';
    state.current = null;
    return run('capture', () => api('POST', '/api/capture'), null);
  }

  function acceptBaseline() {
    if (!state.acceptArmed) {
      state.acceptArmed = true;
      render();
      setTimeout(() => { state.acceptArmed = false; render(); }, 4000);
      return;
    }
    state.acceptArmed = false;
    state.view = 'list';
    state.current = null;
    return run('accept', () => api('POST', '/api/accept'), state.t.accepted);
  }

  function exitReview() {
    try { sessionStorage.removeItem('uichanges:review'); } catch { /* storage blocked */ }
    location.reload();
  }

  render();
  refresh();
})();
