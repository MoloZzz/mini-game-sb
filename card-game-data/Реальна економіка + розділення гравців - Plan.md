
## Context

Two problems, both identified through measurement rather than guesswork.

**1. Players are not isolated at all.** `PlayersService.getCurrentPlayer()` ([players.service.ts:33](game-api/src/players/players.service.ts:33)) runs `SELECT * FROM players ORDER BY created_at ASC LIMIT 1` on every request. The API does not inspect the request to decide whose data to return. There is no guard, JWT, or cookie. `/api/admin/*` is completely open, `enableCors({origin: true})` reflects any origin, and `app.listen(port)` listens on 0.0.0.0. At the same time, **the data is already ready for multi-user support**: 4 of 6 tables have `player_id NOT NULL` with `ON DELETE CASCADE`, and all queries already filter correctly. The gap is one function, not the architecture.

**2. The return economy loop is dead.** The design calculation — 61 coins returned from a 100-coin case — assumes every drop can be sold. But `LAST_COPY` ([inventory.service.ts:170](game-api/src/inventory/inventory.service.ts:170)) blocks selling the only copy, so a drop pays only when the card **already exists**. The pool grew from 110 → 432, while all economy constants remained sized for 110.

The real return is calculated as `EV = Σ w_r × sellValue_r × (owned_r / pool_r)`. With ~19 cards against a pool of 432 for Starter Chest:

```
common     0.600 × 15   × 12/180 = 0.60
uncommon   0.220 × 40   ×  4/108 = 0.33
rare       0.120 × 100  ×  2/64  = 0.38
epic       0.045 × 300  ×  1/35  = 0.39
legendary  0.013 × 900  ×  0/30  = 0
mythic     0.002 × 3000 ×  0/15  = 0
                                  ------
                                    1.70 coins per 100  (1.7%)
```

The daily 500 coins buy **5.1 openings instead of the designed ~13**. To reach 61, a player would need to own roughly half of every tier (~200+ cards) — months. Duplicate sales, one of the three income sources, effectively do not work.

**Additional confirmed effects:** `POOL_TARGET_TOTAL = 110` is hardcoded ([rarity.ts:57](packages/shared-types/src/rarity.ts:57)), so the inventory shows progress against 110 with a pool of 432, while mythic `poolTarget: 2` against 15 actual cards produces “3 / 2”. `'milestone'` exists in the `transaction_type` enum, and the design document promises 200–2000 coins for progress — **nothing writes it anywhere**.

**User decision:** economy in phases (fix the loop first, then add mechanics); real authentication with roles; progress is calculated from the actual pool.

---

## Bugs found (fixed along the way)

| File | Problem |
|---|---|
| [useInventory.ts:21](game-ui/src/features/inventory/useInventory.ts:21) | `FULL_COLLECTION_LIMIT = 100` with the comment “comfortably above POOL_TARGET_TOTAL (110)” — it is **less** than 110 and three times less than 432. Progress is calculated from the first 100 groups. |
| [CollectionProgress.tsx:14](game-ui/src/features/inventory/CollectionProgress.tsx:14) | The heading uses `POOL_TARGET_TOTAL`, while the rows use `progress.byRarity[r].total`. They can diverge. |
| [seed.ts:255](game-api/src/seed/seed.ts:255) | `--reset` `TRUNCATE`s six tables without confirmation against any `DATABASE_URL`. The main data threat during this work. |
| [seed.ts:144](game-api/src/seed/seed.ts:144) | `seedCases` skips existing slugs — a price change in `CASE_SEEDS` **does not reach** the live DB. A migration is required. |
| `CASE_WEIGHTS` | Stoneheart Coffer is strictly dominated: 180 coins versus 100 for Starter Chest, worse odds, EV 61.3 versus 61.0 (34% versus 61%). The player has no reason to choose it. |

---

## Order and why it is this way

```
Step 0  Safeguard + backup           (zero features, but protects irreplaceable data)
Step 1  Pool truth                   (independent; must precede milestones)
Step 2  Authentication               (touches all controllers and all 5 e2e suites)
Step 3  Economy, phase 1              (milestones, bulk sale, trigger)
Step 4  Economy, phase 2              (sets → crafting → shop)
```

