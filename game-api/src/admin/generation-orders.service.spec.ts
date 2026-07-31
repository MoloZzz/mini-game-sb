import 'reflect-metadata';
import { FindOperator } from 'typeorm';
import { CardEntity, GenerationOrderCandidateEntity, GenerationOrderEntity } from '../entities';
import { GenerationOrdersService } from './generation-orders.service';

const cardMapper = { toUrl: (path: string) => `https://static.test/${path}` };

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
    const service = new GenerationOrdersService(dataSource as never, { invalidate: jest.fn() } as never, cardMapper as never);
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

// --- In-memory harness -------------------------------------------------------
//
// The state machine is the part of this service worth testing and it is pure
// row bookkeeping, so it runs against three arrays rather than Postgres. The
// fake supports exactly the TypeORM surface the service uses; anything else
// throws rather than silently returning nothing.

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (expected instanceof FindOperator) {
      if (expected.type !== 'in') throw new Error(`Unsupported find operator: ${expected.type}`);
      return (expected.value as unknown[]).includes(row[key]);
    }
    return row[key] === expected;
  });
}

function sortRows(rows: Row[], order: Record<string, 'ASC' | 'DESC'> | undefined): Row[] {
  if (!order) return rows;
  const [key, direction] = Object.entries(order)[0]!;
  return [...rows].sort((a, b) => {
    const left = a[key] as number | string | Date;
    const right = b[key] as number | string | Date;
    const delta = left < right ? -1 : left > right ? 1 : 0;
    return direction === 'DESC' ? -delta : delta;
  });
}

class FakeStore {
  orders: Row[] = [];
  candidates: Row[] = [];
  cards: Row[] = [];
  private sequence = 0;

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  table(entity: unknown): Row[] {
    if (entity === GenerationOrderEntity) return this.orders;
    if (entity === GenerationOrderCandidateEntity) return this.candidates;
    if (entity === CardEntity) return this.cards;
    throw new Error('Unknown entity in fake store');
  }

  prefix(entity: unknown): string {
    if (entity === GenerationOrderEntity) return 'order';
    if (entity === GenerationOrderCandidateEntity) return 'candidate';
    return 'card';
  }
}

function buildManager(store: FakeStore) {
  function persist(entity: unknown, row: Row): Row {
    const table = store.table(entity);
    if (typeof row.id !== 'string') {
      row.id = store.nextId(store.prefix(entity));
      row.createdAt ??= new Date();
      table.push(row);
    } else if (!table.includes(row)) {
      const existing = table.find((candidate) => candidate.id === row.id);
      if (existing) Object.assign(existing, row);
      else table.push(row);
    }
    return row;
  }

  function entityOf(row: Row): unknown {
    if (store.orders.includes(row)) return GenerationOrderEntity;
    if (store.candidates.includes(row)) return GenerationOrderCandidateEntity;
    if (store.cards.includes(row)) return CardEntity;
    return null;
  }

  const manager = {
    create: (entity: unknown, data: Row): Row => ({ __entity: entity, ...data }) as Row,
    save: async (first: unknown, second?: unknown): Promise<unknown> => {
      const payload = (second ?? first) as Row | Row[];
      const explicit = second === undefined ? undefined : first;
      const rows = Array.isArray(payload) ? payload : [payload];
      const saved = rows.map((row) => {
        const entity = explicit ?? row.__entity ?? entityOf(row);
        if (!entity) throw new Error('Cannot infer entity for save');
        return persist(entity, row);
      });
      return Array.isArray(payload) ? saved : saved[0];
    },
    find: async (entity: unknown, options?: { where?: Row; order?: Record<string, 'ASC' | 'DESC'> }): Promise<Row[]> =>
      sortRows(store.table(entity).filter((row) => matches(row, options?.where)), options?.order),
    findOneBy: async (entity: unknown, where: Row): Promise<Row | null> =>
      store.table(entity).find((row) => matches(row, where)) ?? null,
    update: async (entity: unknown, criteria: Row | string, patch: Row): Promise<void> => {
      const where = typeof criteria === 'string' ? { id: criteria } : criteria;
      for (const row of store.table(entity)) if (matches(row, where)) Object.assign(row, patch);
    },
    delete: async (entity: unknown, where: Row): Promise<void> => {
      const table = store.table(entity);
      for (let index = table.length - 1; index >= 0; index -= 1) {
        if (matches(table[index]!, where)) table.splice(index, 1);
      }
    },
    getRepository: (entity: unknown) => ({
      createQueryBuilder: () => {
        let id: string | undefined;
        const builder = {
          setLock: () => builder,
          setOnLocked: () => builder,
          where: (_clause: string, params: Row) => {
            id = params.id as string;
            return builder;
          },
          orderBy: () => builder,
          addOrderBy: () => builder,
          getOne: async () => store.table(entity).find((row) => row.id === id) ?? null,
        };
        return builder;
      },
    }),
  };
  return manager;
}

