import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, stringSimilarity, slugify } from '../src/diff.js';

const VIEWPORT = { width: 1280, height: 800 };
const snap = (elements, viewport = VIEWPORT) => ({ version: 1, screen: '/', viewport, elements });
const el = (role, name, x, y, extra = {}) => ({
  role, name, anchor: null, testid: null, landmarks: [], box: { x, y, w: 100, h: 32 }, locators: [], ...extra,
});
const types = (result) => result.changes.map((c) => `${c.type}:${c.id}`).sort();

test('identical snapshots produce no changes', () => {
  const s = snap([el('button', 'Купить', 10, 10), el('link', 'Помощь', 10, 100)]);
  const r = diffSnapshots(s, s);
  assert.equal(r.changes.length, 0);
  assert.equal(r.stats.unchanged, 2);
});

test('detects added and removed elements', () => {
  const r = diffSnapshots(
    snap([el('link', 'Подписки', 10, 10)]),
    snap([el('button', 'Сравнить товары', 600, 10)]),
  );
  assert.deepEqual(types(r), ['added:button-sravnit-tovary', 'removed:link-podpiski']);
});

test('landmark change means moved, even without testid', () => {
  const r = diffSnapshots(
    snap([el('link', 'Корзина', 24, 90, { landmarks: ['complementary:Профиль'] })]),
    snap([el('link', 'Корзина', 1100, 12, { landmarks: ['banner'] })]),
  );
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].type, 'moved');
  assert.equal(r.changes[0].match.method, 'role+name');
});

test('small layout shifts are not moves', () => {
  const r = diffSnapshots(
    snap([el('button', 'Фильтры', 300, 100)]),
    snap([el('button', 'Фильтры', 300, 160)]),
  );
  assert.equal(r.changes.length, 0);
});

test('a shift shared by the whole region is compensated', () => {
  // A taller banner pushes all of main 200px down: nothing actually moved.
  const before = snap([
    el('heading', 'Каталог', 300, 100, { landmarks: ['main'] }),
    el('button', 'Фильтры', 300, 150, { landmarks: ['main'] }),
    el('button', 'Показать ещё', 300, 600, { landmarks: ['main'] }),
  ]);
  const after = snap(before.elements.map((e) => ({ ...e, box: { ...e.box, y: e.box.y + 200 } })));
  assert.equal(diffSnapshots(before, after).changes.length, 0);
});

test('a big move inside the same region is reported', () => {
  const r = diffSnapshots(
    snap([el('button', 'Фильтры', 300, 100, { landmarks: ['main'] }), el('heading', 'Каталог', 300, 50, { landmarks: ['main'] })]),
    snap([el('button', 'Фильтры', 900, 600, { landmarks: ['main'] }), el('heading', 'Каталог', 300, 50, { landmarks: ['main'] })]),
  );
  assert.deepEqual(types(r), ['moved:button-filtry']);
  assert.equal(r.changes[0].distance > 120, true);
});

test('renamed element is matched by similarity', () => {
  const r = diffSnapshots(
    snap([el('link', 'Заказы', 24, 130, { landmarks: ['complementary:Профиль'] })]),
    snap([el('link', 'Мои заказы', 24, 90, { landmarks: ['complementary:Профиль'] })]),
  );
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].type, 'renamed');
  assert.equal(r.changes[0].before.name, 'Заказы');
  assert.equal(r.changes[0].after.name, 'Мои заказы');
});

test('testid wins over a completely different name', () => {
  const r = diffSnapshots(
    snap([el('button', 'Войти', 1100, 12, { testid: 'login' })]),
    snap([el('button', 'Вход', 1180, 12, { testid: 'login' })]),
  );
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].id, 'login');
  assert.equal(r.changes[0].type, 'renamed');
  assert.equal(r.changes[0].match.method, 'testid');
  assert.equal(r.changes[0].confidence, 'high');
});

test('moved and renamed at once', () => {
  const r = diffSnapshots(
    snap([el('link', 'Корзина', 24, 90, { landmarks: ['complementary'], testid: 'cart' })]),
    snap([el('link', 'Корзина (2)', 1100, 12, { landmarks: ['banner'], testid: 'cart' })]),
  );
  assert.deepEqual(r.changes[0].kinds, ['moved', 'renamed']);
});

test('duplicates are paired by position, not swapped', () => {
  const cards = [100, 400, 700, 1000].map((x) => el('button', 'В корзину', x, 300, { landmarks: ['main'] }));
  const r = diffSnapshots(snap(cards), snap(cards.map((c) => ({ ...c }))));
  assert.equal(r.changes.length, 0);
  assert.equal(r.stats.matched, 4);
});

test('uncertain matches are flagged low confidence', () => {
  const r = diffSnapshots(
    snap([el('button', 'Войти', 1100, 12, { landmarks: ['banner'] })]),
    snap([el('button', 'Вход', 1100, 12, { landmarks: ['banner'] })]),
  );
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].type, 'renamed');
  assert.equal(r.changes[0].confidence, 'low');
});

test('different viewport widths are refused', () => {
  assert.throws(
    () => diffSnapshots(snap([]), snap([], { width: 375, height: 800 })),
    /same width/,
  );
});

test('helpers', () => {
  assert.equal(stringSimilarity('abc', 'abc'), 1);
  assert.equal(stringSimilarity('', 'abc'), 0);
  assert.equal(slugify('Сравнить товары!'), 'sravnit-tovary');
});
