---
tags: [planning, adr]
---

# Recorded Decisions (ADR)

Back to [[00 - Card Game MOC]]

Format: decision → context → alternatives → why this → what would change it.

---

## ADR-001 · Generation fully offline, not during play

**Status:** accepted

SD 1.5 on a laptop takes from 2s (GPU) to 90s (CPU) per image. The roulette spins for 5.5s and cannot wait. Therefore cards are generated in advance into a pool, and the game pulls approved cards from the database.

**Alternatives:** generate during the animation (does not fit even on a good GPU); pre-generate the “next” card in the background (complex, breaks on fast repeated openings, and does not scale to a strip with 60 tiles).

**Consequence:** `card-forge` is completely decoupled from the game loop. It can be disabled, run on another machine, or rewritten — the game will not notice.

**What would change the decision:** nothing realistic on local hardware. Perhaps a move to a remote inference API with <1s latency, but that contradicts the project goal (trying SD locally).

---

## ADR-002 · Three services, not five

**Status:** accepted (revision of the initial plan)

The initial idea was separate services for image generation, image storage, and card-metadata storage.

**“Image storage service” rejected.** It is a folder plus `useStaticAssets()`. A separate process would add a deployment, a hop, and another source of errors for zero benefit.

**Separation criterion:** different runtime + different speed + different lifecycle. `card-forge` satisfies all three (Python, minutes, runs offline). A file folder satisfies none.

**What would change the decision:** a move to S3 — but even then it would be an adapter replacement in `game-api`, not a new service. Or if generation moved to a separate machine with a GPU — then real file transfer would be needed, and separating storage would become justified.

---

## ADR-003 · Postgres for everything, Mongo not used

**Status:** accepted

**Reasons:**
1. Case opening is an atomic transaction (deduct a key + issue a card)
2. The data is relational: `players → player_cards → cards`
3. Semi-structured generation metadata fits into `jsonb`

The last point removes Mongo’s only real argument — schema flexibility where needed, without losing transactions and JOINs.

**What would change the decision:** if cards did not have fixed fields and there were no economy. In other words, a different game.

---

## ADR-004 · RNG on the server, the strip arrives ready

**Status:** accepted

`POST /cases/:slug/open` returns the entire strip and `winningIndex`. The UI simply scrolls to the known position.

**Alternative:** the UI runs RNG itself — this breaks server truth, makes the balance unreliable, and is not how any product in the genre works.

**Consequence:** the animation becomes a pure function of the API response. It is trivial to test, trivial to debug, and free to replay.

---

## ADR-005 · SD draws only the art; frame, text, and stats are DOM

**Status:** accepted

SD 1.5 cannot draw readable text — a limitation of the CLIP encoder, not the prompt. Therefore art is a square window inside a CSS frame.

**Consequence:** text is perfect; the frame can change without regeneration; rarity can be reassigned without touching the file; localization is free.

Hearthstone and MTG work the same way.

---

## ADR-006 · Generate at 512×512, upscale as a separate step

**Status:** accepted

SD 1.5 was trained at 512×512. Direct generation at 768/1024 produces doubled heads and extra limbs — outside the training distribution, not fixable with a prompt.

Upscaling (Real-ESRGAN ×2) is a separate optional step after selection. There is no point upscaling something that will be rejected.

Square, not 2:3 portrait — because square is closer to the training distribution, and the art window in the card is square anyway.

---

## ADR-007 · Fine-tune SD 1.5, not the base model

**Status:** accepted

`Lykon/dreamshaper-8` instead of `runwayml/stable-diffusion-v1-5`. Same architecture, same code, same VRAM — substantially better fantasy art. Replace one `model_id` line.

The “try SD” project is not undermined by this: dreamshaper is SD 1.5, simply fine-tuned.

---

## ADR-008 · Ledger table instead of a bare balance UPDATE

**Status:** accepted

Every currency change writes a row to `transactions`. `players.balance_*` is a denormalized cache.

**Cost:** one table and one INSERT per operation.
**Benefit:** the `SUM(delta) == balance` invariant catches any economy bug with one SQL query. Plus a free operation history.

