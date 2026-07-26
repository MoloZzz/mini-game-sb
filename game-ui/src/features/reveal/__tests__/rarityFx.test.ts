import { describe, expect, it } from 'vitest';
import { RARITIES } from '@card-game/shared-types';

import { RARITY_FX } from '@/lib/rarityFx';

describe('RARITY_FX', () => {
  it('has an entry for every Rarity key', () => {
    // Built by iterating RARITIES so a new rarity added to shared-types fails
    // this test until the FX table is updated for it.
    for (const rarity of RARITIES) {
      expect(RARITY_FX[rarity]).toBeDefined();
    }
  });

  it('particleCount is monotonically non-decreasing across RARITIES', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const prev = RARITY_FX[RARITIES[i - 1]].particleCount;
      const curr = RARITY_FX[RARITIES[i]].particleCount;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('shakeIntensityPx is monotonically non-decreasing across RARITIES', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const prev = RARITY_FX[RARITIES[i - 1]].shakeIntensityPx;
      const curr = RARITY_FX[RARITIES[i]].shakeIntensityPx;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('common, uncommon and rare have zero particles', () => {
    expect(RARITY_FX.common.particleCount).toBe(0);
    expect(RARITY_FX.uncommon.particleCount).toBe(0);
    expect(RARITY_FX.rare.particleCount).toBe(0);
  });

  it('the epic->legendary particle step is strictly larger than the common->epic step', () => {
    // This is the literal "escalation must be uneven" requirement from the
    // roulette spec: common -> uncommon reads as almost nothing, epic ->
    // legendary reads as an event. Encoded directly as a step comparison
    // rather than a ratio, so it can't be satisfied by a degenerate table.
    const commonToEpicStep = RARITY_FX.epic.particleCount - RARITY_FX.common.particleCount;
    const epicToLegendaryStep = RARITY_FX.legendary.particleCount - RARITY_FX.epic.particleCount;

    expect(epicToLegendaryStep).toBeGreaterThan(commonToEpicStep);
  });
});