The dominant dependency is: **auth must come before milestones.** Both rewrite `DropsService.openCase`, and milestone e2e tests need the auth helper. There is no reverse dependency.

---

## Step 0 — Safeguard

- [seed.ts:254](game-api/src/seed/seed.ts:254) — block the `--reset` branch until `ALLOW_DESTRUCTIVE_SEED=1` is set **and** the database name is `cardgame`. Print the resolved DSN before the action.
- `.env.example` — change the port to 5433 (reality), and add `JWT_SECRET`, `FORGE_SERVICE_TOKEN`, `CORS_ORIGINS`, `API_HOST`, `ALLOW_DESTRUCTIVE_SEED`.
- **Operator action:** dump the live `cardgame` with `pg_dump` to a file outside the repository. All migrations below are written as non-destructive, but 432 cards and real game history deserve a real backup.

## Step 1 — Pool truth

**Delete `POOL_TARGET_TOTAL` rather than retargeting it to 432.** The value 432 will go stale again at the next generation, and go stale silently — exactly the failure we are fixing.

- [rarity.ts](packages/shared-types/src/rarity.ts) — remove `poolTarget` from `RarityMeta` and `POOL_TARGET_TOTAL`; add `POOL_SEED_RATIOS` `{common:180, uncommon:108, rare:64, epic:35, legendary:30, mythic:15}` with a comment that it is **only** for shaping the synthetic pool in the seeder, never the source of truth for progress.
- New module `game-api/src/collection/` — `PoolService.getApprovedCountsByRarity()` with one query, `SELECT rarity, COUNT(*) FROM cards WHERE status='approved' GROUP BY rarity` (default each rarity to 0 so an absent rarity does not become `undefined`), an in-process memo with a 60-second TTL, plus `invalidate()` from `AdminService.ingest()` and `.update()`. One Node process (ADR-009) means Redis is unnecessary. `GET /api/me/collection` returns the existing `CollectionProgressDto`.
- [seed.ts:85](game-api/src/seed/seed.ts:85) — move `allocateRarityCounts` to `POOL_SEED_RATIOS`; update the stale docstring.
- [health.controller.spec.ts:24](game-api/src/health/health.controller.spec.ts:24) — the test checks the jest↔shared-types wiring, not the number 110. Replace it with a structural check: `RARITIES` has length 6, `RARITY_META.mythic.sellValue === 3000`.
- **Delete** `game-ui/src/lib/collection.ts` and its test. `useInventory.ts` drops `FULL_COLLECTION_LIMIT` and the second `getInventory` request — `Promise.all` becomes `[getInventory(pageQuery), getCollectionProgress()]`. One bounded request replaces the one that silently truncates.
- `CollectionProgress.tsx` — use `progress.total` / `progress.owned` everywhere.
- `mocks/handlers.ts` — add the `GET /me/collection` handler.

**Tests:** unit — `total` counts only approved cards (draft/rejected do not inflate it), and a rarity with no cards returns `total: 0`. E2E `collection.e2e-spec.ts` — approve a card, request progress again, and verify that `total` moved. This is the test that would catch hardcoded 110. Move UI-test fixtures to a non-110 total.

## Step 2 — Authentication

### Schema: columns on `players`, not a separate `accounts` table

Four tables have FKs to `players.id ON DELETE CASCADE`. A separate table would mean either nullable `players.account_id` with a join on every request, or reassigning FKs on live data — destructive.

Migration `<ts>-AddPlayerAuth.ts`:
1. `CREATE TYPE player_role AS ENUM ('player','admin')`.
2. `ALTER TABLE players ADD COLUMN email text NULL, password_hash text NULL, role player_role NOT NULL DEFAULT 'player', last_login_at timestamptz NULL`.
3. `CREATE UNIQUE INDEX uq_players_email ON players (lower(email)) WHERE email IS NOT NULL` — the same partial unique-index pattern already used for `uq_case_openings_idempotency`.
4. **`ALTER TABLE players ALTER COLUMN balance_coins DROP DEFAULT`, and the same for `balance_keys`.**

Point 4 is half of the ledger protection structurally and costs one line. Right now **any** `INSERT INTO players` without balances silently creates 1,000 coins + 5 keys without a ledger row. Afterwards it fails on NOT NULL. Likewise remove `default:` from [player.entity.ts:15,20](game-api/src/entities/player.entity.ts:15).