It seems excessive for a “light project” right up until the first time coins disappear for no reason.

---

## ADR-009 · Docker only for Postgres

**Status:** accepted

`card-forge` in Docker would require passing through the GPU (nvidia-container-toolkit, and on macOS MPS it is impossible) and an image of ~8GB. Nest and Vite in Docker remove normal hot-reload.

Three terminals are simpler than dockerizing everything. Postgres is in Docker because it is the only thing that is inconvenient to install locally.

---

## ADR-010 · Framer Motion + CSS transform, no canvas engine

**Status:** accepted

The roulette is `translateX` on one container with custom easing. PixiJS or Phaser would provide particles and shaders, but the cost is canvas rendering, custom layout, custom event handling, and no ordinary DOM.

Rarity effects use CSS gradients, `filter`, `box-shadow`, and a small particle library. The visual difference is minimal; the difference in development time is many times larger.

**What would change the decision:** if complex particle physics or full-screen shader transitions were needed. Then Pixi would sit over the DOM only for the FX layer, not for the roulette.

---

## ADR-011 · Six rarity levels with conventional colors

**Status:** accepted

Common → Mythic, with colors following the MMO/CS:GO convention (gray, green, blue, purple, gold, pink). The sixth level creates the effect of an “almost unreachable top.” A custom color scheme would add nothing, but would break instant rarity recognition from a thumbnail.

---

## ADR-012 · Duplicates as separate rows, without a quantity column

**Status:** accepted

`player_cards` has one row per instance. Not `UNIQUE(player, card)`, not `quantity`.

**Why:** it provides an acquisition history for every instance, allows a specific one to be sold, and makes the relationship with `case_openings` natural. Grouping with `COUNT(*)` for the UI is a trivial query.

The cost is slightly more rows. At one-person scale this is insignificant.

---

## ADR-013 · fp16 + `safety_checker=None` — a requirement, not an optimization

**Status:** accepted (after determining the hardware)

The target machine is **RTX 3050 Laptop, 4 GB VRAM**. SD 1.5 at 512×512 batch=1 peaks at ~3.1–3.9 GB. There is no headroom, so two flags become mandatory:

- `torch_dtype=torch.float16` — fp32 will not fit in principle (~4.2 GB for weights alone)
- `safety_checker=None` — the checker brings its own CLIP model at ~1.2 GB. This is the largest single saving and the difference between working and OOM.

**Deliberately NOT enabled by default:** `enable_attention_slicing()` (torch 2.x SDPA is already memory-efficient and faster; slicing costs 20–30% speed) and `enable_model_cpu_offload()` (3–5× slowdown). Both are responses to OOM, not prevention.

**Planning consequence:** generation stops being the bottleneck. 283 cards ≈ 45 min. Manual selection becomes the bottleneck, so M5 (admin review) moves up in priority.

**Ambition consequence:** SDXL, ControlNet, generation >512, and LoRA training are unavailable on this hardware. None is needed in the plan — but the boundary is known in advance, not at the moment of OOM.

Details → [[06 - Generation - SD Pipeline]]

---

## ADR-014 · Real authentication: JWT + local password

**Status:** accepted

Q10 from [[11 - Planning - Open Questions]] is closed. Authentication columns (`email`, `password_hash`, `role`, `last_login_at`) were added **to `players`**, not to a separate `accounts` table.

**Why not a separate table:** four tables already have `player_id ... REFERENCES players(id) ON DELETE CASCADE` (`case_openings`, `player_cards`, `transactions`, `player_milestones`). A separate `accounts` table would force either joining it on every request or reattaching foreign keys belonging to other data on live records. Columns on `players` require neither.

**Hashing:** `@node-rs/argon2` (Argon2id), not the `argon2` or `bcrypt` packages — both require `node-gyp`, and therefore Visual Studio Build Tools on Windows. `@node-rs/argon2` ships with ready-made native binaries.

**JWT:** only `@nestjs/jwt`, without `@nestjs/passport` — the Passport strategy abstraction would be instantiated exactly once, an extra dependency for zero benefit. One access token valid for 7 days, issued at registration/login, stored in `localStorage`, and sent as `Authorization: Bearer`.

