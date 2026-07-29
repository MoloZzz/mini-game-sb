# Economy invariants

Read this before changing drop, RNG, balance, inventory, pricing, rarity, or collection code.

## Non-negotiable rules

1. **Ledger equals balance.** Every `players.balanceCoins` or `balanceKeys` mutation has a matching immutable `transactions` row in the **same database transaction**, through `LedgerService`. A deferred Postgres trigger checks `SUM(delta) == cached balance` at commit.
2. **Lock before reading funds.** Mutating player actions lock that player row first (`pessimistic_write`) inside one transaction. This protects double-clicks and concurrent requests.
3. **One row per owned card instance.** `player_cards` is not a quantity field. Selling is a soft delete and may never remove the final unsold copy of a card. Bulk selling constructs its selection to retain one copy per card.
4. **Only approved cards are in the player pool.** A forge ingest produces `draft`; an admin review moves it to `approved`. Never bypass this for a normal player drop.
5. **Server is authoritative.** Crypto RNG, rarity roll, winner, 60-tile reel, and `WINNING_INDEX` are selected before animation by `DropsService`; UI only displays the response.
6. **Opening is idempotent when keyed.** Reusing the same `Idempotency-Key` for one player returns the stored opening without another charge. Preserve the `(player_id, idempotency_key)` constraint and replay behaviour.
7. **Collection is distinct unsold cards.** Duplicates do not advance it. Milestones are once-only, ledger-backed, and can be caught up by a later opening or daily-bonus claim; a read-only GET must never award them.

## Mutation owners

| Operation | Entry | Coupled effects |
| --- | --- | --- |
| Open case | `game-api/src/drops/drops.service.ts` | charge, opening, owned instance, pity, ledger, possible milestone |
| Sell one / bulk | `game-api/src/inventory/inventory.service.ts` | soft delete, coins, ledger; retain a final copy |
| Daily bonus | `game-api/src/inventory/inventory.service.ts` | cooldown, currency, ledger, possible milestone catch-up |
| Registration | `game-api/src/auth/auth.service.ts` | initial balances and `initial_grant` ledger row |

## Constants and tests

Rarity, pity, prices, reel geometry, daily bonus, and bulk-sale cap are shared constants in `packages/shared-types/src/`. Pure drop logic lives in `game-api/src/drops/` (`roll-rarity`, `pity`, `build-reel`) with unit tests. Keep the e2e invariant tests valid whenever an economic path changes.
