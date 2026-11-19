/**
 * Captures a snapshot of the visible, meaningful UI of the current page.
 *
 * Runs in the browser. The function is fully self-contained (no imports, no
 * outer references) so it can be passed to Playwright's `page.evaluate`
 * or bundled into a dev-mode script as is.
 *
 * @param {object} [options]
 * @param {string} [options.screen]   Screen name, defaults to location.pathname.
 * @param {string[]} [options.ignore] Extra CSS selectors whose subtrees are skipped.
 * @returns {import('./types.js').Snapshot}
 */
export function captureSnapshot(options = {}) {
  const ELEMENT_SELECTOR = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=checkbox]',
    '[role=switch]', '[role=radio]', '[role=combobox]', '[role=textbox]', '[role=searchbox]',
    '[role=option]', '[role=heading]', '[role=slider]',
    '[data-uichanges]',
  ].join(',');

  const SECTIONING = 'article, aside, main, nav, section';
  const ignoreSelectors = ['[data-uichanges-ignore]', ...(options.ignore || [])];

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function roleOf(el) {
    const explicit = clean(el.getAttribute('role')).split(' ')[0];
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return el.hasAttribute('href') ? 'link' : null;
      case 'button': case 'summary': return 'button';
      case 'select': return el.multiple ? 'listbox' : 'combobox';
      case 'textarea': return 'textbox';
      case 'input': {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'range') return 'slider';
        if (type === 'search') return 'searchbox';
        return 'textbox';
      }
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'header': return el.parentElement && el.parentElement.closest(SECTIONING) ? null : 'banner';
      case 'footer': return el.parentElement && el.parentElement.closest(SECTIONING) ? null : 'contentinfo';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'aside': return 'complementary';
      case 'dialog': return 'dialog';
      case 'form': return ariaName(el) ? 'form' : null;
      case 'section': return ariaName(el) ? 'region' : null;
      default: return null;
    }
  }

  // Name from aria-label / aria-labelledby only (used for landmarks, where
  // text content would be the whole region).
  function ariaName(el) {
    const ids = clean(el.getAttribute('aria-labelledby'));
    if (ids) {
      const text = ids.split(' ')
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => clean(n.textContent))
        .join(' ');
      if (text) return text;
    }
    return clean(el.getAttribute('aria-label'));
  }

  // textContent glues "не указана" + "изменить" when they are separate
  // elements. Put a space at every element boundary; skip hidden parts and
  // aria-hidden icons (icon fonts would otherwise leak names like "arrow_forward").
  function visibleText(node) {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.getAttribute('aria-hidden') === 'true') continue;
        if (getComputedStyle(child).display === 'none') continue;
        out += ` ${visibleText(child)} `;
      }
    }
    return out;
  }

  function nameOf(el) {
    const fromAria = ariaName(el);
    if (fromAria) return cut(fromAria);
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type) && el.value) return cut(clean(el.value));
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && clean(label.textContent)) return cut(clean(label.textContent));
      }
      const wrap = el.closest('label');
      if (wrap && clean(wrap.textContent)) return cut(clean(wrap.textContent));
      const ph = clean(el.getAttribute('placeholder'));
      if (ph) return cut(ph);
    }
    const text = clean(visibleText(el));
    if (text) return cut(text);
    const img = el.querySelector('img[alt]');
    if (img && clean(img.getAttribute('alt'))) return cut(clean(img.getAttribute('alt')));
    return cut(clean(el.getAttribute('title')));
  }

  function landmarksOf(el) {
    const path = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const role = roleOf(node);
      if (['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'form', 'dialog', 'search'].includes(role)) {
        const name = ariaName(node);
        path.unshift(name ? `${role}:${name}` : role);
      }
    }
    return path;
  }

  function isVisible(el, rect) {
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    for (let node = el; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity === '0') return false;
    }
    return true;
  }

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter((c) => c.tagName === node.tagName)
        : [];
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    }
    return parts.join(' > ');
  }

  const elements = [];
  for (const el of document.querySelectorAll(ELEMENT_SELECTOR)) {
    if (ignoreSelectors.some((sel) => el.closest(sel))) continue;
    const role = roleOf(el);
    if (!role) continue;
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;

    const anchor = el.getAttribute('data-uichanges') || null;
    // Text that shows user data or state ("Группа: не указана"): a change of
    // its text is not a change of the interface.
    const dynamic = Boolean(el.closest('[data-uichanges-dynamic]'));
    const testid = el.getAttribute('data-testid') || null;
    const name = nameOf(el);
    const locators = [];
    if (anchor) locators.push(`[data-uichanges="${anchor}"]`);
    if (testid) locators.push(`[data-testid="${testid}"]`);
    if (name) locators.push(`role=${role}[name="${name.replace(/"/g, '\\"')}"]`);
    locators.push(cssPath(el));

    elements.push({
      role,
      name,
      anchor,
      testid,
      ...(dynamic ? { dynamic: true } : {}),
      landmarks: landmarksOf(el),
      box: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      locators,
    });
  }

  return {
    version: 1,
    screen: options.screen || location.pathname,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    elements,
  };
}
