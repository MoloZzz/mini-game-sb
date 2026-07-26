import type { Balance, CaseDto } from '@card-game/shared-types';

export type Currency = 'coins' | 'keys';

/**
 * Exactly one of priceCoins/priceKeys is non-null per case (the contract in
 * 03 - Architecture - API Contracts.md) — this picks out the one that
 * matters instead of every caller re-deriving it.
 */
export function casePrice(caseDto: CaseDto): { amount: number; currency: Currency } {
  if (caseDto.priceKeys !== null) return { amount: caseDto.priceKeys, currency: 'keys' };
  return { amount: caseDto.priceCoins ?? 0, currency: 'coins' };
}

export function canAffordCase(caseDto: CaseDto, balance: Balance): boolean {
  const { amount, currency } = casePrice(caseDto);
  return balance[currency] >= amount;
}