Nullable `email`/`password_hash` are intentional: they allow the existing Molo row to remain unbound until it is bound.

### Registration does not break the invariant

`AuthService.register()` — **one** `dataSource.transaction()`: check email (the unique index catches the race, `23505` → `EMAIL_TAKEN`) → hash password → `manager.save(PlayerEntity, {...})` with balances **explicitly** from `INITIAL_GRANT`, never relying on a default → `ledgerService.recordTransaction(manager, {type:'initial_grant', ...})` → token.

Structurally identical to [seed.ts:109-130](game-api/src/seed/seed.ts:109), which already does this correctly. Registration is the only new path for creating a balance, and it goes through `LedgerService`, preserving the “single writer” property from ADR-008. Registration always assigns `role: 'player'`; there is no HTTP path to admin.

### Binding the existing Molo — offline CLI, not HTTP

Do not create a “claim” endpoint. An unauthenticated claim against a database where the player already exists is a primitive account-takeover mechanism.

New `game-api/src/scripts/bind-account.ts`, with an `account:bind` script in `package.json` next to `seed`:

```bash
npm run account:bind -- --player "Molo" --email you@example.com --role admin
```

It resolves by `--player` or `--id`, refuses 0 or >1 matches, **refuses if `password_hash IS NOT NULL`**, reads the password from stdin (not argv, so it does not enter shell history), and runs `UPDATE players SET email, password_hash, role`. **It does not write to the ledger or touch balances**, so the invariant is untouched by construction. It does not touch `player_cards`, `case_openings`, or `transactions`. This is the only way to create an admin at all.

Update `seedPlayer()` too: read `SEED_PLAYER_EMAIL`/`SEED_PLAYER_PASSWORD`, and without them do not create a player; print a hint about `account:bind` instead. Otherwise a fresh DB creates a player that cannot be bound.

### Specific choices

- **Hashing: `@node-rs/argon2`.** Argon2id is correct, and the package has prebuilt binaries. `argon2` and `bcrypt` pull in node-gyp → Visual Studio Build Tools on Windows.
- **JWT: only `@nestjs/jwt`, without `@nestjs/passport`.** Passport provides a strategy abstraction that would be instantiated once. The guard is ~30 lines by hand. NestJS here is 11, not 10.
- **Transport: one access token for 7 days in `localStorage`, `Authorization: Bearer`.** An httpOnly cookie across the 5173→3000 origin split requires `credentials:true`, an explicit allowlist, and CSRF — real work for a local game. **Document the tradeoff in the module docstring:** if this ever goes public, use httpOnly + CSRF and a shorter TTL.
- `JWT_SECRET` from env **with no default** — the application must not start if it is missing. A default secret means no auth.
- Claims: `sub`, `role`, `iat`, `exp`. The guard **does not hit the DB** on every request. Consequence: removing the admin role takes effect only after token expiry. Acceptable for one operator over 7 days; for immediate revocation, use `token_version` in the claim.

**New files** in `game-api/src/auth/`: `auth.module.ts`, `auth.service.ts`, `auth.controller.ts` (`POST /auth/register`, `/auth/login`, `GET /auth/me`), `dto/{register,login}.dto.ts`, `guards/{jwt-auth,roles,service-token}.guard.ts`, `decorators/{public,roles,current-player}.decorator.ts`, plus specs.

**Guard registration: global `APP_GUARD`, fail-closed.** In `app.module.ts`, register `JwtAuthGuard` and `RolesGuard` as `APP_GUARD`, then add `@Public()` to exceptions: `HealthController.check`, both `AuthController` routes, both `CardsController` routes, and `CasesController.list`. The allowlist means a route added later is protected by default.

### Six call sites

| File | Change |
|---|---|
| [players.controller.ts:23](game-api/src/players/players.controller.ts:23) | `@CurrentPlayerId() playerId` + new `findByIdOrFail` |
| [inventory.controller.ts:27,36,43,49](game-api/src/inventory/inventory.controller.ts:27) | 4 routes → `@CurrentPlayerId()` |
| [drops.service.ts:49](game-api/src/drops/drops.service.ts:49) | line is removed; `openCase()` receives `playerId` as the first parameter |

