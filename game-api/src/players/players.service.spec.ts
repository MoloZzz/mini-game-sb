import 'reflect-metadata';
import type { Repository } from 'typeorm';
import { CaseOpeningEntity, PlayerCardEntity, PlayerEntity } from '../entities';
import { PlayersService } from './players.service';

describe('PlayersService.findByIdOrFail', () => {
  function makeService(playersRepository: Partial<Repository<PlayerEntity>>) {
    return new PlayersService(
      playersRepository as Repository<PlayerEntity>,
      {} as Repository<CaseOpeningEntity>,
      {} as Repository<PlayerCardEntity>,
    );
  }

  it('returns the player when the row exists', async () => {
    const player = { id: 'player-1', displayName: 'Test Player' } as PlayerEntity;
    const findOne = jest.fn().mockResolvedValue(player);
    const service = makeService({ findOne });

    const result = await service.findByIdOrFail('player-1');

    expect(result).toBe(player);
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'player-1' } });
  });

  it('throws a 401 UNAUTHORIZED when the row is gone (valid token, deleted player)', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const service = makeService({ findOne });

    await expect(service.findByIdOrFail('ghost-id')).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'UNAUTHORIZED' }),
    });
  });
});
