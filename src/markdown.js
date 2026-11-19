// Description files → manifest entries. Pure functions, no I/O.
//
// A description is Markdown with a frontmatter block. Slides are separated by
// a line containing only `---`. Raw HTML is never passed through: every bit of
// text is escaped, and only a small safe subset of Markdown becomes tags.

/**
 * @param {string} source contents of changes/<id>[.<locale>].md
 * @returns {{ meta: object, title: string, slides: string[], warnings: string[] }}
 */
export function parseDescription(source) {
  const text = source.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const warnings = [];
  let meta = {};
  let rest = text;

  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    meta = parseFrontmatter(fm[1], warnings);
    rest = text.slice(fm[0].length);
  }

  const slidesSrc = rest.split(/\n[ \t]*---[ \t]*\n/).map((s) => s.trim()).filter(Boolean);
  let title = '';
  const slides = slidesSrc.map((src, i) => {
    let s = src;
    if (i === 0) {
      const h1 = /^#[ \t]+(.+)\n?/.exec(s);
      if (h1) { title = h1[1].trim(); s = s.slice(h1[0].length).trim(); }
    }
    return renderMarkdown(s, warnings);
  }).filter((html) => html.length > 0);

  if (!title) warnings.push('no title: start the first slide with "# Title"');
  return { meta, title, slides, warnings };
}

/** `key: value` lines; values that look like JSON ({…}, […], numbers, true/false) are parsed as JSON. */
function parseFrontmatter(src, warnings) {
  const meta = {};
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) { warnings.push(`frontmatter: cannot read "${line}"`); continue; }
    const [, key, raw] = m;
    let value = raw.trim();
    if (/^[[{"]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(value)) {
      try { value = JSON.parse(value); } catch { warnings.push(`frontmatter: "${key}" is not valid JSON`); }
    }
    meta[key] = value;
  }
  return meta;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeUrl(url, { image = false } = {}) {
  const u = url.trim();
  if (/^(https?:|mailto:|\/|\.\/|\.\.\/|#)/i.test(u)) return u;
  if (image && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; // relative path like images/a.png
  return null;
}

function inline(src, warnings) {
  // Pull code spans out first so nothing inside them is formatted.
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, alt, url) => {
    const raw = url.replace(/&amp;/g, '&');
    if (raw.startsWith('auto:')) { warnings.push(`image "${raw}": automatic screenshots are not implemented yet, image skipped`); return ''; }
    const safe = safeUrl(raw, { image: true });
    if (!safe) { warnings.push(`image "${raw}": unsupported URL, skipped`); return ''; }
    return `<img src="${escapeHtml(safe)}" alt="${alt}">`;
  });
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, label, url) => {
    const safe = safeUrl(url.replace(/&amp;/g, '&'));
    if (!safe) { warnings.push(`link "${url}": unsupported URL, kept as text`); return label; }
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return s;
}

/** Headings (##, ###), paragraphs, bullet and numbered lists, images, links, **bold**, *italic*, `code`. */
export function renderMarkdown(src, warnings = []) {
  const out = [];
  const blocks = src.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    const h = /^(#{1,3})[ \t]+(.+)$/.exec(block);
    if (h && lines.length === 1) {
      const level = Math.min(h[1].length + 1, 4); // slide title is the h2 level
      out.push(`<h${level}>${inline(h[2], warnings)}</h${level}>`);
    } else if (lines.every((l) => /^[-*][ \t]+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*][ \t]+/, ''), warnings)}</li>`).join('')}</ul>`);
    } else if (lines.every((l) => /^\d+\.[ \t]+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.[ \t]+/, ''), warnings)}</li>`).join('')}</ol>`);
    } else {
      const html = inline(lines.join(' '), warnings).trim();
      if (html) out.push(/^<img [^>]+>$/.test(html) ? `<figure>${html}</figure>` : `<p>${html}</p>`);
    }
  }
  return out.join('');
}