Consequences: `drops.controller.ts:22` passes `@CurrentPlayerId()`; the `PlayersService` injection in `inventory.controller.ts` and `drops.module.ts` becomes unnecessary (verified — it was used **only** for `getCurrentPlayerId`); remove `getCurrentPlayer()`/`getCurrentPlayerId()` from `players.service.ts`, add `findByIdOrFail()`, and keep the three `count*` methods; remove `playerId` from [configuration.ts:11,40](game-api/src/config/configuration.ts:40) — a dead env override that silently changes identity next to real auth, worse than having no auth. The `Player ${playerId} not found — run npm run seed` message in three services becomes 401.

### Admin and card-forge

`AdminController` gets `@Roles('admin')` at class level. `POST admin/cards/ingest` additionally uses `@UseGuards(ServiceTokenGuard)` — **a static service token is correct for a machine client**; do not issue a JWT to a batch script that runs unattended for 45 minutes. The guard reads `X-Service-Token` and compares it through `crypto.timingSafeEqual` (hash both sides so lengths always match), **rejecting when `FORGE_SERVICE_TOKEN` is unset** — never fail open and never use a default. It also accepts a valid admin JWT.

`card-forge/ingest.py:61` — `run_ingest` receives `service_token`, `requests.post(..., headers=headers)`; a separate 401/403 branch with a message naming `FORGE_SERVICE_TOKEN`. `forge.py` reads it from env next to `FORGE_API_URL`.

### `main.ts`

`enableCors({ origin: config.corsOrigins, credentials: false })` with `CORS_ORIGINS` (default `http://localhost:5173`) — reflecting any origin next to a token API is not protected by any argument. `app.listen(port, config.apiHost)` with `API_HOST` defaulting to `127.0.0.1` — 0.0.0.0 exposes the admin API to the local network.

### game-ui

New `lib/auth.ts` (token in localStorage + decoded claims **only for UI affordances**, with the server remaining authoritative), `lib/authContext.tsx`, and `features/auth/{Login,Register}.tsx`. [api.ts:49-76](game-ui/src/lib/api.ts:49) — `request()` attaches `Authorization`, clears the token on 401, and dispatches logout so the application falls to the login screen rather than looping. `App.tsx` — `AuthProvider`, `/login` and `/register` routes, and a gate on `/admin` for `role === 'admin'`. `AppShell.tsx` — hide “Review” for non-admins and add logout.

`packages/shared-types/src/api.ts` — add `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN` to `API_ERROR_CODES`. A useful property: `USER_MESSAGES` in [apiError.ts:48](game-ui/src/lib/apiError.ts:48) is `Record<ApiErrorCode, string>`, so new codes produce a **compile error** until their text is added. Rely on this.

### Step 2 tests

Unit: guard without a header / with a malformed / expired token → 401, `@Public()` passes; player on an admin route → 403; **invalid service token → 403 and unset env → 403, not 200**; hash round-trip.

E2E `auth.e2e-spec.ts` — **write first**: registration creates exactly one `initial_grant` row and `SUM(delta_coins) == balance_coins` for a new player. Then: duplicate email → `EMAIL_TAKEN`; wrong password → `INVALID_CREDENTIALS`; any `/me/*` without a token → 401; `/admin/cards` with a player token → 403; ingest with a valid `X-Service-Token` without JWT → 200.

Shared helper `test/auth.helper.ts` — `createTestPlayer` / `createTestAdmin`. Update all five existing e2e suites. [ledger-invariant.e2e-spec.ts:62](game-api/test/ledger-invariant.e2e-spec.ts:62) looks for `displayName: 'Molo'` — replace it with a freshly registered account, which also removes the dependency on seed state.

Regression test: raw `INSERT INTO players (display_name) VALUES ('x')` now **fails**. Documents why DROP DEFAULT exists.

### Order within step 2

1. shared-types → 2. migration + entity → 3. auth module and guard, **but do not register `APP_GUARD` yet** → 4. **`npm run account:bind` for Molo with `--role admin`** → 5. now register `APP_GUARD`, place `@Public()`/`@Roles()` → 6. six call sites → 7. `main.ts` → 8. card-forge → 9. UI → 10. e2e.

> **If step 5 ships before step 4, you are locked out of `/api/admin` and `/api/me` with no way back except SQL.** This is the riskiest ordering mistake in the entire plan.

