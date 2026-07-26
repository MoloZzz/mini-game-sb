import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DAILY_BONUS, DAILY_BONUS_COOLDOWN_MS, RARITY_META } from '@card-game/shared-types';
import type {
  ClaimDailyBonusResponse,
  DropHistoryItemDto,
  InventoryItemDto,
  InventoryPageDto,
  SellCardResponse,
} from '@card-game/shared-types';
import type { DataSource } from 'typeorm';
import { IsNull } from 'typeorm';
import { CardMapper } from '../cards/card.mapper';
import { apiError } from '../common/api-error';
import { CardEntity, PlayerCardEntity, PlayerEntity } from '../entities';
import { LedgerService } from '../ledger/ledger.service';
import { isDailyBonusReady, nextAvailableAt } from './daily-bonus.util';
import type { ListInventoryQueryDto } from './dto/list-inventory.query';

/**
 * Raw shape of one grouped inventory row — the SELECT below aliases every
 * snake_case column to the exact camelCase name `CardMapper.toCardDto` reads,
 * so the row can be cast straight to `CardEntity` with no extra mapping step.
 */
interface InventoryGroupRow {
  id: string;
  slug: string;
  name: string;
  rarity: CardEntity['rarity'];
  element: CardEntity['element'];
  archetype: CardEntity['archetype'];
  attack: number;
  defense: number;
  flavorText: string | null;
  imagePath: string;
  thumbPath: string;
  copies: number;
  instanceId: string;
  acquiredAt: Date | string;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cardMapper: CardMapper,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Inventory grouped by card (vault 03: "61 tiles with three identical ones
   * reads worse"). One grouped query for the page, one for the total group
   * count — never one query per card. Postgres allows selecting `c.*`
   * ungrouped alongside the aggregates because `c.id` (the primary key) is in
   * `GROUP BY`, so every other `c` column is functionally dependent on it.
   */
  async listInventory(playerId: string, query: ListInventoryQueryDto): Promise<InventoryPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;
    const sort = query.sort ?? 'rarity_desc';

    const conditions = ['pc.player_id = $1', 'pc.sold_at IS NULL'];
    const whereParams: unknown[] = [playerId];

    if (query.rarity) {
      whereParams.push(query.rarity);
      conditions.push(`c.rarity = $${whereParams.length}`);
    }
    if (query.element) {
      whereParams.push(query.element);
      conditions.push(`c.element = $${whereParams.length}`);
    }
    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    const rows = await this.dataSource.query<InventoryGroupRow[]>(
      `SELECT c.id,
              c.slug,
              c.name,
              c.rarity,
              c.element,
              c.archetype,
              c.attack,
              c.defense,
              c.flavor_text AS "flavorText",
              c.image_path AS "imagePath",
              c.thumb_path AS "thumbPath",
              COUNT(*)::int AS copies,
              (array_agg(pc.id ORDER BY pc.acquired_at ASC, pc.id ASC))[1] AS "instanceId",
              (array_agg(pc.acquired_at ORDER BY pc.acquired_at ASC, pc.id ASC))[1] AS "acquiredAt"
       FROM player_cards pc
       JOIN cards c ON c.id = pc.card_id
       WHERE ${whereClause}
       GROUP BY c.id
       ${this.orderClauseFor(sort)}
       LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      [...whereParams, limit, offset],
    );

    const totalRows = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT c.id
         FROM player_cards pc
         JOIN cards c ON c.id = pc.card_id
         WHERE ${whereClause}
         GROUP BY c.id
       ) grouped`,
      whereParams,
    );

    const items: InventoryItemDto[] = rows.map((row) => ({
      instanceId: row.instanceId,
      card: this.cardMapper.toCardDto(row as unknown as CardEntity),
      acquiredAt: new Date(row.acquiredAt).toISOString(),
      copies: row.copies,
    }));

    return { items, total: totalRows[0]?.total ?? 0, page, limit };
  }

  private orderClauseFor(sort: ListInventoryQueryDto['sort']): string {
    switch (sort) {
      case 'rarity_asc':
        return 'ORDER BY c.rarity ASC, c.name ASC';
      case 'acquired_desc':
        // The group's exposed `acquiredAt` is its oldest unsold copy's
        // timestamp, so sort by that same value for consistency.
        return 'ORDER BY MIN(pc.acquired_at) DESC';
      case 'name_asc':
        return 'ORDER BY c.name ASC';
      case 'rarity_desc':
      default:
        // The `card_rarity` enum was created in ascending rarity order
        // (common..mythic — verified with `enum_range`), so `rarity DESC`
        // genuinely sorts rarest-first.
        return 'ORDER BY c.rarity DESC, c.name ASC';
    }
  }

