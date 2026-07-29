import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds authentication columns to `players` — part A of the auth plan.
 * `email`/`password_hash` are nullable ON PURPOSE: the existing seeded player
 * row must be allowed to exist unbound until an operator binds it via
 * `npm run account:bind` (there is deliberately no HTTP "claim your account"
 * endpoint — see `src/scripts/bind-account.ts`).
 */
export class AddPlayerAuth1785147378230 implements MigrationInterface {
  name = 'AddPlayerAuth1785147378230';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "player_role" AS ENUM ('player', 'admin')
    `);

    await queryRunner.query(`
      ALTER TABLE "players"
        ADD COLUMN "email" text NULL,
        ADD COLUMN "password_hash" text NULL,
        ADD COLUMN "role" "player_role" NOT NULL DEFAULT 'player',
        ADD COLUMN "last_login_at" timestamptz NULL
    `);

    // Partial unique index (same pattern as `uq_case_openings_idempotency` in
    // the initial migration): case-insensitive uniqueness on `email`, but
    // only among rows that actually have one — an unbound player leaves no
    // trace here.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_players_email" ON "players" (lower("email"))
      WHERE "email" IS NOT NULL
    `);

    // Drop the column defaults on the balance columns. Today ANY
    // `INSERT INTO players` that omits balances silently mints 1000 coins +
    // 5 keys with no matching `transactions` row, which breaks the ledger
    // invariant `SUM(delta_coins) == balance_coins` (ADR-008). Registration
    // (A6) is a brand new balance-creating INSERT path; after this DROP
    // DEFAULT, any insert that forgets to set balances explicitly fails on
    // NOT NULL instead of silently corrupting the ledger. Every existing
    // insert path (`seedPlayer`) already sets both columns explicitly, so
    // this is safe.
    await queryRunner.query(`
      ALTER TABLE "players" ALTER COLUMN "balance_coins" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "players" ALTER COLUMN "balance_keys" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the defaults dropped in up().
    await queryRunner.query(`
      ALTER TABLE "players" ALTER COLUMN "balance_coins" SET DEFAULT 1000
    `);
    await queryRunner.query(`
      ALTER TABLE "players" ALTER COLUMN "balance_keys" SET DEFAULT 5
    `);

    await queryRunner.query(`DROP INDEX "uq_players_email"`);

    await queryRunner.query(`
      ALTER TABLE "players"
        DROP COLUMN "last_login_at",
        DROP COLUMN "role",
        DROP COLUMN "password_hash",
        DROP COLUMN "email"
    `);

    await queryRunner.query(`DROP TYPE "player_role"`);
  }
}