## Step 3 — Economy, phase 1

### Milestones

Table `player_milestones`: `id uuid PK`, `player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE`, `milestone_key text NOT NULL`, `awarded_at timestamptz`, `transaction_id uuid NULL REFERENCES transactions(id) ON DELETE SET NULL`, **`UNIQUE (player_id, milestone_key)`**.

**Why it cannot pay twice — two independent reasons.** First, every opening already takes `SELECT ... FOR UPDATE` on the player row **first** ([drops.service.ts:52](game-api/src/drops/drops.service.ts:52)); two parallel openings serialize on this lock, so the second sees the first opening’s `player_milestones` rows. The check inside the same transaction inherits that guarantee for free. Second, the unique constraint: even if the reasoning above is wrong or future code forgets the lock, the second INSERT returns `23505` and rolls back the transaction. The constraint is what remains true a year from now.

**Place in `openCase`:** between inserting `player_cards` ([:158](game-api/src/drops/drops.service.ts:158)) and the final `manager.save(player)` ([:177](game-api/src/drops/drops.service.ts:177)) — so milestone coins and the balance commit atomically. Move the `copies` count (currently at `:181`, after save) **upward**: the unique count can change only when `copies === 1`, so the milestone path is skipped entirely for a duplicate. The same query, only reordered.

`MilestoneService.checkAndAward(manager, playerId)` — counts `COUNT(DISTINCT card_id)` **through the passed `manager`** so it sees the uncommitted work of this same transaction; selects already-awarded keys; for each reached tier, writes `milestone` through `LedgerService`, inserts a row, and mutates the in-memory balance (the caller persists it with `manager.save(player)`).

Awarding **all** reached tiers in one pass is what makes lazy catch-up correct: Molo at 19 unique cards closes tier 1 on the first opening, **without a migration that writes to the ledger**. The second call is in `claimDailyBonus` ([:205](game-api/src/inventory/inventory.service.ts:205)), also already under the lock, so a player who stopped opening cases still receives what they earned.

**Thresholds are absolute unique-card counts, never a percentage of the pool.** With a dynamic pool, a percentage would **retroactively remove** a milestone whenever new cards are generated.

`GET /api/me/milestones` — the full ladder, read-only, **does not award rewards** (a GET that writes to the ledger is a bug waiting to happen).

| Tier | key | unique cards | coins | keys |
|---|---|---|---|---|
| 1 | `unique_10` | 10 | 200 | 0 |
| 2 | `unique_25` | 25 | 300 | 1 |
| 3 | `unique_50` | 50 | 500 | 1 |
| 4 | `unique_75` | 75 | 700 | 1 |
| 5 | `unique_100` | 100 | 900 | 2 |
| 6 | `unique_150` | 150 | 1 200 | 2 |
| 7 | `unique_200` | 200 | 1 500 | 3 |
| 8 | `unique_250` | 250 | 1 800 | 3 |
| 9 | `unique_300` | 300 | 2 000 | 4 |
| 10 | `unique_350` | 350 | 2 000 | 4 |
| 11 | `unique_400` | 400 | 2 000 | 5 |
| 12 | `unique_432` | 432 | 2 000 | 10 |

Total: 15,100 coins + 36 keys over the collection’s lifetime, within the 200–2,000 promised by the design document. **Freeze tier 12 at 432**: pool growth is a deliberate content decision that also adds a tier; a self-adjusting “full collection” could become unfinished again.

### One constant changes: `DAILY_BONUS` 500 → 800 coins, 1 → 2 keys

Molo needs 81 unique cards to close tiers 1–5; at ~14% completion, P(new) ≈ 0.86, or ≈ 94 openings. Tier 1 pays immediately, while the remaining 2,400 are spread over 94 openings = **25.5 coins/opening**.

| Stage | Sale EV | milestones | total | net cost (100 case) | openings/day @ 800 |
|---|---|---|---|---|---|
| Start (19 unique) | 1.7 | 26 | 27.7 | 72.3 | **11.1** |
| Middle (~216) | 30.5 | 17 | 47.5 | 52.5 | **15.2** |
| Full (432) | 61 | 0 | 61 | 39 | **20.5** |

Monotonic ramp 11 → 15 → 20, starting exactly in the designed “10–14 per day” range. One knob: one number.

