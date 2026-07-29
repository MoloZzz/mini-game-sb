import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promotes the ledger invariant `SUM(delta_coins) == balance_coins` (and the
 * same for keys) from a test-only assertion (`ledger-invariant.e2e-spec.ts`)
 * into an actual database constraint — economy fix, final piece.
 *
 * --- Part A: pre-flight check ---
 *
 * Docker/Postgres could not be reached while writing this migration, so
 * whatever `cardgame`'s live state actually is was unverifiable. Rather than
 * assume it is clean and let a pre-existing violation surface as an obscure
 * failure partway through `CREATE CONSTRAINT TRIGGER` (or, worse, as the
 * trigger's very first fire against unrelated, unlucky application code),
 * this migration re-runs the same violation-detecting query
 * `ledger-invariant.e2e-spec.ts` uses (`coinInvariantViolations` /
 * `keyInvariantViolations`, around its line 101) FIRST and throws with the
 * offending player ids if it finds anything. Nothing below the throw ever
 * runs — the migration does not apply halfway.
 *
 * --- Part B: the trigger ---
 *
 * Lives on `players`, NOT `transactions`, because every balance mutation in
 * this codebase pairs `LedgerService.recordTransaction` (or
 * `recordBulkTransactions`) with a single `manager.save(player)` inside one
 * Postgres transaction — verifiable in `DropsService.openCase`,
 * `InventoryService.sellCard`, `InventoryService.sellBulk`,
 * `InventoryService.claimDailyBonus`, and `seed.ts`'s `seedPlayer`. Watching
 * the player row catches every one of those paths and fires ONCE PER PLAYER
 * PER TRANSACTION, rather than once per ledger row — which matters for
 * `sellBulk`, which can write ~200 `transactions` rows in a single
 * multi-row INSERT (see `LedgerService.recordBulkTransactions`) but only
 * ever touches one `players` row.
 *
 * Documented gap: an INSERT into `transactions` with no corresponding
 * `players` UPDATE/INSERT in the same transaction slips past this trigger
 * entirely — it only re-validates on a write to `players`. Nothing in this
 * codebase does that today (ADR-008 requires every ledger write to be paired
 * with a balance write), so this is stated as the trigger's assumption, not
 * fixed here.
 *
 * `DEFERRABLE INITIALLY DEFERRED` — the check runs at COMMIT time, not at
 * the moment the row is written, so statement order inside a transaction
 * does not matter (e.g. `openCase` can write the ledger row before or after
 * `manager.save(player)`; both orders commit the same final state). This is
 * also why a raw, isolated `UPDATE players SET balance_coins = ...` in a
 * single-statement implicit transaction still fails — at COMMIT of that
 * statement, not when the `UPDATE` itself runs.
 *
 * Cost ceiling: one re-sum of one player's transactions per commit that
 * touches that player's row. Free at current volume (~343 total ledger
 * rows). If ledger volume ever reaches ~10^5 rows, replace this with a
 * running-total column maintained by the application instead of a
 * per-commit re-sum.
 */
export class AddLedgerInvariantTrigger1785200000002 implements MigrationInterface {
  name = 'AddLedgerInvariantTrigger1785200000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Part A: refuse to apply on top of an already-broken ledger. ---
    const violations: Array<{
      id: string;
      balance_coins: string;
      balance_keys: string;
      ledger_coins: string | null;
      ledger_keys: string | null;
    }> = await queryRunner.query(`
      SELECT p.id,
             p.balance_coins,
             p.balance_keys,
             SUM(t.delta_coins) AS ledger_coins,
             SUM(t.delta_keys) AS ledger_keys
      FROM players p
      JOIN transactions t ON t.player_id = p.id
      GROUP BY p.id, p.balance_coins, p.balance_keys
      HAVING p.balance_coins <> SUM(t.delta_coins) OR p.balance_keys <> SUM(t.delta_keys)
    `);

    if (violations.length > 0) {
      const offenders = violations
        .map(
          (v) =>
            `player ${v.id} (balance_coins=${v.balance_coins} vs ledger=${v.ledger_coins}, ` +
            `balance_keys=${v.balance_keys} vs ledger=${v.ledger_keys})`,
        )
        .join('; ');
      throw new Error(
        `AddLedgerInvariantTrigger: refusing to install the constraint trigger — the ledger ` +
          `invariant SUM(delta_coins) == balance_coins (and/or the keys equivalent) is already ` +
          `violated for ${violations.length} player(s): ${offenders}. Fix the underlying data ` +
          `before re-running this migration.`,
      );
    }

    // --- Part B: the trigger function + constraint trigger. ---
    await queryRunner.query(`
      CREATE FUNCTION "check_player_ledger_invariant"() RETURNS trigger AS $$
      DECLARE
        ledger_coins bigint;
        ledger_keys integer;
      BEGIN
        SELECT COALESCE(SUM(delta_coins), 0), COALESCE(SUM(delta_keys), 0)
          INTO ledger_coins, ledger_keys
          FROM transactions
          WHERE player_id = NEW.id;

        IF ledger_coins <> NEW.balance_coins OR ledger_keys <> NEW.balance_keys THEN
          RAISE EXCEPTION
            'Ledger invariant violated for player %: balance_coins=% vs SUM(delta_coins)=%, balance_keys=% vs SUM(delta_keys)=%',
            NEW.id, NEW.balance_coins, ledger_coins, NEW.balance_keys, ledger_keys;
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_players_ledger_invariant"
      AFTER INSERT OR UPDATE ON "players"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "check_player_ledger_invariant"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "trg_players_ledger_invariant" ON "players"`);
    await queryRunner.query(`DROP FUNCTION "check_player_ledger_invariant"()`);
  }
}
