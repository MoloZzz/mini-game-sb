# Part A — game-api execution plan

**Owns:** `game-api/` only.
**Stack:** NestJS 10 + TypeORM 0.3 + Postgres 16 (ADR-003, ADR-009).
**Spec:** vault docs 01, 02, 03, 04, 05 + ADR-003/004/008/012.

## Sequencing

The endpoint that matters is `POST /cases/:slug/open`. Everything before it is
scaffolding for it; everything after it is a variation on data it already has.
Build in this order — each stage is independently testable.

### A1 · Scaffold
- `nest new` into `game-api/`, ESLint + Jest as generated.
- `@nestjs/config` reading the repo-root `.env`.
- TypeORM `DataSource` with **`synchronize: false`** (vault 02 is explicit: even
  locally). Migrations under `src/migrations/`.
- Depend on `@card-game/shared-types` via the workspace.
- `GET /health` → 200. Global prefix `api`.
- **Done:** `npm run start:dev` boots against docker Postgres, `/api/health` is 200.

### A2 · Schema
One migration creating all six tables per vault 02. Do not split it — nothing
is deployed yet, and one clean initial migration is easier to read than six.

`cards`, `players`, `cases`, `player_cards`, `case_openings`, `transactions`.

Details that are easy to miss and are called out in the vault:
- `cards.set_id` uuid **NULL from the first migration** (Q9 — adding a nullable
  column now is free; migrating 300 rows later is not).
- `cards.gen_meta` is `jsonb`; `cases.rarity_weights` is `jsonb`.
- `case_openings.reel` is `jsonb` (the whole reel, for replay + RNG debugging).
- `players.pity_counter` int default 0, `players.last_daily_claim_at` timestamptz null.
- Index `(status, rarity)` on `cards` — the reel query.
- Index `(player_id, sold_at)` on `player_cards` — the inventory query.
- **No** `UNIQUE(player_id, card_id)` and **no** `quantity` column (ADR-012).
- `image_path` / `thumb_path` are **relative**. The base URL comes from config.
- **Done:** `migration:run` is clean, `migration:revert` drops cleanly.

### A3 · Seeding
- One player from `INITIAL_GRANT` (1000 coins, 5 keys) **plus a matching
  `initial_grant` row in `transactions`** — otherwise the ledger invariant is
  violated from the first second.
- Three cases from `CASE_SEEDS`.
- A `--placeholder-cards N` flag that seeds approved cards across all six
  rarities. This unblocks every test and every endpoint before card-forge has
  produced anything. Use a solid-colour generated PNG or a single shared
  placeholder file; do not fake `image_path` pointing at nothing.
- **Done:** fresh DB → seed → `GET /api/cases` returns three cases with odds.

### A4 · Read endpoints
`GET /cards` (filters + offset pagination), `GET /cards/:id` (with `genMeta`
only when `EXPOSE_GEN_META`), `GET /cases`, `GET /me`.

- A `CardMapper` that turns an entity into `CardDto`, prefixing
  `STATIC_BASE_URL`. **This is the S3 adapter seam from ADR-002** — every URL
  in every response goes through it, no exceptions.
- Static serving of `storage/` at `/static` via `useStaticAssets`.
- `GET /cases` includes `previewCards`: six approved cards, best rarity first.
- **Done:** curl returns absolute image URLs that actually resolve.

### A5 · The drop engine — the core of the part
Pure, dependency-free functions first, in `src/drops/`, unit-tested before any
DB code touches them:

**`rollRarity(weights, pityCounter, availableRarities)`** — vault 05, exactly:
1. Take case weights.
2. If `pityCounter >= PITY_THRESHOLD`, discard common/uncommon/rare and
   renormalize epic/legendary/mythic to 100.
3. **Drop rarities with an empty approved pool and renormalize.** This step is
   critical and comes *before* the roll, not after — rolling mythic with no
   mythic cards must be impossible, not handled.
