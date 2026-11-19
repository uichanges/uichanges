// The browser SDK in a real browser. Pages are served through Playwright's
// request routing, so no web server is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compileManifest } from '../src/manifest.js';

const file = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

let browser = null;
try {
  const { openBrowser } = await import('../src/snapshot.js');
  browser = await openBrowser();
} catch {
  browser = null;
}

const skip = !browser && 'playwright is not installed';

async function openDemo({ seen }) {
  execFileSync(process.execPath, [file('scripts/build-runtime.js')]);
  const { manifest } = compileManifest(file('examples/changes'));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://demo.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const serve = (body, type) => route.fulfill({ body, contentType: `${type}; charset=utf-8` });
    if (path === '/') {
      const html = readFileSync(file('examples/shop-v2.html'), 'utf8')
        .replace('</body>', '<script src="/uichanges.js" data-manifest="/uichanges.json"></script></body>');
      return serve(html, 'text/html');
    }
    if (path === '/shop.css') return serve(readFileSync(file('examples/shop.css')), 'text/css');
    if (path === '/uichanges.js') return serve(readFileSync(file('dist/uichanges.js')), 'text/javascript');
    if (path === '/uichanges.json') return serve(JSON.stringify(manifest), 'application/json');
    return route.fulfill({ status: 404 });
  });
  if (seen !== undefined) {
    await page.addInitScript((value) => localStorage.setItem('uichanges:seen', value), JSON.stringify(seen));
  }
  await page.goto('http://demo.test/');
  await page.waitForTimeout(300);
  return { page, errors };
}

test('first visit: nothing is shown, everything is marked as seen', { skip }, async () => {
  const { page, errors } = await openDemo({ seen: undefined });
  assert.equal(await page.locator('uichanges-root').count(), 0);
  const seen = JSON.parse(await page.evaluate(() => localStorage.getItem('uichanges:seen')));
  assert.equal(seen.length, 4);
  assert.deepEqual(errors, []);
  await page.close();
});

test('returning user: beacons on changed elements, slides, seen list', { skip }, async () => {
  const { page, errors } = await openDemo({ seen: [] });
  const root = page.locator('uichanges-root');

  // Three anchored changes, one per element; the removed feature has no anchor.
  assert.equal(await root.locator('.beacon').count(), 3);
  // …so it shows up as a card in the corner.
  assert.equal(await root.locator('.card h2').textContent(), 'Где подписки?');
  await root.locator('.card .btn.primary').click();

  // The cart: a moved element gets a ghost at its old place and an arrow.
  await page.evaluate(() => window.uichanges.open('link-korzina'));
  assert.equal(await root.locator('.card h2').textContent(), 'Корзина теперь в шапке');
  assert.equal(await root.locator('.ghost').count(), 1);
  assert.equal(await root.locator('svg.arrow > path[d]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await root.locator('.ghost').count(), 0);

  // Two slides with Next / Back.
  await page.evaluate(() => window.uichanges.open('button-sravnit-tovary'));
  assert.equal(await root.locator('.count').textContent(), '1 из 2');
  await root.locator('.btn.primary').click();
  assert.match(await root.locator('.body').innerHTML(), /<ol>/);
  await root.locator('.btn.primary').click(); // "Понятно"

  const seen = JSON.parse(await page.evaluate(() => localStorage.getItem('uichanges:seen')));
  assert.deepEqual(seen.sort(), ['button-sravnit-tovary', 'link-korzina', 'link-podpiski']);
  // Only "Мои заказы" is left.
  assert.equal(await root.locator('.beacon').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('elements that appear later (SPA, Blazor rendering) still get their hint', { skip }, async () => {
  const { page } = await openDemo({ seen: ['link-podpiski', 'link-moi-zakazy', 'button-sravnit-tovary'] });
  const root = page.locator('uichanges-root');
  await page.evaluate(() => document.querySelector('header a[href="/cart"]').remove());
  await page.waitForTimeout(100);
  assert.equal(await root.locator('.beacon').count(), 0);
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/cart';
    a.textContent = 'Корзина';
    document.querySelector('header').appendChild(a);
  });
  await page.waitForTimeout(100);
  assert.equal(await root.locator('.beacon').count(), 1);
  await page.close();
});

test.after(async () => { if (browser) await browser.close(); });
