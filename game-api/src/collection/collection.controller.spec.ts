import { Test, TestingModule } from '@nestjs/testing';
import type { CollectionProgressDto } from '@card-game/shared-types';
import type { CurrentPlayerPayload } from '../auth/types';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

describe('CollectionController', () => {
  let controller: CollectionController;
  let collectionService: { getProgress: jest.Mock };

  beforeEach(async () => {
    collectionService = { getProgress: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionController],
      providers: [{ provide: CollectionService, useValue: collectionService }],
    }).compile();

    controller = module.get<CollectionController>(CollectionController);
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
});
