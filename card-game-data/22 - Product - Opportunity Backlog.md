---
tags: [product, opportunities, backlog, agent-context]
status: active
---

# Backlog продуктових можливостей

Назад до [[00 - Card Game MOC]] · Стратегія → [[18 - Product - Strategy]] · Докази → [[21 - Product - Evidence Log]] · Системи → [[14 - Product - System Landscape]]

## Правило backlog

Запис тут — **гіпотеза для рішення**, а не затверджена roadmap-фіча й не канон. Реалізований або запланований статус системи змінюється тільки у [[14 - Product - System Landscape]] після рішення власника продукту.

Ранжування потрібне, щоб обрати наступний тест, а не створити фальшиву точність. Не став `confidence` вище слабкого, якщо немає посилання на [[21 - Product - Evidence Log|доказ]].

## Opportunities

### O-002 · Session expeditions

- **Статус:** ready-for-test (owner delegated the MVP boundary on 2026-07-29;
  brief → [[24 - Product - Session Expeditions Brief]]).
- **Job / сегмент-гіпотеза:** collector — know what to do in this session without
  a calendar obligation.
- **Проблема:** a set explains a long-term chase but not always the next
  meaningful action in a short session.
- **Гіпотеза:** one optional session expedition with a visible, finite action
  will create a clearer next step than a generic milestone.
- **Докази:** none; it is not a retention claim.
- **Метрика / guardrail:** `case_opened → reveal_completed → collection_viewed`;
  guardrail new unique cards per opening, net coins/keys per session, and a
  qualitative report of pressure or confusion. Baseline and threshold are open.
- **Найменший тест:** scripted playtest, one expedition versus no expedition;
  ask “What would you do next, and why?”
- **Вплив:** core loop, economy, UI; no real-money scope.
- **Ризики:** a daily/streak version could manufacture obligation or become an
  uncontrolled currency source. MVP excludes streaks, timers and new currency.
- **Оцінка:** session expedition 4 × 5 × 2 / 4 = 10; daily task 3 × 4 × 2 / 3 =
  8. Confidence is weak because no player evidence exists.
- **Наступне рішення:** implement only the smallest non-economic session flow
  after the Ashen Wastes playtest; stop or revise if players cannot explain why
  they chose it or report pressure.

### O-001 · Ashen Wastes set

- **Статус:** testing (implemented locally on 2026-07-29; owner delegated the product choice).
- **Job / сегмент-гіпотеза:** collector — see an incomplete themed set and
  move toward finishing it.
- **Проблема:** the current full-pool gallery shows missing cards but does not
  provide a small, meaningful collection target.
- **Гіпотеза:** a visible 0/20 Ashen Wastes goal and its dedicated case will
  give a collector a clearer reason to return to the case loop.
- **Докази:** none; this remains a hypothesis, not a claim of demand.
- **Метрика / guardrail:** primary `case_opened → reveal_completed →
  collection_viewed`; guardrail new unique cards per opening and net
  coins/keys per session. Baseline and thresholds are open.
- **Найменший тест:** scripted local playtest: show the set goal after a
  reveal and ask, “What would you do next, and why?”
- **Вплив:** core loop, economy, content/lore, UI.
- **Ризики:** a targeted case can distort duplicate EV; the implemented 400-coin
  profile has full-duplicate EV 208.45 coins (52.1%); no completion reward.
- **Оцінка:** reach 4 × impact 5 × confidence 2 / effort 4 = 10; confidence
  is weak because there is no recorded player evidence.
- **Наступне рішення:** model case price/odds across new, mid, and
  near-complete collections; scale only if the playtest shows the set makes
  the next action clearer without displacing the core case loop.

Наразі backlog порожній: наявні напрямки (сети, крафт, магазин, NPC-аукціон, лор) уже мають статус у [[14 - Product - System Landscape]], але не мають достатніх доказів для пріоритету.

Додай запис за шаблоном. Зберігай коротким: детальний flow належить у [[17 - Product - Solution Brief Template|solution brief]].

```md
### O-<XXX> · <назва>

- **Статус:** discovery | ready-for-test | testing | decided | rejected
- **Job / сегмент-гiпотеза:** <посилання на [[19 - Product - Jobs To Be Done]]>.
- **Проблема або можливість:** <TBD>
- **Гіпотеза:** якщо <TBD>, то <TBD>, бо <TBD>.
- **Докази:** <[[21 - Product - Evidence Log#E-...]] або `немає`>.
- **Метрика успіху / guardrail:** <посилання на [[20 - Product - Metric Tree]]; поріг — `відкрито`, якщо не затверджений>.
- **Найменший тест:** <TBD>
- **Вплив на системи:** <core loop | економіка | контент/лор | UI; посилання на [[14 - Product - System Landscape]]>.
- **Ризики й межі:** <last copy, ledger, EV, scope або канон — що саме перевірити>.
- **Оцінка:** impact `low|medium|high`; confidence `weak|medium|strong`; effort `S|M|L`.
- **Наступне рішення:** <що має статися, щоб масштабувати, змінити або відкинути ідею>.
```

## Черга прийняття рішення

1. Зв'язати можливість з одним job і перевірюваною проблемою.
2. Додати наявний доказ або окремий спосіб його зібрати.
3. Відібрати MVP, який не порушує [[13 - Product - Context & Guardrails]] і, за потреби, [[15 - Product - Economy Context]].
4. Описати MVP у solution brief, реалізувати лише після рішення користувача.
5. Після тесту додати evidence; схвалене довгострокове правило записати у [[10 - Planning - Decisions]], а статус системи — у [[14 - Product - System Landscape]].

## Не плутати

- **Ідея без доказу** → opportunity зі статусом `discovery`.
- **Рішення користувача** → ADR/[[10 - Planning - Decisions]].
- **Планована система** → [[14 - Product - System Landscape]].
- **Невідповідь, яка блокує вибір** → [[11 - Planning - Open Questions]].
