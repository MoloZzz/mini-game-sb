import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import type { DataSource, Repository } from 'typeorm';
import { PlayerEntity } from '../entities';
import { LedgerService } from '../ledger/ledger.service';
import { PlayersService } from '../players/players.service';
import { AuthService } from './auth.service';

describe('AuthService.register', () => {
  function makeManager() {
    return {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        if (!entity.id) {
          return { ...entity, id: 'player-1', createdAt: new Date() };
        }
        return entity;
      }),
    };
  }

  it('writes exactly one initial_grant ledger row and signs a token', async () => {
    const manager = makeManager();
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const recordTransaction = jest.fn().mockResolvedValue(undefined);
    const ledgerService = { recordTransaction } as unknown as LedgerService;

    const playersRepository = {} as Repository<PlayerEntity>;
    const playersService = {} as PlayersService;
    const jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
    } as unknown as JwtService;

    const authService = new AuthService(
      dataSource,
      playersRepository,
      ledgerService,
      playersService,
      jwtService,
    );

    const result = await authService.register({
      displayName: 'Test Player',
      email: 'Test@Example.com',
      password: 'password123',
    });

    expect(recordTransaction).toHaveBeenCalledTimes(1);
    expect(recordTransaction.mock.calls[0]?.[1]).toMatchObject({
      type: 'initial_grant',
      deltaCoins: 1000,
      deltaKeys: 5,
    });

    expect(result.token).toBe('signed-token');
    expect(result.player.balance).toEqual({ coins: 1000, keys: 5 });
    expect(result.player.displayName).toBe('Test Player');

    // Email is normalized to lowercase before it ever reaches the entity.
    expect(manager.create).toHaveBeenCalledWith(
      PlayerEntity,
      expect.objectContaining({ email: 'test@example.com', role: 'player' }),
    );
  });
});
