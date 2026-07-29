import { RARITIES } from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';

const SELL_BULK_MODES = ['all_duplicates', 'by_rarity'] as const;
type SellBulkMode = (typeof SELL_BULK_MODES)[number];

/**
 * Body for `POST /me/inventory/sell-bulk`. The shared-types `SellBulkRequest`
 * is a discriminated union, but two of its three variants share a `mode` key
 * and the third (`{ instanceIds }`) has none at all — there is no single
 * uniform discriminant to validate against the way `IngestRequestDto`
 * validates a uniform array, so this DTO cannot `implement SellBulkRequest`
 * directly. Every field is instead optional; the `@ValidateIf`s below
 * enforce which combination is actually required for a given `mode`, and
 * `InventoryService.sellBulk` narrows on `mode`/`instanceIds` the same way.
 */
export class SellBulkRequestDto {
  @IsIn(SELL_BULK_MODES)
  @IsOptional()
  mode?: SellBulkMode;

  @ValidateIf((o: SellBulkRequestDto) => o.mode === 'by_rarity')
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(RARITIES, { each: true })
  rarities?: Rarity[];

  // No `mode` at all is the third variant's own discriminant.
  @ValidateIf((o: SellBulkRequestDto) => o.mode === undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  instanceIds?: string[];
}
