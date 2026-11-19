// Node-only: the local server behind review mode (`uichanges review`).
//
// The browser SDK, opened with ?uichanges=review, loads the panel from this
// server and talks to it to list changes and save descriptions. The server
// listens on 127.0.0.1 only and every API call needs the token printed in the
// terminal, so another site open in the browser cannot write to your project.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadConfig, computeStatus, findChange, addIgnored, addDynamic, accept } from './project.js';
import { readDescription, saveDescription } from './describe.js';
import { buildManifest } from './manifest.js';
import { cssPathOf } from './diff.js';
import { captureAll } from './commands.js';

const PANEL = new URL('./review-ui.js', import.meta.url);

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** One entry per change; a block of elements that moved together is one entry. */
export function reviewItems(root) {
  const status = computeStatus(root);
  const items = [];
  for (const screen of status.screens) {
    const seenBlocks = new Set();
    for (const c of screen.changes) {
      if (c.block) {
        if (seenBlocks.has(c.block.id)) continue;
        seenBlocks.add(c.block.id);
        const members = screen.changes.filter((m) => m.block && m.block.id === c.block.id);
        const anchor = members.find((m) => m.after.role === 'heading') || members[0];
        items.push({
          id: c.block.id,
          kind: 'block',
          kinds: ['moved'],
          status: c.status,
          confidence: members.some((m) => m.confidence === 'low') ? 'low' : 'high',
          path: c.path,
          screen: c.screen,
          role: anchor.after.role,
          before: c.block.title,
          after: c.block.title,
          size: c.block.size,
          locators: anchor.after.locators,
          from: { ...union(members.map((m) => m.before.box)), viewportWidth: c.viewportWidth },
          canBeDynamic: false,
          description: readDescription(root, c.block.id),
        });
        continue;
      }
      items.push({
        id: c.id,
        kind: c.type,
        kinds: c.kinds,
        status: c.status,
        confidence: c.confidence,
        path: c.path,
        screen: c.screen,
        role: (c.after || c.before).role,
        before: c.before ? c.before.name : null,
        after: c.after ? c.after.name : null,
        locators: c.after ? c.after.locators : [],
        from: c.before && c.kinds.includes('moved') ? { ...c.before.box, viewportWidth: c.viewportWidth } : null,
        canBeDynamic: c.kinds.includes('renamed'),
        description: readDescription(root, c.id),
      });
    }
  }
  return { hasCurrent: status.hasCurrent, locale: loadConfig(root).locale, items };
}

function isAllowedOrigin(origin, config) {
  if (!origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
  return (config.screens || []).some((s) => {
    try { return new URL(s.url).origin === url.origin; } catch { return false; }
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((n, c) => n + c.length, 0) > 1_000_000) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const need = (body, key) => {
  if (typeof body[key] !== 'string' || !body[key]) throw Object.assign(new Error(`"${key}" is required`), { status: 400 });
  return body[key];
};

/**
 * @param {string} root project root
 * @param {{ port?: number, token?: string, log?: (s: string) => void }} [options]
 * @returns {Promise<{ server: import('node:http').Server, port: number, token: string, close: () => Promise<void> }>}
 */
export async function startReviewServer(root, options = {}) {
  const token = options.token || randomBytes(12).toString('base64url');
  const log = options.log || (() => {});
  let busy = null; // one long operation (capture) at a time

  const routes = {
    'GET /api/status': () => reviewItems(root),

    'POST /api/describe': (body) => {
      const id = need(body, 'id');
      const found = findChange(computeStatus(root), id);
      if (!found) throw Object.assign(new Error(`No change "${id}"`), { status: 404 });
      saveDescription(root, found, { title: need(body, 'title'), body: body.body || '', priority: body.priority || 'normal' });
      const { target, warnings } = buildManifest(root);
      log(`described ${id}`);
      return { ok: true, manifest: target, warnings };
    },

    'POST /api/ignore': (body) => {
      const id = need(body, 'id');
      if (!findChange(computeStatus(root), id)) throw Object.assign(new Error(`No change "${id}"`), { status: 404 });
      addIgnored(root, id);
      log(`ignored ${id}`);
      return { ok: true };
    },

    'POST /api/dynamic': (body) => {
      const id = need(body, 'id');
      const found = findChange(computeStatus(root), id);
      if (!found || !found.change) throw Object.assign(new Error(`No element change "${id}"`), { status: 404 });
      const paths = new Set([found.change.before, found.change.after].filter(Boolean).map(cssPathOf).filter(Boolean));
      for (const p of paths) addDynamic(root, p);
      log(`marked ${id} as user data`);
      return { ok: true, paths: [...paths] };
    },

    'POST /api/capture': async () => {
      if (busy) throw Object.assign(new Error(`Busy: ${busy}`), { status: 409 });
      busy = 'capturing';
      try {
        const result = await captureAll(root, {}, ({ file }) => log(`captured ${file}`));
        return { ok: true, ...result };
      } finally {
        busy = null;
      }
    },

    'POST /api/accept': () => {
      const n = accept(root);
      log(`accepted ${n} snapshot(s) as the baseline`);
      return { ok: true, accepted: n };
    },
  };

  const server = createServer(async (req, res) => {
    const config = loadConfig(root);
    const origin = req.headers.origin;
    const headers = { 'cache-control': 'no-store' };
    if (isAllowedOrigin(origin, config)) {
      Object.assign(headers, {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'content-type, x-uichanges-token',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-private-network': 'true',
        vary: 'origin',
      });
    }
    const send = (status, data, type = 'application/json') => {
      res.writeHead(status, { ...headers, 'content-type': `${type}; charset=utf-8` });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };

    if (req.method === 'OPTIONS') return send(204, '', 'text/plain');
    const path = new URL(req.url, 'http://x').pathname;

    if (req.method === 'GET' && path === '/review.js') {
      return send(200, readFileSync(PANEL, 'utf8'), 'text/javascript');
    }

    const route = routes[`${req.method} ${path}`];
    if (!route) return send(404, { error: 'Not found' });
    if (req.headers['x-uichanges-token'] !== token) return send(401, { error: 'Wrong or missing token. Open the link printed by `uichanges review`.' });

    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      send(200, await route(body));
    } catch (err) {
      send(err.status || 500, { error: err.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4400, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, port, token, close: () => new Promise((r) => server.close(() => r())) };
}

/** The address to open in the browser for one screen of the config. */
export function reviewLink(screenUrl, port, token) {
  const url = new URL(screenUrl);
  url.searchParams.set('uichanges', 'review');
  url.searchParams.set('uichanges-port', String(port));
  url.searchParams.set('uichanges-token', token);
  return url.href;
}
