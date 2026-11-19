/**
 * Compares two UI snapshots of the same screen at the same viewport width and
 * reports what the developer added, removed, moved or renamed.
 *
 * Matching runs in three passes, from the strongest signal to the weakest.
 * An element matched in one pass takes no part in the next ones.
 *   1. explicit keys: data-uichanges, then data-testid
 *   2. role + accessible name, when unique on both sides
 *   3. similarity score (role, name, landmarks, position), greedy best-first
 */

const DEFAULTS = {
  /** Residual displacement (px) above which a matched element counts as moved. */
  moveThreshold: 120,
  /** Minimum similarity for pass 3 to pair two elements. */
  matchThreshold: 0.55,
  /** Pairs below this score are reported with confidence "low". */
  confidentThreshold: 0.75,
};

const WEIGHTS = { name: 0.55, landmarks: 0.15, position: 0.3 };

/**
 * @param {import('./types.js').Snapshot} before
 * @param {import('./types.js').Snapshot} after
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {import('./types.js').DiffResult}
 */
export function diffSnapshots(before, after, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (before.viewport.width !== after.viewport.width) {
    throw new Error(
      `Snapshots have different viewport widths (${before.viewport.width} vs ${after.viewport.width}). ` +
      'Compare snapshots of the same width only: layout adaptation is not a change.',
    );
  }

  const A = before.elements.map((el, i) => ({ ...el, _i: i }));
  const B = after.elements.map((el, i) => ({ ...el, _i: i }));
  const usedA = new Set();
  const usedB = new Set();
  const pairs = [];

  const pair = (a, b, method, score) => {
    usedA.add(a._i);
    usedB.add(b._i);
    pairs.push({ a, b, method, score });
  };

  // Pass 1: explicit keys.
  for (const key of ['anchor', 'testid']) {
    const index = uniqueIndex(B.filter((b) => !usedB.has(b._i) && b[key]), (b) => b[key]);
    for (const a of A) {
      if (usedA.has(a._i) || !a[key]) continue;
      const b = index.get(a[key]);
      if (b && !usedB.has(b._i)) pair(a, b, key, 1);
    }
  }

  // Pass 2: role + name, unique on both sides.
  {
    const keyOf = (el) => `${el.role}|${norm(el.name)}`;
    const idxA = uniqueIndex(A.filter((a) => !usedA.has(a._i) && hasText(a.name)), keyOf);
    const idxB = uniqueIndex(B.filter((b) => !usedB.has(b._i) && hasText(b.name)), keyOf);
    for (const [key, a] of idxA) {
      const b = idxB.get(key);
      if (b) pair(a, b, 'role+name', 1);
    }
  }

  // Pass 3: similarity, greedy best-first.
  {
    const diag = Math.hypot(after.viewport.width, after.viewport.height);
    const candidates = [];
    for (const a of A) {
      if (usedA.has(a._i)) continue;
      for (const b of B) {
        if (usedB.has(b._i) || a.role !== b.role) continue;
        const score = similarity(a, b, diag);
        if (score >= opts.matchThreshold) candidates.push({ a, b, score });
      }
    }
    candidates.sort((x, y) => y.score - x.score);
    for (const c of candidates) {
      if (!usedA.has(c.a._i) && !usedB.has(c.b._i)) pair(c.a, c.b, 'similarity', round(c.score));
    }
  }

  // Layout shift compensation: within one landmark, subtract the median
  // displacement so a taller header does not make the whole page "move".
  const shift = medianShiftByLandmark(pairs);

  const changes = [];
  let unchanged = 0;

  for (const { a, b, method, score } of pairs) {
    const kinds = [];
    const landmarksChanged = landmarkKey(a) !== landmarkKey(b);
    const s = shift.get(landmarkKey(b)) || { dx: 0, dy: 0 };
    const dx = center(b).x - center(a).x;
    const dy = center(b).y - center(a).y;
    const residual = Math.hypot(dx - s.dx, dy - s.dy);
    if (landmarksChanged || residual > opts.moveThreshold) kinds.push('moved');
    if (norm(a.name) !== norm(b.name)) kinds.push('renamed');
    if (kinds.length === 0) { unchanged++; continue; }
    changes.push({
      type: kinds[0],
      kinds,
      confidence: score >= opts.confidentThreshold ? 'high' : 'low',
      match: { method, score },
      before: summary(a),
      after: summary(b),
      distance: Math.round(Math.hypot(dx, dy)),
    });
  }

  for (const b of B) if (!usedB.has(b._i)) changes.push({ type: 'added', kinds: ['added'], confidence: 'high', before: null, after: summary(b) });
  for (const a of A) if (!usedA.has(a._i)) changes.push({ type: 'removed', kinds: ['removed'], confidence: 'high', before: summary(a), after: null });

  assignIds(changes);
  changes.sort((x, y) => ORDER[x.type] - ORDER[y.type] || x.id.localeCompare(y.id));

  return {
    screen: after.screen,
    viewport: after.viewport,
    changes,
    stats: { before: A.length, after: B.length, matched: pairs.length, unchanged },
  };
}

