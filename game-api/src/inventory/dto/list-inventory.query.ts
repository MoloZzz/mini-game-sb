import { ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Element, ListInventoryQuery, Rarity } from '@card-game/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

const INVENTORY_SORTS = ['rarity_desc', 'rarity_asc', 'acquired_desc', 'name_asc'] as const;
type InventorySort = (typeof INVENTORY_SORTS)[number];

export class ListInventoryQueryDto extends PaginationQueryDto implements ListInventoryQuery {
  @IsIn(RARITIES)
  @IsOptional()
  rarity?: Rarity;

  @IsIn(ELEMENTS)
  @IsOptional()
  element?: Element;

  @IsIn(INVENTORY_SORTS)
  @IsOptional()
  sort: InventorySort = 'rarity_desc';
}
