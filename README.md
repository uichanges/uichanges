# uichanges

> **Status: prototype.** The diff core works; the runtime SDK, dev-mode plugin and review overlay are next. See the roadmap below.

Your users open the new version of your site and can't find the button that moved, or don't notice the feature you just shipped. **uichanges** finds what changed in your UI between versions, asks you for a one-line description, and shows it to users right on the element: a hint, a short slideshow, or an arrow from where the button used to be.

It compares **what the browser renders** (roles, accessible names, landmarks, positions), not your source code. That keeps it framework-agnostic: React, Vue, Svelte, server templates and plain HTML all look the same to it.

## Try the prototype

```bash
npm i -D uichanges playwright
npx playwright install chromium

npx uichanges snapshot http://localhost:3000/catalog -o before.json
# …change your UI…
npx uichanges snapshot http://localhost:3000/catalog -o after.json
npx uichanges diff before.json after.json
```

```
uichanges diff  catalog @ 1280px

  + added    button "Сравнить товары"  in banner
  → moved    link "Корзина"  complementary:Профиль › navigation → banner
  ~ renamed  link "Заказы" → "Мои заказы"
  ~ renamed  button "Войти" → "Вход"
  - removed  link "Подписки"  from complementary:Профиль › navigation

5 change(s) · 15 unchanged · 19 → 19 elements
```

This output comes from the two pages in [`examples/`](examples): run `npm run example`.

## How matching works

A diff is only useful if "the same button, moved" is not reported as "one removed, one added". Elements are paired in three passes, strongest signal first:

1. **Explicit keys:** `data-uichanges`, then `data-testid` (many projects already have these).
2. **Role + accessible name**, when unique on both sides.
3. **Similarity score** from role, name, landmark path and position, paired greedily best-first. Weak pairs come back with `confidence: "low"` so you can confirm them.

Then each pair is classified:

- **moved:** its landmark changed (sidebar → header), or it travelled more than 120 px after subtracting the shift shared by its whole region. A taller header doesn't make the whole page "move".
- **renamed:** its accessible name changed.

Unpaired elements are **added** or **removed**.

Snapshots are compared only at the **same viewport width**. A button that hides in a burger menu on mobile is layout adaptation, not a change.

### Keep noise out

```html
<section data-uichanges-ignore>…personal recommendations…</section>
<button data-uichanges="export-report">Export</button>  <!-- pin identity explicitly -->
```

## API

```js
import { captureSnapshot, diffSnapshots } from 'uichanges';  // browser-safe
import { snapshotPage, formatDiff } from 'uichanges/node';   // Node only

const before = await snapshotPage('http://localhost:3000', { width: 1280 });
const after = await snapshotPage('http://localhost:3000', { width: 1280 });
const { changes } = diffSnapshots(before, after);
```

`captureSnapshot()` is self-contained, so you can run it in any page: `page.evaluate(captureSnapshot)` in Playwright, or from a dev-mode script.

## Roadmap

- [x] Snapshot capture, three-pass matching, CLI `snapshot` / `diff`
- [ ] `.uichanges/` folder: baseline snapshots in git, `status` / `accept` / `check`
- [ ] Change descriptions in Markdown with slides and auto before/after screenshots
- [ ] Vite plugin: snapshots captured while you use the app in dev mode
- [ ] Review overlay (`?uichanges=review`) to describe changes on the page itself
- [ ] Runtime SDK: hints, slides, "moved here" ghost, per-user seen list
- [ ] Interactive tours (`waitFor: click | route`)

## License

MIT
