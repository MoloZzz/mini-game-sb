import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Durable, server-owned state for the bounded Archive Notes task. */
export class AddArchiveDossiers1785400000000 implements MigrationInterface {
  name = 'AddArchiveDossiers1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "archive_dossiers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archive_dossiers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_archive_dossiers_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "archive_notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "card_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archive_notes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_archive_notes_player_card" UNIQUE ("player_id", "card_id"),
        CONSTRAINT "FK_archive_notes_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_archive_notes_dossier" FOREIGN KEY ("dossier_id") REFERENCES "archive_dossiers" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_archive_notes_card" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "archive_passes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "opening_id" uuid NULL,
        "earned_at" timestamptz NOT NULL DEFAULT now(),
        "consumed_at" timestamptz NULL,
        CONSTRAINT "PK_archive_passes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_archive_passes_dossier" UNIQUE ("dossier_id"),
        CONSTRAINT "UQ_archive_passes_opening" UNIQUE ("opening_id"),
        CONSTRAINT "FK_archive_passes_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_archive_passes_dossier" FOREIGN KEY ("dossier_id") REFERENCES "archive_dossiers" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_archive_passes_opening" FOREIGN KEY ("opening_id") REFERENCES "case_openings" ("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "archive_passes"');
    await queryRunner.query('DROP TABLE "archive_notes"');
    await queryRunner.query('DROP TABLE "archive_dossiers"');
  }
}
