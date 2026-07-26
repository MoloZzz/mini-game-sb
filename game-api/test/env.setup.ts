/**
 * Jest `setupFiles` entry for `test:e2e` — runs before the test framework is
 * installed and before the test file (and therefore `AppModule`/`data-source`)
 * is ever required, so this is the only place early enough to redirect
 * `DATABASE_URL` before anything else reads it.
 *
 * Why this exists: the e2e suites do real, destructive-looking things
 * (`DELETE FROM transactions`, `TRUNCATE`-adjacent resets, ~200 randomized
 * economy operations) against whatever `DATABASE_URL` resolves to. The dev
 * database on port 5433 now holds 283 real, GPU-generated approved cards, a
 * rejected-placeholder pool, and a player with genuine balance/transaction
 * history — none of that is reproducible, so e2e tests must never touch it.
 * `cardgame_test` is a separate database on the SAME postgres instance
 * (created once via `docker exec card-game-postgres psql -U cardgame -d
 * cardgame -c "CREATE DATABASE cardgame_test OWNER cardgame;"`), migrated and
 * seeded independently (see the "e2e test database" section of the repo's
 * runbook / this file's sibling comments in the e2e specs).
 *
 * `configuration.ts` and `data-source.ts` both do
 * `process.env.DATABASE_URL ?? '<default>'`, and `ConfigModule.forRoot`'s
 * internal `dotenv.config()` call never overrides an already-set
 * `process.env` var. So setting it here, before any of that code runs,
 * sticks for the whole test file regardless of what `.env` / `../.env`
 * contain.
 */
process.env.DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://cardgame:cardgame@localhost:5433/cardgame_test';
