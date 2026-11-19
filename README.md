# uichanges

[![npm](https://img.shields.io/npm/v/uichanges)](https://www.npmjs.com/package/uichanges)
[![CI](https://github.com/uichanges/uichanges/actions/workflows/ci.yml/badge.svg)](https://github.com/uichanges/uichanges/actions/workflows/ci.yml)

> **Статус: ранняя версия (0.1).** Полный цикл работает: найти изменения → описать → показать пользователю. API может меняться.

Пользователи открывают новую версию вашего сайта и не могут найти кнопку, которая переехала, или не замечают фичу, которую вы только что выпустили. **uichanges** находит, что изменилось в интерфейсе между версиями, просит вас описать изменение в паре предложений и показывает это описание пользователям прямо на элементе: точкой-маячком, подсказкой со слайдами и стрелкой от места, где кнопка была раньше.

Сравнивается **то, что отрисовал браузер** (роли, доступные имена, ориентиры страницы, координаты), а не исходный код. Поэтому библиотека не зависит от фреймворка: React, Vue, Svelte, Blazor, серверные шаблоны и обычный HTML для неё выглядят одинаково.

## Посмотреть за минуту

```bash
git clone https://github.com/uichanges/uichanges && cd uichanges
npm install
npm run demo        # http://localhost:4321
```

Откроется демо-магазин с подсказками: «Корзина» переехала в шапку (со стрелкой от старого места), новая кнопка «Сравнить товары» (два слайда), переименованные «Мои заказы» и карточка про удалённые «Подписки».

## Как это работает

```
У разработчика                             У пользователя в браузере
  capture → status → describe → build   →    маячок → подсказка → «Понятно»
```

1. `capture` снимает слепки страниц вашего приложения. Первый запуск — базовая версия, она хранится в git.
2. Вы меняете интерфейс, снова запускаете `capture`, и `status` показывает, что изменилось.
3. `describe <id>` создаёт файл описания `.uichanges/changes/<id>.md`. Вы пишете заголовок и пару предложений.
4. `build` собирает описания в `uichanges.json`, который загружает SDK в браузере.
5. SDK показывает подсказку тем, кто ещё не видел это изменение. Новые пользователи при первом визите ничего не видят: для них всё и так новое.

## Установка в проект

```bash
npm i -D uichanges playwright
npx playwright install chromium
npx uichanges init
```

В `.uichanges/config.json` перечислите страницы:

```json
{
  "screens": [
    { "name": "home", "url": "http://localhost:5080/" },
    { "name": "catalog", "url": "http://localhost:5080/catalog", "waitFor": ".product-card" }
  ],
  "widths": [1280],
  "storageState": "auth.json",
  "ignore": [".recommendations"],
  "locale": "ru",
  "manifest": "wwwroot/uichanges.json"
}
```

| Поле | Что значит |
|---|---|
| `screens` | Страницы: `name` — имя файла слепка, `url` — адрес. Необязательно: `path` (путь, на котором SDK покажет подсказки, если отличается от `url`), `waitFor`, `delay`, `ignore`. |
| `widths` | Ширины экрана. Слепки разных ширин никогда не сравниваются друг с другом: кнопка в бургер-меню на мобильном — это адаптация, а не изменение. |
| `storageState` | Файл сессии Playwright для страниц за логином (см. ниже). |
| `ignore` | CSS-селекторы частей страницы с данными пользователя, рекламой, A/B-блоками. |
| `manifest` | Куда `build` пишет манифест. Положите его туда, откуда сайт раздаёт статические файлы. |

Дальше цикл такой:

```bash
npx uichanges capture             # первый раз: базовые слепки → закоммитьте .uichanges/
# …меняете интерфейс…
npx uichanges capture
npx uichanges status
```

```
uichanges status

  home@1280
    + button "Сравнить товары"      needs description  button-sravnit-tovary
    → link "Корзина"                needs description  link-korzina
    ~ link "Заказы" → "Мои заказы"  needs description  link-moi-zakazy
    ~ button "Войти" → "Вход"       needs description  login
    - link "Подписки"               needs description  link-podpiski
```

```bash
npx uichanges describe link-korzina    # создаст .uichanges/changes/link-korzina.md
npx uichanges ignore login             # не показывать пользователям
npx uichanges build                    # → uichanges.json
npx uichanges accept                   # текущие слепки становятся базой
```

В CI: `npx uichanges check` завершится с кодом 1, если есть изменения без описания.

### Страницы за логином

```bash
npx playwright codegen --save-storage=auth.json http://localhost:5080/
```

Войдите в открывшемся окне и закройте его. Сессия сохранится в `auth.json`: укажите его в `storageState`. **Не коммитьте этот файл.**

## Описание изменения

Обычный Markdown. Строка `---` разделяет слайды.

```markdown
---
id: button-sravnit-tovary
type: added
path: /
priority: high
locators: ["role=button[name=\"Сравнить товары\"]"]
---

# Новое: сравнение товаров

Выбирайте между похожими товарами, не открывая десять вкладок.

---

## Как пользоваться

1. Отметьте **2–4 товара** в каталоге
2. Нажмите «Сравнить товары»
```

Шапку файла заполняет `describe`, обычно её не нужно трогать. `priority` — `high`, `normal` или `low`. Перевод — файл рядом: `button-sravnit-tovary.en.md`. Разрешены заголовки, списки, **жирный**, *курсив*, `код`, ссылки и картинки. Сырой HTML экранируется.

## SDK в браузере

Без сборщика (Blazor, серверные шаблоны, обычный HTML), одна строка перед `</body>`:

```html
<script src="/uichanges.js" data-manifest="/uichanges.json" defer></script>
```

Файл `uichanges.js` возьмите из `node_modules/uichanges/dist/` или с CDN: `https://unpkg.com/uichanges/dist/uichanges.js`.

Со сборщиком:

```js
import { uichanges } from 'uichanges/runtime';

uichanges.start({
  manifest: '/uichanges.json',
  locale: 'ru',          // по умолчанию <html lang>
  maxBeacons: 3,         // больше маячков одновременно не показывать
  autoOpen: false,       // открыть первую подсказку сразу, без клика по маячку
  onShow(change) {}, onDismiss(change) {},
});

uichanges.open('link-korzina');   // открыть подсказку из кода, например из меню «Что нового»
uichanges.reset();                // забыть просмотренное (для отладки)
```

SDK весит около 7 KB в gzip, не имеет зависимостей и рисует всё в Shadow DOM: стили сайта не ломают подсказки, а подсказки не ломают сайт. Цвета меняются CSS-переменными `--uic-accent`, `--uic-bg`, `--uic-text`. Если элемент не найден, подсказка просто не показывается. Элементы, которые появляются позже (SPA-навигация, асинхронная отрисовка в Blazor), подхватываются автоматически.

### Blazor

Подключите скрипт в `App.razor` (Blazor Web App / Server) или `wwwroot/index.html` (WebAssembly), а в конфиге укажите `"manifest": "wwwroot/uichanges.json"`. Атрибуты `data-testid`, `data-uichanges` и `data-uichanges-ignore` пишутся прямо в разметке Razor.

## Как сопоставляются элементы

Дифф полезен, только если «та же кнопка, но в другом месте» не превращается в «одна удалена, другая добавлена». Элементы сопоставляются в три прохода, от самого надёжного признака к самому слабому:

1. **Явные ключи**: `data-uichanges`, затем `data-testid`.
2. **Роль + доступное имя**, если пара уникальна в обеих версиях.
3. **Оценка похожести** по роли, имени, ориентирам и положению, в том числе относительно соседей: кнопка, переехавшая вместе со своим разделом, будет найдена, даже если её переименовали. Сомнительные пары помечаются `low confidence`.

Элементы, сдвинувшиеся вместе, объединяются в **блок**: раздел описывается один раз, а не по частям. Сдвиг всей области (например, шапка стала выше) не считается перемещением.

### Как убрать шум

```html
<section data-uichanges-ignore>…персональные рекомендации…</section>
<button data-uichanges="group-picker">Группа: 3ПИ41 · изменить</button>  <!-- в имени данные: закрепите идентичность -->
```

## Команды

| Команда | Что делает |
|---|---|
| `init [--locale ru]` | Создаёт `.uichanges/` с конфигом |
| `capture` | Снимает слепки всех страниц из конфига |
| `status` | Показывает изменения и какие из них ещё не описаны |
| `describe <id> [--force]` | Создаёт шаблон описания |
| `ignore <id>` | Помечает изменение как «не показывать» |
| `accept` | Делает текущие слепки базовыми |
| `check` | Для CI: код 1, если есть неописанные изменения |
| `build [-o файл]` | Собирает манифест для браузера |
| `snapshot <url\|файл>` | Слепок одной страницы в JSON |
| `diff <до.json> <после.json>` | Сравнение двух слепков |

Общие флаги: `--storage-state`, `--wait-for <селектор>`, `--delay <мс>`, `--ignore <селектор>`.

## Дорожная карта

- [x] Слепки, сопоставление в три прохода, блоки
- [x] Папка `.uichanges/`, `capture` / `status` / `describe` / `ignore` / `accept` / `check` / `build`
- [x] SDK: маячки, подсказки со слайдами, «призрак» со стрелкой, список просмотренного
- [ ] Автоматические скриншоты «до/после» в слайдах (`![](auto:before-after)`)
- [ ] Плагин для Vite: слепки снимаются, пока вы работаете с приложением
- [ ] Оверлей ревью (`?uichanges=review`) для описания изменений прямо на странице
- [ ] Панель «Что нового» со списком всех изменений
- [ ] Интерактивные туры (`waitFor: click | route`)

## Лицензия

MIT
