import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDescription, renderMarkdown } from '../src/markdown.js';
import { compileManifest } from '../src/manifest.js';

test('frontmatter, title and slides', () => {
  const { meta, title, slides, warnings } = parseDescription([
    '---',
    'id: cart',
    'type: moved',
    'locators: ["[data-testid=\\"cart\\"]"]',
    'from: {"x": 1, "y": 2, "w": 3, "h": 4}',
    '---',
    '',
    '# Корзина теперь в шапке',
    '',
    'Первый слайд.',
    '',
    '---',
    '',
    'Второй слайд.',
  ].join('\n'));
  assert.equal(meta.type, 'moved');
  assert.deepEqual(meta.locators, ['[data-testid="cart"]']);
  assert.deepEqual(meta.from, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(title, 'Корзина теперь в шапке');
  assert.deepEqual(slides, ['<p>Первый слайд.</p>', '<p>Второй слайд.</p>']);
  assert.deepEqual(warnings, []);
});

test('Windows line endings and HTML comments are handled', () => {
  const { title, slides } = parseDescription('---\r\nid: a\r\n---\r\n\r\n# T\r\n\r\nText\r\n\r\n<!-- hint -->\r\n');
  assert.equal(title, 'T');
  assert.deepEqual(slides, ['<p>Text</p>']);
});

test('raw HTML is escaped, never passed through', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> **bold**');
  assert.equal(html, '<p>&lt;img src=x onerror=alert(1)&gt; <strong>bold</strong></p>');
});

test('javascript: links are dropped, safe ones kept', () => {
  const warnings = [];
  assert.equal(renderMarkdown('[x](javascript:alert(1))', warnings), '<p>x</p>');
  assert.equal(warnings.length, 1);
  assert.equal(
    renderMarkdown('[help](/help)'),
    '<p><a href="/help" target="_blank" rel="noopener">help</a></p>',
  );
});

test('lists, headings, images, code', () => {
  assert.equal(renderMarkdown('- a\n- *b*'), '<ul><li>a</li><li><em>b</em></li></ul>');
  assert.equal(renderMarkdown('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
  assert.equal(renderMarkdown('## Steps'), '<h3>Steps</h3>');
  assert.equal(renderMarkdown('![Cart](/img/cart.png)'), '<figure><img src="/img/cart.png" alt="Cart"></figure>');
  assert.equal(renderMarkdown('Run `a <b>`'), '<p>Run <code>a &lt;b&gt;</code></p>');
});

test('auto: screenshots are skipped with a warning (not implemented yet)', () => {
  const warnings = [];
  assert.equal(renderMarkdown('![](auto:before-after)', warnings), '');
  assert.match(warnings[0], /not implemented/);
});

test('manifest merges locales and sorts by priority', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uic-'));
  writeFileSync(join(dir, 'b.md'), '---\ntype: added\nlocators: ["#b"]\n---\n\n# Новое\n\nТекст');
  writeFileSync(join(dir, 'b.en.md'), '# New\n\nText');
  writeFileSync(join(dir, 'a.md'), '---\ntype: removed\npriority: low\nlocators: []\n---\n\n# Убрано');
  writeFileSync(join(dir, 'c.md'), '---\ntype: moved\npriority: high\nlocators: ["#c"]\n---\n\n# Переехало');
  const { manifest, warnings } = compileManifest(dir);
  assert.deepEqual(manifest.changes.map((c) => c.id), ['c', 'b', 'a']);
  const b = manifest.changes.find((c) => c.id === 'b');
  assert.equal(b.type, 'added');
  assert.equal(b.content.default.title, 'Новое');
  assert.equal(b.content.en.title, 'New');
  assert.deepEqual(warnings, []);
});
