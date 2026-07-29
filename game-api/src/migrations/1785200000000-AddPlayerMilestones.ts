import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `player_milestones` — one row per collection milestone a player has been
 * awarded (economy fix, part 1: collection milestones pay out on breadth,
 * which is exactly what a new player has, instead of the near-zero EV
 * `openCase` returns before duplicates accumulate).
 *
 * `transaction_type` already has a `'milestone'` member (see InitialSchema)
 * — added ahead of time, never written until now.
 */
export class AddPlayerMilestones1785200000000 implements MigrationInterface {
  name = 'AddPlayerMilestones1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "player_milestones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "player_id" uuid NOT NULL,
        "milestone_key" text NOT NULL,
        "awarded_at" timestamptz NOT NULL DEFAULT now(),
        "transaction_id" uuid NULL,
        CONSTRAINT "PK_player_milestones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_player_milestones_player" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_player_milestones_transaction" FOREIGN KEY ("transaction_id") REFERENCES "transactions" ("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_player_milestones_player_key" UNIQUE ("player_id", "milestone_key")
      )
    `);

    // The rationale, ON the constraint itself (not just in this file):
    // double-paying a milestone is prevented two independent ways. (a)
    // `DropsService.openCase` (and `InventoryService.claimDailyBonus`) take
    // `SELECT ... FOR UPDATE` on the player row FIRST, so concurrent calls
    // for the same player serialize on that lock — the second call's
    // `MilestoneService.checkAndAward` sees the first call's own
    // `player_milestones` INSERT as part of the same-row lock ordering, and
    // its "already awarded?" check is enough on its own. (b) Even if that
    // reasoning is ever wrong, or a future refactor drops the lock, a second
    // INSERT for the same (player_id, milestone_key) raises Postgres error
    // 23505 (unique_violation) and rolls the whole transaction back instead
    // of silently double-paying.
    await queryRunner.query(`
      COMMENT ON CONSTRAINT "UQ_player_milestones_player_key" ON "player_milestones" IS
      'Prevents double-paying a milestone two independent ways: (a) the callers (DropsService.openCase, InventoryService.claimDailyBonus) already take SELECT ... FOR UPDATE on the player row first, so concurrent calls serialize on that lock and a same-transaction check inherits safety for free; (b) even if that reasoning is ever wrong or a future refactor drops the lock, a second INSERT here raises 23505 (unique_violation) and rolls the transaction back.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "player_milestones"`);
  }
}
