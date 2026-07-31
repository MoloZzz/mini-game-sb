import { GENERATION_ORDER_STATUSES } from '@card-game/shared-types';
import type { GenerationOrderStatus } from '@card-game/shared-types';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

/**
 * `GET /admin/generation-orders` query. No default status — unlike the card
 * review queue, the orders screen is a dashboard: an operator needs to see a
 * failed order next to a queued one, and filters down only when they choose to.
 */
export class ListGenerationOrdersQueryDto extends PaginationQueryDto {
  @IsIn(GENERATION_ORDER_STATUSES)
  @IsOptional()
  status?: GenerationOrderStatus;
}
