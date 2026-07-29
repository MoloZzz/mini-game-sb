import { RARITY_META, SELL_BULK_MAX_INSTANCES } from '@card-game/shared-types';
import type { DataSource, EntityManager } from 'typeorm';
import type { CardMapper } from '../cards/card.mapper';
import type { PlayerEntity } from '../entities';
import type { LedgerService } from '../ledger/ledger.service';
import type { MilestoneService } from '../milestones/milestone.service';
import type { SellBulkRequestDto } from './dto/sell-bulk.dto';
import { InventoryService } from './inventory.service';

/**
 * Mirrors `milestone.service.spec.ts` / `pool.service.spec.ts`: a fake
 * `EntityManager` whose `query()` switches on the SQL text to return canned
 * rows for whichever of `sellBulk`'s three queries is being made —
 * (1) `resolveSellableInstances`'s `ROW_NUMBER()` selection, (2) the
 * rarity lookup for the resolved ids, (3) the soft-delete `UPDATE`. The
 * player-row lock (`createQueryBuilder().setLock('pessimistic_write')...`)
 * is stubbed to resolve `options.player` directly.
 */
function fakeManager(options: {
  player: PlayerEntity;
  /** Canned return for the `ROW_NUMBER() OVER` selection query. */
  resolvedIds: string[];
  /** Rarity for every id that query (2) could plausibly be asked about. */
  rarityByInstanceId: Record<string, 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'>;
}): { manager: EntityManager; query: jest.Mock; save: jest.Mock; getOne: jest.Mock } {
  const getOne = jest.fn().mockResolvedValue(options.player);
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne,
  };

  const query = jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('ROW_NUMBER() OVER')) {
      return Promise.resolve(options.resolvedIds.map((id) => ({ id })));
    }
    if (sql.includes('SELECT pc.id, c.rarity')) {
      const ids = (params?.[0] as string[]) ?? [];
      return Promise.resolve(
        ids.map((id) => ({ id, rarity: options.rarityByInstanceId[id] })),
      );
    }
    if (sql.trim().startsWith('UPDATE player_cards SET sold_at')) {
      return Promise.resolve();
    }
    throw new Error(`fakeManager: unexpected query: ${sql}`);
  });

  const save = jest.fn().mockImplementation((row) => Promise.resolve(row));

  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    query,
    save,
  } as unknown as EntityManager;

  return { manager, query, save, getOne };
}

function fakeDataSource(manager: EntityManager): DataSource {
  const transaction = jest.fn().mockImplementation((cb: (m: EntityManager) => unknown) => cb(manager));
  return { transaction } as unknown as DataSource;
}

function fakeLedgerService(): { ledgerService: LedgerService; recordBulkTransactions: jest.Mock } {
  const recordBulkTransactions = jest.fn().mockResolvedValue(undefined);
  return {
    ledgerService: { recordBulkTransactions } as unknown as LedgerService,
    recordBulkTransactions,
  };
}

function fakePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'player-1',
    balanceCoins: 1000,
    balanceKeys: 5,
    ...overrides,
  } as PlayerEntity;
}

function makeService(
  manager: EntityManager,
  ledgerService: LedgerService,
): InventoryService {
  return new InventoryService(
    fakeDataSource(manager),
    {} as CardMapper,
    ledgerService,
    {} as MilestoneService,
  );
}

/** Pulls out the params passed to whichever query call matches `sqlIncludes`. */
function paramsFor(query: jest.Mock, sqlIncludes: string): unknown[] | undefined {
  const call = query.mock.calls.find((c) => (c[0] as string).includes(sqlIncludes));
  return call?.[1] as unknown[] | undefined;
}

function sqlFor(query: jest.Mock, sqlIncludes: string): string | undefined {
  const call = query.mock.calls.find((c) => (c[0] as string).includes(sqlIncludes));
  return call?.[0] as string | undefined;
}

