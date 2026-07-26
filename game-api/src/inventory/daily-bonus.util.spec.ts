import { DAILY_BONUS_COOLDOWN_MS } from '@card-game/shared-types';
import { isDailyBonusReady, nextAvailableAt } from './daily-bonus.util';

describe('isDailyBonusReady', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('is ready when never claimed (null)', () => {
    expect(isDailyBonusReady(null, now)).toBe(true);
  });

  it('is NOT ready when claimed 23h59m ago', () => {
    const lastClaimAt = new Date(now.getTime() - (DAILY_BONUS_COOLDOWN_MS - 60_000));
    expect(isDailyBonusReady(lastClaimAt, now)).toBe(false);
  });

  it('is ready when claimed exactly the cooldown ago', () => {
    const lastClaimAt = new Date(now.getTime() - DAILY_BONUS_COOLDOWN_MS);
    expect(isDailyBonusReady(lastClaimAt, now)).toBe(true);
  });

  it('is ready when claimed 25h ago', () => {
    const lastClaimAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isDailyBonusReady(lastClaimAt, now)).toBe(true);
  });
});

describe('nextAvailableAt', () => {
  it('adds the cooldown to the last claim time', () => {
    const lastClaimAt = new Date('2026-07-25T12:00:00.000Z');
    const expected = new Date(lastClaimAt.getTime() + DAILY_BONUS_COOLDOWN_MS);
    expect(nextAvailableAt(lastClaimAt).getTime()).toBe(expected.getTime());
  });
});
