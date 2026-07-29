import { Controller, Get } from '@nestjs/common';
import type { CollectionProgressDto } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { CollectionService } from './collection.service';

/**
 * Shares the `me` base path with `PlayersController` and
 * `InventoryController` — routes are disjoint (`collection`), so all three
 * coexist without collision.
 */
@Controller('me')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get('collection')
  async getCollection(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
  ): Promise<CollectionProgressDto> {
    return this.collectionService.getProgress(playerId);
  }
}
