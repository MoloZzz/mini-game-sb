# Generated project surface

> Generated from the source tree by `npm run sync:brain`. Do not edit manually; run that command after structural changes.

## API routes

| Method | Route | Source |
| --- | --- | --- |
| GET | `/api/admin/cards` | `game-api/src/admin/admin.controller.ts` → `list` |
| GET | `/api/auth/me` | `game-api/src/auth/auth.controller.ts` → `me` |
| GET | `/api/cards/:id` | `game-api/src/cards/cards.controller.ts` → `getById` |
| GET | `/api/cards` | `game-api/src/cards/cards.controller.ts` → `list` |
| GET | `/api/cases` | `game-api/src/cases/cases.controller.ts` → `list` |
| GET | `/api/health` | `game-api/src/health/health.controller.ts` → `check` |
| GET | `/api/me/collection/cards` | `game-api/src/collection/collection.controller.ts` → `getCollectionCards` |
| GET | `/api/me/collection/goal` | `game-api/src/collection/collection.controller.ts` → `getCollectionGoal` |
| GET | `/api/me/collection` | `game-api/src/collection/collection.controller.ts` → `getCollection` |
| GET | `/api/me/drops` | `game-api/src/inventory/inventory.controller.ts` → `listDrops` |
| GET | `/api/me/inventory` | `game-api/src/inventory/inventory.controller.ts` → `listInventory` |
| GET | `/api/me/milestones` | `game-api/src/milestones/milestones.controller.ts` → `getMilestones` |
| GET | `/api/me` | `game-api/src/players/players.controller.ts` → `getMe` |
| PATCH | `/api/admin/cards/:id` | `game-api/src/admin/admin.controller.ts` → `review` |
| POST | `/api/admin/cards/ingest` | `game-api/src/admin/admin.controller.ts` → `ingest` |
| POST | `/api/auth/login` | `game-api/src/auth/auth.controller.ts` → `login` |
| POST | `/api/auth/register` | `game-api/src/auth/auth.controller.ts` → `register` |
| POST | `/api/cases/:slug/open` | `game-api/src/drops/drops.controller.ts` → `open` |
| POST | `/api/me/daily-bonus` | `game-api/src/inventory/inventory.controller.ts` → `claimDailyBonus` |
| POST | `/api/me/inventory/:instanceId/sell` | `game-api/src/inventory/inventory.controller.ts` → `sellCard` |
| POST | `/api/me/inventory/sell-bulk` | `game-api/src/inventory/inventory.controller.ts` → `sellBulk` |

## Database entities

| Table | Entity | Source |
| --- | --- | --- |
| `cards` | `CardEntity` | `game-api/src/entities/card.entity.ts` |
| `case_openings` | `CaseOpeningEntity` | `game-api/src/entities/case-opening.entity.ts` |
| `cases` | `CaseEntity` | `game-api/src/entities/case.entity.ts` |
| `player_cards` | `PlayerCardEntity` | `game-api/src/entities/player-card.entity.ts` |
| `player_milestones` | `PlayerMilestoneEntity` | `game-api/src/entities/player-milestone.entity.ts` |
| `players` | `PlayerEntity` | `game-api/src/entities/player.entity.ts` |
| `transactions` | `TransactionEntity` | `game-api/src/entities/transaction.entity.ts` |

## Registered migration source files

- `game-api/src/migrations/1785017587632-InitialSchema.ts`
- `game-api/src/migrations/1785071982473-WidenCardArchetypeEnum.ts`
- `game-api/src/migrations/1785147378230-AddPlayerAuth.ts`
- `game-api/src/migrations/1785200000000-AddPlayerMilestones.ts`
- `game-api/src/migrations/1785200000001-UpdateStoneheartCofferPrice.ts`
- `game-api/src/migrations/1785200000002-AddLedgerInvariantTrigger.ts`
- `game-api/src/migrations/1785300000000-AddCaseSetScope.ts`

## Shared-type source modules

- `packages/shared-types/src/rarity.ts`
- `packages/shared-types/src/card.ts`
- `packages/shared-types/src/case.ts`
- `packages/shared-types/src/thematic-set.ts`
- `packages/shared-types/src/reel.ts`
- `packages/shared-types/src/player.ts`
- `packages/shared-types/src/milestones.ts`
- `packages/shared-types/src/api.ts`

## UI feature roots

- `game-ui/src/features/admin/`
- `game-ui/src/features/auth/`
- `game-ui/src/features/collection/`
- `game-ui/src/features/expeditions/`
- `game-ui/src/features/inventory/`
- `game-ui/src/features/lobby/`
- `game-ui/src/features/open/`
- `game-ui/src/features/reel/`
- `game-ui/src/features/reveal/`
