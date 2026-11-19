// Node-only: compiles .uichanges/changes/*.md into the manifest the browser SDK loads.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseDescription } from './markdown.js';
import { paths, loadConfig } from './project.js';

const PRIORITY = { high: 0, normal: 1, low: 2 };

/**
 * @param {string} changesDir folder with <id>.md and <id>.<locale>.md files
 * @returns {{ manifest: object, warnings: string[] }}
 */
export function compileManifest(changesDir) {
  const warnings = [];
  const byId = new Map();
  const files = existsSync(changesDir) ? readdirSync(changesDir).filter((f) => f.endsWith('.md')).sort() : [];

  for (const file of files) {
    const parts = file.slice(0, -3).split('.');
    const id = parts[0];
    const locale = parts[1] || 'default';
    const parsed = parseDescription(readFileSync(join(changesDir, file), 'utf8'));
    for (const w of parsed.warnings) warnings.push(`${file}: ${w}`);
    if (!byId.has(id)) byId.set(id, { meta: null, content: {} });
    const entry = byId.get(id);
    if (locale === 'default' || !entry.meta) entry.meta = { ...entry.meta, ...parsed.meta };
    entry.content[locale] = { title: parsed.title, slides: parsed.slides };
  }

  const changes = [];
  for (const [id, { meta, content }] of byId) {
    if (meta.id && meta.id !== id) warnings.push(`${id}.md: frontmatter id "${meta.id}" differs from the file name; the file name wins`);
    const locators = Array.isArray(meta.locators) ? meta.locators : [];
    if (!locators.length && meta.type !== 'removed') {
      warnings.push(`${id}.md: no locators, the hint will show as a card in the corner`);
    }
    changes.push({
      id,
      type: meta.type || 'changed',
      path: meta.path || null,
      priority: meta.priority in PRIORITY ? meta.priority : 'normal',
      locators,
      ...(meta.from ? { from: meta.from } : {}),
      content,
    });
  }
  changes.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.id.localeCompare(b.id));

  return { manifest: { version: 1, changes }, warnings };
}

export function buildManifest(root, out) {
  const config = loadConfig(root);
  const target = resolve(root, out || config.manifest);
  const { manifest, warnings } = compileManifest(paths(root).changes);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  return { target, manifest, warnings };
}
