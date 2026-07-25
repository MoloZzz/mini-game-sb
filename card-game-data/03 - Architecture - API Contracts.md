---
tags: [architecture, api]
---

# API контракти

Назад до [[00 - Card Game MOC]] · Схема → [[02 - Architecture - Data Model]]

Base URL: `http://localhost:3000/api`
Статика: `http://localhost:3000/static/cards/ember-drake-a3f1.png`

## Найважливіший ендпоінт

### `POST /cases/:slug/open`

Це серце гри. Один виклик робить усе: перевіряє баланс, списує ціну,
кидає RNG, створює дроп, кладе картку в інвентар, будує стрічку.

**Request**
```json
{ "clientSeed": "optional-string" }
```

**Response 200**
```json
{
  "dropId": "8f2a...",
  "reel": [
    { "id": "...", "name": "Bog Rat",    "rarity": "common", "imageUrl": "/static/thumbs/bog-rat.webp" },
    { "id": "...", "name": "Ash Sprite", "rarity": "uncommon", "imageUrl": "..." }
    // ... рівно 60 елементів
  ],
  "winningIndex": 55,
  "wonCard": {
    "id": "...", "name": "Ember Drake", "rarity": "legendary",
    "element": "fire", "archetype": "beast",
    "attack": 12, "defense": 7,
    "flavorText": "Its breath remembers the first fire.",
    "imageUrl": "/static/cards/ember-drake-a3f1.png"
  },
  "isDuplicate": false,
  "balance": { "coins": 750, "keys": 4 }
}
```

**Контракт, який робить усю анімацію тривіальною:**
переможець ЗАВЖДИ на індексі `winningIndex` (константа 55 з 60).
UI не думає про ймовірності — він прокручує до відомої позиції.
Решта 59 плиток — декорація, згенерована так, щоб виглядати правдоподібно
(не всі common, але й без надлишку легендарок).

**Помилки**
- `402 INSUFFICIENT_FUNDS` — `{ "code": "INSUFFICIENT_FUNDS", "need": { "keys": 1 }, "have": { "keys": 0 } }`
- `409 EMPTY_POOL` — немає approved карток потрібної рідкості
- `404 CASE_NOT_FOUND`

**Транзакційність:** усе в одній Postgres-транзакції з
`SELECT ... FOR UPDATE` на рядку гравця. Без цього подвійний клік по кейсу
може відкрити два кейси за один ключ.

**Ідемпотентність:** опційний заголовок `Idempotency-Key`. Стретч, але
рятує від дабл-кліків надійніше за throttle на кнопці.

## Каталог

### `GET /cards`
Query: `?rarity=epic&element=fire&status=approved&page=1&limit=40`

```json
{ "items": [ /* CardDto */ ], "total": 312, "page": 1, "limit": 40 }
```

### `GET /cards/:id`
Повна картка + `genMeta` (тільки в dev-режимі — гравцю сід не потрібен,
але тобі під час тюнінгу промптів дуже потрібен).

## Кейси

### `GET /cases`
```json
[{
  "slug": "starter-chest", "name": "Starter Chest",
  "priceCoins": 250, "priceKeys": null,
  "imageUrl": "/static/cases/starter.png",
  "odds": { "common": 60, "uncommon": 22, "rare": 12, "epic": 4.5, "legendary": 1.3, "mythic": 0.2 },
  "previewCards": [ /* 6 найкращих карток для вітрини */ ]
}]
```

**Показуй `odds` у UI.** По-перше, це те, що роблять легальні iGaming-продукти.
По-друге, це просто цікаво гравцю. По-третє — безкоштовний елемент довіри.

## Гравець та інвентар

### `GET /me`
```json
{ "id": "...", "displayName": "Molo", "balance": { "coins": 750, "keys": 4 },
  "stats": { "casesOpened": 42, "uniqueCards": 28, "totalCards": 61 } }
```

### `GET /me/inventory`
Query: `?rarity=&sort=rarity_desc&page=1`
```json
{ "items": [{ "instanceId": "...", "card": { /* CardDto */ },
              "acquiredAt": "...", "copies": 3 }], "total": 28 }
```
Групування по картці з лічильником `copies` — читабельніше, ніж 61 плитка,
де три однакові.

### `POST /me/inventory/:instanceId/sell`
Продає один екземпляр. Ціна = `sellValue` рідкості
(див. [[04 - Game Design - Core Loop]]).
```json
{ "gained": { "coins": 40 }, "balance": { "coins": 790, "keys": 4 } }
```
Захист: заборонити продаж останнього екземпляра картки — щоб гравець
випадково не втратив колекцію. Правило: `copies > 1` для продажу.

### `GET /me/drops?limit=20`
Історія відкриттів. Дає безкоштовну фічу «recent drops» стрічкою у лоббі.

## Admin (для card-forge та ручного review)

### `POST /admin/cards/ingest`
`card-forge` дзвонить сюди після batch. Bulk-вставка як `status: draft`.
```json
{ "cards": [{
    "slug": "ember-drake-a3f1",
    "imagePath": "cards/ember-drake-a3f1.png",
    "thumbPath": "thumbs/ember-drake-a3f1.webp",
    "suggestedRarity": "epic",
    "archetype": "beast", "element": "fire",
    "genMeta": { /* див. Data Model */ }
}]}
```
Response: `{ "inserted": 24, "skipped": 2, "skippedSlugs": ["..."] }`
Idempotent по `slug` — повторний запуск не дублює.

### `PATCH /admin/cards/:id`
Ручний review: `{ "status": "approved", "name": "Ember Drake", "rarity": "epic",
"attack": 12, "defense": 7, "flavorText": "..." }`

### `GET /admin/cards?status=draft`
Черга на review. Під це буде проста сітка-контактшит в UI.

## Спільні DTO

```ts
type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

interface CardDto {
  id: string;
  name: string;
  rarity: Rarity;
  element: Element | null;
  archetype: Archetype;
  attack: number;
  defense: number;
  flavorText: string | null;
  imageUrl: string;   // вже з базовим URL, UI нічого не склеює
  thumbUrl: string;
}
```

**Тримай ці типи в одному місці.** Варіанти: `packages/shared-types` як
npm workspace, або просто симлінк одного `.d.ts`. На трьох сервісах
монорепо з workspaces окупається одразу — не буде розсинхрону DTO.

Python-сервіс типи не ділить — там достатньо pydantic-моделі
для одного ingest-запиту.

## Чого свідомо немає

- **Auth** — один локальний гравець, `playerId` з env або першого рядка таблиці.
  Додати JWT потім — це один guard, не переробка.
- **WebSocket** — нема нічого реалтаймового. Рулетка це request → animate.
- **Пагінація курсором** — offset достатньо для сотень карток.
- **Rate limiting** — гравець один, і це ти.
