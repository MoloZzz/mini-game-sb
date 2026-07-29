import type { DataSource } from 'typeorm';
import { CollectionService } from './collection.service';
import { PoolService } from './pool.service';

describe('CollectionService.getProgress', () => {
  it('combines owned (from the player_cards query) with total (from PoolService), defaulting missing rarities to 0', async () => {
    const query = jest.fn().mockResolvedValue([{ rarity: 'common', count: 2 }]);
    const dataSource = { query } as unknown as DataSource;

    const poolService = {
      getApprovedCountsByRarity: jest.fn().mockResolvedValue({
        common: 40,
        uncommon: 30,
        rare: 20,
        epic: 12,
        legendary: 6,
        mythic: 2,
      }),
    } as unknown as PoolService;

    const service = new CollectionService(dataSource, poolService);

    const progress = await service.getProgress('player-1');

    expect(progress.byRarity.common).toEqual({ owned: 2, total: 40 });
    // A rarity the player owns zero of must still be 0, not undefined.
    expect(progress.byRarity.mythic).toEqual({ owned: 0, total: 2 });
    expect(progress.owned).toBe(2);
    expect(progress.total).toBe(40 + 30 + 20 + 12 + 6 + 2);
  });

  it('passes the player id into the owned-count query', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const dataSource = { query } as unknown as DataSource;
    const poolService = {
      getApprovedCountsByRarity: jest.fn().mockResolvedValue({
        common: 0,
        uncommon: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
        mythic: 0,
      }),
    } as unknown as PoolService;

    const service = new CollectionService(dataSource, poolService);
    await service.getProgress('player-42');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['player-42']);
  });
});
