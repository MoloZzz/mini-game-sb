import type { RarityWeights } from '@card-game/shared-types';
import { simulateEconomy, type SimulatedCase } from './economy-simulation';

const allCommon: RarityWeights = {
  common: 100,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
  mythic: 0,
};

const caseSeed: SimulatedCase = {
  slug: 'test-case',
  priceCoins: 100,
  priceKeys: null,
  weights: allCommon,
};

describe('simulateEconomy', () => {
  const config = {
    poolByRarity: { common: 2, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
    cases: [caseSeed],
    scenario: { name: 'new', ownedFraction: 0, balance: { coins: 200, keys: 0 } },
    runs: 25,
    maxOpens: 10,
    seed: 42,
  };

  it('is deterministic for a fixed seed', () => {
    expect(simulateEconomy({ ...config, salePolicy: 'manual' })).toEqual(
      simulateEconomy({ ...config, salePolicy: 'manual' }),
    );
  });

  it('distinguishes a coin soft lock from an affordable key case', () => {
    const result = simulateEconomy({
      ...config,
      cases: [caseSeed, { ...caseSeed, slug: 'key-case', priceCoins: null, priceKeys: 1 }],
      scenario: { ...config.scenario, balance: { coins: 0, keys: 1 } },
      salePolicy: 'manual',
      runs: 1,
    });

    expect(result.coinSoftLockRate).toBe(1);
    expect(result.hardLockRate).toBe(1);
    expect(result.worstRun.opens).toBe(1);
  });

  it('makes automatic duplicate sale an explicit optimistic assumption', () => {
    const manual = simulateEconomy({ ...config, salePolicy: 'manual' });
    const autoSell = simulateEconomy({ ...config, salePolicy: 'auto-sell' });

    expect(autoSell.averageDuplicateCoins).toBeGreaterThan(manual.averageDuplicateCoins);
  });
});
