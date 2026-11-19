// npm run demo → http://localhost:4321
// Builds the browser SDK and the example manifest, then serves the demo shop.
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compileManifest } from '../src/manifest.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const examples = join(root, 'examples');
execFileSync(process.execPath, [join(root, 'scripts/build-runtime.js')], { stdio: 'inherit' });

const { manifest, warnings } = compileManifest(join(examples, 'changes'));
warnings.forEach((w) => console.warn(`warning: ${w}`));
writeFileSync(join(examples, 'uichanges.json'), JSON.stringify(manifest, null, 2));

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// "/" is the demo page; other paths are looked up in examples/, then in the repo root.
export function resolveFile(urlPath) {
  const path = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) return null;
  if (path === '' || path === '.') return join(examples, 'demo.html');
  for (const base of [examples, root]) {
    const file = join(base, path);
    if (existsSync(file)) return file;
  }
  return null;
}

const port = Number(process.env.PORT) || 4321;
createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': `${TYPES[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Demo: http://localhost:${port}/`));
