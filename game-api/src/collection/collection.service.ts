import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RARITIES } from '@card-game/shared-types';
import type { CollectionProgressDto, Rarity } from '@card-game/shared-types';
import type { DataSource } from 'typeorm';
import { PoolService } from './pool.service';

@Injectable()
export class CollectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly poolService: PoolService,
  ) {}

  /**
   * `owned` mirrors the old client-side `computeCollectionProgress`: a
   * distinct CARD counts once regardless of how many unsold copies the
   * player holds ("5 copies of one card is still 1 owned"). `total` comes
   * from `PoolService` — the real approved-card pool, never a constant.
   */
  async getProgress(playerId: string): Promise<CollectionProgressDto> {
    const [ownedByRarity, totalByRarity] = await Promise.all([
      this.getOwnedCountsByRarity(playerId),
      this.poolService.getApprovedCountsByRarity(),
    ]);

    const byRarity = {} as CollectionProgressDto['byRarity'];
    let owned = 0;
    let total = 0;

    for (const rarity of RARITIES) {
      const rarityOwned = ownedByRarity[rarity];
      const rarityTotal = totalByRarity[rarity];
      byRarity[rarity] = { owned: rarityOwned, total: rarityTotal };
      owned += rarityOwned;
      total += rarityTotal;
    }

    return { owned, total, byRarity };
  }

  /** One query, `COUNT(DISTINCT c.id)` grouped by rarity — never one query per card. */
  private async getOwnedCountsByRarity(playerId: string): Promise<Record<Rarity, number>> {
    const rows = await this.dataSource.query<Array<{ rarity: Rarity; count: number }>>(
      `SELECT c.rarity, COUNT(DISTINCT c.id)::int AS count
       FROM player_cards pc
       JOIN cards c ON c.id = pc.card_id
       WHERE pc.player_id = $1 AND pc.sold_at IS NULL
       GROUP BY c.rarity`,
      [playerId],
    );

    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const row of rows) {
      counts[row.rarity] = row.count;
    }
    return counts;
  }
}
