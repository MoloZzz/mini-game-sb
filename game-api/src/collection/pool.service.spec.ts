import type { DataSource } from 'typeorm';
import { PoolService } from './pool.service';

function fakeDataSource(rows: Array<{ rarity: string; count: number }>): {
  dataSource: DataSource;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue(rows);
  return { dataSource: { query } as unknown as DataSource, query };
}

describe('PoolService.getApprovedCountsByRarity', () => {
  it('every rarity defaults to 0 — a rarity with zero approved cards is never undefined', async () => {
    const { dataSource } = fakeDataSource([{ rarity: 'mythic', count: 2 }]);
    const service = new PoolService(dataSource);

    const counts = await service.getApprovedCountsByRarity();

    expect(counts).toEqual({
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 2,
    });
  });

  it('only counts what the GROUP BY query returns — draft/rejected rows are the query\'s job to exclude, not this method\'s', async () => {
    // The query itself filters `status = 'approved'`; this test asserts the
    // service trusts and passes through exactly what comes back, without
    // re-summing or otherwise inflating it.
    const { dataSource, query } = fakeDataSource([
      { rarity: 'common', count: 40 },
      { rarity: 'rare', count: 5 },
    ]);
    const service = new PoolService(dataSource);

    const counts = await service.getApprovedCountsByRarity();

    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0]?.[0] as string)).toContain("status = 'approved'");
    expect(counts.common).toBe(40);
    expect(counts.rare).toBe(5);
    expect(counts.uncommon).toBe(0);
  });

  it('memoizes: a second call inside the TTL does not re-query', async () => {
    const { dataSource, query } = fakeDataSource([{ rarity: 'common', count: 10 }]);
    const service = new PoolService(dataSource);

    await service.getApprovedCountsByRarity();
    const second = await service.getApprovedCountsByRarity();

    expect(query).toHaveBeenCalledTimes(1);
    expect(second.common).toBe(10);
  });

  it('refetches after invalidate()', async () => {
    const { dataSource, query } = fakeDataSource([{ rarity: 'common', count: 10 }]);
    const service = new PoolService(dataSource);

    await service.getApprovedCountsByRarity();
    service.invalidate();
    query.mockResolvedValueOnce([{ rarity: 'common', count: 11 }]);
    const afterInvalidate = await service.getApprovedCountsByRarity();

    expect(query).toHaveBeenCalledTimes(2);
    expect(afterInvalidate.common).toBe(11);
  });

  it('refetches once the TTL has elapsed, even without an explicit invalidate()', async () => {
    const { dataSource, query } = fakeDataSource([{ rarity: 'common', count: 10 }]);
    const service = new PoolService(dataSource);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000_000);
    await service.getApprovedCountsByRarity();

    // Still inside the 60s TTL — must serve the memo.
    nowSpy.mockReturnValue(1_000_000 + 59_000);
    await service.getApprovedCountsByRarity();
    expect(query).toHaveBeenCalledTimes(1);

    // Past the 60s TTL — must re-query.
    nowSpy.mockReturnValue(1_000_000 + 60_001);
    await service.getApprovedCountsByRarity();
    expect(query).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});
