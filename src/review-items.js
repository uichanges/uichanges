// Pure: no Node APIs. Shared by the review server and the hosted playground.

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/**
 * Turns the changes of one screen into review panel entries: one per change,
 * one per block of elements that moved together.
 *
 * @param {object[]} changes from diffSnapshots, each with status, path,
 *   screen and viewportWidth set by the caller
 * @param {(id: string) => ({ title: string, body: string, priority: string } | null)} describe
 */
export function toReviewItems(changes, describe) {
  const items = [];
  const seenBlocks = new Set();
  for (const c of changes) {
    if (c.block) {
      if (seenBlocks.has(c.block.id)) continue;
      seenBlocks.add(c.block.id);
      const members = changes.filter((m) => m.block && m.block.id === c.block.id);
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
        description: describe(c.block.id),
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
      description: describe(c.id),
    });
  }
  return items;
}

/** A manifest entry (what the browser SDK shows) for a described review item. */
export function manifestEntry(item, { title, slides, priority = 'normal' }) {
  return {
    id: item.id,
    type: item.kind === 'block' ? 'moved' : item.kind,
    path: item.path,
    priority,
    locators: item.locators || [],
    ...(item.from ? { from: item.from } : {}),
    content: { default: { title, slides } },
  };
}
