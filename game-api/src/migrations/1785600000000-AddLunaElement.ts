import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'luna' (moon) to the `card_element` enum.
 *
 * See WidenCardArchetypeEnum migration for why enum expansion cannot be
 * a one-line ALTER TYPE inside a transaction: the new value is unsafe to
 * use until the transaction commits. This migration adds the value only.
 */
export class AddLunaElement1785600000000 implements MigrationInterface {
  name = 'AddLunaElement1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "card_element" ADD VALUE IF NOT EXISTS 'luna'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ element: string; count: string }> = await queryRunner.query(
      `SELECT "element"::text AS element, count(*)::text AS count
       FROM "cards"
       WHERE "element"::text = 'luna'
       GROUP BY "element"::text`,
    );

    if (rows.length > 0) {
      const detail = rows.map((r) => `${r.element}=${r.count}`).join(', ');
      throw new Error(
        `Cannot revert AddLunaElement: ${rows[0].count} card(s) still use 'luna' element. ` +
          `Reassign or remove those cards before reverting.`,
      );
    }

    const originalValues = ['fire', 'water', 'earth', 'air', 'shadow', 'light'];
    await queryRunner.query(
      `CREATE TYPE "card_element_old" AS ENUM (${originalValues.map((v) => `'${v}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "cards" ALTER COLUMN "element" TYPE "card_element_old" USING "element"::text::"card_element_old"`,
    );
    await queryRunner.query(`DROP TYPE "card_element"`);
    await queryRunner.query(`ALTER TYPE "card_element_old" RENAME TO "card_element"`);
  }
}