function buildDataSource(store: FakeStore) {
  const manager = buildManager(store);
  return {
    manager,
    transaction: <T>(work: (tx: typeof manager) => Promise<T>) => work(manager),
    getRepository: (entity: unknown) => ({
      find: async (options?: { where?: Row }): Promise<Row[]> =>
        store.table(entity).filter((row) => matches(row, options?.where)),
      findOne: async (options: { where: Row; relations?: unknown }): Promise<Row | null> => {
        const row = store.table(entity).find((candidate) => matches(candidate, options.where));
        if (!row) return null;
        if (entity === GenerationOrderEntity) {
          row.candidates = store.candidates.filter((candidate) => candidate.orderId === row.id);
        }
        return row;
      },
      findAndCount: async (options: {
        where?: Row;
        order?: Record<string, 'ASC' | 'DESC'>;
        skip?: number;
        take?: number;
      }): Promise<[Row[], number]> => {
        const filtered = sortRows(
          store.table(entity).filter((row) => matches(row, options.where)),
          options.order,
        );
        for (const row of filtered) {
          row.candidates = store.candidates.filter((candidate) => candidate.orderId === row.id);
        }
        const skip = options.skip ?? 0;
        const take = options.take ?? filtered.length;
        return [filtered.slice(skip, skip + take), filtered.length];
      },
    }),
  };
}

function buildService() {
  const store = new FakeStore();
  const invalidate = jest.fn();
  const service = new GenerationOrdersService(
    buildDataSource(store) as never,
    { invalidate } as never,
    cardMapper as never,
  );
  return { service, store, invalidate };
}

/** Walks an order through claim + complete so it lands in `review` with real cards. */
async function seedReviewOrder(service: GenerationOrdersService, store: FakeStore) {
  const created = await service.create('admin-1', {
    title: 'Ember Drake', brief: 'a drake wreathed in embers', archetype: 'dragon',
    element: 'fire', suggestedRarity: 'legendary', candidateCount: 2,
  });
  await service.queue(created.id);
  const claimed = await service.claim(created.id);
  await service.complete(created.id, {
    runId: claimed.runId,
    candidates: claimed.candidates.map((candidate, index) => ({
      candidateId: candidate.id,
      imagePath: `cards/${candidate.slug}.png`,
      thumbPath: `thumbs/${candidate.slug}.webp`,
      genMeta: { seed: Number(candidate.seed), model: 'test', prompt: `p${index}` },
    })),
  });
  return { orderId: created.id, cards: store.cards };
}