describe('InventoryService.sellBulk', () => {
  it('mode "all_duplicates" scopes the selection query to the player only — no rarity/instanceIds condition, no extra params', async () => {
    const player = fakePlayer();
    const { manager, query, save } = fakeManager({
      player,
      resolvedIds: ['inst-a', 'inst-b'],
      rarityByInstanceId: { 'inst-a': 'common', 'inst-b': 'rare' },
    });
    const { ledgerService, recordBulkTransactions } = fakeLedgerService();
    const service = makeService(manager, ledgerService);

    const body: SellBulkRequestDto = { mode: 'all_duplicates' } as SellBulkRequestDto;
    const result = await service.sellBulk(player.id, body);

    const selectSql = sqlFor(query, 'ROW_NUMBER() OVER');
    expect(selectSql).not.toContain('c.rarity = ANY');
    expect(selectSql).not.toContain('card_id IN (SELECT card_id');
    expect(paramsFor(query, 'ROW_NUMBER() OVER')).toEqual([player.id]);

    expect(result.soldCount).toBe(2);
    expect(result.gained.coins).toBe(RARITY_META.common.sellValue + RARITY_META.rare.sellValue);
    expect(result.balance.coins).toBe(
      1000 + RARITY_META.common.sellValue + RARITY_META.rare.sellValue,
    );

    expect(paramsFor(query, 'UPDATE player_cards SET sold_at')).toEqual([['inst-a', 'inst-b']]);
    expect(recordBulkTransactions).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(player);
  });

  it('mode "by_rarity" adds a `c.rarity = ANY(...)` condition with the requested rarities as a bound param', async () => {
    const player = fakePlayer();
    const { manager, query } = fakeManager({
      player,
      resolvedIds: ['inst-a'],
      rarityByInstanceId: { 'inst-a': 'epic' },
    });
    const { ledgerService } = fakeLedgerService();
    const service = makeService(manager, ledgerService);

    const body: SellBulkRequestDto = {
      mode: 'by_rarity',
      rarities: ['epic', 'legendary'],
    } as SellBulkRequestDto;
    const result = await service.sellBulk(player.id, body);

    const selectSql = sqlFor(query, 'ROW_NUMBER() OVER');
    expect(selectSql).toContain('c.rarity = ANY($2)');
    expect(paramsFor(query, 'ROW_NUMBER() OVER')).toEqual([player.id, ['epic', 'legendary']]);

    expect(result.soldCount).toBe(1);
    expect(result.gained.coins).toBe(RARITY_META.epic.sellValue);
  });

  it('mode instanceIds scopes the query by owning-card, then intersects the resolved (copies-1, oldest-first) set with what was actually requested — a requested id that resolves to the last copy is silently dropped, never sold', async () => {
    const player = fakePlayer();
    // The DB resolves 'inst-a' and 'inst-b' as sellable (non-last-copy)
    // instances of cards touched by the request, plus 'inst-x' which belongs
    // to a card the caller never asked about but happens to share scope.
    // 'inst-c' was requested but is NOT in the resolved set (e.g. it's the
    // last copy of its card) and must never appear in the final selection.
    const { manager, query } = fakeManager({
      player,
      resolvedIds: ['inst-a', 'inst-b', 'inst-x'],
      rarityByInstanceId: { 'inst-a': 'common', 'inst-b': 'uncommon' },
    });
    const { ledgerService } = fakeLedgerService();
    const service = makeService(manager, ledgerService);

    const body: SellBulkRequestDto = {
      instanceIds: ['inst-a', 'inst-b', 'inst-c'],
    } as SellBulkRequestDto;
    const result = await service.sellBulk(player.id, body);

    const selectSql = sqlFor(query, 'ROW_NUMBER() OVER');
    expect(selectSql).toContain('card_id IN (SELECT card_id FROM player_cards');
    expect(paramsFor(query, 'ROW_NUMBER() OVER')).toEqual([
      player.id,
      ['inst-a', 'inst-b', 'inst-c'],
    ]);

    // 'inst-x' (resolved but not requested) and 'inst-c' (requested but not
    // resolved) are both excluded; only the intersection is sold.
    expect(paramsFor(query, 'UPDATE player_cards SET sold_at')).toEqual([['inst-a', 'inst-b']]);
    expect(result.soldCount).toBe(2);
    expect(result.gained.coins).toBe(RARITY_META.common.sellValue + RARITY_META.uncommon.sellValue);
  });

  it('a request resolving above SELL_BULK_MAX_INSTANCES is rejected with BULK_SELL_CAP_EXCEEDED and sells nothing — not silently truncated', async () => {
    const player = fakePlayer();
    const tooMany = Array.from({ length: SELL_BULK_MAX_INSTANCES + 1 }, (_, i) => `inst-${i}`);
    const { manager, query, save } = fakeManager({
      player,
      resolvedIds: tooMany,
      rarityByInstanceId: {},
    });
    const { ledgerService, recordBulkTransactions } = fakeLedgerService();
    const service = makeService(manager, ledgerService);

    const body: SellBulkRequestDto = { mode: 'all_duplicates' } as SellBulkRequestDto;

    await expect(service.sellBulk(player.id, body)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        code: 'BULK_SELL_CAP_EXCEEDED',
        requested: SELL_BULK_MAX_INSTANCES + 1,
        max: SELL_BULK_MAX_INSTANCES,
      }),
    });

    // Only the resolution query ran — no rarity lookup, no UPDATE, no
    // ledger write, no balance save. The cap check happens before any of
    // those, so exceeding it must never sell a partial/truncated set.
    expect(query).toHaveBeenCalledTimes(1);
    expect(recordBulkTransactions).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('an empty resolved set returns soldCount: 0 without touching the ledger or the balance (the no-op / replay path)', async () => {
    const player = fakePlayer({ balanceCoins: 1234, balanceKeys: 7 });
    const { manager, query, save } = fakeManager({
      player,
      resolvedIds: [],
      rarityByInstanceId: {},
    });
    const { ledgerService, recordBulkTransactions } = fakeLedgerService();
    const service = makeService(manager, ledgerService);

    const body: SellBulkRequestDto = { mode: 'all_duplicates' } as SellBulkRequestDto;
    const result = await service.sellBulk(player.id, body);

    expect(result).toEqual({
      soldCount: 0,
      gained: { coins: 0 },
      balance: { coins: 1234, keys: 7 },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(recordBulkTransactions).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
