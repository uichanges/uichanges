// Builds the playground for GitHub Pages into _site/.
//   node scripts/build-pages.js          build
//   node scripts/build-pages.js --serve  build and serve on http://localhost:4322
import { cpSync, mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '_site');
execFileSync(process.execPath, [join(root, 'scripts/build-runtime.js')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'lib'), { recursive: true });
for (const f of ['index.html', 'playground.css', 'playground.js', 'shop.html', 'shop.css']) cpSync(join(root, 'playground', f), join(out, f));
// The library's own browser-safe modules, unchanged.
for (const f of ['capture.js', 'diff.js', 'markdown.js', 'review-items.js']) cpSync(join(root, 'src', f), join(out, 'lib', f));
cpSync(join(root, 'dist/uichanges.js'), join(out, 'uichanges.js'));
cpSync(join(root, 'src/review-ui.js'), join(out, 'review.js'));
cpSync(join(root, 'docs/images/favicon.svg'), join(out, 'favicon.svg'));
console.log(`Built ${out}`);

if (process.argv.includes('--serve')) {
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const port = Number(process.env.PORT) || 4322;
  createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (path.startsWith('..')) { res.writeHead(400).end(); return; }
    let file = join(out, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': `${TYPES[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(readFileSync(file));
  }).listen(port, () => console.log(`Playground: http://localhost:${port}/`));
}
