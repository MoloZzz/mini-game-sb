import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Makes a case's optional set scope durable for existing local databases. */
export class AddCaseSetScope1785300000000 implements MigrationInterface {
  name = 'AddCaseSetScope1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "cases" ADD COLUMN "set_id" uuid NULL');
    await queryRunner.query(`
      INSERT INTO "cases" ("slug", "name", "price_coins", "price_keys", "image_path", "rarity_weights", "set_id", "is_active")
      VALUES (
        'cinderbound-cache', 'Cinderbound Cache', 400, NULL, 'cases/cinderbound-cache.png',
        '{"common":35,"uncommon":28,"rare":18,"epic":10,"legendary":6,"mythic":3}'::jsonb,
        '8a3b8787-6d09-4c98-a85b-5e964df85ed8', true
      )
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "cases" DROP COLUMN "set_id"');
  }
}
