import { ARCHETYPES, CARD_STATUSES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, CardStatus, Element, Rarity } from '@card-game/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

/**
 * `GET /admin/cards` query. Unlike the player-facing `ListCardsQueryDto`
 * (which defaults to `approved`), the admin default is `draft` — this
 * endpoint IS the review queue. The default is applied in AdminService
 * (`query.status ?? 'draft'`), mirroring how CardsService applies its own
 * default, rather than baked into a field initializer here.
 */
export class AdminListCardsQueryDto extends PaginationQueryDto {
  @IsIn(CARD_STATUSES)
  @IsOptional()
  status?: CardStatus;

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