describe('GenerationOrdersService state machine', () => {
  it('creates a draft with one candidate per requested slot and distinct seeds', async () => {
    const { service } = buildService();

    const order = await service.create('admin-1', {
      title: 'Ember Drake', brief: 'a drake wreathed in embers', archetype: 'dragon',
      element: 'fire', suggestedRarity: 'legendary', candidateCount: 3,
    });

    expect(order.status).toBe('draft');
    expect(order.candidates).toHaveLength(3);
    expect(new Set(order.candidates.map((candidate) => candidate.seed)).size).toBe(3);
    expect(order.candidates[0]!.slug).toMatch(/^ember-drake-[0-9a-f]{6}-1$/);
    expect(order.candidates[0]!.thumbUrl).toBeNull();
  });

  it('rejects a rarity the archetype is not allowed to occupy', async () => {
    const { service } = buildService();

    await expect(service.create('admin-1', {
      title: 'Ember Drake', brief: 'a drake wreathed in embers', archetype: 'dragon',
      element: 'fire', suggestedRarity: 'common',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to queue anything that is not a draft', async () => {
    const { service } = buildService();
    const order = await service.create('admin-1', {
      title: 'Slime', brief: 'a glistening slime', archetype: 'slime',
      element: null, suggestedRarity: 'common', candidateCount: 2,
    });
    await service.queue(order.id);

    await expect(service.queue(order.id)).rejects.toMatchObject({ status: 409 });
  });

  it('completes a claimed run into review with one draft card per candidate', async () => {
    const { service, store } = buildService();

    const { orderId } = await seedReviewOrder(service, store);

    const order = await service.get(orderId);
    expect(order.status).toBe('review');
    expect(store.cards).toHaveLength(2);
    expect(store.cards.every((card) => card.status === 'draft')).toBe(true);
    expect(order.candidates.every((candidate) => candidate.status === 'generated')).toBe(true);
    expect(order.candidates[0]!.thumbUrl).toMatch(/^https:\/\/static\.test\/thumbs\//);
    expect(store.cards[0]!.name).toBe('Ember Drake');
    expect(store.cards[0]!.genMeta).toMatchObject({
      generationOrder: { orderId, promptTemplateVersion: 'card-v1' },
    });
  });

  it('reports a second submission for an order already in review instead of ignoring it', async () => {
    const { service, store } = buildService();
    const { orderId } = await seedReviewOrder(service, store);
    const order = store.orders.find((row) => row.id === orderId)!;

    await expect(service.complete(orderId, { runId: order.runId as string, candidates: [] }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('rejects a candidate whose reported seed is not a number', async () => {
    const { service } = buildService();
    const created = await service.create('admin-1', {
      title: 'Slime', brief: 'a glistening slime', archetype: 'slime',
      element: null, suggestedRarity: 'common', candidateCount: 2,
    });
    await service.queue(created.id);
    const claimed = await service.claim(created.id);

    await expect(service.complete(created.id, {
      runId: claimed.runId,
      candidates: claimed.candidates.map((candidate) => ({
        candidateId: candidate.id,
        imagePath: `cards/${candidate.slug}.png`,
        thumbPath: `thumbs/${candidate.slug}.webp`,
        genMeta: { seed: 'not-a-number' },
      })),
    })).rejects.toMatchObject({ status: 400 });
  });

  it('approves the selected candidate and rejects its siblings', async () => {
    const { service, store } = buildService();
    const { orderId } = await seedReviewOrder(service, store);
    const review = await service.get(orderId);

    const completed = await service.select(orderId, {
      candidateId: review.candidates[0]!.id, name: 'Ember Drake', rarity: 'legendary',
    });

    expect(completed.status).toBe('completed');
    expect(completed.candidates.map((candidate) => candidate.status)).toEqual(['selected', 'discarded']);
    const cards = store.cards.map((card) => card.status);
    expect(cards.filter((status) => status === 'approved')).toHaveLength(1);
    expect(cards.filter((status) => status === 'rejected')).toHaveLength(1);
  });

  it('cancels from review and rejects every card the crop produced', async () => {
    const { service, store } = buildService();
    const { orderId } = await seedReviewOrder(service, store);

    const cancelled = await service.cancel(orderId);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.candidates.every((candidate) => candidate.status === 'discarded')).toBe(true);
    expect(store.cards.every((card) => card.status === 'rejected')).toBe(true);
  });

  it('regenerates a reviewed order into a fresh queued crop with new seeds', async () => {
    const { service, store } = buildService();
    const { orderId } = await seedReviewOrder(service, store);
    const before = await service.get(orderId);

    const after = await service.regenerate(orderId);

    expect(after.status).toBe('ready');
    expect(after.generatedAt).toBeNull();
    expect(after.candidates).toHaveLength(before.candidates.length);
    expect(after.candidates.map((candidate) => candidate.id))
      .not.toEqual(before.candidates.map((candidate) => candidate.id));
    expect(after.candidates.map((candidate) => candidate.seed))
      .not.toEqual(before.candidates.map((candidate) => candidate.seed));
    expect(after.candidates.every((candidate) => candidate.status === 'planned')).toBe(true);
    // The discarded crop's slugs must not be reused — `cards.slug` is UNIQUE.
    expect(after.candidates.map((candidate) => candidate.slug))
      .not.toEqual(before.candidates.map((candidate) => candidate.slug));
    expect(store.cards.every((card) => card.status === 'rejected')).toBe(true);
  });

  it('regenerates a failed order as well', async () => {
    const { service, store } = buildService();
    const created = await service.create('admin-1', {
      title: 'Slime', brief: 'a glistening slime', archetype: 'slime',
      element: null, suggestedRarity: 'common', candidateCount: 2,
    });
    await service.queue(created.id);
    const claimed = await service.claim(created.id);
    await service.fail(created.id, claimed.runId, 'FORGE_OOM', 'CUDA out of memory');

    const failed = await service.get(created.id);
    expect(failed.failureDetail).toBe('CUDA out of memory');

    const after = await service.regenerate(created.id);
    expect(after.status).toBe('ready');
    expect(after.failureCode).toBeNull();
    expect(after.failureDetail).toBeNull();
    expect(store.cards).toHaveLength(0);
  });

  it('refuses to regenerate an order that is still generating', async () => {
    const { service } = buildService();
    const created = await service.create('admin-1', {
      title: 'Slime', brief: 'a glistening slime', archetype: 'slime',
      element: null, suggestedRarity: 'common', candidateCount: 2,
    });
    await service.queue(created.id);
    await service.claim(created.id);

    await expect(service.regenerate(created.id)).rejects.toMatchObject({ status: 409 });
  });

  it('filters and paginates the list', async () => {
    const { service } = buildService();
    for (let index = 0; index < 3; index += 1) {
      const created = await service.create('admin-1', {
        title: `Slime ${index}`, brief: 'a glistening slime', archetype: 'slime',
        element: null, suggestedRarity: 'common', candidateCount: 2,
      });
      if (index === 0) await service.queue(created.id);
    }

    const ready = await service.list({ status: 'ready', page: 1, limit: 40 });
    expect(ready.total).toBe(1);
    expect(ready.items[0]!.title).toBe('Slime 0');

    const firstPage = await service.list({ page: 1, limit: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.limit).toBe(2);
  });
});
