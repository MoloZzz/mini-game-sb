import { DAILY_BONUS_COOLDOWN_MS } from '@card-game/shared-types';

/**
 * `POST /me/daily-bonus` is a read-time check, no cron (vault 03/04): ready
 * when never claimed, or when the cooldown since the last claim has already
 * elapsed. `>=` (not `>`) so a claim made exactly `DAILY_BONUS_COOLDOWN_MS`
 * ago is ready again this instant.
 */
export function isDailyBonusReady(lastDailyClaimAt: Date | null, now: Date): boolean {
  if (!lastDailyClaimAt) return true;
  return now.getTime() - lastDailyClaimAt.getTime() >= DAILY_BONUS_COOLDOWN_MS;
}

/** When the bonus next becomes claimable, counted from the last claim. */
export function nextAvailableAt(lastDailyClaimAt: Date): Date {
  return new Date(lastDailyClaimAt.getTime() + DAILY_BONUS_COOLDOWN_MS);
}
