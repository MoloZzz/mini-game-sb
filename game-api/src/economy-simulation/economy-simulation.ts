import {
  DAILY_BONUS,
  INITIAL_GRANT,
  MILESTONE_LADDER,
  PITY_RESET_RARITY,
  PITY_THRESHOLD,
  RARITIES,
  RARITY_META,
  RARITY_ORDER,
  type Balance,
  type Rarity,
  type RarityWeights,
} from '@card-game/shared-types';

export interface SimulatedCase {
  slug: string;
  priceCoins: number | null;
  priceKeys: number | null;
  weights: RarityWeights;
}

export type DuplicateSalePolicy = 'manual' | 'auto-sell';

export interface EconomyScenario {
  name: string;
  /** Fraction of each rarity's live approved pool that is already owned. */
  ownedFraction: number;
  /** The player has already claimed today's daily bonus: no waiting source is modelled. */
  balance: Balance;
}

export interface SimulationConfig {
  poolByRarity: Record<Rarity, number>;
  cases: readonly SimulatedCase[];
  scenario: EconomyScenario;
  salePolicy: DuplicateSalePolicy;
  runs: number;
  maxOpens: number;
  seed: number;
}

export interface SimulationResult {
  scenario: string;
  salePolicy: DuplicateSalePolicy;
  runs: number;
  averageOpens: number;
  p10Opens: number;
  p90Opens: number;
  /** A coin-only soft lock: less than the cheapest coin case. */
  coinSoftLockRate: number;
  /** No active coin or key case can be opened. */
  hardLockRate: number;
  averageDuplicateCoins: number;
  averageUniqueCards: number;
  /** The shortest observed run makes the unlucky tail visible. */
  worstRun: { opens: number; finalBalance: Balance; uniqueCards: number };
}

class SeededRng {
  constructor(private state: number) {}

  next(): number {
    // Mulberry32: deterministic, cheap and sufficient for an offline what-if
    // model. It is deliberately NOT used by the live server RNG.
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index]!;
}

function affordableCase(cases: readonly SimulatedCase[], balance: Balance): SimulatedCase | null {
  const coinCase = cases
    .filter((caseSeed) => caseSeed.priceCoins !== null && balance.coins >= caseSeed.priceCoins)
    .sort((a, b) => a.priceCoins! - b.priceCoins!)[0];
  if (coinCase) return coinCase;

  return (
    cases
      .filter((caseSeed) => caseSeed.priceKeys !== null && balance.keys >= caseSeed.priceKeys)
      .sort((a, b) => a.priceKeys! - b.priceKeys!)[0] ?? null
  );
}

function rollRarity(
  weights: RarityWeights,
  pityCounter: number,
  poolByRarity: Record<Rarity, number>,
  rng: SeededRng,
): Rarity {
  const pityActive = pityCounter >= PITY_THRESHOLD;
  const candidates = RARITIES.filter(
    (rarity) =>
      poolByRarity[rarity] > 0 &&
      weights[rarity] > 0 &&
      (!pityActive || RARITY_ORDER[rarity] >= RARITY_ORDER[PITY_RESET_RARITY]),
  );
  const usable = candidates.length > 0 ? candidates : RARITIES.filter((rarity) => poolByRarity[rarity] > 0 && weights[rarity] > 0);
  const total = usable.reduce((sum, rarity) => sum + weights[rarity], 0);
  let cursor = rng.next() * total;
  for (const rarity of usable) {
    cursor -= weights[rarity];
    if (cursor < 0) return rarity;
  }
  return usable[usable.length - 1]!;
}

function claimedMilestones(uniqueCards: number): Set<string> {
  return new Set(MILESTONE_LADDER.filter((tier) => tier.uniqueCards <= uniqueCards).map((tier) => tier.key));
}

/**
 * Models a continuous session after today's daily bonus was already claimed.
 * It intentionally makes no database writes and is not a forecast of player
 * behaviour: choice is always the cheapest affordable case and auto-sale is
 * an explicit optimistic policy, not current UI behaviour.
 */
