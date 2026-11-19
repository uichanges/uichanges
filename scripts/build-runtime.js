// Builds dist/uichanges.js: the browser SDK as a plain <script>, no bundler needed.
// The ES module in src/runtime.js stays the single source; this only unwraps
// its exports into an IIFE and adds auto-start from data-* attributes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const src = readFileSync(new URL('src/runtime.js', root), 'utf8');
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const body = src.replace(/^export (const|function) /gm, '$1 ');
if (/^\s*export\b/m.test(body)) throw new Error('runtime.js has an export this script cannot unwrap');

const out = `/*! uichanges ${version} | MIT | https://github.com/uichanges/uichanges */
(function () {
'use strict';
${body}
window.uichanges = uichanges;
// <script src="uichanges.js" data-manifest="/uichanges.json" data-locale="ru" data-auto-open data-show-on-first-visit></script>
var script = document.currentScript;
if (script && script.dataset.manifest) {
  uichanges.start({
    manifest: script.dataset.manifest,
    locale: script.dataset.locale || undefined,
    autoOpen: 'autoOpen' in script.dataset,
    showOnFirstVisit: 'showOnFirstVisit' in script.dataset,
  });
}
})();
`;

mkdirSync(new URL('dist/', root), { recursive: true });
const target = new URL('dist/uichanges.js', root);
writeFileSync(target, out);
console.log(`Built ${fileURLToPath(target)} (${(out.length / 1024).toFixed(1)} KB)`);
