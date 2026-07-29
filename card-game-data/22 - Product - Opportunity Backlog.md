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