export function simulateEconomy(config: SimulationConfig): SimulationResult {
  const cheapestCoinCost = Math.min(
    ...config.cases.flatMap((caseSeed) => (caseSeed.priceCoins === null ? [] : [caseSeed.priceCoins])),
  );
  if (!Number.isFinite(cheapestCoinCost)) throw new Error('At least one active coin case is required');
  if (config.runs < 1 || config.maxOpens < 1) throw new Error('runs and maxOpens must be positive');

  const opens: number[] = [];
  let coinSoftLocks = 0;
  let hardLocks = 0;
  let duplicateCoinsTotal = 0;
  let uniqueCardsTotal = 0;
  let worstRun: SimulationResult['worstRun'] | null = null;

  for (let run = 0; run < config.runs; run++) {
    const rng = new SeededRng(config.seed + run);
    const ownedByRarity = {} as Record<Rarity, number>;
    for (const rarity of RARITIES) {
      ownedByRarity[rarity] = Math.floor(config.poolByRarity[rarity] * config.scenario.ownedFraction);
    }
    let uniqueCards = RARITIES.reduce((sum, rarity) => sum + ownedByRarity[rarity], 0);
    const milestones = claimedMilestones(uniqueCards);
    const balance = { ...config.scenario.balance };
    let pityCounter = 0;
    let duplicateCoins = 0;
    let opened = 0;

    while (opened < config.maxOpens) {
      const selectedCase = affordableCase(config.cases, balance);
      if (!selectedCase) break;
      if (selectedCase.priceCoins !== null) balance.coins -= selectedCase.priceCoins;
      if (selectedCase.priceKeys !== null) balance.keys -= selectedCase.priceKeys;

      const rarity = rollRarity(selectedCase.weights, pityCounter, config.poolByRarity, rng);
      pityCounter = RARITY_ORDER[rarity] >= RARITY_ORDER[PITY_RESET_RARITY] ? 0 : pityCounter + 1;
      const isDuplicate = rng.next() < ownedByRarity[rarity] / config.poolByRarity[rarity];
      if (isDuplicate) {
        if (config.salePolicy === 'auto-sell') {
          const value = RARITY_META[rarity].sellValue;
          balance.coins += value;
          duplicateCoins += value;
        }
      } else {
        ownedByRarity[rarity] += 1;
        uniqueCards += 1;
        for (const tier of MILESTONE_LADDER) {
          if (uniqueCards >= tier.uniqueCards && !milestones.has(tier.key)) {
            milestones.add(tier.key);
            balance.coins += tier.reward.coins;
            balance.keys += tier.reward.keys;
          }
        }
      }
      opened += 1;
    }

    const isCoinSoftLocked = balance.coins < cheapestCoinCost;
    if (isCoinSoftLocked) coinSoftLocks += 1;
    if (!affordableCase(config.cases, balance)) hardLocks += 1;
    opens.push(opened);
    duplicateCoinsTotal += duplicateCoins;
    uniqueCardsTotal += uniqueCards;
    const current = { opens: opened, finalBalance: balance, uniqueCards };
    if (!worstRun || current.opens < worstRun.opens) worstRun = current;
  }

  opens.sort((a, b) => a - b);
  return {
    scenario: config.scenario.name,
    salePolicy: config.salePolicy,
    runs: config.runs,
    averageOpens: opens.reduce((sum, value) => sum + value, 0) / opens.length,
    p10Opens: percentile(opens, 0.1),
    p90Opens: percentile(opens, 0.9),
    coinSoftLockRate: coinSoftLocks / config.runs,
    hardLockRate: hardLocks / config.runs,
    averageDuplicateCoins: duplicateCoinsTotal / config.runs,
    averageUniqueCards: uniqueCardsTotal / config.runs,
    worstRun: worstRun!,
  };
}

export const POST_DAILY_BALANCE: Balance = {
  coins: INITIAL_GRANT.coins + DAILY_BONUS.coins,
  keys: INITIAL_GRANT.keys + DAILY_BONUS.keys,
};
