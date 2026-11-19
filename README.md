[![npm](https://img.shields.io/npm/v/uichanges)](https://www.npmjs.com/package/uichanges)
[![CI](https://github.com/uichanges/uichanges/actions/workflows/ci.yml/badge.svg)](https://github.com/uichanges/uichanges/actions/workflows/ci.yml)

# uichanges

> **Статус: прототип.** Ядро сравнения работает. Следующие шаги — SDK для браузера, плагин для dev-режима и оверлей ревью (см. дорожную карту ниже).

Пользователи открывают новую версию вашего сайта и не могут найти кнопку, которая переехала, или не замечают фичу, которую вы только что выпустили. **uichanges** находит, что изменилось в интерфейсе между версиями, просит вас описать изменение в одну строку и показывает это описание пользователям прямо на элементе: подсказкой, короткими слайдами или стрелкой от места, где кнопка была раньше.

Сравнивается **то, что отрисовал браузер** (роли, доступные имена, ориентиры страницы, координаты), а не исходный код. Поэтому библиотека не зависит от фреймворка: React, Vue, Svelte, серверные шаблоны и обычный HTML для неё выглядят одинаково.

## Попробовать прототип

```bash
npm i -D uichanges playwright
npx playwright install chromium

npx uichanges snapshot http://localhost:3000/catalog -o before.json
# …меняете интерфейс…
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

Этот вывод получен на двух страницах из папки [`examples/`](examples). Повторить можно командой `npm run example`.

## Как сопоставляются элементы

Дифф полезен, только если «та же кнопка, но в другом месте» не превращается в «одна удалена, другая добавлена». Поэтому элементы сопоставляются в три прохода, от самого надёжного признака к самому слабому:

1. **Явные ключи**: сначала `data-uichanges`, затем `data-testid` (во многих проектах они уже есть).
2. **Роль + доступное имя**, если такая пара уникальна в обеих версиях.
3. **Оценка похожести** по роли, имени, пути ориентиров и положению. Пары подбираются жадно, начиная с самых похожих. Сомнительные пары помечаются `confidence: "low"`, чтобы вы могли их подтвердить.

Затем каждая пара получает тип:

- **moved** (перемещён): у элемента сменился ориентир (боковая панель → шапка) или он сдвинулся больше чем на 120 px с поправкой на общий сдвиг его области. Если шапка стала выше, страница целиком не считается «перемещённой».
- **renamed** (переименован): изменилось доступное имя.

Элементы без пары считаются **added** (добавлен) или **removed** (удалён).

Слепки сравниваются только **при одинаковой ширине экрана**. Кнопка, которая на мобильном прячется в бургер-меню, — это адаптация вёрстки, а не изменение.

### Как убрать шум

```html
<section data-uichanges-ignore>…персональные рекомендации…</section>
<button data-uichanges="export-report">Экспорт</button>  <!-- явно закрепить идентичность -->
```

## API

```js
import { captureSnapshot, diffSnapshots } from 'uichanges';  // безопасно для браузера
import { snapshotPage, formatDiff } from 'uichanges/node';   // только Node

const before = await snapshotPage('http://localhost:3000', { width: 1280 });
const after = await snapshotPage('http://localhost:3000', { width: 1280 });
const { changes } = diffSnapshots(before, after);
```

Функция `captureSnapshot()` самодостаточна, поэтому её можно запустить на любой странице: через `page.evaluate(captureSnapshot)` в Playwright или из скрипта в dev-режиме.

## Дорожная карта

- [x] Снятие слепков, сопоставление в три прохода, CLI-команды `snapshot` / `diff`
- [ ] Папка `.uichanges/`: базовые слепки в git, команды `status` / `accept` / `check`
- [ ] Описания изменений в Markdown со слайдами и автоматическими скриншотами «до/после»
- [ ] Плагин для Vite: слепки снимаются, пока вы работаете с приложением в dev-режиме
- [ ] Оверлей ревью (`?uichanges=review`) для описания изменений прямо на странице
- [ ] SDK для браузера: подсказки, слайды, «призрак» на старом месте, список просмотренного для каждого пользователя
- [ ] Интерактивные туры (`waitFor: click | route`)

## Лицензия

MIT