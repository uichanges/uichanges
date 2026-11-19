import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { diffSnapshots } from '../src/diff.js';

const example = (name) => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));

let snapshotPage;
try {
  await import('playwright');
  ({ snapshotPage } = await import('../src/snapshot.js'));
} catch {
  snapshotPage = null;
}

test('shop v1 → v2: real browser, real layout', { skip: !snapshotPage && 'playwright is not installed' }, async () => {
  const before = await snapshotPage(example('shop-v1.html'), { screen: 'catalog' });
  const after = await snapshotPage(example('shop-v2.html'), { screen: 'catalog' });

  // Ignored promo block must not appear in snapshots at all.
  assert.ok(!before.elements.some((e) => e.name.includes('скидка')));

  const result = diffSnapshots(before, after);
  const got = result.changes.map((c) => `${c.type}:${c.id}`).sort();

  assert.deepEqual(got, [
    'added:button-sravnit-tovary',
    'moved:link-korzina',
    'removed:link-podpiski',
    'renamed:link-moi-zakazy',
    'renamed:login',
  ]);

  const cart = result.changes.find((c) => c.id === 'link-korzina');
  assert.deepEqual(cart.before.landmarks, ['complementary:Профиль', 'navigation']);
  assert.deepEqual(cart.after.landmarks, ['banner']);

  // Four identical "В корзину" buttons and the rest of the page are unchanged.
  assert.ok(result.stats.unchanged >= 12);
});
