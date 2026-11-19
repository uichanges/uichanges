// Node-only: the project workflow commands behind the CLI.
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  init, requireRoot, loadConfig, paths, snapshotFile, writeSnapshot,
  computeStatus, findChange, addIgnored, accept,
} from './project.js';
import { writeDescription } from './describe.js';
import { buildManifest } from './manifest.js';
import { paintAll as paint } from './format.js';

const out = (s = '') => process.stdout.write(s + '\n');
const { green, red, yellow, cyan, dim, bold } = paint;
const rel = (root, p) => relative(process.cwd(), p) || p;

export function cmdInit(args) {
  const root = resolve(process.cwd());
  const p = init(root, { locale: args.locale });
  out(`${green('Created')} ${rel(root, p.base)}/`);
  out('');
  out('Next:');
  out(`  1. List your pages in ${rel(root, p.config)} ("screens": name + url).`);
  out('  2. Start your app and run `uichanges capture` to record the baseline.');
  out('  3. Commit .uichanges/ to git.');
}

/**
 * Snapshots every screen from the config. A screen without a baseline gets
 * one; the others go to current/ for comparison. Used by `capture` and by
 * the review panel's "Update snapshots" button.
 *
 * @param {string} root
 * @param {{ storageState?: string, width?: number, ignore?: string[], waitFor?: string, delay?: number }} [args]
 * @param {(line: { file: string, isNew: boolean, elements: number }) => void} [onScreen]
 */
export async function captureAll(root, args = {}, onScreen = () => {}) {
  const config = loadConfig(root);
  const p = paths(root);
  const { openBrowser, capturePage } = await import('./snapshot.js');
  const storageState = args.storageState || (config.storageState && resolve(root, config.storageState));
  const widths = args.width ? [args.width] : config.widths;

  const browser = await openBrowser();
  let created = 0;
  let captured = 0;
  try {
    for (const screen of config.screens) {
      for (const width of widths) {
        const file = snapshotFile(screen.name, width);
        const snapshot = await capturePage(browser, screen.url, {
          width,
          screen: screen.name,
          ignore: [...(config.ignore || []), ...(screen.ignore || []), ...(args.ignore || [])],
          storageState,
          waitFor: screen.waitFor || args.waitFor,
          delay: screen.delay || args.delay,
        });
        const isNew = !existsSync(join(p.baseline, file));
        writeSnapshot(isNew ? p.baseline : p.current, file, snapshot);
        if (isNew) created++; else captured++;
        onScreen({ file, isNew, elements: snapshot.elements.length });
      }
    }
  } finally {
    await browser.close();
  }
  return { created, captured };
}

export async function cmdCapture(args) {
  const root = requireRoot();
  const { created, captured } = await captureAll(root, args, ({ file, isNew, elements }) => {
    out(`  ${isNew ? green('baseline') : cyan('captured')}  ${file}  ${dim(`${elements} elements`)}`);
  });
  out('');
  if (created) out(`${created} baseline snapshot(s) created. Commit them; next captures will be compared to them.`);
  if (captured) out('Run `uichanges status` to see what changed.');
}

const SIGN = { added: green('+'), removed: red('-'), moved: cyan('→'), renamed: yellow('~') };
const STATE_W = 'needs description'.length;
const STATE = {
  new: red('needs description'),
  described: green('described'.padEnd(STATE_W)),
  ignored: dim('ignored'.padEnd(STATE_W)),
};

function label(c) {
  if (c.type === 'added') return `${c.after.role} "${c.after.name}"`;
  if (c.type === 'removed') return `${c.before.role} "${c.before.name}"`;
  if (c.kinds.includes('renamed')) return `${c.before.role} "${c.before.name}" → "${c.after.name}"`;
  return `${c.after.role} "${c.after.name}"`;
}

/** One row per change; a block counts as one row. */
function rows(screen) {
  const result = [];
  const seenBlocks = new Set();
  for (const c of screen.changes) {
    if (c.block) {
      if (seenBlocks.has(c.block.id)) continue;
      seenBlocks.add(c.block.id);
      result.push({ id: c.block.id, status: c.status, sign: SIGN.moved, text: `block "${c.block.title}" (${c.block.size} elements)`, low: false });
    } else {
      result.push({ id: c.id, status: c.status, sign: SIGN[c.type], text: label(c), low: c.confidence === 'low' });
    }
  }
  return result;
}

