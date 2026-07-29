import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DAILY_BONUS,
  DAILY_BONUS_COOLDOWN_MS,
  RARITY_META,
  SELL_BULK_MAX_INSTANCES,
} from '@card-game/shared-types';
import type {
  ClaimDailyBonusResponse,
  DropHistoryItemDto,
  InventoryItemDto,
  InventoryPageDto,
  Rarity,
  SellBulkResponse,
  SellCardResponse,
} from '@card-game/shared-types';
import type { DataSource, EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import { CardMapper } from '../cards/card.mapper';
import { apiError } from '../common/api-error';
import { CardEntity, PlayerCardEntity, PlayerEntity } from '../entities';
import type { RecordTransactionInput } from '../ledger/ledger.service';
import { LedgerService } from '../ledger/ledger.service';
import { MilestoneService } from '../milestones/milestone.service';
import { isDailyBonusReady, nextAvailableAt } from './daily-bonus.util';
import type { ListInventoryQueryDto } from './dto/list-inventory.query';
import type { SellBulkRequestDto } from './dto/sell-bulk.dto';

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
    private readonly milestoneService: MilestoneService,
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
        apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
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
   * `POST /me/inventory/sell-bulk`. Same locking discipline as `sellCard`:
   * ONE transaction, player row locked FIRST. Unlike `sellCard`, this never
   * needs a per-instance `LAST_COPY` check: `resolveSellableInstances` only
   * ever returns `copies - 1` instances per card (oldest first), so the
   * newest / last remaining copy of any card is never in the selected set —
   * the rule holds BY CONSTRUCTION, with nothing to refuse per instance.
   *
   * No idempotency key. Sales are soft-deletes and `resolveSellableInstances`
   * already filters `sold_at IS NULL`, so a replayed identical request finds
   * nothing left to sell and returns `soldCount: 0` for free. An
   * `idempotency_keys` table is the general-purpose fix for replay safety,
   * but it would buy nothing on top of that here.
   *
   * Deliberately does NOT call `MilestoneService.checkAndAward` (unlike
   * `claimDailyBonus`) — selling only removes duplicate instances, so it can
   * never increase the player's unique-card count and can never newly cross
   * a milestone tier.
   */
  async sellBulk(playerId: string, body: SellBulkRequestDto): Promise<SellBulkResponse> {
    return this.dataSource.transaction(async (manager) => {
      const player = await manager
        .createQueryBuilder(PlayerEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: playerId })
        .getOne();

      if (!player) {
        apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
      }

      const scope: { rarities?: Rarity[]; instanceIds?: string[] } =
        body.mode === 'by_rarity'
          ? { rarities: body.rarities } // SellBulkRequestDto guarantees non-empty for this mode
          : body.mode === 'all_duplicates'
            ? {}
            : { instanceIds: body.instanceIds }; // SellBulkRequestDto guarantees non-empty for this mode

      const instanceIds = await this.resolveSellableInstances(manager, player.id, scope);

      if (instanceIds.length === 0) {
        return {
          soldCount: 0,
          gained: { coins: 0 },
          balance: { coins: player.balanceCoins, keys: player.balanceKeys },
        };
      }

      if (instanceIds.length > SELL_BULK_MAX_INSTANCES) {
        apiError(
          400,
          'BULK_SELL_CAP_EXCEEDED',
          `Bulk sell resolved to ${instanceIds.length} instances, which is over the ${SELL_BULK_MAX_INSTANCES} cap`,
          { requested: instanceIds.length, max: SELL_BULK_MAX_INSTANCES },
        );
      }

      const rarityRows = await manager.query<Array<{ id: string; rarity: CardEntity['rarity'] }>>(
        `SELECT pc.id, c.rarity
         FROM player_cards pc
         JOIN cards c ON c.id = pc.card_id
         WHERE pc.id = ANY($1)`,
        [instanceIds],
      );

      // One UPDATE soft-deletes every selected instance.
      await manager.query('UPDATE player_cards SET sold_at = now() WHERE id = ANY($1)', [
        instanceIds,
      ]);

      let totalCoins = 0;
      const transactionInputs: RecordTransactionInput[] = rarityRows.map((row) => {
        const sellValue = RARITY_META[row.rarity].sellValue;
        totalCoins += sellValue;
        return {
          playerId: player.id,
          type: 'card_sell',
          deltaCoins: sellValue,
          deltaKeys: 0,
          refType: 'player_card',
          refId: row.id,
        };
      });

      // One multi-row INSERT — one ledger row per instance (ADR-008), never
      // aggregated into a single summary row (see recordBulkTransactions).
      await this.ledgerService.recordBulkTransactions(manager, transactionInputs);

      player.balanceCoins += totalCoins;
      await manager.save(player);

      return {
        soldCount: instanceIds.length,
        gained: { coins: totalCoins },
        balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      };
    });
  }

  /**
   * Core selection for bulk sell: for every card matching the optional
   * scope, returns every unsold instance EXCEPT the newest one — oldest
   * first via `ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY acquired_at
   * ASC, id ASC)`, capped at `COUNT(*) - 1` per card via the matching window
   * count. A card with a single unsold copy contributes zero rows
   * (`cnt - 1 = 0`), so nothing this query returns is ever the last copy of
   * its card.
   *
   * `scope.instanceIds`, when given, scopes the window to every CARD that
   * has at least one requested instance — not to the requested instances
   * themselves — because the window needs every unsold copy of that card to
   * correctly identify which one is newest. The final `.filter` below then
   * intersects the resolved (copies - 1, oldest-first) set with what was
   * actually requested; a requested id that turns out to be the newest copy
   * of its card is silently dropped here rather than sold or reported as an
   * error — see `sellBulk`'s comment on why LAST_COPY needs no per-instance
   * check for this endpoint.
   */
  private async resolveSellableInstances(
    manager: EntityManager,
    playerId: string,
    scope: { rarities?: Rarity[]; instanceIds?: string[] },
  ): Promise<string[]> {
    const conditions = ['pc.player_id = $1', 'pc.sold_at IS NULL'];
    const params: unknown[] = [playerId];

    if (scope.rarities?.length) {
      params.push(scope.rarities);
      conditions.push(`c.rarity = ANY($${params.length})`);
    }
    if (scope.instanceIds?.length) {
      params.push(scope.instanceIds);
      conditions.push(
        `pc.card_id IN (SELECT card_id FROM player_cards WHERE player_id = $1 AND id = ANY($${params.length}))`,
      );
    }

    const rows = await manager.query<Array<{ id: string }>>(
      `SELECT ranked.id FROM (
         SELECT pc.id,
                ROW_NUMBER() OVER (PARTITION BY pc.card_id ORDER BY pc.acquired_at ASC, pc.id ASC) AS rn,
                COUNT(*) OVER (PARTITION BY pc.card_id) AS cnt
         FROM player_cards pc
         JOIN cards c ON c.id = pc.card_id
         WHERE ${conditions.join(' AND ')}
       ) ranked
       WHERE ranked.rn <= ranked.cnt - 1
       ORDER BY ranked.rn ASC`,
      params,
    );

    const resolvedIds = rows.map((row) => row.id);

    if (!scope.instanceIds?.length) {
      return resolvedIds;
    }

    const requested = new Set(scope.instanceIds);
    return resolvedIds.filter((id) => requested.has(id));
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
        apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
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

      // Collection milestones (economy fix, part 1): already under the
      // player-row lock taken above, so a player who stops opening cases but
      // already crossed a unique-card threshold — including one crossed
      // before this system existed, with no ledger-writing migration to
      // catch them up — still collects it here. Mutates `player`'s
      // in-memory balance in place; persisted together with the daily-bonus
      // credit by the single `manager.save` below.
      await this.milestoneService.checkAndAward(manager, player);

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
