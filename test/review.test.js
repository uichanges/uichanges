// Review mode: the local API, and the panel on a real page in a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { init, paths, writeSnapshot } from '../src/project.js';
import { startReviewServer, reviewLink } from '../src/review-server.js';

const file = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const VIEWPORT = { width: 1280, height: 800 };
const el = (role, name, x, y, extra = {}) => ({
  role, name, anchor: null, testid: null, landmarks: ['main'], box: { x, y, w: 100, h: 32 },
  locators: [`role=${role}[name="${name}"]`, `body > main > ${role}:nth-of-type(${Math.round(x / 100)})`], ...extra,
});

function project(screenUrl = 'http://localhost:5080/') {
  const root = mkdtempSync(join(tmpdir(), 'uic-review-'));
  init(root, { locale: 'ru' });
  const p = paths(root);
  const config = JSON.parse(readFileSync(p.config, 'utf8'));
  config.screens = [{ name: 'home', url: screenUrl }];
  writeFileSync(p.config, JSON.stringify(config));
  return { root, p };
}

function syntheticProject() {
  const { root, p } = project();
  const snap = (elements) => ({ version: 1, screen: 'home', viewport: VIEWPORT, elements });
  const group = 'body > main > form > button:nth-of-type(1)';
  writeSnapshot(p.baseline, 'home@1280.json', snap([
    el('button', 'Выйти', 1197, 8, { landmarks: ['banner'] }),
    el('button', 'Группа: не указана изменить', 273, 689, { locators: [group] }),
  ]));
  writeSnapshot(p.current, 'home@1280.json', snap([
    el('button', 'Выйти', 273, 760),
    el('button', 'Группа: 3ПИ41 изменить', 273, 689, { locators: [group] }),
    el('button', 'Сравнить', 600, 689),
  ]));
  return { root, p };
}

