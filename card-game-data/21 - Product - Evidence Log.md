---
tags: [product, evidence, research, agent-context]
status: active
---

# Журнал доказів

Назад до [[00 - Card Game MOC]] · Стратегія → [[18 - Product - Strategy]] · Метрики → [[20 - Product - Metric Tree]] · Ідеї → [[22 - Product - Opportunity Backlog]]

## Правило журналу

Тут зберігаються перевірювані спостереження, а не припущення, красиві ідеї чи неперевірені поради. Наразі в журналі **немає валідованих користувацьких доказів**. Не роби з цього висновок про гравців.

Джерело має дозволяти перевірити контекст без збереження зайвих персональних даних. Анонімізуй гравця, не записуй email, токени, паролі, повні логи або чутливий вільний текст без згоди.

## Evidence

Додай один запис на спостереження. Не редагуй старий результат так, щоб він зник: зафіксуй новіший запис, який його уточнює або спростовує.

### E-2026-07-29-01 · Desk research: безперервність колекційної сесії

- **Дата:** 2026-07-29
- **Статус:** raw
- **Тип:** зовнішнє дослідження
- **Джерело й спосіб:** незалежний desk review шести вузьких напрямів з
  валідацією першоджерел. [Hearthstone](https://news.blizzard.com/en-gb/article/23357896/ashes-of-outland-patch-17-0-march-26)
  документує duplicate protection у межах сету й рідкості без зміни rarity
  distribution; [MTG Arena](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-economy-2022-03-17)
  описує економіку як усі способи заробітку й витрат ресурсів для різних
  стадій гравця; [Machinations](https://machinations.io/docs/framework-basics)
  формалізує source, pool, drain і stochastic flow; [Nielsen Norman Group](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary_Letter_compressed.pdf)
  підтверджує вимоги до видимості стану та конструктивного recovery UX.
- **Вибірка:** не дослідження наших гравців; зовнішні продукти з іншими
  бізнес-моделями та один методологічний/UX-огляд.
- **Спостереження:** зовнішні приклади використовують protected draws,
  finite guaranteed progress і прозорі правила як альтернативи очікуванню;
  вони не є доказом retention або попиту в цій локальній грі.
- **Інтерпретація:** варто змоделювати й playtest-ити проблему soft lock
  окремо від бажання мати довшу сесію. Duplicate protection зменшує втрату
  прогресу, але саме по собі не створює коштів для відкриття з нульовим
  балансом.
- **Пов'язані job / метрика:** [[19 - Product - Jobs To Be Done]] —
  «перетворити зайве на осмислений наступний шанс»; [[20 - Product - Metric
  Tree]] — net coins/keys за сесію, невдалі спроби відкрити кейс і якісна
  причина зупинки.
- **Обмеження:** немає локального зрізу частки гравців нижче ціни кейсу,
  вибірки playtest або причинного порівняння варіантів.
- **Наступна дія:** спершу прогнати моделювання балансу за seeded RNG для
  нового, середнього та майже повного акаунта; потім порівняти малий
  onboarding runway з condition-based recovery у scripted playtest.

### E-2026-07-29-02 · Seeded model of current session economy

- **Дата:** 2026-07-29
- **Статус:** raw
- **Тип:** локальна подія
- **Джерело й спосіб:** `npm.cmd run simulate:economy --workspace game-api --
  --runs=10000 --max-opens=250` against the seeded local database. The model
  read 452 approved cards (`188/113/67/37/31/16` by rarity) and ten active
  cases. It always chose the cheapest affordable coin case, otherwise the
  cheapest key case; daily bonus was already claimed, so no wait-time income
  existed during the session.
- **Вибірка:** 10,000 deterministic simulated runs each for new, mid and
  near-complete inventories; this is a model of system rules, not players.
- **Спостереження:** with no duplicate sale, a new post-daily account reached
  a hard lock after 30.8 opens on average (worst run 27); mid and near-complete
  accounts stopped after 10. With immediate sale of every duplicate — an
  optimistic policy absent from the current UI — new accounts averaged 31.9
  opens, mid 18.4 and near-complete 31.6. Almost every run still reached a
  balance below the 100-coin Starter Chest before 250 opens.
- **Інтерпретація:** the current sources are a finite session budget, not a
  continuous-session economy. Duplicate sale improves the middle and end but
  cannot be the early-game recovery path.
- **Пов'язані job / метрика:** [[19 - Product - Jobs To Be Done]] —
  «перетворити зайве на осмислений наступний шанс»; [[20 - Product - Metric
  Tree]] — net coins/keys за сесію та невдалі спроби відкрити кейс.
- **Обмеження:** modelled case choice is not observed behaviour; it does not
  model UI comprehension, voluntary stopping, targeted Cinderbound Cache
  choice, manual inventory actions or future recovery mechanics.
- **Наступна дія:** run a scripted playtest of the zero-balance state and
  obtain an owner decision on whether the product should support a finite
  opening session or a repeatable non-timed source of further opens.

```md
### E-<YYYY-MM-DD>-<XX> · <коротка назва>

- **Дата:** <TBD>
- **Статус:** raw | reviewed | superseded
- **Тип:** playtest | локальна подія | інтерв'ю | баг | зовнішнє дослідження
- **Джерело й спосіб:** <де виникло та як зібрано; для подій — назва зрізу/версії>
- **Вибірка:** <кількість сесій/учасників; спосіб відбору; невідомі зміщення>
- **Спостереження:** <лише те, що сталося або було сказано>
- **Інтерпретація:** <що це може означати; не подавай як факт>
- **Пов'язані job / метрика:** <посилання на JTBD і Metric Tree>
- **Обмеження:** <чого цей запис не доводить>
- **Наступна дія:** <повторити, поставити питання, створити/оновити opportunity або закрити>
```

## Як зібрати перші докази локально

1. Провести короткий playtest: дати людині виконати перше відкриття без підказок, потім спитати, що вона хотіла зробити далі й де зупинилась.
2. Зберегти лише агрегований локальний зріз подій після того, як [[20 - Product - Metric Tree|план подій]] реалізовано й пояснено користувачеві.
3. Відокремити баг від продуктової проблеми: помилка відкриття — доказ про якість, але не доказ цінності аукціону чи лору.

## Сила доказу

| Рівень | Приклад | Допустиме використання |
|---|---|---|
| Слабкий | одна розмова або один playtest | сформувати гіпотезу й наступне питання |
| Середній | повторюваний патерн у кількох незалежних сесіях | ранжувати малий MVP |
| Сильний | повторювані події + якісне пояснення в релевантному сегменті | рекомендувати масштабування або рішення |

Число учасників саме по собі не робить доказ сильним: спосіб відбору, контекст і альтернативні пояснення обов'язкові.
