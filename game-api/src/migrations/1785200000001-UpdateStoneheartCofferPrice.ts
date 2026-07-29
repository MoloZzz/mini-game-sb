import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `stoneheart-coffer` 180 -> 120 coins (economy fix, part 1). At 180 it was
 * strictly dominated by the 100-coin Starter Chest — more expensive with a
 * worse EV ratio (34% vs. 61%) — so no player had any reason to buy it. At
 * 120 the ratio is 51% and its narrower rare band buys measurably faster
 * collection.
 *
 * A REAL migration, not just the `CASE_SEEDS` constant edit in
 * `@card-game/shared-types`: `seedCases` (see `src/seed/seed.ts`) skips any
 * slug that already exists in the `cases` table, so editing the constant
 * alone would never reach an already-seeded database.
 */
export class UpdateStoneheartCofferPrice1785200000001 implements MigrationInterface {
  name = 'UpdateStoneheartCofferPrice1785200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cases" SET "price_coins" = 120 WHERE "slug" = 'stoneheart-coffer'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cases" SET "price_coins" = 180 WHERE "slug" = 'stoneheart-coffer'`,
    );
  }
}
