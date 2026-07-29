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

/**
 * One dex slot for `GET /me/collection/cards`. Masked server-side until
 * owned: a locked slot carries only `id`/`rarity` (enough to draw a
 * rarity-coloured "?" tile) and `card` is null — the API never ships the
 * art or name for a card the player hasn't pulled yet.
 */
export interface CollectionCardDto {
  id: string;
  rarity: Rarity;
  owned: boolean;
  card: CardDto | null;
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

/** `admin` is only ever assigned by the offline `account:bind` CLI — never via HTTP. */
export const PLAYER_ROLES = ['player', 'admin'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

/** Economy constants — source: 04 - Game Design - Core Loop.md */
export const INITIAL_GRANT: Balance = { coins: 1000, keys: 5 };
/**
 * Raised 500->800 coins, 1->2 keys (economy fix, part 1). Deliberately the
 * ONLY reward-VALUE change in this pass besides the milestone ladder itself:
 * `sellValue` and case prices (other than `stoneheart-coffer`, see its own
 * migration) are untouched, because raising `sellValue` would multiply a
 * near-zero EV at collection start and a near-full-price EV at collection
 * completion — a complete collection's Starter Chest EV is already 61
 * against a 100-coin price, so doubling `sellValue` would push it past 100
 * and make the case a money printer exactly when the player has the most to
 * sell.
 */
export const DAILY_BONUS: Balance = { coins: 800, keys: 2 };
export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