4. Cumulative sum against `r = random() * 100`.

Use **`crypto.randomInt`**, never `Math.random()` (vault 05 is explicit).
Inject the RNG so tests can seed it deterministically.

**`buildReel(winner, fillerPool)`** — vault 05 + 08:
- 60 tiles, winner at index 55.
- Fillers drawn from `FILLER_DISTRIBUTION`, **not** the case weights.
- At least 2 legendary+ fillers, placed inside `HIGH_RARITY_BAND` [10, 50].
- Nothing legendary+ at indices 53, 54, 56, 57.
- No two identical cards adjacent.
- Keep gold in the reel even when the win is rare or below — the near-miss is
  the whole genre. (Vault 05 notes plainly that this is a manipulative
  mechanic; it is implemented knowingly, for a single-player local game.)

**Done:** the 200k-roll test passes; a reel-invariant test asserts every bullet
above over ≥1000 generated reels.

### A6 · `POST /cases/:slug/open`
One Postgres transaction, `SELECT ... FOR UPDATE` on the player row:

```
lock player → check funds → debit → roll rarity → pick card (uniform)
  → insert case_opening → insert player_card → insert transaction
  → update pity → commit
```

- Errors per vault 03: `402 INSUFFICIENT_FUNDS` (with `need`/`have`),
  `409 EMPTY_POOL`, `404 CASE_NOT_FOUND`.
- Pity: `+1`, or `0` when the drop is epic+.
- `isDuplicate` / `copies` from the player's existing rows for that card.
- Optional `Idempotency-Key` header. Worth doing: it protects against
  double-clicks far more reliably than a disabled button.
- **Done:** two concurrent opens with funds for exactly one → one succeeds, one
  gets 402, balance debited exactly once. This test is mandatory.

### A7 · Inventory, economy, ledger
- `GET /me/inventory` — grouped by card with `copies`, filters, sorting.
- `POST /me/inventory/:instanceId/sell` — refuses the last copy
  (`409 LAST_COPY`); sets `sold_at`, credits `RARITY_META[rarity].sellValue`,
  writes a `card_sell` transaction.
- `POST /me/daily-bonus` — a `last_daily_claim_at` check on read, no cron.
- `GET /me/drops?limit=20`.
- **Every** balance change writes a `transactions` row (ADR-008).
- **Done:** the ledger invariant query returns zero rows after a randomized
  sequence of ~200 opens and sells. This is the test that catches economy bugs.

### A8 · Admin
- `POST /admin/cards/ingest` — bulk insert as `status: 'draft'`, **idempotent by
  slug**, returns `{inserted, skipped, skippedSlugs}`. Re-running a batch must
  not duplicate.
- `PATCH /admin/cards/:id` — review fields.
- `GET /admin/cards?status=draft` — the review queue.
- On approve with no stats supplied, auto-fill ATK/DEF from
  `RARITY_META[rarity].statRange` with slight randomness (Q4). Makes approve a
  one-click action in most cases.

## Testing

| Test | Asserts |
|---|---|
| probability, N=200k | `common≈0.600`, `epic≈0.045`, `mythic≈0.002` |
| weight sums | every `CASE_WEIGHTS` row === 100 |
| pity | fires on exactly the 30th dry open, resets on epic+ |
| empty pool | a rarity with no approved cards is never rolled |
| reel invariants | all placement rules, over ≥1000 reels |
| concurrency | double open, one key → debited once |
| ledger | `SUM(delta) == balance` after randomized activity |
| last copy | selling the only copy is refused |

Put the 200k test in a separate slow suite. Do **not** shrink N — the vault
explains it will flake below that, since mythic's standard error grows.

## Out of scope
Auth, WebSockets, cursor pagination, rate limiting (vault 03: "what is deliberately
absent"). Provably-fair is M7 — store `server_seed`/`client_seed`/`nonce`
columns now, leave verification for later.
