import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { MILESTONE_LADDER } from '@card-game/shared-types';
import type { MilestoneKey, MilestonesResponseDto } from '@card-game/shared-types';
import type { DataSource, EntityManager } from 'typeorm';
import { PlayerMilestoneEntity } from '../entities';
import type { PlayerEntity } from '../entities';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class MilestoneService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Called from INSIDE the caller's own transaction (`DropsService.openCase`,
   * `InventoryService.claimDailyBonus`) with that SAME `EntityManager` — the
   * `COUNT(DISTINCT card_id)` below must see the calling transaction's own
   * uncommitted `player_cards` insert, which a fresh repository or the
   * injected `DataSource` would not.
   *
   * Awards ALL newly-reached tiers in one pass. This is what makes lazy
   * catch-up correct: a player who was already sitting at 19 unique cards
   * before this system existed clears tier 1 (`unique_10`) the moment either
   * call site next runs, with no ledger-writing migration required.
   *
   * Mutates `player.balanceCoins` / `player.balanceKeys` IN PLACE and does
   * NOT call `manager.save(player)` itself — the caller persists the row via
   * its own existing save, so the milestone reward commits atomically with
   * whatever balance/pity/claim-timestamp change the caller was already
   * about to write.
   */
  async checkAndAward(manager: EntityManager, player: PlayerEntity): Promise<void> {
    const uniqueCards = await this.countUniqueCards(manager, player.id);
    const awardedKeys = await this.getAwardedKeys(manager, player.id);

    for (const tier of MILESTONE_LADDER) {
      if (awardedKeys.has(tier.key)) continue;
      if (uniqueCards < tier.uniqueCards) continue;

      player.balanceCoins += tier.reward.coins;
      player.balanceKeys += tier.reward.keys;

      // ADR-008: every balance change goes through the ledger.
      const transaction = await this.ledgerService.recordTransaction(manager, {
        playerId: player.id,
        type: 'milestone',
        deltaCoins: tier.reward.coins,
        deltaKeys: tier.reward.keys,
        refType: 'player_milestone',
        refId: null,
      });

      const milestoneRow = manager.create(PlayerMilestoneEntity, {
        playerId: player.id,
        milestoneKey: tier.key,
        transactionId: transaction.id,
      });
      // If this is ever a re-award of an already-awarded key (the lock
      // reasoning above turned out wrong, or a future refactor drops it),
      // the UNIQUE (player_id, milestone_key) constraint raises 23505 here
      // and the whole transaction — including the balance mutation above —
      // rolls back. See that constraint's own comment in the
      // AddPlayerMilestones migration.
      await manager.save(milestoneRow);
    }
  }

  /**
   * `GET /me/milestones` — read-only, AWARDS NOTHING. Deliberately uses the
   * plain injected `DataSource`, never a transaction: a GET that writes to
   * the ledger is a booby trap.
   */
  async getStatus(playerId: string): Promise<MilestonesResponseDto> {
    const ownedUniqueCards = await this.countUniqueCards(this.dataSource, playerId);

    const awarded = (await this.dataSource.query(
      `SELECT milestone_key, awarded_at FROM player_milestones WHERE player_id = $1`,
      [playerId],
    )) as Array<{ milestone_key: MilestoneKey; awarded_at: Date | string }>;
    const awardedMap = new Map(awarded.map((row) => [row.milestone_key, row.awarded_at]));

    const tiers = MILESTONE_LADDER.map((tier) => {
      const awardedAt = awardedMap.get(tier.key);
      return {
        ...tier,
        earned: awardedAt !== undefined,
        awardedAt: awardedAt !== undefined ? new Date(awardedAt).toISOString() : null,
      };
    });

    return { ownedUniqueCards, tiers };
  }

  /**
   * Same query either through the caller's transactional `EntityManager` or
   * the plain `DataSource` — both expose an identical `.query()`.
   */
  private async countUniqueCards(
    queryable: DataSource | EntityManager,
    playerId: string,
  ): Promise<number> {
    const rows = (await queryable.query(
      `SELECT COUNT(DISTINCT pc.card_id)::int AS count
       FROM player_cards pc
       WHERE pc.player_id = $1 AND pc.sold_at IS NULL`,
      [playerId],
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  private async getAwardedKeys(manager: EntityManager, playerId: string): Promise<Set<MilestoneKey>> {
    const rows = (await manager.query(
      `SELECT milestone_key FROM player_milestones WHERE player_id = $1`,
      [playerId],
    )) as Array<{ milestone_key: MilestoneKey }>;
    return new Set(rows.map((row) => row.milestone_key));
  }
}
