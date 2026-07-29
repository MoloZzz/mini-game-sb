import { CASE_WEIGHTS, RARITIES, type Rarity, type RarityWeights } from '@card-game/shared-types';
import { rollRarity } from './roll-rarity';
import { createCryptoRng, createSeededRng } from './rng';

const N = 200_000;
const starterWeights: RarityWeights = CASE_WEIGHTS['starter-chest']!;

function tally(results: readonly Rarity[]): Record<Rarity, number> {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const r of results) counts[r]++;
  return counts;
}

describe('rollRarity probability distribution at N=200000', () => {
  // Run 1: the spec's literal assertion (card-game-data/05), pinned to a
  // fixed seed so it is reproducible. A cryptographic RNG would flake here
  // roughly one run in four -- see Run 2 for the statistically sound check
  // against the real RNG. Seed 12345 was the first one tried and it passed.
  it('createSeededRng(12345): matches the vault doc literal tolerances', () => {
    const SEED = 12345;
    const rng = createSeededRng(SEED);
    const results: Rarity[] = [];
    for (let i = 0; i < N; i++) {
      const result = rollRarity({
        weights: starterWeights,
        pityCounter: 0,
        availableRarities: RARITIES,
        rng,
      });
      expect(result).not.toBeNull();
      results.push(result as Rarity);
    }
    const counts = tally(results);

    expect(counts.common / N).toBeCloseTo(0.6, 2);
    expect(counts.epic / N).toBeCloseTo(0.045, 3);
    expect(counts.mythic / N).toBeCloseTo(0.002, 3);
  });

  // Run 2: the real createCryptoRng(), validated with statistically sound
  // tolerances (4.5 standard errors) instead of the vault's exact literals,
  // which are too tight for a genuinely random source at this N.
  it('createCryptoRng(): every rarity is within 4.5 standard errors of its configured probability', () => {
    const rng = createCryptoRng();
    const results: Rarity[] = [];
    for (let i = 0; i < N; i++) {
      const result = rollRarity({
        weights: starterWeights,
        pityCounter: 0,
        availableRarities: RARITIES,
        rng,
      });
      expect(result).not.toBeNull();
      results.push(result as Rarity);
    }
    const counts = tally(results);

    const totalCounted = RARITIES.reduce((acc, r) => acc + counts[r], 0);
    expect(totalCounted).toBe(N);

    const table: Array<{ rarity: Rarity; p: number; observed: number; se: number; z: number }> = [];

    for (const rarity of RARITIES) {
      const p = starterWeights[rarity] / 100;
      const observed = counts[rarity] / N;
      const se = Math.sqrt((p * (1 - p)) / N);
      const z = se > 0 ? Math.abs(observed - p) / se : 0;
      table.push({ rarity, p, observed, se, z });
    }

     
    console.log(
      '\nrarity     | expected p | observed p |  z-score\n' +
        '-----------|------------|------------|---------\n' +
        table
          .map(
            (row) =>
              `${row.rarity.padEnd(10)} | ${row.p.toFixed(5).padStart(10)} | ` +
              `${row.observed.toFixed(5).padStart(10)} | ${row.z.toFixed(3).padStart(7)}`,
          )
          .join('\n'),
    );

    for (const row of table) {
      expect(row.z).toBeLessThan(4.5);
    }
  });
});
