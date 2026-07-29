import { Test, TestingModule } from '@nestjs/testing';
import type { CollectionCardsResponse, CollectionGoalDto, CollectionProgressDto } from '@card-game/shared-types';
import type { CurrentPlayerPayload } from '../auth/types';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { ListCollectionCardsQueryDto } from './dto/list-collection-cards.query';

describe('CollectionController', () => {
  let controller: CollectionController;
  let collectionService: { getProgress: jest.Mock; getGoal: jest.Mock; getCards: jest.Mock };

  beforeEach(async () => {
    collectionService = { getProgress: jest.fn(), getGoal: jest.fn(), getCards: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionController],
      providers: [{ provide: CollectionService, useValue: collectionService }],
    }).compile();

    controller = module.get<CollectionController>(CollectionController);
  });

  it('getCollectionGoal delegates to CollectionService with the current player id', async () => {
    const goal: CollectionGoalDto = {
      id: 'unique_10', kind: 'milestone', title: '10 unique cards', description: 'Collect 2 more unique cards to claim this milestone.',
      progress: { current: 8, target: 10 }, reward: { coins: 200, keys: 0 }, action: { label: 'Choose a case', href: '/' },
    };
    collectionService.getGoal.mockResolvedValue(goal);
    const currentPlayer: CurrentPlayerPayload = { id: 'player-1', role: 'player' };

    await expect(controller.getCollectionGoal(currentPlayer)).resolves.toBe(goal);
    expect(collectionService.getGoal).toHaveBeenCalledWith('player-1');
  });

  it('delegates to CollectionService with the id from @CurrentPlayer()', async () => {
    const progress: CollectionProgressDto = {
      owned: 3,
      total: 100,
      byRarity: {
        common: { owned: 1, total: 40 },
        uncommon: { owned: 1, total: 30 },
        rare: { owned: 1, total: 20 },
        epic: { owned: 0, total: 12 },
        legendary: { owned: 0, total: 6 },
        mythic: { owned: 0, total: 2 },
      },
    };
    collectionService.getProgress.mockResolvedValue(progress);

    const currentPlayer: CurrentPlayerPayload = { id: 'player-1', role: 'player' };
    const result = await controller.getCollection(currentPlayer);

    expect(collectionService.getProgress).toHaveBeenCalledWith('player-1');
    expect(result).toBe(progress);
  });

  it('getCollectionCards delegates to CollectionService.getCards with the player id and query', async () => {
    const page: CollectionCardsResponse = { items: [], total: 0, page: 1, limit: 40 };
    collectionService.getCards.mockResolvedValue(page);

    const currentPlayer: CurrentPlayerPayload = { id: 'player-1', role: 'player' };
    const query = new ListCollectionCardsQueryDto();
    query.rarity = 'mythic';
    const result = await controller.getCollectionCards(currentPlayer, query);

    expect(collectionService.getCards).toHaveBeenCalledWith('player-1', query);
    expect(result).toBe(page);
  });
});
