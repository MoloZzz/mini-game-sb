import { MILESTONE_LADDER } from '@card-game/shared-types';
import type { DataSource, EntityManager } from 'typeorm';
import type { PlayerEntity } from '../entities';
import { PlayerMilestoneEntity } from '../entities';
import type { LedgerService } from '../ledger/ledger.service';
import { MilestoneService } from './milestone.service';

/**
 * Mirrors the mocking style of `collection.service.spec.ts` /
 * `pool.service.spec.ts`: a fake `.query()` that returns canned rows,
 * plus fakes for the entity-manager methods `checkAndAward` uses
 * (`create`/`save`) and for `LedgerService.recordTransaction`.
 */
function fakeManager(options: {
  uniqueCardsCount: number;
  awardedKeys?: string[];
}): { manager: EntityManager; save: jest.Mock; create: jest.Mock } {
  const awardedKeys = options.awardedKeys ?? [];
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('COUNT(DISTINCT pc.card_id)')) {
      return Promise.resolve([{ count: options.uniqueCardsCount }]);
    }
    if (sql.includes('SELECT milestone_key FROM player_milestones')) {
      return Promise.resolve(awardedKeys.map((key) => ({ milestone_key: key })));
    }
    throw new Error(`fakeManager: unexpected query: ${sql}`);
  });

  const create = jest.fn().mockImplementation((_entity, input) => input);
  const save = jest.fn().mockImplementation((row) => Promise.resolve({ id: 'row-id', ...row }));

  const manager = { query, create, save } as unknown as EntityManager;
  return { manager, save, create };
}

function fakeLedgerService(): { ledgerService: LedgerService; recordTransaction: jest.Mock } {
  let counter = 0;
  const recordTransaction = jest.fn().mockImplementation(() => {
    counter += 1;
    return Promise.resolve({ id: `tx-${counter}` });
  });
  return { ledgerService: { recordTransaction } as unknown as LedgerService, recordTransaction };
}

function fakePlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id: 'player-1',
    balanceCoins: 1000,
    balanceKeys: 5,
    ...overrides,
  } as PlayerEntity;
}

describe('MilestoneService.checkAndAward', () => {
  it('crossing several thresholds at once awards ALL of them in one pass', async () => {
    // 60 unique cards clears unique_10, unique_25 and unique_50 in one call.
    const { manager, save } = fakeManager({ uniqueCardsCount: 60 });
    const { ledgerService, recordTransaction } = fakeLedgerService();
    const service = new MilestoneService({} as DataSource, ledgerService);
    const player = fakePlayer();

    await service.checkAndAward(manager, player);

    const awardedKeys = save.mock.calls.map(
      (call) => (call[0] as { milestoneKey: string }).milestoneKey,
    );
    expect(awardedKeys).toEqual(['unique_10', 'unique_25', 'unique_50']);
    expect(recordTransaction).toHaveBeenCalledTimes(3);

    const expectedCoins = 1000 + 200 + 300 + 500;
    const expectedKeys = 5 + 0 + 1 + 1;
    expect(player.balanceCoins).toBe(expectedCoins);
    expect(player.balanceKeys).toBe(expectedKeys);

    // Every ledger write goes through the `milestone` transaction type.
    for (const call of recordTransaction.mock.calls) {
      expect((call[1] as { type: string }).type).toBe('milestone');
    }
  });

  it('an already-awarded key is never awarded twice', async () => {
    // 60 unique cards clears unique_10/25/50, but unique_10 is already on record.
    const { manager, save } = fakeManager({
      uniqueCardsCount: 60,
      awardedKeys: ['unique_10'],
    });
    const { ledgerService, recordTransaction } = fakeLedgerService();
    const service = new MilestoneService({} as DataSource, ledgerService);
    const player = fakePlayer();

    await service.checkAndAward(manager, player);

    const awardedKeys = save.mock.calls.map(
      (call) => (call[0] as { milestoneKey: string }).milestoneKey,
    );
    expect(awardedKeys).toEqual(['unique_25', 'unique_50']);
    expect(recordTransaction).toHaveBeenCalledTimes(2);
    expect(player.balanceCoins).toBe(1000 + 300 + 500);
  });

  it('awards nothing when no tier is reached yet', async () => {
    const { manager, save } = fakeManager({ uniqueCardsCount: 3 });
    const { ledgerService, recordTransaction } = fakeLedgerService();
    const service = new MilestoneService({} as DataSource, ledgerService);
    const player = fakePlayer();

    await service.checkAndAward(manager, player);

    expect(save).not.toHaveBeenCalled();
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(player.balanceCoins).toBe(1000);
    expect(player.balanceKeys).toBe(5);
  });

  it('awards nothing when every reached tier is already on record (idempotent re-run)', async () => {
    const reachedKeys = MILESTONE_LADDER.filter((t) => t.uniqueCards <= 60).map((t) => t.key);
    const { manager, save } = fakeManager({ uniqueCardsCount: 60, awardedKeys: reachedKeys });
    const { ledgerService, recordTransaction } = fakeLedgerService();
    const service = new MilestoneService({} as DataSource, ledgerService);
    const player = fakePlayer();

    await service.checkAndAward(manager, player);

    expect(save).not.toHaveBeenCalled();
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(player.balanceCoins).toBe(1000);
  });

  it('writes the milestone transaction id onto the player_milestones row', async () => {
    const { manager } = fakeManager({ uniqueCardsCount: 10 });
    const { ledgerService } = fakeLedgerService();
    const service = new MilestoneService({} as DataSource, ledgerService);
    const player = fakePlayer();

    await service.checkAndAward(manager, player);

    expect(manager.create).toHaveBeenCalledWith(
      PlayerMilestoneEntity,
      expect.objectContaining({ milestoneKey: 'unique_10', transactionId: 'tx-1' }),
    );
  });
});

describe('MilestoneService.getStatus', () => {
  it('marks earned tiers with their awardedAt timestamp and unearned ones as null, without awarding anything', async () => {
    const awardedAt = new Date('2026-01-01T00:00:00.000Z');
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT pc.card_id)')) {
        return Promise.resolve([{ count: 12 }]);
      }
      if (sql.includes('SELECT milestone_key, awarded_at')) {
        return Promise.resolve([{ milestone_key: 'unique_10', awarded_at: awardedAt }]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const dataSource = { query } as unknown as DataSource;
    const { ledgerService, recordTransaction } = fakeLedgerService();
    const service = new MilestoneService(dataSource, ledgerService);

    const result = await service.getStatus('player-1');

    expect(result.ownedUniqueCards).toBe(12);
    expect(result.tiers).toHaveLength(MILESTONE_LADDER.length);

    const tier10 = result.tiers.find((t) => t.key === 'unique_10');
    expect(tier10?.earned).toBe(true);
    expect(tier10?.awardedAt).toBe(awardedAt.toISOString());

    const tier25 = result.tiers.find((t) => t.key === 'unique_25');
    expect(tier25?.earned).toBe(false);
    expect(tier25?.awardedAt).toBeNull();

    // GET awards nothing — no ledger write, ever.
    expect(recordTransaction).not.toHaveBeenCalled();
  });
});
