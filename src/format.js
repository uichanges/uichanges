const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const cyan = paint(36);
const dim = paint(2);
const bold = paint(1);

const SIGN = { added: green('+ added  '), removed: red('- removed'), moved: cyan('→ moved  '), renamed: yellow('~ renamed') };

const where = (landmarks) => (landmarks.length ? landmarks.join(' › ') : 'page');
const label = (el) => `${el.role} "${el.name}"`;

/** Human-readable diff for the terminal. */
export function formatDiff(result) {
  const lines = [bold(`uichanges diff  ${result.screen} @ ${result.viewport.width}px`), ''];

  if (result.changes.length === 0) {
    lines.push(dim('  No UI changes.'));
  }

  for (const c of result.changes) {
    let text;
    if (c.type === 'added') {
      text = `${label(c.after)}  ${dim('in ' + where(c.after.landmarks))}`;
    } else if (c.type === 'removed') {
      text = `${label(c.before)}  ${dim('from ' + where(c.before.landmarks))}`;
    } else {
      text = c.kinds.includes('renamed')
        ? `${c.before.role} "${c.before.name}" → "${c.after.name}"`
        : label(c.after);
      if (c.kinds.includes('moved')) {
        const from = where(c.before.landmarks);
        const to = where(c.after.landmarks);
        text += dim(from === to ? `  within ${to}, ${c.distance}px` : `  ${from} → ${to}`);
      }
      if (c.kinds.length > 1) text += dim(`  [${c.kinds.join(' + ')}]`);
    }
    const flag = c.confidence === 'low' ? yellow('  ? check: low confidence match') : '';
    lines.push(`  ${SIGN[c.type]}  ${text}${flag}`);
    lines.push(dim(`             id: ${c.id}`));
  }

  const { stats } = result;
  lines.push('');
  lines.push(dim(`${result.changes.length} change(s) · ${stats.unchanged} unchanged · ${stats.before} → ${stats.after} elements`));
  return lines.join('\n');
}
