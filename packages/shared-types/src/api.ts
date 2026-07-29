import type { AdminCardDto, Archetype, CardDto, CardStatus, Element, GenMeta } from './card.js';
import type { Balance, InventoryItemDto } from './player.js';
import type { Rarity } from './rarity.js';
import type { ReelTileDto } from './reel.js';

/**
 * HTTP contract between game-ui, game-api and card-forge.
 * Source: card-game-data/03 - Architecture - API Contracts.md
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// --- POST /cases/:slug/open — the heart of the game ---

export interface OpenCaseRequest {
  clientSeed?: string;
}

export interface OpenCaseResponse {
  dropId: string;
  /** Exactly REEL_LENGTH tiles; the winner sits at WINNING_INDEX. */
  reel: ReelTileDto[];
  winningIndex: number;
  wonCard: CardDto;
  isDuplicate: boolean;
  /** How many copies the player owns after this drop — drives the "×3" badge. */
  copies: number;
  balance: Balance;
}

// --- GET /cards ---

export interface ListCardsQuery {
  rarity?: Rarity;
  element?: Element;
  archetype?: Archetype;
  status?: CardStatus;
  page?: number;
  limit?: number;
}

export type ListCardsResponse = Paginated<CardDto>;

/** genMeta is present only when EXPOSE_GEN_META is on. */
export interface CardDetailResponse extends CardDto {
  genMeta?: GenMeta;
}

// --- Inventory ---

export interface ListInventoryQuery {
  rarity?: Rarity;
  element?: Element;
  sort?: 'rarity_desc' | 'rarity_asc' | 'acquired_desc' | 'name_asc';
  page?: number;
  limit?: number;
}

export interface SellCardResponse {
  gained: { coins: number };
  balance: Balance;
}

// --- POST /me/inventory/sell-bulk ---

/**
 * Server-side cap on the number of instances one bulk-sell request can
 * resolve to. A request over this is rejected outright (`BULK_SELL_CAP_EXCEEDED`)
 * rather than silently truncated, so the caller always knows exactly what
 * did and didn't sell.
 */
export const SELL_BULK_MAX_INSTANCES = 500;

/**
 * Two of the three variants share a `mode` discriminant; `instanceIds` has
 * none — the caller names instances directly instead of a selection rule.
 */
export type SellBulkRequest =
  | { mode: 'all_duplicates' }
  | { mode: 'by_rarity'; rarities: Rarity[] }
  | { instanceIds: string[] };

export interface SellBulkResponse {
  /** Always equals the number of new ledger rows this request wrote. */
  soldCount: number;
  gained: { coins: number };
  balance: Balance;
}

export interface ClaimDailyBonusResponse {
  gained: Balance;
  balance: Balance;
  nextAvailableAt: string;
}

// --- Admin / card-forge ingest ---

export interface IngestCardInput {
  slug: string;
  imagePath: string;
  thumbPath: string;
  suggestedRarity: Rarity;
  archetype: Archetype;
  element: Element | null;
  genMeta: GenMeta;
}

export interface IngestRequest {
  cards: IngestCardInput[];
}

export interface IngestResponse {
  inserted: number;
  skipped: number;
  skippedSlugs: string[];
}

export interface ReviewCardRequest {
  status?: CardStatus;
  name?: string;
  rarity?: Rarity;
  element?: Element | null;
  archetype?: Archetype;
  attack?: number;
  defense?: number;
  flavorText?: string | null;
}

export type AdminListCardsResponse = Paginated<AdminCardDto>;

// --- Errors ---

export const API_ERROR_CODES = [
  'INSUFFICIENT_FUNDS',
  'EMPTY_POOL',
  'CASE_NOT_FOUND',
  'CARD_NOT_FOUND',
  'INSTANCE_NOT_FOUND',
  'LAST_COPY',
  'BULK_SELL_CAP_EXCEEDED',
  'DAILY_BONUS_NOT_READY',
  'CASE_INACTIVE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  [key: string]: unknown;
}

/** 402 — includes what was needed vs. what the player had. */
export interface InsufficientFundsError extends ApiError {
  code: 'INSUFFICIENT_FUNDS';
  need: Partial<Balance>;
  have: Balance;
}

/**
 * 409 — no approved card was available to drop.
 *
 * Two genuinely distinct cases share this code: a single rarity's pool is
 * empty (`rarity` names it), or the whole approved pool is empty and no
 * rarity can be named (`rarity: null`).
 */
export interface EmptyPoolError extends ApiError {
  code: 'EMPTY_POOL';
  rarity: Rarity | null;
}

/** 409 — refuses to sell the player's last copy of a card. */
export interface LastCopyError extends ApiError {
  code: 'LAST_COPY';
  cardId: string;
}

/** 400 — a bulk-sell request resolved to more instances than `SELL_BULK_MAX_INSTANCES`. */
export interface BulkSellCapExceededError extends ApiError {
  code: 'BULK_SELL_CAP_EXCEEDED';
  requested: number;
  max: number;
}

export type { InventoryItemDto };
