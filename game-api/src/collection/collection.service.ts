import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RARITIES, THEMATIC_SET_SEEDS } from '@card-game/shared-types';
import type {
  CollectionCardDto,
  CollectionCardsResponse,
  CollectionGoalDto,
  CollectionProgressDto,
  ListCollectionCardsQuery,
  Rarity,
} from '@card-game/shared-types';
import type { DataSource } from 'typeorm';
import { CardMapper } from '../cards/card.mapper';
import { CardsService } from '../cards/cards.service';
import { MilestoneService } from '../milestones/milestone.service';
import { PoolService } from './pool.service';

@Injectable()
export class CollectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly poolService: PoolService,
    private readonly cardsService: CardsService,
    private readonly cardMapper: CardMapper,
    private readonly milestoneService: MilestoneService,
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

  /**
   * The first source is the nearest unearned milestone. The contract also
   * supports future themed sets without reshaping this endpoint or its UI.
   */
  async getGoal(playerId: string): Promise<CollectionGoalDto | null> {
    for (const set of THEMATIC_SET_SEEDS) {
      const [row] = await this.dataSource.query<Array<{ owned: number; total: number }>>(
        `SELECT COUNT(DISTINCT pc.card_id) FILTER (WHERE pc.sold_at IS NULL)::int AS owned,
                COUNT(c.id)::int AS total
         FROM cards c
         LEFT JOIN player_cards pc ON pc.card_id = c.id AND pc.player_id = $1
         WHERE c.status = 'approved' AND c.set_id = $2`,
        [playerId, set.id],
      );
      const owned = Number(row?.owned ?? 0);
      const total = Number(row?.total ?? 0);
      if (total > 0 && owned < total) {
        return {
          id: set.slug,
          kind: 'set',
          title: set.name,
          description: `${set.description} Collect ${total - owned} more ${total - owned === 1 ? 'card' : 'cards'} to complete the set.`,
          progress: { current: owned, target: total },
          reward: null,
          action: { label: 'Open Cinderbound Cache', href: `/open/${set.caseSlug}` },
        };
      }
    }
    const status = await this.milestoneService.getStatus(playerId);
    const tier = status.tiers.find((candidate) => !candidate.earned);
    if (!tier) return null;

    const remaining = Math.max(0, tier.uniqueCards - status.ownedUniqueCards);
    return {
      id: tier.key,
      kind: 'milestone',
      title: `${tier.uniqueCards} unique cards`,
      description: `Collect ${remaining} more unique ${remaining === 1 ? 'card' : 'cards'} to claim this milestone.`,
      progress: { current: status.ownedUniqueCards, target: tier.uniqueCards },
      reward: tier.reward,
      action: { label: 'Choose a case', href: '/' },
    };
  }

  /**
   * `GET /me/collection/cards` — the dex grid, paginated over the approved
   * pool (same filters/ordering as `GET /cards`). Each slot is masked
   * server-side: a card the player doesn't own comes back as `{id, rarity,
   * owned: false, card: null}`, never with art or a name attached.
   */
  async getCards(playerId: string, query: ListCollectionCardsQuery): Promise<CollectionCardsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;

    const { items, total } = await this.cardsService.findMany({
      status: 'approved',
      rarity: query.rarity,
      element: query.element,
      archetype: query.archetype,
      page,
      limit,
    });

    const ownedIds = await this.getOwnedCardIds(
      playerId,
      items.map((card) => card.id),
    );

    const dtoItems: CollectionCardDto[] = items.map((card) => {
      const owned = ownedIds.has(card.id);
      return {
        id: card.id,
        rarity: card.rarity,
        owned,
        card: owned ? this.cardMapper.toCardDto(card) : null,
      };
    });

    return { items: dtoItems, total, page, limit };
  }

  /** Which of `cardIds` this player owns at least one unsold copy of. */
  private async getOwnedCardIds(playerId: string, cardIds: string[]): Promise<Set<string>> {
    if (cardIds.length === 0) return new Set();

    const rows = await this.dataSource.query<Array<{ card_id: string }>>(
      `SELECT DISTINCT pc.card_id
       FROM player_cards pc
       WHERE pc.player_id = $1 AND pc.sold_at IS NULL AND pc.card_id = ANY($2::uuid[])`,
      [playerId, cardIds],
    );
    return new Set(rows.map((row) => row.card_id));
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
