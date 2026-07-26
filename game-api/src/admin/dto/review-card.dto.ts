import { ARCHETYPES, CARD_STATUSES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type {
  Archetype,
  CardStatus,
  Element,
  Rarity,
  ReviewCardRequest,
} from '@card-game/shared-types';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Every field optional (this is a partial-update PATCH body). `@IsOptional()`
 * skips validation for both `undefined` (key absent) and explicit `null` —
 * the service layer is what distinguishes "absent, leave alone" from
 * "explicit null, clear the field" by checking own-property presence on the
 * parsed body, not by looking at these decorators.
 */
export class ReviewCardDto implements ReviewCardRequest {
  @IsIn(CARD_STATUSES)
  @IsOptional()
  status?: CardStatus;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsIn(RARITIES)
  @IsOptional()
  rarity?: Rarity;

  @IsIn(ELEMENTS)
  @IsOptional()
  element?: Element | null;

  @IsIn(ARCHETYPES)
  @IsOptional()
  archetype?: Archetype;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  attack?: number;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  defense?: number;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  flavorText?: string | null;
}