export function cmdStatus({ quietIfClean = false } = {}) {
  const root = requireRoot();
  const status = computeStatus(root);
  if (!status.hasCurrent) {
    out('Nothing captured yet. Run `uichanges capture` after changing your UI.');
    return { pending: 0 };
  }
  let pending = 0;
  out(bold('uichanges status'));
  for (const s of status.screens) {
    out('');
    out(`  ${bold(s.file.replace(/\.json$/, ''))}`);
    if (s.missingBaseline) { out(dim('    no baseline for this screen')); continue; }
    const list = rows(s);
    if (!list.length) { out(dim('    no changes')); continue; }
    const width = Math.max(...list.map((r) => r.text.length));
    for (const r of list) {
      if (r.status === 'new') pending++;
      const flag = r.low ? yellow('  ? check match') : '';
      out(`    ${r.sign} ${r.text.padEnd(width)}  ${STATE[r.status]}  ${dim(r.id)}${flag}`);
    }
  }
  out('');
  if (pending) {
    out(`${pending} change(s) need a description:`);
    out(`  uichanges describe <id>   ${dim('write a hint for users')}`);
    out(`  uichanges ignore <id>     ${dim('not worth showing')}`);
  } else if (!quietIfClean) {
    out(green('All changes are described or ignored.') + ' Run `uichanges accept` to make this the new baseline.');
  }
  return { pending };
}

export function cmdDescribe(args) {
  const root = requireRoot();
  const id = args._[0];
  if (!id) throw new Error('describe needs a change id. See `uichanges status`.');
  const found = findChange(computeStatus(root), id);
  if (!found) throw new Error(`No change "${id}" in the current snapshots. See \`uichanges status\`.`);
  const file = writeDescription(root, found, { force: args.force });
  out(`${green('Created')} ${rel(root, file)}`);
  out('Edit the title and text, then run `uichanges build`.');
}

export function cmdIgnore(args) {
  const root = requireRoot();
  const id = args._[0];
  if (!id) throw new Error('ignore needs a change id. See `uichanges status`.');
  if (!findChange(computeStatus(root), id)) throw new Error(`No change "${id}" in the current snapshots.`);
  addIgnored(root, id);
  out(`${dim('Ignored')} ${id}`);
}

export function cmdAccept() {
  const root = requireRoot();
  const { pending } = cmdStatus({ quietIfClean: true });
  const n = accept(root);
  out('');
  out(`${green('Accepted')} ${n} snapshot(s) as the new baseline.`);
  if (pending) out(yellow(`${pending} change(s) were accepted without a description.`));
}

export function cmdCheck() {
  const { pending } = cmdStatus({ quietIfClean: true });
  if (pending) process.exitCode = 1;
}

export function cmdBuild(args) {
  const root = requireRoot();
  const { target, manifest, warnings } = buildManifest(root, args.out);
  for (const w of warnings) process.stderr.write(`${yellow('warning')} ${w}\n`);
  out(`${green('Built')} ${rel(root, target)}  ${dim(`${manifest.changes.length} change(s)`)}`);
}

export async function cmdReview(args) {
  const root = requireRoot();
  const config = loadConfig(root);
  const { startReviewServer, reviewLink } = await import('./review-server.js');
  const { port, token } = await startReviewServer(root, {
    port: args.port,
    log: (s) => out(dim(`  ${new Date().toLocaleTimeString()}  ${s}`)),
  });
  out(bold('uichanges review'));
  out('');
  out('Open your site with one of these links (the app must be running):');
  for (const screen of config.screens) {
    if (!/^https?:/.test(screen.url)) continue;
    out(`  ${screen.name.padEnd(12)} ${cyan(reviewLink(screen.url, port, token))}`);
  }
  out('');
  out(`Changed elements are highlighted; describe them in the panel on the right.`);
  out(dim(`Descriptions are saved to .uichanges/changes/ and the manifest is rebuilt on every save.`));
  out(dim('Press Ctrl+C to stop.'));
}
