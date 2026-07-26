import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — all six tables from vault 02 in one migration, since
 * nothing is deployed yet. Uses the built-in `gen_random_uuid()` (available
 * unextended on Postgres 13+) instead of the `pgcrypto` extension.
 */
export class InitialSchema1785017587632 implements MigrationInterface {
  name = 'InitialSchema1785017587632';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- enum types ---
    await queryRunner.query(`
      CREATE TYPE "card_rarity" AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')
    `);
    await queryRunner.query(`
      CREATE TYPE "card_element" AS ENUM ('fire', 'water', 'earth', 'air', 'shadow', 'light')
    `);
    await queryRunner.query(`
      CREATE TYPE "card_archetype" AS ENUM ('beast', 'humanoid', 'undead', 'construct', 'spirit')
    `);
    await queryRunner.query(`
      CREATE TYPE "card_status" AS ENUM ('draft', 'approved', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "transaction_type" AS ENUM ('case_open', 'card_sell', 'daily_bonus', 'initial_grant', 'milestone')
    `);

    // --- cards ---
    await queryRunner.query(`
      CREATE TABLE "cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "flavor_text" text NULL,
        "rarity" "card_rarity" NOT NULL,
        "element" "card_element" NULL,
        "archetype" "card_archetype" NOT NULL,
        "attack" integer NOT NULL DEFAULT 0,
        "defense" integer NOT NULL DEFAULT 0,
        "image_path" text NOT NULL,
        "thumb_path" text NOT NULL,
        "status" "card_status" NOT NULL DEFAULT 'draft',
        "set_id" uuid NULL,
        "gen_meta" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cards" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cards_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cards_status_rarity" ON "cards" ("status", "rarity")
    `);

    // --- players ---
    await queryRunner.query(`
      CREATE TABLE "players" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "display_name" text NOT NULL,
        "balance_coins" bigint NOT NULL DEFAULT 1000,
        "balance_keys" integer NOT NULL DEFAULT 5,
        "pity_counter" integer NOT NULL DEFAULT 0,
        "last_daily_claim_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_players" PRIMARY KEY ("id")
      )
    `);

    // --- cases ---
    await queryRunner.query(`
      CREATE TABLE "cases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "price_coins" bigint NULL,
        "price_keys" integer NULL,
        "image_path" text NOT NULL,
        "rarity_weights" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cases_slug" UNIQUE ("slug")
      )
    `);

    // --- case_openings ---
    await queryRunner.query(`
      CREATE TABLE "case_openings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "case_id" uuid NOT NULL,
        "won_card_id" uuid NOT NULL,
        "reel" jsonb NOT NULL,
        "winning_index" integer NOT NULL,
        "server_seed" text NOT NULL,
        "client_seed" text NULL,
        "nonce" bigint NOT NULL,
        "idempotency_key" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_case_openings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_case_openings_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_case_openings_case" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_case_openings_won_card" FOREIGN KEY ("won_card_id") REFERENCES "cards" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_case_openings_player_created" ON "case_openings" ("player_id", "created_at")
    `);
    // Partial unique index: honours the optional Idempotency-Key header on
    // POST /cases/:slug/open without a seventh table. Rows without a header
    // (idempotency_key IS NULL) are unconstrained.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_case_openings_idempotency" ON "case_openings" ("player_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);

    // --- player_cards ---
    await queryRunner.query(`
      CREATE TABLE "player_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "card_id" uuid NOT NULL,
        "drop_id" uuid NULL,
        "acquired_at" timestamptz NOT NULL DEFAULT now(),
        "sold_at" timestamptz NULL,
        CONSTRAINT "PK_player_cards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_player_cards_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_player_cards_card" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_player_cards_drop" FOREIGN KEY ("drop_id") REFERENCES "case_openings" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_player_cards_player_sold" ON "player_cards" ("player_id", "sold_at")
    `);

    // --- transactions ---
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "type" "transaction_type" NOT NULL,
        "delta_coins" bigint NOT NULL DEFAULT 0,
        "delta_keys" integer NOT NULL DEFAULT 0,
        "ref_type" text NULL,
        "ref_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_transactions_player_created" ON "transactions" ("player_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in FK-safe (child-first) order.
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "player_cards"`);
    await queryRunner.query(`DROP TABLE "case_openings"`);
    await queryRunner.query(`DROP TABLE "cases"`);
    await queryRunner.query(`DROP TABLE "players"`);
    await queryRunner.query(`DROP TABLE "cards"`);

    await queryRunner.query(`DROP TYPE "transaction_type"`);
    await queryRunner.query(`DROP TYPE "card_status"`);
    await queryRunner.query(`DROP TYPE "card_archetype"`);
    await queryRunner.query(`DROP TYPE "card_element"`);
    await queryRunner.query(`DROP TYPE "card_rarity"`);
  }
}