**Case prices and sale values do NOT move** (except for the one below). Raising `sellValue` does not fix the ramp: it multiplies near-zero at the start and near-price at the end. With a full collection, Starter Chest EV is 61 against a price of 100; double the sale value and it becomes 122 > 100, a money printer exactly when there are the most cards to sell. A loss-making endgame margin is the only thing that leaves coins as a constraint at all.

**The only price worth changing: stoneheart-coffer 180 → 120.** At 180 it is strictly dominated (more expensive than Starter Chest, worse odds, EV ratio 34% versus 61%). At 120 the ratio becomes 51%, and the narrower rare band provides a measurable collection speed. A **real migration** is required: `UPDATE cases SET price_coins = 120 WHERE slug='stoneheart-coffer'` **plus** a `CASE_SEEDS` change — `seedCases` skips existing slugs, so the constant alone will do nothing.

### Bulk sale

`POST /api/me/inventory/sell-bulk`, body `{ mode: 'all_duplicates' } | { mode: 'by_rarity', rarities } | { instanceIds }`. One transaction, player lock first — the same discipline as in `sellCard`. Resolve `copies - 1` instances per card (oldest first), so LAST_COPY is upheld by construction and per-instance 409 is unnecessary. One `UPDATE ... WHERE id = ANY($1)`, then **one ledger row per instance** in one multi-row INSERT — do not aggregate into a summary row: `transactions` has no jsonb details, and aggregation destroys traceability to save 199 cheap inserts. Cap `maxInstances` (500) so a pathological request does not hold the lock for minutes.

**Idempotency is not needed:** sales are soft deletes, step 1 filters `sold_at IS NULL`, so a repeat finds nothing and returns `soldCount: 0`. A separate `idempotency_keys` table is the right generalization, but buys nothing here.

### The ledger invariant becomes a constraint trigger

Migration `<ts>-AddLedgerInvariantTrigger.ts`, **last**:
1. **Fail-loud precheck:** run the violations query from `ledger-invariant.e2e-spec.ts:96` and, if there are rows, `throw` with the IDs. Do not apply halfway. The live ledger state could not be checked (Docker was down), so the migration must assume violations may already exist.
2. `CONSTRAINT TRIGGER ... AFTER INSERT OR UPDATE ON players ... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`.

**Trigger on `players`, not on `transactions`.** Every balance mutation in this code pairs `recordTransaction` with `manager.save(player)` in one transaction (verified in `drops.service.ts:167-178`, `inventory.service.ts:182-191`, `:229-238`, `seed.ts:121-129`). A trigger on the player row catches all of them and fires **once per player per transaction**, not once per ledger row — important for the new bulk sale with 200 rows. Gap: an insert into `transactions` without updating the player would pass through; nobody does that today — document it as a trigger assumption. `INITIALLY DEFERRED` means checking at COMMIT, so statement order within the transaction does not matter.

> **Required accompanying change:** [ledger-invariant.e2e-spec.ts:71-86](game-api/test/ledger-invariant.e2e-spec.ts:71) executes `DELETE`, `UPDATE players`, `INSERT` as **five separate implicit transactions**. With the live trigger, the `UPDATE players` commit will be checked against the just-emptied ledger and fail. Wrap the entire helper in one `dataSource.transaction()` — **in the same commit as the migration**.

Cost ceiling: the check re-sums one player’s transactions on commit. It is free at ~343 rows. If ~10⁵ ever accumulate, replace it with a running-total column. Not today’s problem.

### Step 3 tests

- Crossing multiple thresholds at once awards **all** of them in one pass; an already-awarded key is not awarded again.
- **Main concurrency test:** player is one card short of a threshold, N parallel `POST /cases/:slug/open` calls through `Promise.all` → exactly **one** `player_milestones` row and **one** `milestone` transaction. This catches a lost lock or missing constraint.
- Bulk sale: never sells the last copy; `soldCount` equals the number of ledger rows; a repeat returns `soldCount: 0`; the invariant holds after 100 instances.
- Add bulk sale to the randomized run’s `pickOp` in `ledger-invariant.e2e-spec.ts`.
- Trigger test: an intentional raw `UPDATE players SET balance_coins = balance_coins + 1` **fails at COMMIT**.

