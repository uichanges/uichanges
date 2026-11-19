// The GitHub Pages playground, built and opened in a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
let browser = null;
try {
  const { openBrowser } = await import('../src/snapshot.js');
  browser = await openBrowser();
} catch {
  browser = null;
}
const skip = !browser && 'playwright is not installed';

async function servePlayground() {
  execFileSync(process.execPath, [join(root, 'scripts/build-pages.js')]);
  const site = join(root, '_site');
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    let file = join(site, normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': `${TYPES[extname(file)] || 'text/plain'}; charset=utf-8` });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, 'localhost', r));
  return { url: `http://localhost:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

test('playground: the user tab shows example hints before anything is described', { skip }, async () => {
  const site = await servePlayground();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${site.url}?tab=user`);
    const shop = page.frameLocator('#frame');
    await shop.locator('uichanges-root .beacon').first().waitFor();
    assert.match(await page.textContent('#source'), /примеры/);
    assert.equal(await shop.locator('uichanges-root .beacon').count(), 3); // cart, compare, orders
    // A first-time visitor sees nothing.
    await page.check('input[value="new"]');
    await page.waitForTimeout(600);
    assert.equal(await shop.locator('uichanges-root').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await site.close();
  }
});

test('playground: describe a change as a developer, then see it as a user', { skip }, async () => {
  const site = await servePlayground();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(site.url);
    await page.click('#do-baseline');
    await page.click('#do-release');
    await page.click('#do-review');
    const shop = page.frameLocator('#frame');
    const panel = shop.locator('uichanges-review .panel');
    await panel.locator('.item').first().waitFor();
    assert.equal(await panel.locator('.item').count(), 4);

    await panel.locator('.item', { hasText: 'Корзина' }).click();
    await panel.locator('input').fill('Корзина переехала');
    await panel.locator('textarea').fill('Теперь она в шапке.');
    await panel.locator('.btn.primary').click();
    await panel.locator('.toast').waitFor();
    assert.match(await page.getAttribute('.step[data-step="4"]', 'class'), /active/);

    await page.click('#do-user');
    await shop.locator('uichanges-root .beacon').first().waitFor();
    assert.match(await page.textContent('#source'), /ваши описания: 1/);
    await shop.locator('uichanges-root .beacon').click();
    assert.equal(await shop.locator('uichanges-root .card h2').textContent(), 'Корзина переехала');
    assert.equal(await shop.locator('uichanges-root .ghost').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await site.close();
  }
});

test.after(async () => { if (browser) await browser.close(); });
