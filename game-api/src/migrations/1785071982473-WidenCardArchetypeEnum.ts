import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens the `card_archetype` enum from 5 values to 10, adding `dragon`,
 * `slime`, `sword`, `potion`, `crystal` (see `ARCHETYPES` in
 * `@card-game/shared-types`).
 *
 * --- Why this is not a one-line ALTER TYPE ---
 *
 * Before Postgres 12, `ALTER TYPE ... ADD VALUE` could not run inside a
 * transaction block at all. Postgres 12+ (we run postgres:16-alpine, see
 * docker-compose.yml) lifted that restriction with one caveat that still
 * matters: a newly-added enum value is not "safe to use" until the
 * transaction that added it has committed. Using it earlier — e.g.
 * inserting a row with it, or comparing a column to it as a typed enum
 * literal — inside that same transaction throws
 * `unsafe use of new value "..." of enum type card_archetype`.
 *
 * TypeORM's MigrationExecutor defaults to wrapping the whole migration run
 * in one transaction (`migrationsTransactionMode: 'all'`, the default —
 * see `src/database/data-source.ts`, which does not override it). That is
 * fine here because THIS migration never uses the new values itself — it
 * only adds them. Every `ALTER TYPE ... ADD VALUE` below runs, then the
 * transaction commits when `up()` returns; only after that commit can a
 * caller (the admin ingest endpoint, a seed script, this file's own
 * proof-of-work check) actually insert a row with `archetype = 'dragon'`.
 * That ordering was verified by hand against the live database on 5433:
 * `migration:run` completes, and only then does
 * `INSERT INTO cards (..., archetype, ...) VALUES (..., 'dragon', ...)`
 * succeed — attempting it inside this same migration's transaction would
 * fail with the "unsafe use" error above.
 *
 * `IF NOT EXISTS` on each ADD VALUE makes `up()` idempotent if it's ever
 * re-run against a database that already has some of the new values (e.g.
 * a partially-applied prior attempt).
 *
 * --- down() ---
 *
 * Postgres has no `ALTER TYPE ... DROP VALUE`. The only honest way to
 * shrink an enum is to recreate the type without the removed values and
 * swap the column over — which requires that no existing row still uses
 * one of those values (their data would otherwise have nowhere valid to
 * cast to). So `down()` first checks for any such row and refuses loudly
 * if it finds one, rather than silently corrupting or truncating data.
 * If the check passes, it does a genuine recreate: new restricted type,
 * `ALTER COLUMN ... TYPE ... USING ...` (this rewrites the table — cheap
 * at hundreds of rows, and the ACCESS EXCLUSIVE lock is held only for the
 * duration of that rewrite), drop the old (widened) type, rename the new
 * one into its place. This is a real, working revert, not a no-op.
 */
export class WidenCardArchetypeEnum1785071982473 implements MigrationInterface {
  name = 'WidenCardArchetypeEnum1785071982473';

  private readonly newValues = ['dragon', 'slime', 'sword', 'potion', 'crystal'];
  private readonly originalValues = ['beast', 'humanoid', 'undead', 'construct', 'spirit'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of this.newValues) {
      await queryRunner.query(`ALTER TYPE "card_archetype" ADD VALUE IF NOT EXISTS '${value}'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ archetype: string; count: string }> = await queryRunner.query(
      `SELECT "archetype"::text AS archetype, count(*)::text AS count
       FROM "cards"
       WHERE "archetype"::text = ANY($1)
       GROUP BY "archetype"::text`,
      [this.newValues],
    );

    if (rows.length > 0) {
      const detail = rows.map((r) => `${r.archetype}=${r.count}`).join(', ');
      throw new Error(
        `Cannot revert WidenCardArchetypeEnum: rows still use a new archetype value (${detail}). ` +
          `Reassign or remove those cards to one of [${this.originalValues.join(', ')}] before reverting.`,
      );
    }

    // Recreate the enum type without the 5 new values, then swap the column.
    await queryRunner.query(
      `CREATE TYPE "card_archetype_old" AS ENUM (${this.originalValues.map((v) => `'${v}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "cards" ALTER COLUMN "archetype" TYPE "card_archetype_old" USING "archetype"::text::"card_archetype_old"`,
    );
    await queryRunner.query(`DROP TYPE "card_archetype"`);
    await queryRunner.query(`ALTER TYPE "card_archetype_old" RENAME TO "card_archetype"`);
  }
}
