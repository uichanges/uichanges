const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const cyan = paint(36);
const dim = paint(2);
const bold = paint(1);

/** Colour helpers shared with the other CLI commands. */
export const paintAll = { green, red, yellow, cyan, dim, bold };

const SIGN = { added: green('+ added  '), removed: red('- removed'), moved: cyan('→ moved  '), renamed: yellow('~ renamed') };

const where = (landmarks) => (landmarks.length ? landmarks.join(' › ') : 'page');
const label = (el) => `${el.role} "${el.name}"`;

function movedWhere(c) {
  const from = where(c.before.landmarks);
  const to = where(c.after.landmarks);
  return from === to ? `within ${to}, ${c.distance}px` : `${from} → ${to}`;
}

function describe(c, inBlock) {
  if (c.type === 'added') return `${label(c.after)}  ${dim('in ' + where(c.after.landmarks))}`;
  if (c.type === 'removed') return `${label(c.before)}  ${dim('from ' + where(c.before.landmarks))}`;
  let text = c.kinds.includes('renamed')
    ? `${c.before.role} "${c.before.name}" → "${c.after.name}"`
    : label(c.after);
  // Inside a block the move is already stated on the block line.
  if (c.kinds.includes('moved') && !inBlock) text += dim(`  ${movedWhere(c)}`);
  if (c.kinds.length > 1) text += dim(`  [${c.kinds.join(' + ')}]`);
  return text;
}

const flag = (c) => (c.confidence === 'low' ? yellow('  ? check: low confidence match') : '');

/** Human-readable diff for the terminal. */
export function formatDiff(result) {
  const lines = [bold(`uichanges diff  ${result.screen} @ ${result.viewport.width}px`), ''];

  if (result.changes.length === 0) lines.push(dim('  No UI changes.'));

  const printedBlocks = new Set();
  for (const c of result.changes) {
    if (c.block) {
      if (printedBlocks.has(c.block.id)) continue;
      printedBlocks.add(c.block.id);
      const members = result.changes
        .filter((m) => m.block && m.block.id === c.block.id)
        .sort((p, q) => p.before.box.y - q.before.box.y || p.before.box.x - q.before.box.x);
      lines.push(`  ${SIGN.moved}  block "${c.block.title}" (${c.block.size} elements)  ${dim(movedWhere(members[0]))}`);
      lines.push(dim(`             id: ${c.block.id}`));
      for (const m of members) {
        lines.push(`               ${dim('·')} ${describe(m, true)}${flag(m)}`);
        lines.push(dim(`                 id: ${m.id}`));
      }
      continue;
    }
    lines.push(`  ${SIGN[c.type]}  ${describe(c, false)}${flag(c)}`);
    lines.push(dim(`             id: ${c.id}`));
  }

  const { stats } = result;
  lines.push('');
  lines.push(dim(`${result.changes.length} change(s) · ${stats.unchanged} unchanged · ${stats.before} → ${stats.after} elements`));
  return lines.join('\n');
}