**Deliberate transport compromise:** httpOnly cookies were considered and rejected at this stage — `game-ui` (5173) and `game-api` (3000) are different origins, so cookies would require `credentials: true`, a CORS allowlist (already present through `corsOrigins`) **and** real CSRF protection — `SameSite` alone is not enough once two different origins are involved. This additional work is justified only if the API leaves localhost; a 7-day TTL is acceptable precisely because the token currently never leaves one machine and there is one operator.

**`JWT_SECRET` has no default.** `configuration.ts` throws an error and refuses to start if the environment variable is not set — the secret can never accidentally enter a build.

**Admin accounts exist ONLY through the offline CLI `npm run account:bind`.** There is deliberately no HTTP “claim account” endpoint: an unauthenticated claim against a database that already has a player row is primitive account takeover. The CLI reads the password from stdin (not argv — argv leaves a trace in shell history and `ps` output), and refuses to overwrite an already-bound row (`password_hash !== null`).

**Guards:** `JwtAuthGuard` and `RolesGuard` are registered globally as `APP_GUARD` in `AppModule` — every route is protected by default, and tokenless access requires an explicit `@Public()`. The allowlist is deliberately short: health, both `/auth` endpoints, `/cards`, `GET /cases`. Anything added later is protected without extra action.

**Side effect for ADR-008:** `DROP DEFAULT` on `players.balance_coins` and `players.balance_keys`. Previously, any `INSERT INTO players` that omitted balances silently issued 1000 coins + 5 keys without any row in `transactions` — breaking the ledger invariant. Registration is a new `INSERT` path that creates a balance, so after `DROP DEFAULT`, an omitted balance fails at `NOT NULL` instead of silently corrupting the ledger.

**Consequences:** a new registration/login path, a guard on every route by default, and admin rights granted only offline.

---

## ADR-015 · Collection target is calculated from the real pool

**Status:** accepted

Previously, the “collection target” was hardcoded as a number. `POOL_TARGET_TOTAL` was **deleted completely**, rather than redirected to 432 — 432 would become outdated again on the next generation run, and would become outdated **silently**, which is the same failure we are fixing.

Instead of a constant, `PoolService` (`game-api/src/collection/pool.service.ts`) counts approved cards live from the `cards` table: `COUNT(*) ... WHERE status
= 'approved' GROUP BY rarity`. It caches the result for 60 seconds in the process (ADR-009: one Node process, no Redis needed), and is invalidated through an explicit `invalidate()` from the admin ingest/review path as soon as the approved pool actually changes.

`POOL_SEED_RATIOS` remains in `@card-game/shared-types`, but only as the shape of the synthetic pool for `seed.ts --placeholder-cards`, never as the source of truth for collection progress.

**Consequences:** `GET /me/collection` always shows the real number of approved cards, even immediately after an admin approves another one. The cost is one SQL query per 60 seconds of worst-case staleness.

---

## ADR-017 · First themed set — Ashen Wastes

**Status:** accepted 2026-07-29 by delegated decision of the product owner.

The first set must turn general collection progress into a short, clear goal without adding another currency or reward. Its theme is **Ashen Wastes**: an ashen frontier around a dead forge, where ember beasts, old relics, and wind spirits fight over the last sources of warmth. This is new canon for the first set, not a description of the existing Ashen Forge elemental case.

**Decision:**

- The set contains 20 cards: 8 common, 5 uncommon, 3 rare, 2 epic, 1 legendary, and 1 mythic. Its progress is a separate `owned / 20` based on unsold unique cards.
- The set receives its own targeted case, **Cinderbound Cache**, which can drop only Ashen Wastes cards. The current Ashen Forge remains an elemental, non-targeted case and does not change its behavior.
- Completing the set in the MVP grants no currency, keys, or new cards. The value is visible progress, a complete themed set, and the next collection goal. General collection milestones remain the only reward channel for pool breadth.
- Cinderbound Cache costs **400 coins**; odds: 35% common, 28% uncommon, 18% rare, 10% epic, 6% legendary, 3% mythic. At current sell values, its full-duplicate EV is **208.45 coins (52.1% of price)**. This is deliberately below price for a nearly complete collection; at the start, first copies cannot be sold, so the model does not treat EV as a reward. The higher 6%/3% top-tier odds do not make mythic an expectation after hundreds of openings. There is no hidden duplicate protection: all approved cards in the set are equally possible within their rarity.

