import { ARCHETYPES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, Element, Rarity } from '@card-game/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

/**
 * Same filters as `ListCardsQueryDto` minus `status` — the dex is always the
 * approved pool; a player-facing route must never take a status override.
 */
export class ListCollectionCardsQueryDto extends PaginationQueryDto {
  @IsIn(RARITIES)
  @IsOptional()
  rarity?: Rarity;

  @IsIn(ELEMENTS)
  @IsOptional()
  element?: Element;

  @IsIn(ARCHETYPES)
  @IsOptional()
  archetype?: Archetype;
}
