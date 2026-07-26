import type { CardDto } from './card.js';
import type { Rarity } from './rarity.js';

export interface Balance {
  coins: number;
  keys: number;
}

export interface PlayerStats {
  casesOpened: number;
  uniqueCards: number;
  totalCards: number;
}

export interface PlayerDto {
  id: string;
  displayName: string;
  balance: Balance;
  stats: PlayerStats;
  /** Null when the daily bonus is available right now. */
  dailyBonusAvailableAt: string | null;
  pityCounter: number;
}

/** Inventory is grouped by card — 61 tiles with three identical ones reads worse. */
export interface InventoryItemDto {
  /** The instance offered for selling — the oldest unsold copy. */
  instanceId: string;
  card: CardDto;
  acquiredAt: string;
  copies: number;
}

export interface InventoryPageDto {
  items: InventoryItemDto[];
  total: number;
  page: number;
  limit: number;
}

export interface CollectionProgressDto {
  owned: number;
  total: number;
  byRarity: Record<Rarity, { owned: number; total: number }>;
}

export interface DropHistoryItemDto {
  dropId: string;
  caseSlug: string;
  caseName: string;
  card: CardDto;
  createdAt: string;
}

export const TRANSACTION_TYPES = [
  'case_open',
  'card_sell',
  'daily_bonus',
  'initial_grant',
  'milestone',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Economy constants — source: 04 - Game Design - Core Loop.md */
export const INITIAL_GRANT: Balance = { coins: 1000, keys: 5 };
export const DAILY_BONUS: Balance = { coins: 500, keys: 1 };
export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