  /**
   * `POST /me/inventory/:instanceId/sell`. ONE transaction, player row locked
   * FIRST (same discipline as `DropsService.openCase`) so a double-click can
   * never sell the same instance twice or race the last-copy check.
   */
  async sellCard(playerId: string, instanceId: string): Promise<SellCardResponse> {
    return this.dataSource.transaction(async (manager) => {
      const player = await manager
        .createQueryBuilder(PlayerEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: playerId })
        .getOne();

      if (!player) {
        throw new Error(`Player ${playerId} not found — run \`npm run seed\``);
      }

      const instance = await manager.findOne(PlayerCardEntity, {
        where: { id: instanceId },
        relations: ['card'],
      });

      if (!instance || instance.playerId !== player.id || instance.soldAt !== null) {
        apiError(404, 'INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`, { instanceId });
      }

      const unsoldCount = await manager.count(PlayerCardEntity, {
        where: { playerId: player.id, cardId: instance.cardId, soldAt: IsNull() },
      });

      if (unsoldCount <= 1) {
        apiError(409, 'LAST_COPY', 'Cannot sell the last copy of a card', {
          cardId: instance.cardId,
        });
      }

      instance.soldAt = new Date();
      await manager.save(instance);

      const sellValue = RARITY_META[instance.card.rarity].sellValue;
      player.balanceCoins += sellValue;

      await this.ledgerService.recordTransaction(manager, {
        playerId: player.id,
        type: 'card_sell',
        deltaCoins: sellValue,
        deltaKeys: 0,
        refType: 'player_card',
        refId: instance.id,
      });

      await manager.save(player);

      return {
        gained: { coins: sellValue },
        balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      };
    });
  }

  /**
   * `POST /me/daily-bonus` — read-time check on `last_daily_claim_at`, no
   * cron (vault 04). Player row locked FIRST, same discipline as everywhere
   * else a balance changes.
   */
  async claimDailyBonus(playerId: string): Promise<ClaimDailyBonusResponse> {
    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      const player = await manager
        .createQueryBuilder(PlayerEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: playerId })
        .getOne();

      if (!player) {
        throw new Error(`Player ${playerId} not found — run \`npm run seed\``);
      }

      if (!isDailyBonusReady(player.lastDailyClaimAt, now)) {
        apiError(409, 'DAILY_BONUS_NOT_READY', 'Daily bonus is not ready yet', {
          nextAvailableAt: nextAvailableAt(player.lastDailyClaimAt as Date).toISOString(),
        });
      }

      player.balanceCoins += DAILY_BONUS.coins;
      player.balanceKeys += DAILY_BONUS.keys;
      player.lastDailyClaimAt = now;

      await this.ledgerService.recordTransaction(manager, {
        playerId: player.id,
        type: 'daily_bonus',
        deltaCoins: DAILY_BONUS.coins,
        deltaKeys: DAILY_BONUS.keys,
        refType: 'daily_bonus',
        refId: null,
      });

      await manager.save(player);

      return {
        gained: { ...DAILY_BONUS },
        balance: { coins: player.balanceCoins, keys: player.balanceKeys },
        nextAvailableAt: new Date(now.getTime() + DAILY_BONUS_COOLDOWN_MS).toISOString(),
      };
    });
  }

  /** `GET /me/drops?limit=` — newest first, one join query, never per-row. */
  async listDrops(playerId: string, limit: number): Promise<DropHistoryItemDto[]> {
    const rows = await this.dataSource.query<
      Array<{
        dropId: string;
        caseSlug: string;
        caseName: string;
        createdAt: Date | string;
        id: string;
        slug: string;
        name: string;
        rarity: CardEntity['rarity'];
        element: CardEntity['element'];
        archetype: CardEntity['archetype'];
        attack: number;
        defense: number;
        flavorText: string | null;
        imagePath: string;
        thumbPath: string;
      }>
    >(
      `SELECT co.id AS "dropId",
              ca.slug AS "caseSlug",
              ca.name AS "caseName",
              co.created_at AS "createdAt",
              c.id,
              c.slug,
              c.name,
              c.rarity,
              c.element,
              c.archetype,
              c.attack,
              c.defense,
              c.flavor_text AS "flavorText",
              c.image_path AS "imagePath",
              c.thumb_path AS "thumbPath"
       FROM case_openings co
       JOIN cases ca ON ca.id = co.case_id
       JOIN cards c ON c.id = co.won_card_id
       WHERE co.player_id = $1
       ORDER BY co.created_at DESC
       LIMIT $2`,
      [playerId, limit],
    );

    return rows.map((row) => ({
      dropId: row.dropId,
      caseSlug: row.caseSlug,
      caseName: row.caseName,
      card: this.cardMapper.toCardDto(row as unknown as CardEntity),
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }
}