## Step 4 — Phase 2 (order matters too)

Do this **after** phase-1 numbers have been exercised, not in parallel. The point of phase-1 maths is that it is measurable; a second way to obtain cards devalues the measurement before you read the result.

**4a. Sets (Q9) before crafting.** `cards.set_id uuid NULL` exists without an FK or a `sets` table. Create the table and FK **early**, while all 432 rows are `NULL` — today this is a trivially safe migration, and much larger after cards are assigned. Crafting will very likely want to be scoped by set.

**4b. Crafting (Q8) — one hard constraint from phase 1.** Milestone awards assume the unique count is **monotonic**. Today it is: `countUniqueCards` filters `sold_at IS NULL`, and LAST_COPY prevents selling the last copy. Crafting consumes copies, so **crafting must refuse to consume the last copy**, exactly like selling. Build this in from the first commit; call `checkAndAward` at the end of the crafting transaction (crafting adds a card, so it may cross a threshold).

**4c. Deterministic shop — last.** This is a direct paid path to specific cards, the strongest disturbance to milestone economics. Set prices **after** seeing real openings/day.

## Vault

The user allowed writing context to the vault (`card-game-data/`, which `docs/plans/00-decomposition.md` otherwise keeps read-only). Convention: `NN - Category - Topic.md`, frontmatter `tags: [...]`, Ukrainian H1, and the backlink `Back to [[00 - Card Game MOC]]`. The next free number is 12.

- **`12 - Game Design - Economy Rebalance.md`** — formula `EV = Σ w_r × sellValue_r × (owned_r / pool_r)`, measured 1.7 coins, tier ladder, 11→15→20 ramp table, why `sellValue` does not move, Stoneheart dominance.
- **ADR-014** · Real authentication: JWT + local password, columns on `players`, binding through CLI.
- **ADR-015** · Collection target calculated from the actual pool, `POOL_TARGET_TOTAL` removed.
- **ADR-016** · Ledger invariant as a constraint trigger on `players`, not a test.
- **`11 - Planning - Open Questions.md`** — close Q10 (multi-user), mark Q8/Q9 as planned for phase 2.
- **`00 - Card Game MOC.md`** — navigation entry for 12.

---

## End-to-end verification

```bash
docker compose up -d && npm run migration:run -w game-api
```

1. **Step 1:** `curl localhost:3000/api/me/collection` → `total` equals the actual approved count (432), not 110. Approve one more card → `total` increases.
2. **Step 2:** `npm run account:bind -- --player "Molo" --email … --role admin`, then `curl -X POST /api/auth/login` → token. `curl /api/me` without a token → 401. `curl /api/admin/cards` with a player token → 403. `python card-forge/forge.py ingest` with `FORGE_SERVICE_TOKEN` → 200, without it → 403.
3. **Target data:** `SELECT count(*) FROM player_cards WHERE player_id=<molo>` and `SELECT count(*) FROM transactions` return the same numbers as before the migrations. Compare with the backup.
4. **Step 3:** open cases up to 25 unique cards → milestone toast; `SELECT * FROM player_milestones` has exactly one row per key; `SELECT sum(delta_coins) FROM transactions WHERE player_id=… ` equals `balance_coins`.
5. **Trigger live:** `UPDATE players SET balance_coins = balance_coins + 1 WHERE id=…` → rejected at COMMIT.

```bash
npm run test -w game-api && npm run test:e2e -w game-api && npm run test -w game-ui && npm run build
```

E2E runs against `cardgame_test` (`game-api/test/env.setup.ts`), not the live DB — this is already configured, and none of the steps above changes it.

---

## What I am rejecting and why

- **OAuth** — a local game with one operator; provider registration and internet dependency at login just to avoid storing one hash.
- **`@nestjs/passport`** — a strategy abstraction instantiated exactly once.
- **Separate `accounts` table** — either a join on every request or reassigning FKs on live data.
- **Raising `sellValue` for the ramp** — multiplies near-zero at the start and pushes EV past case price at the end.
- **Percentage milestone thresholds** — generating new cards would retroactively remove them.
- **Milestone backfill through a migration** — lazy catch-up covers this, and migrations must not be ledger writers.
- **Retargeting `POOL_TARGET_TOTAL` to 432** — it would go stale again, silently again.
