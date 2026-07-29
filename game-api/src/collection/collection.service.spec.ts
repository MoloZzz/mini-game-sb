import type { DataSource } from 'typeorm';
import type { CardMapper } from '../cards/card.mapper';
import type { CardsService, FindCardsResult } from '../cards/cards.service';
import { CollectionService } from './collection.service';
import { PoolService } from './pool.service';

function buildService(overrides: {
  dataSource?: Partial<DataSource>;
  poolService?: Partial<PoolService>;
  cardsService?: Partial<CardsService>;
  cardMapper?: Partial<CardMapper>;
}) {
  const dataSource = (overrides.dataSource ?? { query: jest.fn().mockResolvedValue([]) }) as unknown as DataSource;
  const poolService = (overrides.poolService ?? {}) as unknown as PoolService;
  const cardsService = (overrides.cardsService ?? {}) as unknown as CardsService;
  const cardMapper = (overrides.cardMapper ?? {}) as unknown as CardMapper;
  return new CollectionService(dataSource, poolService, cardsService, cardMapper);
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
