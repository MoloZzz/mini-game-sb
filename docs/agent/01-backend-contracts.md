# Backend contracts

## Boundary and startup

`game-api` is NestJS + TypeORM + Postgres. Global prefix is `/api`; `JWT_SECRET` is required at startup. `JwtAuthGuard` then `RolesGuard` protect every route unless `@Public()` opts out. The API binds to `127.0.0.1` by default and uses a configured CORS allowlist.

| Route | Access | Owner |
| --- | --- | --- |
| `GET /health`, `GET /cases`, `GET /cards`, `GET /cards/:id` | public | health/cases/cards |
| `POST /auth/register`, `POST /auth/login` | public | auth |
| `GET /auth/me`, `GET /me` | authenticated | auth/players |
| `POST /cases/:slug/open` | authenticated | drops |
| `GET /me/inventory`, `POST /me/inventory/:id/sell`, `POST /me/inventory/sell-bulk` | authenticated | inventory |
| `POST /me/daily-bonus`, `GET /me/drops`, `GET /me/collection`, `GET /me/milestones` | authenticated | inventory/collection/milestones |
| `GET/PATCH /admin/cards` | admin JWT | admin |
| `POST /admin/cards/ingest` | admin JWT or `X-Service-Token` | admin/forge |
| `GET/POST /admin/generation-orders`, queue/retry/select | admin JWT | generation-order workflow |
| `POST /admin/generation-orders/:id/claim|complete|fail` | admin JWT or `X-Service-Token` | offline forge |

Request validation is global (`whitelist`, transformed DTOs). Controllers must return shared DTOs through `CardMapper`; asset paths become static URLs there. Keep error codes in `packages/shared-types/src/api.ts` in sync with throw sites and UI handling. `LoggingInterceptor` (`game-api/src/common/logging.interceptor.ts`, registered as a global `APP_INTERCEPTOR` in `app.module.ts`) logs one line per request — method, path, status, duration, player id when authenticated — via the Nest `Logger` under the `HTTP` context.

## Contract ownership

`packages/shared-types` is the frozen boundary. It exports card/case/player/reel/milestone DTOs and all shared enums/constants. For an API change: update the shared package first, then API DTO/controller/service, UI client, MSW handlers, and the focused tests. Do not define a second DTO merely for convenience.

## Data model

| Table | Role |
| --- | --- |
| `players` | identity, role, balance cache, pity, daily-claim state |
| `cards` | generated/reviewed card catalog; only `approved` is playable |
| `generation_orders`, `generation_order_candidates` | durable offline forge work and deterministic candidate provenance |
| `cases` | price and rarity weights |
| `case_openings` | immutable open record, reel ids, seed, nonce, idempotency key |
| `player_cards` | one row per owned instance; `sold_at` is a soft delete |
| `transactions` | immutable currency ledger |
| `player_milestones` | once-only collection rewards |

Schema changes require a migration under `game-api/src/migrations/` and explicit registration in `game-api/src/database/database.module.ts`. `synchronize` stays `false`. Do not use raw schema edits as a substitute for a migration.

## Useful source entry points

- Module wiring: `game-api/src/app.module.ts`
- API client counterpart: `game-ui/src/lib/api.ts`
- API error mapping: `game-api/src/common/api-error.ts`
- Offline order state machine: `game-api/src/admin/generation-orders.service.ts`
- Entity registry: `game-api/src/entities/index.ts`
- Environment reference: `.env.example`

When changing a route, entity, migration, or shared-type export, regenerate and commit [`06-generated-surface.md`](06-generated-surface.md) with `npm run sync:brain`. It is code-derived navigation, while this pack explains the durable rules behind it.
