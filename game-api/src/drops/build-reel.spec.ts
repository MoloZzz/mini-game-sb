import {
  RARITIES,
  HIGH_RARITY_BAND,
  FORBIDDEN_HIGH_RARITY_INDICES,
  REEL_LENGTH,
  WINNING_INDEX,
  type Rarity,
  type ReelTileDto,
} from '@card-game/shared-types';
import { buildReel, type ReelCard, type FillerPool } from './build-reel';
import { createCryptoRng } from './rng';

jest.setTimeout(60_000);

function makeCards(rarity: Rarity, count: number): ReelCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${rarity}-${i}`,
    name: `${rarity} card ${i}`,
    rarity,
    thumbUrl: `https://static.example/thumbs/${rarity}-${i}.png`,
  }));
}

function buildFullPool(): FillerPool {
  const pool: Partial<Record<Rarity, ReelCard[]>> = {};
  for (const rarity of RARITIES) {
    pool[rarity] = makeCards(rarity, 12);
  }
  return pool;
}

function findSourceCard(pool: FillerPool, winner: ReelCard, id: string): ReelCard {
  if (id === winner.id) return winner;
  for (const rarity of RARITIES) {
    const found = (pool[rarity] ?? []).find((c) => c.id === id);
    if (found) return found;
  }
  throw new Error(`test setup error: card id ${id} not found in pool or winner`);
}

function assertReelInvariants(reel: ReelTileDto[], winner: ReelCard, pool: FillerPool): void {
  // 1. length
  expect(reel.length).toBe(REEL_LENGTH);

  // 2. winner at WINNING_INDEX
  expect(reel[WINNING_INDEX]!.id).toBe(winner.id);

  // 3. no adjacent duplicate ids anywhere
  for (let i = 0; i < reel.length - 1; i++) {
    expect(reel[i]!.id).not.toBe(reel[i + 1]!.id);
  }

  // 4. no tile at 53/54/56/57 is legendary or mythic
  for (const idx of FORBIDDEN_HIGH_RARITY_INDICES) {
    expect(['legendary', 'mythic']).not.toContain(reel[idx]!.rarity);
  }

  // 5 & 6. every legendary/mythic filler (excluding the winner) is inside the
  // band, and there are at least 2 of them.
  let highInBandCount = 0;
  reel.forEach((tile, idx) => {
    if (tile.rarity !== 'legendary' && tile.rarity !== 'mythic') return;
    if (idx === WINNING_INDEX) return; // winner is exempt from the filler count/band rule
    expect(idx).toBeGreaterThanOrEqual(HIGH_RARITY_BAND[0]);
    expect(idx).toBeLessThanOrEqual(HIGH_RARITY_BAND[1]);
    highInBandCount++;
  });
  expect(highInBandCount).toBeGreaterThanOrEqual(2);

  // 7. every tile's rarity/thumbUrl matches its source card unchanged
  for (const tile of reel) {
    const source = findSourceCard(pool, winner, tile.id);
    expect(tile.rarity).toBe(source.rarity);
    expect(tile.thumbUrl).toBe(source.thumbUrl);
  }
}

describe('buildReel', () => {
  const pool = buildFullPool();
  const rng = createCryptoRng();

  it('satisfies every invariant over 1000 reels for a common winner', () => {
    const winner: ReelCard = {
      id: 'winner-common',
      name: 'Winner Common',
      rarity: 'common',
      thumbUrl: 'https://static.example/thumbs/winner-common.png',
    };
    for (let i = 0; i < 1000; i++) {
      const reel = buildReel({ winner, pool, rng });
      assertReelInvariants(reel, winner, pool);
    }
  });

  it('satisfies every invariant over 1000 reels for a mythic winner', () => {
    const winner: ReelCard = {
      id: 'winner-mythic',
      name: 'Winner Mythic',
      rarity: 'mythic',
      thumbUrl: 'https://static.example/thumbs/winner-mythic.png',
    };
    for (let i = 0; i < 1000; i++) {
      const reel = buildReel({ winner, pool, rng });
      assertReelInvariants(reel, winner, pool);
    }
  });

  it('satisfies every invariant across varied winner rarities (near-miss holds regardless of win)', () => {
    for (const rarity of RARITIES) {
      const winner: ReelCard = {
        id: `winner-${rarity}`,
        name: `Winner ${rarity}`,
        rarity,
        thumbUrl: `https://static.example/thumbs/winner-${rarity}.png`,
      };
      for (let i = 0; i < 50; i++) {
        const reel = buildReel({ winner, pool, rng });
        assertReelInvariants(reel, winner, pool);
      }
    }
  });

  it('does not throw for a pool with no legendary/mythic cards, and still produces a valid 60-tile reel', () => {
    const limitedPool: FillerPool = {
      common: makeCards('common', 12),
      uncommon: makeCards('uncommon', 12),
      rare: makeCards('rare', 12),
      epic: makeCards('epic', 12),
      // deliberately no legendary / mythic entries
    };
    const winner: ReelCard = {
      id: 'winner-no-gold',
      name: 'Winner',
      rarity: 'epic',
      thumbUrl: 'https://static.example/thumbs/winner-no-gold.png',
    };

    for (let i = 0; i < 50; i++) {
      const reel = buildReel({ winner, pool: limitedPool, rng });
      expect(reel.length).toBe(REEL_LENGTH);
      expect(reel[WINNING_INDEX]!.id).toBe(winner.id);
      for (let j = 0; j < reel.length - 1; j++) {
        expect(reel[j]!.id).not.toBe(reel[j + 1]!.id);
      }
      // Documented, intentional relaxation: the pool literally has no
      // legendary/mythic cards, so the >= 2 high-rarity-filler minimum is
      // unsatisfiable. buildReel must satisfy as many as the pool allows
      // (zero, here) and must not throw.
      for (const tile of reel) {
        expect(['legendary', 'mythic']).not.toContain(tile.rarity);
      }
    }
  });

  it('produces a valid reel with no adjacent duplicates when the pool has exactly 2 distinct cards', () => {
    const twoCardPool: FillerPool = {
      common: [
        { id: 'a', name: 'A', rarity: 'common', thumbUrl: 'https://static.example/thumbs/a.png' },
        { id: 'b', name: 'B', rarity: 'common', thumbUrl: 'https://static.example/thumbs/b.png' },
      ],
    };
    const winner: ReelCard = {
      id: 'winner-two-card',
      name: 'Winner',
      rarity: 'common',
      thumbUrl: 'https://static.example/thumbs/winner-two-card.png',
    };

    for (let i = 0; i < 50; i++) {
      const reel = buildReel({ winner, pool: twoCardPool, rng });
      expect(reel.length).toBe(REEL_LENGTH);
      expect(reel[WINNING_INDEX]!.id).toBe(winner.id);
      for (let j = 0; j < reel.length - 1; j++) {
        expect(reel[j]!.id).not.toBe(reel[j + 1]!.id);
      }
    }
  });

  it('throws the documented error when the pool has fewer than 2 distinct card ids', () => {
    const oneCardPool: FillerPool = {
      common: [
        { id: 'only', name: 'Only', rarity: 'common', thumbUrl: 'https://static.example/thumbs/only.png' },
      ],
    };
    const winner: ReelCard = {
      id: 'winner-solo',
      name: 'Winner',
      rarity: 'common',
      thumbUrl: 'https://static.example/thumbs/winner-solo.png',
    };

    expect(() => buildReel({ winner, pool: oneCardPool, rng })).toThrow(
      'buildReel needs at least 2 distinct cards in the pool',
    );
  });
});