**Rejected alternatives:** Drowned Court as the first set (less contrast with the existing Tidal Vault); using Ashen Forge as the set-only case (breaks the existing promise of elemental cases); a completion reward (adds an untested currency source).

**What would change the decision:** a playtest in which players do not understand the theme, do not notice 0/20 progress, or do not connect the set to the next opening; then revisit the theme/navigation before fixing the economy case.

---

## ADR-018 · A long session needs a bounded activity loop, not a timer

**Status:** accepted 2026-07-29 with explicit confirmation from the product owner.

The current model showed that coins, keys, milestones, and duplicate sales provide a finite opening budget within one session. The owner chose the product form of a **longer voluntary series of openings**, rather than only an onboarding buffer and a natural early session ending.

**Decision:** look for one repeatable, untimed activity loop that creates **bounded** access to the next opening. It cannot be a streak, daily-only claim, paid bypass, hidden RNG, unlimited coin faucet, or punishment for leaving the game. The exact mechanic is not canon yet; the first proposal and test → [[26 - Product - Archive Dossiers Brief]].

**Consequence:** any MVP must separately show source/sink, an upper limit per unique card instance, effects on a new/mid/nearly complete account, and server-authoritative state. If the model shows long-term positive currency drift or the playtest shows a feeling of obligation, revise the proposal rather than silently tuning the reward.

---

## ADR-016 · Ledger invariant — documented decision about the constraint trigger

**Status:** accepted (implemented)

Plan: `SUM(delta_coins) == balance_coins` (ADR-008), from a simple assumption checked only by tests, becomes `CONSTRAINT TRIGGER ... AFTER INSERT OR UPDATE
ON players ... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`. Implemented in migration `game-api/src/migrations/1785200000002-AddLedgerInvariantTrigger.ts`.

**Why on `players`, not `transactions`:** every balance mutation in this code pairs `recordTransaction` with `manager.save(player)` in one transaction (`drops.service.ts`, `inventory.service.ts` — both `sellCard` and `sellBulk`, `seed.ts`). A trigger on the player row catches all of them and fires **once per player per transaction**, not once per ledger row — important specifically for bulk sales, which write up to 200 ledger rows in one multi-row INSERT. `DEFERRABLE INITIALLY DEFERRED` means the check runs at COMMIT, so statement order inside the transaction does not matter.

**Pre-check before installation:** the migration checks existing data before creating the trigger — if the database already contains an invariant violation, the migration refuses to run and throws an error with the IDs of the violating players. This prevents installing the trigger on invalid data, where the first operation touching a player would fail with an unclear error instead of clearly signaling that the data must be fixed in advance.

**Documented gap:** an insert into `transactions` without a corresponding player update will pass the trigger unnoticed. No code path does this today — it is an assumption on which the trigger is built, not a guarantee it verifies.

**Cost ceiling:** the check re-sums all of a player’s transactions at COMMIT. It is effectively free up to approximately ~343 rows per player; if around ~10⁵ rows ever accumulate, replace it with a running-total column. Not today’s problem.

**Testing consequence:** the `resetPlayerState` helper in `ledger-invariant.e2e-spec.ts` is forcibly wrapped in one `dataSource.transaction()`, because with the trigger active, separate implicit transactions for `DELETE` / `UPDATE` would fail at the `UPDATE players` COMMIT — it would be checked against the ledger just emptied by the previous separate transaction. One explicit transaction for the whole operation means the deferred trigger sees only the final, consistent state at COMMIT.

**Important:** the migration was not run against a live database — Docker was not active while writing. The migration code was compiled and syntax-checked, but the SQL was not executed in real Postgres. This may reveal edge cases when the migration is first applied to real data.
