import { Controller, Get } from '@nestjs/common';
import type { MilestonesResponseDto } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { MilestoneService } from './milestone.service';

/**
 * Shares the `me` base path with `PlayersController`/`InventoryController`/
 * `CollectionController` — routes are disjoint (`milestones`), so all four
 * coexist without collision. `GET` only: see `MilestoneService.getStatus`'s
 * doc comment for why this route must never award anything.
 */
@Controller('me')
export class MilestonesController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Get('milestones')
  async getMilestones(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
  ): Promise<MilestonesResponseDto> {
    return this.milestoneService.getStatus(playerId);
  }
}
