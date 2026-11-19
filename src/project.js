// Node-only: everything about the .uichanges/ folder of a project.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { diffSnapshots } from './diff.js';

export const DIR = '.uichanges';

export const DEFAULT_CONFIG = {
  // Pages to snapshot. `name` becomes the file name, `url` is opened in the browser.
  screens: [{ name: 'home', url: 'http://localhost:3000/' }],
  // Each screen is captured once per width; widths are never compared with each other.
  widths: [1280],
  // Playwright session file for pages behind a login (see README).
  storageState: null,
  // CSS selectors whose subtrees are never snapshotted (user data, ads, A/B blocks).
  ignore: [],
  // Elements whose text is user data or state, by CSS path. Filled by the
  // "This is user data" button in review mode; data-uichanges-dynamic in
  // the markup does the same without a config entry.
  dynamic: [],
  // Language of generated description templates.
  locale: 'en',
  // Where `build` writes the manifest the browser SDK loads.
  manifest: '.uichanges/uichanges.json',
};

/** Walks up from `cwd` to the folder that holds .uichanges/. */
export function findRoot(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, DIR, 'config.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function paths(root) {
  const base = join(root, DIR);
  return {
    base,
    config: join(base, 'config.json'),
    baseline: join(base, 'snapshots'),
    current: join(base, 'current'),
    changes: join(base, 'changes'),
    ignored: join(base, 'ignored.json'),
  };
}

export function requireRoot(cwd) {
  const root = findRoot(cwd);
  if (!root) throw new Error('No .uichanges/ folder here or above. Run `uichanges init` first.');
  return root;
}

export function loadConfig(root) {
  const raw = JSON.parse(readFileSync(paths(root).config, 'utf8'));
  return { ...DEFAULT_CONFIG, ...raw };
}

export function init(root, { locale } = {}) {
  const p = paths(root);
  if (existsSync(p.config)) throw new Error(`${p.config} already exists.`);
  for (const dir of [p.baseline, p.changes]) mkdirSync(dir, { recursive: true });
  const config = { ...DEFAULT_CONFIG, locale: locale || guessLocale() };
  writeFileSync(p.config, JSON.stringify(config, null, 2) + '\n');
  writeFileSync(join(p.base, '.gitignore'), 'current/\n');
  writeFileSync(p.ignored, '[]\n');
  return p;
}

function guessLocale() {
  const lang = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  return lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export const snapshotFile = (screen, width) => `${screen}@${width}.json`;

export function readSnapshots(dir) {
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    map.set(file, JSON.parse(readFileSync(join(dir, file), 'utf8')));
  }
  return map;
}

export function writeSnapshot(dir, file, snapshot) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(snapshot, null, 2) + '\n');
}

/** Ids that have a description file (any locale: id.md, id.en.md…). */
export function describedIds(root) {
  const dir = paths(root).changes;
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.split('.')[0]));
}

export function ignoredIds(root) {
  const file = paths(root).ignored;
  return new Set(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
}

export function addDynamic(root, cssPath) {
  const p = paths(root);
  const raw = JSON.parse(readFileSync(p.config, 'utf8'));
  const list = new Set(raw.dynamic || []);
  list.add(cssPath);
  raw.dynamic = [...list].sort();
  writeFileSync(p.config, JSON.stringify(raw, null, 2) + '\n');
}

export function addIgnored(root, id) {
  const ids = ignoredIds(root);
  ids.add(id);
  writeFileSync(paths(root).ignored, JSON.stringify([...ids].sort(), null, 2) + '\n');
}

/**
 * Diffs every current snapshot against its baseline and marks each change
 * as described, ignored or new. A described or ignored block covers its members.
 */
export function computeStatus(root) {
  const p = paths(root);
  const baseline = readSnapshots(p.baseline);
  const current = readSnapshots(p.current);
  const described = describedIds(root);
  const ignored = ignoredIds(root);
  const config = loadConfig(root);

  const statusOf = (c) => {
    const ids = [c.id, c.block && c.block.id].filter(Boolean);
    if (ids.some((id) => described.has(id))) return 'described';
    if (ids.some((id) => ignored.has(id))) return 'ignored';
    return 'new';
  };

  const screens = [];
  for (const [file, after] of current) {
    const before = baseline.get(file);
    if (!before) { screens.push({ file, missingBaseline: true, changes: [] }); continue; }
    const result = diffSnapshots(before, after, { dynamic: config.dynamic || [] });
    const screenName = file.replace(/@\d+\.json$/, '');
    const screenCfg = (config.screens || []).find((s) => s.name === screenName);
    for (const c of result.changes) {
      c.status = statusOf(c);
      c.screen = screenName;
      c.path = screenCfg ? (screenCfg.path || safePath(screenCfg.url)) : after.screen;
      c.viewportWidth = after.viewport.width;
    }
    screens.push({ file, result, changes: result.changes });
  }
  return { screens, hasCurrent: current.size > 0 };
}

function safePath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

/** Finds a change (or a block) by id across all screens. */
export function findChange(status, id) {
  for (const s of status.screens) {
    const members = s.changes.filter((c) => c.block && c.block.id === id);
    if (members.length) return { block: members[0].block, members };
    const c = s.changes.find((ch) => ch.id === id);
    if (c) return { change: c };
  }
  return null;
}

/** current/ becomes the new baseline. */
export function accept(root) {
  const p = paths(root);
  const current = readSnapshots(p.current);
  for (const [file] of current) copyFileSync(join(p.current, file), join(p.baseline, file));
  rmSync(p.current, { recursive: true, force: true });
  return current.size;
}
