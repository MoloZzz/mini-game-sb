import { Controller, Get, Query } from '@nestjs/common';
import type { CollectionCardsResponse, CollectionGoalDto, CollectionProgressDto } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { CollectionService } from './collection.service';
import { ListCollectionCardsQueryDto } from './dto/list-collection-cards.query';

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

  @Get('collection/goal')
  async getCollectionGoal(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
  ): Promise<CollectionGoalDto | null> {
    return this.collectionService.getGoal(playerId);
  }

  @Get('collection/cards')
  async getCollectionCards(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Query() query: ListCollectionCardsQueryDto,
  ): Promise<CollectionCardsResponse> {
    return this.collectionService.getCards(playerId, query);
  }
}
