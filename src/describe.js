// Node-only: writes a description template for a change or a block.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, loadConfig } from './project.js';

const TEXT = {
  en: {
    added: (c) => [`New: ${q(c.after.name)}`, 'What it does and why it is useful. One or two sentences.'],
    moved: (c) => [`${q(c.after.name)} is here now`, `It used to be in a different place. Describe where it was and why it moved.`],
    renamed: (c) => [`${q(c.before.name)} is now ${q(c.after.name)}`, 'Same feature, new name. Say what changed, if anything.'],
    removed: (c) => [`${q(c.before.name)} is gone`, 'Tell users where to find this now, or what replaces it.'],
    block: (b) => [`Section ${q(b.title)} has moved`, 'Describe what users will find here now.'],
  },
  ru: {
    added: (c) => [`Новое: ${q(c.after.name, 'ru')}`, 'Что это и зачем нужно. Одно-два предложения.'],
    moved: (c) => [`${q(c.after.name, 'ru')} теперь здесь`, 'Раньше элемент был в другом месте. Напишите, где он был и почему переехал.'],
    renamed: (c) => [`${q(c.before.name, 'ru')} теперь называется ${q(c.after.name, 'ru')}`, 'Та же функция, новое название. Напишите, что изменилось, если что-то изменилось.'],
    removed: (c) => [`${q(c.before.name, 'ru')} больше нет`, 'Подскажите, где теперь найти эту функцию или что её заменило.'],
    block: (b) => [`Раздел ${q(b.title, 'ru')} переехал`, 'Опишите, что пользователь найдёт здесь теперь.'],
  },
};

function q(s, locale = 'en') {
  return locale === 'ru' ? `«${s}»` : `“${s}”`;
}

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
}

/** Frontmatter and suggested text for a change or a block. */
export function template(root, found) {
  const config = loadConfig(root);
  const T = TEXT[config.locale] || TEXT.en;

  if (found.block) {
    const { block, members } = found;
    const anchorEl = (members.find((m) => m.after.role === 'heading') || members[0]);
    const meta = {
      id: block.id,
      type: 'moved',
      path: anchorEl.path,
      priority: 'normal',
      locators: anchorEl.after.locators,
      from: { ...union(members.map((m) => m.before.box)), landmarks: anchorEl.before.landmarks, viewportWidth: anchorEl.viewportWidth },
    };
    const [title, body] = T.block(block);
    return { meta, title, body };
  }

  const c = found.change;
  const meta = {
    id: c.id,
    type: c.type,
    path: c.path,
    priority: 'normal',
    locators: c.after ? c.after.locators : [],
  };
  if (c.type === 'moved' && c.before) {
    meta.from = { ...c.before.box, landmarks: c.before.landmarks, viewportWidth: c.viewportWidth };
  }
  const [title, body] = T[c.type](c);
  return { meta, title, body };
}

const fileOf = (root, id) => join(paths(root).changes, `${id}.md`);
const frontmatter = (meta) => Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');

/**
 * Writes a description template for a change or a block (the CLI `describe`).
 *
 * @param {string} root project root
 * @param {{ change?: object, block?: object, members?: object[] }} found from findChange()
 * @returns {string} path of the written file
 */
export function writeDescription(root, found, { force = false } = {}) {
  const config = loadConfig(root);
  const { meta, title, body } = template(root, found);
  const file = fileOf(root, meta.id);
  if (existsSync(file) && !force) throw new Error(`${file} already exists. Edit it, or pass --force to overwrite.`);

  const hint = config.locale === 'ru'
    ? '<!-- Слайды разделяются строкой ---. Картинки: ![подпись](/images/new-cart.png) -->'
    : '<!-- Separate slides with a line of ---. Images: ![caption](/images/new-cart.png) -->';
  writeFileSync(file, `---\n${frontmatter(meta)}\n---\n\n# ${title}\n\n${body}\n\n${hint}\n`);
  return file;
}

/**
 * The editable parts of an existing description: title, body (everything
 * after the title, slides included) and priority. Null if there is none.
 */
export function readDescription(root, id) {
  const file = fileOf(root, id);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const rest = (fm ? text.slice(fm[0].length) : text).replace(/<!--[\s\S]*?-->/g, '').trim();
  const h1 = /^#[ \t]+(.+)\n?/.exec(rest);
  const priority = fm && /^priority:\s*(\w+)/m.exec(fm[1]);
  return {
    title: h1 ? h1[1].trim() : '',
    body: (h1 ? rest.slice(h1[0].length) : rest).trim(),
    priority: priority ? priority[1] : 'normal',
  };
}

/**
 * Creates or updates a description from the review panel. The frontmatter
 * of an existing file is kept (only `priority` changes), so locators and
 * old coordinates recorded at the time of the change survive edits.
 */
export function saveDescription(root, found, { title, body, priority = 'normal' }) {
  if (!title || !title.trim()) throw new Error('A title is required.');
  if (!['high', 'normal', 'low'].includes(priority)) throw new Error(`Unknown priority "${priority}".`);
  const id = found.block ? found.block.id : found.change.id;
  const file = fileOf(root, id);
  let front;
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    front = fm ? fm[1] : frontmatter(template(root, found).meta);
    front = /^priority:/m.test(front) ? front.replace(/^priority:.*$/m, `priority: ${priority}`) : `${front}\npriority: ${priority}`;
  } else {
    front = frontmatter({ ...template(root, found).meta, priority });
  }
  const clean = (s) => s.replace(/\r\n?/g, '\n').trim();
  writeFileSync(file, `---\n${front}\n---\n\n# ${clean(title)}\n\n${clean(body || '')}\n`);
  return file;
}
