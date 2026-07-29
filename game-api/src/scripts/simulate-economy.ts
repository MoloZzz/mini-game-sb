import { RARITIES, type Rarity } from '@card-game/shared-types';
import { AppDataSource } from '../database/data-source';
import { CardEntity, CaseEntity } from '../entities';
import {
  POST_DAILY_BALANCE,
  simulateEconomy,
  type DuplicateSalePolicy,
  type EconomyScenario,
  type SimulatedCase,
} from '../economy-simulation/economy-simulation';

const DEFAULT_RUNS = 10_000;
const DEFAULT_MAX_OPENS = 250;

function numberArgument(name: string, fallback: number): number {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function toPool(rows: Array<{ rarity: Rarity; count: string }>): Record<Rarity, number> {
  const pool = {} as Record<Rarity, number>;
  for (const rarity of RARITIES) pool[rarity] = 0;
  for (const row of rows) pool[row.rarity] = Number(row.count);
  return pool;
}

function toCase(caseEntity: CaseEntity): SimulatedCase {
  return {
    slug: caseEntity.slug,
    priceCoins: caseEntity.priceCoins,
    priceKeys: caseEntity.priceKeys,
    weights: caseEntity.rarityWeights,
  };
}

async function main(): Promise<void> {
  const runs = numberArgument('runs', DEFAULT_RUNS);
  const maxOpens = numberArgument('max-opens', DEFAULT_MAX_OPENS);
  await AppDataSource.initialize();
  try {
    const cards = await AppDataSource.getRepository(CardEntity)
      .createQueryBuilder('card')
      .select('card.rarity', 'rarity')
      .addSelect('COUNT(*)', 'count')
      .where("card.status = 'approved'")
      .groupBy('card.rarity')
      .getRawMany<{ rarity: Rarity; count: string }>();
    const cases = (await AppDataSource.getRepository(CaseEntity).find({ where: { isActive: true } })).map(toCase);
    const poolByRarity = toPool(cards);
    const scenarios: EconomyScenario[] = [
      { name: 'new_after_daily', ownedFraction: 0, balance: POST_DAILY_BALANCE },
      { name: 'mid_after_daily', ownedFraction: 0.5, balance: { coins: 800, keys: 2 } },
      { name: 'near_complete_after_daily', ownedFraction: 0.9, balance: { coins: 800, keys: 2 } },
    ];
    const results = scenarios.flatMap((scenario) =>
      (['manual', 'auto-sell'] as const satisfies readonly DuplicateSalePolicy[]).map((salePolicy) =>
        simulateEconomy({ poolByRarity, cases, scenario, salePolicy, runs, maxOpens, seed: 20260729 }),
      ),
    );

    console.log(JSON.stringify({ assumptions: { runs, maxOpens, poolByRarity, cases: cases.map(({ slug, priceCoins, priceKeys }) => ({ slug, priceCoins, priceKeys })), choicePolicy: 'cheapest affordable coin case, otherwise cheapest affordable key case', daily: 'already claimed at session start; no waiting income', manualSale: 'no duplicate coin income', autoSell: 'optimistic immediate sale of every duplicate while retaining one copy' }, results }, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
