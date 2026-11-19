// The .uichanges/ workflow without a browser: snapshots are written directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init, paths, writeSnapshot, computeStatus, findChange, addIgnored, accept } from '../src/project.js';
import { writeDescription } from '../src/describe.js';
import { buildManifest } from '../src/manifest.js';

const VIEWPORT = { width: 1280, height: 800 };
const el = (role, name, x, y, landmarks = ['main']) => ({
  role, name, anchor: null, testid: null, landmarks, box: { x, y, w: 100, h: 32 }, locators: [`role=${role}[name="${name}"]`],
});
const snap = (elements) => ({ version: 1, screen: 'home', viewport: VIEWPORT, elements });

function project() {
  const root = mkdtempSync(join(tmpdir(), 'uic-project-'));
  init(root, { locale: 'ru' });
  const p = paths(root);
  const config = JSON.parse(readFileSync(p.config, 'utf8'));
  config.screens = [{ name: 'home', url: 'http://localhost:5080/' }];
  writeFileSync(p.config, JSON.stringify(config));
  writeSnapshot(p.baseline, 'home@1280.json', snap([
    el('button', 'Выйти', 1197, 8, ['banner']),
    el('button', 'Спросить', 906, 689),
    el('link', 'Подписки', 24, 300),
  ]));
  writeSnapshot(p.current, 'home@1280.json', snap([
    el('button', 'Выйти', 273, 760),
    el('button', 'Спросить', 906, 689),
    el('button', 'Сравнить', 600, 689),
  ]));
  return { root, p };
}

test('init creates the folder, config and a .gitignore for current/', () => {
  const { p } = project();
  assert.ok(existsSync(p.changes));
  assert.equal(readFileSync(join(p.base, '.gitignore'), 'utf8').trim(), 'current/');
  assert.equal(JSON.parse(readFileSync(p.config, 'utf8')).locale, 'ru');
});

test('status: every change starts as new, with the page path from the config', () => {
  const { root } = project();
  const [screen] = computeStatus(root).screens;
  assert.deepEqual(screen.changes.map((c) => `${c.type}:${c.id}:${c.status}`).sort(), [
    'added:button-sravnit:new',
    'moved:button-vyyti:new',
    'removed:link-podpiski:new',
  ]);
  assert.ok(screen.changes.every((c) => c.path === '/'));
});

test('describe writes a template that builds into a manifest entry', () => {
  const { root, p } = project();
  const file = writeDescription(root, findChange(computeStatus(root), 'button-vyyti'));
  const md = readFileSync(file, 'utf8');
  assert.match(md, /^---\nid: button-vyyti\ntype: moved\npath: \//);
  assert.match(md, /# «Выйти» теперь здесь/);
  assert.throws(() => writeDescription(root, findChange(computeStatus(root), 'button-vyyti')), /already exists/);

  addIgnored(root, 'link-podpiski');
  const statuses = Object.fromEntries(computeStatus(root).screens[0].changes.map((c) => [c.id, c.status]));
  assert.deepEqual(statuses, { 'button-sravnit': 'new', 'button-vyyti': 'described', 'link-podpiski': 'ignored' });

  const { manifest } = buildManifest(root, join(p.base, 'out.json'));
  assert.equal(manifest.changes.length, 1);
  const [change] = manifest.changes;
  assert.equal(change.id, 'button-vyyti');
  assert.deepEqual(change.locators, ['role=button[name="Выйти"]']);
  assert.equal(change.from.viewportWidth, 1280);
  assert.deepEqual(change.from.landmarks, ['banner']);
});

test('accept promotes current/ to the baseline', () => {
  const { root, p } = project();
  assert.equal(accept(root), 1);
  assert.ok(!existsSync(p.current));
  const status = computeStatus(root);
  assert.equal(status.hasCurrent, false);
  const baseline = JSON.parse(readFileSync(join(p.baseline, 'home@1280.json'), 'utf8'));
  assert.ok(baseline.elements.some((e) => e.name === 'Сравнить'));
});