const ORDER = { added: 0, moved: 1, renamed: 2, removed: 3 };

function hasText(s) { return Boolean(s && s.trim()); }

function uniqueIndex(items, keyFn) {
  const map = new Map();
  const dup = new Set();
  for (const item of items) {
    const k = keyFn(item);
    if (map.has(k)) dup.add(k); else map.set(k, item);
  }
  for (const k of dup) map.delete(k);
  return map;
}

function similarity(a, b, diag) {
  const nameSim = stringSimilarity(norm(a.name), norm(b.name));
  const la = a.landmarks || [];
  const lb = b.landmarks || [];
  const landmarkSim = landmarkKey(a) === landmarkKey(b) ? 1 : la.some((x) => lb.includes(x)) ? 0.5 : 0;
  const dist = Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y);
  const positionSim = Math.max(0, 1 - dist / (diag * 0.5));
  return WEIGHTS.name * nameSim + WEIGHTS.landmarks * landmarkSim + WEIGHTS.position * positionSim;
}

/** 1 − normalized Levenshtein distance. */
export function stringSimilarity(s, t) {
  if (s === t) return 1;
  if (!s || !t) return 0;
  const m = s.length;
  const n = t.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function medianShiftByLandmark(pairs) {
  const groups = new Map();
  for (const { a, b } of pairs) {
    if (landmarkKey(a) !== landmarkKey(b)) continue;
    const k = landmarkKey(b);
    if (!groups.has(k)) groups.set(k, { dx: [], dy: [] });
    groups.get(k).dx.push(center(b).x - center(a).x);
    groups.get(k).dy.push(center(b).y - center(a).y);
  }
  const out = new Map();
  // With fewer than 3 elements the median is just an average and would
  // swallow a real move, so no compensation there.
  for (const [k, g] of groups) {
    if (g.dx.length >= 3) out.set(k, { dx: median(g.dx), dy: median(g.dy) });
  }
  return out;
}

function median(xs) {
  const s = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const landmarkKey = (el) => (el.landmarks || []).join(' > ');
const center = (el) => ({ x: el.box.x + el.box.w / 2, y: el.box.y + el.box.h / 2 });
const round = (x) => Math.round(x * 100) / 100;

function summary(el) {
  return {
    role: el.role,
    name: el.name,
    anchor: el.anchor || null,
    testid: el.testid || null,
    landmarks: el.landmarks || [],
    box: el.box,
    locators: el.locators || [],
  };
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(s) {
  return norm(s)
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Stable, human-readable ids: anchor > testid > role-name. */
function assignIds(changes) {
  const seen = new Map();
  for (const c of changes) {
    const el = c.after || c.before;
    const base = el.anchor || el.testid || [el.role, slugify(el.name)].filter(Boolean).join('-') || el.role;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    c.id = n === 1 ? base : `${base}-${n}`;
  }
}
