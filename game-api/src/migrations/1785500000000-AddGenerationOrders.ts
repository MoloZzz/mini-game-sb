import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenerationOrders1785500000000 implements MigrationInterface {
  name = 'AddGenerationOrders1785500000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "generation_orders" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "status" text NOT NULL,
      "title" text NOT NULL, "brief" text NOT NULL,
      "archetype" "card_archetype" NOT NULL, "element" "card_element" NULL,
      "suggested_rarity" "card_rarity" NOT NULL, "candidate_count" smallint NOT NULL,
      "set_id" uuid NULL, "recipe_profile" text NOT NULL DEFAULT 'card-v1',
      "created_by_player_id" uuid NOT NULL, "run_id" uuid NULL,
      "ready_at" timestamptz NULL, "generated_at" timestamptz NULL, "completed_at" timestamptz NULL,
      "failure_code" text NULL, "failure_detail" text NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_generation_orders" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_generation_orders_status" CHECK ("status" IN ('draft','ready','generating','review','completed','failed','cancelled')),
      CONSTRAINT "CHK_generation_orders_candidate_count" CHECK ("candidate_count" BETWEEN 2 AND 6),
      CONSTRAINT "FK_generation_orders_creator" FOREIGN KEY ("created_by_player_id") REFERENCES "players"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE TABLE "generation_order_candidates" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL,
      "candidate_index" smallint NOT NULL, "slug" text NOT NULL, "seed" bigint NOT NULL,
      "status" text NOT NULL, "card_id" uuid NULL,
      CONSTRAINT "PK_generation_order_candidates" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_generation_order_candidates_order_index" UNIQUE ("order_id", "candidate_index"),
      CONSTRAINT "UQ_generation_order_candidates_slug" UNIQUE ("slug"),
      CONSTRAINT "UQ_generation_order_candidates_card" UNIQUE ("card_id"),
      CONSTRAINT "CHK_generation_order_candidates_status" CHECK ("status" IN ('planned','generated','selected','discarded')),
      CONSTRAINT "FK_generation_order_candidates_order" FOREIGN KEY ("order_id") REFERENCES "generation_orders"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_generation_order_candidates_card" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL
    )`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "generation_order_candidates"');
    await queryRunner.query('DROP TABLE "generation_orders"');
  }
}
