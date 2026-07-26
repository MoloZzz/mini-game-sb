import { ARCHETYPES, CARD_STATUSES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, CardStatus, Element, Rarity } from '@card-game/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListCardsQueryDto extends PaginationQueryDto {
  @IsIn(RARITIES)
  @IsOptional()
  rarity?: Rarity;

  @IsIn(ELEMENTS)
  @IsOptional()
  element?: Element;

  @IsIn(ARCHETYPES)
  @IsOptional()
  archetype?: Archetype;

  @IsIn(CARD_STATUSES)
  @IsOptional()
  status?: CardStatus;
}
