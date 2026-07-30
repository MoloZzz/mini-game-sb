import 'reflect-metadata';
import { GenerationOrdersService } from './generation-orders.service';

describe('GenerationOrdersService.claimNext', () => {
  function setup(order: Record<string, unknown> | null) {
    const getOne = jest.fn().mockResolvedValue(order);
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(), setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(), getOne,
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) }),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([{ id: 'candidate-1', index: 1, slug: 'order-a-1', seed: '42' }]),
    };
    const dataSource = { transaction: (work: (tx: typeof manager) => unknown) => work(manager) };
    const service = new GenerationOrdersService(dataSource as never, { invalidate: jest.fn() } as never);
    return { service, manager, queryBuilder };
  }

  it('returns null when no ready work exists', async () => {
    const { service, manager } = setup(null);
    await expect(service.claimNext()).resolves.toBeNull();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('locks and leases the oldest ready order with skip-locked', async () => {
    const order = {
      id: 'order-a', status: 'ready', brief: 'a brief', archetype: 'slime', element: null,
      suggestedRarity: 'common', recipeProfile: 'card-v1', runId: null,
    };
    const { service, manager, queryBuilder } = setup(order);

    await expect(service.claimNext()).resolves.toEqual({
      id: 'order-a', runId: expect.any(String), brief: 'a brief', archetype: 'slime', element: null,
      suggestedRarity: 'common', recipeProfile: 'card-v1',
      candidates: [{ id: 'candidate-1', index: 1, slug: 'order-a-1', seed: '42' }],
    });

    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(queryBuilder.where).toHaveBeenCalledWith('order.status = :status', { status: 'ready' });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('order.ready_at', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('order.created_at', 'ASC');
    expect(order.status).toBe('generating');
    expect(manager.save).toHaveBeenCalledWith(order);
  });
});
