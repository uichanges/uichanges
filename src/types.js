/**
 * Shared JSDoc types. This file has no runtime code.
 *
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 *
 * @typedef {object} SnapshotElement
 * @property {string} role            ARIA role (explicit or implicit).
 * @property {string} name            Accessible name.
 * @property {string|null} anchor     Value of data-uichanges.
 * @property {string|null} testid     Value of data-testid.
 * @property {string[]} landmarks     Landmark path, outer → inner, e.g. ["complementary:Профиль"].
 * @property {Box} box                Page coordinates.
 * @property {string[]} locators      Fallback chain used at runtime to find the element.
 *
 * @typedef {object} Snapshot
 * @property {1} version
 * @property {string} screen
 * @property {{ width: number, height: number }} viewport
 * @property {SnapshotElement[]} elements
 *
 * @typedef {'added'|'removed'|'moved'|'renamed'} ChangeType
 *
 * @typedef {object} Change
 * @property {string} id                     Stable id: anchor > testid > role-name slug.
 * @property {ChangeType} type               Primary kind.
 * @property {ChangeType[]} kinds            All kinds, e.g. ["moved", "renamed"].
 * @property {'high'|'low'} confidence       "low" = ask the developer to confirm the match.
 * @property {{ method: string, score: number }} [match]
 * @property {object|null} before
 * @property {object|null} after
 * @property {number} [distance]             Raw displacement in px.
 *
 * @typedef {object} DiffResult
 * @property {string} screen
 * @property {{ width: number, height: number }} viewport
 * @property {Change[]} changes
 * @property {{ before: number, after: number, matched: number, unchanged: number }} stats
 */
export {};
