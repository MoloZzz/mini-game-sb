---
tags: [architecture, api]
---

# API Contracts

Back to [[00 - Card Game MOC]] · Schema → [[02 - Architecture - Data Model]]

Base URL: `http://localhost:3000/api`
Static assets: `http://localhost:3000/static/cards/ember-drake-a3f1.png`

## Most Important Endpoint

### `POST /cases/:slug/open`

This is the heart of the game. One call does everything: checks the balance, debits the price,
runs the RNG, creates the drop, puts the card in the inventory, and builds the reel.

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
    // ... exactly 60 elements
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

**The contract that makes the entire animation trivial:**
the winner is ALWAYS at index `winningIndex` (a constant 55 out of 60).
The UI does not think about probabilities; it spins to a known position.
The other 59 tiles are decoration generated to look plausible
(not all common, but without an excess of legendaries).

**Errors**
- `402 INSUFFICIENT_FUNDS` — `{ "code": "INSUFFICIENT_FUNDS", "need": { "keys": 1 }, "have": { "keys": 0 } }`
- `409 EMPTY_POOL` — there are no approved cards of the required rarity
- `404 CASE_NOT_FOUND`

**Transactional integrity:** everything is in one Postgres transaction with
`SELECT ... FOR UPDATE` on the player row. Without this, a double-click on a case
can open two cases for one key.

**Idempotency:** optional `Idempotency-Key` header. Stretch goal, but
it protects against double-clicks more reliably than button throttling.

## Catalog

### `GET /cards`
Query: `?rarity=epic&element=fire&status=approved&page=1&limit=40`

```json
{ "items": [ /* CardDto */ ], "total": 312, "page": 1, "limit": 40 }
```

### `GET /cards/:id`
Full card + `genMeta` (dev mode only — the player does not need the seed,
but you need it a lot while tuning prompts).

## Cases

### `GET /cases`
```json
[{
  "slug": "starter-chest", "name": "Starter Chest",
  "priceCoins": 250, "priceKeys": null,
  "imageUrl": "/static/cases/starter.png",
  "odds": { "common": 60, "uncommon": 22, "rare": 12, "epic": 4.5, "legendary": 1.3, "mythic": 0.2 },
  "previewCards": [ /* 6 best cards for the showcase */ ]
}]
```

**Show `odds` in the UI.** First, this is what legitimate iGaming products do.
Second, it is simply interesting to the player. Third, it is a free trust-building element.

## Player and Inventory

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
Grouping by card with a `copies` counter is more readable than 61 tiles,
three of which are identical.

### `POST /me/inventory/:instanceId/sell`
Sells one instance. Price = the rarity’s `sellValue`
(see [[04 - Game Design - Core Loop]]).
```json
{ "gained": { "coins": 40 }, "balance": { "coins": 790, "keys": 4 } }
```
Protection: prohibit selling the last instance of a card so the player
does not accidentally lose the collection. Rule: `copies > 1` for a sale.

### `GET /me/drops?limit=20`
Opening history. This provides a free “recent drops” feature as a reel in the lobby.

## Admin (for card-forge and manual review)

### `POST /admin/cards/ingest`
`card-forge` calls this after a batch. Bulk insertion with `status: draft`.
```json
{ "cards": [{
    "slug": "ember-drake-a3f1",
    "imagePath": "cards/ember-drake-a3f1.png",
    "thumbPath": "thumbs/ember-drake-a3f1.webp",
    "suggestedRarity": "epic",
    "archetype": "beast", "element": "fire",
    "genMeta": { /* see Data Model */ }
}]}
```
Response: `{ "inserted": 24, "skipped": 2, "skippedSlugs": ["..."] }`
Idempotent by `slug`; rerunning does not create duplicates.

### `PATCH /admin/cards/:id`
Manual review: `{ "status": "approved", "name": "Ember Drake", "rarity": "epic",
"attack": 12, "defense": 7, "flavorText": "..." }`

### `GET /admin/cards?status=draft`
Review queue. The UI will have a simple contact-sheet grid for this.

## Shared DTOs

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
  imageUrl: string;   // already includes the base URL; the UI concatenates nothing
  thumbUrl: string;
}
```

**Keep these types in one place.** Options: `packages/shared-types` as an
npm workspace, or simply symlink one `.d.ts`. With three services,
a monorepo with workspaces pays off immediately; DTOs will not drift out of sync.

The Python service does not share types; a pydantic model
for the single ingest request is sufficient there.

## What Is Deliberately Absent

- **Auth** — one local player, `playerId` from env or the first row in the table.
  Adding JWT later is one guard, not a rewrite.
- **WebSocket** — nothing is real-time. The roulette is request → animate.
- **Cursor pagination** — offset is sufficient for hundreds of cards.
- **Rate limiting** — there is one player, and it is you.
