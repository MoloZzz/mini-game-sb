import type { DataSource } from 'typeorm';
import type { CardMapper } from '../cards/card.mapper';
import type { CardsService, FindCardsResult } from '../cards/cards.service';
import { CollectionService } from './collection.service';
import { PoolService } from './pool.service';
import type { MilestoneService } from '../milestones/milestone.service';

function buildService(overrides: {
  dataSource?: Partial<DataSource>;
  poolService?: Partial<PoolService>;
  cardsService?: Partial<CardsService>;
  cardMapper?: Partial<CardMapper>;
  milestoneService?: Partial<MilestoneService>;
}) {
  const dataSource = (overrides.dataSource ?? { query: jest.fn().mockResolvedValue([]) }) as unknown as DataSource;
  const poolService = (overrides.poolService ?? {}) as unknown as PoolService;
  const cardsService = (overrides.cardsService ?? {}) as unknown as CardsService;
  const cardMapper = (overrides.cardMapper ?? {}) as unknown as CardMapper;
  const milestoneService = (overrides.milestoneService ?? {}) as unknown as MilestoneService;
  return new CollectionService(dataSource, poolService, cardsService, cardMapper, milestoneService);
}

describe('CollectionService.getProgress', () => {
  it('combines owned (from the player_cards query) with total (from PoolService), defaulting missing rarities to 0', async () => {
    const query = jest.fn().mockResolvedValue([{ rarity: 'common', count: 2 }]);
    const poolService = {
      getApprovedCountsByRarity: jest.fn().mockResolvedValue({
        common: 40,
        uncommon: 30,
        rare: 20,
        epic: 12,
        legendary: 6,
        mythic: 2,
      }),
    };

    const service = buildService({ dataSource: { query }, poolService });

    const progress = await service.getProgress('player-1');

    expect(progress.byRarity.common).toEqual({ owned: 2, total: 40 });
    // A rarity the player owns zero of must still be 0, not undefined.
    expect(progress.byRarity.mythic).toEqual({ owned: 0, total: 2 });
    expect(progress.owned).toBe(2);
    expect(progress.total).toBe(40 + 30 + 20 + 12 + 6 + 2);
  });

  it('passes the player id into the owned-count query', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const poolService = {
      getApprovedCountsByRarity: jest.fn().mockResolvedValue({
        common: 0,
        uncommon: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
        mythic: 0,
      }),
    };

    const service = buildService({ dataSource: { query }, poolService });
    await service.getProgress('player-42');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['player-42']);
  });
});

describe('CollectionService.getGoal', () => {
  it('prioritizes an incomplete approved thematic set and links to its scoped case', async () => {
    const query = jest.fn().mockResolvedValue([{ owned: 3, total: 20 }]);
    const getStatus = jest.fn();
    const service = buildService({ dataSource: { query }, milestoneService: { getStatus } });

    await expect(service.getGoal('player-1')).resolves.toEqual(expect.objectContaining({
      id: 'ashen-wastes', kind: 'set', progress: { current: 3, target: 20 }, reward: null,
      action: { label: 'Open Cinderbound Cache', href: '/open/cinderbound-cache' },
    }));
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('maps the nearest unearned milestone into the source-neutral collection-goal contract', async () => {
    const query = jest.fn().mockResolvedValue([{ owned: 0, total: 0 }]);
    const getStatus = jest.fn().mockResolvedValue({
      ownedUniqueCards: 8,
      tiers: [
        { key: 'unique_10', uniqueCards: 10, reward: { coins: 200, keys: 0 }, earned: false, awardedAt: null },
      ],
    });
    const service = buildService({ dataSource: { query }, milestoneService: { getStatus } });

    await expect(service.getGoal('player-1')).resolves.toEqual({
      id: 'unique_10',
      kind: 'milestone',
      title: '10 unique cards',
      description: 'Collect 2 more unique cards to claim this milestone.',
      progress: { current: 8, target: 10 },
      reward: { coins: 200, keys: 0 },
      action: { label: 'Choose a case', href: '/' },
    });
    expect(getStatus).toHaveBeenCalledWith('player-1');
  });

  it('returns null after every milestone is earned', async () => {
    const service = buildService({
      dataSource: { query: jest.fn().mockResolvedValue([{ owned: 20, total: 20 }]) },
      milestoneService: { getStatus: jest.fn().mockResolvedValue({ ownedUniqueCards: 432, tiers: [{ earned: true }] }) },
    });

    await expect(service.getGoal('player-1')).resolves.toBeNull();
  });
});

describe('CollectionService.getCards', () => {
  it('masks an unowned card to {id, rarity, owned: false, card: null} and maps an owned one through CardMapper', async () => {
    const owned = { id: 'card-owned', rarity: 'rare' } as FindCardsResult['items'][number];
    const locked = { id: 'card-locked', rarity: 'epic' } as FindCardsResult['items'][number];

    const findMany = jest.fn().mockResolvedValue({ items: [owned, locked], total: 2 });
    const toCardDto = jest.fn().mockReturnValue({ id: 'card-owned', name: 'Storm Falcon' });
    // Only the owned card's id comes back from the ownership query.
    const query = jest.fn().mockResolvedValue([{ card_id: 'card-owned' }]);

    const service = buildService({
      dataSource: { query },
      cardsService: { findMany },
      cardMapper: { toCardDto },
    });

    const page = await service.getCards('player-1', {});

    expect(page.items).toEqual([
      { id: 'card-owned', rarity: 'rare', owned: true, card: { id: 'card-owned', name: 'Storm Falcon' } },
      { id: 'card-locked', rarity: 'epic', owned: false, card: null },
    ]);
    expect(toCardDto).toHaveBeenCalledTimes(1);
    expect(toCardDto).toHaveBeenCalledWith(owned);
  });

  it('always queries the approved pool regardless of a caller-supplied status', async () => {
    const findMany = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const service = buildService({ cardsService: { findMany } });

    await service.getCards('player-1', { rarity: 'mythic' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', rarity: 'mythic', page: 1, limit: 40 }),
    );
  });

  it('defaults page and limit on the response envelope', async () => {
    const findMany = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const service = buildService({ cardsService: { findMany } });

    const page = await service.getCards('player-1', {});

    expect(page.page).toBe(1);
    expect(page.limit).toBe(40);
  });

  it('skips the ownership query entirely when the page has no cards', async () => {
    const findMany = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const query = jest.fn();
    const service = buildService({ dataSource: { query }, cardsService: { findMany } });

    await service.getCards('player-1', {});

    expect(query).not.toHaveBeenCalled();
  });
});
