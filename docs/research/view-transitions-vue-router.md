# View Transitions + Vue Router 4 — findings

Дата: 2026-11-26

Статус: рекомендации Приоритета 1 применены в тот же день. VT перенесён в `router.beforeResolve`, `waitForNewRoute()` и `types` удалены, анимация работает только вперёд (`parcels → parcel`, `people → customer`); `back` — обычный переход без VT. Переключение табов получило дешёвый Vue `<Transition name="panel-tab">` вместо VT.

Дополнительно исправлена найденная регрессия: `<Transition mode="out-in">` оборачивал **все** роуты, поэтому к моменту нового снимка в DOM оставался старый список — браузер анимировал строку саму с собой, и морфинга заголовка не было. Теперь `<Transition>` включён только для таб↔таб; list→detail рендерит компонент напрямую. Проверка в `e2e/view-transition.spec.ts` сверяет, что на `ready` уже есть detail hero и keyframes заголовка действительно различаются.

Объём: same-document View Transitions в SPA на Vue 3 + Vue Router 4, плюс три дополнительные темы: Vue `<Transition>` / `<TransitionGroup>`, GSAP reverse/Flip и рекомендации для этого репозитория.

Источники: только официальная документация и спецификации (Vue, Vue Router, GSAP, MDN/CSSWG, Chrome, WebKit). Код и тесты не изменялись; все примеры ниже иллюстративные.

## Краткий вердикт

**Да, текущая интеграция неправильная — точнее, она работает на «счастливом пути», но не совпадает с документированной точкой интеграции Vue Router и содержит лишнюю гонку.**

Главные причины:

1. `runViewTransition()` вызывается из `router.beforeEach()` (`src/app/router.ts:64-72`), а официальный пример Vue Router использует `router.beforeResolve()`. `beforeEach` выполняется **до** resolved async route components; `beforeResolve` — сразу перед подтверждением навигации, когда ленивые компоненты уже загружены. Все экраны кроме `sign-in` — dynamic imports (`src/app/router.ts:24-45`), поэтому VT стартует слишком рано.
2. `document.startViewTransition()` получает `async update`, который сначала `resolve(true)` guard, а затем опрашивает `router.currentRoute.value.fullPath` через `nextTick()` / `requestAnimationFrame` / `setTimeout` (`src/app/viewTransitions.ts:94-115`, `146-162`). Документированный паттерн проще: guard сам awaits promise, `resolve` которого является update callback; никакого опроса маршрута нет.
3. `types: [direction]` передаётся без всякого использования `:active-view-transition-type()` в CSS (поиск по `src/app` не нашёл ни одного вхождения). В Safari 18.0 types ещё нет; они появились только в Safari 18.2. Сейчас это мёртвый/несовместимый флаг, а не рабочая «направленная анимация».

Плюсы текущей реализации стоит сохранить: tab↔tab VT пропускается, reduced motion уважается, unsupported API и активный transition обрабатываются, `ready`/`updateCallbackDone`/`finished` все перехвачены, временные `view-transition-name` снимаются на `finished`, фокус на `#panel-container` (`tabindex="-1"`, `outline: none`) не рисует кольцо.

---

## 1. Что именно делает текущий код