async function call(server, method, path, body, token = server.token) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: { ...(token ? { 'x-uichanges-token': token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('API: token required, status lists changes, describe/ignore/dynamic work', async () => {
  const { root, p } = syntheticProject();
  const server = await startReviewServer(root, { port: 0 });
  try {
    assert.equal((await call(server, 'GET', '/api/status', null, null)).status, 401);
    assert.equal((await call(server, 'GET', '/api/status', null, 'wrong')).status, 401);

    const { data } = await call(server, 'GET', '/api/status');
    assert.equal(data.locale, 'ru');
    const byId = Object.fromEntries(data.items.map((i) => [i.id, i]));
    assert.deepEqual(Object.keys(byId).sort(), ['button-gruppa-3pi41-izmenit', 'button-sravnit', 'button-vyyti']);
    assert.equal(byId['button-vyyti'].kind, 'moved');
    assert.ok(byId['button-vyyti'].from);
    assert.equal(byId['button-gruppa-3pi41-izmenit'].canBeDynamic, true);

    // Describe: creates the file and rebuilds the manifest.
    let r = await call(server, 'POST', '/api/describe', { id: 'button-vyyti', title: 'Кнопка «Выйти» теперь внизу', body: 'Первый слайд.\n\n---\n\nВторой.', priority: 'high' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const md = readFileSync(join(p.changes, 'button-vyyti.md'), 'utf8');
    assert.match(md, /^---\nid: button-vyyti\ntype: moved/);
    assert.match(md, /priority: high/);
    assert.match(md, /# Кнопка «Выйти» теперь внизу\n\nПервый слайд\./);
    const manifest = JSON.parse(readFileSync(join(root, '.uichanges/uichanges.json'), 'utf8'));
    assert.equal(manifest.changes[0].content.default.slides.length, 2);

    // Editing keeps the recorded frontmatter (locators, old position).
    r = await call(server, 'POST', '/api/describe', { id: 'button-vyyti', title: 'Новый заголовок', body: 'Текст', priority: 'low' });
    const edited = readFileSync(join(p.changes, 'button-vyyti.md'), 'utf8');
    assert.match(edited, /from: \{/);
    assert.match(edited, /priority: low/);
    assert.doesNotMatch(edited, /priority: high/);
    const status = (await call(server, 'GET', '/api/status')).data.items.find((i) => i.id === 'button-vyyti');
    assert.equal(status.status, 'described');
    assert.deepEqual(status.description, { title: 'Новый заголовок', body: 'Текст', priority: 'low' });

    // "This is user data": the group button stops being a change.
    r = await call(server, 'POST', '/api/dynamic', { id: 'button-gruppa-3pi41-izmenit' });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(readFileSync(p.config, 'utf8')).dynamic, ['body > main > form > button:nth-of-type(1)']);
    const ids = (await call(server, 'GET', '/api/status')).data.items.map((i) => i.id);
    assert.ok(!ids.includes('button-gruppa-3pi41-izmenit'));

    // Ignore.
    r = await call(server, 'POST', '/api/ignore', { id: 'button-sravnit' });
    assert.equal(r.status, 200);
    assert.equal((await call(server, 'GET', '/api/status')).data.items.find((i) => i.id === 'button-sravnit').status, 'ignored');

    // Errors.
    assert.equal((await call(server, 'POST', '/api/describe', { id: 'nope', title: 'x' })).status, 404);
    assert.equal((await call(server, 'POST', '/api/describe', { id: 'button-vyyti', title: '' })).status, 400);

    // Accept.
    r = await call(server, 'POST', '/api/accept');
    assert.equal(r.data.accepted, 1);
    assert.equal((await call(server, 'GET', '/api/status')).data.hasCurrent, false);
  } finally {
    await server.close();
  }
});

test('CORS: only local origins and the configured site get access', async () => {
  const { root } = syntheticProject();
  const server = await startReviewServer(root, { port: 0 });
  try {
    const pre = (origin) => fetch(`http://127.0.0.1:${server.port}/api/status`, { method: 'OPTIONS', headers: { origin } });
    assert.equal((await pre('http://localhost:5080')).headers.get('access-control-allow-origin'), 'http://localhost:5080');
    assert.equal((await pre('https://evil.example')).headers.get('access-control-allow-origin'), null);
  } finally {
    await server.close();
  }
});

test('review link carries port and token', () => {
  assert.equal(reviewLink('http://localhost:5080/catalog?x=1', 4400, 'abc'), 'http://localhost:5080/catalog?x=1&uichanges=review&uichanges-port=4400&uichanges-token=abc');
});

// ---------- the panel in a real browser ----------

let browser = null;
let snapshotPage = null;
try {
  const mod = await import('../src/snapshot.js');
  browser = await mod.openBrowser();
  snapshotPage = mod.snapshotPage;
} catch {
  browser = null;
}

test('panel: highlights changes on the page and saves a description', { skip: !browser && 'playwright is not installed' }, async () => {
  execFileSync(process.execPath, [file('scripts/build-runtime.js')]);
  // A real local web server: Chrome lets only pages served from the local
  // machine talk to 127.0.0.1, which is exactly the review-mode setup.
  const site = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const send = (body, type) => { res.writeHead(200, { 'content-type': `${type}; charset=utf-8` }); res.end(body); };
    if (path === '/') {
      return send(readFileSync(file('examples/shop-v2.html'), 'utf8')
        .replace('</body>', '<script src="/uichanges.js" data-manifest="/uichanges.json"></script></body>'), 'text/html');
    }
    if (path === '/shop.css') return send(readFileSync(file('examples/shop.css')), 'text/css');
    if (path === '/uichanges.js') return send(readFileSync(file('dist/uichanges.js')), 'text/javascript');
    res.writeHead(404).end('{}');
  });
  await new Promise((r) => site.listen(0, 'localhost', r));
  const SITE = `http://localhost:${site.address().port}`;
  const { root, p } = project(`${SITE}/`);
  const before = await snapshotPage(file('examples/shop-v1.html'), { screen: 'home' });
  const after = await snapshotPage(file('examples/shop-v2.html'), { screen: 'home' });
  writeSnapshot(p.baseline, 'home@1280.json', before);
  writeSnapshot(p.current, 'home@1280.json', after);

  const server = await startReviewServer(root, { port: 0 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(reviewLink(`${SITE}/`, server.port, server.token));
    const panel = page.locator('uichanges-review .panel');
    await panel.locator('.item').first().waitFor();

    // The token is removed from the address bar.
    assert.equal(new URL(page.url()).search, '');
    // Changed elements on the page are outlined (cart, compare, orders, login).
    assert.equal(await page.locator('uichanges-review .mark').count(), 4);
    // Removed "Подписки" has no element: listed separately.
    assert.match(await panel.textContent(), /Без элемента на странице/);

    // The panel docks on the side where it covers fewer highlights: the
    // header (right) has three, the sidebar (left) one.
    assert.match(await panel.getAttribute('class'), /\bleft\b/);

    // Open the cart from the list, write a description, save.
    await panel.locator('.item', { hasText: 'Корзина' }).click();
    assert.equal(await page.locator('uichanges-review .ghost').count(), 1);
    await panel.locator('input').fill('Корзина теперь в шапке');
    await panel.locator('textarea').fill('Раньше она была в меню профиля.');
    await panel.locator('.btn.primary').click();
    await panel.locator('.toast').waitFor();
    assert.match(await panel.locator('.toast').textContent(), /Сохранено/);

    const md = readFileSync(join(p.changes, 'link-korzina.md'), 'utf8');
    assert.match(md, /# Корзина теперь в шапке\n\nРаньше она была в меню профиля\./);
    assert.ok(existsSync(join(root, '.uichanges/uichanges.json')));

    // Reload keeps review mode for this tab (no hints, panel again).
    await page.reload();
    await panel.locator('.item').first().waitFor();
    assert.equal(await page.locator('uichanges-root').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await server.close();
    await new Promise((r) => site.close(r));
  }
});

test.after(async () => { if (browser) await browser.close(); });