| Файл                                                                                                 | Факт                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/router.ts:64-72`                                                                            | VT запускается в `beforeEach`, после auth-проверок.                                                                                                   |
| `src/app/router.ts:24-45`                                                                            | Почти все route components — `() => import(...)`, т.е. async route components.                                                                        |
| `src/app/viewTransitions.ts:117-180`                                                                 | `runViewTransition()` пропускает tab switch, активный VT, reduced motion, unsupported API, тот же путь и sign-in; считает direction по `ROUTE_DEPTH`. |
| `src/app/viewTransitions.ts:149-162`                                                                 | В `update` резолвит guard, затем ждёт `waitForNewRoute(router, to)`.                                                                                  |
| `src/app/viewTransitions.ts:94-115`                                                                  | `waitForNewRoute()` делает до 12 `nextTick()` + до 6 кадров/таймеров по 50 мс.                                                                        |
| `src/app/App.vue:56-58`, `71-80`                                                                     | `#panel-container` имеет `view-transition-name: panel-root`, `tabindex="-1"` и подавляет outline.                                                     |
| `src/app/style.css:380-414`                                                                          | Имена `panel-root`, `parcel-title/date/next`, `customer-title/mark/facts`; длительность 260 ms; reduced motion отключает анимации.                    |
| `src/app/style.css:644-657`, `1619-1633`                                                             | `.is-vt-source` связывает строку списка с hero detail-страницы.                                                                                       |
| `src/features/parcels/ui/ParcelListItem.vue:22-27`, `src/features/customers/CustomersView.vue:66-71` | Source помечается ещё до `router.push()`, поэтому old snapshot уже содержит имя строки.                                                               |
| `src/app/AppNavbar.vue:98-99`                                                                        | Есть `backdrop-filter: blur(22px) saturate(180%)`.                                                                                                    |
| `e2e/iphone/iphone-flows.spec.ts:93-147`                                                             | Регрессионный тест ожидает 0 VT на табах, `#panel-container` не в фокусе, `outlineStyle: "none"`, затем ровно 1 VT для `parcels → parcel`.            |

---

## 2. Первоначальная тема: как same-document VT должен стыковаться с Vue Router

### 2.1 Что гарантирует API

По [MDN `Document.startViewTransition()`](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) и [CSS View Transitions Level 1](https://drafts.csswg.org/css-view-transitions-1/):

- API сначала снимает **old state**, затем вызывает `updateCallback`, затем — после того как его promise выполнится — в следующем кадре снимает **new state** и запускает анимацию.
- API **не планирует и не ждёт DOM-изменений** сам: «the API is not responsible for queuing or otherwise scheduling DOM changes». Поэтому связка с роутером обязательна.
- Отклонение promise из `updateCallback` отменяет визуальный transition, но само DOM-изменение не отменяется.
- Дубликат `view-transition-name` в снимке заставляет transition пропуститься; `updateCallback` при этом всё равно вызывается.
- Скрытый документ также пропускает transition.
- Новый transition абортит активный; текущая проверка `activeTransition` поэтому разумна.

`ViewTransition` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition)) даёт `ready`, `updateCallbackDone`, `finished` и `skipTransition()`. Текущий код корректно глушит rejection у `ready`/`updateCallbackDone` и чистит состояние на `finished`.

### 2.2 Порядок навигации Vue Router

Из [Vue Router Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.md):

1. `beforeEach`
2. `beforeRouteUpdate`
3. `beforeEnter`
4. **Resolve async route components**
5. `beforeRouteEnter`
6. **`beforeResolve`**
7. Navigation confirmed
8. `afterEach`
9. **DOM updates triggered**

Отсюда два следствия:

- `beforeEach` срабатывает слишком рано: VT может ждать загрузки чанка, хотя old snapshot уже снят.
- `afterEach` выполняется до DOM update; чтобы пометить новую строку списка, нужен `nextTick()` именно после `afterEach`, а не опрос внутри update callback.

### 2.3 Официальный минимальный паттерн

Прямо из [Vue Router Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.md):

```ts
// Иллюстрация; в репозиторий не применялось.
router.beforeResolve(async (to, from) => {
  if (from.name && to.name !== from.name) {
    await new Promise<void>((resolve) => {
      document.startViewTransition(resolve);
    });
  }
});
```

Здесь `resolve` — и есть `updateCallback`. Guard отпускается сразу после old snapshot; Vue Router подтверждает навигацию и обновляет DOM в microtasks, а браузер снимает new snapshot в следующем кадре.

### 2.4 Минимальный паттерн для этого приложения

Нужна пара row→hero и на обратном пути, поэтому source для `back` надо повесить после DOM-обновления, но до new snapshot:

```ts
// Иллюстрация; в репозиторий не применялось.
import { nextTick } from "vue";

appRouter.beforeResolve(async (to, from) => {
  if (!shouldTransition(to, from)) return;

  // old snapshot: строка уже помечена click-обработчиком, но страховка полезна.
  markSource(to, from);

  await new Promise<void>((resolveGuard) => {
    const vt = document.startViewTransition(resolveGuard);
    const finish = () => {
      clearSource();
      if (isForward(to, from)) focusPanel();
    };
    void vt.finished.then(finish, finish);
  });
});

appRouter.afterEach((to, from, failure) => {
  if (failure || !shouldTransition(to, from) || !isBack(to, from)) return;
  // afterEach → затем DOM update; одного тика Vue достаточно до new snapshot.
  void nextTick().then(() => markSource(to, from));
});
```

Ключевое отличие от текущего кода: **никакого `waitForNewRoute()`** и никакого ожидания `router.currentRoute` внутри update callback. update callback завершается сразу, как в docs; `afterEach + nextTick()` только расставляет имена для нового кадра.

### 2.5 `RouterLink viewTransition`

[`UseLinkOptions.viewTransition`](https://router.vuejs.org/api/interfaces/UseLinkOptions.html) описывается так: «Pass the returned promise of `router.push()` to `document.startViewTransition()` if supported». Это удобно для простых ссылок, но не позволяет задать `types`, `view-transition-name` и direction, поэтому для row→hero morph недостаточно.

### 2.6 Браузерные ограничения, важные для этого проекта

- Safari 18.0 уже поддерживает same-document CSS View Transitions Level 1, `startViewTransition()` и `view-transition-name` ([WebKit](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)).
- View Transition Types и Classes появились только в Safari 18.2; там же `view-transition-name: auto` и cross-document transitions ([WebKit](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)).
- `view-transition-name: match-element` — Safari 18.4, только для same-document ([WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).
- WebKit bug [302256](https://bugs.webkit.org/show_bug.cgi?id=302256): `backdrop-filter` отключается во время view transition. В этом репозитории `AppNavbar.vue` использует `backdrop-filter`, а navbar/root не выведены из root snapshot. Нужно либо не анимировать root/navbar, либо временно снимать blur на время VT.
- Chrome рекомендует после смены view переводить фокус на heading/container с `tabindex="-1"` сразу после DOM update или по `finished` ([Same Document Transitions](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/same-document-transitions)). Текущий `focusPanel()` на `finished` соответствует этому; tab switch оставляет фокус нетронутым — тоже правильно.

---

## 3. Дополнительная тема A: Vue `<Transition>` и `<TransitionGroup>`

### 3.1 Что documented API умеет

По [Vue `<Transition>` guide](https://vuejs.org/guide/built-ins/transition.md) и [API](https://vuejs.org/api/built-in-components#transition):

- `<Transition>` даёт enter/leave анимацию для **одного** элемента или компонента; Vue Router использует её через `<RouterView v-slot="{ Component }"><Transition><component :is="Component" /></Transition></RouterView>` ([Vue Router Transitions](https://router.vuejs.org/guide/advanced/transitions.md)).
- `mode="out-in"` / `mode="in-out"` управляют порядком leave/enter; `appear` включает анимацию initial render; с `<RouterView>` initial enter всё равно запускается из-за асинхронности router navigation.
- JS hooks: `@before-enter`, `@enter(el, done)`, `@after-enter`, `@enter-cancelled`, `@before-leave`, `@leave(el, done)`, `@after-leave`, `@leave-cancelled`.
- С `:css="false"` Vue не детектит CSS и **обязывает** вызывать `done()` в `@enter`/`@leave`, иначе переход закончится синхронно.
- `:key` может заставить Vue создать новый DOM-элемент и тем самым получить переход между разными состояниями.

По [Vue `<TransitionGroup>` guide](https://vuejs.org/guide/built-ins/transition-group.md) и [API](https://vuejs.org/api/built-in-components#transitiongroup):

- принимает те же props, кроме `mode`; добавляет `tag` и `moveClass`;
- дети обязаны иметь уникальные `key`;
- move-анимация реализована через FLIP: при изменении позиции ребёнка добавляется класс `.list-move` / `move-class`, и если `transform` transition-able, элемент плавно едет в новое место;
- для корректного расчёта move leaving-элементы обычно делают `position: absolute`;
- `:css="false"` + JS hooks работают так же; официальный пример использует GSAP и `onComplete: done`.

### 3.2 Минимальный пример route-level `<Transition>` с GSAP hooks

```vue
<!-- Иллюстрация; в репозиторий не применялось. -->
<RouterView v-slot="{ Component, route }">
  <Transition
    :css="false"
    @enter="onEnter"
    @leave="onLeave"
  >
    <component :is="Component" :key="route.path" />
  </Transition>
</RouterView>
```

```ts
function onEnter(el: Element, done: () => void) {
  gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, onComplete: done });
}

function onLeave(el: Element, done: () => void) {
  gsap.to(el, { opacity: 0, duration: 0.18, onComplete: done });
}
```

### 3.3 Минимальный пример `<TransitionGroup>` для перестановки списка

```vue
<!-- Иллюстрация; в репозиторий не применялось. -->
<TransitionGroup tag="div" name="row" class="parcel-list">
  <ParcelListItem v-for="item in items" :key="item.id" :parcel="item" />
</TransitionGroup>
```

```css
.row-move,
.row-enter-active,
.row-leave-active {
  transition:
    transform 260ms ease,
    opacity 260ms ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.row-leave-active {
  position: absolute;
}
```

### 3.4 Пригодность для задач проекта

| Задача                            | `<Transition>`                                                                | `<TransitionGroup>`                                | Вердикт                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parcels → parcel` row/hero morph | Нет: это enter/leave двух разных DOM-деревьев, а не один непрерывный элемент. | Нет: FLIP работает с ключами внутри одного списка. | Нужны VT shared names или GSAP Flip.                                                                                                                                                  |
| tab↔tab (`parcels/people/add`)    | Да, простой fade/out-in.                                                      | Не нужен.                                          | Хорошая замена VT, если вообще решено анимировать табы; но текущий e2e ожидает 0 VT и без фокуса. `<Transition>` не вызовет `startViewTransition`, поэтому контракт теста сохранится. |
| detail→list «назад»               | Да как fade, но без морфа в исходную строку.                                  | Нет.                                               | Для морфа — VT/Flip; для простого возврата можно `<Transition mode="out-in">`.                                                                                                        |
| перестановка строк списка         | Нет.                                                                          | Да, это прямой use case.                           | Пригодится, если появится сортировка; сейчас в коде такой задачи нет.                                                                                                                 |

Итог по теме A: `<Transition>` — правильный инструмент для **panel/tab переходов и fallback-анимаций**, но он не заменяет shared-element morph. `<TransitionGroup>` полезен только для reorder внутри списка.

---

## 4. Дополнительная тема B: GSAP reverse и Flip

GSAP сейчас **не установлен** в проекте (`package.json` содержит `vue` и `vue-router`, но не `gsap`); ниже — оценка возможностей, не предложение немедленно добавлять библиотеку.

### 4.1 Что документировано

По GSAP docs:

- [`gsap.to()`](<https://gsap.com/docs/v3/GSAP/gsap.to()/>) анимирует от текущих значений к заданным; [`gsap.from()`](<https://gsap.com/docs/v3/GSAP/gsap.from()>) задаёт старт и анимирует к текущему состоянию; [`gsap.fromTo()`](<https://gsap.com/docs/v3/GSAP/gsap.fromTo()>) задаёт оба конца. `immediateRender` по умолчанию `false` для `to()` и `true` для `from()` / `fromTo()`.
- [`timeline.reverse(from?, suppressEvents?)`](<https://gsap.com/docs/v3/GSAP/Timeline/reverse()/>) проигрывает назад от текущего playhead; `reverse(0)` начинает с конца, отрицательные значения — относительно конца. [`reversed(true)`](<https://gsap.com/docs/v3/GSAP/Timeline/reversed()>) только выставляет состояние «назад» и не зависит от `yoyo`.
- [`play()`](https://gsap.com/docs/v3/GSAP/Timeline/play/) — вперёд с текущей позиции; [`restart()`](<https://gsap.com/docs/v3/GSAP/Timeline/restart()>) — с начала; [`timeScale(-1)`](<https://gsap.com/docs/v3/GSAP/Timeline/timeScale()>) — назад с нормальной скоростью; `timeScale` работает как getter/setter.
- [`yoyo`](<https://gsap.com/docs/v3/GSAP/Timeline/yoyo()>) требует ненулевого [`repeat`](https://gsap.com/docs/v3/GSAP/Timeline/repeat/) и просто чередует направление на каждом повторе (`repeat: -1` — бесконечно). **Yoyo — не «кнопка назад»**: это циклическое колебание.
- `onReverseComplete` — callback при достижении начала реверсом ([eventCallback](https://gsap.com/docs/v3/GSAP/Timeline/eventCallback/)); `kill()` удаляет анимацию.
- [`gsap.context()`](https://gsap.com/docs/v3/GSAP/gsap.context/) собирает все созданные внутри tween/timeline и `ctx.revert()` их убивает/возвращает начальные стили. Для Vue 3 docs явно говорят: после `onMounted()` передавать `container.value`, а не сам ref. Общий [ frameworks guide](https://gsap.com/resources/frameworks) настаивает на cleanup в SPA.
- [Flip](https://gsap.com/docs/v3/Plugins/Flip/): `Flip.getState(targets)` сохраняет размеры, rotation, skew, opacity и позицию во viewport; после DOM-изменения `Flip.from(state, vars)` сразу возвращает элементы к старой геометрии и анимирует их к новой, возвращая Timeline. Два разных элемента связываются через одинаковый `data-flip-id`; есть `fade: true`, `absolute`, `scale: true`, `simple`, `onEnter`, `onLeave`. [`Flip.from()`](https://gsap.com/docs/v3/Plugins/Flip/static.from/) и [`Flip.getState()`](<https://gsap.com/docs/v3/Plugins/Flip/static.getState()>) — официальные страницы API.

### 4.2 Минимальный пример «вперёд / назад» на одном timeline

```ts
// Иллюстрация; в репозиторий не применялось.
const tl = gsap
  .timeline({ paused: true, onReverseComplete: () => cleanup() })
  .fromTo(panel, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.26 });

tl.play(); // forward
tl.reverse(); // back из текущей позиции
// tl.timeScale(-1).play() — альтернатива; НЕ yoyo/repeat
```

### 4.3 Минимальный Flip fallback для row→hero

```ts
// Иллюстрация; в репозиторий не применялось.
const state = Flip.getState('[data-flip-id="parcel-2-title"]');

await router.push({ name: "parcel", params: { parcelId: "2" } });
await nextTick();

Flip.from(state, {
  duration: 0.26,
  ease: "power2.out",
  scale: true,
  absolute: true,
  fade: true,
});
```

В разметке и строке, и hero должен быть один и тот же `data-flip-id="parcel-2-title"`. Это ключевое отличие от текущего VT-подхода: VT использует CSS `view-transition-name`, Flip — JS-состояние + identity через `data-flip-id`.

### 4.4 Пригодность для задач проекта

| Задача              | GSAP timeline reverse                                                                                                                                                            | GSAP Flip                                                                             | Вердикт                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| detail→list «назад» | Хорошо, **если** анимация относится к элементу, который ещё жив (overlay/persistent panel). После route change старые DOM-ноды удалены — просто `reverse()` по ним не сработает. | Хорошо: state снимается до push, элемент сопоставляется по `data-flip-id` после push. | Flip реалистичнее, чем reverse старой timeline.                  |
| row→hero morph      | Сам по себе нет.                                                                                                                                                                 | Да, ближайший JS-аналог VT shared elements.                                           | Рассматривать как fallback для Safari <18.0 / когда VT отключён. |
| tab switch          | `fromTo` по panel — проще и дешевле VT-снапшотов.                                                                                                                                | Не нужен.                                                                             | Хороший кандидат, если добавим GSAP.                             |
| cleanup при unmount | `gsap.context()` + `ctx.revert()` в `onUnmounted`/`onScopeDispose`.                                                                                                              | Flip.from возвращает Timeline — тоже должен попасть в context.                        | Обязательно.                                                     |

---

## 5. Рекомендации для этого репозитория

### Приоритет 1 — исправить интеграцию с Router

1. Оставить auth-логику в `beforeEach`.
2. Перенести VT в `beforeResolve`, чтобы все lazy chunks были уже загружены.
3. Заменить `async update` + `waitForNewRoute()` на документированный `document.startViewTransition(resolveGuard)`.
4. Для `back` ставить source-имя в `afterEach → nextTick()`, а не внутри update callback.
5. Удалить `types: [direction]`, пока нет `:active-view-transition-type()` в CSS; либо оставить как progressive enhancement, но не считать рабочим механизмом в Safari 18.0/18.1.

### Приоритет 2 — разделить механизмы по задачам

- **Shared-element row→hero / hero→row:** оставить VT как основной путь; при отказе VT (unsupported, hidden document, duplicate name) использовать GSAP Flip с `data-flip-id`.
- **Tab switch и простой panel fade:** использовать Vue `<Transition>` (CSS или `:css="false"` hooks). Это дешевле, работает без VT API и не ломает текущий e2e контракт (`transitions: 0`).
- **`yoyo`/`repeat` не использовать** как «назад»; для реверса — `reverse()` / `reversed(true)` / `timeScale(-1)`.
- `<TransitionGroup>` не внедрять без задачи reorder; сейчас её нет.

### Приоритет 3 — кросс-браузерная и a11y-жёсткость

- Сохранить текущие проверки: `prefers-reduced-motion`, feature detection, `activeTransition`, `sign-in`, same-path, tab skip.
- В WebKit проверить `AppNavbar.vue` с `backdrop-filter` во время VT; при баге 302256 временно отключать blur или выводить navbar в отдельный snapshot без анимации/_root.
- Оставлять `#panel-container` с `tabindex="-1"` и подавлять outline; фокус — только для forward и после `finished`/DOM update; табы фокус не трогают.
- Обновить e2e: проверять, что VT регистрируется именно из `beforeResolve` (например, через order-of-guards spy), что `updateCallback` не ожидает route polling, и что cleanup снимает `.is-vt-source` после skipped/failed navigation.
- Если добавится GSAP, все tween/timeline/Flip создавать внутри `gsap.context(..., panelEl)`, с `revert()` в `onScopeDispose()`/`onUnmounted()`.

---

## 6. Источники

### Vue / Vue Router

- https://vuejs.org/guide/built-ins/transition.md
- https://vuejs.org/guide/built-ins/transition-group.md
- https://vuejs.org/api/built-in-components.md#transition
- https://vuejs.org/api/built-in-components.md#transitiongroup
- https://router.vuejs.org/guide/advanced/transitions.md
- https://router.vuejs.org/guide/advanced/navigation-guards.md
- https://router.vuejs.org/guide/advanced/lazy-loading.md
- https://router.vuejs.org/api/interfaces/UseLinkOptions.html

### View Transitions API

- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition
- https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition
- https://drafts.csswg.org/css-view-transitions-1/
- https://developer.chrome.com/docs/web-platform/view-transitions
- https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/same-document-transitions
- https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
- https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- https://bugs.webkit.org/show_bug.cgi?id=302256

### GSAP

- https://gsap.com/docs/v3/GSAP/gsap.to()/
- https://gsap.com/docs/v3/GSAP/gsap.from()/
- https://gsap.com/docs/v3/GSAP/gsap.fromTo()/
- https://gsap.com/docs/v3/GSAP/Timeline/reverse()/
- https://gsap.com/docs/v3/GSAP/Timeline/reversed()/
- https://gsap.com/docs/v3/GSAP/Timeline/play()/
- https://gsap.com/docs/v3/GSAP/Timeline/restart()/
- https://gsap.com/docs/v3/GSAP/Timeline/timeScale()/
- https://gsap.com/docs/v3/GSAP/Timeline/yoyo()/
- https://gsap.com/docs/v3/GSAP/Timeline/repeat()/
- https://gsap.com/docs/v3/GSAP/Timeline/eventCallback()/
- https://gsap.com/docs/v3/GSAP/gsap.context()/
- https://gsap.com/docs/v3/Plugins/Flip/
- https://gsap.com/docs/v3/Plugins/Flip/static.getState()/
- https://gsap.com/docs/v3/Plugins/Flip/static.from()/
- https://gsap.com/resources/frameworks
